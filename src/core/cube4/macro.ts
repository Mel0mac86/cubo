/**
 * Le "mosse composte" che non rompono i centri.
 *
 * Dopo aver rimesso insieme i centri non si possono piu' usare le mosse larghe
 * a cuor leggero: una sola basta a sparpagliare di nuovo tutto. Ma senza mosse
 * larghe le alette non si possono appaiare, perche' le mosse esterne non
 * riescono a scambiare fra loro le due alette di uno stesso spigolo.
 *
 * La via d'uscita e' usarle a coppie. Una sequenza della forma W X W' (una
 * mossa larga, qualche mossa esterna, la larga al contrario) rimette i pezzi
 * centrali esattamente da dove li aveva presi, purche' le mosse in mezzo non
 * girino le facce che intanto sono rimaste mescolate. Invece di ragionarci
 * sopra caso per caso, qui le generiamo tutte e teniamo solo quelle che, alla
 * prova dei fatti, lasciano ogni pezzo centrale sulla sua faccia.
 *
 * Ai coniugati si aggiungono i commutatori A B A' B', che danno una cosa che i
 * coniugati non sanno fare: spostare solo TRE alette lasciando ferme le altre
 * ventuno. Sono loro a sbloccare gli ultimi due spigoli.
 */

import {
  ALETTE,
  MOSSE4,
  Mossa4,
  PERM,
  PER_FACCIA,
  indiceMossa,
  invertiMossa,
  semplifica,
} from './cube4';

/** I 24 pezzi centrali e la faccia di ciascuno. */
const SLOT_C: number[] = [];
for (let f = 0; f < 6; f++) for (const k of [5, 6, 9, 10]) SLOT_C.push(f * PER_FACCIA + k);
const SLOT_DI = new Map(SLOT_C.map((v, j) => [v, j]));
const FACCIA_C = SLOT_C.map((i) => Math.floor(i / PER_FACCIA));
const PERM_C = PERM.map((p) => Int8Array.from(SLOT_C, (i) => SLOT_DI.get(p[i])!));

/** I 48 quadratini delle alette, raggruppati per aletta. */
export const QUADRATINI_ALETTE: number[] = [];
ALETTE.forEach((a) => QUADRATINI_ALETTE.push(a[0], a[1]));
const POS_ALETTA = new Map(QUADRATINI_ALETTE.map((v, j) => [v, j]));

/** Le 12 coppie di alette che formano uno spigolo, come indici nei 48. */
export const SPIGOLI: number[][] = (() => {
  const perFacce = new Map<string, number[]>();
  ALETTE.forEach((a, i) => {
    const k = [Math.floor(a[0] / PER_FACCIA), Math.floor(a[1] / PER_FACCIA)].sort().join(',');
    const l = perFacce.get(k) ?? [];
    l.push(i);
    perFacce.set(k, l);
  });
  return [...perFacce.values()].map(([a, b]) => [
    POS_ALETTA.get(ALETTE[a][0])!,
    POS_ALETTA.get(ALETTE[a][1])!,
    POS_ALETTA.get(ALETTE[b][0])!,
    POS_ALETTA.get(ALETTE[b][1])!,
  ]);
})();

const ESTERNE = MOSSE4.map((m, i) => ({ m, i })).filter((x) => x.m.strati === 1).map((x) => x.i);
const LARGHE = MOSSE4.map((m, i) => ({ m, i })).filter((x) => x.m.strati === 2).map((x) => x.i);

const IDENTITA = Int16Array.from({ length: 96 }, (_, i) => i);

function invertiIndici(s: number[]): number[] {
  return s.slice().reverse().map((m) => indiceMossa(invertiMossa(MOSSE4[m])));
}

function permutazioneDi(seq: number[]): Int16Array {
  let s = IDENTITA;
  for (const m of seq) {
    const p = PERM[m];
    s = Int16Array.from(s, (_, i) => s[p[i]]);
  }
  return s;
}

function centriRestanoSullaLoroFaccia(seq: number[]): boolean {
  let c = Int8Array.from({ length: 24 }, (_, j) => j);
  for (const m of seq) {
    const p = PERM_C[m];
    c = Int8Array.from(c, (_, j) => c[p[j]]);
  }
  for (let j = 0; j < 24; j++) if (FACCIA_C[c[j]] !== FACCIA_C[j]) return false;
  return true;
}

export interface Macro {
  mosse: Mossa4[];
  /** Dove va a finire ciascuno dei 48 quadratini delle alette. */
  perm: Int8Array;
  lunghezza: number;
}

let CACHE: Macro[] | null = null;

/* Buffer riusati: generare la libreria vuol dire comporre qualche centinaio di
 * migliaia di permutazioni, e allocare un array nuovo ogni volta costerebbe
 * piu' del calcolo. Con i buffer la libreria si costruisce in un paio di
 * secondi invece che in quasi un minuto. */
const BUF_A = new Int16Array(96);
const BUF_B = new Int16Array(96);
const BUF_C = new Int8Array(24);
const BUF_D = new Int8Array(24);

function permInPlace(seq: number[], out: Int16Array): void {
  for (let i = 0; i < 96; i++) out[i] = i;
  let a = out;
  let b = BUF_B === out ? BUF_A : BUF_B;
  for (const m of seq) {
    const p = PERM[m];
    for (let i = 0; i < 96; i++) b[i] = a[p[i]];
    const t = a;
    a = b;
    b = t;
  }
  if (a !== out) out.set(a);
}

function centriSicuri(seq: number[]): boolean {
  let a = BUF_C;
  let b = BUF_D;
  for (let j = 0; j < 24; j++) a[j] = j;
  for (const m of seq) {
    const p = PERM_C[m];
    for (let j = 0; j < 24; j++) b[j] = a[p[j]];
    const t = a;
    a = b;
    b = t;
  }
  for (let j = 0; j < 24; j++) if (FACCIA_C[a[j]] !== FACCIA_C[j]) return false;
  return true;
}

/**
 * La libreria, calcolata una volta sola e tenuta da parte: serve a ogni cubo e
 * costa qualche secondo, troppo per rifarla a ogni soluzione.
 */
export function libreria(): Macro[] {
  if (CACHE) return CACHE;

  const perEffetto = new Map<string, number[]>();
  const chiave = new Array<number>(48);
  const aggiungi = (seq: number[]) => {
    if (seq.length === 0 || !centriSicuri(seq)) return;
    permInPlace(seq, BUF_A);
    for (let j = 0; j < 48; j++) chiave[j] = BUF_A[QUADRATINI_ALETTE[j]];
    const k = String.fromCharCode(...chiave);
    const gia = perEffetto.get(k);
    if (!gia || gia.length > seq.length) perEffetto.set(k, seq.slice());
  };

  // 1. Coniugati W X W': una mossa larga fuori, solo mosse esterne dentro.
  const coniugati = (W: number[], Wi: number[], X: number[], restanti: number) => {
    if (X.length) aggiungi([...W, ...X, ...Wi]);
    if (!restanti) return;
    const ultima = X.length ? MOSSE4[X[X.length - 1]].faccia : -1;
    for (const m of ESTERNE) {
      if (MOSSE4[m].faccia === ultima) continue;
      X.push(m);
      coniugati(W, Wi, X, restanti - 1);
      X.pop();
    }
  };
  for (const w of LARGHE) coniugati([w], invertiIndici([w]), [], 3);

  // 2. Le sole mosse esterne, che i centri non li toccano mai.
  const esterne = (X: number[], restanti: number) => {
    if (X.length) aggiungi(X.slice());
    if (!restanti) return;
    const ultima = X.length ? MOSSE4[X[X.length - 1]].faccia : -1;
    for (const m of ESTERNE) {
      if (MOSSE4[m].faccia === ultima) continue;
      X.push(m);
      esterne(X, restanti - 1);
      X.pop();
    }
  };
  esterne([], 3);

  // 3. Commutatori X Y X' Y': gli unici che sanno spostare solo tre alette,
  //    ed e' con quelli che si sbloccano gli ultimi due spigoli.
  const meta: number[][] = [];
  for (let m = 0; m < 36; m++) meta.push([m]);
  for (let a = 0; a < 36; a++) {
    for (let b = 0; b < 36; b++) {
      if (MOSSE4[a].faccia === MOSSE4[b].faccia) continue;
      meta.push([a, b]);
      meta.push([a, b, ...invertiIndici([a])]);
    }
  }
  for (const X of meta) {
    const Xi = invertiIndici(X);
    for (const Y of meta) {
      if (Y.length > 2) continue;
      aggiungi([...X, ...Y, ...Xi, ...invertiIndici(Y)]);
    }
  }

  CACHE = [...perEffetto.values()]
    .map((seq) => semplifica(seq.map((m) => MOSSE4[m])))
    .filter((ms) => ms.length > 0)
    .sort((a, b) => a.length - b.length)
    .map((ms) => {
      permInPlace(ms.map(indiceMossa), BUF_A);
      const perm = Int8Array.from(QUADRATINI_ALETTE, (i) => POS_ALETTA.get(BUF_A[i])!);
      return { mosse: ms, perm, lunghezza: ms.length };
    });
  return CACHE;
}
