import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import Rubi from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useStore } from '../state/store';
import { BADGES, formatTime, heroTitle } from '../../core/kids/achievements';
import { LEARN_LEVELS } from '../../core/kids/learn';
import { colors, font, radius, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Conquiste'>;

/** Le conquiste del bambino. Le medaglie non ancora vinte restano in vista
 *  ma spente, cosi si capisce che cosa si puo' ancora fare. */
export default function AchievementsScreen({ navigation }: Props) {
  const { progress } = useStore();
  const earned = BADGES.filter((b) => progress.badges.includes(b.id));
  const locked = BADGES.filter((b) => !progress.badges.includes(b.id));
  const avgMoves = progress.cubesSolved
    ? Math.round(progress.totalMoves / progress.cubesSolved)
    : 0;

  return (
    <Screen title="Le mie conquiste" emoji="🏆">
      <Rubi
        says={
          earned.length === 0
            ? 'Qui finiranno tutte le tue medaglie. Risolvi il primo cubo e ne arrivera subito una!'
            : `Guarda quante ne hai gia! ${earned.length} medaglie e ${progress.stars} stelle.`
        }
        mood={earned.length ? 'festa' : 'felice'}
      />

      <Card>
        <Text style={styles.title}>IL TUO PROGRESSO 🚀</Text>
        <Row label="Cubi risolti" value={String(progress.cubesSolved)} />
        <Row label="Miglior tempo" value={formatTime(progress.bestTimeMs)} />
        <Row label="Mosse in media" value={avgMoves ? String(avgMoves) : '—'} />
        <Row label="Senza aiuto" value={String(progress.solvedWithoutHelp)} />
        <Row
          label="Livelli finiti"
          value={`${progress.levelsCompleted.length} / ${LEARN_LEVELS.length}`}
        />
        <Row label="Livello" value={heroTitle(progress)} />
        <Text style={styles.stars}>{'⭐'.repeat(Math.min(progress.stars, 20))}</Text>
      </Card>

      {earned.length ? (
        <Card>
          <Text style={styles.title}>Medaglie vinte</Text>
          {earned.map((b) => (
            <View key={b.id} style={styles.badge}>
              <Text style={styles.icon}>{b.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.badgeTitle}>{b.title}</Text>
                <Text style={styles.badgeHow}>{b.how}</Text>
              </View>
              <Text style={styles.badgeStars}>{'⭐'.repeat(b.stars)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {locked.length ? (
        <Card style={{ opacity: 0.75 }}>
          <Text style={styles.title}>Ancora da conquistare</Text>
          {locked.map((b) => (
            <View key={b.id} style={styles.badge}>
              <Text style={[styles.icon, styles.lockedIcon]}>🔒</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.badgeTitle}>{b.title}</Text>
                <Text style={styles.badgeHow}>{b.how}</Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <BigButton label="Torna a casa" emoji="🏠" color={colors.bgSoft} onPress={() => navigation.navigate('Home')} />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: font.title,
    fontWeight: '900',
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLabel: {
    fontSize: font.body,
    color: colors.textSoft,
    fontWeight: '700',
  },
  rowValue: {
    fontSize: font.body,
    color: colors.text,
    fontWeight: '900',
  },
  stars: {
    fontSize: 22,
    textAlign: 'center',
    marginTop: space.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
  },
  icon: {
    fontSize: 32,
    width: 42,
    textAlign: 'center',
  },
  lockedIcon: {
    fontSize: 24,
  },
  badgeTitle: {
    fontSize: font.body,
    fontWeight: '900',
    color: colors.text,
  },
  badgeHow: {
    fontSize: font.small,
    color: colors.textSoft,
  },
  badgeStars: {
    fontSize: 14,
  },
});
