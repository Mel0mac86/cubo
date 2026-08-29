/**
 * Genera le icone PNG e le schermate di avvio per iOS/Android.
 *
 * Perché servono i PNG: Safari su iPhone IGNORA le icone SVG per
 * "Aggiungi alla schermata Home". Senza un `apple-touch-icon` in PNG, iOS mette
 * sulla home una miniatura della pagina invece dell'icona dell'app.
 *
 * Uso:  npm --workspace web run icone
 * I file prodotti sono versionati in web/public/: non serve rigenerarli a ogni build.
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(PUBLIC, { recursive: true });

const VIOLA = '#5B3DF5';
const VIOLA_CHIARO = '#7C5CFF';

/**
 * Il logo: i tre salvadanai SAVE (verde), SPEND (blu) e GIVE (arancione)
 * attorno al simbolo dell'euro. Disegnato su una griglia 192×192.
 */
function logo({ scala = 1, dx = 0, dy = 0 } = {}) {
  return `
    <g transform="translate(${96 + dx} ${96 + dy}) scale(${scala}) translate(-96 -96)">
      <text x="96" y="66" font-size="52" text-anchor="middle" fill="#ffffff"
            font-family="Helvetica, Arial, sans-serif" font-weight="bold">€</text>
      <circle cx="59" cy="110" r="28" fill="#16B364"/>
      <circle cx="133" cy="110" r="28" fill="#2E90FA"/>
      <circle cx="96" cy="156" r="28" fill="#F79009"/>
    </g>`;
}

/**
 * Icona quadrata a tutto campo, SENZA angoli arrotondati e senza trasparenza:
 * ci pensa iOS a ritagliare la forma. Un PNG con angoli già arrotondati
 * verrebbe arrotondato due volte e apparirebbe con i bordi neri.
 */
function svgIcona(dimensione, { maskable = false } = {}) {
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${dimensione}" height="${dimensione}" viewBox="0 0 192 192">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${VIOLA_CHIARO}"/><stop offset="1" stop-color="${VIOLA}"/>
    </linearGradient>
  </defs>
  <rect width="192" height="192" fill="url(#g)"/>
  ${logo({ scala: maskable ? 0.66 : 0.9, dy: maskable ? -7 : -10 })}
</svg>`);
}

/** Schermata di avvio: fondo pieno (comprime in pochi kB) con il logo al centro. */
function svgAvvio(larghezza, altezza) {
  const lato = Math.round(Math.min(larghezza, altezza) * 0.38);
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${larghezza}" height="${altezza}">
  <rect width="${larghezza}" height="${altezza}" fill="${VIOLA}"/>
  <svg x="${(larghezza - lato) / 2}" y="${(altezza - lato) / 2}" width="${lato}" height="${lato}" viewBox="0 0 192 192">
    <rect width="192" height="192" rx="42" fill="${VIOLA_CHIARO}"/>
    ${logo({ scala: 0.86, dy: -10 })}
  </svg>
</svg>`);
}

/**
 * iPhone supportati dalle schermate di avvio. iOS sceglie l'immagine con una
 * media query esatta: se nessuna corrisponde mostra semplicemente il colore di
 * sfondo del manifest, quindi l'elenco può restare parziale senza rompere nulla.
 */
export const DISPOSITIVI = [
  { w: 320, h: 568, r: 2, nome: 'iPhone SE (1ª gen)' },
  { w: 375, h: 667, r: 2, nome: 'iPhone SE (2ª/3ª gen), 8' },
  { w: 414, h: 736, r: 3, nome: 'iPhone 8 Plus' },
  { w: 375, h: 812, r: 3, nome: 'iPhone X, XS, 11 Pro, 12/13 mini' },
  { w: 414, h: 896, r: 2, nome: 'iPhone XR, 11' },
  { w: 414, h: 896, r: 3, nome: 'iPhone XS Max, 11 Pro Max' },
  { w: 390, h: 844, r: 3, nome: 'iPhone 12, 13, 14' },
  { w: 393, h: 852, r: 3, nome: 'iPhone 14 Pro, 15, 16' },
  { w: 402, h: 874, r: 3, nome: 'iPhone 16 Pro' },
  { w: 428, h: 926, r: 3, nome: 'iPhone 12/13 Pro Max, 14 Plus' },
  { w: 430, h: 932, r: 3, nome: 'iPhone 15/16 Plus, 15 Pro Max' },
  { w: 440, h: 956, r: 3, nome: 'iPhone 16 Pro Max' },
];

async function genera() {
  const icone = [
    ['apple-touch-icon.png', 180, {}],   // iOS: schermata Home
    ['icon-192.png', 192, {}],
    ['icon-512.png', 512, {}],
    ['icon-maskable-512.png', 512, { maskable: true }], // Android: icona adattiva
    ['favicon-32.png', 32, {}],
  ];

  for (const [nome, dimensione, opzioni] of icone) {
    const png = await sharp(svgIcona(dimensione, opzioni)).png({ compressionLevel: 9 }).toBuffer();
    writeFileSync(join(PUBLIC, nome), png);
    console.log(`  ${nome.padEnd(26)} ${dimensione}×${dimensione}  ${(png.length / 1024).toFixed(1)} kB`);
  }

  mkdirSync(join(PUBLIC, 'avvio'), { recursive: true });
  for (const d of DISPOSITIVI) {
    const larghezza = d.w * d.r;
    const altezza = d.h * d.r;
    const nome = `avvio/${d.w}x${d.h}@${d.r}.png`;
    const png = await sharp(svgAvvio(larghezza, altezza))
      .png({ compressionLevel: 9, palette: true })  // fondo piatto: pochi kB
      .toBuffer();
    writeFileSync(join(PUBLIC, nome), png);
    console.log(`  ${nome.padEnd(26)} ${larghezza}×${altezza}  ${(png.length / 1024).toFixed(1)} kB  — ${d.nome}`);
  }
}

// Si esegue solo da riga di comando: importare il file (per l'elenco DISPOSITIVI)
// non deve rigenerare le immagini.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  genera()
    .then(() => console.log('\n✅ Icone e schermate di avvio generate in web/public/'))
    .catch((e) => {
      console.error('❌ Generazione fallita:', e);
      process.exitCode = 1;
    });
}
