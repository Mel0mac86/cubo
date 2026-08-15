import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme';

interface Props {
  children: React.ReactNode;
  /** Cosa mostrare al posto del contenuto rotto. Se manca, si usa il pannello standard. */
  fallback?: (info: { message: string; retry: () => void }) => React.ReactNode;
  /** Nome della parte protetta, per capire dai dettagli dove si e' rotto. */
  nome?: string;
}

interface State {
  errore: Error | null;
  dettagli: string;
}

/**
 * Rete di sicurezza contro lo schermo vuoto.
 *
 * Quando un errore risale fino alla radice, React SMONTA TUTTA l'applicazione:
 * il bambino vede la schermata di avvio per un istante e poi il nulla, senza
 * nessuna spiegazione. E' successo davvero su iPhone, ed e' inaccettabile in
 * un'app per bambini: chi la usa non ha la piu' pallida idea di cosa fare, e
 * chi deve ripararla non ha nessuna informazione (la console del browser, su
 * telefono, non la apre nessuno).
 *
 * Con questa barriera un pezzo rotto resta un pezzo rotto: il resto dell'app
 * continua a funzionare, e il motivo finisce sullo schermo.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { errore: null, dettagli: '' };

  static getDerivedStateFromError(errore: Error): Partial<State> {
    return { errore };
  }

  componentDidCatch(errore: Error, info: React.ErrorInfo): void {
    this.setState({
      dettagli: `${errore.message}\n${(info.componentStack ?? '').split('\n').slice(0, 6).join('\n')}`,
    });
  }

  riprova = (): void => {
    this.setState({ errore: null, dettagli: '' });
  };

  render(): React.ReactNode {
    const { errore } = this.state;
    if (!errore) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback({ message: errore.message, retry: this.riprova });
    }

    return (
      <View style={styles.wrap}>
        <Text style={styles.faccia}>🤖</Text>
        <Text style={styles.titolo}>Ops, mi si e inceppato qualcosa!</Text>
        <Text style={styles.testo}>
          Non e colpa tua. Prova a toccare il pulsante qui sotto: di solito riparte tutto.
        </Text>

        <Pressable style={styles.bottone} onPress={this.riprova} accessibilityRole="button">
          <Text style={styles.bottoneTesto}>🔄 RIPROVA</Text>
        </Pressable>

        <Text style={styles.perGrandi}>Per i grandi, se serve raccontarlo a qualcuno:</Text>
        <ScrollView style={styles.dettagliBox}>
          <Text style={styles.dettagli} selectable>
            {this.props.nome ? `[${this.props.nome}] ` : ''}
            {this.state.dettagli || errore.message}
          </Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    gap: space.sm,
  },
  faccia: {
    fontSize: 64,
  },
  titolo: {
    color: colors.textOnDark,
    fontSize: font.title,
    fontWeight: '900',
    textAlign: 'center',
  },
  testo: {
    color: colors.muted,
    fontSize: font.body,
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 25,
  },
  bottone: {
    backgroundColor: colors.primary,
    borderBottomWidth: 5,
    borderBottomColor: colors.primaryDark,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    minHeight: 64,
    justifyContent: 'center',
    marginTop: space.sm,
  },
  bottoneTesto: {
    color: '#FFFFFF',
    fontSize: font.title,
    fontWeight: '900',
  },
  perGrandi: {
    marginTop: space.lg,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  dettagliBox: {
    maxHeight: 160,
    alignSelf: 'stretch',
    backgroundColor: '#00000033',
    borderRadius: radius.sm,
    padding: space.sm,
  },
  dettagli: {
    color: '#C7D2FE',
    fontSize: 12,
    lineHeight: 17,
  },
});
