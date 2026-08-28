/**
 * Calcoli sugli obiettivi di risparmio: progresso, velocita' media,
 * settimane mancanti e data prevista di raggiungimento.
 *
 * Tutte le funzioni sono pure: prendono dati, restituiscono numeri.
 * Nessun accesso al database, cosi' sono facili da testare.
 */
import { type Cents, assertCents, allocateByPercent } from './money.js';

export const MS_PER_DAY = 86_400_000;
export const MS_PER_WEEK = 7 * MS_PER_DAY;

export interface SaveInflow {
  occurredAt: string | Date;
  amountCents: Cents;
}

export type RateSource = 'STORICO' | 'PAGHETTA' | 'NESSUNO';

export interface WeeklyRate {
  weeklyCents: Cents;
  sampleWeeks: number;
  source: RateSource;
}

export interface RateOptions {
  /** Finestra di osservazione dello storico, in settimane. */
  windowWeeks?: number;
  /** Ritmo atteso dalla paghetta ricorrente (gia' al netto dello split SAVE). */
  fallbackWeeklyCents?: Cents;
  now?: Date;
}

/**
 * Stima quanto entra in media ogni settimana nel salvadanaio SAVE.
 *
 * Con almeno due entrate nella finestra si usa lo storico reale; con una sola
 * (o nessuna) lo storico non e' rappresentativo e si preferisce la previsione
 * basata sulla paghetta ricorrente, se configurata.
 */
export function estimateWeeklySavingRate(inflows: SaveInflow[], opts: RateOptions = {}): WeeklyRate {
  const windowWeeks = Math.max(1, Math.round(opts.windowWeeks ?? 8));
  const now = opts.now ?? new Date();
  const fallback = opts.fallbackWeeklyCents ?? 0;
  const inizioFinestra = now.getTime() - windowWeeks * MS_PER_WEEK;

  const dentro = inflows
    .map((i) => ({ t: new Date(i.occurredAt).getTime(), amountCents: i.amountCents }))
    .filter((i) => Number.isFinite(i.t) && i.t >= inizioFinestra && i.t <= now.getTime() && i.amountCents > 0)
    .sort((a, b) => a.t - b.t);

  if (dentro.length >= 2) {
    const totale = dentro.reduce((acc, i) => acc + i.amountCents, 0);
    const giorniCoperti = (now.getTime() - dentro[0].t) / MS_PER_DAY;
    // almeno 7 giorni di denominatore: evita ritmi gonfiati da entrate ravvicinate
    const settimane = Math.min(windowWeeks, Math.max(1, giorniCoperti / 7));
    return {
      weeklyCents: Math.round(totale / settimane),
      sampleWeeks: Math.round(settimane * 10) / 10,
      source: 'STORICO',
    };
  }

  if (fallback > 0) {
    return { weeklyCents: Math.round(fallback), sampleWeeks: 0, source: 'PAGHETTA' };
  }
  if (dentro.length === 1) {
    return { weeklyCents: dentro[0].amountCents, sampleWeeks: 1, source: 'STORICO' };
  }
  return { weeklyCents: 0, sampleWeeks: 0, source: 'NESSUNO' };
}

/** Quanto entra ogni settimana in SAVE data una paghetta ricorrente e uno split. */
export function weeklyFromAllowance(allowanceCents: Cents, savePercent: number, spendPercent: number, givePercent: number): Cents {
  if (allowanceCents <= 0) return 0;
  const [save] = allocateByPercent(allowanceCents, [savePercent, spendPercent, givePercent]);
  return save;
}

export interface GoalProgress {
  targetCents: Cents;
  savedCents: Cents;
  remainingCents: Cents;
  percent: number;          // 0-100 arrotondato a 1 decimale
  completed: boolean;
  weeklyCents: Cents;
  weeksRemaining: number | null;   // null = ritmo sconosciuto
  projectedDate: string | null;    // YYYY-MM-DD
  rateSource: RateSource;
}

export interface GoalProgressInput {
  targetCents: Cents;
  savedCents: Cents;
  rate?: WeeklyRate;
  now?: Date;
}

/** Progresso completo di un obiettivo, pronto per la UI. */
export function computeGoalProgress(input: GoalProgressInput): GoalProgress {
  assertCents(input.targetCents, 'prezzo obiettivo');
  assertCents(input.savedCents, 'risparmio');
  const target = Math.max(0, input.targetCents);
  const saved = Math.max(0, input.savedCents);
  const remaining = Math.max(0, target - saved);
  const percent = target === 0 ? 100 : Math.round(Math.min(100, (saved * 100) / target) * 10) / 10;
  const rate = input.rate ?? { weeklyCents: 0, sampleWeeks: 0, source: 'NESSUNO' as RateSource };
  const now = input.now ?? new Date();

  let weeksRemaining: number | null = null;
  let projectedDate: string | null = null;
  if (remaining === 0) {
    weeksRemaining = 0;
    projectedDate = toIsoDate(now);
  } else if (rate.weeklyCents > 0) {
    weeksRemaining = Math.ceil(remaining / rate.weeklyCents);
    projectedDate = toIsoDate(new Date(now.getTime() + weeksRemaining * MS_PER_WEEK));
  }

  return {
    targetCents: target,
    savedCents: saved,
    remainingCents: remaining,
    percent,
    completed: remaining === 0 && target > 0,
    weeklyCents: rate.weeklyCents,
    weeksRemaining,
    projectedDate,
    rateSource: rate.source,
  };
}

/** Data in formato YYYY-MM-DD (fuso locale del server, coerente con la UI). */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
}

/** Testo amichevole per le settimane mancanti ("circa 8 settimane"). */
export function describeWeeks(weeks: number | null): string {
  if (weeks === null) return 'Non lo so ancora: mettiamo da parte qualcosa e te lo dico!';
  if (weeks <= 0) return 'Ci sei già! 🎉';
  if (weeks === 1) return 'circa 1 settimana';
  if (weeks <= 8) return `circa ${weeks} settimane`;
  const mesi = Math.round(weeks / 4.345);
  return `circa ${weeks} settimane (${mesi} mes${mesi === 1 ? 'e' : 'i'})`;
}
