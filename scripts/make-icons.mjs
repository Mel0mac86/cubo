/**
 * Genera le icone dell'app disegnandole, invece di tenere dei PNG binari nel
 * repository. Cosi si possono ritoccare i colori cambiando due righe, e si
 * capisce da dove viene ogni pixel.
 *
 *   node scripts/make-icons.mjs
 *
 * Produce dentro assets/ (build native) e public/ (sito web):
 *   icon-192.png            icona PWA standard
 *   icon-512.png            icona PWA grande (splash e store)
 *   icon-maskable-512.png   versione con margine, per le icone ritagliate
 *   apple-touch-icon.png    180x180, quella che iPhone usa nella Home
 *   favicon.png             32x32
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import UPNG from 'upng-js';

const here = dirname(fileURLToPath(import.meta.url));
// Le icone servono in due posti: assets/ per le build native, public/ per la
// versione web (dove devono stare nella radice del sito).
const destinazioni = [join(here, '..', 'assets'), join(here, '..', 'public')];
for (const d of destinazioni) mkdirSync(d, { recursive: true });

/** Sfondo viola dell'app. */
const BG = [46, 16, 101];
/** Plastica nera fra gli adesivi. */
const FRAME = [17, 17, 22];

/** I nove adesivi dell'icona: allegri e con tutti e sei i colori del cubo. */
const STICKERS = [
  [248, 250, 252], // bianco
  [225, 29, 46], // rosso
  [22, 163, 74], // verde
  [250, 204, 21], // giallo
  [249, 115, 22], // arancione
  [29, 78, 216], // blu
  [22, 163, 74], // verde
  [248, 250, 252], // bianco
  [225, 29, 46], // rosso
];

/**
 * Disegna l'icona: un cubo visto di fronte, con i nove quadratini arrotondati
 * su una piastra scura.
 *
 * @param size lato in pixel
 * @param padding quanto spazio lasciare attorno (0..0.5) — serve per le icone
 *                "maskable", che vengono ritagliate a cerchio su Android
 */
function drawIcon(size, padding = 0.08) {
  const px = new Uint8Array(size * size * 4);

  const put = (x, y, [r, g, b]) => {
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };

  // Sfondo pieno: iPhone arrotonda da solo gli angoli, quindi niente trasparenza.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, BG);

  const plate = Math.round(size * (1 - padding * 2));
  const origin = Math.round((size - plate) / 2);
  const plateRadius = plate * 0.16;

  // Piastra scura arrotondata.
  for (let y = 0; y < plate; y++) {
    for (let x = 0; x < plate; x++) {
      if (insideRoundedRect(x, y, plate, plate, plateRadius)) {
        put(origin + x, origin + y, FRAME);
      }
    }
  }

  // I nove adesivi.
  const gap = plate * 0.055;
  const cell = (plate - gap * 4) / 3;
  const stickerRadius = cell * 0.22;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const color = STICKERS[row * 3 + col];
      const x0 = origin + gap + col * (cell + gap);
      const y0 = origin + gap + row * (cell + gap);
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          if (!insideRoundedRect(x, y, cell, cell, stickerRadius)) continue;
          // Una punta di luce in alto a sinistra: da' un po' di rilievo.
          const shine = 1 + 0.12 * (1 - (x / cell + y / cell) / 2);
          put(
            Math.round(x0 + x),
            Math.round(y0 + y),
            color.map((c) => Math.min(255, Math.round(c * shine))),
          );
        }
      }
    }
  }

  return px;
}

/** Vero se il punto sta dentro un rettangolo con gli angoli arrotondati. */
function insideRoundedRect(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function save(name, size, padding) {
  const px = drawIcon(size, padding);
  const png = UPNG.encode([px.buffer], size, size, 0);
  for (const d of destinazioni) writeFileSync(join(d, name), Buffer.from(png));
  console.log(`  ${name.padEnd(24)} ${size}x${size}  ${(png.byteLength / 1024).toFixed(1)} kB`);
}

console.log('Genero le icone di Rubik Hero:');
save('icon-192.png', 192, 0.06);
save('icon-512.png', 512, 0.06);
save('icon-maskable-512.png', 512, 0.18); // margine per il ritaglio a cerchio
save('apple-touch-icon.png', 180, 0.05); // quella che finisce sulla Home iPhone
save('favicon.png', 32, 0.04);
console.log('Fatto.');
