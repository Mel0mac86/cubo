/**
 * Generazione di mescolamenti. Serve per la modalita' allenamento/sfida e per i test.
 */

import { CubieCube, identityCube, applyMoveInPlace, cloneCube } from './cubie';
import { Move, moveFromIndex, moveIndex } from './moves';

export type Rng = () => number;

/** Generatore deterministico (mulberry32): stessi risultati a parita' di seme. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sequenza casuale di `length` mosse, senza due mosse consecutive sulla stessa
 * faccia e senza tre mosse consecutive sullo stesso asse.
 *
 * Le mosse vietate vengono ESCLUSE PRIMA di sorteggiare, non scartate dopo.
 * La differenza sembra da poco ma non lo e': scartando dopo, un generatore
 * degenere (per esempio uno che restituisce sempre lo stesso valore, come
 * capita quando si vuole un mescolamento fisso per una vetrina) farebbe
 * ciclare la funzione all'infinito e bloccherebbe l'intera app. Cosi invece
 * ogni sorteggio produce sempre una mossa valida e il ciclo finisce sempre.
 */
export function randomMoveSequence(length: number, rng: Rng = Math.random): Move[] {
  const moves: Move[] = [];
  let lastFace = -1;
  let prevFace = -1;

  for (let n = 0; n < length; n++) {
    // Facce ammesse: diversa dall'ultima, e non un terzo giro di fila
    // sullo stesso asse (assi = faccia % 3).
    const faces: number[] = [];
    for (let f = 0; f < 6; f++) {
      if (f === lastFace) continue;
      if (f % 3 === lastFace % 3 && lastFace % 3 === prevFace % 3) continue;
      faces.push(f);
    }

    const face = faces[Math.min(faces.length - 1, Math.floor(rng() * faces.length))];
    const power = Math.min(2, Math.floor(rng() * 3));
    moves.push(moveFromIndex(face * 3 + power));

    prevFace = lastFace;
    lastFace = face;
  }
  return moves;
}

export function scrambledCube(length = 25, rng: Rng = Math.random): CubieCube {
  const c = identityCube();
  for (const m of randomMoveSequence(length, rng)) applyMoveInPlace(c, moveIndex(m));
  return c;
}

/** Applica una sequenza a un cubo esistente. */
export function withMoves(cube: CubieCube, moves: Move[]): CubieCube {
  const c = cloneCube(cube);
  for (const m of moves) applyMoveInPlace(c, moveIndex(m));
  return c;
}
