import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef } from 'react';
import { useStore } from './store';

/**
 * La voce di Rubi.
 *
 * Usa la sintesi vocale del telefono: non manda niente in rete e funziona
 * anche in aereo. Se il bambino ha spento la voce nelle impostazioni, qui non
 * succede niente: e' l'unico punto da controllare.
 */
export function useVoice() {
  const { settings } = useStore();
  const lastSaid = useRef<string>('');

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const speak = useCallback(
    (text: string, opts: { force?: boolean } = {}) => {
      if (!settings.voice) return;
      const clean = text.replace(/[🎉🏆⭐️⭐🥳👋🚀📷🧩🎓⚙️👈👆👇✅🔄🆘🔍🎨🤔😊📸🟩⬜🟦🟩🟥🟨🟧⚪🔴🟢🟡🟠🔵]/gu, '').trim();
      if (!clean) return;
      // Non ripetere la stessa frase in continuazione: durante la scansione i
      // messaggi si aggiornano molte volte al secondo.
      if (!opts.force && clean === lastSaid.current) return;
      lastSaid.current = clean;
      Speech.stop();
      Speech.speak(clean, {
        language: 'it-IT',
        rate: settings.voiceRate,
        pitch: 1.12,
      });
    },
    [settings.voice, settings.voiceRate],
  );

  const repeat = useCallback(
    (text: string) => {
      lastSaid.current = '';
      speak(text, { force: true });
    },
    [speak],
  );

  const stop = useCallback(() => {
    Speech.stop();
    lastSaid.current = '';
  }, []);

  return { speak, repeat, stop, enabled: settings.voice };
}
