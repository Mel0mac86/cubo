/**
 * Geometria di un cubo N x N x N, e da li' le permutazioni delle mosse.
 *
 * Perche' partire dalla geometria invece di scrivere a mano le tabelle: le
 * tabelle di un 4x4 sono 36 permutazioni di 96 numeri. Scritte a mano sarebbero
 * sbagliate di sicuro, e un errore in una tabella non si vede finche' il
 * bambino non si trova in mano una soluzione che non funziona.
 *
 * Qui invece ogni quadratino e' un punto nello spazio con la sua direzione, una
 * mossa e' una rotazione di quei punti, e le tabelle si ricavano da sole. Lo
 * stesso codice, con N = 3, deve dare esattamente le mosse del motore 3x3 gia'
 * collaudato: e' quello il controllo che tiene insieme tutto.
 *
 * Sistema di riferimento: x verso destra, y verso l'alto, z verso chi guarda.
 * Le coordinate sono raddoppiate e centrate (per N = 4: -3, -1, 1, 3) cosi
 * restano numeri interi sia con N pari che con N dispari.
 */

export type Vec = readonly [number, number, number];

/** Le sei facce nell'ordine canonico del motore: U, R, F, D, L, B. */
export const FACCE = [0, 1, 2, 3, 4, 5] as const;

/** La direzione verso l'esterno di ciascuna faccia. */
export const NORMALE: Vec[] = [
  [0, 1, 0], // U
  [1, 0, 0], // R
  [0, 0, 1], // F
  [0, -1, 0], // D
  [-1, 0, 0], // L
  [0, 0, -1], // B
];

/**
 * Dove sta il quadratino (riga, colonna) di una faccia, in coordinate
 * raddoppiate e centrate. Le formule sono scelte per combaciare con la
 * numerazione dei facelet del motore 3x3 (U1 in alto a sinistra guardando
 * dall'alto con il dietro in alto, F1 in alto a sinistra guardando davanti...).
 */
export function posizione(n: number, faccia: number, r: number, c: number): Vec {
  const d = (v: number) => 2 * v - (n - 1); // da 0..n-1 a -(n-1)..(n-1)
  const max = n - 1;
  switch (faccia) {
    case 0: return [d(c), d(max), d(r)];        // U
    case 1: return [d(max), d(max - r), d(max - c)]; // R
    case 2: return [d(c), d(max - r), d(max)];  // F
    case 3: return [d(c), d(0), d(max - r)];    // D
    case 4: return [d(0), d(max - r), d(c)];    // L
    default: return [d(max - c), d(max - r), d(0)]; // B
  }
}

/** Ruota un vettore di un quarto di giro in senso orario attorno a un asse positivo. */
function ruotaVettore(v: Vec, asse: 0 | 1 | 2): Vec {
  const [x, y, z] = v;
  if (asse === 0) return [x, z, -y]; // attorno a +x (guardando da destra)
  if (asse === 1) return [-z, y, x]; // attorno a +y (guardando dall'alto)
  return [y, -x, z];                 // attorno a +z (guardando da davanti)
}

function ruotaTante(v: Vec, asse: 0 | 1 | 2, quarti: number): Vec {
  let out = v;
  for (let i = 0; i < ((quarti % 4) + 4) % 4; i++) out = ruotaVettore(out, asse);
  return out;
}

/** Asse di rotazione di ciascuna faccia, e se sta sul lato positivo dell'asse. */
const ASSE: (0 | 1 | 2)[] = [1, 0, 2, 1, 0, 2];
const POSITIVA = [true, true, true, false, false, false];

export interface Geometria {
  n: number;
  /** Quanti quadratini in tutto (6 * n * n). */
  totale: number;
  /** Indice del quadratino per (faccia, riga, colonna). */
  indice: (faccia: number, r: number, c: number) => number;
  /**
   * Permutazione di una mossa: `da[i]` dice da quale posizione arriva il
   * quadratino che finisce in `i`. Si applica con `dopo[i] = prima[da[i]]`.
   *
   * `faccia` e' la faccia girata, `strati` quanti strati partendo da quella
   * faccia (1 = solo la faccia, 2 = mossa "larga"), `quarti` quanti quarti di
   * giro in senso orario guardando la faccia da fuori.
   */
  permutazione: (faccia: number, strati: number, quarti: number) => Int16Array;
}

export function geometria(n: number): Geometria {
  const totale = 6 * n * n;
  const indice = (faccia: number, r: number, c: number) => faccia * n * n + r * n + c;

  // Ogni quadratino: la sua posizione e la sua direzione.
  const pos: Vec[] = new Array(totale);
  const nrm: Vec[] = new Array(totale);
  // Per ritrovare un quadratino dalla coppia (posizione, direzione).
  const dove = new Map<string, number>();
  const chiave = (p: Vec, d: Vec) => `${p[0]},${p[1]},${p[2]}|${d[0]},${d[1]},${d[2]}`;

  for (const f of FACCE) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const i = indice(f, r, c);
        pos[i] = posizione(n, f, r, c);
        nrm[i] = NORMALE[f];
        dove.set(chiave(pos[i], nrm[i]), i);
      }
    }
  }

  const cache = new Map<string, Int16Array>();

  const permutazione = (faccia: number, strati: number, quarti: number): Int16Array => {
    const k = `${faccia}/${strati}/${quarti}`;
    const gia = cache.get(k);
    if (gia) return gia;

    const asse = ASSE[faccia];
    // Guardare una faccia "negativa" da fuori vuol dire guardare l'asse al
    // contrario: il senso orario per il bambino e' antiorario per l'asse.
    const giri = POSITIVA[faccia] ? quarti : -quarti;
    // Gli strati coinvolti, come coordinate raddoppiate lungo l'asse.
    const limite = (n - 1) - 2 * (strati - 1);
    const dentro = (p: Vec) => (POSITIVA[faccia] ? p[asse] >= limite : p[asse] <= -limite);

    const da = new Int16Array(totale);
    for (let i = 0; i < totale; i++) da[i] = i;
    for (let i = 0; i < totale; i++) {
      if (!dentro(pos[i])) continue;
      const p2 = ruotaTante(pos[i], asse, giri);
      const d2 = ruotaTante(nrm[i], asse, giri);
      const arrivo = dove.get(chiave(p2, d2));
      if (arrivo === undefined) throw new Error(`geometria rotta: ${i} non arriva da nessuna parte`);
      da[arrivo] = i;
    }
    cache.set(k, da);
    return da;
  };

  return { n, totale, indice, permutazione };
}

/** Applica una permutazione a uno stato di quadratini. */
export function applicaPerm(stato: Uint8Array, da: Int16Array): Uint8Array {
  const out = new Uint8Array(stato.length);
  for (let i = 0; i < stato.length; i++) out[i] = stato[da[i]];
  return out;
}
