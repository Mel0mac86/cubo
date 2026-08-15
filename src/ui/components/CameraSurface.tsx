import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';

import { Frame } from '../../core/vision/frame';
import { base64ToBytes, decodePng } from '../../core/vision/png';
import {
  ANALYSIS_SIZE,
  CameraStatus,
  CameraSurfaceHandle,
  CameraSurfaceProps,
} from './cameraSurface.types';

/**
 * La finestra sulla fotocamera, versione per iPhone e Android.
 *
 * Esiste anche una versione per il web (CameraSurface.web.tsx) che usa
 * direttamente le API del browser. Non e' un capriccio: la libreria della
 * fotocamera di Expo, sul web, crea un lettore di codici QR che scarica una
 * libreria da un CDN esterno gia' al caricamento del modulo. Noi i codici QR
 * non li leggiamo, e un'app per bambini che promette di non contattare nessuno
 * non puo' permettersi una richiesta a un sito terzo. Tenendo due file separati,
 * quel codice non entra proprio nel pacchetto web.
 *
 * Nota sulla privacy: la foto vive il tempo di un fotogramma, non finisce in
 * galleria e non viene inviata da nessuna parte. L'unica cosa che sopravvive
 * sono i 54 colori riconosciuti.
 */
const CameraSurface = forwardRef<CameraSurfaceHandle, CameraSurfaceProps>(
  ({ onStatus, style }, ref) => {
    const camera = useRef<CameraView | null>(null);
    const [permission, requestPermission] = useCameraPermissions();

    useEffect(() => {
      if (!permission) {
        onStatus?.('attesa');
        return;
      }
      if (permission.granted) onStatus?.('ok');
      else if (permission.canAskAgain) onStatus?.('da-chiedere');
      else onStatus?.('negato');
    }, [permission, onStatus]);

    useImperativeHandle(
      ref,
      () => ({
        async richiedi(): Promise<CameraStatus> {
          const res = await requestPermission();
          return res?.granted ? 'ok' : 'negato';
        },
        async grabFrame(): Promise<Frame | null> {
          if (!camera.current) return null;
          const shot = await camera.current.takePictureAsync({
            quality: 0.5,
            skipProcessing: true,
            // Niente dati EXIF: conterrebbero informazioni sul dispositivo che
            // non ci servono e che non vogliamo nemmeno sfiorare.
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
        },
      }),
      [requestPermission],
    );

    if (!permission?.granted) return null;

    return <CameraView ref={camera} style={[StyleSheet.absoluteFill, style]} facing="back" />;
  },
);

CameraSurface.displayName = 'CameraSurface';
export default CameraSurface;
