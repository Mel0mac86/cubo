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
 * DUE COSE DA SAPERE PRIMA DI TOCCARE QUESTO FILE
 *
 * 1. Questo componente va montato UNA VOLTA SOLA e lasciato dov'e'. Smontarlo
 *    spegne il flusso video, e rimontarlo fa ripartire tutto da "devo chiedere
 *    il permesso". Se lo si mette dentro rami diversi dell'interfaccia (una
 *    versione nella schermata dei permessi, una in quella della spiegazione...)
 *    React lo smonta e rimonta a ogni passaggio, e la fotocamera non si accende
 *    mai: l'utente da' il permesso e si ritrova al punto di partenza. E'
 *    successo davvero.
 * 2. L'accensione DEVE partire da un tocco dell'utente: Safari su iPhone
 *    rifiuta getUserMedia chiamato da solo al caricamento della pagina. Per
 *    questo c'e' `richiedi()`, che la schermata chiama dal pulsante.
 */
const CameraSurface = forwardRef<CameraSurfaceHandle, CameraSurfaceProps>(
  ({ onStatus }, ref) => {
    const video = useRef<HTMLVideoElement | null>(null);
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const stream = useRef<MediaStream | null>(null);
    const avvisa = useRef(onStatus);
    avvisa.current = onStatus;

    const accendi = useCallback(async (): Promise<CameraStatus> => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        avvisa.current?.('negato');
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
          // play() puo' fallire se il tocco non e' considerato valido: non e'
          // un motivo per dichiarare la fotocamera negata, il flusso c'e'.
          await video.current.play().catch(() => undefined);
        }
        avvisa.current?.('ok');
        return 'ok';
      } catch {
        // L'utente ha detto di no, oppure non c'e' nessuna fotocamera, oppure
        // il sito non e' in HTTPS (il browser lo vieta).
        avvisa.current?.('negato');
        return 'negato';
      }
    }, []);

    useEffect(() => {
      avvisa.current?.('da-chiedere');
      return () => {
        // Spegniamo la fotocamera uscendo dalla schermata: la spia accesa
        // mentre non serve e' esattamente cio' che non vogliamo.
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
      };
      // Nessuna dipendenza: deve succedere una volta all'ingresso e una
      // all'uscita, mai in mezzo.
    }, []);

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
    // elemento video del browser. Lo stile e' CSS puro: qui non passano gli
    // stili di React Native, che avrebbero un formato diverso.
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
        backgroundColor: '#000',
      },
    });
  },
);

CameraSurface.displayName = 'CameraSurface';
export default CameraSurface;
