import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import Cube3D, { Cube3DProps } from './Cube3D';
import CubeFlat from './CubeFlat';
import ErrorBoundary from './ErrorBoundary';

/**
 * Il cubo da usare nelle schermate: prova con le tre dimensioni e, se il
 * dispositivo non ce la fa, passa al disegno in piano senza fare storie.
 *
 * Nasce da un problema vero: su iPhone l'app mostrava la schermata di avvio e
 * poi spariva. Il motivo e' che un errore dentro il cubo 3D risaliva fino alla
 * radice, e React a quel punto smonta TUTTA l'applicazione. Un pezzo che non
 * si disegna non deve poter portare via con se' il resto dell'app: qui viene
 * isolato, e al suo posto compare un cubo aperto in piano, che si legge
 * benissimo e funziona ovunque.
 */
export default function CubeView(props: Cube3DProps) {
  // Se la grafica 3D fallisce dopo essere partita (contesto perso, WebGL
  // negato a meta' strada) passiamo comunque al disegno in piano.
  const [ripiego, setRipiego] = useState<string | null>(null);

  const inPiano = useCallback(
    (motivo?: string) => (
      <View style={props.style}>
        <CubeFlat
          facelets={props.facelets}
          highlight={props.highlight}
          arrow={props.arrow}
          motivo={motivo}
        />
      </View>
    ),
    [props.facelets, props.highlight, props.arrow, props.style],
  );

  if (ripiego) return inPiano('cubo in piano');

  return (
    <ErrorBoundary
      nome="cubo 3D"
      fallback={() => inPiano("cubo in piano")}
    >
      <Cube3D {...props} onGlError={(m) => setRipiego(m)} />
    </ErrorBoundary>
  );
}
