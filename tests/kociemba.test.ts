import { describe, it, expect, beforeAll } from 'vitest';
import { identityCube, isSolved } from '../src/core/cube/cubie';
import { applyMoves, movesToString, parseMoves } from '../src/core/cube/moves';
import { makeRng, scrambledCube } from '../src/core/cube/scramble';
import { solveKociemba } from '../src/core/solver/kociemba';
import { getTables } from '../src/core/solver/tables';

describe('solver Kociemba', () => {
  beforeAll(() => {
    const t0 = Date.now();
    getTables();
    // eslint-disable-next-line no-console
    console.log(`  tabelle costruite in ${Date.now() - t0} ms`);
  });

  it('sul cubo gia risolto restituisce zero mosse', () => {
    const r = solveKociemba(identityCube());
    expect(r.moves).toHaveLength(0);
  });

  it('risolve un cubo con una sola mossa', () => {
    const cube = applyMoves(identityCube(), parseMoves('R'));
    const r = solveKociemba(cube);
    expect(isSolved(applyMoves(cube, r.moves))).toBe(true);
    expect(r.moves).toHaveLength(1);
  });

  it('risolve il superflip', () => {
    // Il superflip: tutti gli spigoli girati. Serve almeno 20 mosse.
    const superflip = parseMoves(
      "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2",
    );
    const cube = applyMoves(identityCube(), superflip);
    const r = solveKociemba(cube, { maxLength: 25, timeoutMs: 30_000 });
    expect(isSolved(applyMoves(cube, r.moves))).toBe(true);
  });

  it('risolve 100 cubi casuali e la soluzione riporta davvero al cubo risolto', () => {
    const rng = makeRng(31337);
    let total = 0;
    let worst = 0;
    for (let i = 0; i < 100; i++) {
      const cube = scrambledCube(30, rng);
      const r = solveKociemba(cube, { maxLength: 25, timeoutMs: 5_000 });
      const solved = applyMoves(cube, r.moves);
      if (!isSolved(solved)) {
        throw new Error(`Soluzione errata al tentativo ${i}: ${movesToString(r.moves)}`);
      }
      expect(r.moves.length).toBeLessThanOrEqual(25);
      total += r.moves.length;
      worst = Math.max(worst, r.moves.length);
    }
    // eslint-disable-next-line no-console
    console.log(`  media ${(total / 100).toFixed(1)} mosse, peggiore ${worst}`);
    expect(total / 100).toBeLessThan(22);
  });

  it('la fase 1 usa solo mosse che portano nel sottogruppo', () => {
    const cube = scrambledCube(25, makeRng(5));
    const r = solveKociemba(cube);
    const phase1 = r.moves.slice(0, r.phase1Length);
    const phase2 = r.moves.slice(r.phase1Length);
    // Dopo la fase 1 il cubo deve essere nel sottogruppo <U,D,R2,L2,F2,B2>:
    // orientamenti a zero e spigoli centrali nella fascia centrale.
    const mid = applyMoves(cube, phase1);
    expect(Array.from(mid.co).every((x) => x === 0)).toBe(true);
    expect(Array.from(mid.eo).every((x) => x === 0)).toBe(true);
    for (let i = 8; i < 12; i++) expect(mid.ep[i]).toBeGreaterThanOrEqual(8);
    // La fase 2 puo' usare solo mosse del sottogruppo.
    for (const m of phase2) {
      const isUD = m.face === 0 || m.face === 3;
      expect(isUD || m.power === 2).toBe(true);
    }
  });
});
