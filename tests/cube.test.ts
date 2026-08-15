import { describe, it, expect } from 'vitest';
import {
  identityCube,
  isSolved,
  cubieToFacelet,
  faceletToCubie,
  cubesEqual,
  applyMoveInPlace,
  invert,
  multiply,
} from '../src/core/cube/cubie';
import {
  parseMoves,
  movesToString,
  applyMoves,
  invertMoves,
  moveIndex,
  simplifyMoves,
  rotateMoves,
} from '../src/core/cube/moves';
import { Face } from '../src/core/cube/defs';
import { makeRng, randomMoveSequence, scrambledCube } from '../src/core/cube/scramble';

describe('modello del cubo', () => {
  it('il cubo identita e risolto', () => {
    expect(isSolved(identityCube())).toBe(true);
  });

  it('ogni faccia torna al punto di partenza dopo 4 quarti di giro', () => {
    for (let f = 0; f < 6; f++) {
      const c = identityCube();
      for (let i = 0; i < 4; i++) applyMoveInPlace(c, f * 3);
      expect(isSolved(c)).toBe(true);
    }
  });

  it('R non e uguale a R2 ne a R-primo', () => {
    const r = applyMoves(identityCube(), parseMoves('R'));
    const r2 = applyMoves(identityCube(), parseMoves('R2'));
    const ri = applyMoves(identityCube(), parseMoves("R'"));
    expect(cubesEqual(r, r2)).toBe(false);
    expect(cubesEqual(r, ri)).toBe(false);
    expect(cubesEqual(applyMoves(r, parseMoves('R')), r2)).toBe(true);
  });

  it('la sequenza "sexy move" ripetuta 6 volte risolve il cubo', () => {
    const seq = parseMoves("R U R' U'");
    let c = identityCube();
    for (let i = 0; i < 6; i++) c = applyMoves(c, seq);
    expect(isSolved(c)).toBe(true);
  });

  it("la sequenza inversa annulla l'originale", () => {
    const rng = makeRng(42);
    for (let t = 0; t < 50; t++) {
      const seq = randomMoveSequence(20, rng);
      const c = applyMoves(applyMoves(identityCube(), seq), invertMoves(seq));
      expect(isSolved(c)).toBe(true);
    }
  });

  it('invert() e coerente con la moltiplicazione', () => {
    const rng = makeRng(7);
    for (let t = 0; t < 20; t++) {
      const c = scrambledCube(20, rng);
      const out = identityCube();
      multiply(c, invert(c), out);
      expect(isSolved(out)).toBe(true);
    }
  });

  it('facelet <-> cubie e una conversione fedele (round-trip)', () => {
    const rng = makeRng(123);
    for (let t = 0; t < 200; t++) {
      const c = scrambledCube(25, rng);
      const back = faceletToCubie(cubieToFacelet(c));
      expect(cubesEqual(c, back)).toBe(true);
    }
  });

  it('il cubo risolto ha ogni faccia di un solo colore', () => {
    const f = cubieToFacelet(identityCube());
    expect(f.length).toBe(54);
    for (let face = 0; face < 6; face++) {
      for (let i = 0; i < 9; i++) expect(f[face * 9 + i]).toBe(face as Face);
    }
  });

  it('ogni colore compare esattamente 9 volte anche da mescolato', () => {
    const f = cubieToFacelet(scrambledCube(30, makeRng(9)));
    const counts = new Array(6).fill(0);
    for (const c of f) counts[c]++;
    expect(counts).toEqual([9, 9, 9, 9, 9, 9]);
  });
});

describe('notazione', () => {
  it('legge e riscrive la notazione standard', () => {
    const s = "R U R' F2 L' B D2";
    expect(movesToString(parseMoves(s))).toBe(s);
  });

  it('compatta le mosse ridondanti', () => {
    expect(movesToString(simplifyMoves(parseMoves("R R")))).toBe('R2');
    expect(movesToString(simplifyMoves(parseMoves("R R'")))).toBe('');
    expect(movesToString(simplifyMoves(parseMoves("R U U' R'")))).toBe('');
    expect(movesToString(simplifyMoves(parseMoves('R2 R2')))).toBe('');
  });

  it('la rotazione attorno a U-D mappa F->R->B->L e lascia U,D', () => {
    expect(movesToString(rotateMoves(parseMoves("F R U D B L"), 1))).toBe("R B U D L F");
    expect(movesToString(rotateMoves(parseMoves('F'), 4))).toBe('F');
  });

  it('una sequenza ruotata risolve il cubo ruotato allo stesso modo', () => {
    // Se "F R U R' U' F'" orienta gli spigoli in alto, la sua rotazione fa lo
    // stesso partendo dal cubo ruotato: verifichiamo che il numero di spigoli
    // orientati sia identico.
    const base = parseMoves("F R U R' U' F'");
    for (let k = 0; k < 4; k++) {
      const c = applyMoves(identityCube(), rotateMoves(base, k));
      const oriented = Array.from(c.eo).filter((x) => x === 0).length;
      const ref = applyMoves(identityCube(), base);
      expect(oriented).toBe(Array.from(ref.eo).filter((x) => x === 0).length);
    }
  });
});

describe('mosse valide', () => {
  it('gli indici delle 18 mosse sono unici e riconvertibili', () => {
    const seen = new Set<number>();
    for (const m of parseMoves("U U2 U' R R2 R' F F2 F' D D2 D' L L2 L' B B2 B'")) {
      const i = moveIndex(m);
      expect(seen.has(i)).toBe(false);
      seen.add(i);
    }
    expect(seen.size).toBe(18);
  });
});
