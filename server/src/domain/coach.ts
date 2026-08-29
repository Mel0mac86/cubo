/**
 * 🤖 MONEY COACH — il ragionamento.
 *
 * Questa parte è pura: prende lo stato del bambino e restituisce la risposta,
 * con tutti i calcoli veri e le due possibilità A/B. Non conosce né database né
 * rete, quindi gira identica sul server e dentro l'app sul telefono.
 *
 * Regola non negoziabile: il Coach spiega e simula, NON decide al posto del bambino.
 */
import { formatCents, euroToCents, type Cents } from './money.js';
import { describeWeeks, type WeeklyRate } from './goals.js';
import { simulatePurchase, type SimulationResult } from './simulator.js';
import { NOMI_JAR } from './etichette.js';

/**
 * Lo stretto necessario che il Coach deve conoscere dello stato del bambino.
 * Descritto per forma e non per import, così non lega il dominio al server.
 */
export interface StatoPerCoach {
  child: { name: string; age: number | null };
  jars: { SAVE: Cents; SPEND: Cents; GIVE: Cents; totalCents: Cents };
  rate: WeeklyRate;
  primaryGoal: {
    name: string;
    emoji: string;
    targetCents: Cents;
    progress: { savedCents: Cents; remainingCents: Cents; percent: number; weeksRemaining: number | null; projectedDate: string | null };
  } | null;
  jobs: { title: string; emoji: string; rewardCents: Cents }[];
}

export type CoachIntent =
  | 'POSSO_COMPRARE'
  | 'QUANTO_TEMPO'
  | 'QUANTO_RISPARMIARE'
  | 'COME_GUADAGNARE'
  | 'QUANTO_HO'
  | 'SPIEGAZIONE'
  | 'GENERALE';

export interface CoachOption {
  id: 'A' | 'B';
  title: string;
  detail: string;
}

export interface CoachAnswer {
  intent: CoachIntent;
  text: string;
  options: CoachOption[];
  simulation: SimulationResult | null;
  facts: string[];
  suggestedActions: { label: string; action: string; payload?: Record<string, unknown> }[];
  source: 'REGOLE' | 'AI';
}

/** Estrae il primo importo citato nella domanda ("un gioco da 20 euro" -> 2000). */
export function extractAmountCents(testo: string): Cents | null {
  const normalizzato = testo.toLowerCase().replace(/€/g, ' € ');
  const match = normalizzato.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur|euro)?/);
  const conValuta = normalizzato.match(/(?:€|eur|euro)\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur|euro)/);
  const grezzo = conValuta ? (conValuta[1] ?? conValuta[2]) : match?.[1];
  if (!grezzo) return null;
  try {
    const cents = euroToCents(grezzo.replace(',', '.'));
    return cents > 0 && cents <= 100_000_00 ? cents : null;
  } catch {
    return null;
  }
}

/** Riconosce l'intenzione della domanda con parole chiave italiane. */
export function detectIntent(testo: string): CoachIntent {
  const t = testo.toLowerCase();
  if (/(posso (comprar|prender)|mi conviene|dovrei comprar|voglio comprar|compro)/.test(t)) return 'POSSO_COMPRARE';
  if (/(quanto (tempo|ci vuole|manca)|quando (arriv|riesc)|fra quanto|tra quanto|settimane)/.test(t)) return 'QUANTO_TEMPO';
  if (/(quanto devo risparmi|quanto mettere|quanto da parte|come risparmi)/.test(t)) return 'QUANTO_RISPARMIARE';
  if (/(guadagn|lavor|come faccio ad aver|come ottengo|soldi in piu)/.test(t)) return 'COME_GUADAGNARE';
  if (/(quanto ho|quanti soldi|saldo|quanto c.?è)/.test(t)) return 'QUANTO_HO';
  if (/(cos.?è|cosa (vuol dire|significa)|perch[eé]|spiegami|come funziona)/.test(t)) return 'SPIEGAZIONE';
  return 'GENERALE';
}

/** Costruisce la risposta con i calcoli reali sullo stato del bambino. */
export function buildDeterministicAnswer(stato: StatoPerCoach, domanda: string): CoachAnswer {
  const intent = detectIntent(domanda);
  const importo = extractAmountCents(domanda);
  const goal = stato.primaryGoal;
  const nome = stato.child.name;
  const facts: string[] = [
    `${NOMI_JAR.SPEND}: ${formatCents(stato.jars.SPEND)}`,
    `${NOMI_JAR.SAVE}: ${formatCents(stato.jars.SAVE)}`,
    `${NOMI_JAR.GIVE}: ${formatCents(stato.jars.GIVE)}`,
    `Ritmo di risparmio: ${formatCents(stato.rate.weeklyCents)} a settimana`,
  ];
  if (goal) {
    facts.push(
      `Obiettivo "${goal.name}" ${goal.emoji}: ${formatCents(goal.progress.savedCents)} / ${formatCents(goal.targetCents)} ` +
        `(${goal.progress.percent}%), mancano ${formatCents(goal.progress.remainingCents)}, ${describeWeeks(goal.progress.weeksRemaining)}`,
    );
  }

  let simulation: SimulationResult | null = null;
  let text = '';
  let options: CoachOption[] = [];
  const suggestedActions: CoachAnswer['suggestedActions'] = [];

  switch (intent) {
    case 'POSSO_COMPRARE': {
      if (!importo) {
        text = `Certo che possiamo ragionarci! Quanto costa la cosa che vuoi comprare, ${nome}? Scrivimi il prezzo e ti mostro cosa succede al tuo obiettivo.`;
        break;
      }
      simulation = simulatePurchase({
        amountCents: importo,
        jar: 'SPEND',
        jarBalanceCents: stato.jars.SPEND,
        goal: goal ? { name: goal.name, emoji: goal.emoji, targetCents: goal.targetCents, savedCents: goal.progress.savedCents } : null,
        rate: stato.rate,
        label: 'questo',
      });
      text =
        `${simulation.affordable ? 'Puoi farlo!' : `Al momento non ti bastano i soldi in ${NOMI_JAR.SPEND}.`} ` +
        `Prima però guardiamo insieme cosa succede. ${simulation.message} Vuoi confrontare due possibilità?`;
      options = [
        {
          id: 'A',
          title: 'Comprarlo oggi',
          detail: simulation.affordable
            ? `Ti restano ${formatCents(simulation.balanceAfterCents)} in ${NOMI_JAR.SPEND}.` +
              (simulation.opportunitaWeeks && simulation.opportunitaWeeks > 0
                ? ` L'obiettivo resta a ${describeWeeks(goal?.progress.weeksRemaining ?? null)}.`
                : '')
            : `Ti mancano ${formatCents(importo - stato.jars.SPEND)}: potresti fare un lavoretto extra.`,
        },
        {
          id: 'B',
          title: `Aspettare e mettere questi soldi in ${NOMI_JAR.SAVE}`,
          detail:
            simulation.opportunitaWeeks && simulation.opportunitaWeeks > 0 && goal
              ? `${goal.emoji} ${goal.name} arriverebbe circa ${simulation.opportunitaWeeks} settiman${simulation.opportunitaWeeks === 1 ? 'a' : 'e'} prima.`
              : 'Metti da parte e vedi crescere il tuo risparmio (e l’interesse!).',
        },
      ];
      suggestedActions.push({ label: 'Apri il simulatore', action: 'APRI_SIMULATORE', payload: { amountCents: importo } });
      break;
    }

    case 'QUANTO_TEMPO': {
      if (!goal) {
        text = `Non hai ancora un obiettivo attivo, ${nome}. Creane uno e ti dirò subito quante settimane servono!`;
        suggestedActions.push({ label: 'Crea un obiettivo', action: 'CREA_OBIETTIVO' });
        break;
      }
      text =
        `Per ${goal.emoji} ${goal.name} hai messo da parte ${formatCents(goal.progress.savedCents)} su ${formatCents(goal.targetCents)} ` +
        `(${goal.progress.percent}%). Ti mancano ${formatCents(goal.progress.remainingCents)}. ` +
        (goal.progress.weeksRemaining !== null
          ? `Al ritmo di ${formatCents(stato.rate.weeklyCents)} a settimana ci arrivi in ${describeWeeks(goal.progress.weeksRemaining)}` +
            (goal.progress.projectedDate ? ` (verso il ${formatDate(goal.progress.projectedDate)}).` : '.')
          : `Appena metti qualcosa in ${NOMI_JAR.SAVE} ti dico quante settimane mancano.`);
      options = [
        { id: 'A', title: 'Continuare così', detail: `${describeWeeks(goal.progress.weeksRemaining)} al ritmo di adesso.` },
        {
          id: 'B',
          title: 'Accelerare con un lavoretto',
          detail: stato.jobs.length
            ? `Per esempio: ${stato.jobs[0].emoji} ${stato.jobs[0].title} (${formatCents(stato.jobs[0].rewardCents)}).`
            : 'Chiedi ai tuoi genitori se c’è un lavoretto extra da fare.',
        },
      ];
      break;
    }

    case 'QUANTO_RISPARMIARE': {
      if (!goal) {
        text = `Dipende dal tuo obiettivo! Creane uno con nome e prezzo e ti dico esattamente quanto mettere da parte ogni settimana.`;
        suggestedActions.push({ label: 'Crea un obiettivo', action: 'CREA_OBIETTIVO' });
        break;
      }
      const perOttoSettimane = Math.ceil(goal.progress.remainingCents / 8);
      const perQuattro = Math.ceil(goal.progress.remainingCents / 4);
      text =
        `Ti mancano ${formatCents(goal.progress.remainingCents)} per ${goal.emoji} ${goal.name}. ` +
        `Se vuoi arrivarci in 8 settimane devi mettere via circa ${formatCents(perOttoSettimane)} a settimana; ` +
        `in 4 settimane servirebbero ${formatCents(perQuattro)} a settimana. Quale ti sembra possibile?`;
      options = [
        { id: 'A', title: '8 settimane', detail: `${formatCents(perOttoSettimane)} a settimana.` },
        { id: 'B', title: '4 settimane', detail: `${formatCents(perQuattro)} a settimana (più impegnativo!).` },
      ];
      break;
    }

    case 'COME_GUADAGNARE': {
      const obiettivoImporto = importo ?? goal?.progress.remainingCents ?? 0;
      const lavori = stato.jobs.slice(0, 4);
      const elenco = lavori.map((j) => `${j.emoji} ${j.title} (${formatCents(j.rewardCents)})`).join(', ');
      if (obiettivoImporto > 0 && lavori.length > 0) {
        const migliore = [...lavori].sort((a, b) => b.rewardCents - a.rewardCents)[0];
        const quante = Math.ceil(obiettivoImporto / migliore.rewardCents);
        text =
          `Per mettere insieme ${formatCents(obiettivoImporto)} puoi usare il menu GUADAGNA: ${elenco}. ` +
          `Per esempio ${migliore.emoji} ${migliore.title} ${quante} volt${quante === 1 ? 'a' : 'e'} ti darebbe quello che ti serve. ` +
          `Ricorda: quando il lavoro viene approvato, i soldi si dividono da soli fra ${NOMI_JAR.SAVE}, ${NOMI_JAR.SPEND} e ${NOMI_JAR.GIVE}.`;
      } else {
        text = lavori.length
          ? `Puoi chiedere uno di questi lavoretti: ${elenco}. Quando un genitore approva, i soldi entrano subito nei tuoi salvadanai!`
          : `In questo momento non ci sono lavoretti disponibili. Chiedi a un genitore di aggiungerne qualcuno nel menu GUADAGNA!`;
      }
      options = [
        { id: 'A', title: 'Fare un lavoretto', detail: lavori.length ? elenco : 'Chiedi a un genitore di crearne uno.' },
        { id: 'B', title: 'Aspettare la paghetta', detail: `Entra circa ${formatCents(stato.rate.weeklyCents)} a settimana in ${NOMI_JAR.SAVE}.` },
      ];
      suggestedActions.push({ label: 'Vai a GUADAGNA', action: 'APRI_LAVORI' });
      break;
    }

    case 'QUANTO_HO': {
      text =
        `Ecco la situazione, ${nome}: in ${NOMI_JAR.SAVE} hai ${formatCents(stato.jars.SAVE)}, ` +
        `in ${NOMI_JAR.SPEND} ${formatCents(stato.jars.SPEND)} e in ${NOMI_JAR.GIVE} ${formatCents(stato.jars.GIVE)}. In tutto ${formatCents(stato.jars.totalCents)}. ` +
        (goal ? `Per ${goal.emoji} ${goal.name} mancano ${formatCents(goal.progress.remainingCents)}.` : '');
      break;
    }

    case 'SPIEGAZIONE': {
      text =
        `Bella domanda! Nell'app ci sono 10 mini-lezioni da 2-3 minuti: parlano di risparmio, percentuali, interesse e di come decidere prima di comprare. ` +
        `Se vuoi te ne apro una — oppure chiedimi un esempio con i TUOI numeri e te lo faccio vedere.`;
      suggestedActions.push({ label: 'Apri le lezioni', action: 'APRI_LEZIONI' });
      break;
    }

    default: {
      text =
        `Ciao ${nome}! Posso aiutarti a capire cosa succede ai tuoi soldi. Prova a chiedermi: ` +
        `"Posso comprare un gioco da 20 €?", "Quanto tempo ci vuole per la bici?", "Come posso guadagnare 20 €?".`;
    }
  }

  return { intent, text, options, simulation, facts, suggestedActions, source: 'REGOLE' };
}

function formatDate(iso: string): string {
  const [a, m, g] = iso.split('-');
  return `${g}/${m}/${a}`;
}

/** Domande pronte da proporre al bambino. */
export const SUGGERIMENTI = [
  'Posso comprare un gioco da 20 €?',
  'Quanto tempo ci vuole per la mia bici?',
  'Come posso guadagnare 20 €?',
  'Quanto devo risparmiare ogni settimana?',
  'Quanti soldi ho adesso?',
];
