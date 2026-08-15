import React from 'react';
import { ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, radius, space } from '../theme';

interface Props {
  title?: string;
  emoji?: string;
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  footer?: React.ReactNode;
}

/** Cornice comune a tutte le schermate: sfondo viola, titolo grande. */
export default function Screen({ title, emoji, children, scroll = true, style, footer }: Props) {
  const body = (
    <View style={[styles.body, style]}>
      {title ? (
        <Text style={styles.title} accessibilityRole="header">
          {emoji ? `${emoji} ` : ''}
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** Riquadro bianco per raggruppare informazioni. */
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    padding: space.md,
    paddingBottom: space.xl,
  },
  body: {
    flex: 1,
    gap: space.sm,
  },
  title: {
    color: colors.textOnDark,
    fontSize: font.big,
    fontWeight: '900',
    marginBottom: space.xs,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  footer: {
    padding: space.md,
    backgroundColor: colors.bgSoft,
  },
});
