import { describe, expect, it } from 'vitest';
import {
  CENTRO,
  COLORI,
  colora,
  conFaccia,
  contaColori,
  coloriDiTroppo,
  coloriMancanti,
  nuovoStato,
  primoVuoto,
  quantiFatti,
  restanti,
  tocca,
} from '../src/core/kids/entry';
import { CubeColor, Face } from '../src/core/cube/defs';
import { colorsToFaces, deriveColorOfFace } from '../src/core/cube/scheme';
import { validateFacelets } from '../src/core/cube/validator';
import { cubieToFacelet, identityCube } from '../src/core/cube/cubie';

/**
 * L'inserimento a mano dei colori.
 *
 * Questi test nascono da una segnalazione precisa: "inserisco i colori a mano
 * e mi dice che ne ho messo uno di troppo, ma li ho contati sul cubo e sono
 * giusti". Il colpevole era il tocco che coloravа da solo. Qui simuliamo le
 * sequenze di tocchi di un bambino e controlliamo che i colori che finiscono
 * in memoria siano ESATTAMENTE quelli scelti.
 */

/** Una faccia qualsiasi con nove colori decisi da noi. */
const FACCIA: CubeColor[] = [
  CubeColor.Red,
  CubeColor.Blue,
  CubeColor.Green,
  CubeColor.Yellow,
  CubeColor.White,
  CubeColor.Orange,
  CubeColor.Red,
  CubeColor.Blue,
  CubeColor.Green,
];

/** Colora una faccia come fa un bambino: tocca il quadratino, poi il colore. */
function inserisci(voluti: CubeColor[]) {
  let s = nuovoStato(new Array(9).fill(null));
  // Prima il centro, che l'app seleziona da sola.
  s = colora(s, voluti[CENTRO]);
  for (let i = 0; i < 9; i++) {
    if (i === CENTRO) continue;
    s = tocca(s, i);
    s = colora(s, voluti[i]);
  }
  return s;
}

describe('inserimento a mano di una faccia', () => {
  it('mette esattamente i colori scelti', () => {
    expect(inserisci(FACCIA).cells).toEqual(FACCIA);
  });

  it('toccare un quadratino non lo colora mai', () => {
    // Era questo il difetto: dopo aver usato un colore, ogni tocco successivo
    // ridipingeva con quello e cambiava i conti senza dire niente.
    const s = inserisci(FACCIA);
    const dopoTocchi = [0, 1, 2, 3, 4, 5, 6, 7, 8].reduce((acc, i) => tocca(acc, i), s);
    expect(dopoTocchi.cells).toEqual(FACCIA);
  });

  it('toccare il centro non ne cambia il colore', () => {
    // I bambini toccano sempre il centro: e' quello col pallino.
    const s = tocca(inserisci(FACCIA), CENTRO);
    expect(s.cells[CENTRO]).toBe(FACCIA[CENTRO]);
  });

  it('sceglie da solo il prossimo quadratino vuoto, saltando il centro', () => {
    let s = nuovoStato(new Array(9).fill(null));
    expect(s.selected).toBe(CENTRO);
    s = colora(s, CubeColor.White);
    expect(s.selected).toBe(0);
    s = colora(s, CubeColor.Red);
    expect(s.selected).toBe(1);
    // Il centro non torna mai a essere il "prossimo vuoto": qui e' gia' pieno,
    // ma anche svuotandolo la ricerca lo salta.
    const senzaCentro = s.cells.slice();
    senzaCentro[CENTRO] = null;
    expect(primoVuoto(senzaCentro)).toBe(1);
  });

  it('in correzione resta sul quadratino toccato, cosi si puo riprovare', () => {
    let s = inserisci(FACCIA);
    s = tocca(s, 6);
    s = colora(s, CubeColor.White);
    expect(s.cells[6]).toBe(CubeColor.White);
    expect(s.selected).toBe(6);
    // Un ripensamento immediato deve funzionare senza toccare di nuovo.
    s = colora(s, CubeColor.Orange);
    expect(s.cells[6]).toBe(CubeColor.Orange);
    expect(quantiFatti(s.cells)).toBe(9);
  });

  it('una scelta senza nessun quadratino selezionato non tocca niente', () => {
    const s = { cells: FACCIA.slice() as (CubeColor | null)[], selected: null, pennello: null };
    expect(colora(s, CubeColor.White).cells).toEqual(FACCIA);
  });
});

describe('conteggio dei colori', () => {
  it('conta i quadratini di un cubo risolto: nove per colore', () => {
    const colors = colorsClassici();
    for (const c of contaColori(colors)) {
      expect(c.messi).toBe(9);
      expect(c.troppi).toBe(false);
      expect(c.restanti).toBe(0);
    }
    expect(coloriDiTroppo(colors)).toEqual([]);
    expect(coloriMancanti(colors)).toEqual([]);
  });

  it('vede subito il colore di troppo', () => {
    const colors = colorsClassici();
    colors[10] = colors[0]; // un quadratino cambia colore
    expect(coloriDiTroppo(colors)).toEqual([colors[0]!]);
    expect(restanti(colors, colors[0]!)).toBe(0);
  });

  it('a meta inserimento non segnala colori mancanti', () => {
    const colors: (CubeColor | null)[] = new Array(54).fill(null);
    for (let i = 0; i < 9; i++) colors[i] = CubeColor.White;
    expect(coloriMancanti(colors)).toEqual([]);
    expect(coloriDiTroppo(colors)).toEqual([]);
    expect(restanti(colors, CubeColor.White)).toBe(0);
    expect(restanti(colors, CubeColor.Red)).toBe(9);
  });

  it('conFaccia sostituisce solo i nove quadratini di quella faccia', () => {
    const colors: (CubeColor | null)[] = new Array(54).fill(null);
    const dopo = conFaccia(colors, Face.F, FACCIA);
    for (let i = 0; i < 9; i++) expect(dopo[Face.F * 9 + i]).toBe(FACCIA[i]);
    expect(dopo.filter((c) => c !== null)).toHaveLength(9);
    expect(colors.every((c) => c === null)).toBe(true); // l'originale non si tocca
  });

  it('COLORI contiene tutti e sei i colori una volta sola', () => {
    expect(new Set(COLORI).size).toBe(6);
  });
});

describe('dal cubo in mano al validatore, senza sorprese', () => {
  /**
   * La prova che conta: un bambino inserisce le sei facce di un cubo vero
   * toccando quadratino-colore, e il controllo finale lo accetta.
   */
  it('sei facce inserite a mano passano tutti i controlli', () => {
    const veri = colorsClassici();
    const colors: (CubeColor | null)[] = new Array(54).fill(null);

    for (const face of [Face.F, Face.R, Face.B, Face.L, Face.U, Face.D]) {
      const voluti = Array.from({ length: 9 }, (_, i) => veri[face * 9 + i]!);
      let s = inserisci(voluti);
      // Il bambino ricontrolla la faccia toccando qua e la prima di confermare:
      // non deve cambiare niente.
      s = [4, 0, 8, 4].reduce((acc, i) => tocca(acc, i), s);
      for (let i = 0; i < 9; i++) colors[face * 9 + i] = s.cells[i];
    }

    expect(coloriDiTroppo(colors)).toEqual([]);
    const mappa = deriveColorOfFace(colors)!;
    expect(mappa).not.toBeNull();
    const report = validateFacelets(colorsToFaces(colors, mappa));
    expect(report.checks.find((c) => c.id === 'counts')!.ok).toBe(true);
    expect(report.valid).toBe(true);
  });

  it('col vecchio comportamento (tocco che colora) il conto NON tornava', () => {
    // Riproduzione del difetto segnalato, per ricordarsi perche' e' stato tolto.
    const veri = colorsClassici();
    const colors = veri.slice();
    const pennello = colors[0]!;
    // Un tocco di curiosita' sul centro di un'altra faccia: colore cambiato.
    colors[Face.R * 9 + 4] = pennello;
    expect(coloriDiTroppo(colors)).toEqual([pennello]);
    const mappa = deriveColorOfFace(colors);
    // Con due centri uguali non si riesce nemmeno a capire di che faccia si tratta.
    expect(mappa).toBeNull();
  });
});

/** I 54 colori di un cubo risolto tenuto nel modo classico. */
function colorsClassici(): (CubeColor | null)[] {
  const facce = cubieToFacelet(identityCube());
  const mappa: Record<Face, CubeColor> = {
    [Face.U]: CubeColor.White,
    [Face.R]: CubeColor.Red,
    [Face.F]: CubeColor.Green,
    [Face.D]: CubeColor.Yellow,
    [Face.L]: CubeColor.Orange,
    [Face.B]: CubeColor.Blue,
  };
  return facce.map((f) => mappa[f]);
}
