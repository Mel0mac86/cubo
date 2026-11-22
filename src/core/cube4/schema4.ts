/**
 * Quale colore va su quale faccia, su un cubo dove i centri si muovono.
 *
 * Sul 3x3 era facile: il centro non si sposta mai, quindi il centro bianco
 * DICE che quella faccia e' la bianca. Sul 4x4 i quattro pezzi centrali
 * girano per tutto il cubo e all'inizio sono sparsi: non dicono niente.
 *
 * A dirlo sono gli ANGOLI. Gli otto angoli di un cubo portano, fra tutti, la
 * mappa completa dei colori: due colori che non si incontrano mai su nessun
 * angolo sono per forza opposti, e l'ordine in cui i tre colori girano attorno
 * a un angolo distingue il cubo dalla sua immagine allo specchio. Qui proviamo
 * tutte le 720 corrispondenze colore-faccia e teniamo quelle compatibili con
 * gli angoli che si vedono davvero.
 */

import { ANGOLI, PER_FACCIA, Stato4 } from './cube4';
import { NORMALE, posizione } from './geometry';

/** I tre quadratini di ogni angolo, messi in senso ORARIO guardando l'angolo da fuori. */
export const ANGOLI_ORARI: readonly (readonly number[])[] = ANGOLI.map((tre) => {
  const facce = tre.map((i) => Math.floor(i / PER_FACCIA));
  const n = facce.map((f) => NORMALE[f]);
  // Il determinante dice il verso: -1 e' il senso orario visto da fuori
  // (come U, R, F sull'angolo in alto a destra davanti).
  const det =
    n[0][0] * (n[1][1] * n[2][2] - n[1][2] * n[2][1]) -
    n[0][1] * (n[1][0] * n[2][2] - n[1][2] * n[2][0]) +
    n[0][2] * (n[1][0] * n[2][1] - n[1][1] * n[2][0]);
  return det < 0 ? tre.slice() : [tre[0], tre[2], tre[1]];
});

/** Le facce dei tre quadratini di ogni angolo, nello stesso ordine orario. */
export const ANGOLI_FACCE: readonly (readonly number[])[] = ANGOLI_ORARI.map((tre) =>
  tre.map((i) => Math.floor(i / PER_FACCIA)),
);

/** Una terna in senso orario, scritta sempre partendo dal numero piu piccolo. */
function chiaveTerna(a: number, b: number, c: number): string {
  if (a <= b && a <= c) return `${a},${b},${c}`;
  if (b <= a && b <= c) return `${b},${c},${a}`;
  return `${c},${a},${b}`;
}

/** Le otto terne di colori degli angoli, come si vedono adesso sul cubo. */
export function terneAngoli(s: Stato4): string[] {
  return ANGOLI_ORARI.map((tre) => chiaveTerna(s[tre[0]], s[tre[1]], s[tre[2]]));
}

/** Le otto terne di FACCE: come sarebbe il cubo risolto, qualunque sia lo schema. */
const TERNE_FACCE = ANGOLI_FACCE.map((t) => chiaveTerna(t[0], t[1], t[2]));

function permutazioni(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  for (const resto of permutazioni(n - 1)) {
    for (let i = 0; i <= resto.length; i++) {
      out.push([...resto.slice(0, i), n - 1, ...resto.slice(i)]);
    }
  }
  return out;
}

/** Tutte le 720 corrispondenze faccia -> colore. */
const CANDIDATI = permutazioni(6);

export interface Schema4 {
  /** coloreDiFaccia[f] = il colore che deve stare sulla faccia f a cubo risolto. */
  coloreDiFaccia: number[];
  /** L'inverso: facciaDiColore[c] = su quale faccia va quel colore. */
  facciaDiColore: number[];
}

/**
 * Tutti gli schemi compatibili con gli angoli. Su un cubo valido sono
 * esattamente 24 (le 24 posizioni in cui si puo' tenere in mano lo stesso
 * cubo); se sono zero, gli angoli non possono esistere su un cubo vero.
 */
export function schemiPossibili(s: Stato4): Schema4[] {
  const viste = terneAngoli(s).slice().sort();
  const out: Schema4[] = [];
  for (const sigma of CANDIDATI) {
    // sigma[f] = colore della faccia f. Traduco le terne di facce in colori.
    const attese = TERNE_FACCE.map((k) => {
      const [a, b, c] = k.split(',').map(Number);
      return chiaveTerna(sigma[a], sigma[b], sigma[c]);
    }).sort();
    let ok = true;
    for (let i = 0; i < 8; i++) if (attese[i] !== viste[i]) { ok = false; break; }
    if (!ok) continue;
    const facciaDiColore = new Array(6).fill(-1);
    sigma.forEach((c, f) => (facciaDiColore[c] = f));
    out.push({ coloreDiFaccia: sigma.slice(), facciaDiColore });
  }
  return out;
}

/**
 * Lo schema migliore: fra i 24 modi di tenere in mano lo stesso cubo, quello
 * che lascia piu' quadratini gia' al loro posto. Serve perche' il bambino
 * tiene il cubo come gli pare: scegliendo cosi, la soluzione lo porta al cubo
 * risolto senza chiedergli di girarlo tutto all'inizio.
 */
export function schemaMigliore(s: Stato4): Schema4 | null {
  const possibili = schemiPossibili(s);
  if (possibili.length === 0) return null;
  let best = possibili[0];
  let bestPunti = -1;
  for (const sc of possibili) {
    let punti = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === sc.coloreDiFaccia[Math.floor(i / PER_FACCIA)]) punti++;
    }
    if (punti > bestPunti) {
      bestPunti = punti;
      best = sc;
    }
  }
  return best;
}

/** Le tre coppie di colori opposti, dedotte dagli angoli. */
export function coppieOpposte(s: Stato4): [number, number][] | null {
  const insieme = new Set<string>();
  for (const t of ANGOLI_ORARI) {
    const c = [s[t[0]], s[t[1]], s[t[2]]];
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) insieme.add(`${Math.min(c[i], c[j])},${Math.max(c[i], c[j])}`);
    }
  }
  const coppie: [number, number][] = [];
  const presi = new Set<number>();
  for (let a = 0; a < 6; a++) {
    if (presi.has(a)) continue;
    const mai: number[] = [];
    for (let b = 0; b < 6; b++) {
      if (b === a) continue;
      if (!insieme.has(`${Math.min(a, b)},${Math.max(a, b)}`)) mai.push(b);
    }
    if (mai.length !== 1 || presi.has(mai[0])) return null;
    coppie.push([a, mai[0]]);
    presi.add(a);
    presi.add(mai[0]);
  }
  return coppie.length === 3 ? coppie : null;
}
