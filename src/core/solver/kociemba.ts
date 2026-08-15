/**
 * Solver two-phase di Kociemba.
 *
 * Fase 1: porta il cubo nel sottogruppo <U, D, R2, L2, F2, B2> (orientamenti
 *         a posto e spigoli centrali nella fascia centrale).
 * Fase 2: risolve restando dentro quel sottogruppo.
 *
 * Entrambe le fasi usano IDA* con tabelle di potatura. Il risultato non e'
 * garantito ottimale, ma nella pratica sta quasi sempre sotto le 23 mosse:
 * per l'app e' piu' che sufficiente (la modalita' bambino usa comunque il
 * solver a strati, molto piu' lungo ma comprensibile).
 */

import { CubieCube, cloneCube } from '../cube/cubie';
import { Move, moveFromIndex, applyMoves } from '../cube/moves';
import { isSolved } from '../cube/cubie';
import {
  getCornPerm,
  getFlip,
  getSlice,
  getSliceSorted,
  getTwist,
  getUdEdgePerm,
  N_SLICE,
  N_SLICE_PERM,
} from './coord';
import { N_MOVE, N_MOVE2, PHASE2_MOVES, SolverTables, getTables } from './tables';

export interface KociembaOptions {
  /** Lunghezza massima accettata per la soluzione. */
  maxLength?: number;
  /**
   * Appena si trova una soluzione lunga al massimo cosi', ci si ferma.
   * Abbassarlo produce soluzioni piu' corte ma richiede piu' tempo.
   */
  targetLength?: number;
  /** Millisecondi oltre i quali ci si accontenta della migliore trovata. */
  timeoutMs?: number;
  /** Profondita' massima esplorata in fase 1. */
  maxPhase1Depth?: number;
  onProgress?: (frac: number, label: string) => void;
}

export interface KociembaResult {
  moves: Move[];
  /** Numero di mosse della fase 1 (le altre sono di fase 2). */
  phase1Length: number;
  elapsedMs: number;
}

/** true se una mossa e' ridondante dopo `prev` (stessa faccia o coppia opposta invertita). */
function pruneMove(prev: number, move: number): boolean {
  if (prev < 0) return false;
  const pf = (prev / 3) | 0;
  const mf = (move / 3) | 0;
  if (pf === mf) return true;
  // Per le coppie di facce opposte ammettiamo un solo ordine (evita duplicati).
  if (pf === mf + 3) return true;
  return false;
}

export function solveKociemba(cube: CubieCube, opts: KociembaOptions = {}): KociembaResult {
  const maxLength = opts.maxLength ?? 25;
  const targetLength = opts.targetLength ?? 22;
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const maxPhase1Depth = opts.maxPhase1Depth ?? 13;
  const started = Date.now();

  if (isSolved(cube)) {
    return { moves: [], phase1Length: 0, elapsedMs: 0 };
  }

  const t = getTables(opts.onProgress);

  let bestMoves: number[] | null = null;
  let bestPhase1 = 0;

  // Stato della fase 1 lungo il cammino di ricerca.
  const twistStack = new Int32Array(maxPhase1Depth + 1);
  const flipStack = new Int32Array(maxPhase1Depth + 1);
  const sliceStack = new Int32Array(maxPhase1Depth + 1);
  const moveStack = new Int32Array(maxPhase1Depth + 1);

  twistStack[0] = getTwist(cube);
  flipStack[0] = getFlip(cube);
  sliceStack[0] = getSlice(cube);

  const timedOut = () => Date.now() - started > timeoutMs;

  /** Ricerca di fase 2 (IDA*), ritorna le mosse o null. */
  function searchPhase2(start: CubieCube, maxDepth: number): number[] | null {
    if (maxDepth < 0) return null;
    const cornPerm0 = getCornPerm(start);
    const udEdge0 = getUdEdgePerm(start);
    const slicePerm0 = getSliceSorted(start) % N_SLICE_PERM;

    const path = new Int32Array(20);

    const h = (cp: number, ue: number, sp: number) =>
      Math.max(t.prunCornSlice[cp * N_SLICE_PERM + sp], t.prunUdEdgeSlice[ue * N_SLICE_PERM + sp]);

    const dfs = (
      cp: number,
      ue: number,
      sp: number,
      depth: number,
      limit: number,
      prevMove: number,
    ): number[] | null => {
      if (cp === 0 && ue === 0 && sp === 0) {
        return Array.from(path.subarray(0, depth));
      }
      if (depth >= limit) return null;
      if (h(cp, ue, sp) > limit - depth) return null;
      for (let mi = 0; mi < N_MOVE2; mi++) {
        const move = PHASE2_MOVES[mi];
        if (pruneMove(prevMove, move)) continue;
        const ncp = t.cornPermMove[cp * N_MOVE2 + mi];
        const nue = t.udEdgeMove[ue * N_MOVE2 + mi];
        const nsp = t.slicePermMove[sp * N_MOVE2 + mi];
        path[depth] = move;
        const r = dfs(ncp, nue, nsp, depth + 1, limit, move);
        if (r) return r;
      }
      return null;
    };

    const start2 = h(cornPerm0, udEdge0, slicePerm0);
    for (let limit = start2; limit <= maxDepth; limit++) {
      const r = dfs(cornPerm0, udEdge0, slicePerm0, 0, limit, -1);
      if (r) return r;
    }
    return null;
  }

  /**
   * Fase 1: DFS di profondita' esatta `limit`. Ogni foglia che sta nel
   * sottogruppo viene passata alla fase 2.
   *
   * Il livello `limit` viene sempre esplorato per intero (cosi la soluzione
   * migliore a quella profondita' non sfugge); l'unica interruzione anticipata
   * e' il tempo scaduto. La decisione "mi fermo qui" sta nel ciclo esterno.
   * Ritorna true per interrompere tutta la ricerca.
   */
  function searchPhase1(depth: number, limit: number, prevMove: number): boolean {
    const twist = twistStack[depth];
    const flip = flipStack[depth];
    const slice = sliceStack[depth];

    if (depth === limit) {
      // Foglia: se siamo entrati nel sottogruppo, proviamo a chiudere in fase 2.
      if (twist === 0 && flip === 0 && slice === 0) tryPhase2(depth);
      return bestMoves !== null && timedOut();
    }

    const lower = Math.max(
      t.prunTwistSlice[twist * N_SLICE + slice],
      t.prunFlipSlice[flip * N_SLICE + slice],
    );
    if (lower > limit - depth) return false;

    for (let m = 0; m < N_MOVE; m++) {
      if (pruneMove(prevMove, m)) continue;
      twistStack[depth + 1] = t.twistMove[twist * N_MOVE + m];
      flipStack[depth + 1] = t.flipMove[flip * N_MOVE + m];
      sliceStack[depth + 1] = t.sliceMove[slice * N_MOVE + m];
      moveStack[depth] = m;
      if (searchPhase1(depth + 1, limit, m)) return true;
    }
    return false;
  }

  function tryPhase2(phase1Len: number): void {
    const p1 = Array.from(moveStack.subarray(0, phase1Len));
    const afterP1 = applyMoves(cube, p1.map(moveFromIndex));
    // Cerchiamo solo miglioramenti rispetto alla migliore soluzione nota.
    const cap = bestMoves ? bestMoves.length - 1 : maxLength;
    const budget = Math.min(18, cap - phase1Len);
    const p2 = searchPhase2(afterP1, budget);
    if (!p2) return;
    const total = p1.concat(p2);
    if (!bestMoves || total.length < bestMoves.length) {
      bestMoves = total;
      bestPhase1 = phase1Len;
    }
  }

  for (let limit = 0; limit <= maxPhase1Depth; limit++) {
    if (bestMoves) {
      // Con fase 1 lunga `limit` nessuna soluzione puo' essere piu' corta di `limit`.
      if (bestMoves.length <= limit) break;
      if (bestMoves.length <= targetLength) break;
      if (timedOut()) break;
    }
    opts.onProgress?.(Math.min(0.99, limit / maxPhase1Depth), 'Cerco la strada piu corta');
    if (searchPhase1(0, limit, -1)) break;
  }

  if (!bestMoves) {
    throw new Error(
      'Nessuna soluzione trovata entro i limiti impostati (cubo valido ma ricerca troncata).',
    );
  }

  return {
    moves: (bestMoves as number[]).map(moveFromIndex),
    phase1Length: bestPhase1,
    elapsedMs: Date.now() - started,
  };
}

/** Comodo per i test e per la modalita' esperto. */
export function solveKociembaMoves(cube: CubieCube, opts?: KociembaOptions): Move[] {
  return solveKociemba(cloneCube(cube), opts).moves;
}
