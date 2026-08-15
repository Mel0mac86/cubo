/**
 * Definizioni base del Cubo di Rubik 3x3x3.
 *
 * Modello standard (Kociemba):
 *  - Facce nell'ordine U, R, F, D, L, B
 *  - 54 facelet numerati 0..53: U1..U9 = 0..8, R1..R9 = 9..17, F = 18..26,
 *    D = 27..35, L = 36..44, B = 45..53
 *  - 8 angoli (corner) e 12 spigoli (edge) con permutazione + orientamento
 *
 * Questo file non contiene niente di "per bambini": e' il cuore matematico.
 * La traduzione in linguaggio semplice avviene in src/core/kids/.
 */

/** Le sei facce, nell'ordine canonico. */
export enum Face {
  U = 0,
  R = 1,
  F = 2,
  D = 3,
  L = 4,
  B = 5,
}

export const FACE_ORDER: Face[] = [Face.U, Face.R, Face.F, Face.D, Face.L, Face.B];
export const FACE_NAMES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type FaceName = (typeof FACE_NAMES)[number];

/** Faccia opposta a una data faccia. */
export const OPPOSITE_FACE: Record<Face, Face> = {
  [Face.U]: Face.D,
  [Face.D]: Face.U,
  [Face.R]: Face.L,
  [Face.L]: Face.R,
  [Face.F]: Face.B,
  [Face.B]: Face.F,
};

/** Le quattro facce laterali in ordine orario guardando dall'alto: F, R, B, L. */
export const SIDE_FACES: Face[] = [Face.F, Face.R, Face.B, Face.L];

/** Gli 8 angoli. Il nome elenca le facce in senso ORARIO. */
export enum Corner {
  URF = 0,
  UFL = 1,
  ULB = 2,
  UBR = 3,
  DFR = 4,
  DLF = 5,
  DBL = 6,
  DRB = 7,
}

export const CORNER_COUNT = 8;

/** I 12 spigoli. */
export enum Edge {
  UR = 0,
  UF = 1,
  UL = 2,
  UB = 3,
  DR = 4,
  DF = 5,
  DL = 6,
  DB = 7,
  FR = 8,
  FL = 9,
  BL = 10,
  BR = 11,
}

export const EDGE_COUNT = 12;

/**
 * Facelet occupati da ciascun angolo, nello stesso ordine ciclico del nome.
 * cornerFacelet[URF] = [U9, R1, F3]
 */
export const CORNER_FACELET: readonly (readonly [number, number, number])[] = [
  [8, 9, 20], // URF
  [6, 18, 38], // UFL
  [0, 36, 47], // ULB
  [2, 45, 11], // UBR
  [29, 26, 15], // DFR
  [27, 44, 24], // DLF
  [33, 53, 42], // DBL
  [35, 17, 51], // DRB
];

/** Facelet occupati da ciascuno spigolo. */
export const EDGE_FACELET: readonly (readonly [number, number])[] = [
  [5, 10], // UR
  [7, 19], // UF
  [3, 37], // UL
  [1, 46], // UB
  [32, 16], // DR
  [28, 25], // DF
  [30, 43], // DL
  [34, 52], // DB
  [23, 12], // FR
  [21, 41], // FL
  [50, 39], // BL
  [48, 14], // BR
];

/** Facce (quindi colori-centro) che compongono ciascun angolo, stesso ordine. */
export const CORNER_FACE: readonly (readonly [Face, Face, Face])[] = [
  [Face.U, Face.R, Face.F],
  [Face.U, Face.F, Face.L],
  [Face.U, Face.L, Face.B],
  [Face.U, Face.B, Face.R],
  [Face.D, Face.F, Face.R],
  [Face.D, Face.L, Face.F],
  [Face.D, Face.B, Face.L],
  [Face.D, Face.R, Face.B],
];

/** Facce che compongono ciascuno spigolo. */
export const EDGE_FACE: readonly (readonly [Face, Face])[] = [
  [Face.U, Face.R],
  [Face.U, Face.F],
  [Face.U, Face.L],
  [Face.U, Face.B],
  [Face.D, Face.R],
  [Face.D, Face.F],
  [Face.D, Face.L],
  [Face.D, Face.B],
  [Face.F, Face.R],
  [Face.F, Face.L],
  [Face.B, Face.L],
  [Face.B, Face.R],
];

/** Trova l'indice dello spigolo dato l'insieme (non ordinato) delle sue due facce. */
export function edgeByFaces(a: Face, b: Face): Edge {
  for (let i = 0; i < EDGE_COUNT; i++) {
    const [x, y] = EDGE_FACE[i];
    if ((x === a && y === b) || (x === b && y === a)) return i as Edge;
  }
  throw new Error(`Nessuno spigolo con facce ${a},${b}`);
}

/** Trova l'indice dell'angolo dato l'insieme (non ordinato) delle sue tre facce. */
export function cornerByFaces(a: Face, b: Face, c: Face): Corner {
  const want = [a, b, c].slice().sort().join(',');
  for (let i = 0; i < CORNER_COUNT; i++) {
    const got = CORNER_FACE[i].slice().sort().join(',');
    if (got === want) return i as Corner;
  }
  throw new Error(`Nessun angolo con facce ${a},${b},${c}`);
}

/** I sei colori "logici" del cubo, associati stabilmente alle facce. */
export enum CubeColor {
  White = 0,
  Red = 1,
  Green = 2,
  Yellow = 3,
  Orange = 4,
  Blue = 5,
}

export const COLOR_COUNT = 6;

export const COLOR_KEYS = ['white', 'red', 'green', 'yellow', 'orange', 'blue'] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

/** Nomi in italiano, pensati per essere letti da Rubi. */
export const COLOR_LABEL_IT: Record<CubeColor, string> = {
  [CubeColor.White]: 'bianco',
  [CubeColor.Red]: 'rosso',
  [CubeColor.Green]: 'verde',
  [CubeColor.Yellow]: 'giallo',
  [CubeColor.Orange]: 'arancione',
  [CubeColor.Blue]: 'blu',
};

export const COLOR_EMOJI: Record<CubeColor, string> = {
  [CubeColor.White]: '⚪',
  [CubeColor.Red]: '🔴',
  [CubeColor.Green]: '🟢',
  [CubeColor.Yellow]: '🟡',
  [CubeColor.Orange]: '🟠',
  [CubeColor.Blue]: '🔵',
};

/** Colore RGB usato per disegnare ogni colore (schema classico ad alto contrasto). */
export const COLOR_HEX: Record<CubeColor, string> = {
  [CubeColor.White]: '#F8FAFC',
  [CubeColor.Red]: '#E11D2E',
  [CubeColor.Green]: '#16A34A',
  [CubeColor.Yellow]: '#FACC15',
  [CubeColor.Orange]: '#F97316',
  [CubeColor.Blue]: '#1D4ED8',
};
