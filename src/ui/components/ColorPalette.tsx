import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLOR_EMOJI, COLOR_HEX, COLOR_LABEL_IT, CubeColor } from '../../core/cube/defs';
import { cubeColorList, font, radius, shade, space } from '../theme';

interface Props {
  onPick: (c: CubeColor) => void;
  selected?: CubeColor | null;
}

/**
 * I sei pulsanti dei colori. Niente tastiera, mai: si tocca il colore e basta.
 * Ogni pulsante ha il colore, l'emoji e il nome scritto, cosi funziona anche
 * per un bambino daltonico o che ancora legge poco.
 */
export default function ColorPalette({ onPick, selected }: Props) {
  return (
    <View style={styles.wrap}>
      {cubeColorList.map((c) => (
        <Pressable
          key={c}
          onPress={() => onPick(c)}
          accessibilityRole="button"
          accessibilityLabel={COLOR_LABEL_IT[c]}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: COLOR_HEX[c],
              borderBottomColor: shade(COLOR_HEX[c], -0.35),
            },
            selected === c && styles.selected,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.emoji}>{COLOR_EMOJI[c]}</Text>
          <Text
            style={[
              styles.label,
              { color: c === CubeColor.White || c === CubeColor.Yellow ? '#1E1B4B' : '#FFFFFF' },
            ]}
          >
            {COLOR_LABEL_IT[c]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.sm,
  },
  button: {
    width: '30%',
    minWidth: 100,
    minHeight: 76,
    borderRadius: radius.md,
    borderBottomWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
  },
  selected: {
    borderWidth: 4,
    borderColor: '#1E1B4B',
  },
  pressed: {
    transform: [{ translateY: 3 }],
    borderBottomWidth: 3,
  },
  emoji: {
    fontSize: 26,
  },
  label: {
    fontSize: font.small,
    fontWeight: '900',
    marginTop: 2,
  },
});
