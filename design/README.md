# Direzioni grafiche

File sorgente del canvas di design pubblicato con `/design`: tre direzioni per la
home di My Money Adventure, messe a confronto con la schermata attuale.

| File | Cos'è |
|---|---|
| `Attuale.dc.html` | La home di oggi, ricostruita con i valori esatti di `web/src/styles/global.css` |
| `Main.dc.html` | **A · Libretto** — tipografia su carta, settimane mancanti come blocchi |
| `DirezioneB.dc.html` | **B · Salvadanaio** — i barattoli si riempiono in proporzione a quanto contengono |
| `DirezioneC.dc.html` | **C · Missione** — scura, XP in evidenza, obiettivo come conto alla rovescia |
| `canvas.json` | Disposizione sul canvas e note con pregi e difetti di ogni direzione |

Il file HTML del canvas non è versionato: è generato e pesa qualche megabyte.
Si ricrea da questi sorgenti con l'helper della skill `/design`.

## Due problemi che il confronto ha reso evidenti

1. **I tre salvadanai non entrano nella prima schermata**: oggi DONO resta sotto la
   piega, proprio la parte che il progetto vuole rendere importante.
2. **Le icone sono emoji di sistema**: cambiano faccia su ogni telefono, non si
   ricolorano e non si allineano. Nelle tre direzioni sono disegnate in SVG.
   Restano emoji solo l'avatar e l'obiettivo, dove sono una scelta del bambino.

I numeri usati nei mockup sono quelli veri del profilo demo di Sofia
(RISPARMIO 161,30 · SPENDO 34,50 · DONO 13,00 · obiettivo 250,00 · 9 settimane · 704 XP).
