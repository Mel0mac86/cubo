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
 */
export function randomMoveSequence(length: number, rng: Rng = Math.random): Move[] {
  const moves: Move[] = [];
  let lastFace = -1;
  let prevFace = -1;
  while (moves.length < length) {
    const idx = Math.floor(rng() * 18);
    const m = moveFromIndex(idx);
    if (m.face === lastFace) continue;
    // evita F B F (stesso asse tre volte): assi = face % 3
    if (m.face % 3 === lastFace % 3 && lastFace % 3 === prevFace % 3) continue;
    prevFace = lastFace;
    lastFace = m.face;
    moves.push(m);
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
