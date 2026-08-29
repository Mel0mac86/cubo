/**
 * 🤖 MONEY COACH — integrazione con il server.
 *
 * Il ragionamento (intenzione della domanda, calcoli, opzioni A/B) vive nel
 * dominio ed è condiviso con l'app: qui restano la persistenza della
 * conversazione e lo strato AI facoltativo, che riformula la bozza senza
 * poter toccare i numeri.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { PoolClient } from 'pg';
import type { Db } from '../db/pool.js';
import { config } from '../config.js';
import { buildDeterministicAnswer, type CoachAnswer } from '../domain/coach.js';
import { getChildState } from './state.js';

export {
  buildDeterministicAnswer,
  detectIntent,
  extractAmountCents,
  SUGGERIMENTI,
  type CoachAnswer,
  type CoachIntent,
  type CoachOption,
} from '../domain/coach.js';

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

