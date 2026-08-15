import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { chunky, colors, font, radius, space } from '../theme';

interface Props {
  label: string;
  emoji?: string;
  onPress: () => void;
  color?: string;
  /** Il pulsante gigante della schermata iniziale. */
  giant?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  /** Riga piccola sotto l'etichetta. */
  sub?: string;
}

/**
 * Un pulsante che un bambino non puo' sbagliare: grande, colorato, con emoji.
 * L'area premibile e' sempre piu' alta di 64 punti.
 */
export default function BigButton({
  label,
  emoji,
  onPress,
  color = colors.primary,
  giant,
  disabled,
  style,
  sub,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${emoji ? `${emoji} ` : ''}${label}`}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        chunky(disabled ? colors.muted : color),
        giant && styles.giant,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <View style={styles.row}>
        {emoji ? <Text style={[styles.emoji, giant && styles.emojiGiant]}>{emoji}</Text> : null}
        <View style={styles.labels}>
          <Text style={[styles.label, giant && styles.labelGiant]} numberOfLines={2}>
            {label}
          </Text>
          {sub ? <Text style={styles.sub}>{sub}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 68,
    justifyContent: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    marginVertical: space.sm,
    borderRadius: radius.lg,
  },
  giant: {
    minHeight: 96,
  },
  pressed: {
    transform: [{ translateY: 3 }],
    borderBottomWidth: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  labels: {
    flex: 1,
  },
  emoji: {
    fontSize: 30,
  },
  emojiGiant: {
    fontSize: 40,
  },
  label: {
    color: '#FFFFFF',
    fontSize: font.title,
    fontWeight: '900',
  },
  labelGiant: {
    fontSize: font.big,
  },
  sub: {
    color: '#FFFFFFDD',
    fontSize: font.small,
    marginTop: 2,
    fontWeight: '600',
  },
});
