/**
 * Stesse regole del server, replicate sul telefono per dare risposta immediata
 * agli slider (e per funzionare offline). Il server resta comunque l'autorità:
 * ricontrolla tutto prima di muovere il denaro.
 */
export interface Split { save: number; spend: number; give: number }

/** Ripartisce un importo in centesimi: la somma delle parti è sempre il totale. */
export function ripartisci(totaleCents: number, percentuali: number[]): number[] {
  const somma = percentuali.reduce((a, b) => a + b, 0);
  if (Math.abs(somma - 100) > 1e-9) throw new Error('Le percentuali devono fare 100');
  if (totaleCents === 0) return percentuali.map(() => 0);
  const esatti = percentuali.map((p) => (totaleCents * p) / 100);
  const base = esatti.map((v) => Math.floor(v));
  let residuo = totaleCents - base.reduce((a, b) => a + b, 0);
  const ordine = esatti
    .map((v, i) => ({ i, resto: v - Math.floor(v), percent: percentuali[i] }))
    .sort((a, b) => b.resto - a.resto || b.percent - a.percent || a.i - b.i);
  for (let k = 0; residuo > 0; k = (k + 1) % ordine.length) {
    base[ordine[k].i] += 1;
    residuo -= 1;
  }
  return base;
}

/** Riporta gli slider a un totale di 100 rispettando il minimo di GIVE. */
export function normalizzaSplit(split: Split, minGive: number, mossa?: keyof Split): Split {
  const min = Math.max(0, Math.min(100, Math.round(minGive)));
  const arrotonda = (v: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(v) ? v : 0)));
  const out: Split = { save: arrotonda(split.save), spend: arrotonda(split.spend), give: arrotonda(split.give) };
  if (out.give < min) out.give = min;

  const ordine: (keyof Split)[] = (['save', 'spend', 'give'] as (keyof Split)[])
    .filter((k) => k !== mossa)
    .concat(mossa ? [mossa] : []);

  let delta = 100 - (out.save + out.spend + out.give);
  for (const chiave of ordine) {
    if (delta === 0) break;
    const minChiave = chiave === 'give' ? min : 0;
    const spazio = delta > 0 ? 100 - out[chiave] : out[chiave] - minChiave;
    const passo = Math.sign(delta) * Math.min(Math.abs(delta), spazio);
    out[chiave] += passo;
    delta -= passo;
  }
  if (delta !== 0) out.give = Math.max(min, out.give + delta);
  return out;
}

export function splitValido(split: Split, minGive: number): boolean {
  return split.save + split.spend + split.give === 100 && split.give >= minGive &&
    [split.save, split.spend, split.give].every((v) => Number.isInteger(v) && v >= 0 && v <= 100);
}
