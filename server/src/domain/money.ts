/**
 * Aritmetica monetaria sicura.
 *
 * REGOLA FONDAMENTALE DEL PROGETTO: il denaro non viaggia MAI come numero
 * a virgola mobile. Ogni importo e' un intero che rappresenta i CENTESIMI.
 * I float vengono usati solo per la presentazione (e solo in uscita).
 */

/** Importo in centesimi. Sempre un intero (puo' essere negativo nei delta). */
export type Cents = number;

export class MoneyError extends Error {}

/** Verifica che il valore sia un importo valido in centesimi. */
export function assertCents(value: unknown, label = 'importo'): asserts value is Cents {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new MoneyError(`${label} deve essere un numero intero di centesimi`);
  }
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new MoneyError(`${label} fuori scala`);
  }
}

/** Converte euro (numero o stringa "12,50" / "12.50") in centesimi, con arrotondamento half-up. */
export function euroToCents(input: number | string): Cents {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new MoneyError('Importo non valido');
    // half-up simmetrico rispetto allo zero, evitando l'errore di rappresentazione
    // dei float (es. 1.005 * 100 = 100.49999999999999)
    const scaled = Number((Math.abs(input) * 100).toPrecision(15));
    const rounded = Math.round(scaled);
    return input < 0 ? -rounded : rounded;
  }
  const raw = input.trim().replace(/\s/g, '').replace(/€/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new MoneyError(`Importo non valido: "${input}"`);
  return euroToCents(Number(raw));
}

/** Converte centesimi in euro come numero (usare SOLO per presentazione). */
export function centsToEuro(cents: Cents): number {
  assertCents(cents);
  return cents / 100;
}

/** Formatta un importo in centesimi come stringa italiana: 12345 -> "€ 123,45". */
export function formatCents(cents: Cents, opts: { simbolo?: boolean } = {}): string {
  assertCents(cents);
  const simbolo = opts.simbolo !== false;
  const negativo = cents < 0;
  const abs = Math.abs(cents);
  const euro = Math.floor(abs / 100);
  const resto = abs % 100;
  // Raggruppamento manuale delle migliaia: non dipende dalla presenza di ICU.
  const euroStr = String(euro).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const testo = `${euroStr},${String(resto).padStart(2, '0')}`;
  return `${negativo ? '-' : ''}${simbolo ? '€ ' : ''}${testo}`;
}

/** Somma sicura di importi in centesimi. */
export function sumCents(values: Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  return total;
}

/**
 * Applica una percentuale a un importo restituendo centesimi interi
 * (arrotondamento half-up). Usare `allocateByPercent` quando le parti
 * devono ricomporre esattamente il totale.
 */
export function percentOf(cents: Cents, percent: number): Cents {
  assertCents(cents);
  if (!Number.isFinite(percent)) throw new MoneyError('Percentuale non valida');
  const scaled = Number(((Math.abs(cents) * percent) / 100).toPrecision(15));
  const rounded = Math.round(scaled);
  return cents < 0 ? -rounded : rounded;
}

/**
 * Ripartisce un importo secondo percentuali che sommano a 100, garantendo
 * che la somma delle parti sia ESATTAMENTE uguale al totale.
 *
 * Metodo del resto piu' grande (largest remainder): si assegna la parte intera
 * e i centesimi residui vanno alle quote con resto maggiore. In caso di parita'
 * vince la quota con percentuale piu' alta, poi l'ordine di dichiarazione:
 * il risultato e' quindi deterministico.
 */
export function allocateByPercent(total: Cents, percents: number[]): Cents[] {
  assertCents(total, 'totale');
  if (percents.length === 0) throw new MoneyError('Nessuna quota da ripartire');
  const somma = percents.reduce((a, b) => a + b, 0);
  if (Math.abs(somma - 100) > 1e-9) {
    throw new MoneyError(`Le percentuali devono sommare a 100 (ricevuto ${somma})`);
  }
  if (percents.some((p) => p < 0)) throw new MoneyError('Percentuali negative non ammesse');
  if (total === 0) return percents.map(() => 0);

  const segno = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const esatti = percents.map((p) => (abs * p) / 100);
  const base = esatti.map((v) => Math.floor(v));
  let residuo = abs - base.reduce((a, b) => a + b, 0);

  const ordine = esatti
    .map((v, i) => ({ i, resto: v - Math.floor(v), percent: percents[i] }))
    .sort((a, b) => b.resto - a.resto || b.percent - a.percent || a.i - b.i);

  for (let k = 0; residuo > 0; k = (k + 1) % ordine.length) {
    base[ordine[k].i] += 1;
    residuo -= 1;
  }
  return base.map((v) => v * segno);
}

/** Ripartisce un importo in parti proporzionali a dei pesi arbitrari (non percentuali). */
export function allocateByWeight(total: Cents, weights: number[]): Cents[] {
  const somma = weights.reduce((a, b) => a + b, 0);
  if (somma <= 0) throw new MoneyError('I pesi devono avere somma positiva');
  return allocateByPercent(total, weights.map((w) => (w * 100) / somma));
}

/** Percentuale (0-100, con decimali) di `parte` rispetto a `totale`. 0 se totale <= 0. */
export function percentRatio(parte: Cents, totale: Cents): number {
  assertCents(parte);
  assertCents(totale);
  if (totale <= 0) return 0;
  return (parte * 100) / totale;
}

/** Limita un valore fra min e max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
