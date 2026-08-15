/**
 * Corrispondenza classica fra facce e colori di un cubo occidentale standard:
 * bianco sopra, giallo sotto, verde davanti, blu dietro, rosso a destra,
 * arancione a sinistra.
 *
 * ATTENZIONE: e' solo un valore di comodo, per le vetrine, le anteprime e i
 * mini giochi. Quando c'e' di mezzo il cubo VERO del bambino non si usa mai:
 * li' la corrispondenza la decidono i sei centri che il bambino ha inserito,
 * perche' non sappiamo come ha tenuto il cubo in mano.
 */

import { CubeColor, Face, FACE_ORDER } from './defs';

export const CLASSIC_COLORS: Record<Face, CubeColor> = {
  [Face.U]: CubeColor.White,
  [Face.D]: CubeColor.Yellow,
  [Face.F]: CubeColor.Green,
  [Face.B]: CubeColor.Blue,
  [Face.R]: CubeColor.Red,
  [Face.L]: CubeColor.Orange,
};

export const CLASSIC_FACE_OF_COLOR: Record<CubeColor, Face> = {
  [CubeColor.White]: Face.U,
  [CubeColor.Yellow]: Face.D,
  [CubeColor.Green]: Face.F,
  [CubeColor.Blue]: Face.B,
  [CubeColor.Red]: Face.R,
  [CubeColor.Orange]: Face.L,
};

/** Converte 54 facce nei colori classici, per disegnare un cubo di esempio. */
export function facesToClassicColors(faces: (Face | null)[]): (CubeColor | null)[] {
  return faces.map((f) => (f === null || f === undefined ? null : CLASSIC_COLORS[f]));
}

/* ------------------------------------------------------------------ */
/* Ponte fra i colori scelti dal bambino e le facce del motore          */
/* ------------------------------------------------------------------ */

export type ColorOfFace = Record<Face, CubeColor>;

/**
 * Dai 54 colori ricava la mappa faccia -> colore del centro.
 *
 * E' il pezzo che tiene insieme i due mondi: il bambino vede colori, il motore
 * ragiona per facce, e a decidere la corrispondenza sono i sei centri (che non
 * si spostano mai). Restituisce null se manca qualche centro o se due centri
 * hanno lo stesso colore: in quel caso ci pensa il validatore a spiegarlo.
 */
export function deriveColorOfFace(colors: (CubeColor | null)[]): ColorOfFace | null {
  const map = {} as ColorOfFace;
  const seen = new Set<CubeColor>();
  for (const face of FACE_ORDER) {
    const c = colors[face * 9 + 4];
    if (c === null || c === undefined) return null;
    if (seen.has(c)) return null;
    seen.add(c);
    map[face] = c;
  }
  return map;
}

/** Converte i colori del bambino nelle facce che vuole il motore. */
export function colorsToFaces(
  colors: (CubeColor | null)[],
  colorOfFace: ColorOfFace,
): (Face | null)[] {
  const faceOfColor = new Map<CubeColor, Face>();
  for (const face of FACE_ORDER) faceOfColor.set(colorOfFace[face], face);
  return colors.map((c) => (c === null || c === undefined ? null : faceOfColor.get(c) ?? null));
}

/** Il contrario: dallo stato del motore ai colori da disegnare. */
export function facesToColors(
  faces: (Face | null)[],
  colorOfFace: ColorOfFace | null,
): (CubeColor | null)[] {
  if (!colorOfFace) return new Array(faces.length).fill(null);
  return faces.map((f) => (f === null || f === undefined ? null : colorOfFace[f]));
}
