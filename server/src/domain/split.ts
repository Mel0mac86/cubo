/**
 * Regole di ripartizione SAVE / SPEND / GIVE.
 *
 * Vincoli (punto 2 del capitolato):
 *  - la somma delle tre percentuali deve essere ESATTAMENTE 100;
 *  - GIVE non puo' scendere sotto la soglia configurata dal genitore;
 *  - la ripartizione in centesimi deve ricomporre esattamente l'importo.
 */
import { allocateByPercent, type Cents } from './money.js';
import type { Split, JarType } from './types.js';

export class SplitError extends Error {}

export const SPLIT_DEFAULT: Split = { save: 60, spend: 30, give: 10 };

function isPercent(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0 && v <= 100;
}

/** Valida una ripartizione; lancia SplitError con messaggio adatto ai bambini. */
export function validateSplit(split: Split, minGivePercent: number): void {
  if (!isPercent(split.save) || !isPercent(split.spend) || !isPercent(split.give)) {
    throw new SplitError('Le percentuali devono essere numeri interi da 0 a 100.');
  }
  const totale = split.save + split.spend + split.give;
  if (totale !== 100) {
    throw new SplitError(`Il totale deve essere 100% (adesso è ${totale}%).`);
  }
  if (split.give < minGivePercent) {
    throw new SplitError(`GIVE non può scendere sotto il ${minGivePercent}% deciso in famiglia.`);
  }
}

export function isValidSplit(split: Split, minGivePercent: number): boolean {
  try {
    validateSplit(split, minGivePercent);
    return true;
  } catch {
    return false;
  }
}

/**
 * Riporta una ripartizione a un insieme valido muovendo il minimo indispensabile.
 * Serve agli slider: quando il bambino muove una leva, le altre due si adattano.
 *
 * @param changed quale leva ha mosso il bambino (resta ferma dove l'ha messa,
 *                salvo il vincolo di GIVE minimo).
 */
export function normalizeSplit(split: Split, minGivePercent: number, changed?: keyof Split): Split {
  const min = Math.max(0, Math.min(100, Math.round(minGivePercent)));
  const round = (v: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(v) ? v : 0)));
  const out: Split = { save: round(split.save), spend: round(split.spend), give: round(split.give) };

  // 1) il vincolo di famiglia sul GIVE viene sempre rispettato
  if (out.give < min) out.give = min;

  // 2) l'eccedenza/mancanza viene distribuita sulle leve che il bambino non sta muovendo
  const ordine: (keyof Split)[] = (['save', 'spend', 'give'] as (keyof Split)[])
    .filter((k) => k !== changed)
    .concat(changed ? [changed] : []);

  let delta = 100 - (out.save + out.spend + out.give);
  for (const key of ordine) {
    if (delta === 0) break;
    const minKey = key === 'give' ? min : 0;
    const spazio = delta > 0 ? 100 - out[key] : out[key] - minKey;
    const passo = Math.sign(delta) * Math.min(Math.abs(delta), spazio);
    out[key] += passo;
    delta -= passo;
  }

  // 3) se resta ancora del delta (caso limite: min=100) si forza il GIVE
  if (delta !== 0) out.give = Math.max(min, out.give + delta);
  return out;
}

export interface SplitPreviewRow {
  jar: JarType;
  percent: number;
  amountCents: Cents;
}

/**
 * Anteprima della ripartizione di un importo: quanto finisce in ogni salvadanaio.
 * La somma delle tre righe e' sempre uguale all'importo di partenza.
 */
export function previewSplit(amountCents: Cents, split: Split): SplitPreviewRow[] {
  const [save, spend, give] = allocateByPercent(amountCents, [split.save, split.spend, split.give]);
  return [
    { jar: 'SAVE', percent: split.save, amountCents: save },
    { jar: 'SPEND', percent: split.spend, amountCents: spend },
    { jar: 'GIVE', percent: split.give, amountCents: give },
  ];
}
