import { describe, expect, it } from 'vitest';
import {
  ALETTE,
  ANGOLI,
  CENTRI,
  MOSSE4,
  applicaTante,
  centroFatto,
  invertiMosse,
  leggiMosse,
  mossaToString,
  mosseToString,
  risolto4,
  semplifica,
  uguali,
} from '../src/core/cube4/cube4';
import { mescolata4, cubo4Mescolato } from '../src/core/cube4/scramble4';
import { coppieOpposte, schemaMigliore, schemiPossibili } from '../src/core/cube4/schema4';
import { validaCubo4 } from '../src/core/cube4/validator4';
import { makeRng } from '../src/core/cube/scramble';
import { CubeColor } from '../src/core/cube/defs';

describe('pezzi del 4x4', () => {
  it('conta 8 angoli, 24 alette e 24 pezzi centrali', () => {
    expect(ANGOLI.length).toBe(8);
    expect(ALETTE.length).toBe(24);
    expect(CENTRI.length).toBe(24);
    expect(ANGOLI.length * 3 + ALETTE.length * 2 + CENTRI.length).toBe(96);
  });

  it('ogni quadratino appartiene a un pezzo solo', () => {
    const visti = new Set<number>();
    const tutti: number[] = [...ANGOLI.flatMap((a) => [...a]), ...ALETTE.flatMap((a) => [...a]), ...CENTRI];
    for (const i of tutti) {
      expect(visti.has(i), `quadratino ${i} in due pezzi`).toBe(false);
      visti.add(i);
    }
    expect(visti.size).toBe(96);
  });
});

describe('mosse del 4x4', () => {
  it('ha 36 mosse e le sa scrivere e rileggere', () => {
    expect(MOSSE4.length).toBe(36);
    for (const m of MOSSE4) {
      expect(leggiMosse(mossaToString(m))[0]).toEqual(m);
    }
    expect(mosseToString(leggiMosse("Rw2 U' F"))).toBe("Rw2 U' F");
  });

  it('una mescolata e la sua inversa riportano al cubo risolto', () => {
    const rng = makeRng(99);
    for (let t = 0; t < 20; t++) {
      const ms = mescolata4(30, rng);
      const s = applicaTante(risolto4(), ms);
      expect(uguali(s, risolto4())).toBe(false);
      expect(uguali(applicaTante(s, invertiMosse(ms)), risolto4())).toBe(true);
    }
  });

  it('semplifica unisce le mosse della stessa faccia e spessore', () => {
    expect(mosseToString(semplifica(leggiMosse("R R")))).toBe('R2');
    expect(mosseToString(semplifica(leggiMosse("R R'")))).toBe('');
    expect(mosseToString(semplifica(leggiMosse("R U U' R'")))).toBe('');
    // Una mossa larga e una esterna sulla stessa faccia sono cose diverse.
    expect(semplifica(leggiMosse("R Rw")).length).toBe(2);
  });

  it('sul cubo risolto i centri sono fatti, dopo una mossa larga no', () => {
    const s = risolto4();
    for (let f = 0; f < 6; f++) expect(centroFatto(s, f)).toBe(true);
    const dopo = applicaTante(s, leggiMosse('Rw'));
    expect([0, 2, 3, 5].some((f) => !centroFatto(dopo, f))).toBe(true);
  });
});

describe('schema dei colori ricavato dagli angoli', () => {
  it('trova esattamente 24 schemi: i 24 modi di tenere in mano lo stesso cubo', () => {
    const rng = makeRng(5);
    for (let t = 0; t < 5; t++) {
      expect(schemiPossibili(cubo4Mescolato(30, rng)).length).toBe(24);
    }
  });

  it('sul cubo risolto sceglie lo schema che lascia tutto dov e', () => {
    const sc = schemaMigliore(risolto4())!;
    expect(sc.coloreDiFaccia).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('riconosce le tre coppie di colori opposti', () => {
    const c = coppieOpposte(risolto4())!;
    const come = c.map(([a, b]) => [a, b].sort().join(',')).sort();
    // U/D, R/L, F/B nel cubo risolto, cioe' 0/3, 1/4, 2/5
    expect(come).toEqual(['0,3', '1,4', '2,5']);
  });
});

describe('controlli del cubo 4x4', () => {
  const colori = (s: Uint8Array): (CubeColor | null)[] => Array.from(s) as CubeColor[];

  it('accetta un cubo mescolato per davvero', () => {
    const rng = makeRng(77);
    for (let t = 0; t < 10; t++) {
      const r = validaCubo4(colori(cubo4Mescolato(40, rng)));
      expect(r.valid, JSON.stringify(r.checks.filter((c) => !c.ok).map((c) => c.message))).toBe(true);
    }
  });

  it('si accorge se manca un quadratino', () => {
    const c = colori(risolto4());
    c[7] = null;
    const r = validaCubo4(c);
    expect(r.valid).toBe(false);
    expect(r.checks.find((x) => x.id === 'stickers')!.ok).toBe(false);
  });

  it('si accorge di un colore di troppo', () => {
    const c = colori(risolto4());
    c[0] = c[20];
    const r = validaCubo4(c);
    expect(r.valid).toBe(false);
    expect(r.checks.find((x) => x.id === 'counts')!.message).toContain('16');
  });

  it('rifiuta un angolino impossibile', () => {
    const c = colori(risolto4());
    // Metto il colore di SOTTO su un angolo che ha gia' quello di SOPRA:
    // bianco e giallo su uno stesso pezzo non esistono su nessun cubo.
    // I conti restano giusti perche' scambio con un quadratino della faccia
    // di sotto, cosi l'errore non si confonde con un colore di troppo.
    const sopra = ANGOLI.find((t) => t.some((i) => i < 16))!.find((i) => i < 16)!;
    const sotto = ANGOLI.find((t) => t.some((i) => i >= 48 && i < 64))!.find((i) => i >= 48 && i < 64)!;
    [c[sopra], c[sotto]] = [c[sotto], c[sopra]];
    const r = validaCubo4(c);
    expect(r.valid).toBe(false);
  });

  /**
   * Il controllo che distingue il 4x4 dal 3x3: le parita' sono LECITE.
   * Su un cubo piccolo uno spigolo girato da solo vuol dire che il bambino ha
   * letto male i colori; sul cubo grande e' una situazione normale, e
   * rifiutarla lo manderebbe a ricontrollare colori giustissimi.
   */
  it('accetta le parita, che sul cubo grande sono normali', () => {
    const s = applicaTante(risolto4(), leggiMosse("Rw2 B2 U2 Lw U2 Rw' U2 Rw U2 F2 Rw F2 Lw' B2 Rw2"));
    const r = validaCubo4(colori(s));
    expect(r.valid, JSON.stringify(r.checks.filter((c) => !c.ok).map((c) => c.message))).toBe(true);
  });
});
