/**
 * SISTEMA XP E LIVELLI.
 *
 * Punto 6 del capitolato: NON si premia solo l'accumulo di denaro.
 * Le azioni che valgono di piu' sono quelle che dimostrano costanza,
 * comprensione e responsabilita' (lezioni, quiz, donazioni, registrare
 * una spesa, usare il simulatore prima di comprare).
 */

export const XP_RULES = {
  ONBOARDING_COMPLETATO: 20,
  SPLIT_SCELTO: 10,          // ha deciso da solo come dividere l'entrata
  LAVORO_COMPLETATO: 25,     // responsabilita'
  SPESA_REGISTRATA: 5,       // onesta': segna quello che spende
  SIMULATORE_USATO: 8,       // ha ragionato prima di comprare (max 1 volta/giorno)
  DONAZIONE: 30,             // generosita'
  OBIETTIVO_GIVE_COMPLETATO: 50,
  OBIETTIVO_COMPLETATO: 100,
  LEZIONE_COMPLETATA: 25,    // comprensione
  QUIZ_RISPOSTA_CORRETTA: 10,
  QUIZ_PERFETTO: 20,
  COSTANZA_SETTIMANALE: 40,  // ha risparmiato per N settimane di fila
  INTERESSE_RISCOSSO: 5,
  RISPARMIO_PER_EURO: 1,     // 1 XP per euro risparmiato...
  RISPARMIO_CAP: 20,         // ...ma non piu' di 20 XP per singola entrata
} as const;

export type XpReason = keyof typeof XP_RULES;

export interface LevelDef {
  level: number;
  name: string;
  emoji: string;
  minXp: number;
  description: string;
}

export const LEVELS: LevelDef[] = [
  { level: 1, name: 'Money Explorer', emoji: '🧭', minXp: 0, description: 'Stai iniziando la tua avventura con il denaro!' },
  { level: 2, name: 'Smart Saver', emoji: '🐷', minXp: 150, description: 'Hai capito come funziona il risparmio.' },
  { level: 3, name: 'Money Builder', emoji: '🏗️', minXp: 400, description: 'Costruisci i tuoi obiettivi, un pezzo alla volta.' },
  { level: 4, name: 'Goal Master', emoji: '🎯', minXp: 800, description: 'Sai scegliere e arrivare fino in fondo.' },
  { level: 5, name: 'Money Champion', emoji: '🏆', minXp: 1500, description: 'Decidi con la testa e con il cuore. Campione!' },
];

export interface LevelState {
  level: number;
  name: string;
  emoji: string;
  description: string;
  xp: number;
  xpInLevel: number;
  xpForNextLevel: number | null;
  progressPercent: number;
  isMax: boolean;
}

/** Stato del livello a partire dagli XP totali. */
export function levelFromXp(xp: number): LevelState {
  const totale = Math.max(0, Math.floor(xp || 0));
  let corrente = LEVELS[0];
  for (const l of LEVELS) if (totale >= l.minXp) corrente = l;
  const successivo = LEVELS.find((l) => l.level === corrente.level + 1) ?? null;
  const xpInLevel = totale - corrente.minXp;
  const span = successivo ? successivo.minXp - corrente.minXp : 0;
  return {
    level: corrente.level,
    name: corrente.name,
    emoji: corrente.emoji,
    description: corrente.description,
    xp: totale,
    xpInLevel,
    xpForNextLevel: successivo ? successivo.minXp - totale : null,
    progressPercent: successivo ? Math.round(Math.min(100, (xpInLevel * 100) / span)) : 100,
    isMax: !successivo,
  };
}

/** XP guadagnati mettendo da parte dei soldi (con tetto: non si vince solo accumulando). */
export function xpForSaving(amountCents: number): number {
  if (amountCents <= 0) return 0;
  return Math.min(XP_RULES.RISPARMIO_CAP, Math.floor(amountCents / 100) * XP_RULES.RISPARMIO_PER_EURO);
}

/** true se aggiungendo `delta` XP si cambia livello. */
export function levelUpHappened(xpPrima: number, xpDopo: number): boolean {
  return levelFromXp(xpDopo).level > levelFromXp(xpPrima).level;
}
