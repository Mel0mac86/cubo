import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import Cube3D from '../components/Cube3D';
import Rubi, { RubiMood } from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { facesToColors, useSession } from '../state/cubeSession';
import { useStore } from '../state/store';
import { useVoice } from '../state/voice';
import { cubieToFacelet } from '../../core/cube/cubie';
import { applyMoves } from '../../core/cube/moves';
import { describeMove, encourage, presentStep } from '../../core/kids/instructions';
import { fetchRubiHint, isGeminiConfigured } from '../../services/gemini';
import { colors, font, radius, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Risolvi'>;

/**
 * La risoluzione passo dopo passo.
 *
 * Un passo alla volta, mai una lista di mosse. Per ogni passo: la faccia si
 * illumina sul cubo 3D, compare una freccia gigante, l'animazione mostra il
 * movimento e Rubi lo spiega a voce. Poi si chiede "hai fatto la mossa?".
 */
export default function SolveScreen({ navigation }: Props) {
  const session = useSession();
  const { settings, updateProgress } = useStore();
  const { speak, repeat } = useVoice();

  const [index, setIndex] = useState(0);
  const [animId, setAnimId] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpText, setHelpText] = useState<string | null>(null);
  const seenSteps = useRef<Set<number>>(new Set());
  const helpPerStep = useRef<Map<number, number>>(new Map());
  const stepRef = useRef(0);

  const solution = session.solution;
  const moves = solution?.moves ?? [];
  const total = moves.length;
  const done = index >= total;

  /** Stato del cubo dopo le mosse gia' eseguite. */
  const cubeNow = useMemo(() => {
    if (!session.cube) return null;
    return applyMoves(session.cube, moves.slice(0, index));
  }, [session.cube, moves, index]);

  const faceletColors = useMemo(() => {
    if (!cubeNow) return session.colors;
    return facesToColors(cubeNow ? cubieToFacelet(cubeNow) : [], session.colorOfFace);
  }, [cubeNow, session.colors, session.colorOfFace]);

  const instruction = done ? null : describeMove(moves[index], settings.difficulty);
  const isFirstTime = !seenSteps.current.has(index);
  const step = instruction
    ? presentStep(instruction, index, total, settings.difficulty, isFirstTime)
    : null;

  /** In quale fase del metodo siamo: serve per la barra "a che punto siamo". */
  const stage = useMemo(() => {
    if (!solution) return null;
    let acc = 0;
    for (const s of solution.stages) {
      if (index < acc + s.moves.length) return { ...s, from: acc };
      acc += s.moves.length;
    }
    return solution.stages[solution.stages.length - 1] ?? null;
  }, [solution, index]);

  /** Fa partire l'animazione della mossa corrente. */
  const playMove = useCallback(() => {
    if (done) return;
    setAnimating(true);
    setAnimId((n) => n + 1);
  }, [done]);

  useEffect(() => {
    if (done || !step) return;
    seenSteps.current.add(index);
    stepRef.current = index;
    speak(step.speech);
    // La prima volta che si vede un passo, Rubi lo mostra da solo.
    const t = setTimeout(playMove, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, done]);

  const confirmStep = () => {
    setShowHelp(false);
    setHelpText(null);
    if (index + 1 >= total) {
      finish();
    } else {
      setIndex(index + 1);
    }
  };

  const finish = () => {
    const timeMs = session.stopTimer();
    const usedHelp = session.helpUsed > 0;
    updateProgress((p) => {
      p.cubesSolved += 1;
      p.totalMoves += total;
      p.helpUsed += session.helpUsed;
      if (!usedHelp) p.solvedWithoutHelp += 1;
      if (timeMs !== null) {
        p.lastTimeMs = timeMs;
        if (p.bestTimeMs === undefined || timeMs < p.bestTimeMs) p.bestTimeMs = timeMs;
      }
    });
    navigation.navigate('Finito', { moves: total, timeMs: timeMs ?? undefined, usedHelp });
  };

  const askHelp = () => {
    setShowHelp(true);
    session.addHelp();
    const attempts = (helpPerStep.current.get(index) ?? 0) + 1;
    helpPerStep.current.set(index, attempts);

    const fallback = `${encourage(index)} ${instruction?.text ?? ''} ${instruction?.hint ?? ''}`.trim();
    setHelpText(fallback);
    repeat(fallback);
    playMove();

    // Se un adulto ha attivato Gemini, proviamo a farci dare una spiegazione
    // diversa (utile quando il bambino chiede aiuto piu' volte sulla stessa
    // mossa). Se non arriva in tempo o non passa i controlli, resta il testo
    // qui sopra: il bambino non si accorge di niente.
    if (instruction && isGeminiConfigured()) {
      fetchRubiHint({
        instruction,
        difficulty: settings.difficulty,
        attempts,
        stageTitle: stage?.title,
      }).then((extra) => {
        if (extra && stepRef.current === index) {
          setHelpText(extra);
          repeat(extra);
        }
      });
    }
  };

  if (!solution || !session.cube) {
    return (
      <Screen title="Ops!" emoji="🤔">
        <Rubi says="Mi sono perso il cubo per strada! Torniamo indietro e riproviamo." mood="pensieroso" />
        <BigButton label="Torna all inizio" emoji="🏠" onPress={() => navigation.navigate('Home')} />
      </Screen>
    );
  }

  if (done) {
    // Non dovrebbe capitare (finish() naviga), ma se capita non lasciamo il
    // bambino su una schermata vuota.
    return (
      <Screen title="Finito!" emoji="🏆">
        <Rubi says="Abbiamo finito tutte le mosse!" mood="festa" />
        <BigButton label="Vai al premio" emoji="⭐" onPress={finish} />
      </Screen>
    );
  }

  const mood: RubiMood = showHelp ? 'pensieroso' : 'felice';

  return (
    <Screen
      scroll={false}
      footer={
        <View style={{ gap: space.xs }}>
          <BigButton
            label="FATTO!"
            emoji="✅"
            color={colors.success}
            giant
            disabled={animating}
            onPress={confirmStep}
          />
          <View style={styles.secondaryRow}>
            <BigButton
              label="Fammela vedere ancora"
              emoji="🔄"
              color={colors.info}
              style={styles.half}
              onPress={playMove}
            />
            <BigButton
              label="Aiutami!"
              emoji="🆘"
              color={colors.primary}
              style={styles.half}
              onPress={askHelp}
            />
          </View>
        </View>
      }
    >
      <View style={styles.header}>
        <Text style={styles.stepTitle}>{step?.title}</Text>
        <Text style={styles.counter}>
          {index + 1} / {total}
        </Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((index + 1) / total) * 100}%` }]} />
      </View>

      {stage ? (
        <Text style={styles.stage}>
          {stage.title} — {stage.goal}
        </Text>
      ) : null}

      <Cube3D
        facelets={faceletColors}
        highlight={instruction?.face ?? null}
        arrow={instruction?.arrow ?? null}
        animate={
          instruction ? { move: instruction.move, id: animId, slow: step?.slowMotion } : null
        }
        onAnimationEnd={() => setAnimating(false)}
        interactive
        style={styles.cube}
      />

      <Card>
        <Text style={styles.main}>{step?.main}</Text>
        {step?.sub ? <Text style={styles.sub}>{step.sub}</Text> : null}
      </Card>

      {showHelp ? (
        <Rubi
          says={
            helpText ??
            `${encourage(index)} Guarda: la faccia che si illumina e quella da girare, e la freccia dice da che parte. Te la rifaccio quante volte vuoi!`
          }
          mood={mood}
          compact
          onRepeat={playMove}
        />
      ) : (
        <Text style={styles.question}>Hai fatto la mossa?</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  stepTitle: {
    color: colors.textOnDark,
    fontSize: font.big,
    fontWeight: '900',
  },
  counter: {
    color: colors.muted,
    fontSize: font.body,
    fontWeight: '900',
  },
  progressTrack: {
    height: 14,
    marginHorizontal: space.md,
    backgroundColor: '#00000033',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: radius.pill,
  },
  stage: {
    color: colors.muted,
    fontSize: font.small,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: space.md,
  },
  cube: {
    flex: 1,
    maxHeight: 320,
  },
  main: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 32,
  },
  sub: {
    color: colors.textSoft,
    fontSize: font.small,
    textAlign: 'center',
    fontWeight: '700',
  },
  question: {
    color: colors.textOnDark,
    fontSize: font.body,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: space.sm,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  half: {
    flex: 1,
  },
});
