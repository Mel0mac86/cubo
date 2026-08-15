import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLOR_HEX, CubeColor, Face } from '../../core/cube/defs';
import { ArrowDirection, ARROW_EMOJI, SIDE_SHORT_IT } from '../../core/kids/instructions';
import { colors, font, radius, space } from '../theme';

interface Props {
  facelets: (CubeColor | null)[];
  highlight?: Face | null;
  arrow?: ArrowDirection | null;
  /** Messaggio del perche' siamo finiti qui (mostrato piccolo, per i grandi). */
  motivo?: string;
}

/**
 * Il cubo disegnato in piano, "aperto" come una scatola di cartone.
 *
 * Serve quando il cubo in tre dimensioni non si puo' disegnare: telefoni che
 * non supportano WebGL, browser che lo bloccano, schede grafiche capricciose.
 * Non e' un messaggio di errore travestito: e' un cubo vero e leggibile, con
 * tutte e sei le facce visibili insieme. Un bambino ci si ritrova comunque, e
 * l'app resta completamente utilizzabile.
 */
export default function CubeFlat({ facelets, highlight, arrow, motivo }: Props) {
  const faccia = (f: Face) => (
    <View
      key={f}
      style={[styles.faccia, highlight === f && styles.facciaAccesa]}
      accessibilityLabel={`Faccia ${SIDE_SHORT_IT[f]}`}
    >
      <Text style={styles.etichetta}>{SIDE_SHORT_IT[f]}</Text>
      <View style={styles.griglia}>
        {Array.from({ length: 9 }, (_, i) => {
          const c = facelets[f * 9 + i];
          return (
            <View
              key={i}
              style={[
                styles.cella,
                { backgroundColor: c === null || c === undefined ? '#3F3F46' : COLOR_HEX[c] },
              ]}
            />
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={styles.wrap}>
      {/* Disposizione a croce: sopra, poi la fascia sinistra-davanti-destra-dietro, poi sotto */}
      <View style={styles.riga}>{faccia(Face.U)}</View>
      <View style={styles.riga}>
        {faccia(Face.L)}
        {faccia(Face.F)}
        {faccia(Face.R)}
        {faccia(Face.B)}
      </View>
      <View style={styles.riga}>{faccia(Face.D)}</View>

      {arrow ? <Text style={styles.freccia}>{ARROW_EMOJI[arrow]}</Text> : null}
      {motivo ? <Text style={styles.motivo}>{motivo}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
  },
  riga: {
    flexDirection: 'row',
    gap: space.xs,
  },
  faccia: {
    alignItems: 'center',
    padding: 3,
    borderRadius: radius.sm,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  facciaAccesa: {
    borderColor: colors.primary,
    backgroundColor: '#FFFFFF22',
  },
  etichetta: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  griglia: {
    width: 51,
    height: 51,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    padding: 2,
    backgroundColor: '#18181B',
    borderRadius: 6,
  },
  cella: {
    width: 13,
    height: 13,
    borderRadius: 3,
  },
  freccia: {
    fontSize: 36,
    marginTop: 2,
  },
  motivo: {
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
    opacity: 0.8,
  },
});
