/**
 * 🤖 MONEY COACH — assistente educativo.
 *
 * Architettura a due strati:
 *  1) MOTORE DETERMINISTICO (sempre attivo, funziona anche offline sul server):
 *     capisce l'intenzione della domanda, fa i CALCOLI VERI sui dati del bambino
 *     e costruisce una risposta con le opzioni A/B. Tutti i numeri nascono qui.
 *  2) STRATO AI (opzionale, Claude): riformula la risposta con un linguaggio
 *     adatto all'eta'. Riceve i numeri gia' calcolati e non deve inventarne.
 *
 * Regola non negoziabile: il Coach spiega e simula, NON decide al posto del bambino.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { PoolClient } from 'pg';
import type { Db } from '../db/pool.js';
import { config } from '../config.js';
import { formatCents, euroToCents, type Cents } from '../domain/money.js';
import { describeWeeks } from '../domain/goals.js';
import { simulatePurchase, type SimulationResult } from '../domain/simulator.js';
import { getChildState, type ChildState } from './state.js';

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
export function buildDeterministicAnswer(stato: ChildState, domanda: string): CoachAnswer {
  const intent = detectIntent(domanda);
  const importo = extractAmountCents(domanda);
  const goal = stato.primaryGoal;
  const nome = stato.child.name;
  const facts: string[] = [
    `SPEND: ${formatCents(stato.jars.SPEND)}`,
    `SAVE: ${formatCents(stato.jars.SAVE)}`,
    `GIVE: ${formatCents(stato.jars.GIVE)}`,
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
        `${simulation.affordable ? 'Puoi farlo!' : 'Al momento non ti bastano i soldi in SPEND.'} ` +
        `Prima però guardiamo insieme cosa succede. ${simulation.message} Vuoi confrontare due possibilità?`;
      options = [
        {
          id: 'A',
          title: 'Comprarlo oggi',
          detail: simulation.affordable
            ? `Ti restano ${formatCents(simulation.balanceAfterCents)} in SPEND.` +
              (simulation.opportunitaWeeks && simulation.opportunitaWeeks > 0
                ? ` L'obiettivo resta a ${describeWeeks(goal?.progress.weeksRemaining ?? null)}.`
                : '')
            : `Ti mancano ${formatCents(importo - stato.jars.SPEND)}: potresti fare un lavoretto extra.`,
        },
        {
          id: 'B',
          title: 'Aspettare e mettere questi soldi in SAVE',
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
          : 'Appena metti qualcosa in SAVE ti dico quante settimane mancano.');
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
          `Ricorda: quando il lavoro viene approvato, i soldi si dividono da soli fra SAVE, SPEND e GIVE.`;
      } else {
        text = lavori.length
          ? `Puoi chiedere uno di questi lavoretti: ${elenco}. Quando un genitore approva, i soldi entrano subito nei tuoi salvadanai!`
          : `In questo momento non ci sono lavoretti disponibili. Chiedi a un genitore di aggiungerne qualcuno nel menu GUADAGNA!`;
      }
      options = [
        { id: 'A', title: 'Fare un lavoretto', detail: lavori.length ? elenco : 'Chiedi a un genitore di crearne uno.' },
        { id: 'B', title: 'Aspettare la paghetta', detail: `Entra circa ${formatCents(stato.rate.weeklyCents)} a settimana in SAVE.` },
      ];
      suggestedActions.push({ label: 'Vai a GUADAGNA', action: 'APRI_LAVORI' });
      break;
    }

    case 'QUANTO_HO': {
      text =
        `Ecco la situazione, ${nome}: in SAVE hai ${formatCents(stato.jars.SAVE)}, in SPEND ${formatCents(stato.jars.SPEND)} ` +
        `e in GIVE ${formatCents(stato.jars.GIVE)}. In tutto ${formatCents(stato.jars.totalCents)}. ` +
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

const SYSTEM_PROMPT = `Sei "Money Coach", un assistente educativo dentro un'app di paghetta per bambini dai 9 ai 14 anni.

REGOLE ASSOLUTE:
1. NON decidere mai al posto del bambino. Non dire "compralo" o "non comprarlo": mostra le conseguenze e lascia scegliere.
2. Usa SOLO i numeri che trovi nel blocco DATI. Non inventare, non ricalcolare, non arrotondare diversamente.
3. Scrivi in italiano semplice, frasi corte, tono caldo e positivo. Massimo 90 parole.
4. Mai colpe, mai prediche, mai paura. Se il bambino ha speso tanto, mostra solo l'effetto sull'obiettivo.
5. Quando ha senso, chiudi proponendo due possibilità (A e B) come quelle nel blocco OPZIONI.
6. Non chiedere dati personali. Non parlare di banche, carte, pagamenti reali o acquisti online.
7. Se la domanda non riguarda i soldi, riporta gentilmente il discorso ai salvadanai o alle lezioni.

Il tuo compito è riscrivere in modo più naturale e amichevole la BOZZA, mantenendo identici tutti i numeri.`;

let clientAnthropic: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (!config.coachAiEnabled || !config.anthropicApiKey) return null;
  if (!clientAnthropic) clientAnthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  return clientAnthropic;
}

export function isAiAvailable(): boolean {
  return getAnthropic() !== null;
}

/**
 * Risposta del Coach. Se la chiave API è configurata, Claude riformula la
 * bozza; altrimenti (o in caso di errore) resta la risposta deterministica,
 * che è comunque completa e corretta.
 */
export async function ask(
  client: PoolClient,
  childId: string,
  domanda: string,
  now = new Date(),
): Promise<CoachAnswer> {
  const testo = domanda?.trim();
  if (!testo) throw Object.assign(new Error('Scrivi la tua domanda!'), { status: 400 });

  const stato = await getChildState(client, childId, now);
  const base = buildDeterministicAnswer(stato, testo);

  await client.query(`INSERT INTO coach_messages (child_id, role, content) VALUES ($1,'child',$2)`, [childId, testo]);

  let finale = base;
  const anthropic = getAnthropic();
  if (anthropic) {
    try {
      const risposta = await anthropic.messages.create({
        model: config.anthropicModel,
        max_tokens: 1200, // risposte volutamente brevi: max 90 parole
        system: SYSTEM_PROMPT,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        messages: [
          {
            role: 'user',
            content:
              `DOMANDA DEL BAMBINO (${stato.child.name}, ${stato.child.age ?? 9} anni): ${testo}\n\n` +
              `DATI (usa solo questi numeri):\n${base.facts.map((f) => `- ${f}`).join('\n')}\n\n` +
              `BOZZA DA RISCRIVERE:\n${base.text}\n\n` +
              (base.options.length
                ? `OPZIONI:\n${base.options.map((o) => `${o.id}) ${o.title} — ${o.detail}`).join('\n')}\n\n`
                : '') +
              `Riscrivi la bozza in modo naturale e amichevole. Stessi numeri, massimo 90 parole.`,
          },
        ],
      });
      const testoAi = risposta.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (testoAi) finale = { ...base, text: testoAi, source: 'AI' };
    } catch (err) {
      // L'AI è un miglioramento, non una dipendenza: in caso di errore si usa la bozza.
      console.warn('[coach] AI non disponibile, uso il motore deterministico:', (err as Error).message);
    }
  }

  await client.query(`INSERT INTO coach_messages (child_id, role, content, metadata) VALUES ($1,'coach',$2,$3)`, [
    childId,
    finale.text,
    JSON.stringify({ intent: finale.intent, source: finale.source, options: finale.options }),
  ]);

  return finale;
}

export async function getConversation(db: Db, childId: string, limit = 30) {
  const { rows } = await db.query(
    `SELECT id, role, content, metadata, created_at FROM coach_messages
      WHERE child_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [childId, limit],
  );
  return rows
    .map((r) => ({
      id: r.id,
      role: r.role as 'child' | 'coach',
      content: r.content,
      metadata: r.metadata ?? {},
      createdAt: new Date(r.created_at).toISOString(),
    }))
    .reverse();
}

export const SUGGERIMENTI = [
  'Posso comprare un gioco da 20 €?',
  'Quanto tempo ci vuole per la mia bici?',
  'Come posso guadagnare 20 €?',
  'Quanto devo risparmiare ogni settimana?',
  'Quanti soldi ho adesso?',
];
