/**
 * Analisi di un fotogramma: qualita', ricerca della griglia 3x3, campionamento.
 *
 * L'immagine arriva come buffer RGBA ridimensionato (tipicamente 160x160):
 * lavorare in piccolo e' abbastanza per riconoscere nove quadratoni e tiene
 * la scansione fluida anche su telefoni economici.
 */

import { Rgb, colorDistance, rgbToLab } from './color';
import { Mat3, applyMat } from './homography';
import { GridResult, Rect, trovaCubo } from './grid';

export interface Frame {
  /** RGBA, 4 byte per pixel. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
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
    /** Quanto qualcosa copriva il quadratino peggiore. */
    outliers: number;
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

/**
 * La ricerca vera e propria sta in grid.ts: trova il cubo ovunque sia
 * nell'inquadratura, di qualunque dimensione, inclinato o in prospettiva.
 * Qui restiamo con la firma comoda per chi analizza un fotogramma.
 */
export function detectGrid(f: Frame, region: Rect, precedente?: GridResult): GridResult {
  return trovaCubo(grayscale(f), f.width, f.height, region, { precedente });
}

/* ------------------------------------------------------------------ */
/* Campionamento dei nove quadratini                                   */
/* ------------------------------------------------------------------ */

export interface CellSample {
  color: Rgb;
  /**
   * Quanto e' disomogenea la PARTE BUONA della cella, dopo aver scartato gli
   * estremi. Misura la qualita' del colore letto, non l'imprecisione del
   * campionamento.
   */
  spread: number;
  /**
   * Frazione di punti nettamente diversi dal resto: e' il segnale di "qualcosa
   * copre parte del quadratino" (una mano, un dito, un riflesso concentrato).
   *
   * E' diverso da `spread`, e la differenza conta: un cubo inclinato dava
   * spread alto pur essendo perfettamente leggibile, mentre una mano che ne
   * copriva meta' dava spread piu' basso. Misurando la frazione di punti
   * "fuori dal gruppo" i due casi si separano bene.
   */
  outliers: number;
  /** Frazione di punti con almeno un canale saturo. */
  clipped: number;
}

/**
 * Preleva il colore di una cella campionando tanti punti nella sua parte
 * centrale, attraverso l'omografia: cosi i punti seguono il cubo anche quando
 * e' inclinato o in prospettiva, invece di cadere sui vicini.
 *
 * Il colore finale e' una MEDIA TAGLIATA in spazio Lab: si buttano via i punti
 * piu' lontani dal centro del gruppo (riflessi, un dito, il bordo nero) e si fa
 * la media dei restanti. Sulla mediana per canale ha un vantaggio preciso: la
 * mediana presa canale per canale puo' restituire un colore che nella cella non
 * c'era affatto, mentre questa resta sempre un colore davvero presente.
 */
export function sampleCellFromQuad(
  f: Frame,
  H: Mat3,
  riga: number,
  colonna: number,
): CellSample {
  const punti: Rgb[] = [];
  let clipped = 0;

  const passi = 7;
  // Restiamo nel 52% centrale della cella: fuori ci sono il bordo nero e il
  // riflesso che di solito si forma sullo spigolo dell'adesivo.
  const da = 0.24;
  const a = 0.76;

  for (let i = 0; i < passi; i++) {
    for (let j = 0; j < passi; j++) {
      const u = (colonna + da + ((a - da) * i) / (passi - 1)) / 3;
      const v = (riga + da + ((a - da) * j) / (passi - 1)) / 3;
      const [x, y] = applyMat(H, u, v);
      if (x < 0 || y < 0 || x >= f.width || y >= f.height) continue;
      const p = px(f, x, y);
      punti.push(p);
      if (p.r >= 250 || p.g >= 250 || p.b >= 250) clipped++;
    }
  }

  if (punti.length === 0) {
    return { color: { r: 0, g: 0, b: 0 }, spread: 1, outliers: 1, clipped: 1 };
  }

  const labs = punti.map(rgbToLab);
  const medio = {
    L: labs.reduce((s, l) => s + l.L, 0) / labs.length,
    a: labs.reduce((s, l) => s + l.a, 0) / labs.length,
    b: labs.reduce((s, l) => s + l.b, 0) / labs.length,
  };
  const distanze = labs.map((l) => colorDistance(l, medio));
  const ordinate = distanze.slice().sort((x, y) => x - y);
  // Teniamo il 60% dei punti piu' vicini al centro del gruppo.
  const soglia = ordinate[Math.floor(ordinate.length * 0.6)];

  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let i = 0; i < punti.length; i++) {
    if (distanze[i] > soglia) continue;
    sr += punti[i].r;
    sg += punti[i].g;
    sb += punti[i].b;
    n++;
  }
  const color = n > 0 ? { r: sr / n, g: sg / n, b: sb / n } : punti[0];

  // Dispersione della parte tenuta: dice quanto e' pulito il colore che usiamo.
  let sommaTenuti = 0;
  for (let i = 0; i < punti.length; i++) if (distanze[i] <= soglia) sommaTenuti += distanze[i];
  const spread = Math.min(1, sommaTenuti / Math.max(1, n) / 40);

  // Punti nettamente fuori dal gruppo: e' il segnale dell'occlusione. La soglia
  // e' relativa alla dispersione della cella stessa, cosi funziona sia su un
  // adesivo scuro sia su uno chiaro.
  const limite = Math.max(14, (sommaTenuti / Math.max(1, n)) * 4);
  let fuori = 0;
  for (const d of distanze) if (d > limite) fuori++;

  return {
    color,
    spread,
    outliers: fuori / punti.length,
    clipped: clipped / punti.length,
  };
}

/** Preleva tutti e nove i quadratini a partire dal cubo trovato. */
export function sampleFace(f: Frame, grid: GridResult): CellSample[] {
  const out: CellSample[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out.push(sampleCellFromQuad(f, grid.H, row, col));
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
  /** Cubo trovato nel fotogramma precedente: rende la ricerca molto piu' veloce. */
  previousGrid?: GridResult;
}

export interface FrameAnalysis {
  quality: QualityReport;
  grid: GridResult;
  cells: CellSample[] | null;
  gray: Float32Array;
}

export function analyzeFrame(f: Frame, opts: AnalyzeOptions): FrameAnalysis {
  const gray = grayscale(f);
  const grid = trovaCubo(gray, f.width, f.height, opts.region, {
    precedente: opts.previousGrid,
  });

  let brightness = 0;
  for (let i = 0; i < gray.length; i++) brightness += gray[i];
  brightness /= gray.length;

  const sharp = sharpness(gray, f.width, f.height);
  const motion = opts.previousGray ? motionScore(gray, opts.previousGray) : 0;

  const cells = grid.found ? sampleFace(f, grid) : null;
  let clipped = 0;
  let spread = 0;
  let outliers = 0;
  if (cells) {
    for (const c of cells) {
      clipped = Math.max(clipped, c.clipped);
      spread = Math.max(spread, c.spread);
      outliers = Math.max(outliers, c.outliers);
    }
  }

  const issues: QualityIssue[] = [];
  if (!grid.found) issues.push('non-trovato');
  // Sotto meta' del fotogramma i colori cominciano a impastarsi; il banco di
  // prova dice che fino a circa 0.45 la lettura resta sopra il 98%.
  else if (grid.coverage < 0.45) issues.push('lontano');
  if (brightness < 45) issues.push('buio');
  if (brightness > 218) issues.push('troppa-luce');
  /*
   * Niente controllo sui pixel saturi come sbarramento.
   *
   * Da una sola immagine piccola non si distingue un adesivo BIANCO ben
   * illuminato (satura, ed e' giusto cosi) da un riflesso su un adesivo
   * colorato: misurato, entrambi danno saturazione piena. Bloccare su questo
   * significava rifiutare all'infinito facce perfettamente leggibili.
   *
   * Il riflesso che rovina davvero un colore viene preso piu' avanti, dove ci
   * sono piu' informazioni: dalla sicurezza della classificazione, dalla
   * fusione di piu' fotogrammi, dal controllo incrociato fra le facce e dal
   * vincolo dei nove per colore. Qui il dato resta nei dettagli, per l'area
   * avanzata.
   */
  // Una faccia a fuoco, anche ridimensionata a 160 px, ha bordi netti fra gli
  // adesivi e supera abbondantemente questa soglia; sotto vuol dire mosso.
  if (sharp < 35) issues.push('sfocato');
  if (motion > 0.045) issues.push('movimento');
  if (outliers > 0.3) issues.push('coperto');

  // Punteggio complessivo, usato per decidere se il fotogramma vale.
  const norm = (v: number, good: number, bad: number) =>
    Math.max(0, Math.min(1, (v - bad) / (good - bad)));
  const score =
    (grid.found ? 1 : 0) *
    (0.3 * norm(sharp, 90, 8) +
      0.2 * norm(1 - motion, 1, 0.9) +
      0.2 * norm(grid.coverage, 0.85, 0.35) +
      0.15 * norm(1 - outliers, 1, 0.45) +
      0.15 * norm(1 - spread, 1, 0.6));

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
        outliers,
      },
    },
    grid,
    cells,
    gray,
  };
}

export type { GridResult, Rect };
