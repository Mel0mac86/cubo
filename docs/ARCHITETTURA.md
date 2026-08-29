# Architettura

## Scelte di fondo

| Ambito | Scelta | Perché |
|---|---|---|
| Frontend | React 19 + Vite, PWA installabile | Mobile-first, offline, installabile senza store |
| Backend | Node 22 + Express 5 + TypeScript | API piccole e leggibili |
| Database | PostgreSQL 14+ | Vincoli veri (CHECK, UNIQUE) a difesa dei soldi |
| Denaro | Interi in centesimi (`BIGINT`) | Nessun errore di virgola mobile |
| Autenticazione | Account familiare (JWT) + PIN genitore (JWT separato, breve) | Il bambino usa l'app, il genitore autorizza |
| AI | Claude (facoltativa) sopra un motore deterministico | L'app funziona identica anche senza AI |

## Strati

```
      ┌──────────────────────── PWA (React) ────────────────────────┐
      │  schermate  →  stato globale  →  client API + coda offline  │
      └───────────────────────────────┬─────────────────────────────┘
                                      │ HTTPS / JSON
      ┌───────────────────────────────▼─────────────────────────────┐
      │ routes/     auth · child · parent · sync                     │
      │ services/   ledger · operations · jobs · donations · lessons │
      │             coach · gamification · state                     │
      │ domain/     money · split · goals · simulator · interest · xp│  ← puro, testabile
      │ db/         pool · schema.sql · migrate                      │
      └───────────────────────────────┬─────────────────────────────┘
                                      ▼
                                 PostgreSQL
```

`domain/` non conosce il database né HTTP: sono funzioni pure. È lì che vivono le
regole che contano (ripartizione, previsioni, interesse, livelli) ed è il motivo per
cui si possono testare a fondo e velocemente.

## Modello dati

```
families ─┬─ users ─┬─ parents (pin_hash)
          │         └─ children ─┬─ settings        (regola GIVE, split, interesse, blocchi)
          │                      ├─ jars            (SAVE / SPEND / GIVE, saldo in centesimi)
          │                      ├─ goals           (obiettivi, uno principale alla volta)
          │                      ├─ transactions    (ogni movimento, saldo prima e dopo)
          │                      ├─ allocation_choices  (le divisioni scelte dal bambino)
          │                      ├─ pending_incomes (entrate in attesa di divisione)
          │                      ├─ donation_goals ─ donations
          │                      ├─ interest_accruals   (unico per mese)
          │                      ├─ xp_events · achievements
          │                      ├─ lesson_progress · quiz_attempts
          │                      ├─ notifications
          │                      └─ coach_messages
          └─ jobs ─ job_requests
levels · lessons        (contenuti di riferimento, caricati dalla migrazione)
```

### Vincoli che proteggono i soldi

Non sono controlli solo applicativi: sono nel database.

```sql
balance_cents  BIGINT NOT NULL CHECK (balance_cents >= 0)

CONSTRAINT saldo_coerente
  CHECK (balance_after_cents = balance_before_cents + amount_cents)

CONSTRAINT split_predefinito_somma_100
  CHECK (default_save_percent + default_spend_percent + default_give_percent = 100)

CONSTRAINT give_predefinito_non_sotto_minimo
  CHECK (default_give_percent >= min_give_percent)

-- una sola richiesta in attesa per lo stesso lavoro
CREATE UNIQUE INDEX uq_jobreq_pending ON job_requests(job_id, child_id) WHERE status = 'PENDING';

-- idempotenza delle operazioni offline
CREATE UNIQUE INDEX uq_tx_client_id ON transactions(child_id, client_id) WHERE client_id IS NOT NULL;

-- mai due accrediti di interesse nello stesso mese
UNIQUE (child_id, period_key)
```

## I nomi dei salvadanai

`SAVE` / `SPEND` / `GIVE` sono gli identificatori interni: enum del database,
valori delle API, tipi TypeScript. Quello che l'utente legge — **RISPARMIO**,
**SPENDO**, **DONO** — vive in `NOMI_JAR` (`domain/etichette.ts`), importato sia
dal server sia dall'app. Un rename futuro tocca quel solo file e non i dati.

## Il ledger

Unico punto in cui il denaro si muove (`services/ledger.ts`, funzione `postEntries`).
Gira sempre dentro `withTransaction`:

1. se l'operazione porta un `clientId` già visto, restituisce le transazioni esistenti
   (idempotenza) senza toccare nulla;
2. blocca i salvadanai coinvolti in **ordine alfabetico** con `SELECT … FOR UPDATE`
   (ordine stabile ⇒ niente deadlock fra richieste concorrenti);
3. per ogni riga calcola saldo prima/dopo, rifiuta i saldi negativi
   (`FondiInsufficientiError`, HTTP 400 con messaggio comprensibile);
4. scrive in `transactions` e aggiorna `jars`.

Le operazioni composte (dividere una paghetta = 3 righe) condividono un `group_id`,
così lo storico può ricostruire la scelta.

## Progresso di un obiettivo

Il progresso **non** è il saldo di SAVE: è la somma dei movimenti SAVE attribuiti a
quell'obiettivo (`transactions.goal_id`) più quanto il bambino aveva già da parte
alla creazione. Così gli obiettivi completati conservano la loro storia e il nuovo
obiettivo riparte da zero anche se in SAVE è rimasto del denaro.

### Ritmo di risparmio e previsione

`estimateWeeklySavingRate` guarda le entrate in SAVE delle ultime 8 settimane:

- **≥ 2 entrate** → media reale sul periodo effettivamente coperto (denominatore
  minimo una settimana, per non gonfiare il ritmo con entrate ravvicinate);
- **< 2 entrate** → si usa la paghetta ricorrente configurata dal genitore;
- **nessuna delle due** → l'app dice onestamente «non lo so ancora» invece di
  inventare una data.

Settimane mancanti = `ceil(mancante / ritmo settimanale)`.

## Interesse

La regola si spiega al bambino come «5 centesimi per ogni euro che resta in SAVE»;
tecnicamente è il 5% del saldo con arrotondamento half-up. Su saldi in euro tondi i
due modi coincidono, e la crescita composta segue la progressione attesa:

```
100,00 € → 105,00 € → 110,25 € → 115,76 € → 121,55 €
```

`interest_accruals` ha un vincolo `UNIQUE (child_id, period_key)`: l'interesse di un
mese non può essere accreditato due volte, nemmeno per un doppio clic.

## Sincronizzazione offline

```
 telefono                                   server
 ────────                                   ──────
 azione senza rete
   │
   ├─ coda locale (localStorage) + aggiornamento ottimistico dello stato
   │
 torna la rete
   │
   └─ POST /children/:id/sync  { operations: [...] } ──►  applica in ordine cronologico
                                                          ogni operazione in una sua
                                                          transazione SQL
        ◄── { results: [APPLICATA | DUPLICATO | ERRORE], state }
   │
   └─ rimuove dalla coda tutto ciò che non è ERRORE, sostituisce lo stato
```

Un'operazione non valida (per esempio una spesa che nel frattempo non è più
copribile) viene segnalata al client **senza bloccare le altre**.

## Installazione sul telefono (PWA)

Il manifest dichiara `display: standalone`, icone PNG a 192/512 px e una icona
`maskable` per Android. iOS però non legge il manifest per la schermata Home: usa
`apple-touch-icon` (PNG 180×180), `apple-mobile-web-app-capable`,
`apple-mobile-web-app-title` e le `apple-touch-startup-image` con media query per
device — tutto in `web/index.html`, generato da `web/scripts/genera-icone.mjs`.

Non esistendo `beforeinstallprompt` su iOS, `web/src/components/Installa.tsx` mostra i
passaggi del menu Condividi; su Android/desktop intercetta invece il prompt nativo.
Il rilevamento di app già installata usa `display-mode: standalone` **e**
`navigator.standalone` (l'unico segnale disponibile su iOS).

In produzione l'API serve anche `web/dist`: un solo origin, così l'app è raggiungibile
dal telefono sulla rete locale senza CORS né proxy, e le rotte della SPA rispondono
con `index.html` mentre `/api/*` continua a restituire i suoi 404 in JSON.

## Modalità genitore

```
login famiglia          →  token "family"  (30 giorni)  → l'app del bambino
PIN corretto            →  token "parent"  (30 minuti)  → /api/parent/*
```

`requireParent` verifica `scope === 'parent'`. Il token del bambino non lo ottiene mai:
la dashboard genitore, l'approvazione dei lavori, le donazioni e il cambio delle regole
sono irraggiungibili senza PIN. Il token genitore vive solo in memoria (non in
`localStorage`) e scade da solo.

## Sistema XP

Gli XP premiano il comportamento, non il patrimonio:

| Azione | XP |
|---|---|
| Completare una lezione | 25 |
| Risposta corretta al quiz (solo se migliora il punteggio) | 10 |
| Fare una donazione | 30 |
| Completare un lavoro | 25 |
| Registrare una spesa | 5 |
| Usare il simulatore prima di comprare | 8 |
| Scegliere la divisione di un'entrata | 10 |
| Risparmiare | 1 per euro, **massimo 20** per entrata |
| 4+ settimane consecutive di risparmio | 40 |
| Raggiungere un obiettivo | 100 |

Il tetto sul risparmio è deliberato: chi riceve una paghetta grande non deve salire di
livello più in fretta di chi ragiona bene con poco. Rifare lo stesso quiz non produce
XP aggiuntivi.

## Estensioni previste

Lo schema è già pronto per: più bambini nella stessa famiglia (`children.family_id`),
profili fratelli, statistiche avanzate (`xp_events`, `allocation_choices`), contenuti
educativi aggiuntivi (tabella `lessons`), app native (le API sono già separate dal
frontend) e un piano Premium (basta una tabella `subscriptions` legata a `families`).
