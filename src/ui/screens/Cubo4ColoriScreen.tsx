import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import ColorPalette from '../components/ColorPalette';
import ColorTally from '../components/ColorTally';
import FaceGrid from '../components/FaceGrid';
import Rubi, { RubiMood } from '../components/Rubi';
import Screen from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useSession } from '../state/cubeSession';
import { useVoice } from '../state/voice';
import { COLOR_LABEL_IT, COLOR_LABEL_IT_PLURAL, CubeColor, Face } from '../../core/cube/defs';
import {
  QUADRATINI_PER_COLORE_4,
  avvisoTroppiColori,
  conFaccia,
  contaColori,
} from '../../core/kids/entry';
import { praise, progressBar, stars } from '../../core/kids/instructions';
import { colors, font, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Cubo4Colori'>;

/**
 * Inserimento a mano del cubo GRANDE, una faccia alla volta.
 *
 * Due differenze rispetto al cubo normale, e sono proprio le due cose che
 * confondono i bambini:
 *
 *  - sedici quadratini invece di nove;
 *  - NON C'E' IL QUADRATINO IN MEZZO. Sul cubo normale il centro non si muove
 *    mai ed e' lui a dire "questa faccia e' la bianca". Sul cubo grande i
 *    quattro quadratini in mezzo girano come tutti gli altri, quindi non c'e'
 *    niente a cui aggrapparsi: l'unico punto fermo e' come il bambino tiene il
 *    cubo in mano. Per questo le istruzioni sono ancora piu' precise su come
 *    girarlo, e la faccia guardata per prima diventa il riferimento di tutte
 *    le altre.
 */
const PASSI: { faccia: Face; gira: string; regola?: string }[] = [
  {
    faccia: Face.F,
    gira: 'Tieni il cubo davanti a te con tutte e due le mani e guarda la faccia che ti sta di fronte. Questa sara la nostra faccia di riferimento: ricordati che colori ha!',
  },
  {
    faccia: Face.R,
    gira: 'Gira il cubo verso sinistra, come si gira una maniglia: la prima faccia va a finire a sinistra e ne arriva una nuova davanti. La faccia di sopra deve restare sopra! 👈',
    regola: '☝️ La faccia di sopra deve essere rimasta sopra',
  },
  {
    faccia: Face.B,
    gira: 'Gira ancora nello stesso verso, sempre verso sinistra. 👈',
    regola: '☝️ La faccia di sopra deve essere rimasta sopra',
  },
  {
    faccia: Face.L,
    gira: 'Un altro giro nello stesso verso: e l ultima faccia di lato. 👈',
    regola: '☝️ La faccia di sopra deve essere rimasta sopra',
  },
  {
    faccia: Face.U,
    gira: 'Rimetti davanti la faccia di riferimento, quella che hai guardato per prima. Adesso inclina il cubo VERSO DI TE, come se cadesse in avanti, finche vedi la faccia di sopra. 👆',
    regola: '👇 Le due file che toccano la faccia di riferimento vanno IN BASSO',
  },
  {
    faccia: Face.D,
    gira: 'Ultima! Rimetti davanti la faccia di riferimento e inclina il cubo DALLA PARTE OPPOSTA, lontano da te, finche vedi la faccia di sotto. 👇',
    regola: '👆 Le due file che toccano la faccia di riferimento vanno IN ALTO',
  },
];

export default function Cubo4ColoriScreen({ navigation, route }: Props) {
  const passo = route.params?.faccia ?? 0;
  const { faccia, gira, regola } = PASSI[passo];

  const session = useSession();
  const { speak, repeat } = useVoice();

  const [celle, setCelle] = useState<(CubeColor | null)[]>(() =>
    Array.from({ length: 16 }, (_, i) => session.colori4[faccia * 16 + i]),
  );
  const [scelta, setScelta] = useState<number | null>(0);
  const [pennello, setPennello] = useState<CubeColor | null>(null);
  const [umore, setUmore] = useState<RubiMood>('felice');

  const fatti = celle.filter((c) => c !== null).length;
  const completa = fatti === 16;

  const tutto = useMemo(
    () => conFaccia(session.colori4, faccia, celle, 16),
    [session.colori4, faccia, celle],
  );
  const troppi = useMemo(
    () => contaColori(tutto, QUADRATINI_PER_COLORE_4).filter((c) => c.troppi),
    [tutto],
  );

  const dice = useMemo(() => {
    if (troppi.length > 0) return avvisoTroppiColori(troppi[0].color, troppi[0].messi, QUADRATINI_PER_COLORE_4);
    if (!completa) return `${gira}\nTocca un quadratino e poi scegli il suo colore.`;
    return `${praise(passo)} Faccia completata!`;
  }, [troppi, completa, gira, passo]);

  useEffect(() => {
    speak(dice);
  }, [dice, speak]);

  useEffect(() => {
    setUmore(troppi.length > 0 ? 'pensieroso' : 'felice');
  }, [troppi.length]);

  /** Il tocco sceglie il quadratino, non lo colora mai. */
  const tocca = (i: number) => setScelta(i);

  const scegli = (c: CubeColor) => {
    setPennello(c);
    if (scelta === null) return;
    const next = [...celle];
    next[scelta] = c;
    setCelle(next);
    const vuoto = next.findIndex((x) => x === null);
    setScelta(vuoto === -1 ? scelta : vuoto);
  };

  const sospetti = celle
    .map((c, i) => (c !== null && troppi.some((t) => t.color === c) ? i : -1))
    .filter((i) => i >= 0);
  const daSistemare = sospetti.length > 0;

  const avanti = () => {
    session.setFaccia4(faccia, celle);
    if (passo + 1 < PASSI.length) navigation.push('Cubo4Colori', { faccia: passo + 1 });
    else navigation.navigate('Cubo4Controllo');
  };

  return (
    <Screen
      title={passo === 0 ? 'CUBO GRANDE: LA PRIMA! ⭐' : `FACCIA ${passo + 1} DI 6`}
      footer={
        <BigButton
          label={
            !completa
              ? `Mancano ${16 - fatti} quadratini`
              : daSistemare
                ? `Guarda i quadratini ${COLOR_LABEL_IT_PLURAL[troppi[0].color]}`
                : passo === 5
                  ? 'CONTROLLIAMO!'
                  : 'AVANTI!'
          }
          emoji={!completa ? '👆' : daSistemare ? '🔎' : '✅'}
          color={!completa || daSistemare ? colors.muted : colors.success}
          disabled={!completa || daSistemare}
          onPress={avanti}
        />
      }
    >
      <Text style={styles.progresso}>
        {progressBar(passo)} {passo}/6 {stars(passo)}
      </Text>

      <Rubi says={dice} mood={umore} onRepeat={() => repeat(dice)} compact />

      <View style={styles.griglia}>
        <FaceGrid
          cells={celle}
          n={4}
          selected={scelta}
          suspects={sospetti}
          onCellPress={tocca}
          caption="Tocca un quadratino, poi scegli il colore"
        />
        {regola ? <Text style={styles.regola}>{regola}</Text> : null}
      </View>

      <ColorPalette onPick={scegli} selected={pennello} />

      <View style={styles.conti}>
        <ColorTally cells={tutto} perColore={QUADRATINI_PER_COLORE_4} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progresso: {
    color: colors.textOnDark,
    fontSize: font.body,
    fontWeight: '900',
    textAlign: 'center',
  },
  griglia: {
    alignItems: 'center',
    marginVertical: space.md,
  },
  regola: {
    marginTop: space.sm,
    textAlign: 'center',
    color: colors.textOnDark,
    fontSize: font.small,
    fontWeight: '900',
  },
  conti: {
    marginTop: space.md,
  },
});
