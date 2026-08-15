import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BadgeAward, Progress, emptyProgress, grantBadges } from '../../core/kids/achievements';
import { Difficulty } from '../../core/kids/instructions';

/**
 * Tutto quello che l'app ricorda sta QUI, e sta solo sul telefono.
 *
 * Non c'e' nessun account, nessun server, nessun identificativo. Il soprannome
 * e' facoltativo, serve solo per far apparire il nome nei messaggi di Rubi, e
 * si cancella con un pulsante nell'area genitore.
 */

export interface Settings {
  voice: boolean;
  /** Velocita' della voce: i bambini piu' piccoli preferiscono lenta. */
  voiceRate: number;
  difficulty: Difficulty;
  /** Suoni ed effetti. */
  sound: boolean;
}

export const defaultSettings: Settings = {
  voice: true,
  voiceRate: 0.92,
  difficulty: 'facile',
  sound: true,
};

interface StoreValue {
  ready: boolean;
  progress: Progress;
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  /** Aggiorna i progressi e restituisce i badge appena conquistati. */
  updateProgress: (fn: (p: Progress) => void) => BadgeAward[];
  resetAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const KEY_PROGRESS = 'rubikhero.progress.v1';
const KEY_SETTINGS = 'rubikhero.settings.v1';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);

  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([
          AsyncStorage.getItem(KEY_PROGRESS),
          AsyncStorage.getItem(KEY_SETTINGS),
        ]);
        if (p) setProgress({ ...emptyProgress(), ...JSON.parse(p) });
        if (s) setSettingsState({ ...defaultSettings, ...JSON.parse(s) });
      } catch {
        // Se il salvataggio e' rovinato ripartiamo da zero: nessun dato e'
        // abbastanza prezioso da far fallire l'avvio dell'app.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persistProgress = useCallback((p: Progress) => {
    AsyncStorage.setItem(KEY_PROGRESS, JSON.stringify(p)).catch(() => {});
  }, []);

  const updateProgress = useCallback(
    (fn: (p: Progress) => void): BadgeAward[] => {
      let awards: BadgeAward[] = [];
      setProgress((prev) => {
        const next: Progress = JSON.parse(JSON.stringify(prev));
        fn(next);
        awards = grantBadges(next);
        persistProgress(next);
        return next;
      });
      return awards;
    },
    [persistProgress],
  );

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    const fresh = emptyProgress();
    setProgress(fresh);
    persistProgress(fresh);
  }, [persistProgress]);

  const value = useMemo(
    () => ({ ready, progress, settings, setSettings, updateProgress, resetAll }),
    [ready, progress, settings, setSettings, updateProgress, resetAll],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore va usato dentro StoreProvider');
  return v;
}
