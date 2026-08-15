import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLOR_HEX, CubeColor, Face } from '../../core/cube/defs';
import { colors, font, radius, space } from '../theme';

interface Props {
  /** Nove colori (o null se il quadratino non e' ancora stato scelto). */
  cells: (CubeColor | null)[];
  onCellPress?: (index: number) => void;
  /** Quadratino attualmente selezionato. */
  selected?: number | null;
  /** Quadratini da evidenziare perche' sospetti. */
  suspects?: number[];
  /** Sicurezza del riconoscimento (0..1) per ciascun quadratino. */
  confidences?: number[];
  size?: number;
  /** Etichetta piccola sotto la griglia. */
  caption?: string;
}

/**
 * La faccia grande a nove quadratoni.
 * Il quadratino centrale ha un pallino: e' il modo piu' semplice per dire al
 * bambino "guarda quello in mezzo" senza usare parole tecniche.
 */
export default function FaceGrid({
  cells,
  onCellPress,
  selected,
  suspects = [],
  confidences,
  size = 260,
  caption,
}: Props) {
  const cell = (size - 8 * 4) / 3;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.grid, { width: size, height: size }]}>
        {cells.map((c, i) => {
          const suspect = suspects.includes(i);
          const unsure = confidences ? confidences[i] < 0.7 : false;
          return (
            <Pressable
              key={i}
              onPress={() => onCellPress?.(i)}
              disabled={!onCellPress}
              accessibilityRole="button"
              accessibilityLabel={`Quadratino ${i + 1}${c === null ? ', vuoto' : ''}`}
              style={[
                styles.cell,
                {
                  width: cell,
                  height: cell,
                  backgroundColor: c === null ? '#E5E7EB' : COLOR_HEX[c],
                },
                selected === i && styles.selected,
                suspect && styles.suspect,
              ]}
            >
              {i === 4 ? <View style={styles.centerDot} /> : null}
              {c === null ? <Text style={styles.question}>?</Text> : null}
              {unsure && c !== null ? <Text style={styles.unsure}>⚠️</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 8,
    backgroundColor: '#18181B',
    borderRadius: radius.md,
  },
  cell: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {
    borderWidth: 5,
    borderColor: colors.primary,
  },
  suspect: {
    borderWidth: 5,
    borderColor: colors.danger,
  },
  centerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00000055',
  },
  question: {
    fontSize: 30,
    fontWeight: '900',
    color: '#9CA3AF',
  },
  unsure: {
    position: 'absolute',
    top: 2,
    right: 2,
    fontSize: 15,
  },
  caption: {
    marginTop: space.sm,
    color: colors.textOnDark,
    fontSize: font.small,
    fontWeight: '700',
  },
});
