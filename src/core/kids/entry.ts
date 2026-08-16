/**
 * Regole dell'inserimento a mano dei colori.
 *
 * Stanno qui, fuori dalle schermate, perche' sono la parte che si puo'
 * sbagliare senza accorgersene: un tocco di troppo e un quadratino cambia
 * colore in silenzio, e alla fine il controllo dice "un colore compare troppe
 * volte" mentre il cubo vero era giustissimo. Isolarle vuol dire poterle
 * provare davvero, simulando le sequenze di tocchi di un bambino.
 *
 * Due principi, che valgono in tutte le schermate di inserimento:
 *  1. TOCCARE NON COLORA MAI. Il tocco sceglie il quadratino, il colore lo
 *     mette la tavolozza. Un tocco per sbaglio non deve poter rovinare niente.
 *  2. IL CONTO SI VEDE SEMPRE. Ogni colore sta su un cubo vero esattamente 9
 *     volte: se diventano 10 bisogna dirlo subito, mentre il cubo e' ancora in
 *     mano, non dieci minuti dopo alla schermata di controllo.
 */

import { COLOR_LABEL_IT, COLOR_LABEL_IT_PLURAL, CubeColor, Face } from '../cube/defs';

/** Quante volte ogni colore compare su un cubo 3x3 vero. */
export const QUADRATINI_PER_COLORE = 9;

/** I sei colori, nell'ordine in cui li mostriamo. */
export const COLORI: CubeColor[] = [
  CubeColor.White,
  CubeColor.Red,
  CubeColor.Green,
  CubeColor.Yellow,
  CubeColor.Orange,
  CubeColor.Blue,
];

/** Indice del quadratino centrale dentro una faccia. */
export const CENTRO = 4;

/* ------------------------------------------------------------------ */
/* Conteggio dei colori                                                */
/* ------------------------------------------------------------------ */

export interface ContoColore {
  color: CubeColor;
  /** Quanti ne abbiamo messi finora. */
  messi: number;
  /** Quanti ne mancano per arrivare a 9 (negativo se ne abbiamo messi troppi). */
  restanti: number;
  /** Ne abbiamo messi piu' di 9: qualcosa e' sicuramente sbagliato. */
  troppi: boolean;
}

/** Il conto di tutti e sei i colori sui 54 quadratini. */
export function contaColori(colors: (CubeColor | null)[]): ContoColore[] {
  const n = new Array(COLORI.length).fill(0);
  for (const c of colors) {
    if (c === null || c === undefined) continue;
    if (c >= 0 && c < n.length) n[c]++;
  }
  return COLORI.map((color) => ({
    color,
    messi: n[color],
    restanti: QUADRATINI_PER_COLORE - n[color],
    troppi: n[color] > QUADRATINI_PER_COLORE,
  }));
}

/** I colori messi piu' di nove volte (di solito uno solo). */
export function coloriDiTroppo(colors: (CubeColor | null)[]): CubeColor[] {
  return contaColori(colors)
    .filter((c) => c.troppi)
    .map((c) => c.color);
}

/**
 * I colori che mancano all'appello, ma solo quando i 54 quadratini sono tutti
 * pieni: a meta' inserimento "mancano" quasi tutti ed e' del tutto normale.
 */
export function coloriMancanti(colors: (CubeColor | null)[]): CubeColor[] {
  if (colors.some((c) => c === null || c === undefined)) return [];
  return contaColori(colors)
    .filter((c) => c.messi < QUADRATINI_PER_COLORE)
    .map((c) => c.color);
}

/** Quanti quadratini di questo colore possiamo ancora mettere (mai negativo). */
export function restanti(colors: (CubeColor | null)[], color: CubeColor): number {
  const c = contaColori(colors).find((x) => x.color === color)!;
  return Math.max(0, c.restanti);
}

/** I 54 colori con una faccia sostituita: serve per contare durante l'inserimento. */
export function conFaccia(
  colors: (CubeColor | null)[],
  face: Face,
  cells: (CubeColor | null)[],
): (CubeColor | null)[] {
  const out = colors.slice();
  for (let i = 0; i < 9; i++) out[face * 9 + i] = cells[i] ?? null;
  return out;
}

/**
 * Frase da far dire a Rubi quando un colore sfora il nove.
 * Niente numeri tecnici: si spiega la regola e si dice cosa fare.
 */
export function avvisoTroppiColori(color: CubeColor, messi: number): string {
  return (
    `Aspetta! Adesso ho contato ${messi} quadratini ${COLOR_LABEL_IT_PLURAL[color]}, ` +
    `ma su un cubo vero ogni colore sta esattamente 9 volte. ` +
    `Vuol dire che uno di quelli ${COLOR_LABEL_IT_PLURAL[color]} in realta e di un altro colore: ` +
    `guardiamolo bene insieme! Il ${COLOR_LABEL_IT[color]} di troppo e uno di quelli col bordo rosso.`
  );
}

/* ------------------------------------------------------------------ */
/* Lo stato di una faccia mentre la si colora                          */
/* ------------------------------------------------------------------ */

export interface StatoInserimento {
  /** I nove quadratini della faccia, null dove non abbiamo ancora deciso. */
  cells: (CubeColor | null)[];
  /** Il quadratino su cui andra' a finire il prossimo colore scelto. */
  selected: number | null;
  /** L'ultimo colore scelto sulla tavolozza (serve solo a evidenziarlo). */
  pennello: CubeColor | null;
}

export function nuovoStato(cells: (CubeColor | null)[]): StatoInserimento {
  // Si parte sempre dal centro: e' lui a dire di che faccia si tratta.
  return { cells: cells.slice(), selected: CENTRO, pennello: null };
}

/** Il primo quadratino ancora vuoto, saltando il centro. */
export function primoVuoto(cells: (CubeColor | null)[]): number | null {
  const i = cells.findIndex((c, k) => (c === null || c === undefined) && k !== CENTRO);
  return i === -1 ? null : i;
}

/**
 * Tocco su un quadratino: SCEGLIE e basta.
 *
 * Prima qui si colorava anche, riusando l'ultimo colore della tavolozza. Era
 * il difetto piu' cattivo dell'app: bastava sfiorare un quadratino gia' giusto
 * (o il centro, che i bambini toccano sempre perche' e' quello col pallino) e
 * il colore cambiava senza che nessuno se ne accorgesse. Poi il controllo
 * finale diceva "un colore di troppo" e sembrava un errore del bambino.
 */
export function tocca(s: StatoInserimento, i: number): StatoInserimento {
  if (i < 0 || i > 8) return s;
  return { ...s, selected: i };
}

/**
 * Scelta di un colore sulla tavolozza: colora il quadratino selezionato.
 *
 * Poi passa da solo al primo quadratino ancora vuoto, cosi si puo' colorare
 * tutta la faccia senza mai dover mirare due volte. Se non ce ne sono piu'
 * (siamo in correzione) la selezione resta dov'e': cosi si vede il cambiamento
 * e si puo' subito riprovare con un altro colore.
 */
export function colora(s: StatoInserimento, color: CubeColor): StatoInserimento {
  if (s.selected === null) return { ...s, pennello: color };
  const cells = s.cells.slice();
  cells[s.selected] = color;
  const avanti = primoVuoto(cells);
  return { cells, selected: avanti ?? s.selected, pennello: color };
}

/** Quanti quadratini di questa faccia sono gia' colorati. */
export function quantiFatti(cells: (CubeColor | null)[]): number {
  return cells.filter((c) => c !== null && c !== undefined).length;
}
