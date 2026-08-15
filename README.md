# 🧩 Rubik Hero

App mobile che insegna a un bambino dai 9 anni in su a risolvere il Cubo di Rubik 3×3,
passo dopo passo, con immagini, animazioni, voce e ricompense.

Il bambino non deve sapere niente di notazione, nomi delle facce o algoritmi:
inserisce i colori (o li fa leggere alla fotocamera), segue le frecce, fa le mosse,
risolve il cubo e — se vuole — impara a farlo da solo.

Dietro le quinte c'è un vero motore matematico: solver di Kociemba, validatore
completo dello stato e riconoscimento dei colori con visione artificiale.

---

## Indice

- [Com'è fatta](#comè-fatta)
- [Il motore matematico](#il-motore-matematico)
- [La scansione con la fotocamera](#la-scansione-con-la-fotocamera)
- [Il linguaggio per bambini](#il-linguaggio-per-bambini)
- [Privacy e sicurezza](#privacy-e-sicurezza)
- [Gemini](#gemini)
- [Installarla su iPhone (PWA)](#installarla-su-iphone-pwa)
- [Come si avvia](#come-si-avvia)
- [Test](#test)
- [Cosa è stato verificato e cosa no](#cosa-è-stato-verificato-e-cosa-no)

---

## Com'è fatta

**Frontend:** React Native + Expo (TypeScript), iOS e Android.
Il 3D è three.js su `expo-gl`, la voce è la sintesi vocale del telefono
(`expo-speech`, italiano), i progressi stanno in `AsyncStorage`.

> Nota: la richiesta menzionava «Flutter oppure React Native». È stato scelto
> React Native perché permette di tenere il motore matematico in TypeScript
> puro, e quindi di verificarlo con test veri (vedi [Test](#test)).

Il codice è diviso in due mondi che non si mescolano mai:

```
src/core/     ← matematica e logica pura. Nessun import di React o di Expo.
              Tutto qui è verificabile con i test in Node.
src/ui/       ← schermate e componenti React Native.
src/services/ ← i due punti che toccano il mondo esterno (fotocamera, rete).
```

```
src/core/
  cube/       stato del cubo, mosse, notazione, validatore, geometria 3D
  solver/     Kociemba (coordinate, tabelle, ricerca) e solver a strati
  kids/       traduzione in italiano semplice, livelli, badge, mini giochi
  vision/     colori, qualità dell'immagine, griglia, regia della scansione
```

Questa separazione non è estetica: è quello che rende possibile provare il
solver su 5000 cubi e il riconoscimento colori su immagini sintetiche senza mai
accendere un telefono.

### Il flusso principale

```
🚀 INIZIAMO
   ↓
🎨 Che colori ha il tuo cubo?
   ↓
📷 scansione guidata          oppure     ✏️ scelgo io i colori (1/6 … 6/6)
   ↓                                        ↓
👀 anteprima e correzione  ←───────────────┘
   ↓
🔍 controllo (8 verifiche)
   ↓                    ↘
✅ cubo valido            🤔 qualcosa non torna → quadratini evidenziati → correggi
   ↓
🧠 cerco la soluzione
   ↓
🧩 PASSO 1 → freccia → animazione → «Hai fatto la mossa?» → ✅ / 🔄 / 🆘
   ↓
🏆 cubo risolto → ⭐ ricompensa → 🎓 «Vuoi imparare a farlo da solo?»
```

---

## Il motore matematico

Ci sono **due solver**, e la scelta fra i due non è un dettaglio.

### Solver a strati (quello che usa il bambino)

Kociemba trova la soluzione più corta, ma le sue mosse sono impossibili da
spiegare: non c'è un «perché» che un bambino di nove anni possa vedere.
Il solver a strati fa più mosse (~112 in media) ma ogni fase ha un obiettivo
che si guarda a occhio nudo, e le sue sette fasi **sono** i livelli della
modalità «Impara»:

| Fase                | Cosa vede il bambino            | Livello |
|---------------------|---------------------------------|---------|
| `cross`             | La croce sulla faccia di sotto  | 2       |
| `firstLayer`        | Il primo piano completo         | 3       |
| `secondLayer`       | La fascia di mezzo              | 4       |
| `topCross`          | La croce in cima                | 5       |
| `topCorners`        | Il tetto tutto dello stesso colore | 5    |
| `cornerPlaces`      | Angolini nella casa giusta      | 5       |
| `edgePlaces`        | Ultimi pezzi: finito!           | 5       |

L'implementazione (`src/core/solver/beginner.ts`) non è una lunga sequenza di
`if` sui casi possibili. Ogni fase è una **ricerca a obiettivo**: si dà al
motore un insieme di mosse permesse (mosse singole, oppure interi algoritmi noti
come `R U R' U'`) e un obiettivo che include sempre *«senza rovinare quello che è
già a posto»*. Il vantaggio è la correttezza per costruzione: se la ricerca
restituisce qualcosa, quel qualcosa soddisfa l'obiettivo; se non lo trova, se ne
accorge subito invece di produrre una soluzione sbagliata.

**Misurato su 5000 cubi casuali:** 5000 risolti, 0 fallimenti, 112 mosse in
media (peggiore 166), 11 ms per cubo (peggiore 31 ms).

### Kociemba two-phase (modalità esperto)

Implementazione completa in `src/core/solver/`: coordinate (twist, flip, slice,
permutazioni), tabelle di transizione, tabelle di potatura costruite con una BFS
all'indietro, e ricerca IDA* a due fasi.

**Misurato su 100 cubi casuali:** 21,2 mosse in media, peggiore 22, ~150 ms per
cubo dopo la costruzione delle tabelle (~3,5 s una volta sola, ~4 MB di memoria).
Risolve anche il superflip. Le tabelle si costruiscono in modo pigro, solo se
qualcuno sceglie la modalità esperto: la modalità bambino parte istantanea.

Il compromesso lunghezza/tempo è regolabile (`targetLength`); i numeri misurati:

| `targetLength` | mosse medie | tempo medio | tempo peggiore |
|---------------:|------------:|------------:|---------------:|
| 23             | 21,7        | 72 ms       | 276 ms         |
| **22** (default) | **21,1**  | **141 ms**  | **1,2 s**      |
| 21             | 20,7        | 230 ms      | 1,7 s          |
| 20             | 19,9        | 3,2 s       | 8,0 s          |

### Il validatore

Gli otto controlli richiesti, in `src/core/cube/validator.ts`: 54 quadratini,
9 per colore, 6 centri coerenti, angoli e spigoli esistenti e non ripetuti,
orientamento, permutazione, risolvibilità.

La parte che conta è **cosa succede quando fallisce**. Il validatore non
restituisce mai un messaggio tecnico: restituisce i quadratini sospetti (per
evidenziarli), la faccia più probabilmente sbagliata (per «riscansiona questa
faccia») e, quando può dedurlo, il colore che quel quadratino dovrebbe avere.

```
❌  "Invalid cubie permutation"
✅  "Sembra che due quadratini si siano scambiati di posto:
     così il cubo non potrebbe esistere davvero."
     + i quadratini incriminati bordati di rosso
```

### Colori e facce: due mondi diversi

Un punto sottile che vale la pena spiegare. Il bambino inserisce **colori**
(bianco, rosso…), il motore ragiona per **facce** (sopra, destra, davanti…).
Non è la stessa cosa: *quale* colore sta in alto dipende da come il bambino
teneva il cubo in mano. Il ponte fra i due mondi sono i sei centri, che non si
spostano mai: il colore del centro **definisce** la faccia.

L'app tiene i colori grezzi e deduce la mappa dai centri
(`src/core/cube/scheme.ts`), così funziona qualunque sia l'orientamento con cui
il bambino ha inserito i colori — verificato nei test su tre schemi diversi.

---

## La scansione con la fotocamera

Pipeline in `src/core/vision/`:

```
fotogramma → qualità → griglia 3×3 → campionamento → colori
           → fusione multi-fotogramma → confidenza → 54 quadratini → validazione
```

### Il problema vero: rosso contro arancione

Confrontare l'RGB di un adesivo con sei colori fissi sbaglia spesso, perché la
luce di casa sposta i colori parecchio e rosso/arancione (come blu/verde) sono
vicinissimi. Qui si fanno tre cose:

1. **Spazio Lab con luminosità depesata.** Ombre e riflessi cambiano la
   luminosità, non la tinta: la distanza pesa poco la prima e molto la seconda.
2. **Calibrazione automatica dai centri veri.** I riferimenti non sono sei
   colori teorici ma i sei centri del cubo appena letti: la calibrazione si
   adatta da sola a ogni cubo, ogni telefono e ogni lampadina.
3. **Il vincolo dei nove per colore.** Alla fine ogni colore compare
   *esattamente* nove volte. L'assegnazione finale non è una serie di scelte
   indipendenti ma un **problema di abbinamento a costo minimo**, risolto
   all'ottimo con l'algoritmo ungherese su una matrice 54×54. È qui che
   rosso e arancione smettono di confondersi: un rosso incerto finisce fra i
   rossi solo se toglierlo agli arancioni non peggiora il totale.

Verificato nei test su cubi mescolati fotografati con luce calda, luce fredda e
in penombra: 54 quadratini su 54 corretti. Con rumore volutamente esagerato la
lettura sbaglia, ma il conteggio resta nove per colore (quindi il validatore può
dare un messaggio utile) e i quadratini incerti finiscono nella lista da far
ricontrollare, ordinati dal meno sicuro.

### Qualità e acquisizione automatica

Prima di accettare una faccia si controllano fuoco (varianza del laplaciano),
luminosità, canali saturi (i riflessi), movimento fra fotogrammi, dimensione del
cubo nell'inquadratura e uniformità delle celle (una mano che copre). Se la
qualità non basta **non si acquisisce**, e Rubi dice cosa fare:

> «Aspetta! Vedo poco il cubo. Avvicinalo un pochino.»
> «C'è troppa luce. Prova a spostarti un po'.»
> «Ops! Tienilo fermo per un secondo. 😄»

Quando l'immagine è stabile per cinque fotogrammi buoni, la faccia si acquisisce
da sola. Il colore di ogni cella è la **mediana** di 36 punti nella zona
centrale, fusa poi sulla mediana dei fotogrammi: un riflesso piccolo non sposta
il risultato (c'è un test apposta).

L'app riconosce da sola quale faccia ha appena visto (dal centro), tiene l'elenco
di quelle fatte e mancanti, e dice come girare il cubo per la prossima. Dopo ogni
faccia fa un controllo incrociato (centri tutti diversi, nessun colore contato
più di nove volte) e, se qualcosa non torna, indica la faccia più sospetta.

### La rete di sicurezza

Dopo la scansione c'è **sempre** l'anteprima dei colori riconosciuti, con i
quadratini incerti segnati da ⚠️ e modificabili con un tocco. E da ogni schermata
della scansione si può passare all'inserimento manuale con un pulsante sempre
visibile: su un telefono vecchio o con poca luce è la strada più veloce, e non
deve sembrare una sconfitta.

---

## Il linguaggio per bambini

Ogni mossa viene tradotta in quello che il bambino **vede**, con la freccia
corrispondente:

| Mossa | Quello che legge il bambino          | Freccia |
|-------|--------------------------------------|---------|
| `R`   | Gira il lato destro verso l'alto.    | ⬆️ |
| `R'`  | Gira il lato destro verso il basso.  | ⬇️ |
| `U`   | Gira il lato di sopra verso sinistra.| ⬅️ |
| `F2`  | Gira il lato davanti due volte verso destra. | 🔄 |

Le direzioni non sono state scritte a occhio: c'è un test che verifica che la
frase e la freccia corrispondano al movimento reale calcolato dal motore.

**Tre livelli di difficoltà**, con la notazione ufficiale che entra per gradi:

- 🟢 **Facile** (predefinito) — solo frasi semplici, suggerimenti, prima
  animazione al rallentatore. Un test verifica che in questa modalità la
  notazione non compaia *mai* nel testo principale.
- 🟡 **Normale** — la frase semplice, e sotto: «I grandi la chiamano `R`».
- 🔴 **Esperto** — direttamente la notazione, e il solver passa a Kociemba
  (~21 mosse invece di ~112).

---

## Privacy e sicurezza

Scelte prese perché l'utente è un bambino:

- **Nessun account, nessuna registrazione, nessun server nostro.** Non esiste
  codice che invii progressi da nessuna parte.
- **Nessun dato personale richiesto.** Il soprannome è facoltativo, si imposta
  nell'area genitore, resta sul telefono e si cancella con un pulsante. Niente
  nome vero, indirizzo, telefono, contatti o posizione: i permessi relativi sono
  esplicitamente bloccati in `app.json`.
- **Fotocamera solo dove serve.** Si accende nella schermata di scansione,
  l'immagine vive il tempo di un fotogramma, non viene salvata in galleria né
  inviata. Non si leggono i dati EXIF. Il microfono non viene mai richiesto.
  Sul web la fotocamera si spegne esplicitamente uscendo dalla schermata.
- **Nessun contatto con siti terzi.** Non è gratis: la libreria della fotocamera
  di Expo, nella sua versione web, crea un lettore di codici QR che scarica
  `jsQR` da un CDN esterno **già al caricamento del modulo** — bastava importarla
  per contattare `cdn.jsdelivr.net`, senza nemmeno aprire la fotocamera. Se ne è
  accorto solo il collaudo in un browser vero. Sul web la fotocamera usa quindi
  direttamente `getUserMedia` (`CameraSurface.web.tsx`) e `expo-camera` non entra
  proprio nel pacchetto. Cinque test controllano che non ci ricaschi.
- **Niente chat, niente pubblicità, niente acquisti** raggiungibili dal bambino.
- **Area genitore** dietro una moltiplicazione a due cifre: ferma un bambino di
  nove anni senza infastidire un adulto. (È un cancello, non una password: dietro
  non ci sono comunque dati sensibili né pagamenti.)
- **Ricompense che premiano l'imparare, non lo stare nell'app.** Niente serie
  giornaliere, niente «torna domani», niente classifiche pubbliche. Nella sfida a
  tempo si gareggia solo con il proprio record. C'è un test che controlla che
  nessun badge premi la frequenza d'uso.
- **Tutto funziona offline.** Solver, validatore, riconoscimento colori e voce
  girano sul telefono.

---

## Gemini

⚠️ **La chiave che hai incollato nella richiesta va considerata compromessa:
è passata in chiaro in una conversazione. Conviene revocarla e generarne una
nuova.**

La chiave **non è stata messa nel repository**. È scritta in `.env`, che è
elencato in `.gitignore` e non viene versionato; `.env.example` mostra il
formato senza contenere segreti.

Un secondo avvertimento, indipendente dal primo: in un'app mobile, qualunque
chiave con prefisso `EXPO_PUBLIC_` **finisce dentro il pacchetto** ed è leggibile
da chiunque scarichi l'app. Va bene per provare sul proprio telefono; per
pubblicare sugli store la chiamata va spostata dietro un piccolo servizio proprio
che tiene la chiave sul server.

**A cosa serve.** È un extra, mai una dipendenza: quando il bambino preme
«Aiutami!» più volte sulla stessa mossa, Gemini riformula la spiegazione in un
modo diverso. Se non è configurato, se la rete non va o se la risposta non passa
i controlli, resta la frase scritta a mano e il bambino non se ne accorge.

**Cosa viene mandato:** solo la descrizione della mossa («Gira il lato destro
verso l'alto») e il nome della fase. Mai il soprannome, i progressi, i tempi o
immagini della fotocamera.

**Cosa viene filtrato al ritorno** (`sanitizeHint`, con test): risposte che
contengono la notazione del cubo, risposte con parole tecniche («algoritmo»,
«senso orario»…), risposte vuote, e taglio a 220 caratteri.


---

## Installarla su iPhone (PWA)

Oltre alle build native, Rubik Hero si pubblica come sito installabile: si apre
in Safari, si aggiunge alla schermata Home e da quel momento si comporta come
un'app — icona propria, schermo intero senza barra degli indirizzi, e funziona
anche senza rete.

### Costruire il sito

```bash
npm run icons        # rigenera le icone (serve solo se le cambi)
npm run build:web    # crea la cartella dist/
```

In `dist/` finisce un sito statico: si pubblica ovunque (Netlify, Vercel, GitHub
Pages, un qualunque hosting). **Deve stare in HTTPS**, altrimenti iOS non
installa l'app e la fotocamera non parte.

Per provarlo in locale:

```bash
npx expo start --web
```

### Metterla sulla schermata Home dell'iPhone

1. Apri il sito **con Safari** (non Chrome: su iPhone solo Safari sa installare).
2. Tocca il pulsante Condividi (il quadrato con la freccia in su).
3. Scorri e tocca **«Aggiungi a Home»**.
4. Comparirà l'icona del cubo con scritto **Rubik Hero**: toccala e l'app si apre
   a schermo intero.

La prima apertura scarica l'app (circa 1,7 MB); da lì in poi parte anche in
modalità aereo.

### Cosa c'è dietro

| File | A cosa serve |
|------|--------------|
| `public/index.html` | I meta tag iOS. Senza `apple-mobile-web-app-capable` l'icona salvata riaprirebbe Safari con la barra degli indirizzi invece dell'app a schermo intero |
| `public/manifest.webmanifest` | Nome, icone, colori, `display: standalone`, verticale |
| `public/sw.js` | Il service worker che fa funzionare tutto senza rete |
| `scripts/make-icons.mjs` | Disegna le icone (192, 512, maskable, apple-touch 180, favicon) invece di tenere PNG binari nel repository |

Il service worker usa due strategie diverse per due problemi diversi: i file col
nome che contiene l'impronta (`index-<hash>.js`) vengono dalla cache senza
nemmeno chiedere alla rete — è quello che rende l'avvio istantaneo — mentre
`index.html` prova prima la rete, così dopo una nuova pubblicazione il telefono
non resta con la versione vecchia.

Ci sono 19 test (`tests/pwa.test.ts`) che controllano questi file: sono verifiche
noiose ma preziose, perché una riga tolta per sbaglio da `index.html` non si nota
provando l'app nel browser — si scopre solo dopo averla installata.


### Pubblicarla su GitHub Pages

Il sito e' gia' costruito e caricato nel ramo `gh-pages`. Per farlo comparire
online servono due impostazioni, una volta sola:

1. **Settings → General → Danger Zone → Change visibility → Public**
   (GitHub Pages non e' disponibile sui repository privati con account gratuito).
2. **Settings → Pages → Source: «Deploy from a branch»**, ramo `gh-pages`,
   cartella `/ (root)` → Save.

Dopo qualche minuto il sito è su **https://mel0mac86.github.io/cubo/**

Da quel momento il sito si aggiorna da solo: `.github/workflows/pages.yml`
ricostruisce e ripubblica a ogni push, dopo aver eseguito test e typecheck.

Per costruirlo a mano:

```bash
node scripts/build-pages.mjs /cubo   # sottocartella (GitHub Pages)
node scripts/build-pages.mjs         # radice del dominio (Netlify, Vercel...)
```

Lo script **si rifiuta** di dichiarare il sito pronto se trova una chiave nel
pacchetto, un riferimento a un CDN esterno, un percorso di base sbagliato o un
file mancante. Non è zelo eccessivo: ha già bloccato due pubblicazioni sbagliate
(vedi sotto).

⚠️ **Il sito pubblicato non contiene la chiave di Gemini**, ed è voluto: le
variabili `EXPO_PUBLIC_` finiscono dentro il pacchetto JavaScript, e un sito
pubblico è leggibile da chiunque. Sul sito pubblicato Rubi usa quindi le
spiegazioni scritte a mano — l'app funziona esattamente uguale.

#### Tre trappole di GitHub Pages, e come sono state evitate

| Trappola | Cosa sarebbe successo | Rimedio |
|---|---|---|
| Il sito sta in `/cubo/`, non alla radice | Con i percorsi assoluti l'app cerca il proprio codice fuori dal sito: schermo viola vuoto | `experiments.baseUrl` + percorsi relativi ovunque |
| Pages passa i file da Jekyll | Jekyll **ignora** le cartelle che iniziano con `_`: sparisce `_expo/`, cioè tutto il codice | file `.nojekyll` |
| Nessun fallback per indirizzi sconosciuti | Pagina di errore di GitHub invece dell'app | `404.html` uguale a `index.html` |

### Differenze rispetto alle build native

| | Nativa (App Store / TestFlight) | PWA su iPhone |
|---|---|---|
| Cubo 3D, solver, livelli, minigiochi | ✅ | ✅ |
| Funziona offline | ✅ | ✅ (dopo la prima apertura) |
| Voce di Rubi | ✅ | ✅ (voci italiane di sistema) |
| Fotocamera | ✅ (`expo-camera`) | ⚠️ `getUserMedia`; richiede HTTPS, e da iOS 16.4 funziona anche in modalità Home |
| Progressi salvati | ✅ | ⚠️ nell'archivio del browser: iOS può cancellarlo se l'app resta inutilizzata a lungo |
| Aggiornamenti | passano dallo store | bastano un nuovo `build:web` e una ricarica |

L'inserimento manuale dei colori resta comunque disponibile ovunque, quindi anche
se la fotocamera non parte l'app è pienamente utilizzabile.

---

## Come si avvia

```bash
npm install
cp .env.example .env      # facoltativo: metti la chiave Gemini se la vuoi
npx expo start            # poi apri con Expo Go, oppure premi a / i / w
```

Per una build nativa (serve per la fotocamera su iOS):

```bash
npx expo prebuild
npx expo run:android      # oppure run:ios
```

---

## Test

```bash
npm test        # 132 test
npm run typecheck
```

I test non sono decorativi: verificano le cose che sarebbero difficili da
scoprire a mano su un telefono.

| File | Cosa verifica |
|------|---------------|
| `cube.test.ts` | Il modello del cubo, la notazione, il round-trip facelet↔cubie su 200 cubi |
| `validator.test.ts` | Gli 8 controlli, e che ogni fallimento indichi i quadratini giusti |
| `kociemba.test.ts` | Che 100 soluzioni riportino davvero al cubo risolto; il superflip; che la fase 1 entri davvero nel sottogruppo |
| `beginner.test.ts` | 200 cubi risolti, e che ogni fase lasci intatto quello che le precedenti hanno sistemato |
| `kids.test.ts` | Che in modalità facile non compaia mai la notazione; che frecce e frasi corrispondano al movimento reale; che nessun badge premi la frequenza d'uso |
| `vision.test.ts` | Griglia, qualità (sfocato, buio, riflessi, movimento) e lettura dei 54 quadratini con luce calda, fredda e in penombra |
| `app-logic.test.ts` | La mappa cubetti 3D → quadratini, la conversione colori↔facce con qualunque orientamento, il filtro delle risposte di Gemini |
| `pwa.test.ts` | I meta iOS, il manifest, il service worker (percorsi relativi e ricerca del pacchetto), e che nessun file punti a un CDN esterno |

Il test di stress su 5000 cubi non è nella suite (dura circa un minuto); i
risultati sono riportati sopra.

---

## Cosa è stato verificato e cosa no

Per onestà, visto che questa è una prima versione completa:

**Verificato in modo automatico**
- Motore, validatore ed entrambi i solver, sui numeri riportati sopra.
- Pipeline di visione su immagini sintetiche (con bordi neri, rumore, gradienti
  di luce, sfocatura, riflessi e cubo non centrato).
- Che l'intera app compili (`tsc` senza errori) e che il pacchetto Android si
  costruisca (`expo export`: 924 moduli).
- **La versione web aperta in un browser vero** (Chromium a dimensioni iPhone):
  l'app si avvia, il cubo 3D viene disegnato con WebGL, si naviga fra home,
  scelta modalità, inserimento colori, scuola di Rubi, minigiochi e area
  genitore, e **staccando la rete e ricaricando l'app riparte lo stesso**.

> Questo collaudo non è stato una formalità: ha trovato **quattro** difetti che
> nessun test e nessuna compilazione avevano visto. Il primo era un **ciclo
> infinito all'avvio** — la schermata iniziale chiedeva un mescolamento fisso
> passando un generatore casuale degenere, e la funzione che sceglieva le mosse
> riprovava all'infinito: l'app si sarebbe bloccata su schermo vuoto **su
> qualunque piattaforma**, iPhone compreso. Il secondo era la richiesta al CDN
> descritta nella sezione Privacy. Il terzo: **senza rete restava una pagina
> vuota**, perché il pacchetto JavaScript ha l'impronta del contenuto nel nome
> (quindi non si può elencare a mano) e alla prima visita viene scaricato prima
> che il service worker sia attivo — non finiva mai in cache; ora il service
> worker se lo va a cercare dentro `index.html` mentre si installa. Il quarto lo
> ha trovato il controllo del build: **la chiave di Gemini finiva nel sito
> pubblico** anche togliendola dall'ambiente, perché Expo rilegge `.env` da sé e
> Metro teneva in cache la trasformazione con la chiave già dentro.
>
> Morale: «compila» e «i test passano» non vogliono dire «parte», e «l'ho tolta
> dall'ambiente» non vuol dire «non è nel pacchetto».

**Non ancora verificato**
- **Nessuna prova su un telefono vero con un cubo vero.** È il passo successivo,
  ed è quello che conta di più: le soglie di qualità dell'immagine
  (`src/core/vision/frame.ts`) sono tarate su immagini sintetiche e quasi
  sicuramente andranno ritoccate sulle prime foto reali.
- La griglia 3×3 viene cercata **dentro la cornice di guida** mostrata sullo
  schermo, con messa a punto fine sui bordi degli adesivi. Non c'è un
  rilevamento libero del contorno del cubo in tutta l'immagine: per un bambino
  che deve comunque inquadrare, la cornice è più semplice da usare, ma va detto
  che è una semplificazione rispetto a un rilevamento completo.
- La correzione prospettica assume che il cubo sia ragionevolmente frontale.
  Un cubo molto inclinato viene rifiutato dai controlli di qualità invece che
  raddrizzato.
- Icona, splash screen e suoni non ci sono ancora (l'app usa emoji e colori).

**Idee per il seguito**
- Sostituire il campionamento nella cornice con un'omografia stimata sui quattro
  angoli del cubo, così da tollerare inclinazioni forti.
- Spostare la chiamata a Gemini dietro un servizio proprio prima di pubblicare.
- Aggiungere le voci di Rubi registrate da una persona, come alternativa alla
  sintesi vocale.
