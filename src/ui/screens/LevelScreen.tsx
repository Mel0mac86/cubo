import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import Cube3D from '../components/Cube3D';
import Rubi, { RubiMood } from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useStore } from '../state/store';
import { useVoice } from '../state/voice';
import { LearnCard, levelById } from '../../core/kids/learn';
import { completeLevel } from '../../core/kids/achievements';
import { cubieToFacelet, identityCube } from '../../core/cube/cubie';
import { applyMoves, parseMoves } from '../../core/cube/moves';
import { facesToClassicColors } from '../../core/cube/scheme';
import { describeMove } from '../../core/kids/instructions';
import { colors, font, radius, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Livello'>;

/**
 * Una lezione: schede una dopo l'altra, con animazione o domanda.
 * L'esercizio pratico apre la modalita' "risolvi" partendo dal mescolamento
 * della scheda, cosi il bambino usa lo stesso identico flusso che gia' conosce.
 */
export default function LevelScreen({ navigation, route }: Props) {
  const level = levelById(route.params.level);
  const { updateProgress } = useStore();
  const { speak, repeat } = useVoice();

  const [cardIndex, setCardIndex] = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);
  const [demoStep, setDemoStep] = useState(0);
  const [animId, setAnimId] = useState(0);

  const card: LearnCard | undefined = level?.cards[cardIndex];

  const demoMoves = useMemo(
    () => (card && card.kind === 'spiega' && card.demo ? parseMoves(card.demo) : []),
    [card],
  );

  const demoCube = useMemo(() => {
    const base = identityCube();
    return applyMoves(base, demoMoves.slice(0, demoStep));
  }, [demoMoves, demoStep]);

  useEffect(() => {
    setAnswered(null);
    setDemoStep(0);
    if (!card) return;
    const text =
      card.kind === 'spiega'
        ? `${card.title}. ${card.text}`
        : card.kind === 'domanda'
          ? card.question
          : `${card.title}. ${card.text}`;
    speak(text);
  }, [cardIndex, card, speak]);

  if (!level || !card) {
    return (
      <Screen title="Livello non trovato" emoji="🤔">
        <BigButton label="Torna indietro" emoji="🔙" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const isLast = cardIndex === level.cards.length - 1;

  const finishLevel = () => {
    updateProgress((p) => {
      completeLevel(p, level.level);
      p.modeUsage.impara = (p.modeUsage.impara ?? 0) + 1;
    });
    navigation.navigate('Impara');
  };

  const next = () => {
    if (isLast) finishLevel();
    else setCardIndex(cardIndex + 1);
  };

  /* --- scheda con animazione --- */
  if (card.kind === 'spiega') {
    const move = demoMoves[demoStep % Math.max(1, demoMoves.length)];
    return (
      <Screen
        title={`Livello ${level.level}`}
        emoji={level.stars}
        footer={
          <BigButton
            label={isLast ? 'HO CAPITO, FINITO!' : 'AVANTI'}
            emoji={isLast ? '🏆' : '👉'}
            color={colors.success}
            onPress={next}
          />
        }
      >
        <Progress current={cardIndex} total={level.cards.length} />
        <Card>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardText}>{card.text}</Text>
        </Card>

        {demoMoves.length ? (
          <>
            <Cube3D
              facelets={facesToClassicColors(cubieToFacelet(demoCube))}
              highlight={move?.face ?? null}
              arrow={move ? describeMove(move).arrow : null}
              animate={move ? { move, id: animId, slow: true } : null}
              onAnimationEnd={() => setDemoStep((s) => (s + 1) % (demoMoves.length + 1))}
              style={{ maxHeight: 260 }}
            />
            <BigButton
              label="Fammela vedere"
              emoji="▶️"
              color={colors.info}
              onPress={() => setAnimId((n) => n + 1)}
            />
          </>
        ) : null}

        <Rubi says={card.rubi} onRepeat={() => repeat(card.rubi)} compact />
      </Screen>
    );
  }

  /* --- domanda --- */
  if (card.kind === 'domanda') {
    const correct = answered === card.answer;
    return (
      <Screen
        title={`Livello ${level.level}`}
        emoji={level.stars}
        footer={
          answered !== null ? (
            <BigButton
              label={isLast ? 'FINITO!' : 'AVANTI'}
              emoji={isLast ? '🏆' : '👉'}
              color={colors.success}
              onPress={next}
            />
          ) : undefined
        }
      >
        <Progress current={cardIndex} total={level.cards.length} />
        <Card>
          <Text style={styles.question}>{card.question}</Text>
        </Card>

        {card.options.map((opt, i) => {
          const chosen = answered === i;
          const isRight = i === card.answer;
          return (
            <Pressable
              key={i}
              disabled={answered !== null}
              onPress={() => {
                setAnswered(i);
                speak(i === card.answer ? 'Esatto! Bravissimo.' : `Quasi! ${card.why}`);
              }}
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

        {answered !== null ? (
          <Rubi
            says={correct ? `Esatto! ${card.why}` : `Quasi! ${card.why}`}
            mood={correct ? 'festa' : 'pensieroso'}
            compact
          />
        ) : null}
      </Screen>
    );
  }

  /* --- esercizio pratico --- */
  return (
    <Screen
      title={`Livello ${level.level}`}
      emoji={level.stars}
      footer={
        <View style={{ gap: space.xs }}>
          <BigButton
            label="PROVIAMO SUL CUBO!"
            emoji="🧩"
            color={colors.success}
            giant
            onPress={() =>
              navigation.navigate('Allenamento', {
                scramble: card.scramble,
                goal: card.goal,
                level: level.level,
              })
            }
          />
          <BigButton
            label={isLast ? 'Ho finito il livello' : 'Salta e vai avanti'}
            emoji={isLast ? '🏆' : '👉'}
            color={colors.bgSoft}
            onPress={next}
          />
        </View>
      }
    >
      <Progress current={cardIndex} total={level.cards.length} />
      <Card>
        <Text style={styles.cardTitle}>{card.title}</Text>
        <Text style={styles.cardText}>{card.text}</Text>
      </Card>
      <Rubi says={card.rubi} onRepeat={() => repeat(card.rubi)} />
    </Screen>
  );
}

function Progress({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i <= current && styles.dotOn]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: space.sm,
  },
  dot: {
    width: 22,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF33',
  },
  dotOn: {
    backgroundColor: colors.primary,
  },
  cardTitle: {
    fontSize: font.title,
    fontWeight: '900',
    color: colors.text,
  },
  cardText: {
    fontSize: font.body,
    color: colors.textSoft,
    lineHeight: 27,
  },
  question: {
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
    minHeight: 66,
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
});
