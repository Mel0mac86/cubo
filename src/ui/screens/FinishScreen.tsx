import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import Rubi from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useSession } from '../state/cubeSession';
import { useStore } from '../state/store';
import { useVoice } from '../state/voice';
import { BADGES, formatTime, heroTitle } from '../../core/kids/achievements';
import { colors, font, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Finito'>;

/** La festa finale, con il premio e l'invito a imparare a farlo da solo. */
export default function FinishScreen({ navigation, route }: Props) {
  const { moves, timeMs, usedHelp } = route.params;
  const { progress } = useStore();
  const { speak } = useVoice();
  const session = useSession();

  const newBadges = useMemo(
    () =>
      BADGES.filter((b) => progress.badges.includes(b.id)).slice(-3),
    [progress.badges],
  );

  const says = useMemo(() => {
    const base = usedHelp
      ? 'Cubo risolto! Bravissimo. La prossima volta prova a fare qualche mossa da solo!'
      : 'Cubo risolto, e tutto da solo! Sei davvero un Rubik Hero!';
    return base;
  }, [usedHelp]);

  useEffect(() => {
    speak(`Cubo risolto! ${says}`);
  }, [says, speak]);

  return (
    <Screen title="CUBO RISOLTO!" emoji="🏆">
      <Rubi says={says} mood="festa" />

      <Card>
        <Text style={styles.big}>⭐ {progress.stars} stelle</Text>
        <View style={styles.row}>
          <Stat label="Mosse" value={String(moves)} />
          <Stat label="Tempo" value={timeMs ? formatTime(timeMs) : '—'} />
          <Stat label="Aiuti" value={String(session.helpUsed)} />
        </View>
        <Text style={styles.level}>{heroTitle(progress)}</Text>
      </Card>

      {newBadges.length ? (
        <Card>
          <Text style={styles.cardTitle}>Le tue medaglie</Text>
          {newBadges.map((b) => (
            <View key={b.id} style={styles.badgeRow}>
              <Text style={styles.badgeIcon}>{b.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.badgeTitle}>{b.title}</Text>
                <Text style={styles.badgeHow}>{b.celebration}</Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <BigButton
        label="Vuoi imparare a farlo da solo?"
        emoji="🎓"
        color={colors.info}
        giant
        onPress={() => navigation.navigate('Impara')}
      />
      <BigButton
        label="Risolvi un altro cubo"
        emoji="🧩"
        color={colors.success}
        onPress={() => {
          session.clear();
          navigation.navigate('ComeInserire');
        }}
      />
      <BigButton
        label="Torna a casa"
        emoji="🏠"
        color={colors.bgSoft}
        onPress={() => navigation.navigate('Home')}
      />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  big: {
    fontSize: font.big,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: space.sm,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: font.title,
    fontWeight: '900',
    color: colors.textSoft,
  },
  statLabel: {
    fontSize: font.small,
    color: colors.textSoft,
    fontWeight: '700',
  },
  level: {
    marginTop: space.sm,
    textAlign: 'center',
    fontSize: font.body,
    fontWeight: '900',
    color: colors.purple,
  },
  cardTitle: {
    fontSize: font.body,
    fontWeight: '900',
    color: colors.text,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  badgeIcon: {
    fontSize: 34,
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
});
