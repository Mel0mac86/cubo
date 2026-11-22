/**
 * Le mosse del cubo grande, dette a un bambino.
 *
 * Sul 4x4 c'e' una cosa in piu' da spiegare rispetto al 3x3: certe mosse
 * girano DUE strati insieme invece di uno solo. E' il punto in cui i bambini
 * sbagliano di piu', quindi non basta dirlo: va ripetuto nel testo della
 * mossa, non nascosto in un simbolo.
 *
 * Come sul 3x3, la notazione ufficiale (Rw, U', ...) non compare mai in
 * modalita' facile.
 */

import { Face } from '../cube/defs';
import { Mossa4, mossaToString } from '../cube4/cube4';
import { ARROW_EMOJI, ARROW_IT, ArrowDirection, DIRECTION_IT, Difficulty, SIDE_NAME_IT } from './instructions';

export interface Istruzione4 {
  mossa: Mossa4;
  faccia: Face;
  /** Vero se bisogna girare due strati insieme. */
  doppia: boolean;
  quartiDiGiro: 1 | 2;
  orario: boolean;
  testo: string;
  parlato: string;
  freccia: ArrowDirection;
  notazione: string;
  suggerimento?: string;
}

export function descriviMossa4(m: Mossa4, difficolta: Difficulty = 'facile'): Istruzione4 {
  const faccia = m.faccia as Face;
  const meta = m.potenza === 2;
  const orario = m.potenza === 1;
  const verso = orario ? DIRECTION_IT[faccia].cw : DIRECTION_IT[faccia].ccw;
  const freccia: ArrowDirection = meta ? 'giro' : orario ? ARROW_IT[faccia].cw : ARROW_IT[faccia].ccw;
  const lato = SIDE_NAME_IT[faccia];
  const doppia = m.strati === 2;

  // "i due strati del lato destro" invece di "il lato destro".
  const cosa = doppia ? `i DUE strati ${dellArticolo(lato)}` : `il ${lato}`;

  const testo = meta
    ? `Gira ${cosa} due volte ${DIRECTION_IT[faccia].cw}.`
    : `Gira ${cosa} ${verso}.`;

  const parlato = meta
    ? `Gira ${cosa}, due volte, ${DIRECTION_IT[faccia].cw}.`
    : `Gira ${cosa}, ${verso}.`;

  let suggerimento: string | undefined;
  if (difficolta === 'facile') {
    suggerimento = doppia
      ? 'Attento: qui gli strati da girare sono DUE, uno sopra l altro. Prendili insieme con le dita.'
      : meta
        ? 'Due giri: fai il primo, poi subito il secondo nella stessa direzione.'
        : 'Gira solo quella fila: il resto del cubo sta fermo.';
  }

  return {
    mossa: m,
    faccia,
    doppia,
    quartiDiGiro: meta ? 2 : 1,
    orario,
    testo,
    parlato,
    freccia,
    notazione: mossaToString(m),
    suggerimento,
  };
}

export function descriviMosse4(ms: Mossa4[], difficolta: Difficulty = 'facile'): Istruzione4[] {
  return ms.map((m) => descriviMossa4(m, difficolta));
}

/** "del lato destro", "della faccia di sopra": l'articolo giusto in italiano. */
function dellArticolo(lato: string): string {
  if (lato.startsWith('lato')) return `del ${lato}`;
  if (lato.startsWith('fila')) return `della ${lato}`;
  return `di ${lato}`;
}

export { ARROW_EMOJI };
