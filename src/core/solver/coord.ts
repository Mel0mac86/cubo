/**
 * Coordinate del cubo per l'algoritmo two-phase di Kociemba.
 *
 * Fase 1  (gruppo completo -> <U,D,R2,L2,F2,B2>):
 *   - twist      orientamento degli angoli          0..2186   (3^7)
 *   - flip       orientamento degli spigoli         0..2047   (2^11)
 *   - slice      posizione dei 4 spigoli centrali   0..494    (12 su 4)
 *
 * Fase 2  (dentro il sottogruppo -> cubo risolto):
 *   - cornPerm   permutazione degli 8 angoli        0..40319  (8!)
 *   - udEdgePerm permutazione degli 8 spigoli U/D   0..40319  (8!)
 *   - slicePerm  permutazione dei 4 spigoli centrali 0..23    (4!)
 */

import { CubieCube, identityCube } from '../cube/cubie';
import { Corner, Edge } from '../cube/defs';

export const N_TWIST = 2187;
export const N_FLIP = 2048;
export const N_SLICE = 495;
export const N_SLICE_SORTED = 11880; // 495 * 24
export const N_CORN_PERM = 40320;
export const N_UD_EDGE_PERM = 40320;
export const N_SLICE_PERM = 24;

/** Coefficiente binomiale, precalcolato per n,k <= 12. */
const CNK: number[][] = (() => {
  const t: number[][] = [];
  for (let n = 0; n <= 12; n++) {
    t[n] = [];
    for (let k = 0; k <= 12; k++) {
      if (k > n) t[n][k] = 0;
      else if (k === 0 || k === n) t[n][k] = 1;
      else t[n][k] = t[n - 1][k - 1] + t[n - 1][k];
    }
  }
  return t;
})();

export function cnk(n: number, k: number): number {
  if (k < 0 || n < 0 || k > n) return 0;
  return CNK[n][k];
}

function rotateLeft(arr: Int8Array | number[], l: number, r: number): void {
  const tmp = arr[l];
  for (let i = l; i < r; i++) arr[i] = arr[i + 1];
  arr[r] = tmp;
}

function rotateRight(arr: Int8Array | number[], l: number, r: number): void {
  const tmp = arr[r];
  for (let i = r; i > l; i--) arr[i] = arr[i - 1];
  arr[l] = tmp;
}

/* ------------------------------------------------------------------ */
/* twist — orientamento angoli                                         */
/* ------------------------------------------------------------------ */

export function getTwist(c: CubieCube): number {
  let ret = 0;
  for (let i = Corner.URF; i < Corner.DRB; i++) ret = 3 * ret + c.co[i];
  return ret;
}

export function setTwist(c: CubieCube, twist: number): void {
  let parity = 0;
  let t = twist;
  for (let i = Corner.DRB - 1; i >= Corner.URF; i--) {
    const v = t % 3;
    c.co[i] = v;
    parity += v;
    t = Math.floor(t / 3);
  }
  c.co[Corner.DRB] = (3 - (parity % 3)) % 3;
}

/* ------------------------------------------------------------------ */
/* flip — orientamento spigoli                                         */
/* ------------------------------------------------------------------ */

export function getFlip(c: CubieCube): number {
  let ret = 0;
  for (let i = Edge.UR; i < Edge.BR; i++) ret = 2 * ret + c.eo[i];
  return ret;
}

export function setFlip(c: CubieCube, flip: number): void {
  let parity = 0;
  let t = flip;
  for (let i = Edge.BR - 1; i >= Edge.UR; i--) {
    const v = t % 2;
    c.eo[i] = v;
    parity += v;
    t = Math.floor(t / 2);
  }
  c.eo[Edge.BR] = (2 - (parity % 2)) % 2;
}

/* ------------------------------------------------------------------ */
/* sliceSorted — posizione E permutazione degli spigoli FR, FL, BL, BR */
/* ------------------------------------------------------------------ */

export function getSliceSorted(c: CubieCube): number {
  let a = 0;
  let x = 0;
  const edge4: number[] = [0, 0, 0, 0];
  for (let j = Edge.BR; j >= Edge.UR; j--) {
    if (c.ep[j] >= Edge.FR && c.ep[j] <= Edge.BR) {
      a += cnk(11 - j, x + 1);
      edge4[3 - x] = c.ep[j];
      x++;
    }
  }
  let b = 0;
  for (let j = 3; j > 0; j--) {
    let k = 0;
    while (edge4[j] !== j + 8) {
      rotateLeft(edge4, 0, j);
      k++;
    }
    b = (j + 1) * b + k;
  }
  return 24 * a + b;
}

export function setSliceSorted(c: CubieCube, idx: number): void {
  const sliceEdge = [Edge.FR, Edge.FL, Edge.BL, Edge.BR];
  const otherEdge = [Edge.DB, Edge.DL, Edge.DF, Edge.DR, Edge.UB, Edge.UL, Edge.UF, Edge.UR];
  let b = idx % 24;
  let a = Math.floor(idx / 24);
  for (let i = 0; i < 12; i++) c.ep[i] = -1;

  for (let j = 1; j < 4; j++) {
    let k = b % (j + 1);
    b = Math.floor(b / (j + 1));
    while (k-- > 0) rotateRight(sliceEdge, 0, j);
  }

  let x = 3;
  for (let j = 0; j < 12; j++) {
    if (a - cnk(11 - j, x + 1) >= 0) {
      c.ep[j] = sliceEdge[3 - x];
      a -= cnk(11 - j, x + 1);
      x--;
    }
  }
  x = 0;
  for (let j = 0; j < 12; j++) {
    if (c.ep[j] === -1) c.ep[j] = otherEdge[x++];
  }
}

/** Coordinata di fase 1: solo la combinazione, senza permutazione. */
export function getSlice(c: CubieCube): number {
  return Math.floor(getSliceSorted(c) / 24);
}

/* ------------------------------------------------------------------ */
/* cornPerm — permutazione degli 8 angoli                              */
/* ------------------------------------------------------------------ */

export function getCornPerm(c: CubieCube): number {
  const perm = Array.from(c.cp);
  let b = 0;
  for (let j = 7; j > 0; j--) {
    let k = 0;
    while (perm[j] !== j) {
      rotateLeft(perm, 0, j);
      k++;
    }
    b = (j + 1) * b + k;
  }
  return b;
}

export function setCornPerm(c: CubieCube, idx: number): void {
  const perm = [0, 1, 2, 3, 4, 5, 6, 7];
  let t = idx;
  for (let j = 1; j < 8; j++) {
    let k = t % (j + 1);
    t = Math.floor(t / (j + 1));
    while (k-- > 0) rotateRight(perm, 0, j);
  }
  for (let j = 7; j >= 0; j--) c.cp[j] = perm[j];
}

/* ------------------------------------------------------------------ */
/* udEdgePerm — permutazione degli 8 spigoli U/D (valida in fase 2)    */
/* ------------------------------------------------------------------ */

export function getUdEdgePerm(c: CubieCube): number {
  const perm = Array.from(c.ep).slice(0, 8);
  let b = 0;
  for (let j = 7; j > 0; j--) {
    let k = 0;
    while (perm[j] !== j) {
      rotateLeft(perm, 0, j);
      k++;
    }
    b = (j + 1) * b + k;
  }
  return b;
}

export function setUdEdgePerm(c: CubieCube, idx: number): void {
  const perm = [0, 1, 2, 3, 4, 5, 6, 7];
  let t = idx;
  for (let j = 1; j < 8; j++) {
    let k = t % (j + 1);
    t = Math.floor(t / (j + 1));
    while (k-- > 0) rotateRight(perm, 0, j);
  }
  for (let j = 7; j >= 0; j--) c.ep[j] = perm[j];
}

/** Cubo "vuoto" usato come appoggio nei generatori di tabelle. */
export function scratchCube(): CubieCube {
  return identityCube();
}
