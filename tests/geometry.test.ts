import { describe, expect, it } from 'vitest';
import { applicaPerm, geometria } from '../src/core/cube4/geometry';
import { ALL_MOVES, applyMoves, moveToString } from '../src/core/cube/moves';
import { cubieToFacelet, identityCube } from '../src/core/cube/cubie';
import { Face } from '../src/core/cube/defs';

/**
 * La geometria generica deve riprodurre, con N = 3, esattamente le mosse del
 * motore 3x3 gia' collaudato. Se questo test passa, le tabelle del 4x4
 * generate dallo stesso codice sono giuste per costruzione: e' l'unico modo
 * onesto di fidarsi di 36 permutazioni di 96 numeri che nessuno puo'
 * controllare a occhio.
 */
describe('geometria generica contro il motore 3x3', () => {
  const g = geometria(3);
  const risolto = () => Uint8Array.from({ length: 54 }, (_, i) => Math.floor(i / 9));

  it('ogni mossa del 3x3 da lo stesso risultato', () => {
    for (const m of ALL_MOVES) {
      const atteso = cubieToFacelet(applyMoves(identityCube(), [m]));
      const mio = applicaPerm(risolto(), g.permutazione(m.face as number, 1, m.power));
      expect(Array.from(mio), `mossa ${moveToString(m)}`).toEqual(atteso.map((f) => f as number));
    }
  });

  it('le facce del cubo risolto restano al loro posto', () => {
    const s = risolto();
    for (let f = 0; f < 6; f++) for (let i = 0; i < 9; i++) expect(s[f * 9 + i]).toBe(f);
  });
});

describe('geometria del 4x4', () => {
  const g = geometria(4);
  const risolto = () => Uint8Array.from({ length: 96 }, (_, i) => Math.floor(i / 16));

  it('ha 96 quadratini, 16 per faccia', () => {
    expect(g.totale).toBe(96);
    const s = risolto();
    const conti = new Array(6).fill(0);
    for (const c of s) conti[c]++;
    expect(conti).toEqual([16, 16, 16, 16, 16, 16]);
  });

  it('quattro quarti di giro riportano tutto com era', () => {
    for (let f = 0; f < 6; f++) {
      for (const strati of [1, 2]) {
        const p = g.permutazione(f, strati, 1);
        let s = risolto();
        // Parto da uno stato tutto diverso, cosi un errore non si nasconde.
        s = Uint8Array.from({ length: 96 }, (_, i) => i % 251);
        const prima = Array.from(s);
        for (let k = 0; k < 4; k++) s = applicaPerm(s, p);
        expect(Array.from(s), `faccia ${f} strati ${strati}`).toEqual(prima);
      }
    }
  });

  it('un quarto di giro e l opposto si annullano', () => {
    for (let f = 0; f < 6; f++) {
      for (const strati of [1, 2]) {
        const s0 = Uint8Array.from({ length: 96 }, (_, i) => i % 251);
        const s1 = applicaPerm(s0, g.permutazione(f, strati, 1));
        const s2 = applicaPerm(s1, g.permutazione(f, strati, 3));
        expect(Array.from(s2)).toEqual(Array.from(s0));
      }
    }
  });

  it('una mossa esterna non sposta mai i quadratini centrali di un altra faccia', () => {
    // E' il fatto su cui si regge tutta la riduzione: i centri si muovono solo
    // con le mosse larghe.
    const centrali = (f: number) => [5, 6, 9, 10].map((k) => f * 16 + k);
    for (let f = 0; f < 6; f++) {
      const p = g.permutazione(f, 1, 1);
      for (let altra = 0; altra < 6; altra++) {
        if (altra === f) continue;
        for (const i of centrali(altra)) expect(p[i], `faccia ${f} -> ${altra}`).toBe(i);
      }
    }
  });

  it('girare una faccia esterna lascia il suo centro 2x2 tutto di quel colore', () => {
    const s = applicaPerm(risolto(), g.permutazione(0, 1, 1));
    for (const k of [5, 6, 9, 10]) expect(s[k]).toBe(0);
  });
});
