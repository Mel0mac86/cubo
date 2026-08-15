/**
 * Tabelle di transizione e tabelle di potatura (pruning) per il two-phase.
 *
 * Le tabelle occupano circa 4 MB e vengono costruite una volta sola, in modo
 * pigro, al primo utilizzo del solver "esperto". La modalita' per bambini usa
 * il solver a strati, che non ha bisogno di nessuna tabella: cosi la prima
 * risoluzione parte istantaneamente anche su telefoni lenti.
 */

import { CubieCube, applyMoveInPlace, identityCube } from '../cube/cubie';
import {
  N_CORN_PERM,
  N_FLIP,
  N_SLICE,
  N_SLICE_PERM,
  N_SLICE_SORTED,
  N_TWIST,
  N_UD_EDGE_PERM,
  getCornPerm,
  getFlip,
  getSliceSorted,
  getTwist,
  getUdEdgePerm,
  setCornPerm,
  setFlip,
  setSliceSorted,
  setTwist,
  setUdEdgePerm,
} from './coord';

/** Le 18 mosse (indice faccia*3 + potenza-1). */
export const N_MOVE = 18;

/**
 * Le 10 mosse ammesse in fase 2: U, U2, U', D, D2, D', R2, L2, F2, B2.
 * Espresse come indici nel sistema a 18 mosse.
 */
export const PHASE2_MOVES: number[] = [
  0, 1, 2, // U, U2, U'
  9, 10, 11, // D, D2, D'
  4, // R2
  13, // L2
  7, // F2
  16, // B2
];
export const N_MOVE2 = PHASE2_MOVES.length;

const ID_CP = Int8Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
const ID_EP = Int8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

function reset(c: CubieCube): void {
  c.cp.set(ID_CP);
  c.co.fill(0);
  c.ep.set(ID_EP);
  c.eo.fill(0);
}

export interface SolverTables {
  twistMove: Uint16Array; // [N_TWIST * 18]
  flipMove: Uint16Array; // [N_FLIP * 18]
  sliceSortedMove: Uint16Array; // [N_SLICE_SORTED * 18]
  sliceMove: Uint16Array; // [N_SLICE * 18]
  cornPermMove: Uint16Array; // [N_CORN_PERM * 10]  (solo mosse di fase 2)
  udEdgeMove: Uint16Array; // [N_UD_EDGE_PERM * 10]
  slicePermMove: Uint8Array; // [24 * 10]
  prunTwistSlice: Uint8Array; // [N_TWIST * N_SLICE]
  prunFlipSlice: Uint8Array; // [N_FLIP * N_SLICE]
  prunCornSlice: Uint8Array; // [N_CORN_PERM * 24]
  prunUdEdgeSlice: Uint8Array; // [N_UD_EDGE_PERM * 24]
}

let cached: SolverTables | null = null;

export function tablesReady(): boolean {
  return cached !== null;
}

export function getTables(onProgress?: (frac: number, label: string) => void): SolverTables {
  if (cached) return cached;
  cached = buildTables(onProgress);
  return cached;
}

/** Solo per i test: libera le tabelle. */
export function _resetTables(): void {
  cached = null;
}

function buildTables(onProgress?: (frac: number, label: string) => void): SolverTables {
  const report = (f: number, l: string) => onProgress?.(f, l);
  const c = identityCube();

  /* ---- tabelle di transizione ---- */
  report(0, 'Guardo gli angolini');
  const twistMove = new Uint16Array(N_TWIST * N_MOVE);
  for (let i = 0; i < N_TWIST; i++) {
    for (let m = 0; m < N_MOVE; m++) {
      reset(c);
      setTwist(c, i);
      applyMoveInPlace(c, m);
      twistMove[i * N_MOVE + m] = getTwist(c);
    }
  }

  report(0.1, 'Guardo i pezzi laterali');
  const flipMove = new Uint16Array(N_FLIP * N_MOVE);
  for (let i = 0; i < N_FLIP; i++) {
    for (let m = 0; m < N_MOVE; m++) {
      reset(c);
      setFlip(c, i);
      applyMoveInPlace(c, m);
      flipMove[i * N_MOVE + m] = getFlip(c);
    }
  }

  report(0.2, 'Guardo la fascia centrale');
  const sliceSortedMove = new Uint16Array(N_SLICE_SORTED * N_MOVE);
  for (let i = 0; i < N_SLICE_SORTED; i++) {
    for (let m = 0; m < N_MOVE; m++) {
      reset(c);
      setSliceSorted(c, i);
      applyMoveInPlace(c, m);
      sliceSortedMove[i * N_MOVE + m] = getSliceSorted(c);
    }
  }

  const sliceMove = new Uint16Array(N_SLICE * N_MOVE);
  for (let a = 0; a < N_SLICE; a++) {
    for (let m = 0; m < N_MOVE; m++) {
      sliceMove[a * N_MOVE + m] = Math.floor(sliceSortedMove[a * 24 * N_MOVE + m] / 24);
    }
  }

  const slicePermMove = new Uint8Array(N_SLICE_PERM * N_MOVE2);
  for (let b = 0; b < N_SLICE_PERM; b++) {
    for (let mi = 0; mi < N_MOVE2; mi++) {
      slicePermMove[b * N_MOVE2 + mi] = sliceSortedMove[b * N_MOVE + PHASE2_MOVES[mi]] % 24;
    }
  }

  report(0.42, 'Metto gli angoli in fila');
  const cornPermMove = new Uint16Array(N_CORN_PERM * N_MOVE2);
  for (let i = 0; i < N_CORN_PERM; i++) {
    for (let mi = 0; mi < N_MOVE2; mi++) {
      reset(c);
      setCornPerm(c, i);
      applyMoveInPlace(c, PHASE2_MOVES[mi]);
      cornPermMove[i * N_MOVE2 + mi] = getCornPerm(c);
    }
  }

  report(0.55, 'Metto gli spigoli in fila');
  const udEdgeMove = new Uint16Array(N_UD_EDGE_PERM * N_MOVE2);
  for (let i = 0; i < N_UD_EDGE_PERM; i++) {
    for (let mi = 0; mi < N_MOVE2; mi++) {
      reset(c);
      setUdEdgePerm(c, i);
      applyMoveInPlace(c, PHASE2_MOVES[mi]);
      udEdgeMove[i * N_MOVE2 + mi] = getUdEdgePerm(c);
    }
  }

  /* ---- tabelle di potatura ---- */
  report(0.68, 'Calcolo le scorciatoie');
  const prunTwistSlice = bfsPrune(N_TWIST * N_SLICE, 0, N_MOVE, (state, m) => {
    const twist = (state / N_SLICE) | 0;
    const slice = state % N_SLICE;
    return twistMove[twist * N_MOVE + m] * N_SLICE + sliceMove[slice * N_MOVE + m];
  });

  report(0.79, 'Calcolo le scorciatoie');
  const prunFlipSlice = bfsPrune(N_FLIP * N_SLICE, 0, N_MOVE, (state, m) => {
    const flip = (state / N_SLICE) | 0;
    const slice = state % N_SLICE;
    return flipMove[flip * N_MOVE + m] * N_SLICE + sliceMove[slice * N_MOVE + m];
  });

  report(0.88, 'Ultimi controlli');
  const prunCornSlice = bfsPrune(N_CORN_PERM * N_SLICE_PERM, 0, N_MOVE2, (state, mi) => {
    const cp = (state / N_SLICE_PERM) | 0;
    const sp = state % N_SLICE_PERM;
    return cornPermMove[cp * N_MOVE2 + mi] * N_SLICE_PERM + slicePermMove[sp * N_MOVE2 + mi];
  });

  report(0.95, 'Ultimi controlli');
  const prunUdEdgeSlice = bfsPrune(N_UD_EDGE_PERM * N_SLICE_PERM, 0, N_MOVE2, (state, mi) => {
    const ep = (state / N_SLICE_PERM) | 0;
    const sp = state % N_SLICE_PERM;
    return udEdgeMove[ep * N_MOVE2 + mi] * N_SLICE_PERM + slicePermMove[sp * N_MOVE2 + mi];
  });

  report(1, 'Pronto');

  return {
    twistMove,
    flipMove,
    sliceSortedMove,
    sliceMove,
    cornPermMove,
    udEdgeMove,
    slicePermMove,
    prunTwistSlice,
    prunFlipSlice,
    prunCornSlice,
    prunUdEdgeSlice,
  };
}

/**
 * Ricerca in ampiezza all'indietro dallo stato risolto: per ogni stato salva
 * la distanza minima dal goal, usata come limite inferiore nell'IDA*.
 *
 * Le mosse del cubo sono invertibili e ogni insieme di mosse usato qui e'
 * chiuso rispetto all'inverso, quindi la distanza in avanti coincide con
 * quella all'indietro e una sola BFS basta.
 */
function bfsPrune(
  size: number,
  goal: number,
  nMoves: number,
  step: (state: number, move: number) => number,
): Uint8Array {
  const dist = new Uint8Array(size).fill(0xff);
  dist[goal] = 0;

  let frontier = new Int32Array(size);
  let next = new Int32Array(size);
  frontier[0] = goal;
  let frontierLen = 1;
  let depth = 0;

  while (frontierLen > 0) {
    let nextLen = 0;
    for (let i = 0; i < frontierLen; i++) {
      const s = frontier[i];
      for (let m = 0; m < nMoves; m++) {
        const t = step(s, m);
        if (dist[t] === 0xff) {
          dist[t] = depth + 1;
          next[nextLen++] = t;
        }
      }
    }
    const tmp = frontier;
    frontier = next;
    next = tmp;
    frontierLen = nextLen;
    depth++;
  }

  // Stati irraggiungibili (combinazioni di coordinate che nessun cubo reale
  // puo' assumere): valore alto ma finito, cosi non bloccano mai la ricerca.
  for (let i = 0; i < size; i++) if (dist[i] === 0xff) dist[i] = 30;
  return dist;
}
