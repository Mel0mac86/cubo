import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

import { Frame } from '../../core/vision/frame';
import {
  ANALYSIS_SIZE,
  CameraStatus,
  CameraSurfaceHandle,
  CameraSurfaceProps,
} from './cameraSurface.types';

/**
 * La finestra sulla fotocamera, versione web (usata anche quando l'app e'
 * installata sulla schermata Home dell'iPhone).
 *
 * Qui NON usiamo la libreria della fotocamera di Expo: la sua versione web
 * crea un lettore di codici QR che scarica una libreria da un CDN esterno gia'
 * al caricamento del modulo. Noi i codici QR non li leggiamo, e un'app per
 * bambini che promette di non contattare nessuno non puo' permettersi una
 * richiesta a un sito terzo (che fra l'altro fallirebbe senza rete).
 *
 * Il browser ci da' un vantaggio: possiamo copiare il fotogramma dal video
 * direttamente in una tela, senza passare da un file PNG. E' piu' veloce del
 * percorso nativo e non tocca il disco.
 */
const CameraSurface = forwardRef<CameraSurfaceHandle, CameraSurfaceProps>(
  ({ onStatus, style }, ref) => {
    const video = useRef<HTMLVideoElement | null>(null);
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const stream = useRef<MediaStream | null>(null);

    const accendi = useCallback(async (): Promise<CameraStatus> => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        onStatus?.('negato');
        return 'negato';
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            // "environment" = fotocamera posteriore: e' quella che inquadra il
            // cubo tenuto davanti a se'.
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 1280 },
          },
          audio: false,
        });
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        onStatus?.('ok');
        return 'ok';
      } catch {
        // L'utente ha detto di no, oppure non c'e' nessuna fotocamera, oppure
        // il sito non e' in HTTPS (il browser lo vieta).
        onStatus?.('negato');
        return 'negato';
      }
    }, [onStatus]);

    useEffect(() => {
      onStatus?.('da-chiedere');
      return () => {
        // Spegniamo la fotocamera uscendo dalla schermata: la spia accesa
        // mentre non serve e' esattamente cio' che non vogliamo.
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
      };
    }, [onStatus]);

    useImperativeHandle(
      ref,
      () => ({
        richiedi: accendi,
        async grabFrame(): Promise<Frame | null> {
          const v = video.current;
          if (!v || v.readyState < 2 || !v.videoWidth) return null;

          if (!canvas.current) {
            canvas.current = document.createElement('canvas');
            canvas.current.width = ANALYSIS_SIZE;
            canvas.current.height = ANALYSIS_SIZE;
          }
          const ctx = canvas.current.getContext('2d', { willReadFrequently: true });
          if (!ctx) return null;

          // Ritagliamo il quadrato centrale del video: la cornice di guida
          // mostrata al bambino e' quadrata, quindi analizziamo la stessa zona.
          const lato = Math.min(v.videoWidth, v.videoHeight);
          const sx = (v.videoWidth - lato) / 2;
          const sy = (v.videoHeight - lato) / 2;
          ctx.drawImage(v, sx, sy, lato, lato, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);

          const dati = ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
          return { data: dati.data, width: dati.width, height: dati.height };
        },
      }),
      [accendi],
    );

    // react-native-web disegna con react-dom, quindi possiamo usare un vero
    // elemento video del browser.
    return React.createElement('video', {
      ref: video,
      playsInline: true,
      muted: true,
      autoPlay: true,
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        ...(style as object),
      },
    });
  },
);

CameraSurface.displayName = 'CameraSurface';
export default CameraSurface;
