/**
 * Aspetto dell'app: colori vivaci, testi grandi, pulsanti enormi.
 *
 * Regole scelte per un bambino di nove anni:
 *  - niente testo sotto i 17 punti;
 *  - ogni pulsante e' alto almeno 64 punti, cosi si prende sempre;
 *  - i pulsanti importanti hanno anche un emoji, non solo una parola;
 *  - contrasto alto, perche' spesso si gioca con il telefono in mano al sole.
 */

import { CubeColor, COLOR_HEX } from '../core/cube/defs';

export const colors = {
  bg: '#2E1065',
  bgSoft: '#4C1D95',
  card: '#FFFFFF',
  cardSoft: '#F5F3FF',
  text: '#1E1B4B',
  textSoft: '#4C1D95',
  textOnDark: '#F5F3FF',
  primary: '#F59E0B',
  primaryDark: '#B45309',
  success: '#22C55E',
  successDark: '#15803D',
  danger: '#EF4444',
  info: '#38BDF8',
  purple: '#8B5CF6',
  pink: '#EC4899',
  muted: '#A5B4FC',
  shadow: '#1E1B4B',
};

export const cube = COLOR_HEX;

export const cubeColorList: CubeColor[] = [
  CubeColor.White,
  CubeColor.Yellow,
  CubeColor.Red,
  CubeColor.Orange,
  CubeColor.Blue,
  CubeColor.Green,
];

export const font = {
  huge: 40,
  big: 30,
  title: 24,
  body: 19,
  small: 17,
};

export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 34,
};

export const radius = {
  sm: 12,
  md: 20,
  lg: 28,
  pill: 999,
};

/** Ombra "cartoon": un bordo spesso in basso, come nei giochi per bambini. */
export function chunky(color: string) {
  return {
    backgroundColor: color,
    borderBottomWidth: 6,
    borderBottomColor: shade(color, -0.28),
    borderRadius: radius.lg,
  };
}

/** Schiarisce (amount > 0) o scurisce (amount < 0) un colore esadecimale. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) =>
    Math.max(0, Math.min(255, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`;
}
