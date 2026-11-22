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
  /** Quante caselle per lato: 3 sul cubo normale, 4 sul cubo grande. */
  n?: number;
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
  n = 3,
  caption,
}: Props) {
  // Lo spazio fra le caselle si stringe quando sono di piu', cosi la griglia
  // del cubo grande resta della stessa dimensione di quella del piccolo.
  const vuoto = n >= 4 ? 5 : 8;
  const cell = (size - vuoto * (n + 1)) / n;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.grid, { width: size, height: size, gap: vuoto, padding: vuoto }]}>
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
                  borderRadius: n >= 4 ? 7 : 10,
                  backgroundColor: c === null ? '#E5E7EB' : COLOR_HEX[c],
                },
                selected === i && styles.selected,
                suspect && styles.suspect,
              ]}
            >
              {n === 3 && i === 4 ? <View style={styles.centerDot} /> : null}
              {c === null ? <Text style={[styles.question, n >= 4 && { fontSize: 20 }]}>?</Text> : null}
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
