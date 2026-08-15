import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import ColorPalette from '../components/ColorPalette';
import FaceGrid from '../components/FaceGrid';
import Rubi from '../components/Rubi';
import Screen from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useSession } from '../state/cubeSession';
import { useVoice } from '../state/voice';
import { COLOR_EMOJI, CubeColor, Face, FACE_ORDER } from '../../core/cube/defs';
import { colors, font, radius, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Correggi' | 'AnteprimaScansione'>;

const FACE_TAB: { face: Face; label: string }[] = [
  { face: Face.F, label: 'Davanti' },
  { face: Face.R, label: 'Destra' },
  { face: Face.B, label: 'Dietro' },
  { face: Face.L, label: 'Sinistra' },
  { face: Face.U, label: 'Sopra' },
  { face: Face.D, label: 'Sotto' },
];

/**
 * Correzione manuale: si tocca un quadratino e si sceglie il colore giusto.
 *
 * E' la stessa schermata sia dopo la scansione (anteprima "questi sono i
 * colori che ho visto") sia quando il controllo trova qualcosa di strano.
 * La modalita' manuale resta SEMPRE disponibile: e' la rete di sicurezza di
 * tutta l'app.
 */
export default function FixColorsScreen({ navigation, route }: Props) {
  const session = useSession();
  const { repeat } = useVoice();

  const fromScan = route.name === 'AnteprimaScansione';
  const uncertain: number[] = (route.params as { uncertain?: number[] })?.uncertain ?? [];
  const startFace = (route.params as { face?: Face })?.face ?? Face.F;

  const [face, setFace] = useState<Face>(startFace);
  const [selected, setSelected] = useState<number | null>(null);
  const [picked, setPicked] = useState<CubeColor | null>(null);

  const cells = useMemo(
    () => Array.from({ length: 9 }, (_, i) => session.colors[face * 9 + i]),
    [session.colors, face],
  );

  const localSuspects = uncertain
    .filter((i) => Math.floor(i / 9) === face)
    .map((i) => i % 9);

  const says = fromScan
    ? 'Questi sono i colori che ho visto! Controlla se e tutto giusto. Se qualcosa non va, tocca il quadratino e scegli il colore corretto.'
    : 'Tocca il quadratino sbagliato e poi scegli il colore giusto. Puoi cambiare quante volte vuoi!';

  const applyColor = (c: CubeColor) => {
    setPicked(c);
    if (selected === null) return;
    session.setColor(face * 9 + selected, c);
    setSelected(null);
  };

  const tapCell = (i: number) => {
    if (picked !== null) {
      session.setColor(face * 9 + i, picked);
      setSelected(null);
    } else {
      setSelected(i);
    }
  };

  const missing = session.colors.filter((c) => c === null).length;

  return (
    <Screen
      title={fromScan ? 'Controlla i colori' : 'Cambia colore'}
      emoji={fromScan ? '👀' : '✏️'}
      footer={
        <BigButton
          label={missing > 0 ? `Mancano ${missing} quadratini` : 'TUTTO GIUSTO, CONTROLLIAMO!'}
          emoji={missing > 0 ? '👆' : '✅'}
          color={missing > 0 ? colors.muted : colors.success}
          disabled={missing > 0}
          onPress={() => navigation.navigate('Controllo')}
        />
      }
    >
      <Rubi says={says} onRepeat={() => repeat(says)} compact />

      <View style={styles.tabs}>
        {FACE_TAB.map((t) => {
          const center = session.colors[t.face * 9 + 4];
          const hasProblem = uncertain.some((i) => Math.floor(i / 9) === t.face);
          return (
            <Pressable
              key={t.face}
              onPress={() => {
                setFace(t.face);
                setSelected(null);
              }}
              style={[styles.tab, face === t.face && styles.tabActive]}
              accessibilityRole="button"
              accessibilityLabel={`Faccia ${t.label}`}
            >
              <Text style={styles.tabEmoji}>
                {center !== null ? COLOR_EMOJI[center] : '⬜'}
                {hasProblem ? '⚠️' : ''}
              </Text>
              <Text style={[styles.tabLabel, face === t.face && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.gridWrap}>
        <FaceGrid
          cells={cells}
          selected={selected}
          suspects={localSuspects}
          onCellPress={tapCell}
          caption={
            selected !== null
              ? 'Adesso scegli il colore giusto 👇'
              : 'Tocca il quadratino da cambiare'
          }
        />
      </View>

      <ColorPalette onPick={applyColor} selected={picked} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.xs,
  },
  tab: {
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: '#00000033',
    alignItems: 'center',
    minWidth: 74,
    minHeight: 56,
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabEmoji: {
    fontSize: 20,
  },
  tabLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  gridWrap: {
    alignItems: 'center',
    marginVertical: space.md,
  },
});
