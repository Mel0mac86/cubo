import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import ColorPalette from '../components/ColorPalette';
import FaceGrid from '../components/FaceGrid';
import Rubi, { RubiMood } from '../components/Rubi';
import Screen from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useSession } from '../state/cubeSession';
import { useStore } from '../state/store';
import { useVoice } from '../state/voice';
import { COLOR_LABEL_IT, CubeColor, Face } from '../../core/cube/defs';
import { faceProgressMessage, praise, progressBar, stars } from '../../core/kids/instructions';
import { colors, font, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'InserisciColori'>;

/**
 * Inserimento a mano, una faccia alla volta.
 *
 * Il flusso e' quello descritto: prima si chiede il colore del CENTRO (cosi
 * l'app sa di che faccia si tratta e il bambino non deve conoscere i nomi
 * delle facce), poi si riempiono gli altri otto quadratini.
 */

/** L'ordine in cui chiediamo le facce, con l'istruzione fisica per girare il cubo. */
const STEPS: { face: Face; turn: string }[] = [
  { face: Face.F, turn: 'Tieni il cubo davanti a te e guarda la faccia che ti sta di fronte.' },
  { face: Face.R, turn: 'Adesso gira il cubo verso sinistra e guarda la faccia nuova. 👈' },
  { face: Face.B, turn: 'Gira ancora verso sinistra. 👈' },
  { face: Face.L, turn: 'Un altro giro verso sinistra. 👈' },
  { face: Face.U, turn: 'Torna come all inizio e guarda la faccia di sopra. 👆' },
  { face: Face.D, turn: 'Ultima! Guarda la faccia di sotto. 👇' },
];

export default function ColorInputScreen({ navigation, route }: Props) {
  const step = route.params?.faceStep ?? 0;
  const { face, turn } = STEPS[step];

  const session = useSession();
  const { updateProgress } = useStore();
  const { speak, repeat } = useVoice();

  const [cells, setCells] = useState<(CubeColor | null)[]>(() =>
    Array.from({ length: 9 }, (_, i) => session.colors[face * 9 + i]),
  );
  const [pickedColor, setPickedColor] = useState<CubeColor | null>(null);
  const [selected, setSelected] = useState<number | null>(4);
  const [mood, setMood] = useState<RubiMood>('felice');

  const centerDone = cells[4] !== null;
  const filled = cells.filter((c) => c !== null).length;
  const allDone = filled === 9;

  const says = useMemo(() => {
    if (!centerDone) return `${turn}\nGuarda il quadratino al centro: che colore e?`;
    if (!allDone) {
      const label = COLOR_LABEL_IT[cells[4]!];
      return `Perfetto! Questa sara la faccia ${label}. Adesso tocca gli altri quadratini e scegli il loro colore.`;
    }
    return `${praise(step)} Faccia completata!`;
  }, [centerDone, allDone, cells, turn, step]);

  useEffect(() => {
    speak(says);
  }, [says, speak]);

  const pick = (color: CubeColor) => {
    setPickedColor(color);
    if (selected === null) return;
    const next = [...cells];
    next[selected] = color;
    setCells(next);
    setMood('felice');
    // Passa da solo al primo quadratino ancora vuoto: cosi si puo' colorare
    // tutta la faccia senza mai dover mirare due volte.
    const nextEmpty = next.findIndex((c, i) => c === null && i !== 4);
    setSelected(nextEmpty === -1 ? null : nextEmpty);
  };

  const tapCell = (i: number) => {
    setSelected(i);
    if (pickedColor !== null) {
      const next = [...cells];
      next[i] = pickedColor;
      setCells(next);
    }
  };

  const confirm = () => {
    session.setFaceColors(face, cells);
    updateProgress((p) => {
      p.facesEntered += 1;
    });
    if (step + 1 < STEPS.length) {
      navigation.push('InserisciColori', { faceStep: step + 1 });
    } else {
      navigation.navigate('Controllo');
    }
  };

  return (
    <Screen
      title={step === 0 ? 'FACCIAMO LA PRIMA! ⭐' : `FACCIA ${step + 1} DI 6`}
      footer={
        <BigButton
          label={allDone ? (step === 5 ? 'CONTROLLIAMO!' : 'AVANTI!') : `Mancano ${9 - filled} quadratini`}
          emoji={allDone ? '✅' : '👆'}
          color={allDone ? colors.success : colors.muted}
          disabled={!allDone}
          onPress={confirm}
        />
      }
    >
      <Text style={styles.progress}>
        {progressBar(step)} {step}/6 {stars(step)}
      </Text>

      <Rubi says={says} mood={mood} onRepeat={() => repeat(says)} compact />

      <View style={styles.gridWrap}>
        <FaceGrid
          cells={cells}
          selected={selected}
          onCellPress={tapCell}
          caption={
            centerDone
              ? 'Tocca un quadratino, poi scegli il colore'
              : 'Il quadratino con il pallino e quello centrale'
          }
        />
      </View>

      <ColorPalette onPick={pick} selected={pickedColor} />

      {step > 0 ? (
        <Text style={styles.hint}>{faceProgressMessage(step)}</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: {
    color: colors.textOnDark,
    fontSize: font.body,
    fontWeight: '900',
    textAlign: 'center',
  },
  gridWrap: {
    alignItems: 'center',
    marginVertical: space.md,
  },
  hint: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: font.small,
    fontWeight: '700',
    marginTop: space.sm,
  },
});
