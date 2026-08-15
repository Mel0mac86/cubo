/**
 * Geometria del cubo in tre dimensioni.
 *
 * Serve al cubo 3D per sapere quale dei 54 quadratini disegnare su ciascuna
 * faccia di ciascun cubetto. Sta qui e non dentro il componente grafico
 * perche' e' pura aritmetica: cosi si puo' verificare con i test, ed e' un
 * calcolo dove sbagliare di uno e' facilissimo e si noterebbe solo guardando
 * un cubo storto sullo schermo.
 */

import { Face } from './defs';

/**
 * Dato un cubetto in posizione (x, y, z) con x, y, z in {-1, 0, 1} e una delle
 * sue facce, restituisce l'indice del quadratino corrispondente (0..53)
 * nell'ordine standard U, R, F, D, L, B.
 *
 * Convenzione degli assi: +x a destra, +y in alto, +z verso chi guarda.
 */
export function faceletIndex(face: Face, x: number, y: number, z: number): number {
  switch (face) {
    case Face.U:
      return 0 + (z + 1) * 3 + (x + 1);
    case Face.R:
      return 9 + (1 - y) * 3 + (1 - z);
    case Face.F:
      return 18 + (1 - y) * 3 + (x + 1);
    case Face.D:
      return 27 + (1 - z) * 3 + (x + 1);
    case Face.L:
      return 36 + (1 - y) * 3 + (z + 1);
    case Face.B:
      return 45 + (1 - y) * 3 + (1 - x);
  }
}

/** Vero se il cubetto in (x, y, z) fa parte dello strato di quella faccia. */
export function inLayer(face: Face, x: number, y: number, z: number): boolean {
  switch (face) {
    case Face.U:
      return y === 1;
    case Face.D:
      return y === -1;
    case Face.R:
      return x === 1;
    case Face.L:
      return x === -1;
    case Face.F:
      return z === 1;
    case Face.B:
      return z === -1;
  }
}

/** Direzione uscente da ciascuna faccia, come terna (x, y, z). */
export const FACE_NORMAL: Record<Face, readonly [number, number, number]> = {
  [Face.U]: [0, 1, 0],
  [Face.D]: [0, -1, 0],
  [Face.R]: [1, 0, 0],
  [Face.L]: [-1, 0, 0],
  [Face.F]: [0, 0, 1],
  [Face.B]: [0, 0, -1],
};

/**
 * Angolo di rotazione (in radianti) da applicare attorno alla normale uscente
 * per animare una mossa. Girare in senso orario guardando la faccia da fuori
 * corrisponde a una rotazione negativa attorno alla normale (mano destra).
 */
export function turnAngle(power: 1 | 2 | 3): number {
  const quarter = Math.PI / 2;
  return power === 3 ? quarter : -quarter * power;
}

/** Tutti i cubetti visibili, con le facce che mostrano un quadratino. */
export function visibleCubies(): { x: number; y: number; z: number; faces: Face[] }[] {
  const out: { x: number; y: number; z: number; faces: Face[] }[] = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        const faces = ([Face.U, Face.R, Face.F, Face.D, Face.L, Face.B] as Face[]).filter((f) =>
          inLayer(f, x, y, z),
        );
        out.push({ x, y, z, faces });
      }
    }
  }
  return out;
}
