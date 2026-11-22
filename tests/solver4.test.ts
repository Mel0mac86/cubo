import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/cube/scramble';
import { cubo4Mescolato, mescolata4 } from '../src/core/cube4/scramble4';
import { applicaTante, leggiMosse, risolto4 } from '../src/core/cube4/cube4';
import { risolvi4, risolto } from '../src/core/cube4/solver4';
import { schemaMigliore } from '../src/core/cube4/schema4';
import { risolviCentri, centriAPosto } from '../src/core/cube4/centri';
import { appaiaAlette, aletteAppaiate } from '../src/core/cube4/alette';
import { libreria } from '../src/core/cube4/macro';
import { come3x3 } from '../src/core/cube4/ponte3';
import { validateFacelets } from '../src/core/cube/validator';

/**
 * Il risolutore del cubo grande.
 *
 * La prova che conta non e' "ha prodotto delle mosse", ma "quelle mosse, fatte
 * sul cubo di partenza, lo risolvono davvero". Un bambino con il cubo in mano
 * non ha modo di accorgersi di una soluzione sbagliata finche' non e' arrivato
 * in fondo a centoquaranta mosse, quindi questo e' l'unico controllo onesto.
 */

describe('la libreria delle mosse composte', () => {
  it('contiene solo sequenze che non rompono i centri', () => {
    const lib = libreria();
    expect(lib.length).toBeGreaterThan(10000);
    const sc = schemaMigliore(risolto4())!;
    // Un campione: provarle tutte sarebbe lentissimo e non direbbe di piu'.
    for (let k = 0; k < lib.length; k += 997) {
      const dopo = applicaTante(risolto4(), lib[k].mosse);
      expect(centriAPosto(dopo, sc.coloreDiFaccia), `macro ${k}`).toBe(true);
    }
  });

  it('contiene 3-cicli di alette: sono quelli che sbloccano gli ultimi spigoli', () => {
    const tre = libreria().filter((m) => {
      let n = 0;
      for (let j = 0; j < 48; j++) if (m.perm[j] !== j) n++;
      return n === 6;
    });
    expect(tre.length).toBeGreaterThan(100);
  });
});

describe('le due fasi della riduzione', () => {
  it('rimette insieme i centri di cubi mescolati davvero', () => {
    const rng = makeRng(31);
    for (let t = 0; t < 6; t++) {
      const s = cubo4Mescolato(40, rng);
      const sc = schemaMigliore(s)!;
      const e = risolviCentri(s, sc.coloreDiFaccia, 4);
      expect(e.fatto).toBe(true);
      expect(centriAPosto(applicaTante(s, e.mosse), sc.coloreDiFaccia)).toBe(true);
    }
  });

  it('appaia tutte e dodici le coppie senza rompere i centri', () => {
    const rng = makeRng(32);
    for (let t = 0; t < 4; t++) {
      const s0 = cubo4Mescolato(40, rng);
      const sc = schemaMigliore(s0)!;
      const s = applicaTante(s0, risolviCentri(s0, sc.coloreDiFaccia, 4).mosse);
      const e = appaiaAlette(s);
      expect(e.fatto).toBe(true);
      const dopo = applicaTante(s, e.mosse);
      expect(aletteAppaiate(dopo)).toBe(true);
      expect(centriAPosto(dopo, sc.coloreDiFaccia)).toBe(true);
    }
  });
});

describe('le parita del cubo grande', () => {
  /**
   * Due situazioni che su un 3x3 sarebbero impossibili e qui sono normali.
   * Servono due sequenze diverse, e questi test fissano che siano quelle
   * giuste: sono state TROVATE cercando, non ricordate, e senza il test
   * nessuno saprebbe piu' perche' sono proprio quelle.
   */
  it('la sequenza che gira un solo spigolo doppio fa esattamente quello', () => {
    const sc = schemaMigliore(risolto4())!;
    const s = applicaTante(risolto4(), leggiMosse("Rw2 B2 U2 Lw U2 Rw' U2 Rw U2 F2 Rw F2 Lw' B2 Rw2"));
    expect(centriAPosto(s, sc.coloreDiFaccia)).toBe(true);
    expect(aletteAppaiate(s)).toBe(true);
    const r = validateFacelets(come3x3(s, sc));
    expect(r.valid).toBe(false);
    expect(r.checks.find((c) => c.id === 'orientation')!.ok).toBe(false);
  });

  it('la sequenza che scambia due spigoli doppi fa esattamente quello', () => {
    const sc = schemaMigliore(risolto4())!;
    const s = applicaTante(risolto4(), leggiMosse('Rw2 R2 Uw2 U2 Rw2 Uw2 U2 R2 Uw2 U2'));
    expect(centriAPosto(s, sc.coloreDiFaccia)).toBe(true);
    expect(aletteAppaiate(s)).toBe(true);
    const r = validateFacelets(come3x3(s, sc));
    expect(r.valid).toBe(false);
    expect(r.checks.find((c) => c.id === 'permutation')!.ok).toBe(false);
  });
});

describe('risolve il cubo grande per davvero', () => {
  it('le mosse, rifatte sul cubo di partenza, lo risolvono', () => {
    const rng = makeRng(2026);
    const PROVE = 6;
    let somma = 0;
    for (let t = 0; t < PROVE; t++) {
      const partenza = cubo4Mescolato(40, rng);
      const sol = risolvi4(partenza, { motore: 'kociemba' });
      expect(sol.verificata, `cubo ${t}`).toBe(true);
      // Non ci si fida nemmeno del flag: si rifa' il conto qui.
      expect(risolto(applicaTante(partenza, sol.mosse), sol.schema)).toBe(true);
      // Le quattro fasi devono coprire tutte le mosse.
      expect(sol.fasi.flatMap((f) => f.mosse).length).toBeGreaterThanOrEqual(sol.mosse.length);
      somma += sol.mosse.length;
    }
    // eslint-disable-next-line no-console
    console.log(`\n  cubo 4x4: ${(somma / PROVE).toFixed(0)} mosse di media su ${PROVE} cubi\n`);
  }, 120000);

  it('un cubo gia risolto non chiede nessuna mossa', () => {
    const sol = risolvi4(risolto4(), { motore: 'kociemba' });
    expect(sol.mosse.length).toBe(0);
    expect(sol.verificata).toBe(true);
  });

  it('risolve anche partendo da una mescolata corta', () => {
    const rng = makeRng(8);
    const ms = mescolata4(6, rng);
    const partenza = applicaTante(risolto4(), ms);
    const sol = risolvi4(partenza, { motore: 'kociemba' });
    expect(sol.verificata).toBe(true);
    // Si controlla contro lo SCHEMA, non contro il cubo risolto "di fabbrica":
    // il bambino tiene il cubo come gli pare, quindi la soluzione lo porta a un
    // cubo finito, non per forza con il bianco sopra.
    expect(risolto(applicaTante(partenza, sol.mosse), sol.schema)).toBe(true);
  }, 60000);
});
