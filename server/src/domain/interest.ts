/**
 * 🌱 IL DENARO CRESCE — interesse educativo sul salvadanaio SAVE.
 *
 * Il genitore configura quanti centesimi vengono regalati per ogni euro
 * rimasto in SAVE ogni mese (esempio del capitolato: 5 centesimi per euro).
 * L'interesse si calcola sugli EURO INTERI presenti: e' la regola piu' facile
 * da spiegare a un bambino ("per ogni euro che resta, ti do 5 centesimi").
 */
import type { Cents } from './money.js';
import { assertCents } from './money.js';

export interface InterestResult {
  baseCents: Cents;
  euriInteri: number;
  centsPerEuro: number;
  interestCents: Cents;
  newBalanceCents: Cents;
  ratePercent: number; // tasso mensile equivalente, per le lezioni
}

/**
 * Interesse di un singolo mese.
 *
 * La regola si spiega al bambino come "5 centesimi per ogni euro che resta in
 * SAVE". Tecnicamente e' il 5% del saldo: su saldi in euro tondi i due modi
 * coincidono, e sui centesimi l'arrotondamento e' half-up. Cosi' la crescita
 * composta segue la progressione attesa: 100 → 105 → 110,25 → 115,76.
 */
export function computeMonthlyInterest(saveBalanceCents: Cents, centsPerEuro: number): InterestResult {
  assertCents(saveBalanceCents, 'saldo SAVE');
  const rate = Math.max(0, Math.round(centsPerEuro));
  const base = Math.max(0, saveBalanceCents);
  const esatto = Number(((base * rate) / 100).toPrecision(15));
  const interest = Math.round(esatto);
  return {
    baseCents: base,
    euriInteri: Math.floor(base / 100),
    centsPerEuro: rate,
    interestCents: interest,
    newBalanceCents: base + interest,
    ratePercent: rate, // 5 centesimi per euro = 5% al mese
  };
}

export interface ProjectionStep {
  month: number;
  startCents: Cents;
  interestCents: Cents;
  endCents: Cents;
}

/**
 * Simulazione "Se continui così...": interesse composto mese dopo mese.
 * `monthlyDepositCents` permette di mostrare anche l'effetto del versamento
 * costante (paghetta che entra in SAVE).
 */
export function projectCompound(
  startCents: Cents,
  centsPerEuro: number,
  months: number,
  monthlyDepositCents: Cents = 0,
): ProjectionStep[] {
  assertCents(startCents, 'saldo iniziale');
  assertCents(monthlyDepositCents, 'versamento mensile');
  const steps: ProjectionStep[] = [];
  let saldo = Math.max(0, startCents);
  const n = Math.max(0, Math.min(600, Math.round(months)));
  for (let m = 1; m <= n; m++) {
    const start = saldo;
    const { interestCents } = computeMonthlyInterest(saldo, centsPerEuro);
    saldo = saldo + interestCents + Math.max(0, monthlyDepositCents);
    steps.push({ month: m, startCents: start, interestCents, endCents: saldo });
  }
  return steps;
}

/** Differenza fra interesse semplice e composto, usata nella lezione 7. */
export function compareSimpleVsCompound(startCents: Cents, centsPerEuro: number, months: number) {
  const composto = projectCompound(startCents, centsPerEuro, months);
  const interesseMensileSemplice = computeMonthlyInterest(startCents, centsPerEuro).interestCents;
  const sempliceFinale = Math.max(0, startCents) + interesseMensileSemplice * Math.max(0, Math.round(months));
  const compostoFinale = composto.length ? composto[composto.length - 1].endCents : Math.max(0, startCents);
  return {
    months,
    sempliceFinaleCents: sempliceFinale,
    compostoFinaleCents: compostoFinale,
    differenzaCents: compostoFinale - sempliceFinale,
    steps: composto,
  };
}

/** Chiave "anno-mese" usata per non accreditare due volte lo stesso mese. */
export function periodKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
