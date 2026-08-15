/**
 * Da fotocamera a pixel.
 *
 * expo-camera restituisce un file immagine, non un buffer di pixel: qui lo
 * rimpiccioliamo a 160x160 (piu' che sufficiente per riconoscere nove
 * quadratoni, e velocissimo da elaborare) e lo decodifichiamo in RGBA.
 *
 * Nota sulla privacy: l'immagine resta in memoria per il tempo di un
 * fotogramma e non viene mai salvata in galleria ne' inviata da nessuna parte.
 * L'unica cosa che sopravvive sono i 54 colori riconosciuti.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import type { CameraView } from 'expo-camera';
import { Frame } from '../core/vision/frame';
import { base64ToBytes, decodePng } from '../core/vision/png';

/** Lato dell'immagine ridotta usata per l'analisi. */
export const ANALYSIS_SIZE = 160;

/**
 * Scatta e prepara un fotogramma per l'analisi.
 * Restituisce null se la fotocamera non e' pronta: chi chiama riprova dopo.
 */
export async function grabFrame(camera: CameraView): Promise<Frame | null> {
  const shot = await camera.takePictureAsync({
    quality: 0.5,
    skipProcessing: true,
    // Niente dati EXIF: non ci servono e conterrebbero informazioni sul
    // dispositivo che non vogliamo nemmeno sfiorare.
    exif: false,
  });
  if (!shot?.uri) return null;

  const small = await ImageManipulator.manipulateAsync(
    shot.uri,
    [{ resize: { width: ANALYSIS_SIZE, height: ANALYSIS_SIZE } }],
    { base64: true, compress: 1, format: ImageManipulator.SaveFormat.PNG },
  );
  if (!small.base64) return null;

  return decodePng(base64ToBytes(small.base64));
}
