/**
 * Decodifica PNG -> pixel RGBA.
 *
 * Sta nel core (e non accanto alla fotocamera) perche' non dipende da niente
 * di nativo: cosi si puo' provare con dei test veri, senza telefono.
 */

import UPNG from 'upng-js';
import { Frame } from './frame';

/** Decodifica un PNG gia' in memoria in un buffer RGBA. */
export function decodePng(bytes: Uint8Array): Frame {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const img = UPNG.decode(buffer);
  const rgba = UPNG.toRGBA8(img)[0];
  return {
    data: new Uint8ClampedArray(rgba),
    width: img.width,
    height: img.height,
  };
}

/** base64 -> byte, con il modo disponibile sulla piattaforma. */
export function base64ToBytes(b64: string): Uint8Array {
  const g = globalThis as unknown as {
    atob?: (s: string) => string;
    Buffer?: { from(s: string, enc: string): Uint8Array };
  };
  if (typeof g.atob === 'function') {
    const bin = g.atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(g.Buffer!.from(b64, 'base64'));
}
