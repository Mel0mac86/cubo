import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import Rubi from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useSession } from '../state/cubeSession';
import { useStore } from '../state/store';
import { useVoice } from '../state/voice';
import { challengeMessage, formatTime } from '../../core/kids/achievements';
import { colors, font, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Sfida'>;

/**
 * Sfida a tempo.
 *
 * Scelte volute: il cronometro si vede solo mentre si gioca, non ci sono
 * classifiche pubbliche, non c'e' nessun premio per giocare tanto, e alla fine
 * si confronta il tempo SOLO con il proprio record. Si compete con se stessi,
 * non con altri bambini.
 */
export default function ChallengeScreen({ navigation }: Props) {
  const { progress, updateProgress } = useStore();
  const session = useSession();
  const { speak } = useVoice();

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const [result, setResult] = useState<{ ms: number; improvedByMs: number } | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current);
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  const start = () => {
    startedAt.current = Date.now();
    setElapsed(0);
    setResult(null);
    setRunning(true);
    speak('Via! Mescola il cubo e prova a risolverlo. Prendi tutto il tempo che ti serve.');
  };

  const stop = () => {
    if (!startedAt.current) return;
    const ms = Date.now() - startedAt.current;
    setRunning(false);
    startedAt.current = null;

    const previousBest = progress.bestTimeMs;
    const improvedByMs = previousBest !== undefined && ms < previousBest ? previousBest - ms : 0;

    updateProgress((p) => {
      p.lastTimeMs = ms;
      if (p.bestTimeMs === undefined || ms < p.bestTimeMs) p.bestTimeMs = ms;
      p.modeUsage.sfida = (p.modeUsage.sfida ?? 0) + 1;
    });

    setResult({ ms, improvedByMs });
    speak(
      improvedByMs > 0
        ? `Fantastico! Hai migliorato il tuo tempo di ${Math.round(improvedByMs / 1000)} secondi!`
        : 'Bel tentativo! Riprova quando vuoi.',
    );
  };

  return (
    <Screen title="Sfida a tempo" emoji="⚡">
      <Rubi
        says={
          running
            ? 'Vai vai vai! Io sto zitto cosi ti concentri.'
            : result
              ? challengeMessage(progress, result.improvedByMs)
              : 'Quanto sei veloce? Prendi il tuo cubo, io conto il tempo. Nessuna fretta: si gareggia solo con se stessi!'
        }
        mood={result && result.improvedByMs > 0 ? 'festa' : 'felice'}
      />

      <Card>
        <Text style={styles.timer}>⏱️ {formatTime(elapsed)}</Text>
        <Text style={styles.best}>
          Il tuo record: {formatTime(progress.bestTimeMs)}
        </Text>
      </Card>

      {running ? (
        <BigButton label="HO FINITO!" emoji="🏁" color={colors.success} giant onPress={stop} />
      ) : (
        <BigButton label="VIA!" emoji="🚀" color={colors.primary} giant onPress={start} />
      )}

      {result ? (
        <Card>
          <Text style={styles.resultTitle}>Tempo: {formatTime(result.ms)}</Text>
          {result.improvedByMs > 0 ? (
            <Text style={styles.resultGood}>
              🎉 Hai battuto il tuo record di {Math.round(result.improvedByMs / 1000)} secondi!
            </Text>
          ) : (
            <Text style={styles.resultNote}>
              Il record resta {formatTime(progress.bestTimeMs)}. Ci riprovi quando vuoi: non c e
              nessuna fretta.
            </Text>
          )}
        </Card>
      ) : null}

      <BigButton
        label="Non ci riesco: aiutami tu"
        emoji="🧩"
        color={colors.info}
        onPress={() => {
          session.clear();
          navigation.navigate('ComeInserire');
        }}
      />
      <BigButton label="Torna a casa" emoji="🏠" color={colors.bgSoft} onPress={() => navigation.navigate('Home')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  timer: {
    fontSize: 56,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  best: {
    fontSize: font.body,
    fontWeight: '700',
    color: colors.textSoft,
    textAlign: 'center',
  },
  resultTitle: {
    fontSize: font.title,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  resultGood: {
    fontSize: font.body,
    fontWeight: '800',
    color: colors.successDark,
    textAlign: 'center',
  },
  resultNote: {
    fontSize: font.small,
    color: colors.textSoft,
    textAlign: 'center',
    lineHeight: 24,
  },
});
