import { describe, it, expect } from 'vitest';
import {
  Rgb,
  assignAllStickers,
  classificaFaccia,
  classifySticker,
  defaultCalibration,
  hungarian,
  learnReference,
  rgbToHsv,
  rgbToLab,
} from '../src/core/vision/color';
import {
  Frame,
  analyzeFrame,
  detectGrid,
  motionScore,
  sampleFace,
  sharpness,
  grayscale,
} from '../src/core/vision/frame';
import {
  SCAN_ORDER,
  colorsToFacelets,
  crossCheck,
  faceChecklist,
  finalizeScan,
  newScanner,
  pushFrame,
  readyForNextFace,
} from '../src/core/vision/scanner';
import { centroQuad, latoMedio } from '../src/core/vision/homography';
import { CubeColor, Face } from '../src/core/cube/defs';
import { cubieToFacelet, identityCube } from '../src/core/cube/cubie';
import { makeRng, scrambledCube } from '../src/core/cube/scramble';
import { validateFacelets } from '../src/core/cube/validator';

/* ------------------------------------------------------------------ */
/* Immagini finte: un cubo disegnato a tavolino                        */
/* ------------------------------------------------------------------ */

/** Colori "veri" di un cubo di plastica fotografato con luce neutra. */
const STICKER_RGB: Record<CubeColor, Rgb> = {
  [CubeColor.White]: { r: 238, g: 238, b: 234 },
  [CubeColor.Yellow]: { r: 236, g: 205, b: 45 },
  [CubeColor.Red]: { r: 186, g: 38, b: 40 },
  [CubeColor.Orange]: { r: 228, g: 112, b: 28 },
  [CubeColor.Blue]: { r: 26, g: 72, b: 172 },
  [CubeColor.Green]: { r: 38, g: 152, b: 68 },
};

interface RenderOptions {
  size?: number;
  /** Bordo nero fra gli adesivi, in pixel. */
  gap?: number;
  /** Moltiplicatori per canale: simula luce calda/fredda. */
  light?: { r: number; g: number; b: number };
  /** Gradiente di luce da sinistra a destra (0 = uniforme). */
  gradient?: number;
  /** Rumore casuale. */
  noise?: number;
  rng?: () => number;
  /** Sfocatura in pixel (raggio del box blur). */
  blur?: number;
  /** Riflesso bianco su una cella (indice 0..8). */
  glareCell?: number;
  /** Ampiezza del riflesso, in frazione della cella. */
  glareRadius?: number;
  /** Sposta tutta l'immagine di N pixel: simula il cubo non centrato. */
  offset?: { x: number; y: number };
}

function renderFace(colors: CubeColor[], opts: RenderOptions = {}): Frame {
  const size = opts.size ?? 160;
  const gap = opts.gap ?? 3;
  const light = opts.light ?? { r: 1, g: 1, b: 1 };
  const gradient = opts.gradient ?? 0;
  const noise = opts.noise ?? 0;
  const rng = opts.rng ?? (() => 0.5);
  const off = opts.offset ?? { x: 0, y: 0 };

  const data = new Uint8ClampedArray(size * size * 4);
  const cell = size / 3;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = x - off.x;
      const sy = y - off.y;
      const col = Math.floor(sx / cell);
      const row = Math.floor(sy / cell);
      const inX = sx - col * cell;
      const inY = sy - row * cell;

      let c: Rgb;
      const outside = col < 0 || col > 2 || row < 0 || row > 2;
      const onBorder = inX < gap || inY < gap || inX > cell - gap || inY > cell - gap;
      if (outside) c = { r: 60, g: 62, b: 66 }; // sfondo della stanza
      else if (onBorder) c = { r: 18, g: 18, b: 20 }; // plastica nera
      else c = STICKER_RGB[colors[row * 3 + col]];

      const g = 1 + gradient * (x / size - 0.5);
      let r = c.r * light.r * g;
      let gg = c.g * light.g * g;
      let b = c.b * light.b * g;

      if (!outside && !onBorder && opts.glareCell === row * 3 + col) {
        const d = Math.hypot(inX - cell * 0.5, inY - cell * 0.5);
        const k = Math.max(0, 1 - d / (cell * (opts.glareRadius ?? 0.25)));
        r += 255 * k;
        gg += 255 * k;
        b += 255 * k;
      }

      if (noise > 0) {
        r += (rng() - 0.5) * noise;
        gg += (rng() - 0.5) * noise;
        b += (rng() - 0.5) * noise;
      }

      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = gg;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  const frame: Frame = { data, width: size, height: size };
  return opts.blur ? boxBlur(frame, opts.blur) : frame;
}

function boxBlur(f: Frame, radius: number): Frame {
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

const FULL: { region: { x: number; y: number; w: number; h: number } } = {
  region: { x: 0, y: 0, w: 160, h: 160 },
};

/* ------------------------------------------------------------------ */

describe('spazi colore', () => {
  it('converte in Lab e HSV in modo sensato', () => {
    expect(rgbToLab({ r: 255, g: 255, b: 255 }).L).toBeCloseTo(100, 0);
    expect(rgbToLab({ r: 0, g: 0, b: 0 }).L).toBeCloseTo(0, 0);
    expect(rgbToHsv({ r: 255, g: 0, b: 0 }).h).toBeCloseTo(0, 0);
    expect(rgbToHsv({ r: 0, g: 255, b: 0 }).h).toBeCloseTo(120, 0);
    expect(rgbToHsv({ r: 200, g: 200, b: 200 }).s).toBeCloseTo(0, 2);
  });

  it("l'algoritmo ungherese trova l'abbinamento a costo minimo", () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    const a = hungarian(cost);
    const total = a.reduce((s, col, row) => s + cost[row][col], 0);
    expect(total).toBe(5);
    expect(new Set(a).size).toBe(3);
  });
});

describe('riconoscimento della griglia', () => {
  it('trova le linee della griglia su una faccia ben inquadrata', () => {
    const colors = [0, 1, 2, 3, 4, 5, 0, 1, 2] as CubeColor[];
    const grid = detectGrid(renderFace(colors), FULL.region);
    expect(grid.found).toBe(true);
    // Il cubo riempie il fotogramma: i quattro angoli devono stare vicino a
    // quelli dell'immagine, e il lato deve essere quasi tutto il fotogramma.
    const [cx, cy] = centroQuad(grid.quad);
    expect(Math.abs(cx - 80)).toBeLessThan(10);
    expect(Math.abs(cy - 80)).toBeLessThan(10);
    expect(latoMedio(grid.quad)).toBeGreaterThan(130);
  });

  it('non trova nessuna griglia su un muro vuoto', () => {
    const size = 160;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 130;
      data[i + 1] = 128;
      data[i + 2] = 126;
      data[i + 3] = 255;
    }
    const grid = detectGrid({ data, width: size, height: size }, FULL.region);
    expect(grid.found).toBe(false);
  });
});

describe('controlli di qualita', () => {
  const colors = [0, 1, 2, 3, 4, 5, 0, 1, 2] as CubeColor[];

  it('accetta un fotogramma nitido e ben illuminato', () => {
    const a = analyzeFrame(renderFace(colors), FULL);
    expect(a.quality.ok).toBe(true);
    expect(a.quality.advice).toContain('fermo');
  });

  it('rifiuta un fotogramma sfocato e lo dice in modo semplice', () => {
    const a = analyzeFrame(renderFace(colors, { blur: 5 }), FULL);
    expect(a.quality.ok).toBe(false);
    expect(a.quality.issues.some((i) => i === 'sfocato' || i === 'non-trovato')).toBe(true);
    expect(a.quality.advice).not.toMatch(/laplac|varian|threshold|error/i);
  });

  it('si accorge se e troppo buio o troppo illuminato', () => {
    const dark = analyzeFrame(renderFace(colors, { light: { r: 0.2, g: 0.2, b: 0.2 } }), FULL);
    expect(dark.quality.issues).toContain('buio');
    expect(dark.quality.advice).toContain('luce');

    const bright = analyzeFrame(
      renderFace(
        [CubeColor.White, CubeColor.White, CubeColor.White, CubeColor.White, CubeColor.White, CubeColor.White, CubeColor.White, CubeColor.White, CubeColor.White],
        { light: { r: 1.4, g: 1.4, b: 1.4 }, gap: 1 },
      ),
      FULL,
    );
    expect(bright.quality.issues.includes('troppa-luce') || bright.quality.issues.includes('riflesso')).toBe(true);
  });

  it('si accorge del movimento fra due fotogrammi', () => {
    const a = renderFace(colors);
    const b = renderFace(colors, { offset: { x: 9, y: 5 } });
    expect(motionScore(grayscale(a), grayscale(b))).toBeGreaterThan(0.045);
    expect(motionScore(grayscale(a), grayscale(a))).toBe(0);
  });

  it('la nitidezza cala quando si sfoca', () => {
    const sharp = renderFace(colors);
    const soft = renderFace(colors, { blur: 4 });
    expect(sharpness(grayscale(sharp), 160, 160)).toBeGreaterThan(
      sharpness(grayscale(soft), 160, 160),
    );
  });

  /**
   * Sui riflessi la difesa NON e' il singolo fotogramma.
   *
   * Da un'immagine piccola non si distingue un adesivo bianco ben illuminato
   * (satura, ed e' giusto) da un riflesso su un adesivo colorato: misurato,
   * danno la stessa saturazione, la stessa dispersione e la stessa sicurezza di
   * classificazione. Bloccare su quel segnale significava rifiutare all'infinito
   * facce perfettamente leggibili.
   *
   * La difesa vera e' che il riflesso SI SPOSTA quando il bambino muove il
   * cubo, mentre il colore dell'adesivo resta: fondendo piu' fotogrammi con la
   * mediana, il riflesso sparisce da solo. E' quello che verifichiamo qui.
   */
  it('un riflesso che si sposta viene cancellato dalla fusione dei fotogrammi', () => {
    const veri = colors;
    // Cinque fotogrammi, con il riflesso che ogni volta cade su una cella diversa.
    const perCella: { r: number; g: number; b: number }[][] = Array.from({ length: 9 }, () => []);
    for (const cella of [0, 2, 4, 6, 8]) {
      const f = renderFace(veri, { glareCell: cella, glareRadius: 0.8, noise: 8, rng: makeRng(cella + 1) });
      const a = analyzeFrame(f, FULL);
      expect(a.cells).not.toBeNull();
      a.cells!.forEach((c, i) => perCella[i].push(c.color));
    }

    const mediana = (v: number[]) => v.slice().sort((x, y) => x - y)[Math.floor(v.length / 2)];
    const fusi = perCella.map((campioni) => ({
      r: mediana(campioni.map((c) => c.r)),
      g: mediana(campioni.map((c) => c.g)),
      b: mediana(campioni.map((c) => c.b)),
    }));

    const letti = classificaFaccia(fusi, defaultCalibration()).map((g) => g.color);
    expect(letti).toEqual(veri);
  });

  it('un solo fotogramma con riflesso puo sbagliare: per questo se ne usano tanti', () => {
    // Documenta il limite, cosi resta chiaro perche' la fusione e' necessaria.
    const f = renderFace(colors, { glareCell: 4, glareRadius: 0.9 });
    const a = analyzeFrame(f, FULL);
    const letto = classificaFaccia(a.cells!.map((c) => c.color), defaultCalibration())[4].color;
    // Il quadratino centrale, sommerso dal riflesso, non e' piu' quello vero.
    expect(letto).not.toBe(colors[4]);
  });

  it('un riflessino piccolo non rovina la lettura (merito della mediana)', () => {
    const f = renderFace(colors, { glareCell: 4, glareRadius: 0.1 });
    const a = analyzeFrame(f, FULL);
    expect(a.quality.ok).toBe(true);
    const read = a.cells!.map((c) => classifySticker(c.color, defaultCalibration()).color);
    expect(read).toEqual(colors);
  });
});

describe('lettura dei colori', () => {
  const rng = makeRng(99);

  it('legge correttamente i nove colori con luce neutra', () => {
    const colors = [0, 1, 2, 3, 4, 5, 1, 2, 0] as CubeColor[];
    const f = renderFace(colors, { noise: 8, rng });
    const grid = detectGrid(f, FULL.region);
    const cells = sampleFace(f, grid);
    const calib = defaultCalibration();
    const read = cells.map((c) => classifySticker(c.color, calib).color);
    expect(read).toEqual(colors);
  });

  it('legge correttamente anche con luce calda (che sposta rosso e arancione)', () => {
    const colors = [
      CubeColor.Red, CubeColor.Orange, CubeColor.Red,
      CubeColor.Orange, CubeColor.Red, CubeColor.Orange,
      CubeColor.Red, CubeColor.Orange, CubeColor.Red,
    ];
    const f = renderFace(colors, { light: { r: 1.12, g: 0.97, b: 0.82 }, noise: 6, rng });
    const grid = detectGrid(f, FULL.region);
    const cells = sampleFace(f, grid);
    const calib = defaultCalibration();
    // impariamo il riferimento dal centro, come fa lo scanner
    learnReference(calib, CubeColor.Red, cells[4].color);
    const read = cells.map((c) => classifySticker(c.color, calib).color);
    expect(read).toEqual(colors);
  });

  it('la sicurezza cala su un colore ambiguo', () => {
    const calib = defaultCalibration();
    const sicuro = classifySticker({ r: 26, g: 72, b: 172 }, calib);
    // a meta strada fra rosso e arancione
    const incerto = classifySticker({ r: 207, g: 75, b: 34 }, calib);
    expect(sicuro.confidence).toBeGreaterThan(0.7);
    expect(incerto.confidence).toBeLessThan(sicuro.confidence);
  });
});

describe('assegnazione dei 54 quadratini', () => {
  /** Simula la fotografia dei 54 adesivi di un cubo vero. */
  function photograph(
    facelets: Face[],
    opts: { light?: { r: number; g: number; b: number }; noise?: number; rng?: () => number } = {},
  ): Rgb[] {
    const light = opts.light ?? { r: 1, g: 1, b: 1 };
    const noise = opts.noise ?? 0;
    const rng = opts.rng ?? (() => 0.5);
    return facelets.map((f) => {
      const base = STICKER_RGB[f as unknown as CubeColor];
      return {
        r: Math.max(0, Math.min(255, base.r * light.r + (rng() - 0.5) * noise)),
        g: Math.max(0, Math.min(255, base.g * light.g + (rng() - 0.5) * noise)),
        b: Math.max(0, Math.min(255, base.b * light.b + (rng() - 0.5) * noise)),
      };
    });
  }

  it('legge tutti i 54 quadratini di un cubo mescolato', () => {
    const rng = makeRng(2);
    for (let t = 0; t < 20; t++) {
      const facelets = cubieToFacelet(scrambledCube(25, rng));
      const samples = photograph(facelets, { noise: 14, rng });
      const calib = defaultCalibration();
      const { colors } = assignAllStickers(samples, calib);
      expect(colors).toEqual(facelets as unknown as CubeColor[]);
    }
  });

  it('resiste a luce calda, fredda e a un gradiente di luminosita', () => {
    const rng = makeRng(3);
    const lights = [
      { r: 1.15, g: 0.98, b: 0.78 }, // lampadina calda
      { r: 0.85, g: 0.95, b: 1.18 }, // luce fredda
      { r: 0.72, g: 0.72, b: 0.72 }, // stanza in penombra
    ];
    for (const light of lights) {
      const facelets = cubieToFacelet(scrambledCube(25, rng));
      const samples = photograph(facelets, { light, noise: 12, rng });
      const calib = defaultCalibration();
      // lo scanner impara i riferimenti dai sei centri
      for (let face = 0; face < 6; face++) {
        learnReference(calib, facelets[face * 9 + 4] as unknown as CubeColor, samples[face * 9 + 4]);
      }
      const { colors } = assignAllStickers(samples, calib);
      expect(colors).toEqual(facelets as unknown as CubeColor[]);
    }
  });

  it('rispetta sempre il vincolo dei nove per colore', () => {
    const rng = makeRng(4);
    const facelets = cubieToFacelet(scrambledCube(25, rng));
    // rumore volutamente esagerato: la lettura sara' imperfetta...
    const samples = photograph(facelets, { noise: 90, rng });
    const { colors } = assignAllStickers(samples, defaultCalibration());
    const counts = new Array(6).fill(0);
    for (const c of colors) counts[c]++;
    // ...ma il conteggio resta comunque nove per colore, quindi il validatore
    // potra' dare un messaggio utile invece di "colore contato male".
    expect(counts).toEqual([9, 9, 9, 9, 9, 9]);
  });

  it('segnala i quadratini poco sicuri invece di indovinare in silenzio', () => {
    const rng = makeRng(5);
    const facelets = cubieToFacelet(scrambledCube(25, rng));
    const samples = photograph(facelets, { noise: 70, rng });
    const { uncertain, confidences } = assignAllStickers(samples, defaultCalibration());
    expect(uncertain.length).toBeGreaterThan(0);
    // il primo della lista e' il meno sicuro di tutti
    expect(confidences[uncertain[0]]).toBeLessThanOrEqual(confidences[uncertain[uncertain.length - 1]]);
  });
});

describe('regia della scansione', () => {
  const facesOf = (facelets: Face[], face: Face) =>
    Array.from({ length: 9 }, (_, i) => facelets[face * 9 + i] as unknown as CubeColor);

  function frameForFace(facelets: Face[], face: Face, extra: RenderOptions = {}) {
    return renderFace(facesOf(facelets, face), { noise: 8, rng: makeRng(face + 1), ...extra });
  }

  it('non acquisisce niente finche la qualita non e sufficiente', () => {
    const s = newScanner();
    readyForNextFace(s);
    const facelets = cubieToFacelet(identityCube());
    const blurry = analyzeFrame(frameForFace(facelets, Face.F, { blur: 5 }), FULL);
    for (let i = 0; i < 10; i++) pushFrame(s, blurry);
    expect(s.captured).toHaveLength(0);
    expect(s.message).not.toMatch(/error|null|undefined|NaN/i);
  });

  it('acquisisce una faccia da sola dopo alcuni fotogrammi buoni', () => {
    const s = newScanner();
    readyForNextFace(s);
    const facelets = cubieToFacelet(scrambledCube(20, makeRng(6)));
    const good = analyzeFrame(frameForFace(facelets, Face.F), FULL);
    let captured = false;
    for (let i = 0; i < 10 && !captured; i++) {
      const u = pushFrame(s, good);
      if (u.capturedFace) captured = true;
    }
    expect(captured).toBe(true);
    expect(s.captured).toHaveLength(1);
    expect(s.phase).toBe('gira-il-cubo');
    // riconosce da solo di che faccia si tratta, senza chiederlo
    expect(s.message).toMatch(/riconosciuta/i);
  });

  it('guida il bambino faccia per faccia fino a tutte e sei', () => {
    const s = newScanner();
    const facelets = cubieToFacelet(scrambledCube(22, makeRng(7)));
    for (const step of SCAN_ORDER) {
      readyForNextFace(s);
      const a = analyzeFrame(frameForFace(facelets, step.face), FULL);
      for (let i = 0; i < 12 && s.captured.length < SCAN_ORDER.indexOf(step) + 1; i++) {
        pushFrame(s, a);
      }
    }
    expect(s.captured).toHaveLength(6);
    expect(s.phase).toBe('completata');
    expect(faceChecklist(s).every((e) => e.done)).toBe(true);
  });

  it('la scansione completa produce un cubo che il validatore accetta', () => {
    const rng = makeRng(8);
    for (let t = 0; t < 5; t++) {
      const facelets = cubieToFacelet(scrambledCube(25, rng));
      const s = newScanner();
      for (const step of SCAN_ORDER) {
        readyForNextFace(s);
        const a = analyzeFrame(
          renderFace(facesOf(facelets, step.face), { noise: 10, rng }),
          FULL,
        );
        const target = SCAN_ORDER.indexOf(step) + 1;
        for (let i = 0; i < 12 && s.captured.length < target; i++) pushFrame(s, a);
      }
      expect(s.captured).toHaveLength(6);

      const { assignment, colorToFace } = finalizeScan(s);
      expect(colorToFace.size).toBe(6);
      const asFacelets = colorsToFacelets(assignment.colors, colorToFace);
      expect(asFacelets).toEqual(facelets);
      expect(validateFacelets(asFacelets).valid).toBe(true);
    }
  });

  it('il controllo incrociato si accorge di due centri uguali', () => {
    const s = newScanner();
    s.captured.push({
      face: Face.F,
      samples: [],
      colors: new Array(9).fill(CubeColor.Blue),
      confidences: new Array(9).fill(1),
      frames: 5,
    });
    s.captured.push({
      face: Face.R,
      samples: [],
      colors: new Array(9).fill(CubeColor.Blue),
      confidences: new Array(9).fill(1),
      frames: 5,
    });
    const c = crossCheck(s);
    expect(c.ok).toBe(false);
    expect(c.suspectFaces).toContain(Face.F);
    expect(c.message).toMatch(/controlliamo/i);
    expect(c.message).not.toMatch(/invalid|error|permutation/i);
  });

  it('il controllo incrociato si accorge di un colore contato troppe volte', () => {
    const s = newScanner();
    const centers = [CubeColor.White, CubeColor.Red, CubeColor.Green];
    [Face.U, Face.R, Face.F].forEach((face, i) => {
      const colors = new Array(9).fill(CubeColor.Blue) as CubeColor[];
      colors[4] = centers[i];
      s.captured.push({ face, samples: [], colors, confidences: new Array(9).fill(0.5), frames: 5 });
    });
    const c = crossCheck(s);
    expect(c.ok).toBe(false);
    expect(c.suspectFaces.length).toBeGreaterThan(0);
  });
});
