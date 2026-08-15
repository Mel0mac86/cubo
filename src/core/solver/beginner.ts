/**
 * Solver "a strati" (layer by layer) — quello che segue davvero il bambino.
 *
 * Kociemba trova la soluzione piu' corta, ma le sue mosse sembrano magia: non
 * c'e' modo di spiegare a un bambino di nove anni PERCHE' si fa quella mossa.
 * Il metodo a strati e' piu' lungo (in media 100-130 mosse) ma ogni fase ha un
 * obiettivo che si vede a occhio nudo, ed e' esattamente la stessa progressione
 * dei livelli della modalita' "Impara":
 *
 *   1. la croce sotto            -> Livello 2
 *   2. il primo piano completo   -> Livello 3
 *   3. il piano di mezzo         -> Livello 4
 *   4/5/6/7. l'ultimo piano      -> Livello 5
 *
 * Ogni fase e' risolta con la ricerca di stageSearch: l'obiettivo include
 * sempre "non rovinare quello che e' gia' a posto", quindi una fase completata
 * resta completata.
 */

import { CubieCube, cloneCube, isSolved } from '../cube/cubie';
import { Corner, Edge, Face, SIDE_FACES } from '../cube/defs';
import { Move, alg, applyMoves, parseMoves, rotateMoves, simplifyMoves } from '../cube/moves';
import { StageFailure, StageOption, expand, searchStage } from './stageSearch';

export type StageId =
  | 'cross'
  | 'firstLayer'
  | 'secondLayer'
  | 'topCross'
  | 'topCorners'
  | 'cornerPlaces'
  | 'edgePlaces';

export interface SolutionStage {
  id: StageId;
  /** Titolo per il bambino. */
  title: string;
  /** Che cosa stiamo ottenendo, spiegato semplice. */
  goal: string;
  /** Livello della modalita' "Impara" a cui corrisponde questa fase. */
  learnLevel: number;
  moves: Move[];
}

export interface BeginnerSolution {
  stages: SolutionStage[];
  moves: Move[];
}

const STAGE_INFO: Record<StageId, { title: string; goal: string; learnLevel: number }> = {
  cross: {
    title: 'La croce',
    goal: 'Facciamo una croce sulla faccia di sotto.',
    learnLevel: 2,
  },
  firstLayer: {
    title: 'Il primo piano',
    goal: 'Mettiamo a posto i quattro angolini di sotto.',
    learnLevel: 3,
  },
  secondLayer: {
    title: 'Il piano di mezzo',
    goal: 'Sistemiamo la fascia in mezzo al cubo.',
    learnLevel: 4,
  },
  topCross: {
    title: 'La croce in cima',
    goal: 'Disegniamo una croce anche sulla faccia di sopra.',
    learnLevel: 5,
  },
  topCorners: {
    title: 'Il tetto colorato',
    goal: 'Giriamo gli angolini in cima finche sono tutti dello stesso colore.',
    learnLevel: 5,
  },
  cornerPlaces: {
    title: 'Angolini al loro posto',
    goal: 'Spostiamo gli angolini in cima nella casa giusta.',
    learnLevel: 5,
  },
  edgePlaces: {
    title: 'Ultimo pezzo!',
    goal: 'Sistemiamo gli ultimi pezzi laterali: il cubo e finito!',
    learnLevel: 5,
  },
};

/* ------------------------------------------------------------------ */
/* Obiettivi                                                           */
/* ------------------------------------------------------------------ */

const D_EDGES = [Edge.DF, Edge.DR, Edge.DB, Edge.DL];
const D_CORNERS = [Corner.DFR, Corner.DRB, Corner.DBL, Corner.DLF];
const MID_EDGES = [Edge.FR, Edge.BR, Edge.BL, Edge.FL];
const U_EDGES = [Edge.UR, Edge.UF, Edge.UL, Edge.UB];
const U_CORNERS = [Corner.URF, Corner.UFL, Corner.ULB, Corner.UBR];

function edgesSolved(c: CubieCube, edges: number[]): boolean {
  for (const e of edges) if (c.ep[e] !== e || c.eo[e] !== 0) return false;
  return true;
}

function cornersSolved(c: CubieCube, corners: number[]): boolean {
  for (const k of corners) if (c.cp[k] !== k || c.co[k] !== 0) return false;
  return true;
}

/** Posizione attuale di uno spigolo (indice di slot). */
function edgePosition(c: CubieCube, edge: number): number {
  for (let i = 0; i < 12; i++) if (c.ep[i] === edge) return i;
  return -1;
}

/** Posizione attuale di un angolo. */
function cornerPosition(c: CubieCube, corner: number): number {
  for (let i = 0; i < 8; i++) if (c.cp[i] === corner) return i;
  return -1;
}

/* ------------------------------------------------------------------ */
/* Insiemi di mosse permesse                                           */
/* ------------------------------------------------------------------ */

const ALL_18: StageOption[] = (() => {
  const out: StageOption[] = [];
  for (const n of ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2', 'D', "D'", 'D2', 'L', "L'", 'L2', 'B', "B'", 'B2']) {
    out.push({ name: n, moves: parseMoves(n) });
  }
  return out;
})();

const AUF: StageOption[] = ['U', "U'", 'U2'].map((n) => ({ name: n, moves: parseMoves(n) }));

/** Costruisce le quattro versioni ruotate di un algoritmo relativo. */
function fourWays(name: string, notation: string): StageOption[] {
  return [0, 1, 2, 3].map((k) => ({
    name: `${name}@${SIDE_FACES[k]}`,
    moves: alg(notation, k),
  }));
}

/** Inserimento di un angolo dall'alto nel suo posto in basso a destra-davanti. */
const CORNER_INSERTS: StageOption[] = [
  ...fourWays('ins-destra', "R U R'"),
  ...fourWays('ins-sinistra', "F' U' F"),
  ...fourWays('ins-alto', "R U2 R' U' R U R'"),
  ...fourWays('ins-alto2', "F' U2 F U F' U' F"),
  ...fourWays('estrai', "R U' R'"),
];

/** Inserimento di uno spigolo del piano di mezzo (destra e sinistra). */
const EDGE_INSERTS: StageOption[] = [
  ...fourWays('mezzo-destra', "U R U' R' U' F' U F"),
  ...fourWays('mezzo-sinistra', "U' L' U L U F U' F'"),
];

const TOP_CROSS_ALGS: StageOption[] = fourWays('croce-alto', "F R U R' U' F'");

const TOP_CORNER_ALGS: StageOption[] = [
  ...fourWays('sune', "R U R' U R U2 R'"),
  ...fourWays('antisune', "R U2 R' U' R U' R'"),
];

const CORNER_PERM_ALGS: StageOption[] = [
  ...fourWays('scambia-angoli-a', "R' F R' B2 R F' R' B2 R2"),
  ...fourWays('scambia-angoli-b', "R2 B2 R F R' B2 R F' R"),
];

const EDGE_PERM_ALGS: StageOption[] = [
  ...fourWays('scambia-spigoli-a', "R U' R U R U R U' R' U' R2"),
  ...fourWays('scambia-spigoli-b', "R2 U R U R' U' R' U' R' U R'"),
];

/* ------------------------------------------------------------------ */
/* Il solver                                                           */
/* ------------------------------------------------------------------ */

export function solveBeginner(start: CubieCube): BeginnerSolution {
  const cube = cloneCube(start);
  const stages: SolutionStage[] = [];

  const run = (id: StageId, moves: Move[]): void => {
    const simplified = simplifyMoves(moves);
    if (simplified.length === 0 && stages.every((s) => s.id !== id)) {
      // Fase gia' a posto: la registriamo comunque, cosi il bambino vede
      // "questa parte era gia' fatta!" invece di un salto inspiegabile.
      stages.push({ id, ...STAGE_INFO[id], moves: [] });
      return;
    }
    const existing = stages.find((s) => s.id === id);
    if (existing) existing.moves = simplifyMoves([...existing.moves, ...simplified]);
    else stages.push({ id, ...STAGE_INFO[id], moves: simplified });
  };

  const step = (
    id: StageId,
    options: StageOption[],
    goal: (c: CubieCube) => boolean,
    maxDepth: number,
    label: string,
  ): void => {
    if (goal(cube)) {
      run(id, []);
      return;
    }
    const found = searchStage(cube, { options, goal, maxDepth });
    if (!found) throw new StageFailure(label);
    const moves = expand(found);
    applyIn(cube, moves);
    run(id, moves);
  };

  /* --- 1. la croce sotto, uno spigolo alla volta --- */
  const doneEdges: number[] = [];
  for (const target of D_EDGES) {
    // 1a. portalo in cima (se non ci e' gia'), senza rovinare la croce fatta
    step(
      'cross',
      ALL_18,
      (c) =>
        edgesSolved(c, doneEdges) &&
        (edgePosition(c, target) < 4 || (c.ep[target] === target && c.eo[target] === 0)),
      3,
      'croce (porta in cima)',
    );
    // 1b. inseriscilo
    step('cross', ALL_18, (c) => edgesSolved(c, [...doneEdges, target]), 4, 'croce (inserisci)');
    doneEdges.push(target);
  }

  /* --- 2. gli angoli del primo piano --- */
  const doneCorners: number[] = [];
  for (const target of D_CORNERS) {
    step(
      'firstLayer',
      [...AUF, ...CORNER_INSERTS],
      (c) =>
        edgesSolved(c, D_EDGES) &&
        cornersSolved(c, [...doneCorners, target]),
      4,
      'primo piano',
    );
    doneCorners.push(target);
  }

  /* --- 3. il piano di mezzo --- */
  const doneMid: number[] = [];
  for (const target of MID_EDGES) {
    step(
      'secondLayer',
      [...AUF, ...EDGE_INSERTS],
      (c) =>
        edgesSolved(c, D_EDGES) &&
        cornersSolved(c, D_CORNERS) &&
        edgesSolved(c, [...doneMid, target]),
      4,
      'piano di mezzo',
    );
    doneMid.push(target);
  }

  const firstTwoLayers = (c: CubieCube) =>
    edgesSolved(c, D_EDGES) && cornersSolved(c, D_CORNERS) && edgesSolved(c, MID_EDGES);

  /* --- 4. la croce in cima (orientamento degli spigoli) --- */
  step(
    'topCross',
    [...AUF, ...TOP_CROSS_ALGS],
    (c) => firstTwoLayers(c) && U_EDGES.every((e) => c.eo[e] === 0),
    5,
    'croce in cima',
  );

  /* --- 5. gli angoli in cima girati bene --- */
  step(
    'topCorners',
    [...AUF, ...TOP_CORNER_ALGS],
    (c) =>
      firstTwoLayers(c) &&
      U_EDGES.every((e) => c.eo[e] === 0) &&
      U_CORNERS.every((k) => c.co[k] === 0),
    6,
    'angoli in cima',
  );

  /* --- 6. gli angoli in cima al posto giusto --- */
  step(
    'cornerPlaces',
    [...AUF, ...CORNER_PERM_ALGS],
    (c) =>
      firstTwoLayers(c) &&
      U_EDGES.every((e) => c.eo[e] === 0) &&
      cornersSolved(c, U_CORNERS),
    5,
    'angoli al posto giusto',
  );

  /* --- 7. gli ultimi spigoli --- */
  step('edgePlaces', [...AUF, ...EDGE_PERM_ALGS], (c) => isSolved(c), 5, 'ultimi spigoli');

  if (!isSolved(cube)) throw new StageFailure('finale');

  const moves = stages.flatMap((s) => s.moves);
  return { stages, moves };
}

function applyIn(c: CubieCube, moves: Move[]): void {
  const next = applyMoves(c, moves);
  c.cp.set(next.cp);
  c.co.set(next.co);
  c.ep.set(next.ep);
  c.eo.set(next.eo);
}

/** Solo per compatibilita' con il resto del codice. */
export { rotateMoves };
export type { CubieCube, Face };
