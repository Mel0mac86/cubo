/**
 * Il ponte fra il 4x4 ridotto e il motore del 3x3.
 *
 * Una volta che i centri sono insieme e le alette appaiate, il cubo 4x4 si
 * comporta esattamente come un 3x3: ogni faccia e' fatta di nove "pezzi"
 * (quattro angoli, quattro spigoli doppi, un centro grande). Da qui in poi non
 * serve un solver nuovo: basta riscrivere il cubo come un 3x3 e passarlo al
 * motore gia' collaudato.
 */

import { Face } from '../cube/defs';
import { Move } from '../cube/moves';
import { Mossa4, PER_FACCIA, Stato4 } from './cube4';
import { Schema4 } from './schema4';

/** Dove prendere, dentro la faccia 4x4, il quadratino della casella 3x3. */
const RIGA = [0, 1, 3];

/**
 * Riscrive il cubo come i 54 facelet del 3x3. Va chiamato solo su un cubo
 * ridotto: altrimenti il campione scelto per uno spigolo doppio non
 * rappresenta tutto lo spigolo.
 */
export function come3x3(s: Stato4, schema: Schema4): Face[] {
  const out: Face[] = [];
  for (let f = 0; f < 6; f++) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const colore = s[f * PER_FACCIA + RIGA[r] * 4 + RIGA[c]];
        out.push(schema.facciaDiColore[colore] as Face);
      }
    }
  }
  return out;
}

/**
 * Una mossa del 3x3 diventa la stessa mossa sulla faccia esterna del 4x4.
 * Le facce sono numerate allo stesso modo nei due motori.
 */
export function mossaDa3x3(m: Move): Mossa4 {
  return { faccia: m.face as number, strati: 1, potenza: m.power };
}

export function mosseDa3x3(ms: Move[]): Mossa4[] {
  return ms.map(mossaDa3x3);
}
