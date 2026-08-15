/**
 * Notazione delle mosse, parsing, inversione e utilita'.
 * Una mossa e' rappresentata internamente come indice 0..17 (faccia*3 + potenza-1).
 */

import { Face, FACE_NAMES, SIDE_FACES } from './defs';
import { applyMoveInPlace, CubieCube, cloneCube } from './cubie';

export interface Move {
  face: Face;
  /** 1 = 90° orario, 2 = 180°, 3 = 90° antiorario */
  power: 1 | 2 | 3;
}

export const ALL_MOVES: Move[] = (() => {
  const out: Move[] = [];
  for (let f = 0; f < 6; f++) {
    for (let p = 1 as 1 | 2 | 3; p <= 3; p++) out.push({ face: f as Face, power: p as 1 | 2 | 3 });
  }
  return out;
})();

export function moveIndex(m: Move): number {
  return m.face * 3 + (m.power - 1);
}

export function moveFromIndex(i: number): Move {
  return { face: Math.floor(i / 3) as Face, power: ((i % 3) + 1) as 1 | 2 | 3 };
}

export function moveToString(m: Move): string {
  const suffix = m.power === 1 ? '' : m.power === 2 ? '2' : "'";
  return FACE_NAMES[m.face] + suffix;
}

export function movesToString(ms: Move[]): string {
  return ms.map(moveToString).join(' ');
}

export function parseMove(token: string): Move {
  const t = token.trim();
  const faceIdx = FACE_NAMES.indexOf(t[0]?.toUpperCase() as never);
  if (faceIdx < 0) throw new Error(`Mossa non riconosciuta: "${token}"`);
  const rest = t.slice(1);
  let power: 1 | 2 | 3 = 1;
  if (rest === '' ) power = 1;
  else if (rest === '2') power = 2;
  else if (rest === "'" || rest === '’' || rest === '3') power = 3;
  else throw new Error(`Mossa non riconosciuta: "${token}"`);
  return { face: faceIdx as Face, power };
}

export function parseMoves(s: string): Move[] {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map(parseMove);
}

export function invertMove(m: Move): Move {
  return { face: m.face, power: (4 - m.power) as 1 | 2 | 3 };
}

export function invertMoves(ms: Move[]): Move[] {
  return ms.slice().reverse().map(invertMove);
}

export function applyMoves(cube: CubieCube, ms: Move[]): CubieCube {
  const c = cloneCube(cube);
  for (const m of ms) applyMoveInPlace(c, moveIndex(m));
  return c;
}

/**
 * Compatta una sequenza: unisce mosse consecutive sulla stessa faccia ed
 * elimina quelle nulle. Non riordina mosse su assi opposti (non serve).
 */
export function simplifyMoves(ms: Move[]): Move[] {
  const out: Move[] = [];
  for (const m of ms) {
    const last = out[out.length - 1];
    if (last && last.face === m.face) {
      const p = (last.power + m.power) % 4;
      out.pop();
      if (p !== 0) out.push({ face: m.face, power: p as 1 | 2 | 3 });
    } else {
      out.push(m);
    }
  }
  // Una sola passata puo' lasciare adiacenze nuove (es. R L R -> ...): ripeti.
  if (out.length !== ms.length) {
    const again = simplifyOnce(out);
    return again;
  }
  return out;
}

function simplifyOnce(ms: Move[]): Move[] {
  const out: Move[] = [];
  for (const m of ms) {
    const last = out[out.length - 1];
    if (last && last.face === m.face) {
      const p = (last.power + m.power) % 4;
      out.pop();
      if (p !== 0) out.push({ face: m.face, power: p as 1 | 2 | 3 });
    } else {
      out.push(m);
    }
  }
  return out.length === ms.length ? out : simplifyOnce(out);
}

/* ------------------------------------------------------------------ */
/* Rotazione delle sequenze attorno all'asse verticale                 */
/* ------------------------------------------------------------------ */

/**
 * Ruota una mossa di `k` quarti di giro attorno all'asse U-D.
 * Serve per scrivere un algoritmo una volta sola ("relativo alla faccia
 * davanti") e riutilizzarlo per tutte e quattro le facce laterali.
 * U e D restano invariate; F -> R -> B -> L -> F.
 */
export function rotateMove(m: Move, k: number): Move {
  if (m.face === Face.U || m.face === Face.D) return m;
  const idx = SIDE_FACES.indexOf(m.face);
  const next = SIDE_FACES[(idx + k) % 4];
  return { face: next, power: m.power };
}

export function rotateMoves(ms: Move[], k: number): Move[] {
  return ms.map((m) => rotateMove(m, k));
}

/** Algoritmo scritto in notazione "relativa" (F = faccia davanti scelta). */
export function alg(notation: string, k = 0): Move[] {
  return rotateMoves(parseMoves(notation), k);
}
