/**
 * Piccolo motore di ricerca a tappe.
 *
 * Il solver per bambini non usa una ricerca gigantesca: risolve il cubo un
 * pezzetto alla volta. Per ogni pezzetto cerca la combinazione piu' corta di
 * "mosse permesse" (mosse singole oppure interi algoritmi noti) che raggiunge
 * l'obiettivo SENZA rovinare quello che e' gia' a posto.
 *
 * Il vantaggio rispetto a scrivere a mano tutti i casi e' che la correttezza
 * e' garantita per costruzione: se la ricerca restituisce qualcosa, quel
 * qualcosa soddisfa l'obiettivo. Se non restituisce niente, ce ne accorgiamo
 * subito invece di produrre una soluzione sbagliata.
 */

import { CubieCube, applyMoveInPlace, cloneCube } from '../cube/cubie';
import { Move, moveIndex, invertMove } from '../cube/moves';

export interface StageOption {
  /** Nome leggibile, utile per il debug e per la modalita' avanzata. */
  name: string;
  moves: Move[];
}

export interface StageSearchParams {
  options: StageOption[];
  goal: (c: CubieCube) => boolean;
  maxDepth: number;
}

/** Applica le mosse in-place. */
function applyIn(c: CubieCube, moves: Move[]): void {
  for (const m of moves) applyMoveInPlace(c, moveIndex(m));
}

/** Annulla le mosse in-place (le riapplica al contrario). */
function undoIn(c: CubieCube, moves: Move[]): void {
  for (let i = moves.length - 1; i >= 0; i--) applyMoveInPlace(c, moveIndex(invertMove(moves[i])));
}

/**
 * Ricerca in profondita' iterativa. Restituisce la sequenza di opzioni piu'
 * corta che soddisfa `goal`, oppure null se non ne esiste una entro `maxDepth`.
 */
export function searchStage(
  start: CubieCube,
  { options, goal, maxDepth }: StageSearchParams,
): StageOption[] | null {
  const cube = cloneCube(start);
  if (goal(cube)) return [];

  const path: StageOption[] = [];

  const dfs = (depth: number, limit: number): boolean => {
    if (depth === limit) return goal(cube);
    for (const opt of options) {
      applyIn(cube, opt.moves);
      path.push(opt);
      // Controlliamo anche i nodi intermedi: cosi troviamo subito le soluzioni
      // piu' corte senza dover ripartire da capo.
      if (goal(cube) || dfs(depth + 1, limit)) return true;
      path.pop();
      undoIn(cube, opt.moves);
    }
    return false;
  };

  for (let limit = 1; limit <= maxDepth; limit++) {
    path.length = 0;
    if (dfs(0, limit)) return path.slice();
  }
  return null;
}

/** Espande una lista di opzioni nella sequenza di mosse corrispondente. */
export function expand(options: StageOption[]): Move[] {
  const out: Move[] = [];
  for (const o of options) out.push(...o.moves);
  return out;
}

export class StageFailure extends Error {
  constructor(public readonly stage: string) {
    super(`Non riesco a completare la fase "${stage}"`);
    this.name = 'StageFailure';
  }
}
