import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import Cube3D from '../components/Cube3D';
import Rubi, { RubiMood } from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useStore } from '../state/store';
import { useVoice } from '../state/voice';
import { MINI_GAMES, MiniGameId, Question, checkMemoryAnswer, makeQuestion } from '../../core/kids/minigames';
import { Move, parseMoves } from '../../core/cube/moves';
import { makeRng } from '../../core/cube/scramble';
import { facesToClassicColors } from '../../core/cube/scheme';
import { CubeColor } from '../../core/cube/defs';
import { praise } from '../../core/kids/instructions';
import { colors, font, radius, shade, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MiniGiochi'>;

const GAME_COLOR: Record<MiniGameId, string> = {
  colore: colors.pink,
  mossa: colors.info,
  pezzo: colors.purple,
  memory: colors.primary,
};

/** Elenco dei mini giochi, poi la partita vera e propria. */
export default function MiniGamesScreen({ navigation }: Props) {
  const [game, setGame] = useState<MiniGameId | null>(null);
  if (game) return <Play game={game} onExit={() => setGame(null)} />;

  return (
    <Screen title="Giochiamo!" emoji="🎮">
      <Rubi says="Questi giochini sembrano facili, ma allenano davvero il cervello da campione del cubo!" />
      {MINI_GAMES.map((g) => (
        <Pressable
          key={g.id}
          onPress={() => setGame(g.id)}
          accessibilityRole="button"
          accessibilityLabel={g.title}
          style={({ pressed }) => [
            styles.gameCard,
            { backgroundColor: GAME_COLOR[g.id], borderBottomColor: shade(GAME_COLOR[g.id], -0.3) },
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.gameIcon}>{g.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.gameTitle}>{g.title}</Text>
            <Text style={styles.gameWhat}>{g.what}</Text>
          </View>
        </Pressable>
      ))}
      <BigButton label="Torna a casa" emoji="🏠" color={colors.bgSoft} onPress={() => navigation.navigate('Home')} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function Play({ game, onExit }: { game: MiniGameId; onExit: () => void }) {
  const { updateProgress } = useStore();
  const { speak } = useVoice();
  const rng = useRef(makeRng(Date.now() % 100000)).current;

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [question, setQuestion] = useState<Question>(() => makeQuestion(game, rng));
  const [answered, setAnswered] = useState<number | null>(null);

  // Solo per il memory
  const [showing, setShowing] = useState(true);
  const [demoStep, setDemoStep] = useState(0);
  const [animId, setAnimId] = useState(0);
  const [given, setGiven] = useState<Move[]>([]);

  const info = MINI_GAMES.find((g) => g.id === game)!;

  useEffect(() => {
    speak(question.speech);
  }, [question, speak]);

  const nextRound = useCallback(() => {
    setQuestion(makeQuestion(game, rng, 1 + Math.floor(round / 3)));
    setAnswered(null);
    setGiven([]);
    setShowing(true);
    setDemoStep(0);
    setRound((r) => r + 1);
  }, [game, rng, round]);

  const answer = (i: number) => {
    setAnswered(i);
    const right = i === question.answer;
    if (right) {
      setScore((s) => s + 1);
      updateProgress((p) => {
        p.modeUsage.minigiochi = (p.modeUsage.minigiochi ?? 0) + 1;
      });
    }
    speak(right ? `${praise(i + round)} ${question.why}` : `Quasi! ${question.why}`);
  };

  /* --- memory: si guarda la sequenza, poi si ripete --- */
  if (game === 'memory') {
    const seq = question.sequence ?? [];
    const correct = checkMemoryAnswer(seq, given);
    const finished = given.length === seq.length;

    return (
      <Screen
        title={info.title}
        emoji={info.icon}
        footer={
          <View style={{ gap: space.xs }}>
            {showing ? (
              <BigButton
                label="Ho guardato, tocca a me!"
                emoji="👀"
                color={colors.success}
                onPress={() => setShowing(false)}
              />
            ) : finished ? (
              <BigButton
                label={correct ? 'Bravissimo! Un altro?' : 'Riproviamo!'}
                emoji={correct ? '🎉' : '🔄'}
                color={correct ? colors.success : colors.primary}
                onPress={nextRound}
              />
            ) : null}
            <BigButton label="Basta cosi" emoji="🔙" color={colors.bgSoft} onPress={onExit} />
          </View>
        }
      >
        <Text style={styles.score}>Punti: {score} ⭐</Text>
        <Cube3D
          facelets={facesToClassicColors(question.facelets ?? [])}
          animate={showing && seq[demoStep] ? { move: seq[demoStep], id: animId, slow: true } : null}
          onAnimationEnd={() => setDemoStep((s) => Math.min(s + 1, seq.length))}
          style={{ maxHeight: 250 }}
        />

        {showing ? (
          <>
            <Rubi says="Guarda bene le mosse che faccio..." mood="pensieroso" compact />
            <BigButton
              label="Rifammele vedere"
              emoji="▶️"
              color={colors.info}
              onPress={() => {
                setDemoStep(0);
                setAnimId((n) => n + 1);
              }}
            />
          </>
        ) : (
          <>
            <Rubi
              says={
                finished
                  ? correct
                    ? 'Perfetto, tutte giuste!'
                    : `Quasi! La sequenza era: ${question.why}`
                  : `Adesso ripeti tu! Mossa ${given.length + 1} di ${seq.length}.`
              }
              mood={finished ? (correct ? 'festa' : 'pensieroso') : 'felice'}
              compact
            />
            <View style={styles.turnRow}>
              {['U', 'D', 'R', 'L', 'F', 'B'].map((n) => (
                <BigButton
                  key={n}
                  label={n}
                  color={colors.bgSoft}
                  style={styles.turnButton}
                  disabled={finished}
                  onPress={() => setGiven((g) => [...g, parseMoves(n)[0]])}
                />
              ))}
            </View>
            <Text style={styles.given}>
              {given.length ? `Hai fatto: ${given.length} moss${given.length === 1 ? 'a' : 'e'}` : ' '}
            </Text>
          </>
        )}
      </Screen>
    );
  }

  /* --- giochi a risposta multipla --- */
  const mood: RubiMood =
    answered === null ? 'felice' : answered === question.answer ? 'festa' : 'pensieroso';

  const displayFacelets = useMemo(() => {
    const base = facesToClassicColors(question.facelets ?? []);
    if (question.focus !== undefined && answered === null) {
      const copy = [...base];
      copy[question.focus] = null; // il quadratino da indovinare resta coperto
      return copy;
    }
    return base;
  }, [question, answered]);

  return (
    <Screen
      title={info.title}
      emoji={info.icon}
      footer={
        <View style={{ gap: space.xs }}>
          {answered !== null ? (
            <BigButton label="Un altro!" emoji="👉" color={colors.success} onPress={nextRound} />
          ) : null}
          <BigButton label="Basta cosi" emoji="🔙" color={colors.bgSoft} onPress={onExit} />
        </View>
      }
    >
      <Text style={styles.score}>Punti: {score} ⭐</Text>

      {question.facelets ? (
        <Cube3D facelets={displayFacelets} interactive style={{ maxHeight: 240 }} />
      ) : null}

      <Card>
        <Text style={styles.prompt}>{question.prompt}</Text>
      </Card>

      {question.options.map((opt, i) => {
        const chosen = answered === i;
        const isRight = i === question.answer;
        return (
          <Pressable
            key={i}
            disabled={answered !== null}
            onPress={() => answer(i)}
            accessibilityRole="button"
            style={[
              styles.option,
              answered !== null && isRight && styles.optionRight,
              chosen && !isRight && styles.optionWrong,
            ]}
          >
            <Text style={styles.optionText}>
              {answered !== null && isRight ? '✅ ' : chosen ? '❌ ' : ''}
              {opt}
            </Text>
          </Pressable>
        );
      })}

      {answered !== null ? <Rubi says={question.why} mood={mood} compact /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderBottomWidth: 6,
    marginVertical: space.xs,
    minHeight: 88,
  },
  pressed: {
    transform: [{ translateY: 3 }],
    borderBottomWidth: 3,
  },
  gameIcon: {
    fontSize: 34,
  },
  gameTitle: {
    color: '#FFFFFF',
    fontSize: font.title,
    fontWeight: '900',
  },
  gameWhat: {
    color: '#FFFFFFDD',
    fontSize: font.small,
    fontWeight: '600',
  },
  score: {
    color: colors.textOnDark,
    fontSize: font.body,
    fontWeight: '900',
    textAlign: 'center',
  },
  prompt: {
    fontSize: font.title,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 32,
  },
  option: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    minHeight: 64,
    justifyContent: 'center',
    marginVertical: space.xs,
    borderBottomWidth: 5,
    borderBottomColor: '#C7D2FE',
  },
  optionRight: {
    backgroundColor: '#DCFCE7',
    borderBottomColor: colors.successDark,
  },
  optionWrong: {
    backgroundColor: '#FEE2E2',
    borderBottomColor: '#B91C1C',
  },
  optionText: {
    fontSize: font.body,
    fontWeight: '800',
    color: colors.text,
  },
  turnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    justifyContent: 'center',
  },
  turnButton: {
    flexGrow: 1,
    flexBasis: '28%',
    minHeight: 60,
  },
  given: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: font.small,
    fontWeight: '700',
  },
});
