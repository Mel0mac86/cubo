import type { Frame } from '../../core/vision/frame';

/** Lato dell'immagine ridotta su cui gira l'analisi dei colori. */
export const ANALYSIS_SIZE = 160;

export type CameraStatus =
  /** Non sappiamo ancora se possiamo usare la fotocamera. */
  | 'attesa'
  /** Possiamo usarla. */
  | 'ok'
  /** Serve chiedere il permesso all'utente. */
  | 'da-chiedere'
  /** Permesso negato, oppure fotocamera non disponibile. */
  | 'negato';

export interface CameraSurfaceHandle {
  /** Chiede il permesso e restituisce l'esito. */
  richiedi(): Promise<CameraStatus>;
  /**
   * Preleva un fotogramma gia' ridimensionato e pronto per l'analisi.
   * Restituisce null se la fotocamera non e' ancora pronta: chi chiama riprova
   * al giro successivo.
   */
  grabFrame(): Promise<Frame | null>;
}

export interface CameraSurfaceProps {
  onStatus?: (s: CameraStatus) => void;
}
