# La grafica nuova

Sorgenti del canvas di design pubblicato con `/design`: la direzione **A · Libretto**
portata avanti fino a un sistema completo su quattro schermate.

| File | Cos'è |
|---|---|
| `Main.dc.html` | **Oggi** — i tre salvadanai affiancati che si riempiono, la missione, le azioni |
| `Missione.dc.html` | **La missione** — l'obiettivo come sentiero con tappe, cifre e date |
| `Acquisto.dc.html` | **Compro qualcosa** — scheda d'acquisto e simulatore, **funzionante** |
| `Storico.dc.html` | **Storico** — registro per giorno, con il saldo che resta dopo ogni riga |
| `canvas.json` | Disposizione, pagine e note |

Le copie di `Attuale.dc.html`, `DirezioneB.dc.html` e `DirezioneC.dc.html` arrivano da
`design/` e stanno qui perché l'helper della skill semina il canvas da una sola cartella.
Sulla seconda pagina servono da confronto: com'era prima e le due direzioni scartate.

Il file HTML del canvas non è versionato: pesa qualche megabyte e si rigenera da questi
sorgenti con l'helper della skill `/design`.

## Cosa cambia rispetto alla grafica attuale

1. **I tre salvadanai stanno tutti sopra la piega** e si riempiono in proporzione a quanto
   contengono — prima DONO restava sotto, proprio la parte che il progetto vuole rendere
   importante.
2. **Niente gradienti e niente emoji di sistema**: le icone sono SVG, uguali su ogni
   telefono e ricolorabili. Restano emoji solo l'avatar e l'obiettivo, dove sono una
   scelta del bambino.
3. **L'obiettivo diventa un sentiero**: ogni tappa ha una cifra e una data, e «SEI QUI»
   dice a che punto si è.
4. **Lo storico mostra il saldo dopo ogni movimento** — è il dato che il registro tiene
   già su ogni riga (`balance_after`).

Il simulatore d'acquisto è l'unica schermata interattiva: è il cuore del progetto
(«TU DECIDI. NOI TI MOSTRIAMO COSA SUCCEDE.») e si capisce solo provandolo.

I numeri sono quelli veri del profilo demo di Sofia
(RISPARMIO 161,30 · SPENDO 34,50 · DONO 13,00 · obiettivo 250,00 · 9 settimane · 704 XP).
