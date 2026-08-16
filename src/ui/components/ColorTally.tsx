import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLOR_EMOJI, CubeColor } from '../../core/cube/defs';
import { ContoColore, QUADRATINI_PER_COLORE, contaColori } from '../../core/kids/entry';
import { colors, font, radius, space } from '../theme';

interface Props {
  /** I 54 colori inseriti finora (null dove manca). */
  cells: (CubeColor | null)[];
  /** Mostra anche i colori non ancora usati (di default si vedono tutti). */
  compact?: boolean;
}

/**
 * Il contatore dei colori: sei gettoni che dicono "⚪ 5/9".
 *
 * E' la rete di sicurezza dell'inserimento a mano. Su un cubo vero ogni colore
 * compare esattamente nove volte: se il conto sale a dieci lo si deve vedere
 * SUBITO, mentre il cubo e' ancora in mano e la faccia sbagliata e' ancora
 * sotto gli occhi. Scoprirlo solo alla fine, dopo 54 tocchi, e' quello che
 * faceva dire all'app "hai messo un colore di troppo" senza poter aiutare.
 */
export default function ColorTally({ cells, compact }: Props) {
  const conti = contaColori(cells);
  const sbagliato = conti.some((c) => c.troppi);

  return (
    <View style={styles.wrap}>
      {conti.map((c) => (
        <Gettone key={c.color} conto={c} compact={compact} />
      ))}
      {sbagliato ? (
        <Text style={styles.warn}>
          ⚠️ Ogni colore sta 9 volte: quello segnato in rosso e di troppo
        </Text>
      ) : null}
    </View>
  );
}

function Gettone({ conto, compact }: { conto: ContoColore; compact?: boolean }) {
  const completo = conto.messi === QUADRATINI_PER_COLORE;
  return (
    <View
      style={[
        styles.chip,
        completo && styles.chipDone,
        conto.troppi && styles.chipBad,
      ]}
    >
      <Text style={styles.emoji}>{COLOR_EMOJI[conto.color]}</Text>
      <Text
        style={[styles.count, conto.troppi && styles.countBad]}
        accessibilityLabel={`${conto.messi} su ${QUADRATINI_PER_COLORE}`}
      >
        {conto.messi}
        {compact ? '' : `/${QUADRATINI_PER_COLORE}`}
      </Text>
      {conto.troppi ? <Text style={styles.bang}>⚠️</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: '#00000033',
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 34,
  },
  chipDone: {
    borderColor: colors.success,
  },
  chipBad: {
    backgroundColor: colors.danger,
    borderColor: '#FFFFFF',
  },
  emoji: {
    fontSize: 15,
  },
  count: {
    color: colors.textOnDark,
    fontSize: font.small,
    fontWeight: '900',
  },
  countBad: {
    color: '#FFFFFF',
  },
  bang: {
    fontSize: 13,
  },
  warn: {
    width: '100%',
    textAlign: 'center',
    color: colors.textOnDark,
    fontSize: font.small,
    fontWeight: '800',
    marginTop: space.xs,
  },
});
