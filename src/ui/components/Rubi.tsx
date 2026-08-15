import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme';

export type RubiMood = 'felice' | 'pensieroso' | 'sorpreso' | 'festa';

const FACE: Record<RubiMood, string> = {
  felice: '🤖',
  pensieroso: '🤔',
  sorpreso: '😮',
  festa: '🥳',
};

interface Props {
  says: string;
  mood?: RubiMood;
  /** Se presente, toccando la nuvoletta Rubi ripete la frase. */
  onRepeat?: () => void;
  compact?: boolean;
}

/**
 * La mascotte. Rimbalza piano per attirare l'occhio senza distrarre, e la sua
 * nuvoletta e' toccabile per farsi ripetere la frase: e' il gesto piu' naturale
 * per un bambino che non ha capito.
 */
export default function Rubi({ says, mood = 'felice', onRepeat, compact }: Props) {
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: -8,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bounce]);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Animated.Text
        style={[styles.face, compact && styles.faceCompact, { transform: [{ translateY: bounce }] }]}
        accessibilityLabel="Rubi"
      >
        {FACE[mood]}
      </Animated.Text>
      <Pressable
        style={styles.bubble}
        onPress={onRepeat}
        accessibilityRole={onRepeat ? 'button' : 'text'}
        accessibilityLabel={onRepeat ? `Rubi dice: ${says}. Tocca per riascoltare.` : says}
      >
        <Text style={[styles.text, compact && styles.textCompact]}>{says}</Text>
        {onRepeat ? <Text style={styles.replay}>🔊 tocca per riascoltare</Text> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
  },
  wrapCompact: {
    gap: space.xs,
  },
  face: {
    fontSize: 56,
  },
  faceCompact: {
    fontSize: 36,
  },
  bubble: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    borderBottomWidth: 5,
    borderBottomColor: '#C7D2FE',
  },
  text: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    lineHeight: 26,
  },
  textCompact: {
    fontSize: font.small,
    lineHeight: 22,
  },
  replay: {
    marginTop: 4,
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '700',
  },
});
