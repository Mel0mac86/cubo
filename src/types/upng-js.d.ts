/**
 * upng-js non porta con se' i tipi: qui dichiariamo solo le due funzioni che
 * usiamo davvero per decodificare un PNG in RGBA.
 */
declare module 'upng-js' {
  interface UpngImage {
    width: number;
    height: number;
    depth: number;
    ctype: number;
    frames: unknown[];
    tabs: Record<string, unknown>;
    data: Uint8Array;
  }
  export function decode(buffer: ArrayBuffer): UpngImage;
  export function toRGBA8(img: UpngImage): ArrayBuffer[];
  const UPNG: { decode: typeof decode; toRGBA8: typeof toRGBA8 };
  export default UPNG;
}
