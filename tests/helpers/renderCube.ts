/**
 * Generatore di "fotografie" sintetiche di una faccia del cubo.
 *
 * Serve a misurare il riconoscimento in condizioni realistiche senza dover
 * scattare centinaia di foto vere: cubo inclinato, storto, piccolo, spostato
 * dal centro, con luce calda o in penombra, riflessi, sfocatura e uno sfondo
 * che non e' un muro bianco.
 *
 * Il cubo viene disegnato attraverso una vera omografia (quindi con la
 * prospettiva, non un semplice rettangolo), cosi la pipeline deve affrontare
 * lo stesso problema che affronta con un bambino che tiene il cubo in mano.
 */

import { Frame } from '../../src/core/vision/frame';
import { Rgb } from '../../src/core/vision/color';
import { CubeColor } from '../../src/core/cube/defs';

export const STICKER_RGB: Record<CubeColor, Rgb> = {
  [CubeColor.White]: { r: 238, g: 238, b: 234 },
  [CubeColor.Yellow]: { r: 236, g: 205, b: 45 },
  [CubeColor.Red]: { r: 186, g: 38, b: 40 },
  [CubeColor.Orange]: { r: 228, g: 112, b: 28 },
  [CubeColor.Blue]: { r: 26, g: 72, b: 172 },
  [CubeColor.Green]: { r: 38, g: 152, b: 68 },
};

export interface SceneOptions {
  size?: number;
  /** Quanto del fotogramma occupa il cubo (0..1 del lato). */
  scala?: number;
  /** Spostamento dal centro, in frazione del lato. */
  offset?: { x: number; y: number };
  /** Inclinazione in gradi. */
  rotazione?: number;
  /** Forza della prospettiva (0 = frontale, 0.25 = molto inclinato). */
  prospettiva?: number;
  /** Moltiplicatori per canale: luce calda, fredda, penombra. */
  luce?: { r: number; g: number; b: number };
  /** Gradiente di luce da un lato all'altro. */
  gradiente?: number;
  /** Riflesso: cella e raggio (in frazione della cella). */
  riflesso?: { cella: number; raggio: number };
  rumore?: number;
  sfocatura?: number;
  /** Una mano (o un dito) che copre parte del cubo: cerchio in coordinate immagine. */
  occlusione?: { cx: number; cy: number; r: number };
  /** Sfondo: 'stanza' (grigio con venature) oppure un colore fisso. */
  sfondo?: 'stanza' | 'scuro' | 'chiaro';
  rng?: () => number;
}

type Mat3 = number[]; // 9 elementi, per righe

function matMulVec(m: Mat3, x: number, y: number): [number, number] {
  const d = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / d, (m[3] * x + m[4] * y + m[5]) / d];
}

function invert3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
}

/** Omografia che porta il quadrato unitario sui quattro angoli dati. */
export function homographyFromUnitSquare(
  q: [number, number][], // [alto-sx, alto-dx, basso-dx, basso-sx]
): Mat3 {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [
    x1 - x0 + g * x1,
    x3 - x0 + h * x3,
    x0,
    y1 - y0 + g * y1,
    y3 - y0 + h * y3,
    y0,
    g,
    h,
    1,
  ];
}

/** I quattro angoli del cubo nel fotogramma, date le opzioni della scena. */
export function cornersFor(o: SceneOptions): [number, number][] {
  const size = o.size ?? 160;
  const scala = o.scala ?? 0.8;
  const off = o.offset ?? { x: 0, y: 0 };
  const rot = ((o.rotazione ?? 0) * Math.PI) / 180;
  const persp = o.prospettiva ?? 0;

  const lato = size * scala;
  const cx = size / 2 + off.x * size;
  const cy = size / 2 + off.y * size;

  // Quadrato centrato, poi prospettiva (il lato destro si stringe), poi rotazione.
  const base: [number, number][] = [
    [-0.5, -0.5],
    [0.5, -0.5 * (1 - persp)],
    [0.5, 0.5 * (1 - persp)],
    [-0.5, 0.5],
  ];
  return base.map(([x, y]) => {
    const rx = x * Math.cos(rot) - y * Math.sin(rot);
    const ry = x * Math.sin(rot) + y * Math.cos(rot);
    return [cx + rx * lato, cy + ry * lato] as [number, number];
  });
}

/** Disegna la scena. `colori` sono i nove adesivi, dall'alto a sinistra. */
export function renderScene(colori: CubeColor[], o: SceneOptions = {}): Frame {
  const size = o.size ?? 160;
  const luce = o.luce ?? { r: 1, g: 1, b: 1 };
  const gradiente = o.gradiente ?? 0;
  const rumore = o.rumore ?? 0;
  const rng = o.rng ?? (() => 0.5);
  const sfondo = o.sfondo ?? 'stanza';

  const angoli = cornersFor(o);
  const H = homographyFromUnitSquare(angoli);
  const Hinv = invert3(H);

  const data = new Uint8ClampedArray(size * size * 4);
  /** Larghezza del bordo nero fra gli adesivi, in frazione della cella. */
  const bordo = 0.11;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const [u, v] = matMulVec(Hinv, px + 0.5, py + 0.5);

      let c: Rgb;
      let dentro = false;
      if (u >= 0 && u < 1 && v >= 0 && v < 1) {
        dentro = true;
        const col = Math.min(2, Math.floor(u * 3));
        const row = Math.min(2, Math.floor(v * 3));
        const fu = u * 3 - col;
        const fv = v * 3 - row;
        const suBordo = fu < bordo || fu > 1 - bordo || fv < bordo || fv > 1 - bordo;
        c = suBordo ? { r: 18, g: 18, b: 20 } : STICKER_RGB[colori[row * 3 + col]];

        if (!suBordo && o.riflesso && o.riflesso.cella === row * 3 + col) {
          const d = Math.hypot(fu - 0.5, fv - 0.5);
          const k = Math.max(0, 1 - d / o.riflesso.raggio);
          c = { r: c.r + 255 * k, g: c.g + 255 * k, b: c.b + 255 * k };
        }
      } else {
        // Sfondo: una stanza non e' mai uniforme.
        if (sfondo === 'scuro') c = { r: 34, g: 34, b: 38 };
        else if (sfondo === 'chiaro') c = { r: 205, g: 202, b: 196 };
        else {
          const t = Math.sin(px * 0.07) * 6 + Math.cos(py * 0.05) * 6;
          c = { r: 116 + t, g: 112 + t, b: 108 + t };
        }
      }

      // Una mano davanti al cubo: colore pelle, bordi morbidi.
      if (o.occlusione) {
        const d = Math.hypot(px - o.occlusione.cx, py - o.occlusione.cy);
        if (d < o.occlusione.r) {
          const k = Math.min(1, (o.occlusione.r - d) / 3);
          const pelle = { r: 214, g: 168, b: 140 };
          c = {
            r: c.r * (1 - k) + pelle.r * k,
            g: c.g * (1 - k) + pelle.g * k,
            b: c.b * (1 - k) + pelle.b * k,
          };
        }
      }

      const g = 1 + gradiente * (px / size - 0.5);
      let r = c.r * luce.r * g;
      let gg = c.g * luce.g * g;
      let b = c.b * luce.b * g;

      if (rumore > 0) {
        r += (rng() - 0.5) * rumore;
        gg += (rng() - 0.5) * rumore;
        b += (rng() - 0.5) * rumore;
      }

      const i = (py * size + px) * 4;
      data[i] = r;
      data[i + 1] = gg;
      data[i + 2] = b;
      data[i + 3] = 255;
      void dentro;
    }
  }

  const frame: Frame = { data, width: size, height: size };
  return o.sfocatura ? boxBlur(frame, o.sfocatura) : frame;
}

export function boxBlur(f: Frame, radius: number): Frame {
  const out = new Uint8ClampedArray(f.data.length);
  const r = Math.max(1, Math.round(radius));
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(f.width - 1, Math.max(0, x + dx));
          const yy = Math.min(f.height - 1, Math.max(0, y + dy));
          const i = (yy * f.width + xx) * 4;
          sr += f.data[i];
          sg += f.data[i + 1];
          sb += f.data[i + 2];
          n++;
        }
      }
      const i = (y * f.width + x) * 4;
      out[i] = sr / n;
      out[i + 1] = sg / n;
      out[i + 2] = sb / n;
      out[i + 3] = 255;
    }
  }
  return { data: out, width: f.width, height: f.height };
}

/* ------------------------------------------------------------------ */
/* Scene casuali, per misurare                                         */
/* ------------------------------------------------------------------ */

export interface Difficolta {
  nome: string;
  fai: (rng: () => number) => SceneOptions;
}

const fra = (rng: () => number, a: number, b: number) => a + rng() * (b - a);

export const DIFFICOLTA: Difficolta[] = [
  {
    nome: 'facile (frontale, luce buona)',
    fai: (rng) => ({
      scala: fra(rng, 0.75, 0.85),
      rotazione: fra(rng, -2, 2),
      rumore: 8,
      rng,
    }),
  },
  {
    nome: 'inclinato',
    fai: (rng) => ({
      scala: fra(rng, 0.62, 0.85),
      rotazione: fra(rng, -14, 14),
      offset: { x: fra(rng, -0.05, 0.05), y: fra(rng, -0.05, 0.05) },
      rumore: 10,
      rng,
    }),
  },
  {
    nome: 'lontano e spostato',
    fai: (rng) => ({
      scala: fra(rng, 0.45, 0.65),
      offset: { x: fra(rng, -0.12, 0.12), y: fra(rng, -0.12, 0.12) },
      rotazione: fra(rng, -8, 8),
      rumore: 10,
      rng,
    }),
  },
  {
    nome: 'prospettiva (cubo inclinato in avanti)',
    fai: (rng) => ({
      scala: fra(rng, 0.65, 0.85),
      prospettiva: fra(rng, 0.1, 0.24),
      rotazione: fra(rng, -8, 8),
      rumore: 10,
      rng,
    }),
  },
  {
    nome: 'luce difficile (calda, gradiente, penombra)',
    fai: (rng) => ({
      scala: fra(rng, 0.68, 0.85),
      rotazione: fra(rng, -6, 6),
      luce:
        rng() < 0.5
          ? { r: 1.16, g: 0.97, b: 0.76 }
          : { r: 0.62, g: 0.66, b: 0.74 },
      gradiente: fra(rng, 0.15, 0.4),
      rumore: 14,
      rng,
    }),
  },
  {
    nome: 'tutto insieme',
    fai: (rng) => ({
      scala: fra(rng, 0.5, 0.8),
      rotazione: fra(rng, -12, 12),
      prospettiva: fra(rng, 0, 0.18),
      offset: { x: fra(rng, -0.1, 0.1), y: fra(rng, -0.1, 0.1) },
      luce: { r: fra(rng, 0.7, 1.15), g: fra(rng, 0.75, 1.05), b: fra(rng, 0.7, 1.1) },
      gradiente: fra(rng, 0, 0.35),
      rumore: 14,
      riflesso: rng() < 0.4 ? { cella: Math.floor(rng() * 9), raggio: 0.22 } : undefined,
      rng,
    }),
  },
];
