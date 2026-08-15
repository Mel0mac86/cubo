/**
 * Rappresentazione a "cubie" (pezzi) del cubo: permutazione + orientamento.
 * E' la rappresentazione su cui lavorano validatore e solver.
 */

import {
  CORNER_COUNT,
  CORNER_FACELET,
  Corner,
  EDGE_COUNT,
  EDGE_FACELET,
  Edge,
  Face,
  CORNER_FACE,
  EDGE_FACE,
} from './defs';

export interface CubieCube {
  /** cp[i] = quale angolo si trova nella posizione i */
  cp: Int8Array;
  /** co[i] = orientamento (0,1,2) dell'angolo nella posizione i */
  co: Int8Array;
  /** ep[i] = quale spigolo si trova nella posizione i */
  ep: Int8Array;
  /** eo[i] = orientamento (0,1) dello spigolo nella posizione i */
  eo: Int8Array;
}

export function identityCube(): CubieCube {
  return {
    cp: Int8Array.from([0, 1, 2, 3, 4, 5, 6, 7]),
    co: new Int8Array(8),
    ep: Int8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    eo: new Int8Array(12),
  };
}

export function cloneCube(c: CubieCube): CubieCube {
  return {
    cp: Int8Array.from(c.cp),
    co: Int8Array.from(c.co),
    ep: Int8Array.from(c.ep),
    eo: Int8Array.from(c.eo),
  };
}

export function cubesEqual(a: CubieCube, b: CubieCube): boolean {
  for (let i = 0; i < CORNER_COUNT; i++) {
    if (a.cp[i] !== b.cp[i] || a.co[i] !== b.co[i]) return false;
  }
  for (let i = 0; i < EDGE_COUNT; i++) {
    if (a.ep[i] !== b.ep[i] || a.eo[i] !== b.eo[i]) return false;
  }
  return true;
}

export function isSolved(c: CubieCube): boolean {
  for (let i = 0; i < CORNER_COUNT; i++) if (c.cp[i] !== i || c.co[i] !== 0) return false;
  for (let i = 0; i < EDGE_COUNT; i++) if (c.ep[i] !== i || c.eo[i] !== 0) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Moltiplicazione (composizione di stati)                             */
/* ------------------------------------------------------------------ */

/** dest = a * b  (prima a, poi b applicato "sopra"). Scrive in `out`. */
export function multiply(a: CubieCube, b: CubieCube, out: CubieCube): CubieCube {
  for (let i = 0; i < CORNER_COUNT; i++) {
    const p = b.cp[i];
    out.cp[i] = a.cp[p];
    out.co[i] = (a.co[p] + b.co[i]) % 3;
  }
  for (let i = 0; i < EDGE_COUNT; i++) {
    const p = b.ep[i];
    out.ep[i] = a.ep[p];
    out.eo[i] = (a.eo[p] + b.eo[i]) % 2;
  }
  return out;
}

/** Inverso di un cubo (lo stato che lo riporta all'identita'). */
export function invert(c: CubieCube): CubieCube {
  const out = identityCube();
  for (let i = 0; i < CORNER_COUNT; i++) out.cp[c.cp[i]] = i;
  for (let i = 0; i < CORNER_COUNT; i++) {
    const ori = c.co[out.cp[i]];
    out.co[i] = ori === 0 ? 0 : 3 - ori;
  }
  for (let i = 0; i < EDGE_COUNT; i++) out.ep[c.ep[i]] = i;
  for (let i = 0; i < EDGE_COUNT; i++) out.eo[i] = c.eo[out.ep[i]];
  return out;
}

/* ------------------------------------------------------------------ */
/* Le sei mosse base                                                   */
/* ------------------------------------------------------------------ */

function mk(cp: number[], co: number[], ep: number[], eo: number[]): CubieCube {
  return {
    cp: Int8Array.from(cp),
    co: Int8Array.from(co),
    ep: Int8Array.from(ep),
    eo: Int8Array.from(eo),
  };
}

const { URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB } = Corner;
const { UR, UF, UL, UB, DR, DF, DL, DB, FR, FL, BL, BR } = Edge;

/** Stati corrispondenti a U, R, F, D, L, B (rotazione oraria di 90°). */
export const BASIC_MOVE_CUBE: CubieCube[] = [
  // U
  mk(
    [UBR, URF, UFL, ULB, DFR, DLF, DBL, DRB],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [UB, UR, UF, UL, DR, DF, DL, DB, FR, FL, BL, BR],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ),
  // R
  mk(
    [DFR, UFL, ULB, URF, DRB, DLF, DBL, UBR],
    [2, 0, 0, 1, 1, 0, 0, 2],
    [FR, UF, UL, UB, BR, DF, DL, DB, DR, FL, BL, UR],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ),
  // F
  mk(
    [UFL, DLF, ULB, UBR, URF, DFR, DBL, DRB],
    [1, 2, 0, 0, 2, 1, 0, 0],
    [UR, FL, UL, UB, DR, FR, DL, DB, UF, DF, BL, BR],
    [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0],
  ),
  // D
  mk(
    [URF, UFL, ULB, UBR, DLF, DBL, DRB, DFR],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [UR, UF, UL, UB, DF, DL, DB, DR, FR, FL, BL, BR],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ),
  // L
  mk(
    [URF, ULB, DBL, UBR, DFR, UFL, DLF, DRB],
    [0, 1, 2, 0, 0, 2, 1, 0],
    [UR, UF, BL, UB, DR, DF, FL, DB, FR, UL, DL, BR],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ),
  // B
  mk(
    [URF, UFL, UBR, DRB, DFR, DLF, ULB, DBL],
    [0, 0, 1, 2, 0, 0, 2, 1],
    [UR, UF, UL, BR, DR, DF, DL, BL, FR, FL, UB, DB],
    [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1],
  ),
];

/**
 * Le 18 mosse: indice = faccia * 3 + (potenza - 1).
 * 0=U 1=U2 2=U'  3=R 4=R2 5=R'  6=F ... 17=B'
 */
export const MOVE_CUBE: CubieCube[] = (() => {
  const out: CubieCube[] = [];
  for (let f = 0; f < 6; f++) {
    let cur = identityCube();
    for (let p = 0; p < 3; p++) {
      const next = identityCube();
      multiply(cur, BASIC_MOVE_CUBE[f], next);
      cur = next;
      out.push(cloneCube(cur));
    }
  }
  return out;
})();

/** Applica una mossa (indice 0..17) restituendo un nuovo cubo. */
export function applyMoveIndex(c: CubieCube, moveIndex: number): CubieCube {
  const out = identityCube();
  return multiply(c, MOVE_CUBE[moveIndex], out);
}

/** Applica una mossa in-place su `c` (usa un buffer temporaneo interno). */
const _tmp = identityCube();
export function applyMoveInPlace(c: CubieCube, moveIndex: number): void {
  multiply(c, MOVE_CUBE[moveIndex], _tmp);
  c.cp.set(_tmp.cp);
  c.co.set(_tmp.co);
  c.ep.set(_tmp.ep);
  c.eo.set(_tmp.eo);
}

/* ------------------------------------------------------------------ */
/* Conversione facelet <-> cubie                                       */
/* ------------------------------------------------------------------ */

/**
 * Stato facelet: array di 54 Face (il "colore" di ogni sticker espresso come
 * la faccia a cui quel colore appartiene, cioe' il colore del suo centro).
 */
export type FaceletState = Face[];

export function cubieToFacelet(c: CubieCube): FaceletState {
  const f: Face[] = new Array(54);
  // centri
  for (let i = 0; i < 6; i++) f[i * 9 + 4] = i as Face;
  for (let i = 0; i < CORNER_COUNT; i++) {
    const piece = c.cp[i];
    const ori = c.co[i];
    for (let k = 0; k < 3; k++) {
      f[CORNER_FACELET[i][(k + ori) % 3]] = CORNER_FACE[piece][k];
    }
  }
  for (let i = 0; i < EDGE_COUNT; i++) {
    const piece = c.ep[i];
    const ori = c.eo[i];
    for (let k = 0; k < 2; k++) {
      f[EDGE_FACELET[i][(k + ori) % 2]] = EDGE_FACE[piece][k];
    }
  }
  return f;
}

export class FaceletParseError extends Error {
  constructor(
    message: string,
    /** Indici dei facelet sospetti (0..53), per evidenziarli nell'interfaccia. */
    public readonly suspects: number[] = [],
    /** Codice macchina, tradotto poi in linguaggio per bambini. */
    public readonly code: string = 'unknown',
  ) {
    super(message);
    this.name = 'FaceletParseError';
  }
}

/**
 * Converte 54 facelet in un CubieCube.
 * Non verifica la risolvibilita' (lo fa il validatore): verifica solo che i
 * pezzi siano riconoscibili.
 */
export function faceletToCubie(f: FaceletState): CubieCube {
  if (f.length !== 54) {
    throw new FaceletParseError('Servono 54 facelet', [], 'facelet_count');
  }
  const c = identityCube();

  for (let i = 0; i < CORNER_COUNT; i++) {
    const facelets = CORNER_FACELET[i];
    // Trova quale dei tre sticker sta su U o su D: definisce l'orientamento.
    let ori = 0;
    for (; ori < 3; ori++) {
      const col = f[facelets[ori]];
      if (col === Face.U || col === Face.D) break;
    }
    if (ori === 3) {
      throw new FaceletParseError(
        `Angolo ${i}: nessuno sticker alto/basso`,
        [...facelets],
        'corner_no_ud',
      );
    }
    const col1 = f[facelets[ori]];
    const col2 = f[facelets[(ori + 1) % 3]];
    const col3 = f[facelets[(ori + 2) % 3]];
    let found = -1;
    for (let j = 0; j < CORNER_COUNT; j++) {
      const cf = CORNER_FACE[j];
      if (cf[0] === col1 && cf[1] === col2 && cf[2] === col3) {
        found = j;
        break;
      }
    }
    if (found < 0) {
      throw new FaceletParseError(
        `Angolo ${i}: combinazione di colori inesistente`,
        [...facelets],
        'corner_unknown',
      );
    }
    c.cp[i] = found;
    c.co[i] = ori % 3;
  }

  for (let i = 0; i < EDGE_COUNT; i++) {
    const facelets = EDGE_FACELET[i];
    const a = f[facelets[0]];
    const b = f[facelets[1]];
    let found = -1;
    let ori = 0;
    for (let j = 0; j < EDGE_COUNT; j++) {
      const ef = EDGE_FACE[j];
      if (ef[0] === a && ef[1] === b) {
        found = j;
        ori = 0;
        break;
      }
      if (ef[0] === b && ef[1] === a) {
        found = j;
        ori = 1;
        break;
      }
    }
    if (found < 0) {
      throw new FaceletParseError(
        `Spigolo ${i}: combinazione di colori inesistente`,
        [...facelets],
        'edge_unknown',
      );
    }
    c.ep[i] = found;
    c.eo[i] = ori;
  }

  return c;
}
