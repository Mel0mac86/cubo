import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import ColorTally from '../components/ColorTally';
import CubeView from '../components/CubeView';
import FaceGrid from '../components/FaceGrid';
import Rubi, { RubiMood } from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { colorsToFaces, useSession } from '../state/cubeSession';
import { useStore } from '../state/store';
import { useVoice } from '../state/voice';
import { COLOR_LABEL_IT, CubeColor, Face } from '../../core/cube/defs';
import { ValidationReport, faceletFace, validateFacelets } from '../../core/cube/validator';
import { solveBeginner } from '../../core/solver/beginner';
import { solveKociemba } from '../../core/solver/kociemba';
import { colors, font, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Controllo'>;

/**
 * "Controllo il tuo cubo..."
 *
 * Qui non compare MAI un errore tecnico. Se qualcosa non torna, si mostra la
 * faccia sospetta con i quadratini evidenziati e due pulsanti chiari:
 * controlla oppure modifica.
 */
export default function CheckScreen({ navigation }: Props) {
  const session = useSession();
  const { settings, updateProgress } = useStore();
  const { speak, repeat } = useVoice();

  const [report, setReport] = useState<ValidationReport | null>(null);
  const [solving, setSolving] = useState(false);
  const [solveError, setSolveError] = useState<string | null>(null);

  const asFaces = useMemo(
    () => (session.colorOfFace ? colorsToFaces(session.colors, session.colorOfFace) : null),
    [session.colors, session.colorOfFace],
  );

  useEffect(() => {
    // Un attimo di attesa: serve all'animazione del cubo che gira, e fa capire
    // al bambino che l'app sta davvero controllando.
    const t = setTimeout(() => {
      if (!asFaces) {
        setReport({
          valid: false,
          checks: [],
          suspects: [4, 13, 22, 31, 40, 49].filter((i) => session.colors[i] === null),
          suspectFaces: [],
        });
        return;
      }
      setReport(validateFacelets(asFaces));
    }, 900);
    return () => clearTimeout(t);
  }, [asFaces, session.colors]);

  const centersProblem = !session.colorOfFace;

  const says = useMemo(() => {
    if (!report) return 'Controllo il tuo cubo...';
    if (centersProblem) {
      return 'Hmm... i quadratini in mezzo alle facce non tornano. Ogni faccia deve avere un centro di colore diverso: controlliamoli insieme!';
    }
    if (report.valid) return 'Il tuo cubo e pronto! Adesso posso trovare il modo migliore per risolverlo!';
    const failed = report.checks.find((c) => !c.ok && c.message);
    return `Credo che abbiamo colorato qualcosa nel modo sbagliato. ${failed?.message ?? 'Controlliamo insieme!'}`;
  }, [report, centersProblem]);

  useEffect(() => {
    speak(says);
  }, [says, speak]);

  const solve = () => {
    if (!report?.cube) return;
    setSolving(true);
    setSolveError(null);
    // Lasciamo respirare l'interfaccia: su un telefono lento il calcolo occupa
    // il thread principale e senza questo la schermata resterebbe congelata.
    setTimeout(() => {
      try {
        if (settings.difficulty === 'esperto') {
          const k = solveKociemba(report.cube!, { timeoutMs: 6000 });
          session.setSolution({
            moves: k.moves,
            stages: [
              {
                id: 'cross',
                title: 'La via piu corta',
                goal: 'Il computer ha trovato la strada piu breve.',
                learnLevel: 6,
                moves: k.moves,
              },
            ],
            engine: 'kociemba',
          });
        } else {
          const b = solveBeginner(report.cube!);
          session.setSolution({ moves: b.moves, stages: b.stages, engine: 'strati' });
        }
        session.setCube(report.cube!);
        session.resetHelp();
        updateProgress((p) => {
          p.modeUsage.risolvi = (p.modeUsage.risolvi ?? 0) + 1;
        });
        navigation.navigate('Risolvi');
      } catch (e) {
        setSolveError(
          'Uffa, non sono riuscito a trovare la soluzione. Riproviamo a controllare i colori?',
        );
      } finally {
        setSolving(false);
      }
    }, 60);
  };

  /* --- schermata di attesa --- */
  if (!report) {
    return (
      <Screen title="Controllo del cubo" emoji="🔍" scroll={false}>
        <CubeView
          facelets={session.colors}
          spin
          interactive={false}
          style={{ maxHeight: 300 }}
        />
        <Rubi says="Controllo il tuo cubo..." mood="pensieroso" />
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: space.lg }} />
      </Screen>
    );
  }

  /* --- tutto a posto --- */
  if (report.valid) {
    return (
      <Screen
        title="IL TUO CUBO E PRONTO!"
        emoji="🎉"
        footer={
          <BigButton
            label={solving ? 'Sto cercando la soluzione...' : 'RISOLVI IL CUBO!'}
            emoji={solving ? '🧠' : '🚀'}
            color={colors.success}
            giant
            disabled={solving}
            onPress={solve}
          />
        }
      >
        <CubeView facelets={session.colors} spin interactive style={{ maxHeight: 280 }} />
        <Rubi says={says} mood="festa" onRepeat={() => repeat(says)} />

        <Card>
          {report.checks.map((c) => (
            <View key={c.id} style={styles.checkRow}>
              <Text style={styles.checkIcon}>✅</Text>
              <Text style={styles.checkLabel}>{c.label}</Text>
            </View>
          ))}
        </Card>

        {solveError ? <Text style={styles.error}>{solveError}</Text> : null}
      </Screen>
    );
  }

  /* --- qualcosa non torna --- */
  const suspectFace: Face | null = centersProblem
    ? null
    : (report.suspectFaces[0] ?? (report.suspects.length ? faceletFace(report.suspects[0]) : null));

  const faceCells: (CubeColor | null)[] =
    suspectFace === null
      ? [4, 13, 22, 31, 40, 49].map((i) => session.colors[i])
      : Array.from({ length: 9 }, (_, i) => session.colors[suspectFace * 9 + i]);

  const localSuspects =
    suspectFace === null
      ? []
      : report.suspects
          .filter((s) => faceletFace(s) === suspectFace)
          .map((s) => s % 9);

  const suggestion = report.checks.find((c) => c.suggestion?.length)?.suggestion?.[0];
  /* `shouldBe` e' una FACCIA del motore, non un colore: va tradotto passando
   * dai centri che il bambino ha inserito. Prima veniva letto direttamente
   * come colore e usciva il nome sbagliato ogni volta che il cubo non era
   * tenuto nell'orientamento classico. */
  const suggestedColor: CubeColor | null =
    suggestion && session.colorOfFace ? session.colorOfFace[suggestion.shouldBe] : null;

  /* Quando a non tornare e' il CONTO dei colori non c'e' un quadratino
   * colpevole: serve far vedere i sei conti e lasciar ricontare. */
  const countsFailed = report.checks.some((c) => c.id === 'counts' && !c.ok && c.message);

  return (
    <Screen
      title="Hmm... qualcosa non torna!"
      emoji="🤔"
      footer={
        <View style={{ gap: space.xs }}>
          <BigButton
            label="MODIFICA I COLORI"
            emoji="✏️"
            color={colors.primary}
            onPress={() =>
              navigation.navigate('Correggi', { face: suspectFace ?? Face.U })
            }
          />
          <BigButton
            label="RIFACCIAMO TUTTO DA CAPO"
            emoji="🔄"
            color={colors.bgSoft}
            onPress={() => {
              session.clear();
              navigation.navigate('ComeInserire');
            }}
          />
        </View>
      }
    >
      <Rubi says={says} mood="pensieroso" onRepeat={() => repeat(says)} />

      <View style={styles.gridWrap}>
        <FaceGrid
          cells={faceCells}
          suspects={localSuspects}
          caption={
            suspectFace === null
              ? 'Questi sono i sei quadratini centrali'
              : 'Guarda i quadratini con il bordo rosso'
          }
        />
      </View>

      {countsFailed ? (
        <Card>
          <Text style={styles.suggestion}>
            🔢 Ecco quanti quadratini ho contato per ogni colore. Su un cubo vero devono essere{' '}
            <Text style={styles.bold}>9 per ognuno</Text>.
          </Text>
          <View style={styles.tallyWrap}>
            <ColorTally cells={session.colors} />
          </View>
        </Card>
      ) : null}

      {suggestedColor !== null ? (
        <Card>
          <Text style={styles.suggestion}>
            💡 Forse questo quadratino dovrebbe essere{' '}
            <Text style={styles.bold}>{COLOR_LABEL_IT[suggestedColor]}</Text>.
          </Text>
        </Card>
      ) : null}

      <Card>
        {report.checks
          .filter((c) => c.message || c.ok)
          .map((c) => (
            <View key={c.id} style={styles.checkRow}>
              <Text style={styles.checkIcon}>{c.ok ? '✅' : '❌'}</Text>
              <Text style={[styles.checkLabel, !c.ok && styles.checkFailed]}>{c.label}</Text>
            </View>
          ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gridWrap: {
    alignItems: 'center',
    marginVertical: space.md,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  checkIcon: {
    fontSize: 20,
  },
  checkLabel: {
    flex: 1,
    color: colors.text,
    fontSize: font.small,
    fontWeight: '700',
  },
  checkFailed: {
    color: colors.danger,
  },
  suggestion: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 26,
  },
  tallyWrap: {
    marginTop: space.sm,
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    paddingVertical: space.sm,
  },
  bold: {
    fontWeight: '900',
  },
  error: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: space.md,
  },
});
