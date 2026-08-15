import { describe, it, expect } from 'vitest';
import { faceletIndex, inLayer, turnAngle, visibleCubies } from '../src/core/cube/geometry';
import {
  CLASSIC_COLORS,
  colorsToFaces,
  deriveColorOfFace,
  facesToClassicColors,
  facesToColors,
} from '../src/core/cube/scheme';
import { CubeColor, Face, FACE_ORDER } from '../src/core/cube/defs';
import { cubieToFacelet, identityCube } from '../src/core/cube/cubie';
import { makeRng, scrambledCube } from '../src/core/cube/scramble';
import { validateFacelets } from '../src/core/cube/validator';
import { sanitizeHint } from '../src/services/gemini';
import { base64ToBytes, decodePng } from '../src/core/vision/png';

/**
 * La corrispondenza fra cubetti 3D e quadratini e' facilissima da sbagliare di
 * uno, e l'errore si vedrebbe solo guardando il cubo storto sul telefono:
 * meglio verificarla qui.
 */
describe('cubo 3D: mappa cubetti -> quadratini', () => {
  const cubies: [Face, number, number, number][] = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (y === 1) cubies.push([Face.U, x, y, z]);
        if (y === -1) cubies.push([Face.D, x, y, z]);
        if (x === 1) cubies.push([Face.R, x, y, z]);
        if (x === -1) cubies.push([Face.L, x, y, z]);
        if (z === 1) cubies.push([Face.F, x, y, z]);
        if (z === -1) cubies.push([Face.B, x, y, z]);
      }
    }
  }

  it('copre tutti e 54 i quadratini esattamente una volta', () => {
    const seen = cubies.map(([f, x, y, z]) => faceletIndex(f, x, y, z));
    expect(seen).toHaveLength(54);
    expect(new Set(seen).size).toBe(54);
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBe(53);
  });

  it('ogni quadratino finisce sulla faccia a cui appartiene', () => {
    for (const [face, x, y, z] of cubies) {
      expect(Math.floor(faceletIndex(face, x, y, z) / 9)).toBe(face);
    }
  });

  it('i centri stanno nel cubetto centrale di ciascuna faccia', () => {
    expect(faceletIndex(Face.U, 0, 1, 0)).toBe(4);
    expect(faceletIndex(Face.R, 1, 0, 0)).toBe(13);
    expect(faceletIndex(Face.F, 0, 0, 1)).toBe(22);
    expect(faceletIndex(Face.D, 0, -1, 0)).toBe(31);
    expect(faceletIndex(Face.L, -1, 0, 0)).toBe(40);
    expect(faceletIndex(Face.B, 0, 0, -1)).toBe(49);
  });

  it('gli angoli condivisi combaciano con la definizione del motore', () => {
    // L'angolo alto-destra-davanti (URF) e' fatto dai quadratini 8, 9 e 20.
    expect(faceletIndex(Face.U, 1, 1, 1)).toBe(8);
    expect(faceletIndex(Face.R, 1, 1, 1)).toBe(9);
    expect(faceletIndex(Face.F, 1, 1, 1)).toBe(20);
    // L'angolo basso-sinistra-dietro (DBL) e' fatto da 33, 53 e 42.
    expect(faceletIndex(Face.D, -1, -1, -1)).toBe(33);
    expect(faceletIndex(Face.B, -1, -1, -1)).toBe(53);
    expect(faceletIndex(Face.L, -1, -1, -1)).toBe(42);
  });
});

describe('colori del bambino -> facce del motore', () => {
  it('deduce la mappa dai sei centri', () => {
    const colors: (CubeColor | null)[] = new Array(54).fill(null);
    const centers: Record<number, CubeColor> = {
      [Face.U]: CubeColor.Blue,
      [Face.R]: CubeColor.White,
      [Face.F]: CubeColor.Orange,
      [Face.D]: CubeColor.Green,
      [Face.L]: CubeColor.Yellow,
      [Face.B]: CubeColor.Red,
    };
    for (const f of FACE_ORDER) colors[f * 9 + 4] = centers[f];
    const map = deriveColorOfFace(colors);
    expect(map).not.toBeNull();
    expect(map![Face.U]).toBe(CubeColor.Blue);
    expect(map![Face.B]).toBe(CubeColor.Red);
  });

  it('rifiuta due centri dello stesso colore', () => {
    const colors: (CubeColor | null)[] = new Array(54).fill(null);
    for (const f of FACE_ORDER) colors[f * 9 + 4] = CubeColor.Red;
    expect(deriveColorOfFace(colors)).toBeNull();
  });

  it('rifiuta i centri incompleti', () => {
    const colors: (CubeColor | null)[] = new Array(54).fill(null);
    colors[4] = CubeColor.White;
    expect(deriveColorOfFace(colors)).toBeNull();
  });

  it('un cubo vero e valido comunque il bambino lo abbia tenuto in mano', () => {
    const rng = makeRng(1234);
    // Tre modi diversi di associare i colori alle facce: sono tutti leciti,
    // dipende solo da come il bambino teneva il cubo mentre inseriva i colori.
    const schemes: Record<Face, CubeColor>[] = [
      CLASSIC_COLORS,
      {
        [Face.U]: CubeColor.Red,
        [Face.D]: CubeColor.Orange,
        [Face.F]: CubeColor.White,
        [Face.B]: CubeColor.Yellow,
        [Face.R]: CubeColor.Green,
        [Face.L]: CubeColor.Blue,
      },
      {
        [Face.U]: CubeColor.Blue,
        [Face.D]: CubeColor.Green,
        [Face.F]: CubeColor.Yellow,
        [Face.B]: CubeColor.White,
        [Face.R]: CubeColor.Orange,
        [Face.L]: CubeColor.Red,
      },
    ];

    for (const scheme of schemes) {
      for (let t = 0; t < 20; t++) {
        const faces = cubieToFacelet(scrambledCube(25, rng));
        const asColors = faces.map((f) => scheme[f]);
        const map = deriveColorOfFace(asColors);
        expect(map).not.toBeNull();
        const back = colorsToFaces(asColors, map!);
        expect(back).toEqual(faces);
        expect(validateFacelets(back).valid).toBe(true);
      }
    }
  });

  it('la conversione avanti e indietro non perde niente', () => {
    const faces = cubieToFacelet(scrambledCube(20, makeRng(9)));
    const asColors = facesToColors(faces, CLASSIC_COLORS);
    expect(colorsToFaces(asColors, CLASSIC_COLORS)).toEqual(faces);
  });

  it('il cubo risolto disegnato con i colori classici ha sei facce uniformi', () => {
    const colors = facesToClassicColors(cubieToFacelet(identityCube()));
    for (const face of FACE_ORDER) {
      const nine = colors.slice(face * 9, face * 9 + 9);
      expect(new Set(nine).size).toBe(1);
      expect(nine[0]).toBe(CLASSIC_COLORS[face]);
    }
  });
});

describe('filtro delle risposte di Gemini', () => {
  it('accetta una spiegazione semplice', () => {
    expect(sanitizeHint('Gira il lato destro verso l alto, come se aprissi una finestra!')).toBe(
      'Gira il lato destro verso l alto, come se aprissi una finestra!',
    );
  });

  it('scarta le risposte che contengono la notazione', () => {
    expect(sanitizeHint("Fai R U R' e poi guarda il cubo.")).toBeNull();
    expect(sanitizeHint('Adesso esegui F2.')).toBeNull();
  });

  it('scarta le risposte con parole tecniche', () => {
    expect(sanitizeHint("Applica l'algoritmo di orientamento.")).toBeNull();
    expect(sanitizeHint('Ruota in senso orario la faccia.')).toBeNull();
  });

  it('accorcia le risposte troppo lunghe', () => {
    const long = sanitizeHint('Gira piano il lato di sopra. '.repeat(20));
    expect(long!.length).toBeLessThanOrEqual(220);
    expect(long!.endsWith('...')).toBe(true);
  });

  it('scarta le risposte vuote', () => {
    expect(sanitizeHint('   ')).toBeNull();
    expect(sanitizeHint('***')).toBeNull();
  });
});

describe('geometria del cubo 3D', () => {
  it('ogni strato contiene esattamente nove cubetti', () => {
    const all = visibleCubies();
    expect(all).toHaveLength(26);
    for (const face of FACE_ORDER) {
      const n = all.filter((c) => inLayer(face, c.x, c.y, c.z)).length;
      expect(n).toBe(9);
    }
  });

  it('gli angoli di rotazione seguono la regola della mano destra', () => {
    // Un quarto di giro in senso orario visto da fuori = angolo negativo.
    expect(turnAngle(1)).toBeCloseTo(-Math.PI / 2);
    expect(turnAngle(2)).toBeCloseTo(-Math.PI);
    // Il giro antiorario e' l'unico positivo (e resta un quarto, non tre).
    expect(turnAngle(3)).toBeCloseTo(Math.PI / 2);
  });
});

describe('decodifica delle immagini', () => {
  it('converte base64 in byte', () => {
    expect(Array.from(base64ToBytes('AAECiP8='))).toEqual([0, 1, 2, 136, 255]);
  });

  it('legge un PNG e restituisce i pixel giusti', async () => {
    // Un'immagine con tanti colori, come quelle che arrivano davvero dalla
    // fotocamera (PNG a colori pieni, non a tavolozza).
    const UPNG = (await import('upng-js')) as unknown as {
      encode(bufs: ArrayBuffer[], w: number, h: number, cnum: number): ArrayBuffer;
    };
    const w = 20;
    const h = 20;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = i % 256;
      rgba[i * 4 + 1] = (i * 3) % 256;
      rgba[i * 4 + 2] = (i * 7) % 256;
      rgba[i * 4 + 3] = 255;
    }
    const png = new Uint8Array(UPNG.encode([rgba.buffer as ArrayBuffer], w, h, 0));

    const frame = decodePng(png);
    expect(frame.width).toBe(w);
    expect(frame.height).toBe(h);
    expect(frame.data).toHaveLength(w * h * 4);
    expect(Array.from(frame.data)).toEqual(Array.from(rgba));
  });
});
