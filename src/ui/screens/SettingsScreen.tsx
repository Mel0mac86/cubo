import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import Rubi from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useStore } from '../state/store';
import { useVoice } from '../state/voice';
import { Difficulty } from '../../core/kids/instructions';
import { colors, font, radius, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Impostazioni'>;

const LEVELS: { id: Difficulty; emoji: string; title: string; what: string }[] = [
  {
    id: 'facile',
    emoji: '🟢',
    title: 'FACILE',
    what: 'Rubi spiega tutto per bene e ti fa vedere ogni mossa piano piano.',
  },
  {
    id: 'normale',
    emoji: '🟡',
    title: 'NORMALE',
    what: 'Meno suggerimenti, e cominci a vedere i nomi veri delle mosse.',
  },
  {
    id: 'esperto',
    emoji: '🔴',
    title: 'ESPERTO',
    what: 'Solo le mosse, scritte come fanno i campioni. E anche molte meno!',
  },
];

export default function SettingsScreen({ navigation }: Props) {
  const { settings, setSettings } = useStore();
  const { speak } = useVoice();

  return (
    <Screen title="Impostazioni" emoji="⚙️">
      <Rubi says="Qui puoi decidere come ti aiuto. Se sei alle prime armi, lascia tutto com e!" compact />

      <Card>
        <Text style={styles.section}>La mia voce</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>🔊 Rubi parla</Text>
          <Switch
            value={settings.voice}
            onValueChange={(v) => {
              setSettings({ voice: v });
              if (v) setTimeout(() => speak('Eccomi! Adesso mi senti.'), 120);
            }}
            trackColor={{ true: colors.success, false: '#94A3B8' }}
            thumbColor="#FFFFFF"
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>🐢 Parla piano</Text>
          <Switch
            value={settings.voiceRate <= 0.85}
            onValueChange={(v) => setSettings({ voiceRate: v ? 0.78 : 0.92 })}
            trackColor={{ true: colors.success, false: '#94A3B8' }}
            thumbColor="#FFFFFF"
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>🎵 Suoni</Text>
          <Switch
            value={settings.sound}
            onValueChange={(v) => setSettings({ sound: v })}
            trackColor={{ true: colors.success, false: '#94A3B8' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </Card>

      <Card>
        <Text style={styles.section}>Quanto ti aiuto?</Text>
        {LEVELS.map((l) => {
          const active = settings.difficulty === l.id;
          return (
            <Pressable
              key={l.id}
              onPress={() => setSettings({ difficulty: l.id })}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.level, active && styles.levelActive]}
            >
              <Text style={styles.levelEmoji}>{l.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.levelTitle, active && styles.levelTitleActive]}>{l.title}</Text>
                <Text style={styles.levelWhat}>{l.what}</Text>
              </View>
              {active ? <Text style={styles.check}>✅</Text> : null}
            </Pressable>
          );
        })}
      </Card>

      <BigButton
        label="Area genitore"
        emoji="👨‍👩‍👧"
        color={colors.purple}
        onPress={() => navigation.navigate('AreaGenitore')}
      />
      <BigButton label="Torna a casa" emoji="🏠" color={colors.bgSoft} onPress={() => navigation.navigate('Home')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    fontSize: font.title,
    fontWeight: '900',
    color: colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  switchLabel: {
    fontSize: font.body,
    fontWeight: '800',
    color: colors.textSoft,
  },
  level: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 3,
    borderColor: 'transparent',
    minHeight: 76,
  },
  levelActive: {
    borderColor: colors.success,
    backgroundColor: '#F0FDF4',
  },
  levelEmoji: {
    fontSize: 26,
  },
  levelTitle: {
    fontSize: font.body,
    fontWeight: '900',
    color: colors.text,
  },
  levelTitleActive: {
    color: colors.successDark,
  },
  levelWhat: {
    fontSize: font.small,
    color: colors.textSoft,
  },
  check: {
    fontSize: 22,
  },
});
