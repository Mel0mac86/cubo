import React, { useEffect, useRef } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import Navigation from './src/ui/navigation';
import ErrorBoundary from './src/ui/components/ErrorBoundary';
import { StoreProvider, useStore } from './src/ui/state/store';
import { SessionProvider } from './src/ui/state/cubeSession';
import { colors, font } from './src/ui/theme';

/**
 * Rubik Hero — app per imparare a risolvere il Cubo di Rubik, dai 9 anni.
 *
 * Tutto funziona senza rete: i solver, la validazione e il riconoscimento dei
 * colori girano sul telefono. Non c'e' nessun account e nessun dato lascia il
 * dispositivo.
 */
export default function App() {
  return (
    // La barriera sta PIU' IN ALTO di tutto il resto: se qualcosa si rompe,
    // il bambino vede un messaggio e un pulsante, non lo schermo vuoto che
    // React lascia quando smonta l'applicazione.
    <ErrorBoundary nome="app">
      <SafeAreaProvider>
        <StoreProvider>
          <SessionProvider>
            <StatusBar style="light" />
            <UsageTracker />
            <Gate />
          </SessionProvider>
        </StoreProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

/** Aspetta che i progressi siano stati letti dal telefono. */
function Gate() {
  const { ready } = useStore();
  if (!ready) {
    return (
      <View style={styles.splash}>
        <Text style={styles.logo}>🧩</Text>
        <Text style={styles.title}>Rubik Hero</Text>
      </View>
    );
  }
  return <Navigation />;
}

/**
 * Conta i minuti di utilizzo per l'area genitore.
 * E' l'unica cosa "di sorveglianza" dell'app, sta solo sul telefono e serve al
 * genitore per sapere quanto ci gioca il figlio.
 */
function UsageTracker() {
  const { updateProgress } = useStore();
  const openedAt = useRef<number>(Date.now());

  useEffect(() => {
    const flush = () => {
      const minutes = (Date.now() - openedAt.current) / 60000;
      openedAt.current = Date.now();
      if (minutes >= 0.5) {
        updateProgress((p) => {
          p.minutesUsed += minutes;
        });
      }
    };

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') openedAt.current = Date.now();
      else flush();
    });
    const id = setInterval(flush, 60_000);
    return () => {
      sub.remove();
      clearInterval(id);
      flush();
    };
  }, [updateProgress]);

  return null;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  logo: {
    fontSize: 90,
  },
  title: {
    color: colors.textOnDark,
    fontSize: font.huge,
    fontWeight: '900',
  },
});
