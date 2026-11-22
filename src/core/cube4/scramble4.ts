/** Mescolate per il 4x4, con lo stesso generatore riproducibile del 3x3. */
import { Rng } from '../cube/scramble';
import { MOSSE4, Mossa4, Stato4, applicaTante, risolto4 } from './cube4';

export function mescolata4(lunghezza = 40, rng: Rng = Math.random): Mossa4[] {
  const out: Mossa4[] = [];
  let ultimaFaccia = -1;
  while (out.length < lunghezza) {
    // Escludo prima di estrarre: estrarre e riprovare puo' non finire mai se
    // il generatore e' degenere (ci e' gia' successo sul 3x3).
    const possibili = MOSSE4.filter((m) => m.faccia !== ultimaFaccia);
    const m = possibili[Math.floor(rng() * possibili.length) % possibili.length];
    out.push(m);
    ultimaFaccia = m.faccia;
  }
  return out;
}

export function cubo4Mescolato(lunghezza = 40, rng: Rng = Math.random): Stato4 {
  return applicaTante(risolto4(), mescolata4(lunghezza, rng));
}
