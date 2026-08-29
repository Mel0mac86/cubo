# Pubblicare l'app su Render

Al termine avrai un indirizzo HTTPS tipo `https://money-adventure.onrender.com` da
aprire su Safari e aggiungere alla schermata Home dell'iPhone — da qualsiasi rete,
non solo dal Wi-Fi di casa.

Serve solo un account gratuito su [render.com](https://render.com) (si può creare
direttamente con GitHub).

---

## 1. Collega il repository

1. Vai su **https://dashboard.render.com/blueprints** e premi **New Blueprint Instance**.
2. La prima volta Render chiede di collegarsi a GitHub: autorizzalo e dai accesso al
   repository **`Mel0mac86/cubo`**.
3. Scegli il repository e, come **branch**, `claude/money-adventure-app-pvgu3r`
   (oppure `main`, se nel frattempo hai unito il lavoro lì).

Render legge il file [`render.yaml`](../render.yaml) e propone due risorse:

| Risorsa | Che cos'è |
|---|---|
| `money-adventure-db` | il database PostgreSQL |
| `money-adventure` | l'app (API + frontend sullo stesso indirizzo) |

## 2. Avvia il deploy

1. Dai un nome al gruppo (per esempio `money-adventure`) e premi **Apply**.
2. Render crea il database, poi compila l'app. Il primo deploy richiede **5-10 minuti**:
   installa le dipendenze, compila TypeScript e il frontend.
3. Quando il servizio diventa **Live**, in alto trovi l'indirizzo:
   `https://money-adventure.onrender.com` (il nome può cambiare se era già preso).

Non devi lanciare migrazioni a mano: lo schema del database viene creato e aggiornato
da solo a ogni avvio.

## 3. Apri l'app sull'iPhone

1. Apri l'indirizzo in **Safari**.
2. Crea la famiglia (email, password e PIN genitore), oppure premi
   **«Prova la demo di Sofia»** per guardarti intorno.
3. Tocca **Condividi** → **Aggiungi alla schermata Home** → **Aggiungi**.

Da qui in avanti l'app parte dall'icona, a tutto schermo. Essendo in HTTPS funziona
anche la cache offline completa: si apre **anche senza rete**, e le operazioni fatte
offline si sincronizzano da sole al ritorno della connessione.

---

## Money Coach con l'AI (facoltativo)

Senza chiave il Money Coach funziona lo stesso: fa tutti i calcoli e le simulazioni
con il motore deterministico. Per far riformulare le risposte da Claude:

1. Dashboard di Render → servizio **money-adventure** → **Environment**.
2. Alla voce `ANTHROPIC_API_KEY` incolla la tua chiave da
   [console.anthropic.com](https://console.anthropic.com).
3. **Save, rebuild and deploy**.

La chiave resta solo su Render: `render.yaml` la dichiara con `sync: false`, quindi non
finisce mai nel repository.

---

## Cose da sapere sul piano gratuito

- **L'app si addormenta** dopo circa 15 minuti senza visite: la prima apertura dopo una
  pausa richiede ~50 secondi. Le successive sono immediate. Il piano a pagamento più
  basso (7 $/mese) toglie l'attesa.
- **Il database gratuito di Render scade dopo 30 giorni.** Prima della scadenza Render
  avvisa via email: a quel punto vanno esportati i dati e ricreato il database, oppure
  si passa al piano a pagamento. Se l'app deve durare nel tempo, metti in conto il
  database a pagamento (attualmente 6 $/mese).
- **Backup**: dalla pagina del database, `pg_dump` con la *External Connection String*.

## Aggiornamenti

`autoDeploy` è attivo: ogni push sul branch collegato fa ripartire il deploy da solo.
Sull'iPhone la nuova versione arriva alla riapertura successiva dell'app.

---

## Alternative

- **Prova veloce senza registrarti**: `npm run build && npm start` sul computer e un
  tunnel (`cloudflared tunnel --url http://localhost:4000`) ti dà un indirizzo HTTPS
  temporaneo, valido finché il computer resta acceso.
- **Solo rete di casa**: `npm start` e apri `http://<ip-del-computer>:4000` dall'iPhone
  sulla stessa Wi-Fi (vedi il README). Si aggiunge comunque alla schermata Home, ma
  senza HTTPS la cache offline dei file non si attiva.
- **Altri host**: la stessa configurazione funziona ovunque ci siano Node 20+ e
  PostgreSQL. Servono `DATABASE_URL` e `JWT_SECRET`, build `npm run build`, avvio
  `npm start`. Il server rileva da solo se serve TLS verso il database.
