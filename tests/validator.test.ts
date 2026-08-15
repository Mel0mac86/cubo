import { describe, it, expect } from 'vitest';
import { validateFacelets } from '../src/core/cube/validator';
import { cubieToFacelet, identityCube } from '../src/core/cube/cubie';
import { makeRng, scrambledCube } from '../src/core/cube/scramble';
import { Face } from '../src/core/cube/defs';

function solvedFacelets() {
  return cubieToFacelet(identityCube());
}

describe('validatore', () => {
  it('accetta il cubo risolto', () => {
    const r = validateFacelets(solvedFacelets());
    expect(r.valid).toBe(true);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.checks).toHaveLength(8);
  });

  it('accetta 300 cubi mescolati a caso', () => {
    const rng = makeRng(2024);
    for (let i = 0; i < 300; i++) {
      const r = validateFacelets(cubieToFacelet(scrambledCube(30, rng)));
      expect(r.valid).toBe(true);
    }
  });

  it('rifiuta un cubo incompleto e dice quanti quadratini mancano', () => {
    const f: (Face | null)[] = solvedFacelets();
    f[10] = null;
    f[20] = null;
    const r = validateFacelets(f);
    expect(r.valid).toBe(false);
    const c = r.checks.find((x) => x.id === 'stickers')!;
    expect(c.ok).toBe(false);
    expect(c.message).toContain('2');
    expect(c.suspects).toEqual([10, 20]);
  });

  it('rifiuta un colore contato male e suggerisce la correzione', () => {
    const f = solvedFacelets();
    f[10] = Face.F; // uno sticker R diventa F
    const r = validateFacelets(f);
    expect(r.valid).toBe(false);
    const c = r.checks.find((x) => x.id === 'counts')!;
    expect(c.ok).toBe(false);
    expect(c.suggestion?.some((s) => s.shouldBe === Face.R)).toBe(true);
  });

  it('rifiuta due centri uguali', () => {
    const f = solvedFacelets();
    // scambio due sticker per tenere i conteggi a 9 ma rovinare i centri
    f[Face.R * 9 + 4] = Face.U;
    f[Face.U * 9 + 0] = Face.R;
    const r = validateFacelets(f);
    expect(r.valid).toBe(false);
    expect(r.checks.find((x) => x.id === 'centers')!.ok).toBe(false);
  });

  it('rifiuta un angolo con due colori opposti', () => {
    const f = cubieToFacelet(identityCube());
    // URF = U9(8), R1(9), F3(20). Metto D al posto di U: angolo impossibile.
    f[8] = Face.D;
    f[Face.D * 9 + 0] = Face.U; // conteggi a posto
    const r = validateFacelets(f);
    expect(r.valid).toBe(false);
    const failed = r.checks.find((x) => !x.ok)!;
    expect(['corners', 'edges', 'counts']).toContain(failed.id);
    expect(r.suspects.length).toBeGreaterThan(0);
  });

  it('rileva un angolo girato male (orientamento impossibile)', () => {
    const f = cubieToFacelet(identityCube());
    // ruoto i tre sticker dell'angolo URF fra loro
    const [a, b, c] = [8, 9, 20];
    const t = f[a];
    f[a] = f[b];
    f[b] = f[c];
    f[c] = t;
    const r = validateFacelets(f);
    expect(r.valid).toBe(false);
    expect(r.checks.find((x) => x.id === 'orientation')!.ok).toBe(false);
  });

  it('rileva uno spigolo girato male', () => {
    const f = cubieToFacelet(identityCube());
    // scambio i due sticker dello spigolo UF: UF = 7, 19
    const t = f[7];
    f[7] = f[19];
    f[19] = t;
    const r = validateFacelets(f);
    expect(r.valid).toBe(false);
    expect(r.checks.find((x) => x.id === 'orientation')!.ok).toBe(false);
  });

  it('rileva una permutazione dispari (due pezzi scambiati)', () => {
    const f = cubieToFacelet(identityCube());
    // Scambio completamente gli spigoli UF e UR -> parita' dispari sugli spigoli
    const uf = [7, 19];
    const ur = [5, 10];
    const tmp = [f[uf[0]], f[uf[1]]];
    f[uf[0]] = f[ur[0]];
    f[uf[1]] = f[ur[1]];
    f[ur[0]] = tmp[0];
    f[ur[1]] = tmp[1];
    const r = validateFacelets(f);
    expect(r.valid).toBe(false);
    // Con questo scambio i pezzi restano validi ma la parita' salta
    const failedIds = r.checks.filter((x) => !x.ok).map((x) => x.id);
    expect(failedIds).toContain('permutation');
  });

  it('indica le facce piu sospette per la riscansione', () => {
    const f: (Face | null)[] = solvedFacelets();
    f[Face.B * 9 + 1] = null;
    f[Face.B * 9 + 2] = null;
    f[Face.B * 9 + 3] = null;
    const r = validateFacelets(f);
    expect(r.suspectFaces[0]).toBe(Face.B);
  });
});
