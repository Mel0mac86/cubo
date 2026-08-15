/**
 * Da mossa matematica a frase che un bambino di nove anni capisce.
 *
 * Regola d'oro: il bambino guarda il cubo tenendolo fermo, con la faccia
 * "davanti" verso di se'. Quindi non diciamo mai "ruota la faccia R in senso
 * antiorario", ma "gira il lato destro verso il basso", che e' esattamente
 * quello che vede.
 *
 * La notazione ufficiale (R, U, F...) non sparisce: viene mostrata come
 * piccolo suggerimento in modalita' NORMALE e come istruzione principale in
 * modalita' ESPERTO, cosi il bambino la impara senza doverla studiare.
 */

import { Face } from '../cube/defs';
import { Move, moveToString } from '../cube/moves';

export type Difficulty = 'facile' | 'normale' | 'esperto';

/** Nome del lato dal punto di vista del bambino che tiene il cubo. */
export const SIDE_NAME_IT: Record<Face, string> = {
  [Face.U]: 'lato di sopra',
  [Face.D]: 'lato di sotto',
  [Face.R]: 'lato destro',
  [Face.L]: 'lato sinistro',
  [Face.F]: 'lato davanti',
  [Face.B]: 'lato dietro',
};

/** Versione corta, per le etichette. */
export const SIDE_SHORT_IT: Record<Face, string> = {
  [Face.U]: 'sopra',
  [Face.D]: 'sotto',
  [Face.R]: 'destra',
  [Face.L]: 'sinistra',
  [Face.F]: 'davanti',
  [Face.B]: 'dietro',
};

/**
 * Direzione della rotazione descritta come la vede il bambino.
 * Per ogni faccia, "giro orario guardando quella faccia da fuori" diventa un
 * movimento concreto: il lato destro va verso l'alto o verso il basso, ecc.
 */
const DIRECTION_IT: Record<Face, { cw: string; ccw: string }> = {
  // Guardando il cubo da davanti: girare U in senso orario (visto da sopra)
  // porta la fila di sopra verso sinistra.
  [Face.U]: { cw: 'verso sinistra', ccw: 'verso destra' },
  [Face.D]: { cw: 'verso destra', ccw: 'verso sinistra' },
  [Face.R]: { cw: "verso l'alto", ccw: 'verso il basso' },
  [Face.L]: { cw: 'verso il basso', ccw: "verso l'alto" },
  [Face.F]: { cw: 'verso destra', ccw: 'verso sinistra' },
  [Face.B]: { cw: 'verso sinistra', ccw: 'verso destra' },
};

/** Freccia da disegnare sopra la faccia. */
export type ArrowDirection = 'su' | 'giu' | 'sinistra' | 'destra' | 'giro';

const ARROW_IT: Record<Face, { cw: ArrowDirection; ccw: ArrowDirection }> = {
  [Face.U]: { cw: 'sinistra', ccw: 'destra' },
  [Face.D]: { cw: 'destra', ccw: 'sinistra' },
  [Face.R]: { cw: 'su', ccw: 'giu' },
  [Face.L]: { cw: 'giu', ccw: 'su' },
  [Face.F]: { cw: 'destra', ccw: 'sinistra' },
  [Face.B]: { cw: 'sinistra', ccw: 'destra' },
};

export const ARROW_EMOJI: Record<ArrowDirection, string> = {
  su: '⬆️',
  giu: '⬇️',
  sinistra: '⬅️',
  destra: '➡️',
  giro: '🔄',
};

export interface KidInstruction {
  /** La mossa originale, per l'animazione 3D. */
  move: Move;
  /** Faccia da illuminare. */
  face: Face;
  /** 1 = un quarto di giro, 2 = mezzo giro. */
  quarterTurns: 1 | 2;
  /** Verso della rotazione vista da fuori quella faccia. */
  clockwise: boolean;
  /** Frase principale, quella grande sullo schermo. */
  text: string;
  /** Frase letta da Rubi (uguale al testo ma con qualche pausa in piu'). */
  speech: string;
  /** Freccia da sovrapporre al cubo. */
  arrow: ArrowDirection;
  /** Notazione ufficiale, mostrata come "lingua dei grandi". */
  notation: string;
  /** Suggerimento extra, mostrato solo in modalita' FACILE. */
  hint?: string;
}

/** Traduce una singola mossa. */
export function describeMove(move: Move, difficulty: Difficulty = 'facile'): KidInstruction {
  const face = move.face;
  const half = move.power === 2;
  const clockwise = move.power === 1;
  const dir = clockwise ? DIRECTION_IT[face].cw : DIRECTION_IT[face].ccw;
  const arrow: ArrowDirection = half ? 'giro' : clockwise ? ARROW_IT[face].cw : ARROW_IT[face].ccw;
  const side = SIDE_NAME_IT[face];

  let text: string;
  if (half) {
    text = `Gira il ${side} due volte ${DIRECTION_IT[face].cw}.`;
  } else {
    text = `Gira il ${side} ${dir}.`;
  }

  const notation = moveToString(move);

  let hint: string | undefined;
  if (difficulty === 'facile') {
    hint = half
      ? 'Due giri: fai il primo, poi subito il secondo nella stessa direzione.'
      : 'Guarda la freccia sul cubo: gira solo quella fila, il resto sta fermo.';
  }

  const speech = half
    ? `Gira il ${side}, due volte, ${DIRECTION_IT[face].cw}.`
    : `Gira il ${side}, ${dir}.`;

  return {
    move,
    face,
    quarterTurns: half ? 2 : 1,
    clockwise,
    text,
    speech,
    arrow,
    notation,
    hint,
  };
}

export function describeMoves(moves: Move[], difficulty: Difficulty = 'facile'): KidInstruction[] {
  return moves.map((m) => describeMove(m, difficulty));
}

/* ------------------------------------------------------------------ */
/* Testo mostrato per ogni passo, a seconda della difficolta'          */
/* ------------------------------------------------------------------ */

export interface StepPresentation {
  /** Titolo grande: "PASSO 3". */
  title: string;
  /** Frase principale. */
  main: string;
  /** Riga piccola sotto (notazione o suggerimento). */
  sub?: string;
  /** Quello che dice Rubi ad alta voce. */
  speech: string;
  showNotation: boolean;
  /** In FACILE la prima animazione va al rallentatore. */
  slowMotion: boolean;
}

export function presentStep(
  instruction: KidInstruction,
  index: number,
  total: number,
  difficulty: Difficulty,
  isFirstTime: boolean,
): StepPresentation {
  const title = `PASSO ${index + 1}`;
  switch (difficulty) {
    case 'esperto':
      return {
        title,
        main: instruction.notation,
        sub: instruction.text,
        speech: instruction.notation,
        showNotation: true,
        slowMotion: false,
      };
    case 'normale':
      return {
        title,
        main: instruction.text,
        sub: `I grandi la chiamano ${instruction.notation}`,
        speech: instruction.speech,
        showNotation: true,
        slowMotion: false,
      };
    case 'facile':
    default:
      return {
        title,
        main: instruction.text,
        sub: instruction.hint,
        speech: `${instruction.speech} ${
          index === 0 ? 'Guarda la freccia, te la faccio vedere io.' : ''
        }`.trim(),
        showNotation: false,
        slowMotion: isFirstTime,
      };
  }
}

/* ------------------------------------------------------------------ */
/* Frasi di Rubi                                                       */
/* ------------------------------------------------------------------ */

const PRAISE = [
  'Perfetto!',
  'Bravissimo!',
  'Che bello!',
  'Stai andando benissimo!',
  'Sei un campione!',
  'Ottimo lavoro!',
  'Wow, che velocita!',
  'Continua cosi!',
];

const ENCOURAGE = [
  'Nessun problema, facciamolo insieme.',
  'Tranquillo, ci riproviamo!',
  'Succede a tutti, guarda qui.',
  'Te la faccio vedere di nuovo, piano piano.',
];

/** Complimento diverso ogni volta ma deterministico (niente sorprese nei test). */
export function praise(seed: number): string {
  return PRAISE[Math.abs(Math.floor(seed)) % PRAISE.length];
}

export function encourage(seed: number): string {
  return ENCOURAGE[Math.abs(Math.floor(seed)) % ENCOURAGE.length];
}

/** Messaggio dopo ogni faccia inserita: "3/6 fatta!" */
export function faceProgressMessage(done: number, total = 6): string {
  if (done >= total) return 'Le abbiamo viste tutte! Che squadra!';
  const left = total - done;
  if (left === 1) return 'Manca solo una faccia! Ci siamo quasi!';
  return `Faccia completata! Ne mancano ${left}.`;
}

/** Barra di avanzamento a quadratini, come nel flusso descritto. */
export function progressBar(done: number, total = 6): string {
  return '🟩'.repeat(Math.min(done, total)) + '⬜'.repeat(Math.max(0, total - done));
}

/** Stelline: 1/6 ⭐, 2/6 ⭐⭐ ... */
export function stars(n: number): string {
  return '⭐'.repeat(Math.max(0, n));
}
