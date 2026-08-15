/**
 * Riconoscimento dei colori del cubo.
 *
 * Il problema vero non e' "che RGB ha questo pixel": e' che rosso e arancione
 * (e blu e verde) hanno valori vicinissimi, e la luce di casa li sposta di
 * parecchio. Un semplice confronto con sei colori fissi sbaglia spesso.
 *
 * Qui si fanno tre cose:
 *
 * 1. si lavora in spazio Lab, dove la distanza fra due colori assomiglia a
 *    quanto li vediamo diversi noi, e si pesa poco la luminosita' (che cambia
 *    con ombre e riflessi) e molto la tinta;
 * 2. si usano come riferimento i SEI CENTRI DEL CUBO REALE appena letti, non
 *    sei colori teorici: cosi la calibrazione e' automatica per ogni cubo,
 *    ogni telefono e ogni lampadina;
 * 3. alla fine si sfrutta un vincolo che il cubo ci regala: ogni colore compare
 *    ESATTAMENTE nove volte. L'assegnazione finale e' quindi un problema di
 *    abbinamento a costo minimo, non una serie di scelte indipendenti. E' qui
 *    che rosso/arancione smettono di sbagliarsi.
 */

import { CubeColor, COLOR_COUNT } from '../cube/defs';

export interface Rgb {
  r: number; // 0..255
  g: number;
  b: number;
}

export interface Lab {
  L: number;
  a: number;
  b: number;
}

/* ------------------------------------------------------------------ */
/* Conversioni                                                         */
/* ------------------------------------------------------------------ */

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB -> CIE Lab (illuminante D65). */
export function rgbToLab({ r, g, b }: Rgb): Lab {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);

  let x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  let y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  let z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x);
  y = f(y);
  z = f(z);

  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

export interface Hsv {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max <= 1e-6 ? 0 : d / max, v: max };
}

/**
 * Distanza percettiva fra due colori.
 * La luminosita' pesa poco: un adesivo in ombra o con un riflesso resta lo
 * stesso colore. Tinta e saturazione pesano molto.
 */
export function colorDistance(x: Lab, y: Lab): number {
  const dL = (x.L - y.L) * 0.35;
  const da = x.a - y.a;
  const db = x.b - y.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/* ------------------------------------------------------------------ */
/* Calibrazione                                                        */
/* ------------------------------------------------------------------ */

/** Colori di riferimento di partenza, prima di aver visto i centri veri. */
const DEFAULT_REFERENCES: Record<CubeColor, Rgb> = {
  [CubeColor.White]: { r: 236, g: 236, b: 232 },
  [CubeColor.Yellow]: { r: 232, g: 200, b: 40 },
  [CubeColor.Red]: { r: 190, g: 40, b: 42 },
  [CubeColor.Orange]: { r: 226, g: 110, b: 30 },
  [CubeColor.Blue]: { r: 30, g: 70, b: 170 },
  [CubeColor.Green]: { r: 40, g: 150, b: 70 },
};

export interface Calibration {
  /** Riferimento Lab per ciascun colore. */
  refs: Record<CubeColor, Lab>;
  /** Quanti campioni hanno contribuito a ciascun riferimento. */
  weights: Record<CubeColor, number>;
  /** Scostamento medio del bianco: serve a correggere la dominante della luce. */
  whiteBalance: { dr: number; dg: number; db: number };
}

export function defaultCalibration(): Calibration {
  const refs = {} as Record<CubeColor, Lab>;
  const weights = {} as Record<CubeColor, number>;
  for (let c = 0; c < COLOR_COUNT; c++) {
    refs[c as CubeColor] = rgbToLab(DEFAULT_REFERENCES[c as CubeColor]);
    weights[c as CubeColor] = 1;
  }
  return { refs, weights, whiteBalance: { dr: 0, dg: 0, db: 0 } };
}

/**
 * Aggiorna la calibrazione con un campione di cui conosciamo il colore
 * (tipicamente il centro di una faccia appena scansionata).
 * La media e' pesata: piu' campioni arrivano, piu' il riferimento si stabilizza.
 */
export function learnReference(calib: Calibration, color: CubeColor, sample: Rgb): void {
  const lab = rgbToLab(sample);
  const w = calib.weights[color];
  const ref = calib.refs[color];
  // Diamo peso pieno ai primi campioni e poi rallentiamo (media mobile).
  const k = 1 / Math.min(w + 1, 8);
  calib.refs[color] = {
    L: ref.L + (lab.L - ref.L) * k,
    a: ref.a + (lab.a - ref.a) * k,
    b: ref.b + (lab.b - ref.b) * k,
  };
  calib.weights[color] = w + 1;

  if (color === CubeColor.White) {
    // Se il bianco viene letto giallastro, ce ne accorgiamo qui.
    const mean = (sample.r + sample.g + sample.b) / 3;
    calib.whiteBalance = {
      dr: mean - sample.r,
      dg: mean - sample.g,
      db: mean - sample.b,
    };
  }
}

/** Applica la correzione della dominante di luce imparata dal bianco. */
export function applyWhiteBalance(calib: Calibration, s: Rgb): Rgb {
  const { dr, dg, db } = calib.whiteBalance;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return { r: clamp(s.r + dr), g: clamp(s.g + dg), b: clamp(s.b + db) };
}

/* ------------------------------------------------------------------ */
/* Normalizzazione dell'esposizione                                    */
/* ------------------------------------------------------------------ */

/**
 * Riporta i nove quadratini di una faccia a una luminosita' di riferimento.
 *
 * Serve per un problema misurato: in penombra TUTTI i colori si avvicinano fra
 * loro, quindi tutte le distanze dai riferimenti crescono insieme e il margine
 * fra la prima e la seconda ipotesi si assottiglia. Risultato: la lettura era
 * giusta, ma l'app la dichiarava incerta (sicurezza 0.19 invece di 1.00) e
 * continuava a rifiutare la faccia chiedendo al bambino di avvicinare il cubo,
 * cosa che non c'entrava niente.
 *
 * Il guadagno e' UNO SOLO, uguale per i tre canali: alza o abbassa la
 * luminosita' senza toccare la tinta.
 *
 * La tentazione e' di correggere canale per canale (il classico "massimo per
 * canale" della costanza cromatica), ma su una faccia del cubo e' pericoloso:
 * se quella faccia non ha nessun adesivo chiaro — capita spesso, per esempio
 * con blu, rosso e verde insieme — la stima del colore della luce e' sbagliata
 * e i colori vengono storti. Provato: rompeva la lettura dei 54 quadratini.
 * La dominante di colore della lampadina viene gia' corretta altrove, imparata
 * dal centro bianco (vedi applyWhiteBalance).
 */
export function stimaLuminosita(campioni: Rgb[]): number {
  if (campioni.length === 0) return RIFERIMENTO_CHIARO;
  const lumi = campioni
    .map((c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b)
    .sort((a, b) => a - b);
  // Percentile alto invece del massimo: un singolo quadratino bruciato non
  // deve decidere per tutti.
  return lumi[Math.min(lumi.length - 1, Math.floor(lumi.length * 0.9))];
}

/** Livello a cui portiamo il quadratino piu' chiaro: quello di un adesivo bianco. */
const RIFERIMENTO_CHIARO = 236;

export function normalizzaEsposizione(campioni: Rgb[]): Rgb[] {
  const piuChiaro = stimaLuminosita(campioni);
  // Guadagno limitato: senza limite, una faccia tutta scura verrebbe
  // "schiarita" fino a inventarsi colori che non ci sono.
  const guadagno = Math.max(0.7, Math.min(2.4, RIFERIMENTO_CHIARO / Math.max(30, piuChiaro)));
  if (Math.abs(guadagno - 1) < 0.02) return campioni;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return campioni.map((c) => ({
    r: clamp(c.r * guadagno),
    g: clamp(c.g * guadagno),
    b: clamp(c.b * guadagno),
  }));
}

/**
 * Classifica i nove quadratini di una faccia, normalizzando prima
 * l'esposizione. E' il modo giusto di leggere una faccia: i quadratini vanno
 * guardati insieme, perche' e' il loro insieme a dire com'era la luce.
 */
export function classificaFaccia(campioni: Rgb[], calib: Calibration): ColorGuess[] {
  return normalizzaEsposizione(campioni).map((c) => classifySticker(c, calib));
}

/* ------------------------------------------------------------------ */
/* Classificazione di un singolo quadratino                            */
/* ------------------------------------------------------------------ */

export interface ColorGuess {
  color: CubeColor;
  /** 0..1 — quanto siamo sicuri. Sotto 0.7 non accettiamo in automatico. */
  confidence: number;
  /** Seconda ipotesi: serve per dire "e rosso o arancione?". */
  runnerUp: CubeColor;
  distances: number[];
}

/**
 * Classificazione indipendente, usata durante l'inquadratura per l'anteprima
 * dal vivo. E' veloce ma puo' sbagliare su rosso/arancione: per questo la
 * decisione definitiva la prende `assignAllStickers`.
 */
export function classifySticker(sample: Rgb, calib: Calibration): ColorGuess {
  const balanced = applyWhiteBalance(calib, sample);
  const lab = rgbToLab(balanced);
  const hsv = rgbToHsv(balanced);

  const distances: number[] = [];
  for (let c = 0; c < COLOR_COUNT; c++) {
    let d = colorDistance(lab, calib.refs[c as CubeColor]);
    // Il bianco e' l'unico colore poco saturo: usiamo questa informazione,
    // altrimenti un adesivo colorato molto illuminato rischia di sembrare bianco.
    if (c === CubeColor.White) d += hsv.s > 0.32 ? 45 * (hsv.s - 0.32) : 0;
    else d += hsv.s < 0.18 ? 45 * (0.18 - hsv.s) : 0;
    distances.push(d);
  }

  let best = 0;
  let second = 1;
  for (let c = 1; c < COLOR_COUNT; c++) if (distances[c] < distances[best]) best = c;
  second = best === 0 ? 1 : 0;
  for (let c = 0; c < COLOR_COUNT; c++) {
    if (c !== best && distances[c] < distances[second]) second = c;
  }

  // La sicurezza dipende da quanto il primo stacca il secondo.
  const margin = distances[second] - distances[best];
  const confidence = Math.max(0, Math.min(1, margin / 26));

  return {
    color: best as CubeColor,
    confidence,
    runnerUp: second as CubeColor,
    distances,
  };
}

/* ------------------------------------------------------------------ */
/* Assegnazione globale dei 54 quadratini                              */
/* ------------------------------------------------------------------ */

export interface StickerAssignment {
  colors: CubeColor[]; // 54
  confidences: number[]; // 54
  /** Indici (0..53) da far ricontrollare al bambino, i meno sicuri per primi. */
  uncertain: number[];
}

/**
 * Assegna i 54 quadratini sfruttando il vincolo "nove per colore".
 *
 * Il problema e' un abbinamento a costo minimo fra 54 quadratini e 54 posti
 * (nove per ciascun colore): lo risolviamo con l'algoritmo ungherese, che
 * trova l'ottimo esatto. E' molto piu' affidabile che decidere un quadratino
 * alla volta, perche' un rosso incerto viene messo fra i rossi solo se
 * "toglierlo" agli arancioni non peggiora il totale.
 */
export function assignAllStickers(samples: Rgb[], calib: Calibration): StickerAssignment {
  if (samples.length !== 54) throw new Error('Servono esattamente 54 campioni');

  /*
   * Normalizziamo FACCIA PER FACCIA, non tutte insieme: le sei facce vengono
   * fotografate in momenti e orientamenti diversi, quindi ognuna ha la sua
   * luce. Livellarle tutte con un unico guadagno mescolerebbe i problemi.
   */
  const normalizzati: Rgb[] = new Array(54);
  for (let faccia = 0; faccia < 6; faccia++) {
    const nove = normalizzaEsposizione(samples.slice(faccia * 9, faccia * 9 + 9));
    for (let i = 0; i < 9; i++) normalizzati[faccia * 9 + i] = nove[i];
  }

  const labs = normalizzati.map((s) => rgbToLab(applyWhiteBalance(calib, s)));
  const hsvs = normalizzati.map((s) => rgbToHsv(applyWhiteBalance(calib, s)));

  // Costo di assegnare il quadratino i al colore c.
  const cost: number[][] = labs.map((lab, i) => {
    const row: number[] = [];
    for (let c = 0; c < COLOR_COUNT; c++) {
      let d = colorDistance(lab, calib.refs[c as CubeColor]);
      if (c === CubeColor.White) d += hsvs[i].s > 0.32 ? 45 * (hsvs[i].s - 0.32) : 0;
      else d += hsvs[i].s < 0.18 ? 45 * (0.18 - hsvs[i].s) : 0;
      row.push(d);
    }
    return row;
  });

  // 54 x 54: ogni colore ha nove "posti".
  const big: number[][] = cost.map((row) => {
    const out: number[] = [];
    for (let c = 0; c < COLOR_COUNT; c++) for (let k = 0; k < 9; k++) out.push(row[c]);
    return out;
  });

  const assignment = hungarian(big);
  const colors: CubeColor[] = new Array(54);
  const confidences: number[] = new Array(54);

  for (let i = 0; i < 54; i++) {
    const color = Math.floor(assignment[i] / 9) as CubeColor;
    colors[i] = color;
    // Sicurezza: quanto il colore scelto stacca il migliore degli altri.
    const mine = cost[i][color];
    let bestOther = Infinity;
    for (let c = 0; c < COLOR_COUNT; c++) if (c !== color) bestOther = Math.min(bestOther, cost[i][c]);
    confidences[i] = Math.max(0, Math.min(1, (bestOther - mine) / 26));
  }

  const uncertain = colors
    .map((_, i) => i)
    .filter((i) => confidences[i] < 0.7)
    .sort((a, b) => confidences[a] - confidences[b]);

  return { colors, confidences, uncertain };
}

/**
 * Algoritmo ungherese (Kuhn-Munkres) su matrice quadrata, O(n^3).
 * Restituisce, per ogni riga, la colonna assegnata.
 */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const INF = Number.POSITIVE_INFINITY;
  // Implementazione classica con potenziali (u, v) e cammini aumentanti.
  const u = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1); // p[j] = riga assegnata alla colonna j
  const way = new Int32Array(n + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(INF);
    const used = new Uint8Array(n + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const result = new Array<number>(n);
  for (let j = 1; j <= n; j++) result[p[j] - 1] = j - 1;
  return result;
}
