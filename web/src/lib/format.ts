/** Formattazione condivisa: importi, date, testi. */

export function formatCents(cents: number, opts: { simbolo?: boolean } = {}): string {
  if (!Number.isFinite(cents)) return '—';
  const simbolo = opts.simbolo !== false;
  const negativo = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const euro = Math.floor(abs / 100);
  const resto = abs % 100;
  const euroStr = String(euro).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '−' : ''}${simbolo ? '€ ' : ''}${euroStr},${String(resto).padStart(2, '0')}`;
}

/** Converte quello che scrive l'utente ("3,50", "3.5", "€3") in centesimi. */
export function parseEuroToCents(valore: string): number | null {
  const pulito = valore.trim().replace(/[€\s]/g, '').replace(',', '.');
  if (!/^\d*(\.\d{0,2})?$/.test(pulito) || pulito === '' || pulito === '.') return null;
  const numero = Number(pulito);
  if (!Number.isFinite(numero)) return null;
  return Math.round(Number((numero * 100).toPrecision(15)));
}

/** Percentuale in stile italiano: 61.3 -> "61,3%". */
export function formatPercent(valore: number, decimali = 1): string {
  if (!Number.isFinite(valore)) return '—';
  const arrotondato = Number(valore.toFixed(decimali));
  return `${String(Number.isInteger(arrotondato) ? arrotondato : arrotondato.toFixed(decimali)).replace('.', ',')}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function formatDayMonth(iso: string): string {
  const d = new Date(iso);
  const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return `${d.getDate()} ${mesi[d.getMonth()]}`;
}

export function settimaneTesto(weeks: number | null): string {
  if (weeks === null || weeks === undefined) return 'ancora non lo so';
  if (weeks <= 0) return 'ci sei già!';
  return weeks === 1 ? 'circa 1 settimana' : `circa ${weeks} settimane`;
}

export const JAR_INFO = {
  SAVE: { nome: 'SAVE', sottotitolo: 'Risparmio', emoji: '🟢', colore: 'var(--save)', descrizione: 'I soldi per il tuo obiettivo' },
  SPEND: { nome: 'SPEND', sottotitolo: 'Spese', emoji: '🔵', colore: 'var(--spend)', descrizione: 'I soldi che puoi usare adesso' },
  GIVE: { nome: 'GIVE', sottotitolo: 'Dono', emoji: '🟠', colore: 'var(--give)', descrizione: 'I soldi per aiutare gli altri' },
} as const;

export type JarType = keyof typeof JAR_INFO;
