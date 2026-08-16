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

/**
 * L'ordine in cui chiediamo le facce, con l'istruzione fisica per girare il cubo.
 *
 * `ancora` e' il colore del centro della PRIMA faccia: e' il punto di
 * riferimento del bambino per tutto il resto dell'inserimento.
 *
 * Perche' tanta precisione: i sei centri dicono di che faccia si tratta, ma non
 * dicono come il bambino teneva il cubo mentre la guardava. Le facce di sopra e
 * di sotto si possono guardare in quattro modi diversi, tutti naturali, e tre
 * su quattro mettono i nove quadratini nelle caselle sbagliate. I colori
 * risultano contati bene, i centri pure, e l'app finisce per dire "gli
 * angolini non sono giusti" a un bambino che ha copiato tutto correttamente.
 *
 * Per questo ogni passo dice DOVE deve finire la faccia di riferimento, e la
 * `regola` sotto la griglia da' un controllo che vale comunque si giri il cubo.
 */
const STEPS: {
  face: Face;
  turn: (ancora: string) => string;
  regola?: (ancora: string) => string;
}[] = [
  {
    face: Face.F,
    turn: () => 'Tieni il cubo davanti a te con tutte e due le mani e guarda la faccia che ti sta di fronte.',
  },
  {
    face: Face.R,
    turn: (a) =>
      `Gira il cubo verso sinistra, come si gira una maniglia: la faccia ${a} va a finire a sinistra e ne arriva una nuova davanti. La faccia di sopra deve restare sopra! 👈`,
    regola: () => '☝️ La faccia di sopra deve essere rimasta sopra',
  },
  {
    face: Face.B,
    turn: () => 'Gira ancora nello stesso verso, sempre verso sinistra. 👈',
    regola: () => '☝️ La faccia di sopra deve essere rimasta sopra',
  },
  {
    face: Face.L,
    turn: () => 'Un altro giro nello stesso verso: e l ultima faccia di lato. 👈',
    regola: () => '☝️ La faccia di sopra deve essere rimasta sopra',
  },
  {
    face: Face.U,
    turn: (a) =>
      `Rimetti la faccia ${a} davanti a te. Adesso inclina il cubo VERSO DI TE, come se cadesse in avanti, finche vedi la faccia di sopra: la faccia ${a} deve finire in basso, vicino a te. 👆`,
    regola: (a) => `👇 La fila che tocca la faccia ${a} va IN BASSO`,
  },
  {
    face: Face.D,
    turn: (a) =>
      `Ultima! Rimetti la faccia ${a} davanti e inclina il cubo DALLA PARTE OPPOSTA, lontano da te, finche vedi la faccia di sotto: la faccia ${a} deve finire in alto. 👇`,
    regola: (a) => `👆 La fila che tocca la faccia ${a} va IN ALTO`,
  },
];

export default function ColorInputScreen({ navigation, route }: Props) {
  const step = route.params?.faceStep ?? 0;
  const { face, turn, regola } = STEPS[step];

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

  /* Il colore di riferimento: il centro della PRIMA faccia inserita. E' con
   * quello che diciamo al bambino come tenere il cubo, invece di usare parole
   * come "davanti" e "dietro" che dipendono da come lo sta girando. */
  const ancoraColore = session.colors[Face.F * 9 + 4];
  const ancora = ancoraColore !== null ? COLOR_LABEL_IT[ancoraColore] : 'della prima faccia';

  const says = useMemo(() => {
    if (troppi.length > 0) return avvisoTroppiColori(troppi[0].color, troppi[0].messi);
    if (!centerDone) return `${turn(ancora)}\nGuarda il quadratino al centro: che colore e?`;
    if (!allDone) {
      const label = COLOR_LABEL_IT[cells[4]!];
      return `Perfetto! Questa sara la faccia ${label}. Adesso tocca un quadratino e poi scegli il suo colore.`;
    }
    return `${praise(step)} Faccia completata!`;
  }, [troppi, centerDone, allDone, cells, turn, ancora, step]);

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
        {/* La regola che non dipende da come il cubo e' stato girato: da' al
         * bambino un modo per accorgersi da solo di aver guardato la faccia
         * dalla parte sbagliata. */}
        {regola ? <Text style={styles.regola}>{regola(ancora)}</Text> : null}
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
  regola: {
    marginTop: space.sm,
    textAlign: 'center',
    color: colors.textOnDark,
    fontSize: font.small,
    fontWeight: '900',
  },
  hint: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: font.small,
    fontWeight: '700',
    marginTop: space.sm,
  },
});
