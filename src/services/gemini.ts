/**
 * Rubi "intelligente": spiegazioni extra generate con Gemini.
 *
 * Regole non negoziabili, perche' l'utente e' un bambino:
 *
 * 1. E' un EXTRA, mai una dipendenza. Solver, validatore, scansione, livelli e
 *    minigiochi funzionano tutti senza rete: se Gemini non risponde, Rubi usa
 *    la frase scritta a mano e il bambino non si accorge di niente.
 * 2. Non si manda MAI niente che riguardi il bambino: niente soprannome,
 *    niente progressi, niente immagini della fotocamera. Si manda solo la
 *    descrizione tecnica della mossa, che non identifica nessuno.
 * 3. La funzione e' spenta finche' un adulto non la accende, e la chiave sta
 *    in una variabile d'ambiente, mai nel codice.
 * 4. La risposta viene ripulita e accorciata prima di finire sullo schermo.
 */

import { Move, movesToString } from '../core/cube/moves';
import { Difficulty, KidInstruction } from '../core/kids/instructions';

/**
 * La chiave arriva da .env (non versionato) tramite EXPO_PUBLIC_GEMINI_API_KEY.
 *
 * ATTENZIONE, per chi legge: in una app mobile qualunque chiave inclusa nel
 * pacchetto e' leggibile da chi scarica l'app: EXPO_PUBLIC_ finisce nel
 * bundle. Va bene solo per provare. Per la pubblicazione sugli store, la
 * chiamata va spostata dietro un piccolo servizio proprio che tiene la chiave
 * sul server (vedi README, sezione "Gemini").
 */
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const MODEL = 'gemini-2.0-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export function isGeminiConfigured(): boolean {
  return API_KEY.trim().length > 0;
}

const SYSTEM_RULES = [
  'Sei Rubi, la mascotte di un app che insegna il Cubo di Rubik a bambini di 9 anni.',
  'Rispondi SEMPRE in italiano, con al massimo due frasi corte.',
  'Non usare mai la notazione del cubo (R, U, F, R primo, R2) e non usare parole tecniche',
  'come algoritmo, permutazione, orientamento, senso orario o antiorario.',
  'Parla di "lato destro", "lato di sopra", "verso l alto", "verso di te".',
  'Sii allegro e incoraggiante, ma non esagerare con gli entusiasmi.',
  'Non fare domande al bambino e non chiedere mai informazioni personali.',
].join(' ');

interface HintRequest {
  instruction: KidInstruction;
  difficulty: Difficulty;
  /** Quante volte il bambino ha gia' chiesto aiuto su questa mossa. */
  attempts: number;
  /** Titolo della fase in corso ("La croce", "Il piano di mezzo"...). */
  stageTitle?: string;
}

/** Ripulisce la risposta: niente notazione, niente sproloqui. */
export function sanitizeHint(text: string): string | null {
  const clean = text
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  // Se il modello ha comunque infilato la notazione, scartiamo: meglio la
  // frase scritta a mano che una spiegazione che il bambino non capisce.
  if (/\b[URFDLB](['’2])?\b/.test(clean)) return null;
  if (/algoritm|permutaz|orientament|antiorari|senso orario/i.test(clean)) return null;
  const short = clean.length > 220 ? `${clean.slice(0, 217).trimEnd()}...` : clean;
  return short;
}

/**
 * Chiede a Gemini un modo diverso di spiegare la stessa mossa.
 * Restituisce null (e non lancia mai) se non e' configurato, se la rete non va
 * o se la risposta non passa i controlli: chi chiama usa il testo di riserva.
 */
export async function fetchRubiHint(
  req: HintRequest,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<string | null> {
  if (!isGeminiConfigured()) return null;

  const { instruction, attempts, stageTitle } = req;
  const prompt = [
    SYSTEM_RULES,
    '',
    'Il bambino deve fare questo movimento sul suo cubo:',
    `"${instruction.text}"`,
    stageTitle ? `In questo momento stiamo facendo: ${stageTitle}.` : '',
    attempts > 1
      ? 'Ha gia chiesto aiuto piu di una volta: prova a spiegarlo in un modo completamente diverso, magari con un paragone.'
      : 'Spiegalo con parole tue, in modo semplice e simpatico.',
  ]
    .filter(Boolean)
    .join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 4000);

  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: opts.signal ?? controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 120,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return sanitizeHint(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Descrizione della soluzione per l'area avanzata (genitore/curiosi). */
export function solutionSummary(moves: Move[]): string {
  return movesToString(moves);
}
