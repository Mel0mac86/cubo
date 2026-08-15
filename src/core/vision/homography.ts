/**
 * Omografie: il ponte fra il quadrato "ideale" del cubo e il quadrilatero
 * storto che si vede nella fotografia.
 *
 * Serve perche' un bambino non tiene mai il cubo perfettamente dritto davanti
 * alla fotocamera. Con una semplice griglia allineata agli assi si finisce a
 * campionare i pixel sbagliati appena il cubo e' inclinato o non e' centrato,
 * e i colori letti sono quelli dei vicini.
 */

/** Matrice 3x3, per righe. */
export type Mat3 = readonly number[];

/** Applica una matrice a un punto (in coordinate omogenee). */
export function applyMat(m: Mat3, x: number, y: number): [number, number] {
  const d = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / d, (m[3] * x + m[4] * y + m[5]) / d];
}

export function invertMat(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
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

export type Punto = readonly [number, number];
/** Angoli in ordine: alto-sinistra, alto-destra, basso-destra, basso-sinistra. */
export type Quad = readonly [Punto, Punto, Punto, Punto];

/**
 * Omografia che porta il quadrato unitario (0,0)-(1,1) sui quattro angoli dati.
 * Formula chiusa classica: piu' veloce e piu' stabile di risolvere un sistema.
 */
export function quadFromUnitSquare(q: Quad): Mat3 {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) {
    // Quadrilatero degenere: ripieghiamo su una semplice trasformazione affine.
    return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0, 1];
  }
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

/** Punto del quadrilatero corrispondente a (u,v) nel quadrato unitario. */
export function puntoNelQuad(H: Mat3, u: number, v: number): [number, number] {
  return applyMat(H, u, v);
}

/** Centro del quadrilatero. */
export function centroQuad(q: Quad): [number, number] {
  return [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
}

/** Lato medio, utile per capire quanto e' grande il cubo nell'inquadratura. */
export function latoMedio(q: Quad): number {
  const d = (a: Punto, b: Punto) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return (d(q[0], q[1]) + d(q[1], q[2]) + d(q[2], q[3]) + d(q[3], q[0])) / 4;
}
