/**
 * Analisi di un fotogramma: qualita', ricerca della griglia 3x3, campionamento.
 *
 * L'immagine arriva come buffer RGBA ridimensionato (tipicamente 160x160):
 * lavorare in piccolo e' abbastanza per riconoscere nove quadratoni e tiene
 * la scansione fluida anche su telefoni economici.
 */

import { Rgb } from './color';

export interface Frame {
  /** RGBA, 4 byte per pixel. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function px(f: Frame, x: number, y: number): Rgb {
  const xi = Math.max(0, Math.min(f.width - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(f.height - 1, Math.round(y)));
  const i = (yi * f.width + xi) * 4;
  return { r: f.data[i], g: f.data[i + 1], b: f.data[i + 2] };
}

export function luma(c: Rgb): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

/** Mappa di luminosita', riusata da tutti i controlli di qualita'. */
export function grayscale(f: Frame): Float32Array {
  const out = new Float32Array(f.width * f.height);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = 0.299 * f.data[i] + 0.587 * f.data[i + 1] + 0.114 * f.data[i + 2];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Controlli di qualita'                                               */
/* ------------------------------------------------------------------ */

export type QualityIssue =
  | 'buio'
  | 'troppa-luce'
  | 'riflesso'
  | 'sfocato'
  | 'movimento'
  | 'lontano'
  | 'coperto'
  | 'non-trovato';

export interface QualityReport {
  ok: boolean;
  /** 0..1, quanto e' buono questo fotogramma nel complesso. */
  score: number;
  issues: QualityIssue[];
  /** Frase di Rubi che spiega al bambino cosa fare. */
  advice: string;
  details: {
    brightness: number;
    clipped: number;
    sharpness: number;
    motion: number;
    gridStrength: number;
    coverage: number;
  };
}

/** Consigli in ordine di priorita': mostriamo solo il piu' importante. */
const ADVICE: Record<QualityIssue, string> = {
  'non-trovato': 'Non vedo ancora il cubo. Mettilo davanti alla fotocamera!',
  lontano: 'Il cubo e un pochino lontano. Avvicinalo!',
  coperto: 'Non riesco a vedere tutto il cubo. Sposta un pochino la mano.',
  sfocato: 'Si vede un po sfocato. Tieni fermo il cubo un attimo!',
  movimento: 'Ops! Tienilo fermo per un secondo.',
  riflesso: 'C e un riflesso sul cubo. Girati un pochino!',
  'troppa-luce': 'C e troppa luce. Prova a spostarti un po.',
  buio: 'Qui e un po buio. Andiamo dove c e piu luce?',
};

/** Varianza del laplaciano: la misura classica della messa a fuoco. */
export function sharpness(gray: Float32Array, w: number, h: number): number {
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += lap;
      sum2 += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

/** Differenza media fra due fotogrammi: rileva se il cubo si sta muovendo. */
export function motionScore(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length / 255;
}

/* ------------------------------------------------------------------ */
/* Ricerca della griglia 3x3                                           */
/* ------------------------------------------------------------------ */

export interface GridResult {
  found: boolean;
  /** Confini delle celle sull'asse X (4 valori: bordo, 1/3, 2/3, bordo). */
  xs: number[];
  ys: number[];
  /** Quanto sono nette le linee della griglia (0..1). */
  strength: number;
  /** Frazione della zona di inquadratura occupata dal cubo (0..1). */
  coverage: number;
}

/**
 * Trova le due righe e le due colonne che separano i nove quadratini.
 *
 * Un adesivo e' uniforme al suo interno e stacca nettamente dal vicino: nel
 * profilo dei gradienti verticali compaiono quindi due picchi interni netti
 * (piu' i due bordi esterni). Cerchiamo esattamente quelli, intorno alle
 * posizioni attese (un terzo e due terzi), invece di scansionare tutta
 * l'immagine: la cornice di guida sullo schermo dice gia' al bambino dove
 * mettere il cubo, quindi ci serve solo la messa a punto fine.
 */
export function detectGrid(f: Frame, region: Rect): GridResult {
  const gray = grayscale(f);
  const { x, y, w, h } = region;

  const colProfile = new Float32Array(Math.max(1, Math.round(w)));
  const rowProfile = new Float32Array(Math.max(1, Math.round(h)));

  for (let j = 1; j < h - 1; j++) {
    for (let i = 1; i < w - 1; i++) {
      const gx = Math.round(x + i);
      const gy = Math.round(y + j);
      if (gx <= 0 || gy <= 0 || gx >= f.width - 1 || gy >= f.height - 1) continue;
      const p = gy * f.width + gx;
      colProfile[i] += Math.abs(gray[p + 1] - gray[p - 1]);
      rowProfile[j] += Math.abs(gray[p + f.width] - gray[p - f.width]);
    }
  }

  const xs = findInternalLines(colProfile, w);
  const ys = findInternalLines(rowProfile, h);

  const strength = Math.min(1, (xs.strength + ys.strength) / 2);
  const found = xs.ok && ys.ok && strength > 0.2;

  // Copertura: quanto della cornice e' occupato dal cubo. Con la messa a punto
  // fine sui bordi interni possiamo stimare il lato del cubo.
  const cellW = (xs.lines[2] - xs.lines[1]) || w / 3;
  const cellH = (ys.lines[2] - ys.lines[1]) || h / 3;
  const coverage = Math.min(1, ((cellW * 3) / w + (cellH * 3) / h) / 2);

  return {
    found,
    xs: xs.lines.map((v) => x + v),
    ys: ys.lines.map((v) => y + v),
    strength,
    coverage,
  };
}

/**
 * Cerca i due massimi del profilo dei gradienti vicino a 1/3 e 2/3.
 * Restituisce i quattro confini delle celle (0, l1, l2, size).
 */
function findInternalLines(
  profile: Float32Array,
  size: number,
): { ok: boolean; lines: number[]; strength: number } {
  const n = profile.length;
  if (n < 9) return { ok: false, lines: [0, size / 3, (2 * size) / 3, size], strength: 0 };

  const mean = profile.reduce((a, b) => a + b, 0) / n;
  const window = Math.max(2, Math.round(n * 0.12));

  const peakNear = (center: number): { pos: number; value: number } => {
    let bestPos = center;
    let bestVal = -1;
    const from = Math.max(1, Math.round(center - window));
    const to = Math.min(n - 2, Math.round(center + window));
    for (let i = from; i <= to; i++) {
      if (profile[i] > bestVal) {
        bestVal = profile[i];
        bestPos = i;
      }
    }
    return { pos: bestPos, value: bestVal };
  };

  const p1 = peakNear(n / 3);
  const p2 = peakNear((2 * n) / 3);

  // Un picco vale se stacca chiaramente dalla media del profilo.
  const rel = (v: number) => (mean <= 1e-6 ? 0 : Math.min(1, (v / mean - 1) / 1.5));
  const strength = (rel(p1.value) + rel(p2.value)) / 2;
  const ok = p2.pos - p1.pos > n * 0.15 && strength > 0.15;

  const scale = size / n;
  return {
    ok,
    lines: [0, p1.pos * scale, p2.pos * scale, size],
    strength,
  };
}

/* ------------------------------------------------------------------ */
/* Campionamento dei nove quadratini                                   */
/* ------------------------------------------------------------------ */

export interface CellSample {
  color: Rgb;
  /** Quanto e' uniforme la cella: alta variabilita' = riflesso, dito, bordo. */
  spread: number;
  /** Frazione di pixel bruciati (bianco pieno): tipico dei riflessi. */
  clipped: number;
}

/**
 * Preleva il colore di una cella prendendo la MEDIANA di tanti punti nella
 * parte centrale: cosi un riflesso o il bordo nero non spostano il risultato
 * come farebbe una media.
 */
export function sampleCell(f: Frame, x0: number, y0: number, x1: number, y1: number): CellSample {
  const insetX = (x1 - x0) * 0.22;
  const insetY = (y1 - y0) * 0.22;
  const ax = x0 + insetX;
  const ay = y0 + insetY;
  const bx = x1 - insetX;
  const by = y1 - insetY;

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  let clipped = 0;
  let total = 0;

  const steps = 6;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const p = px(f, ax + ((bx - ax) * i) / (steps - 1), ay + ((by - ay) * j) / (steps - 1));
      rs.push(p.r);
      gs.push(p.g);
      bs.push(p.b);
      // Basta UN canale saturo per rovinare la tinta: un riflesso su un adesivo
      // arancione manda il rosso a fondo scala e lo fa sembrare giallo.
      if (p.r >= 250 || p.g >= 250 || p.b >= 250) clipped++;
      total++;
    }
  }

  const median = (arr: number[]) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const color = { r: median(rs), g: median(gs), b: median(bs) };

  // Dispersione: distanza media dal valore mediano, normalizzata.
  let spread = 0;
  for (let i = 0; i < rs.length; i++) {
    spread +=
      Math.abs(rs[i] - color.r) + Math.abs(gs[i] - color.g) + Math.abs(bs[i] - color.b);
  }
  spread = spread / rs.length / 3 / 255;

  return { color, spread, clipped: total === 0 ? 0 : clipped / total };
}

/** Preleva tutti e nove i quadratini a partire dalla griglia trovata. */
export function sampleFace(f: Frame, grid: GridResult): CellSample[] {
  const out: CellSample[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out.push(sampleCell(f, grid.xs[col], grid.ys[row], grid.xs[col + 1], grid.ys[row + 1]));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Valutazione complessiva del fotogramma                              */
/* ------------------------------------------------------------------ */

export interface AnalyzeOptions {
  region: Rect;
  /** Grigio del fotogramma precedente, per capire se il cubo si muove. */
  previousGray?: Float32Array;
}

export interface FrameAnalysis {
  quality: QualityReport;
  grid: GridResult;
  cells: CellSample[] | null;
  gray: Float32Array;
}

export function analyzeFrame(f: Frame, opts: AnalyzeOptions): FrameAnalysis {
  const gray = grayscale(f);
  const grid = detectGrid(f, opts.region);

  let brightness = 0;
  for (let i = 0; i < gray.length; i++) brightness += gray[i];
  brightness /= gray.length;

  const sharp = sharpness(gray, f.width, f.height);
  const motion = opts.previousGray ? motionScore(gray, opts.previousGray) : 0;

  const cells = grid.found ? sampleFace(f, grid) : null;
  let clipped = 0;
  let spread = 0;
  if (cells) {
    for (const c of cells) {
      clipped = Math.max(clipped, c.clipped);
      spread = Math.max(spread, c.spread);
    }
  }

  const issues: QualityIssue[] = [];
  if (!grid.found) issues.push('non-trovato');
  else if (grid.coverage < 0.55) issues.push('lontano');
  if (brightness < 45) issues.push('buio');
  if (brightness > 218) issues.push('troppa-luce');
  if (clipped > 0.25) issues.push('riflesso');
  // Una faccia a fuoco, anche ridimensionata a 160 px, ha bordi netti fra gli
  // adesivi e supera abbondantemente questa soglia; sotto vuol dire mosso.
  if (sharp < 35) issues.push('sfocato');
  if (motion > 0.045) issues.push('movimento');
  if (spread > 0.16) issues.push('coperto');

  // Punteggio complessivo, usato per decidere se il fotogramma vale.
  const norm = (v: number, good: number, bad: number) =>
    Math.max(0, Math.min(1, (v - bad) / (good - bad)));
  const score =
    (grid.found ? 1 : 0) *
    (0.3 * norm(sharp, 90, 8) +
      0.2 * norm(1 - motion, 1, 0.9) +
      0.2 * norm(grid.coverage, 0.9, 0.4) +
      0.15 * norm(1 - clipped, 1, 0.6) +
      0.15 * norm(1 - spread, 1, 0.75));

  const first = issues[0];
  return {
    quality: {
      ok: issues.length === 0 && score > 0.55,
      score,
      issues,
      advice: first ? ADVICE[first] : 'Perfetto! Tienilo fermo cosi... 📸',
      details: {
        brightness,
        clipped,
        sharpness: sharp,
        motion,
        gridStrength: grid.strength,
        coverage: grid.coverage,
      },
    },
    grid,
    cells,
    gray,
  };
}
