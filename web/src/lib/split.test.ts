import { describe, it, expect } from 'vitest';
import { normalizzaSplit, ripartisci, splitValido } from './split';

describe('Regole degli slider (lato telefono)', () => {
  it('la somma delle parti è sempre il totale', () => {
    for (const totale of [1, 7, 33, 100, 999, 1000, 1234]) {
      expect(ripartisci(totale, [60, 30, 10]).reduce((a, b) => a + b, 0)).toBe(totale);
      expect(ripartisci(totale, [33, 33, 34]).reduce((a, b) => a + b, 0)).toBe(totale);
    }
  });

  it('divide 10 € in 60/30/10 come ci si aspetta', () => {
    expect(ripartisci(1000, [60, 30, 10])).toEqual([600, 300, 100]);
  });

  it('riporta sempre il totale a 100%', () => {
    const casi = [
      { save: 100, spend: 100, give: 100 },
      { save: 0, spend: 0, give: 0 },
      { save: 80, spend: 30, give: 10 },
    ];
    for (const caso of casi) {
      const n = normalizzaSplit(caso, 10);
      expect(n.save + n.spend + n.give).toBe(100);
      expect(n.give).toBeGreaterThanOrEqual(10);
    }
  });

  it('non lascia scendere GIVE sotto la regola di famiglia', () => {
    const n = normalizzaSplit({ save: 70, spend: 25, give: 5 }, 10, 'give');
    expect(n.give).toBe(10);
    expect(splitValido(n, 10)).toBe(true);
  });

  it('rispetta la leva che il bambino sta muovendo', () => {
    const n = normalizzaSplit({ save: 80, spend: 30, give: 10 }, 10, 'save');
    expect(n.save).toBe(80);
    expect(n.save + n.spend + n.give).toBe(100);
  });

  it('riconosce le combinazioni non valide', () => {
    expect(splitValido({ save: 60, spend: 30, give: 5 }, 10)).toBe(false);
    expect(splitValido({ save: 60, spend: 30, give: 10 }, 10)).toBe(true);
  });
});
