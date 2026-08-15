import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import CubeView from '../components/CubeView';
import Rubi, { RubiMood } from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useStore } from '../state/store';
import { useVoice } from '../state/voice';
import { CubieCube, cubieToFacelet, identityCube, isSolved } from '../../core/cube/cubie';
import { Move, applyMoves, parseMoves } from '../../core/cube/moves';
import { facesToClassicColors } from '../../core/cube/scheme';
import { SIDE_NAME_IT, describeMove } from '../../core/kids/instructions';
import { completeLevel } from '../../core/kids/achievements';
import { solveBeginner } from '../../core/solver/beginner';
import { Face } from '../../core/cube/defs';
import { colors, font, radius, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Allenamento'>;

/**
 * Il cubo virtuale su cui esercitarsi.
 *
 * Il bambino gira le facce toccando i pulsanti: nessun cubo vero richiesto,
 * quindi si puo' allenare anche in macchina. Quando raggiunge l'obiettivo del
 * livello (la croce, il primo piano...) il livello e' superato.
 *
 * Il pulsante "aiutami" non risolve al posto suo: mostra la PROSSIMA mossa
 * giusta, calcolata dal solver a strati sullo stato attuale.
 */

const TURN_BUTTONS: { label: string; emoji: string; notation: string }[] = [
  { label: 'Sopra', emoji: '⬆️', notation: 'U' },
  { label: 'Sotto', emoji: '⬇️', notation: 'D' },
  { label: 'Destra', emoji: '➡️', notation: 'R' },
  { label: 'Sinistra', emoji: '⬅️', notation: 'L' },
  { label: 'Davanti', emoji: '🔵', notation: 'F' },
  { label: 'Dietro', emoji: '🟣', notation: 'B' },
];

const GOAL_LABEL: Record<string, string> = {
  cross: 'Fai la croce sulla faccia di sotto',
  firstLayer: 'Completa tutto il piano di sotto',
  secondLayer: 'Completa anche la fascia di mezzo',
  topCross: 'Fai la croce sulla faccia di sopra',
  topCorners: 'Gira gli angoli in cima tutti dello stesso colore',
  solved: 'Risolvi tutto il cubo',
};

export default function PracticeScreen({ navigation, route }: Props) {
  const { scramble, goal, level } = route.params;
  const { updateProgress } = useStore();
  const { speak, repeat } = useVoice();

  const start = useMemo(
    () => applyMoves(identityCube(), parseMoves(scramble)),
    [scramble],
  );

  const [history, setHistory] = useState<Move[]>([]);
  const [animId, setAnimId] = useState(0);
  const [animating, setAnimating] = useState<Move | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [reverse, setReverse] = useState(false);

  const cube = useMemo(() => applyMoves(start, history), [start, history]);

  /** L'obiettivo del livello e' raggiunto? */
  const reached = useMemo(() => checkGoal(cube, goal), [cube, goal]);

  const play = useCallback(
    (notation: string) => {
      const move = parseMoves(reverse ? `${notation}'` : notation)[0];
      setHistory((h) => [...h, move]);
      setAnimating(move);
      setAnimId((n) => n + 1);
      setHint(null);
    },
    [reverse],
  );

  const undo = () => {
    setHistory((h) => h.slice(0, -1));
    setHint(null);
  };

  const askHint = () => {
    try {
      const solution = solveBeginner(cube);
      const nextMove = solution.moves[0];
      if (!nextMove) {
        setHint('Il cubo e gia risolto! Sei stato bravissimo.');
        return;
      }
      const d = describeMove(nextMove, 'facile');
      setHint(`${d.text} (il ${SIDE_NAME_IT[nextMove.face]})`);
      repeat(d.speech);
    } catch {
      setHint('Uffa, questo non riesco a calcolarlo. Prova ad annullare qualche mossa!');
    }
  };

  const finish = () => {
    updateProgress((p) => {
      completeLevel(p, level);
      p.modeUsage.allenamento = (p.modeUsage.allenamento ?? 0) + 1;
    });
    navigation.navigate('Impara');
  };

  const mood: RubiMood = reached ? 'festa' : hint ? 'pensieroso' : 'felice';
  const says = reached
    ? 'Ce l hai fatta! Obiettivo raggiunto! 🎉'
    : (hint ?? `${GOAL_LABEL[goal]}. Prova con calma: puoi sempre annullare.`);

  return (
    <Screen
      scroll={false}
      title={`Livello ${level}`}
      emoji="🧩"
      footer={
        reached ? (
          <BigButton label="OBIETTIVO RAGGIUNTO!" emoji="🏆" color={colors.success} giant onPress={finish} />
        ) : (
          <View style={styles.controls}>
            <View style={styles.turnRow}>
              {TURN_BUTTONS.map((b) => (
                <BigButton
                  key={b.notation}
                  label={b.label}
                  emoji={b.emoji}
                  color={colors.bgSoft}
                  style={styles.turnButton}
                  onPress={() => play(b.notation)}
                />
              ))}
            </View>
            <View style={styles.turnRow}>
              <BigButton
                label={reverse ? 'Giro: indietro' : 'Giro: avanti'}
                emoji="🔃"
                color={reverse ? colors.pink : colors.info}
                style={styles.half}
                onPress={() => setReverse((r) => !r)}
              />
              <BigButton
                label="Annulla"
                emoji="↩️"
                color={colors.purple}
                style={styles.half}
                disabled={history.length === 0}
                onPress={undo}
              />
              <BigButton
                label="Aiutami!"
                emoji="🆘"
                color={colors.primary}
                style={styles.half}
                onPress={askHint}
              />
            </View>
          </View>
        )
      }
    >
      <Text style={styles.goal}>🎯 {GOAL_LABEL[goal]}</Text>

      <CubeView
        facelets={facesToClassicColors(cubieToFacelet(cube))}
        animate={animating ? { move: animating, id: animId } : null}
        onAnimationEnd={() => setAnimating(null)}
        interactive
        style={styles.cube}
      />

      <Rubi says={says} mood={mood} compact onRepeat={() => repeat(says)} />
      <Text style={styles.counter}>Mosse fatte: {history.length}</Text>
    </Screen>
  );
}

/** Verifica l'obiettivo direttamente sullo stato del cubo. */
function checkGoal(c: CubieCube, goal: string): boolean {
  const edges = (list: number[]) => list.every((e) => c.ep[e] === e && c.eo[e] === 0);
  const corners = (list: number[]) => list.every((k) => c.cp[k] === k && c.co[k] === 0);
  switch (goal) {
    case 'cross':
      return edges([4, 5, 6, 7]);
    case 'firstLayer':
      return edges([4, 5, 6, 7]) && corners([4, 5, 6, 7]);
    case 'secondLayer':
      return edges([4, 5, 6, 7]) && corners([4, 5, 6, 7]) && edges([8, 9, 10, 11]);
    case 'topCross':
      return (
        edges([4, 5, 6, 7]) &&
        corners([4, 5, 6, 7]) &&
        edges([8, 9, 10, 11]) &&
        [0, 1, 2, 3].every((e) => c.eo[e] === 0)
      );
    case 'topCorners':
      return (
        edges([4, 5, 6, 7]) &&
        corners([4, 5, 6, 7]) &&
        edges([8, 9, 10, 11]) &&
        [0, 1, 2, 3].every((e) => c.eo[e] === 0) &&
        [0, 1, 2, 3].every((k) => c.co[k] === 0)
      );
    case 'solved':
    default:
      return isSolved(c);
  }
}

const styles = StyleSheet.create({
  goal: {
    color: colors.textOnDark,
    fontSize: font.body,
    fontWeight: '900',
    textAlign: 'center',
  },
  cube: {
    flex: 1,
    maxHeight: 300,
  },
  counter: {
    color: colors.muted,
    fontSize: font.small,
    fontWeight: '700',
    textAlign: 'center',
  },
  controls: {
    gap: space.xs,
  },
  turnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  turnButton: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 60,
    marginVertical: 2,
  },
  half: {
    flex: 1,
    minHeight: 60,
    marginVertical: 2,
  },
});
