/**
 * "Ho guardato la faccia girata storta."
 *
 * Quando si inserisce un cubo a mano, i sei centri dicono senza ambiguita' di
 * che faccia si tratta, ma NON dicono come il bambino teneva il cubo mentre la
 * guardava. La faccia di sotto in particolare si puo' guardare in quattro modi
 * diversi, tutti naturali, e tre su quattro mettono i nove quadratini nelle
 * caselle sbagliate.
 *
 * L'effetto e' inconfondibile: i colori sono contati bene (girare una faccia
 * non cambia quanti quadratini ci sono) e i centri sono giusti (il centro
 * resta al centro), ma gli angolini e i pezzi laterali risultano impossibili.
 * Al bambino l'app dice "gli angolini non sono giusti" mentre lui ha copiato
 * tutto correttamente: non ha nessun modo di capire cosa fare.
 *
 * Qui proviamo tutti i modi in cui poteva tenere il cubo e cerchiamo quello
 * che da' un cubo vero. Se ce n'e' uno solo, non c'e' niente da chiedere: era
 * quello.
 */

import { Face, FACE_ORDER } from './defs';
import { CubieCube } from './cubie';
import { validateFacelets } from './validator';

/** Da dove arriva ogni quadratino quando si gira la faccia di un quarto in senso orario. */
const GIRO_ORARIO = [6, 3, 0, 7, 4, 1, 8, 5, 2];

/** Ruota i nove quadratini di una faccia di `quarti` quarti di giro in senso orario. */
export function ruotaFaccia<T>(cells: T[], quarti: number): T[] {
  let out = cells.slice();
  const n = ((quarti % 4) + 4) % 4;
  for (let g = 0; g < n; g++) out = GIRO_ORARIO.map((k) => out[k]);
  return out;
}

/** Ruota una faccia dentro l'array dei 54. */
export function ruotaFacciaIn<T>(g: T[], face: Face, quarti: number): T[] {
  const out = g.slice();
  const ruotata = ruotaFaccia(g.slice(face * 9, face * 9 + 9), quarti);
  for (let i = 0; i < 9; i++) out[face * 9 + i] = ruotata[i];
  return out;
}

export interface LetturaPossibile {
  /** I 54 facelet nella lettura corretta. */
  facelets: Face[];
  /** Quanti quarti di giro serviva ruotare ciascuna faccia (indicizzato per Face). */
  giri: number[];
  /** Le facce che erano state guardate girate. */
  storte: Face[];
  /** Come il bambino stava girando il cubo, se non nel modo spiegato. */
  modo?: string;
  cube: CubieCube;
}

/**
 * Tutte le letture valide ottenibili girando le singole facce.
 *
 * Sono 4^6 = 4096 combinazioni, ognuna con una validazione completa: si fa in
 * pochi millisecondi, quindi si puo' provare senza pensarci.
 *
 * Il risultato e' deduplicato sui facelet, non sulle combinazioni: su una
 * faccia tutta di un colore i quattro giri danno lo stesso identico cubo, e
 * contarli come quattro possibilita' diverse farebbe sembrare ambiguo un caso
 * che ambiguo non e'. Le letture sono ordinate per numero di facce girate:
 * quella che chiede meno correzioni viene per prima.
 */
export function lettureValide(g: Face[], maxRisultati = 8): LetturaPossibile[] {
  const viste = new Map<string, LetturaPossibile>();

  // Le facce con tutti e nove i quadratini uguali non hanno un "verso": provare
  // a girarle moltiplicherebbe le combinazioni senza cambiare niente.
  const giriPossibili = FACE_ORDER.map((f) => {
    const c = g.slice(f * 9, f * 9 + 9);
    return c.every((x) => x === c[0]) ? [0] : [0, 1, 2, 3];
  });

  const combina = (indice: number, corrente: Face[], giri: number[]) => {
    if (viste.size >= maxRisultati * 4) return;
    if (indice === FACE_ORDER.length) {
      const report = validateFacelets(corrente);
      if (!report.valid || !report.cube) return;
      const chiave = corrente.join('');
      if (viste.has(chiave)) return;
      viste.set(chiave, {
        facelets: corrente.slice(),
        giri: giri.slice(),
        storte: FACE_ORDER.filter((f) => giri[f] !== 0),
        cube: report.cube,
      });
      return;
    }
    const face = FACE_ORDER[indice];
    for (const q of giriPossibili[indice]) {
      giri[face] = q;
      combina(indice + 1, q === 0 ? corrente : ruotaFacciaIn(corrente, face, q), giri);
    }
    giri[face] = 0;
  };

  combina(0, g.slice(), new Array(6).fill(0));

  return [...viste.values()]
    .sort((a, b) => a.storte.length - b.storte.length)
    .slice(0, maxRisultati);
}

/** Scambia fra loro i nove quadratini di due facce. */
export function scambiaFacce<T>(g: T[], a: Face, b: Face): T[] {
  const out = g.slice();
  for (let i = 0; i < 9; i++) {
    out[a * 9 + i] = g[b * 9 + i];
    out[b * 9 + i] = g[a * 9 + i];
  }
  return out;
}

/**
 * I modi sbagliati di girare il cubo che vale la pena provare.
 *
 * Oltre al verso di una singola faccia c'e' un secondo errore molto comune:
 * girare il cubo verso DESTRA invece che verso sinistra. Il bambino vede le
 * facce nell'ordine giusto per lui, ma l'app le registra a specchio, e il cubo
 * risulta impossibile pur essendo stato copiato benissimo.
 */
export const MODO_NORMALE = 'come detto';
export const MODO_SPECCHIO = 'girato dall altra parte';

const MODI: { nome: string; applica: (g: Face[]) => Face[] }[] = [
  { nome: MODO_NORMALE, applica: (g) => g },
  { nome: MODO_SPECCHIO, applica: (g) => scambiaFacce(g, Face.R, Face.L) },
];

export interface Recupero {
  /** C'e' una sola lettura valida: si puo' correggere senza chiedere niente. */
  sicuro: boolean;
  lettura: LetturaPossibile | null;
  /** Quante letture valide diverse sono state trovate. */
  quante: number;
}

/**
 * Prova a salvare un inserimento in cui l'unico errore e' il verso di una
 * faccia. Va chiamata SOLO quando i colori sono contati bene e i centri sono a
 * posto: se manca un colore o due centri sono uguali il problema e' un altro e
 * girare le facce non lo risolve.
 */
export function recuperaOrientamento(g: Face[]): Recupero {
  const letture: LetturaPossibile[] = [];
  const viste = new Set<string>();
  for (const modo of MODI) {
    for (const l of lettureValide(modo.applica(g))) {
      const chiave = l.facelets.join('');
      if (viste.has(chiave)) continue;
      viste.add(chiave);
      letture.push({ ...l, modo: modo.nome });
    }
    // Se il modo "come detto" ha gia' dato una risposta, non c'e' motivo di
    // ipotizzare anche che il cubo sia stato girato dalla parte sbagliata.
    if (letture.length > 0) break;
  }
  if (letture.length === 0) return { sicuro: false, lettura: null, quante: 0 };
  letture.sort((a, b) => a.storte.length - b.storte.length);
  return { sicuro: letture.length === 1, lettura: letture[0], quante: letture.length };
}
