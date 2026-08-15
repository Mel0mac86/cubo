import { describe, it, expect } from 'vitest';
import { identityCube, isSolved } from '../src/core/cube/cubie';
import { applyMoves } from '../src/core/cube/moves';
import { makeRng, scrambledCube } from '../src/core/cube/scramble';
import { solveBeginner } from '../src/core/solver/beginner';

describe('solver a strati', () => {
  it('sul cubo risolto non propone mosse', () => {
    const s = solveBeginner(identityCube());
    expect(s.moves).toHaveLength(0);
    expect(s.stages).toHaveLength(7);
  });

  it('risolve 200 cubi casuali', () => {
    const rng = makeRng(4242);
    let total = 0;
    let worst = 0;
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) {
      const cube = scrambledCube(30, rng);
      const s = solveBeginner(cube);
      expect(isSolved(applyMoves(cube, s.moves))).toBe(true);
      total += s.moves.length;
      worst = Math.max(worst, s.moves.length);
    }
    // eslint-disable-next-line no-console
    console.log(
      `  media ${(total / 200).toFixed(0)} mosse, peggiore ${worst}, ${((Date.now() - t0) / 200).toFixed(0)} ms/cubo`,
    );
    expect(worst).toBeLessThan(180);
  });

  it('ogni fase lascia intatto quello che le fasi precedenti hanno sistemato', () => {
    const rng = makeRng(77);
    for (let i = 0; i < 40; i++) {
      const cube = scrambledCube(30, rng);
      const s = solveBeginner(cube);
      let c = cube;
      const seen: string[] = [];
      for (const stage of s.stages) {
        c = applyMoves(c, stage.moves);
        seen.push(stage.id);
        // la croce, una volta fatta, resta fatta fino alla fine
        if (seen.includes('cross')) {
          for (const e of [4, 5, 6, 7]) {
            expect(c.ep[e]).toBe(e);
            expect(c.eo[e]).toBe(0);
          }
        }
        if (seen.includes('firstLayer')) {
          for (const k of [4, 5, 6, 7]) {
            expect(c.cp[k]).toBe(k);
            expect(c.co[k]).toBe(0);
          }
        }
        if (seen.includes('secondLayer')) {
          for (const e of [8, 9, 10, 11]) {
            expect(c.ep[e]).toBe(e);
            expect(c.eo[e]).toBe(0);
          }
        }
      }
      expect(isSolved(c)).toBe(true);
    }
  });

  it('le fasi sono sempre sette e in ordine', () => {
    const s = solveBeginner(scrambledCube(25, makeRng(3)));
    expect(s.stages.map((x) => x.id)).toEqual([
      'cross',
      'firstLayer',
      'secondLayer',
      'topCross',
      'topCorners',
      'cornerPlaces',
      'edgePlaces',
    ]);
    for (const st of s.stages) {
      expect(st.title.length).toBeGreaterThan(0);
      expect(st.goal.length).toBeGreaterThan(0);
    }
  });

  it('la concatenazione delle fasi coincide con la soluzione completa', () => {
    const cube = scrambledCube(25, makeRng(11));
    const s = solveBeginner(cube);
    expect(s.stages.flatMap((x) => x.moves)).toEqual(s.moves);
  });
});
