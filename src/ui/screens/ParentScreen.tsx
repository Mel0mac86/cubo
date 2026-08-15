import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useStore } from '../state/store';
import { formatTime, heroTitle } from '../../core/kids/achievements';
import { LEARN_LEVELS } from '../../core/kids/learn';
import { colors, font, radius, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AreaGenitore'>;

/**
 * Area genitore.
 *
 * Il "cancello" e' una moltiplicazione a due cifre: e' la verifica classica
 * per queste app, sufficiente a fermare un bambino di nove anni e a non
 * infastidire un adulto. Non e' e non vuole essere una password di sicurezza:
 * dietro non c'e' comunque nessun dato sensibile ne' nessun acquisto.
 */
export default function ParentScreen({ navigation }: Props) {
  const { progress, resetAll, updateProgress } = useStore();
  const [answer, setAnswer] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [nickname, setNickname] = useState(progress.nickname ?? '');

  const gate = useMemo(() => {
    const a = 7 + Math.floor(Math.random() * 6);
    const b = 11 + Math.floor(Math.random() * 8);
    return { a, b, result: a * b };
  }, []);

  const avgMoves = progress.cubesSolved
    ? Math.round(progress.totalMoves / progress.cubesSolved)
    : 0;

  if (!unlocked) {
    return (
      <Screen title="Area genitore" emoji="👨‍👩‍👧">
        <Card>
          <Text style={styles.gateTitle}>Solo per i grandi</Text>
          <Text style={styles.gateText}>
            Per entrare, risolvi questa moltiplicazione:
          </Text>
          <Text style={styles.gateSum}>
            {gate.a} × {gate.b} = ?
          </Text>
          <TextInput
            value={answer}
            onChangeText={setAnswer}
            keyboardType="number-pad"
            style={styles.input}
            placeholder="La risposta"
            placeholderTextColor="#94A3B8"
            accessibilityLabel="Risposta alla moltiplicazione"
          />
          <BigButton
            label="Entra"
            emoji="🔓"
            color={colors.purple}
            onPress={() => {
              if (Number(answer.trim()) === gate.result) setUnlocked(true);
              else Alert.alert('Non e la risposta giusta', 'Riprova pure.');
            }}
          />
        </Card>
        <BigButton label="Torna indietro" emoji="🔙" color={colors.bgSoft} onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen title="Area genitore" emoji="👨‍👩‍👧">
      <Card>
        <Text style={styles.section}>Progressi</Text>
        <Row label="Cubi risolti" value={String(progress.cubesSolved)} />
        <Row label="Risolti senza aiuto" value={String(progress.solvedWithoutHelp)} />
        <Row label="Aiuti richiesti" value={String(progress.helpUsed)} />
        <Row label="Mosse in media" value={avgMoves ? String(avgMoves) : '—'} />
        <Row label="Miglior tempo" value={formatTime(progress.bestTimeMs)} />
        <Row
          label="Livelli completati"
          value={`${progress.levelsCompleted.length} / ${LEARN_LEVELS.length}`}
        />
        <Row label="Medaglie" value={String(progress.badges.length)} />
        <Row label="Livello" value={heroTitle(progress)} />
      </Card>

      <Card>
        <Text style={styles.section}>Modalita usate</Text>
        {Object.keys(progress.modeUsage).length === 0 ? (
          <Text style={styles.note}>Ancora nessuna sessione registrata.</Text>
        ) : (
          Object.entries(progress.modeUsage).map(([mode, n]) => (
            <Row key={mode} label={mode} value={`${n} volte`} />
          ))
        )}
        <Row label="Tempo di utilizzo" value={`${Math.round(progress.minutesUsed)} minuti`} />
      </Card>

      <Card>
        <Text style={styles.section}>Soprannome del bambino</Text>
        <Text style={styles.note}>
          Facoltativo. Serve solo perche Rubi lo saluti per nome. Resta su questo telefono e non
          viene inviato da nessuna parte: meglio un soprannome, non il nome e cognome vero.
        </Text>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          style={styles.input}
          maxLength={16}
          placeholder="Es. Leo, Stella, Drago"
          placeholderTextColor="#94A3B8"
          accessibilityLabel="Soprannome"
        />
        <BigButton
          label="Salva"
          emoji="💾"
          color={colors.success}
          onPress={() =>
            updateProgress((p) => {
              p.nickname = nickname.trim() || undefined;
            })
          }
        />
      </Card>

      <Card>
        <Text style={styles.section}>Privacy</Text>
        <Text style={styles.note}>
          • Nessun account, nessuna registrazione, nessun dato inviato a server nostri.{'\n'}
          • Nessuna pubblicita e nessun acquisto dentro l app.{'\n'}
          • Nessuna chat e nessun contatto con altre persone.{'\n'}
          • La fotocamera si accende solo nella schermata di scansione: le immagini restano in
          memoria per il tempo di un fotogramma, non vengono salvate in galleria ne inviate.{'\n'}
          • L unica cosa memorizzata sono i progressi qui sopra, su questo telefono.
        </Text>
      </Card>

      <Card>
        <Text style={styles.section}>Cancella tutto</Text>
        <Text style={styles.note}>
          Azzera progressi, medaglie e soprannome. Non si puo annullare.
        </Text>
        <BigButton
          label="Cancella i dati"
          emoji="🗑️"
          color={colors.danger}
          onPress={() =>
            Alert.alert('Cancellare tutto?', 'Progressi e medaglie verranno azzerati.', [
              { text: 'Annulla', style: 'cancel' },
              {
                text: 'Cancella',
                style: 'destructive',
                onPress: () => {
                  resetAll();
                  setNickname('');
                },
              },
            ])
          }
        />
      </Card>

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
  gateTitle: {
    fontSize: font.title,
    fontWeight: '900',
    color: colors.text,
  },
  gateText: {
    fontSize: font.small,
    color: colors.textSoft,
  },
  gateSum: {
    fontSize: font.huge,
    fontWeight: '900',
    color: colors.purple,
    textAlign: 'center',
    marginVertical: space.sm,
  },
  input: {
    borderWidth: 2,
    borderColor: '#C7D2FE',
    borderRadius: radius.sm,
    padding: space.md,
    fontSize: font.body,
    color: colors.text,
    minHeight: 56,
  },
  section: {
    fontSize: font.title,
    fontWeight: '900',
    color: colors.text,
  },
  note: {
    fontSize: font.small,
    color: colors.textSoft,
    lineHeight: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  rowLabel: {
    fontSize: font.small,
    color: colors.textSoft,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  rowValue: {
    fontSize: font.small,
    color: colors.text,
    fontWeight: '900',
  },
});
