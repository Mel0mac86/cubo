/**
 * SIMULATORE DELLE SCELTE.
 *
 * Principio educativo (punto 22): "TU DECIDI. NOI TI MOSTRIAMO COSA SUCCEDE."
 * Il simulatore non blocca mai un acquisto: mostra il confronto fra i due futuri.
 */
import type { Cents } from './money.js';
import { formatCents } from './money.js';
import { computeGoalProgress, describeWeeks, type GoalProgress, type WeeklyRate } from './goals.js';
import type { JarType } from './types.js';
import { NOMI_JAR } from './etichette.js';

export interface SimulationInput {
  amountCents: Cents;
  jar: Extract<JarType, 'SPEND' | 'SAVE'>;
  jarBalanceCents: Cents;
  /** Progresso attuale dell'obiettivo principale (assente = nessun obiettivo). */
  goal?: { name: string; emoji: string; targetCents: Cents; savedCents: Cents } | null;
  rate: WeeklyRate;
  now?: Date;
  label?: string;
}

export type ImpactKind = 'NESSUN_OBIETTIVO' | 'NESSUN_IMPATTO' | 'RITARDO' | 'COSTO_OPPORTUNITA';

export interface SimulationScenario {
  weeksRemaining: number | null;
  projectedDate: string | null;
  savedCents: Cents;
  percent: number;
}

export interface SimulationResult {
  amountCents: Cents;
  jar: JarType;
  label: string;
  affordable: boolean;
  balanceAfterCents: Cents;
  goalName: string | null;
  goalEmoji: string | null;
  senzaAcquisto: SimulationScenario | null;
  conAcquisto: SimulationScenario | null;
  /** Settimane di ritardo sull'obiettivo (>0 = piu' lontano). */
  deltaWeeks: number | null;
  /** Settimane che potresti guadagnare mettendo questa cifra in SAVE. */
  opportunitaWeeks: number | null;
  impact: ImpactKind;
  headline: string;
  message: string;
  /** Quanto tempo serve per riguadagnare la cifra spesa al ritmo attuale. */
  recuperoWeeks: number | null;
  tips: string[];
}

function toScenario(p: GoalProgress): SimulationScenario {
  return {
    weeksRemaining: p.weeksRemaining,
    projectedDate: p.projectedDate,
    savedCents: p.savedCents,
    percent: p.percent,
  };
}

export function simulatePurchase(input: SimulationInput): SimulationResult {
  const now = input.now ?? new Date();
  const label = input.label?.trim() || 'questo acquisto';
  const importo = Math.max(0, input.amountCents);
  const affordable = input.jarBalanceCents >= importo;
  const balanceAfterCents = input.jarBalanceCents - importo;
  const tips: string[] = [];

  const recuperoWeeks = input.rate.weeklyCents > 0 ? Math.ceil(importo / input.rate.weeklyCents) : null;

  if (!input.goal || input.goal.targetCents <= 0) {
    return {
      amountCents: importo,
      jar: input.jar,
      label,
      affordable,
      balanceAfterCents,
      goalName: null,
      goalEmoji: null,
      senzaAcquisto: null,
      conAcquisto: null,
      deltaWeeks: null,
      opportunitaWeeks: null,
      impact: 'NESSUN_OBIETTIVO',
      headline: affordable ? 'Puoi farlo!' : 'Non hai abbastanza in questo salvadanaio',
      message: affordable
        ? maiuscola(`${label} non allontana niente: non hai ancora un obiettivo attivo. Vuoi crearne uno? Così ti mostro sempre cosa succede.`)
        : `In questo salvadanaio ci sono ${formatCents(input.jarBalanceCents)} e ti servono ${formatCents(importo)}.`,
      recuperoWeeks,
      tips: ['Crea un obiettivo: così ogni scelta diventa più facile da capire.'],
    };
  }

  const goal = input.goal;
  const senza = computeGoalProgress({ targetCents: goal.targetCents, savedCents: goal.savedCents, rate: input.rate, now });

  if (input.jar === 'SAVE') {
    // La spesa esce direttamente dal salvadanaio dell'obiettivo: ritardo reale.
    const con = computeGoalProgress({
      targetCents: goal.targetCents,
      savedCents: Math.max(0, goal.savedCents - importo),
      rate: input.rate,
      now,
    });
    const deltaWeeks =
      senza.weeksRemaining !== null && con.weeksRemaining !== null ? con.weeksRemaining - senza.weeksRemaining : null;

    if (recuperoWeeks !== null) tips.push(`Con un lavoretto extra potresti recuperare ${formatCents(importo)} più in fretta.`);
    tips.push('Puoi anche comprare qualcosa di più piccolo: l’obiettivo si allontana di meno.');

    return {
      amountCents: importo,
      jar: input.jar,
      label,
      affordable,
      balanceAfterCents,
      goalName: goal.name,
      goalEmoji: goal.emoji,
      senzaAcquisto: toScenario(senza),
      conAcquisto: toScenario(con),
      deltaWeeks,
      opportunitaWeeks: null,
      impact: deltaWeeks && deltaWeeks > 0 ? 'RITARDO' : 'NESSUN_IMPATTO',
      headline: deltaWeeks && deltaWeeks > 0 ? `${goal.emoji} si allontana di ${settimaneTesto(deltaWeeks)}` : 'Il tuo obiettivo non cambia molto',
      message: deltaWeeks && deltaWeeks > 0
        ? `Questi soldi stanno nel salvadanaio ${NOMI_JAR.SAVE}, quello del tuo obiettivo. Se compri ${label} per ${formatCents(importo)}, ${goal.name} passa da ${describeWeeks(senza.weeksRemaining)} a ${describeWeeks(con.weeksRemaining)}. Decidi tu!`
        : `Se compri ${label} per ${formatCents(importo)}, ${goal.name} resta più o meno alla stessa distanza. Decidi tu!`,
      recuperoWeeks,
      tips,
    };
  }

  // Acquisto dal salvadanaio SPEND: l'obiettivo NON viene toccato.
  // Mostriamo comunque il costo-opportunita': cosa succederebbe mettendo la cifra in SAVE.
  const seRisparmiato = computeGoalProgress({
    targetCents: goal.targetCents,
    savedCents: goal.savedCents + importo,
    rate: input.rate,
    now,
  });
  const opportunitaWeeks =
    senza.weeksRemaining !== null && seRisparmiato.weeksRemaining !== null
      ? senza.weeksRemaining - seRisparmiato.weeksRemaining
      : null;

  if (opportunitaWeeks && opportunitaWeeks > 0) {
    tips.push(`Se sposti ${formatCents(importo)} in SAVE, ${goal.name} arriva ${settimaneTesto(opportunitaWeeks)} prima.`);
  }
  tips.push(`Soldi in ${NOMI_JAR.SPEND}: sono tuoi, puoi spenderli senza sensi di colpa.`);

  return {
    amountCents: importo,
    jar: input.jar,
    label,
    affordable,
    balanceAfterCents,
    goalName: goal.name,
    goalEmoji: goal.emoji,
    senzaAcquisto: toScenario(senza),
    conAcquisto: toScenario(senza), // l'obiettivo non cambia
    deltaWeeks: 0,
    opportunitaWeeks,
    impact: opportunitaWeeks && opportunitaWeeks > 0 ? 'COSTO_OPPORTUNITA' : 'NESSUN_IMPATTO',
    headline: affordable ? 'Puoi farlo!' : `Ti mancano dei soldi in ${NOMI_JAR.SPEND}`,
    message: affordable
      ? maiuscola(`${label} costa ${formatCents(importo)} ed esce da ${NOMI_JAR.SPEND}, quindi ${goal.name} resta a ${describeWeeks(senza.weeksRemaining)}.`) +
        (opportunitaWeeks && opportunitaWeeks > 0
          ? ` Se invece li mettessi in ${NOMI_JAR.SAVE}, ci arriveresti ${settimaneTesto(opportunitaWeeks)} prima. Scegli tu!`
          : ' Scegli tu!')
      : `In ${NOMI_JAR.SPEND} hai ${formatCents(input.jarBalanceCents)} e ti servono ${formatCents(importo)}. Potresti fare un lavoretto extra oppure aspettare la prossima paghetta.`,
    recuperoWeeks,
    tips,
  };
}

/** Prima lettera maiuscola: i messaggi vengono anche incastonati in altre frasi. */
function maiuscola(testo: string): string {
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

function settimaneTesto(n: number): string {
  const v = Math.abs(n);
  return v === 1 ? '1 settimana' : `${v} settimane`;
}
