# 🪙 My Money Adventure

App educativa per la gestione della paghetta, pensata per bambini **dai 9 anni in su**.
Tre salvadanai — **SAVE**, **SPEND**, **GIVE** — e un principio unico:

> ### «TU DECIDI. NOI TI MOSTRIAMO COSA SUCCEDE.»

L'app non dice mai al bambino cosa fare. Gli mostra le conseguenze delle sue scelte
e lo lascia decidere.

---

## Che cosa c'è dentro

| | Funzione | Dove |
|---|---|---|
| 🫙 | Tre salvadanai con saldi reali e movimenti tracciati | `server/src/services/ledger.ts` |
| 🎚️ | Il bambino divide ogni entrata con gli slider (totale sempre 100%, GIVE mai sotto la soglia) | `server/src/domain/split.ts` |
| 🎯 | Obiettivi con foto, progresso, settimane mancanti e data prevista | `server/src/domain/goals.ts` |
| 🔮 | Simulatore delle scelte: due futuri a confronto, nessun blocco | `server/src/domain/simulator.ts` |
| 💰 | Menu GUADAGNA: lavoretti, richieste, approvazione del genitore | `server/src/services/jobs.ts` |
| 🌱 | Interesse educativo e interesse composto (100 → 105 → 110,25 → 115,76) | `server/src/domain/interest.ts` |
| ⭐ | XP e 5 livelli che premiano costanza e comprensione, non l'accumulo | `server/src/domain/xp.ts` |
| ❤️ | Obiettivi GIVE e donazioni (sempre confermate da un genitore) | `server/src/services/operations.ts` |
| 🎓 | 10 mini-lezioni da 2-3 minuti con quiz | `server/src/content/lessons.ts` |
| 🤖 | Money Coach: spiega, simula, non decide mai | `server/src/services/coach.ts` |
| 👨‍👩‍👧 | Dashboard genitore protetta da PIN | `web/src/screens/Genitore.tsx` |
| 📴 | Funziona offline e sincronizza senza perdere né duplicare transazioni | `server/src/routes/sync.ts`, `web/src/lib/api.ts` |

---

## Avvio rapido

Servono **Node 20+** e **PostgreSQL 14+**.

```bash
# 1. Dipendenze
npm install

# 2. Configurazione
cp .env.example server/.env      # e modifica DATABASE_URL se serve

# 3. Database: crea lo schema e il profilo demo di Sofia
npm run db:migrate
npm run db:seed

# 4. Avvia API (:4000) e app (:5173)
npm run dev
```

Apri **http://localhost:5173** e premi **«🦄 Prova la demo di Sofia»**.

Credenziali del profilo demo:

| | |
|---|---|
| Email | `famiglia.demo@mymoneyadventure.app` |
| Password | `paghetta2025` |
| PIN genitore | `1234` |

### Test

```bash
npm test              # tutto (90 test)
npm run test:server   # dominio + API su PostgreSQL reale (76 test)
npm run test:web      # logica e componenti del frontend (14 test)
```

I test del server girano su un database separato (`money_adventure_test`, si crea
da solo se esiste il ruolo). Cambialo con `TEST_DATABASE_URL`.

### Build di produzione

```bash
npm run build     # compila server (dist/) e web (web/dist/)
npm start         # avvia l'API compilata
```

---

## 📲 Metterla sull'iPhone («Aggiungi alla schermata Home»)

Su iPhone non esiste un pulsante «installa»: l'app si aggiunge dal menu **Condividi**
di Safari. L'app lo spiega da sola con un riquadro in fondo alla home, e le istruzioni
restano sempre nel **profilo** (tocca l'avatar in alto a sinistra).

### Opzione A — pubblicata online (link HTTPS, funziona ovunque)

Segui [`docs/DEPLOY.md`](docs/DEPLOY.md): con il file [`render.yaml`](render.yaml) già
pronto, Render crea database e app in pochi minuti e ti dà un indirizzo tipo
`https://money-adventure.onrender.com`. È l'unico modo per avere anche l'**avvio
completamente offline**, che richiede HTTPS.

### Opzione B — sulla rete di casa

#### 1. Avvia l'app in modo che il telefono la veda

```bash
npm run build
npm start
```

Il server API serve anche il frontend compilato: **un solo indirizzo, una sola porta**,
niente proxy. All'avvio stampa l'indirizzo da usare sul telefono:

```
🪙  My Money Adventure — http://localhost:4000
📱  Dal telefono (stessa Wi-Fi): http://192.168.1.42:4000
```

#### 2. Sull'iPhone

1. Collega il telefono alla **stessa rete Wi-Fi** del computer.
2. Apri **Safari** e vai all'indirizzo `http://192.168.1.42:4000` (il tuo).
3. Tocca **Condividi** (il quadrato con la freccia verso l'alto, in basso).
4. Scorri e tocca **Aggiungi alla schermata Home**.
5. Tocca **Aggiungi**.

Sulla home compare l'icona **Money Adventure**. Aperta da lì, l'app parte a tutto
schermo — senza barra degli indirizzi, con la sua schermata di avvio — e si comporta
come un'app installata.

### Cosa sapere

- **GitHub non basta.** Il link al repository mostra il codice, non esegue l'app:
  servono un server Node e un database PostgreSQL attivi. Per un link apribile da
  Safari usa l'opzione A.
- **Serve il PNG, non l'SVG.** Safari ignora le icone del manifest e le icone SVG per
  la schermata Home: l'icona vera è `web/public/apple-touch-icon.png` (180×180),
  dichiarata in `index.html`. Senza di essa iOS metterebbe sulla home una miniatura
  della pagina. Icone e schermate di avvio si rigenerano con
  `npm --workspace web run icone` (sorgente: `web/scripts/genera-icone.mjs`).
- **Memoria separata.** L'app aperta dall'icona ha uno spazio dati suo, distinto da
  Safari: la prima volta va rifatto l'accesso con la password di famiglia.
- **Offline.** La coda delle operazioni fatte senza rete funziona sempre. La cache dei
  file dell'app (il service worker) si attiva però solo in **contesto sicuro**: su
  `localhost` o in **HTTPS**. Su `http://192.168.…` l'app funziona normalmente, ma per
  l'avvio completamente offline va pubblicata dietro HTTPS.
- **Android e desktop.** Lì il browser offre l'installazione vera e propria: il riquadro
  mostra direttamente il pulsante «Installa l'app».

---

## Come funziona il denaro

**Nessun importo è mai un numero a virgola mobile.** Tutti i saldi sono interi in
**centesimi**: `BIGINT` sul database, `number` intero in TypeScript, formattazione
in euro solo al momento di mostrarli.

La divisione di un'entrata usa il **metodo del resto più grande**: se dividi 10,01 €
in 33/33/34 la somma delle tre parti è esattamente 10,01 €. Mai un centesimo perso,
mai uno creato dal nulla. È verificato su 1000 importi diversi nei test.

Ogni movimento passa da un unico punto (`postEntries`) che, dentro una transazione SQL:

1. blocca le righe dei salvadanai coinvolti (`SELECT … FOR UPDATE`);
2. rifiuta qualsiasi operazione che porterebbe un saldo sotto zero;
3. scrive la riga in `transactions` con **saldo prima** e **saldo dopo**;
4. aggiorna il saldo del salvadanaio.

L'endpoint `GET /api/children/:id/integrity` riconcilia saldi e somma dei movimenti:
deve sempre restituire `ok: true`.

---

## Il ciclo educativo

1. **Il genitore inserisce un'entrata.** Di default resta *in attesa*: i soldi non si
   muovono finché il bambino non decide.
2. **Il bambino sceglie la divisione** con tre slider. Il totale deve fare 100% e GIVE
   non scende sotto la regola di famiglia (predefinita: 10%). La scelta finisce nello storico.
3. **Le monete volano** nei tre salvadanai, l'obiettivo si aggiorna, arrivano gli XP.
4. **Prima di comprare**, il simulatore mostra i due futuri:

   ```
   Senza acquisto:  🚲 fra 6 settimane
   Con acquisto:    🚲 fra 8 settimane
   «Questo acquisto potrebbe spostare il tuo obiettivo di circa 2 settimane.»
   ```

   L'acquisto **non viene mai impedito**. Se paga da SPEND l'obiettivo non si muove:
   l'app mostra allora il *costo-opportunità* («se li mettessi in SAVE arriveresti
   1 settimana prima»). Se paga da SAVE, il ritardo è reale e si vede.
5. **Se vuole accelerare**, apre GUADAGNA, chiede un lavoretto, un genitore approva
   e i soldi entrano già divisi.

---

## Sicurezza e privacy

- **Nessun conto bancario, nessuna carta, nessun pagamento reale.** Il denaro è quello
  vero di casa: l'app lo rappresenta, non lo muove.
- Un solo **account familiare** (email + password). Il bambino usa l'app dentro quella
  sessione, senza credenziali proprie.
- La **modalità genitore** si apre solo con il **PIN** e produce un token separato che
  scade da solo (30 minuti). Con il token del bambino ogni rotta `/api/parent/*`
  risponde `403` — c'è un test apposito.
- Le **donazioni** escono dal salvadanaio GIVE solo tramite una rotta riservata al
  genitore: nessuna uscita di denaro senza conferma esplicita.
- Le risposte corrette dei quiz **non escono mai dal server** prima della consegna.
- Dati raccolti: nome, età facoltativa, avatar. Nient'altro.

---

## Offline-first

Il service worker mette in cache il guscio dell'app e le risposte `GET`.
Le scritture non vengono mai messe in cache: quando manca la rete finiscono in una
**coda locale** e lo stato viene aggiornato in modo ottimistico, così il bambino vede
subito l'effetto di quello che ha fatto.

Al ritorno della connessione la coda viene inviata a `POST /api/children/:id/sync`.
Ogni operazione porta un `clientId` univoco:

- se è nuova → **APPLICATA**;
- se il server l'aveva già ricevuta → **DUPLICATO** (nessuna transazione doppia);
- se non è più valida (per esempio fondi insufficienti) → **ERRORE**, e le altre
  operazioni della coda passano comunque.

L'idempotenza è garantita a livello di database da un indice univoco su
`(child_id, client_id)`, non solo dal codice applicativo.

---

## Money Coach

Il coach ha due strati:

1. **Motore deterministico** (sempre attivo): riconosce l'intenzione della domanda,
   fa i calcoli veri sui dati del bambino e costruisce la risposta con le opzioni A/B.
   **Tutti i numeri nascono qui.**
2. **Strato AI** (facoltativo, Claude): riformula la risposta con un linguaggio più
   naturale. Riceve i numeri già calcolati e ha il divieto esplicito di inventarne,
   di decidere al posto del bambino e di parlare di pagamenti reali.

Senza `ANTHROPIC_API_KEY` il coach funziona lo stesso: cambia solo il tono delle frasi.

---

## Struttura

```
server/
├── src/
│   ├── domain/        # regole pure e testabili: denaro, split, obiettivi,
│   │                  # simulatore, interesse, XP
│   ├── db/            # schema.sql, pool PostgreSQL, migrazione
│   ├── services/      # ledger, operazioni, lavori, donazioni, coach, stato
│   ├── routes/        # API bambino, genitore, autenticazione, sync
│   ├── content/       # le 10 lezioni con i quiz
│   └── seed/          # profilo demo di Sofia
└── tests/             # 37 test di dominio + 39 test API end-to-end

web/
├── public/            # manifest PWA, service worker, icone
└── src/
    ├── lib/           # client API con coda offline, formattazione, celebrazioni
    ├── state/         # stato globale
    ├── components/    # UI di base, slider SAVE/SPEND/GIVE, intestazione
    └── screens/       # casa, obiettivi, spendi, guadagna, dona, storico,
                       # impara, coach, genitore, onboarding
```

Documentazione tecnica estesa: [`docs/ARCHITETTURA.md`](docs/ARCHITETTURA.md).
Elenco completo delle API: [`docs/API.md`](docs/API.md).
Pubblicazione online: [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Dati demo

`npm run db:seed` crea la famiglia di **Sofia, 9 anni**, con obiettivo **🚲 Bicicletta
da 250 €**, i sei lavoretti del capitolato e **nove settimane di storia vera**:
paghette settimanali (una divisa 20/70/10, «la settimana in cui ha voluto spendere»),
tre lavoretti approvati, un regalo della nonna diviso 80/10/10, quattro spese, una
donazione di 9 € al rifugio degli animali e un accredito di interesse.

Il **saldo iniziale** del capitolato (SAVE 80 €, SPEND 20 €, GIVE 10 €) è registrato
come movimento di apertura nove settimane fa; i saldi che vedi oggi sono il risultato
di tutti i movimenti successivi — esattamente come succederebbe nella realtà.

Restano in sospeso, apposta, due cose da provare subito:
una **paghetta da dividere** e una **richiesta di lavoro da approvare**.

Per rigenerare tutto da zero: `npm run db:seed -- --reset`.
