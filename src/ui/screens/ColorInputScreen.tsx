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
import { useStore } from '../state/store';
import { useVoice } from '../state/voice';
import { COLOR_LABEL_IT, COLOR_LABEL_IT_PLURAL, CubeColor, Face } from '../../core/cube/defs';
import {
  StatoInserimento,
  avvisoTroppiColori,
  colora,
  conFaccia,
  contaColori,
  nuovoStato,
  quantiFatti,
  tocca,
} from '../../core/kids/entry';
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

  const [stato, setStato] = useState<StatoInserimento>(() =>
    nuovoStato(Array.from({ length: 9 }, (_, i) => session.colors[face * 9 + i])),
  );
  const { cells, selected, pennello } = stato;
  const [mood, setMood] = useState<RubiMood>('felice');

  const centerDone = cells[4] !== null;
  const filled = quantiFatti(cells);
  const allDone = filled === 9;

  /* Il conto dei colori di TUTTO il cubo, con questa faccia gia' aggiornata:
   * e' quello che permette di accorgersi del colore di troppo adesso, e non
   * alla fine quando non si sa piu' dove guardare. */
  const tuttoIlCubo = useMemo(
    () => conFaccia(session.colors, face, cells),
    [session.colors, face, cells],
  );
  const troppi = useMemo(() => contaColori(tuttoIlCubo).filter((c) => c.troppi), [tuttoIlCubo]);

  const says = useMemo(() => {
    if (troppi.length > 0) return avvisoTroppiColori(troppi[0].color, troppi[0].messi);
    if (!centerDone) return `${turn}\nGuarda il quadratino al centro: che colore e?`;
    if (!allDone) {
      const label = COLOR_LABEL_IT[cells[4]!];
      return `Perfetto! Questa sara la faccia ${label}. Adesso tocca un quadratino e poi scegli il suo colore.`;
    }
    return `${praise(step)} Faccia completata!`;
  }, [troppi, centerDone, allDone, cells, turn, step]);

  useEffect(() => {
    speak(says);
  }, [says, speak]);

  useEffect(() => {
    setMood(troppi.length > 0 ? 'pensieroso' : 'felice');
  }, [troppi.length]);

  /** La tavolozza colora il quadratino scelto. */
  const pick = (color: CubeColor) => setStato((s) => colora(s, color));

  /**
   * Il tocco SCEGLIE e basta, non colora mai.
   * Prima ricolorava con l'ultimo colore usato: bastava sfiorare un quadratino
   * gia' giusto (o il centro, che tutti toccano perche' ha il pallino) e il
   * colore cambiava in silenzio. Era proprio quello a far comparire alla fine
   * "abbiamo messo un colore di troppo" su cubi inseriti bene.
   */
  const tapCell = (i: number) => setStato((s) => tocca(s, i));

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

  /* I quadratini di QUESTA faccia che hanno un colore gia' finito altrove:
   * sono quelli su cui vale la pena tornare, e si possono correggere qui. */
  const sospetti = cells
    .map((c, i) => (c !== null && troppi.some((t) => t.color === c) ? i : -1))
    .filter((i) => i >= 0);

  const daSistemareQui = sospetti.length > 0;

  return (
    <Screen
      title={step === 0 ? 'FACCIAMO LA PRIMA! ⭐' : `FACCIA ${step + 1} DI 6`}
      footer={
        <View style={{ gap: space.xs }}>
          <BigButton
            label={
              !allDone
                ? `Mancano ${9 - filled} quadratini`
                : daSistemareQui
                  ? `Guarda i quadratini ${COLOR_LABEL_IT_PLURAL[troppi[0].color]}`
                  : step === 5
                    ? 'CONTROLLIAMO!'
                    : 'AVANTI!'
            }
            emoji={!allDone ? '👆' : daSistemareQui ? '🔎' : '✅'}
            color={!allDone || daSistemareQui ? colors.muted : colors.success}
            disabled={!allDone || daSistemareQui}
            onPress={confirm}
          />
          {/* La via d'uscita: il quadratino di troppo puo' benissimo stare su
           * una faccia di prima, e questa faccia essere giustissima. Senza
           * questo pulsante il bambino resterebbe bloccato qui. */}
          {daSistemareQui ? (
            <BigButton
              label="Era giusta! Guardiamo le facce di prima"
              emoji="↩️"
              color={colors.info}
              onPress={() => {
                session.setFaceColors(face, cells);
                navigation.navigate('Correggi', { face });
              }}
            />
          ) : null}
        </View>
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
          suspects={sospetti}
          onCellPress={tapCell}
          caption={
            centerDone
              ? 'Tocca un quadratino, poi scegli il colore'
              : 'Il quadratino con il pallino e quello centrale'
          }
        />
      </View>

      <ColorPalette onPick={pick} selected={pennello} />

      <View style={styles.tallyWrap}>
        <ColorTally cells={tuttoIlCubo} />
      </View>

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
  tallyWrap: {
    marginTop: space.md,
  },
  hint: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: font.small,
    fontWeight: '700',
    marginTop: space.sm,
  },
});
