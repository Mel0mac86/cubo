/**
 * Il cubo 4x4 (Rubik's Revenge): stato, mosse, pezzi.
 *
 * Tre differenze che cambiano tutto rispetto al 3x3:
 *
 *  1. I CENTRI SI MUOVONO. Su un 3x3 il centro di una faccia non si sposta
 *     mai, ed e' lui a dire "questa faccia e' bianca". Su un 4x4 ogni faccia
 *     ha quattro pezzi centrali che girano per tutto il cubo: il colore di una
 *     faccia va dedotto in un altro modo (vedi schema.ts).
 *  2. Ci sono 24 ALETTE invece di 12 spigoli: ogni spigolo del 3x3 qui e' una
 *     coppia di pezzi da appaiare.
 *  3. Esistono le PARITA': situazioni che su un 3x3 sarebbero impossibili (uno
 *     spigolo girato da solo, due spigoli scambiati) e che su un 4x4 invece
 *     capitano normalmente. Il validatore non deve rifiutarle.
 *
 * Lo stato e' semplicemente il colore dei 96 quadratini. Le mosse sono
 * permutazioni generate dalla geometria, non scritte a mano.
 */

import { applicaPerm, geometria, posizione } from './geometry';

export const N = 4;
export const QUADRATINI = 96;
export const PER_FACCIA = 16;

const G = geometria(N);

/** I 96 colori, uno per quadratino. L'indice e' faccia * 16 + riga * 4 + colonna. */
export type Stato4 = Uint8Array;

export interface Mossa4 {
  /** La faccia girata: 0=U 1=R 2=F 3=D 4=L 5=B. */
  faccia: number;
  /** 1 = solo la faccia, 2 = anche lo strato dietro ("mossa larga"). */
  strati: 1 | 2;
  /** 1 = un quarto in senso orario, 2 = mezzo giro, 3 = un quarto al contrario. */
  potenza: 1 | 2 | 3;
}

export const NOMI_FACCIA = ['U', 'R', 'F', 'D', 'L', 'B'] as const;

export const MOSSE4: Mossa4[] = (() => {
  const out: Mossa4[] = [];
  for (let f = 0; f < 6; f++) {
    for (const strati of [1, 2] as const) {
      for (const potenza of [1, 2, 3] as const) out.push({ faccia: f, strati, potenza });
    }
  }
  return out;
})();

export function mossaToString(m: Mossa4): string {
  const coda = m.potenza === 1 ? '' : m.potenza === 2 ? '2' : "'";
  return NOMI_FACCIA[m.faccia] + (m.strati === 2 ? 'w' : '') + coda;
}

export function mosseToString(ms: Mossa4[]): string {
  return ms.map(mossaToString).join(' ');
}

export function leggiMossa(t: string): Mossa4 {
  const m = /^([URFDLB])(w?)(2|')?$/.exec(t.trim());
  if (!m) throw new Error(`mossa 4x4 sconosciuta: ${t}`);
  return {
    faccia: NOMI_FACCIA.indexOf(m[1] as (typeof NOMI_FACCIA)[number]),
    strati: m[2] === 'w' ? 2 : 1,
    potenza: m[3] === '2' ? 2 : m[3] === "'" ? 3 : 1,
  };
}

export function leggiMosse(s: string): Mossa4[] {
  return s.trim().split(/\s+/).filter(Boolean).map(leggiMossa);
}

export function invertiMossa(m: Mossa4): Mossa4 {
  return { ...m, potenza: (4 - m.potenza) as 1 | 2 | 3 };
}

export function invertiMosse(ms: Mossa4[]): Mossa4[] {
  return ms.slice().reverse().map(invertiMossa);
}

/** Indice della mossa in MOSSE4, per le tabelle. */
export function indiceMossa(m: Mossa4): number {
  return m.faccia * 6 + (m.strati - 1) * 3 + (m.potenza - 1);
}

/** Le 36 permutazioni, calcolate una volta sola. */
export const PERM: Int16Array[] = MOSSE4.map((m) => G.permutazione(m.faccia, m.strati, m.potenza));

export function risolto4(): Stato4 {
  return Uint8Array.from({ length: QUADRATINI }, (_, i) => Math.floor(i / PER_FACCIA));
}

export function applica(s: Stato4, m: Mossa4): Stato4 {
  return applicaPerm(s, PERM[indiceMossa(m)]);
}

export function applicaTante(s: Stato4, ms: Mossa4[]): Stato4 {
  let out = s;
  for (const m of ms) out = applica(out, m);
  return out;
}

export function uguali(a: Stato4, b: Stato4): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Unisce le mosse consecutive sulla stessa faccia e con lo stesso spessore, e
 * butta via quelle che si annullano. Su un 4x4 la soluzione e' lunga: ogni
 * mossa risparmiata e' un giro in meno da far fare al bambino.
 */
export function semplifica(ms: Mossa4[]): Mossa4[] {
  const out: Mossa4[] = [];
  for (const m of ms) {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.faccia === m.faccia && ultimo.strati === m.strati) {
      const p = (ultimo.potenza + m.potenza) % 4;
      out.pop();
      if (p !== 0) out.push({ faccia: m.faccia, strati: m.strati, potenza: p as 1 | 2 | 3 });
      continue;
    }
    out.push(m);
  }
  // Una passata non basta: togliendo una mossa in mezzo se ne possono
  // incontrare altre due da unire.
  return out.length === ms.length ? out : semplifica(out);
}

/* ------------------------------------------------------------------ */
/* I pezzi: angoli, alette, centri                                      */
/* ------------------------------------------------------------------ */

/**
 * Raggruppa i quadratini per cubetto: tre quadratini insieme fanno un angolo,
 * due un'aletta, uno solo un pezzo centrale. Anche questo si ricava dalla
 * geometria invece di scriverlo a mano.
 */
function raggruppa(): { angoli: number[][]; alette: number[][]; centri: number[] } {
  const perCella = new Map<string, number[]>();
  for (let f = 0; f < 6; f++) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const p = posizione(N, f, r, c);
        const k = p.join(',');
        const lista = perCella.get(k) ?? [];
        lista.push(G.indice(f, r, c));
        perCella.set(k, lista);
      }
    }
  }
  const angoli: number[][] = [];
  const alette: number[][] = [];
  const centri: number[] = [];
  for (const lista of perCella.values()) {
    if (lista.length === 3) angoli.push(lista.slice().sort((a, b) => a - b));
    else if (lista.length === 2) alette.push(lista.slice().sort((a, b) => a - b));
    else centri.push(lista[0]);
  }
  angoli.sort((a, b) => a[0] - b[0]);
  alette.sort((a, b) => a[0] - b[0]);
  centri.sort((a, b) => a - b);
  return { angoli, alette, centri };
}

const GRUPPI = raggruppa();

/** Gli 8 angoli, ciascuno con i suoi 3 quadratini. */
export const ANGOLI: readonly (readonly number[])[] = GRUPPI.angoli;
/** Le 24 alette, ciascuna con i suoi 2 quadratini. */
export const ALETTE: readonly (readonly number[])[] = GRUPPI.alette;
/** I 24 pezzi centrali (4 per faccia). */
export const CENTRI: readonly number[] = GRUPPI.centri;

/** I 4 pezzi centrali di una faccia. */
export function centriDi(faccia: number): number[] {
  return [5, 6, 9, 10].map((k) => faccia * PER_FACCIA + k);
}

/** Vero se tutti e quattro i pezzi centrali di una faccia sono dello stesso colore. */
export function centroFatto(s: Stato4, faccia: number): boolean {
  const [a, b, c, d] = centriDi(faccia);
  return s[a] === s[b] && s[a] === s[c] && s[a] === s[d];
}

/** Il colore dominante del centro di una faccia (quello che ci sta piu volte). */
export function coloreCentro(s: Stato4, faccia: number): number {
  const conti = new Array(6).fill(0);
  for (const i of centriDi(faccia)) conti[s[i]]++;
  let best = 0;
  for (let c = 1; c < 6; c++) if (conti[c] > conti[best]) best = c;
  return best;
}
