# API

Base: `/api`. Tutte le risposte sono JSON. Gli importi sono **interi in centesimi**.

Errori:

```json
{ "error": { "code": "FONDI_INSUFFICIENTI", "message": "Nel salvadanaio SPEND ci sono € 3,50, ma ne servono € 8,00.", "details": {} } }
```

I messaggi sono in italiano e scritti per essere mostrati direttamente al bambino.

## Autenticazione

| Metodo | Percorso | Descrizione |
|---|---|---|
| POST | `/auth/register` | Crea famiglia, genitore e (facoltativo) primo bambino |
| POST | `/auth/login` | Accesso con email e password di famiglia |
| POST | `/auth/demo` | Entra nel profilo dimostrativo di Sofia |
| POST | `/auth/parent-mode` | Sblocca la modalità genitore con il PIN → `parentToken` |
| GET | `/auth/me` | Famiglia e bambini della sessione |

Header: `Authorization: Bearer <token>`. Per le rotte `/parent/*` va usato il
`parentToken`, non il token di famiglia.

## Modalità bambino — `/children/:childId`

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET | `/state` | **Stato completo**: saldi, obiettivi, storico, lavori, lezioni, notifiche, interesse |
| POST | `/onboarding` | Nome, avatar, primo obiettivo, divisione iniziale |
| PATCH | `/profile` | Avatar, nome, età |
| POST | `/split/preview` | Normalizza gli slider e mostra gli importi risultanti |
| GET | `/pending-incomes` | Entrate in attesa di divisione |
| POST | `/pending-incomes/:id/allocate` | Il bambino conferma la sua divisione |
| POST | `/simulate` | **Simulatore**: obiettivo con e senza l'acquisto |
| POST | `/purchases` | Registra una spesa (da SPEND o da SAVE) |
| GET | `/history?filter=&limit=&offset=` | Storico filtrabile |
| GET/POST | `/goals` | Elenco / creazione obiettivi |
| PATCH/DELETE | `/goals/:id` | Modifica / archivia |
| POST | `/goals/:id/primary` | Rende principale |
| POST | `/goals/:id/complete` | «L'ho comprato!» — preleva da SAVE e chiude l'obiettivo |
| GET | `/jobs`, `/job-requests` | Lavoretti disponibili e proprie richieste |
| POST | `/jobs/:id/request` | «RICHIEDI LAVORO» → in attesa di approvazione |
| GET/POST | `/donation-goals` | Obiettivi GIVE |
| PATCH | `/donation-goals/:id` | Modifica |
| GET | `/lessons`, `/lessons/:id` | Lezioni (le risposte corrette restano sul server) |
| POST | `/lessons/:id/quiz` | Consegna il quiz e riceve correzione + XP |
| GET/POST | `/coach` | Conversazione con il Money Coach |
| GET | `/notifications`, POST `/notifications/read` | Notifiche educative |
| GET | `/integrity` | Riconciliazione contabile (`{ ok: true }`) |
| POST | `/sync` | Coda di operazioni fatte offline |

### `POST /simulate`

```jsonc
// richiesta
{ "amountCents": 800, "jar": "SPEND", "label": "uno slime" }

// risposta (estratto)
{
  "affordable": true,
  "goalName": "Bicicletta",
  "senzaAcquisto": { "weeksRemaining": 6, "projectedDate": "2026-04-11", "percent": 76 },
  "conAcquisto":   { "weeksRemaining": 6, "projectedDate": "2026-04-11", "percent": 76 },
  "deltaWeeks": 0,
  "opportunitaWeeks": 1,
  "impact": "COSTO_OPPORTUNITA",
  "message": "…",
  "tips": ["…"]
}
```

`impact` vale `RITARDO` (spesa da SAVE che allontana l'obiettivo),
`COSTO_OPPORTUNITA` (spesa da SPEND: l'obiettivo non si muove, ma si mostra cosa
sarebbe successo risparmiando), `NESSUN_IMPATTO` o `NESSUN_OBIETTIVO`.

### `POST /sync`

```jsonc
{
  "operations": [
    { "kind": "PURCHASE", "clientId": "…", "occurredAt": "2026-03-01T10:00:00Z",
      "payload": { "amountCents": 300, "description": "Gelato", "jar": "SPEND", "emoji": "🍦" } },
    { "kind": "ALLOCATE", "clientId": "…", "occurredAt": "…",
      "payload": { "pendingIncomeId": "…", "split": { "save": 60, "spend": 30, "give": 10 } } }
  ]
}
```

Risposta: `{ "results": [{ "clientId": "…", "status": "APPLICATA" | "DUPLICATO" | "ERRORE" }], "state": { … } }`.
Tipi supportati: `PURCHASE`, `ALLOCATE`, `JOB_REQUEST`, `QUIZ`.

## Modalità genitore — `/parent` (richiede `parentToken`)

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET/POST | `/children` | Elenco / aggiunta di un bambino |
| POST | `/children/:id/income` | Nuova entrata. `mode: "ASK_CHILD"` (predefinito) o `"AUTO"` |
| GET/DELETE | `/children/:id/pending-incomes[/:pendingId]` | Entrate in attesa |
| POST | `/children/:id/transfer` | Giroconto fra salvadanai (correzioni) |
| POST | `/children/:id/interest` | Accredita l'interesse del mese (una volta sola) |
| GET | `/children/:id/interest/projection?months=12` | Proiezione composta e confronto con l'interesse semplice |
| PATCH | `/children/:id/settings` | Regola GIVE, divisione abituale, paghetta, interesse, blocchi, suoni |
| POST | `/children/:id/donations` | Conferma una donazione dal salvadanaio GIVE |
| GET/POST | `/jobs`, PATCH `/jobs/:id` | Gestione dei lavoretti |
| GET | `/job-requests?status=PENDING` | Richieste da approvare |
| POST | `/job-requests/:id/approve` | Approva (`approvedRewardCents` per modificare l'importo) |
| POST | `/job-requests/:id/reject` | Rifiuta con messaggio |
| GET | `/children/:id/dashboard` | Stato + statistiche + verifica contabile |

## Pubbliche

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET | `/health` | Stato del servizio |
| GET | `/content` | Livelli, elenco lezioni, cause di beneficenza |
