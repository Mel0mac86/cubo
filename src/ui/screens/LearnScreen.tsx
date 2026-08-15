import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import Rubi from '../components/Rubi';
import Screen from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useStore } from '../state/store';
import { LEARN_LEVELS, isLevelUnlocked } from '../../core/kids/learn';
import { colors, font, radius, shade, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Impara'>;

const LEVEL_COLOR = [
  colors.success,
  colors.info,
  colors.purple,
  colors.pink,
  colors.primary,
  '#F43F5E',
];

/** La scuola di Rubi: sei livelli, uno sblocca il successivo. */
export default function LearnScreen({ navigation }: Props) {
  const { progress } = useStore();
  const done = progress.levelsCompleted;

  return (
    <Screen title="Impara a risolvere il cubo" emoji="🎓">
      <Rubi
        says="Benvenuto nella mia scuola! Un livello alla volta e imparerai a risolvere il cubo tutto da solo."
        mood="felice"
      />

      {LEARN_LEVELS.map((level, i) => {
        const unlocked = isLevelUnlocked(level.level, done);
        const completed = done.includes(level.level);
        const color = LEVEL_COLOR[i % LEVEL_COLOR.length];
        return (
          <Pressable
            key={level.level}
            disabled={!unlocked}
            onPress={() => navigation.navigate('Livello', { level: level.level })}
            accessibilityRole="button"
            accessibilityLabel={`Livello ${level.level}: ${level.title}${unlocked ? '' : ', bloccato'}`}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: unlocked ? color : colors.bgSoft,
                borderBottomColor: shade(unlocked ? color : colors.bgSoft, -0.3),
              },
              pressed && unlocked && styles.pressed,
            ]}
          >
            <Text style={styles.levelNumber}>{unlocked ? level.stars : '🔒'}</Text>
            <View style={styles.cardBody}>
              <Text style={styles.levelTitle}>
                LIVELLO {level.level} — {level.title}
              </Text>
              <Text style={styles.levelSub}>
                {unlocked ? level.subtitle : 'Finisci il livello prima per sbloccarlo'}
              </Text>
            </View>
            {completed ? <Text style={styles.done}>✅</Text> : null}
          </Pressable>
        );
      })}

      <Text style={styles.footer}>
        Hai finito {done.length} livelli su {LEARN_LEVELS.length}.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
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
  levelNumber: {
    fontSize: 24,
  },
  cardBody: {
    flex: 1,
  },
  levelTitle: {
    color: '#FFFFFF',
    fontSize: font.body,
    fontWeight: '900',
  },
  levelSub: {
    color: '#FFFFFFDD',
    fontSize: font.small,
    fontWeight: '600',
  },
  done: {
    fontSize: 26,
  },
  footer: {
    marginTop: space.md,
    textAlign: 'center',
    color: colors.muted,
    fontSize: font.small,
    fontWeight: '700',
  },
});
