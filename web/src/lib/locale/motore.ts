/**
 * MODALITÀ LOCALE — il "server" che gira dentro il telefono.
 *
 * Espone le stesse rotte dell'API vera, così le schermate non cambiano di una
 * riga: l'app non sa se sta parlando con un server o con questo motore.
 *
 * Cosa resta identico:
 *  - le regole del denaro (stesso dominio del server);
 *  - la protezione della modalità genitore: senza PIN non si aprono le rotte
 *    /parent/*, esattamente come sul server.
 * Cosa cambia:
 *  - i dati vivono solo su questo telefono (vedi archivio.ts);
 *  - il Money Coach usa solo il motore deterministico: una chiave AI dentro un
 *    sito statico sarebbe visibile a chiunque, quindi non esiste.
 */
import { formatCents } from '@dominio/money.js';
import { previewSplit, normalizeSplit, validateSplit } from '@dominio/split.js';
import { simulatePurchase } from '@dominio/simulator.js';
import { compareSimpleVsCompound, projectCompound } from '@dominio/interest.js';
import { buildDeterministicAnswer, SUGGERIMENTI } from '@dominio/coach.js';
import { getLesson } from '@contenuti/lessons.js';
import { DONATION_CAUSES, HISTORY_FILTERS, type DonationCause, type HistoryFilter, type Split } from '@dominio/types.js';
import {
  derivaHash, leggiArchivio, modifica, nuovoId, nuovoSale, verificaSegreto,
  type Archivio, type BambinoLocale,
} from './archivio';
import {
  ErroreLocale, accreditaInteresse, aggiungiEntrata, assegnaXp, avvisa, bambino, completaObiettivo,
  correggiQuiz, dona, elencoLezioni, giroconto, obiettiviConProgresso, obiettivoPrincipale, registraSpesa,
  ritmoSettimanale, saldi, sbloccaBadge, statistiche, statoBambino, storico, verificaIntegrita,
} from './operazioni';
import { creaDemo } from './demo';

const DEMO_EMAIL = 'famiglia.demo@mymoneyadventure.app';
const DEMO_PASSWORD = 'paghetta2025';
const DEMO_PIN = '1234';

/** Il permesso di genitore vive solo in memoria e scade: come sul server. */
let permessoGenitore: { token: string; scadenza: number } | null = null;
const MINUTI_GENITORE = 30;

function esigiGenitore(opzioni: { parent?: boolean }, token: string | null): void {
  if (!opzioni.parent) return;
  if (!permessoGenitore || permessoGenitore.token !== token || Date.now() > permessoGenitore.scadenza) {
    throw new ErroreLocale(403, 'NON_AUTORIZZATO', 'Questa parte è riservata ai genitori: serve il PIN.');
  }
}

function esigiFamiglia(a: Archivio): NonNullable<Archivio['famiglia']> {
  if (!a.famiglia) throw new ErroreLocale(401, 'NON_AUTENTICATO', 'Devi accedere per continuare.');
  return a.famiglia;
}

function esigiSbloccata(b: BambinoLocale, funzione: string): void {
  if (!b.settings.lockedFeatures.includes(funzione)) return;
  const nomi: Record<string, string> = {
    SPESE: 'registrare le spese', LAVORI: 'richiedere i lavori', DONAZIONI: 'fare donazioni',
    OBIETTIVI: 'creare obiettivi', COACH: 'parlare con il Money Coach',
  };
  throw new ErroreLocale(423, 'FUNZIONE_BLOCCATA', `In questo momento ${nomi[funzione] ?? 'questa funzione'} non è disponibile. Parlane con un genitore!`);
}

function creaBambino(a: Archivio, familyId: string, dati: { name: string; age?: number | null; avatar?: string; avatarColor?: string; split?: Split; minGivePercent?: number; allowanceCents?: number }): BambinoLocale {
  const nome = dati.name?.trim();
  if (!nome) throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'Come si chiama il bambino?');
  const minGive = dati.minGivePercent ?? 10;
  const split = dati.split ?? { save: 60, spend: 30, give: 10 };
  validateSplit(split, minGive);

  const b: BambinoLocale = {
    id: nuovoId(),
    familyId,
    name: nome,
    age: dati.age ?? null,
    avatar: dati.avatar ?? '🦊',
    avatarColor: dati.avatarColor ?? '#7C5CFF',
    xp: 0,
    createdAt: new Date().toISOString(),
    onboardingCompleted: false,
    settings: {
      minGivePercent: minGive,
      defaultSplit: split,
      interestCentsPerEuro: 5,
      interestEnabled: true,
      allowanceCents: dati.allowanceCents ?? 0,
      allowanceDay: 6,
      lockedFeatures: [],
      soundEnabled: true,
    },
  };
  a.bambini.push(b);
  a.salvadanai[b.id] = { SAVE: 0, SPEND: 0, GIVE: 0 };
  return b;
}

/** Elenco dei bambini nel formato che si aspetta l'app. */
function bambiniDi(a: Archivio) {
  return a.bambini.map((b) => ({ ...b }));
}

interface Contesto {
  metodo: string;
  percorso: string;
  corpo: any;
  token: string | null;
  opzioni: { parent?: boolean };
}

/** Estrae i pezzi variabili da un percorso, se combacia con lo schema. */
function combacia(percorso: string, schema: string): string[] | null {
  const p = percorso.split('?')[0].split('/').filter(Boolean);
  const s = schema.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const parametri: string[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i].startsWith(':')) parametri.push(decodeURIComponent(p[i]));
    else if (s[i] !== p[i]) return null;
  }
  return parametri;
}

function query(percorso: string): URLSearchParams {
  return new URLSearchParams(percorso.split('?')[1] ?? '');
}

export async function richiestaLocale<T>(
  metodo: string,
  percorso: string,
  corpo?: unknown,
  opzioni: { parent?: boolean } = {},
  token: string | null = null,
): Promise<T> {
  const ctx: Contesto = { metodo, percorso, corpo: corpo ?? {}, token, opzioni };
  esigiGenitore(opzioni, token);
  const risposta = await instrada(ctx);
  return risposta as T;
}

async function instrada(ctx: Contesto): Promise<unknown> {
  const { metodo, percorso, corpo } = ctx;
  let p: string[] | null;

  // ------------------------------------------------------------ AUTENTICAZIONE
  if (metodo === 'POST' && (p = combacia(percorso, '/auth/register'))) {
    const sale = nuovoSale();
    const salePin = nuovoSale();
    if (!corpo.password || corpo.password.length < 8) {
      throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'La password di famiglia deve avere almeno 8 caratteri.');
    }
    if (!/^\d{4,8}$/.test(corpo.pin ?? '')) {
      throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'Il PIN genitore deve avere da 4 a 8 cifre.');
    }
    const passwordHash = await derivaHash(corpo.password, sale);
    const pinHash = await derivaHash(corpo.pin, salePin);
    return modifica((a) => {
      if (a.famiglia) throw new ErroreLocale(409, 'CONFLITTO', 'Su questo telefono c’è già una famiglia. Esci prima di crearne un’altra.');
      const familyId = nuovoId();
      a.famiglia = {
        id: familyId,
        nome: corpo.familyName?.trim() || 'La mia famiglia',
        email: (corpo.email ?? '').trim().toLowerCase(),
        passwordHash, passwordSalt: sale, pinHash, pinSalt: salePin,
      };
      const b = corpo.childName ? creaBambino(a, familyId, { name: corpo.childName, age: corpo.childAge ?? null }) : null;
      return { token: nuovoId(), family: { id: familyId, name: a.famiglia.nome }, children: b ? [b] : [] };
    });
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/auth/login'))) {
    const a = leggiArchivio();
    const f = a.famiglia;
    if (!f) throw new ErroreLocale(401, 'NON_AUTENTICATO', 'Su questo telefono non c’è ancora nessuna famiglia: creane una.');
    const emailOk = !f.email || f.email === (corpo.email ?? '').trim().toLowerCase();
    if (!emailOk || !(await verificaSegreto(corpo.password ?? '', f.passwordSalt, f.passwordHash))) {
      throw new ErroreLocale(401, 'NON_AUTENTICATO', 'Email o password non corretti.');
    }
    return { token: nuovoId(), family: { id: f.id, name: f.nome }, children: bambiniDi(a) };
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/auth/demo'))) {
    const esistente = leggiArchivio();
    if (esistente.famiglia && esistente.bambini.length > 0) {
      return { token: nuovoId(), family: { id: esistente.famiglia.id, name: esistente.famiglia.nome }, children: bambiniDi(esistente) };
    }
    const sale = nuovoSale();
    const salePin = nuovoSale();
    const passwordHash = await derivaHash(DEMO_PASSWORD, sale);
    const pinHash = await derivaHash(DEMO_PIN, salePin);
    return modifica((a) => {
      const familyId = nuovoId();
      a.famiglia = { id: familyId, nome: 'Famiglia Demo', email: DEMO_EMAIL, passwordHash, passwordSalt: sale, pinHash, pinSalt: salePin };
      creaDemo(a, familyId);
      return {
        token: nuovoId(),
        family: { id: familyId, name: a.famiglia.nome },
        children: bambiniDi(a),
        credenziali: { email: DEMO_EMAIL, password: DEMO_PASSWORD, pin: DEMO_PIN },
      };
    });
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/auth/parent-mode'))) {
    const a = leggiArchivio();
    const f = esigiFamiglia(a);
    if (!(await verificaSegreto(corpo.pin ?? '', f.pinSalt, f.pinHash))) {
      throw new ErroreLocale(401, 'NON_AUTENTICATO', 'PIN non corretto.');
    }
    const token = nuovoId();
    permessoGenitore = { token, scadenza: Date.now() + MINUTI_GENITORE * 60_000 };
    return { parentToken: token, expiresInMinutes: MINUTI_GENITORE };
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/auth/me'))) {
    const a = leggiArchivio();
    const f = esigiFamiglia(a);
    return { family: { id: f.id, name: f.nome }, children: bambiniDi(a), scope: 'family', parentMode: !!permessoGenitore };
  }

  // ------------------------------------------------------------------ BAMBINO
  if (metodo === 'GET' && (p = combacia(percorso, '/children/:id/state'))) {
    return statoBambino(leggiArchivio(), p[0]);
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/onboarding'))) {
    const childId = p[0];
    return modifica((a) => {
      const b = bambino(a, childId);
      if (corpo.split) {
        validateSplit(corpo.split, b.settings.minGivePercent);
        b.settings.defaultSplit = corpo.split;
      }
      if (corpo.goal) {
        a.obiettivi.filter((g) => g.childId === childId).forEach((g) => (g.isPrimary = false));
        a.obiettivi.push({
          id: nuovoId(), childId, name: corpo.goal.name.trim(), emoji: corpo.goal.emoji ?? '⭐',
          imageUrl: corpo.goal.imageUrl ?? null, targetCents: corpo.goal.targetCents,
          savedAtCreationCents: corpo.goal.savedAtCreationCents ?? 0, targetDate: corpo.goal.targetDate ?? null,
          status: 'ACTIVE', isPrimary: true, createdAt: new Date().toISOString(), completedAt: null,
        });
      }
      b.name = corpo.name?.trim() || b.name;
      if (corpo.age !== undefined && corpo.age !== null) b.age = corpo.age;
      if (corpo.avatar) b.avatar = corpo.avatar;
      if (corpo.avatarColor) b.avatarColor = corpo.avatarColor;
      b.onboardingCompleted = true;
      return statoBambino(a, childId);
    });
  }

  if (metodo === 'PATCH' && (p = combacia(percorso, '/children/:id/profile'))) {
    const childId = p[0];
    return modifica((a) => {
      const b = bambino(a, childId);
      if (corpo.name) b.name = corpo.name.trim();
      if (corpo.avatar) b.avatar = corpo.avatar;
      if (corpo.avatarColor) b.avatarColor = corpo.avatarColor;
      if (corpo.age !== undefined && corpo.age !== null) b.age = corpo.age;
      return { ...b };
    });
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/split/preview'))) {
    const a = leggiArchivio();
    const b = bambino(a, p[0]);
    const normalizzato = normalizeSplit(corpo.split, b.settings.minGivePercent, corpo.changed);
    return {
      split: normalizzato,
      valid: normalizzato.save + normalizzato.spend + normalizzato.give === 100 && normalizzato.give >= b.settings.minGivePercent,
      minGivePercent: b.settings.minGivePercent,
      rows: previewSplit(corpo.amountCents, normalizzato),
      totalCents: corpo.amountCents,
    };
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/children/:id/pending-incomes'))) {
    return leggiArchivio().entrateInAttesa.filter((e) => e.childId === p![0] && e.status === 'PENDING');
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/pending-incomes/:pid/allocate'))) {
    const [childId, pendingId] = p;
    return modifica((a) => {
      const entrata = a.entrateInAttesa.find((e) => e.id === pendingId && e.childId === childId);
      if (!entrata) throw new ErroreLocale(404, 'NON_TROVATO', 'Entrata non trovata.');
      if (entrata.status !== 'PENDING') throw new ErroreLocale(409, 'CONFLITTO', 'Questa entrata è già stata divisa.');
      const esito = aggiungiEntrata(a, childId, {
        amountCents: entrata.amountCents, split: corpo.split, type: entrata.type,
        description: entrata.description, source: 'bambino', clientId: corpo.clientId,
      });
      entrata.status = 'ALLOCATED';
      return { ...esito, pending: entrata, state: statoBambino(a, childId) };
    });
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/simulate'))) {
    const a = leggiArchivio();
    const childId = p[0];
    const rate = ritmoSettimanale(a, childId);
    const goal = obiettivoPrincipale(a, childId, rate);
    const jar = (corpo.jar ?? 'SPEND') as 'SPEND' | 'SAVE';
    return simulatePurchase({
      amountCents: corpo.amountCents,
      jar,
      jarBalanceCents: saldi(a, childId)[jar],
      goal: goal ? { name: goal.name, emoji: goal.emoji, targetCents: goal.targetCents, savedCents: goal.progress.savedCents } : null,
      rate,
      label: corpo.label,
    });
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/purchases'))) {
    const childId = p[0];
    return modifica((a) => {
      esigiSbloccata(bambino(a, childId), 'SPESE');
      const esito = registraSpesa(a, childId, {
        ...corpo,
        occurredAt: corpo.occurredAt ? new Date(corpo.occurredAt) : undefined,
      });
      return { ...esito, state: statoBambino(a, childId) };
    });
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/children/:id/history'))) {
    const q = query(percorso);
    const filtro = (q.get('filter') ?? 'TUTTO').toUpperCase() as HistoryFilter;
    if (!HISTORY_FILTERS.includes(filtro)) throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'Filtro non valido.');
    return storico(leggiArchivio(), p[0], { filter: filtro, limit: Number(q.get('limit') ?? 50), offset: Number(q.get('offset') ?? 0) });
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/children/:id/goals'))) {
    const a = leggiArchivio();
    return obiettiviConProgresso(a, p[0], ritmoSettimanale(a, p[0]));
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/goals'))) {
    const childId = p[0];
    return modifica((a) => {
      esigiSbloccata(bambino(a, childId), 'OBIETTIVI');
      if (!corpo.name?.trim()) throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'Dai un nome al tuo obiettivo!');
      if (!Number.isInteger(corpo.targetCents) || corpo.targetCents <= 0) {
        throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'Il prezzo dell’obiettivo deve essere maggiore di zero.');
      }
      if (corpo.makePrimary !== false) a.obiettivi.filter((g) => g.childId === childId).forEach((g) => (g.isPrimary = false));
      const goal = {
        id: nuovoId(), childId, name: corpo.name.trim(), emoji: corpo.emoji ?? '⭐',
        imageUrl: corpo.imageUrl ?? null, targetCents: corpo.targetCents,
        savedAtCreationCents: corpo.savedAtCreationCents ?? 0, targetDate: corpo.targetDate ?? null,
        status: 'ACTIVE' as const, isPrimary: corpo.makePrimary !== false,
        createdAt: new Date().toISOString(), completedAt: null,
      };
      a.obiettivi.push(goal);
      return goal;
    });
  }

  if (metodo === 'PATCH' && (p = combacia(percorso, '/children/:id/goals/:goalId'))) {
    const [childId, goalId] = p;
    return modifica((a) => {
      const goal = a.obiettivi.find((g) => g.id === goalId && g.childId === childId);
      if (!goal) throw new ErroreLocale(404, 'NON_TROVATO', 'Obiettivo non trovato.');
      if (corpo.name) goal.name = corpo.name.trim();
      if (corpo.emoji) goal.emoji = corpo.emoji;
      if (corpo.imageUrl !== undefined) goal.imageUrl = corpo.imageUrl;
      if (corpo.targetCents) goal.targetCents = corpo.targetCents;
      if (corpo.targetDate !== undefined) goal.targetDate = corpo.targetDate;
      if (corpo.makePrimary) {
        a.obiettivi.filter((g) => g.childId === childId).forEach((g) => (g.isPrimary = false));
        goal.isPrimary = true;
      }
      return goal;
    });
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/goals/:goalId/primary'))) {
    const [childId, goalId] = p;
    return modifica((a) => {
      const goal = a.obiettivi.find((g) => g.id === goalId && g.childId === childId && g.status === 'ACTIVE');
      if (!goal) throw new ErroreLocale(404, 'NON_TROVATO', 'Obiettivo non trovato (o già completato).');
      a.obiettivi.filter((g) => g.childId === childId).forEach((g) => (g.isPrimary = false));
      goal.isPrimary = true;
      return goal;
    });
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/goals/:goalId/complete'))) {
    const [childId, goalId] = p;
    return modifica((a) => ({ ...completaObiettivo(a, childId, goalId), state: statoBambino(a, childId) }));
  }

  if (metodo === 'DELETE' && (p = combacia(percorso, '/children/:id/goals/:goalId'))) {
    const [childId, goalId] = p;
    return modifica((a) => {
      const goal = a.obiettivi.find((g) => g.id === goalId && g.childId === childId);
      if (!goal || goal.status === 'COMPLETED') throw new ErroreLocale(409, 'CONFLITTO', 'Non puoi archiviare un obiettivo già completato.');
      goal.status = 'ARCHIVED';
      goal.isPrimary = false;
      return undefined;
    });
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/children/:id/jobs'))) {
    const a = leggiArchivio();
    const b = bambino(a, p[0]);
    return a.lavori.filter((l) => l.familyId === b.familyId && l.active);
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/children/:id/job-requests'))) {
    const a = leggiArchivio();
    return a.richieste
      .filter((r) => r.childId === p![0])
      .map((r) => ({ ...r, jobTitle: a.lavori.find((l) => l.id === r.jobId)?.title, jobEmoji: a.lavori.find((l) => l.id === r.jobId)?.emoji }));
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/jobs/:jobId/request'))) {
    const [childId, jobId] = p;
    return modifica((a) => {
      esigiSbloccata(bambino(a, childId), 'LAVORI');
      const lavoro = a.lavori.find((l) => l.id === jobId && l.active);
      if (!lavoro) throw new ErroreLocale(404, 'NON_TROVATO', 'Questo lavoro non è disponibile.');
      if (a.richieste.some((r) => r.jobId === jobId && r.childId === childId && r.status === 'PENDING')) {
        throw new ErroreLocale(409, 'CONFLITTO', 'Hai già una richiesta in attesa per questo lavoro.');
      }
      const richiesta = {
        id: nuovoId(), jobId, childId, status: 'PENDING' as const,
        requestedRewardCents: lavoro.rewardCents, approvedRewardCents: null,
        note: corpo.note ?? null, parentNote: null,
        requestedAt: new Date().toISOString(), decidedAt: null,
      };
      a.richieste.unshift(richiesta);
      return richiesta;
    });
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/children/:id/donation-goals'))) {
    const stato = statoBambino(leggiArchivio(), p[0]);
    return { goals: stato.give.donationGoals, donations: stato.give.donations, causes: DONATION_CAUSES };
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/donation-goals'))) {
    const childId = p[0];
    return modifica((a) => {
      esigiSbloccata(bambino(a, childId), 'DONAZIONI');
      if (!corpo.title?.trim()) throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'Scrivi chi vuoi aiutare.');
      if (!DONATION_CAUSES.includes(corpo.cause)) throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'Scegli una causa valida.');
      if (!Number.isInteger(corpo.targetCents) || corpo.targetCents <= 0) {
        throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'L’importo deve essere maggiore di zero.');
      }
      const goal = {
        id: nuovoId(), childId, title: corpo.title.trim(), cause: corpo.cause as DonationCause,
        targetCents: corpo.targetCents, donatedCents: 0, status: 'ACTIVE' as const,
        note: corpo.note ?? null, photoUrl: corpo.photoUrl ?? null,
        createdAt: new Date().toISOString(), completedAt: null,
      };
      a.obiettiviGive.push(goal);
      return { ...goal, progressPercent: 0, remainingCents: goal.targetCents };
    });
  }

  if (metodo === 'PATCH' && (p = combacia(percorso, '/children/:id/donation-goals/:goalId'))) {
    const [childId, goalId] = p;
    return modifica((a) => {
      const goal = a.obiettiviGive.find((g) => g.id === goalId && g.childId === childId);
      if (!goal) throw new ErroreLocale(404, 'NON_TROVATO', 'Obiettivo di donazione non trovato.');
      if (corpo.title) goal.title = corpo.title.trim();
      if (corpo.cause) goal.cause = corpo.cause;
      if (corpo.targetCents) goal.targetCents = corpo.targetCents;
      if (corpo.note !== undefined) goal.note = corpo.note;
      return goal;
    });
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/children/:id/lessons'))) {
    return elencoLezioni(leggiArchivio(), p[0]);
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/children/:id/lessons/:lessonId'))) {
    const lezione = getLesson(p[1]);
    if (!lezione) throw new ErroreLocale(404, 'NON_TROVATO', 'Lezione non trovata.');
    // Le risposte corrette non escono da qui prima della consegna, come sul server.
    return { ...lezione, quiz: lezione.quiz.map((q) => ({ id: q.id, question: q.question, options: q.options })) };
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/lessons/:lessonId/quiz'))) {
    const [childId, lessonId] = p;
    return modifica((a) => ({ ...correggiQuiz(a, childId, lessonId, corpo.answers ?? []), state: statoBambino(a, childId) }));
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/children/:id/coach'))) {
    const a = leggiArchivio();
    return {
      messages: a.coach.filter((m) => m.childId === p![0]).slice(-30),
      suggestions: SUGGERIMENTI,
      aiEnabled: false,   // nessuna chiave AI dentro un sito statico
    };
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/coach'))) {
    const childId = p[0];
    return modifica((a) => {
      esigiSbloccata(bambino(a, childId), 'COACH');
      const domanda = String(corpo.question ?? '').trim();
      if (!domanda) throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'Scrivi la tua domanda!');
      const risposta = buildDeterministicAnswer(statoBambino(a, childId), domanda);
      const ora = new Date().toISOString();
      a.coach.push({ id: nuovoId(), childId, role: 'child', content: domanda, metadata: {}, createdAt: ora });
      a.coach.push({
        id: nuovoId(), childId, role: 'coach', content: risposta.text,
        metadata: { intent: risposta.intent, source: risposta.source, options: risposta.options }, createdAt: ora,
      });
      a.coach = a.coach.slice(-200);
      return risposta;
    });
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/children/:id/notifications'))) {
    return leggiArchivio().notifiche.filter((n) => n.childId === p![0]).slice(0, 20);
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/notifications/read'))) {
    return modifica((a) => {
      a.notifiche.filter((n) => n.childId === p![0] && !n.readAt).forEach((n) => (n.readAt = new Date().toISOString()));
      return undefined;
    });
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/children/:id/integrity'))) {
    return verificaIntegrita(leggiArchivio(), p[0]);
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/children/:id/sync'))) {
    // In modalità locale non esiste una coda: tutto è già salvato sul telefono.
    return { results: [], state: statoBambino(leggiArchivio(), p[0]) };
  }

  // ------------------------------------------------------------------ GENITORE
  if (metodo === 'GET' && (p = combacia(percorso, '/parent/children'))) {
    return bambiniDi(leggiArchivio());
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/parent/children'))) {
    return modifica((a) => creaBambino(a, esigiFamiglia(a).id, corpo));
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/parent/children/:id/income'))) {
    const childId = p[0];
    return modifica((a) => {
      if (!Number.isInteger(corpo.amountCents) || corpo.amountCents <= 0) {
        throw new ErroreLocale(400, 'IMPORTO_NON_VALIDO', 'L’importo deve essere maggiore di zero.');
      }
      if ((corpo.mode ?? 'ASK_CHILD') === 'ASK_CHILD') {
        const entrata = {
          id: nuovoId(), childId, amountCents: corpo.amountCents,
          type: (corpo.type ?? 'ALLOWANCE') as never,
          description: corpo.description?.trim() || 'Paghetta',
          status: 'PENDING' as const, createdAt: new Date().toISOString(),
        };
        a.entrateInAttesa.push(entrata);
        return { pending: entrata, state: statoBambino(a, childId) };
      }
      const b = bambino(a, childId);
      const esito = aggiungiEntrata(a, childId, {
        amountCents: corpo.amountCents, split: corpo.split ?? b.settings.defaultSplit,
        type: corpo.type ?? 'ALLOWANCE', description: corpo.description, source: 'genitore',
      });
      return { ...esito, state: statoBambino(a, childId) };
    });
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/parent/children/:id/pending-incomes'))) {
    return leggiArchivio().entrateInAttesa.filter((e) => e.childId === p![0] && e.status === 'PENDING');
  }

  if (metodo === 'DELETE' && (p = combacia(percorso, '/parent/children/:id/pending-incomes/:pid'))) {
    const [childId, pendingId] = p;
    return modifica((a) => {
      const entrata = a.entrateInAttesa.find((e) => e.id === pendingId && e.childId === childId && e.status === 'PENDING');
      if (!entrata) throw new ErroreLocale(404, 'NON_TROVATO', 'Entrata non trovata o già divisa.');
      entrata.status = 'CANCELLED';
      return undefined;
    });
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/parent/children/:id/transfer'))) {
    const childId = p[0];
    return modifica((a) => ({ ...giroconto(a, childId, corpo), state: statoBambino(a, childId) }));
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/parent/children/:id/interest'))) {
    const childId = p[0];
    return modifica((a) => ({ ...accreditaInteresse(a, childId, { force: corpo.force }), state: statoBambino(a, childId) }));
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/parent/children/:id/interest/projection'))) {
    const a = leggiArchivio();
    const mesi = Math.min(60, Math.max(1, Number(query(percorso).get('months') ?? 12)));
    const b = bambino(a, p[0]);
    const save = saldi(a, p[0]).SAVE;
    return {
      steps: projectCompound(save, b.settings.interestCentsPerEuro, mesi),
      confronto: compareSimpleVsCompound(save, b.settings.interestCentsPerEuro, mesi),
    };
  }

  if (metodo === 'PATCH' && (p = combacia(percorso, '/parent/children/:id/settings'))) {
    const childId = p[0];
    return modifica((a) => {
      const b = bambino(a, childId);
      const s = b.settings;
      const minGive = corpo.minGivePercent ?? s.minGivePercent;
      let split: Split = corpo.defaultSplit ?? s.defaultSplit;
      if (split.give < minGive) {
        // La regola di famiglia ha la precedenza: si alza GIVE prendendo da SPEND, poi da SAVE.
        const mancante = minGive - split.give;
        const daSpend = Math.min(mancante, split.spend);
        split = { save: split.save - (mancante - daSpend), spend: split.spend - daSpend, give: minGive };
      }
      validateSplit(split, minGive);
      b.settings = {
        minGivePercent: minGive,
        defaultSplit: split,
        interestCentsPerEuro: corpo.interestCentsPerEuro ?? s.interestCentsPerEuro,
        interestEnabled: corpo.interestEnabled ?? s.interestEnabled,
        allowanceCents: corpo.allowanceCents ?? s.allowanceCents,
        allowanceDay: corpo.allowanceDay ?? s.allowanceDay,
        lockedFeatures: corpo.lockedFeatures ?? s.lockedFeatures,
        soundEnabled: corpo.soundEnabled ?? s.soundEnabled,
      };
      return b.settings;
    });
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/parent/children/:id/donations'))) {
    const childId = p[0];
    return modifica((a) => ({ ...dona(a, childId, corpo), state: statoBambino(a, childId) }));
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/parent/jobs'))) {
    return leggiArchivio().lavori;
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/parent/jobs'))) {
    return modifica((a) => {
      if (!corpo.title?.trim()) throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'Dai un nome al lavoro.');
      if (!Number.isInteger(corpo.rewardCents) || corpo.rewardCents <= 0) {
        throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'Il compenso deve essere maggiore di zero.');
      }
      const lavoro = {
        id: nuovoId(), familyId: esigiFamiglia(a).id, title: corpo.title.trim(),
        emoji: corpo.emoji ?? '💪', rewardCents: corpo.rewardCents,
        description: corpo.description ?? null, active: true, createdAt: new Date().toISOString(),
      };
      a.lavori.push(lavoro);
      return lavoro;
    });
  }

  if (metodo === 'PATCH' && (p = combacia(percorso, '/parent/jobs/:jobId'))) {
    const jobId = p[0];
    return modifica((a) => {
      const lavoro = a.lavori.find((l) => l.id === jobId);
      if (!lavoro) throw new ErroreLocale(404, 'NON_TROVATO', 'Lavoro non trovato.');
      if (corpo.title) lavoro.title = corpo.title.trim();
      if (corpo.emoji) lavoro.emoji = corpo.emoji;
      if (corpo.rewardCents) lavoro.rewardCents = corpo.rewardCents;
      if (corpo.description !== undefined) lavoro.description = corpo.description;
      if (corpo.active !== undefined) lavoro.active = corpo.active;
      return lavoro;
    });
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/parent/job-requests'))) {
    const a = leggiArchivio();
    const stato = query(percorso).get('status');
    return a.richieste
      .filter((r) => (stato ? r.status === stato : true))
      .map((r) => {
        const lavoro = a.lavori.find((l) => l.id === r.jobId);
        return { ...r, jobTitle: lavoro?.title, jobEmoji: lavoro?.emoji };
      });
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/parent/job-requests/:requestId/approve'))) {
    const requestId = p[0];
    return modifica((a) => {
      const richiesta = a.richieste.find((r) => r.id === requestId);
      if (!richiesta) throw new ErroreLocale(404, 'NON_TROVATO', 'Richiesta non trovata.');
      if (richiesta.status !== 'PENDING') throw new ErroreLocale(409, 'CONFLITTO', 'Questa richiesta è già stata gestita.');
      const lavoro = a.lavori.find((l) => l.id === richiesta.jobId);
      const importo = corpo.approvedRewardCents ?? richiesta.requestedRewardCents;
      if (!Number.isInteger(importo) || importo <= 0) {
        throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'Il compenso approvato deve essere maggiore di zero.');
      }
      const b = bambino(a, richiesta.childId);
      const esito = aggiungiEntrata(a, richiesta.childId, {
        amountCents: importo, split: b.settings.defaultSplit, type: 'JOB',
        description: `${lavoro?.emoji ?? '💪'} ${lavoro?.title ?? 'Lavoro'}`, source: `lavoro:${richiesta.jobId}`,
      });
      richiesta.status = 'APPROVED';
      richiesta.approvedRewardCents = importo;
      richiesta.parentNote = corpo.parentNote ?? null;
      richiesta.decidedAt = new Date().toISOString();

      const xp = [...esito.xp, assegnaXp(a, richiesta.childId, 'LAVORO_COMPLETATO')];
      sbloccaBadge(a, richiesta.childId, 'PRIMO_LAVORO', 'Primo lavoro completato', '💪');
      avvisa(a, richiesta.childId, 'LAVORO', '✅', `${lavoro?.title ?? 'Lavoro'}: approvato! Hai guadagnato ${formatCents(importo)}.`);
      return {
        ...esito, xp,
        celebrations: [...esito.celebrations, 'CONFETTI'],
        request: { ...richiesta, jobTitle: lavoro?.title, jobEmoji: lavoro?.emoji },
        state: statoBambino(a, richiesta.childId),
      };
    });
  }

  if (metodo === 'POST' && (p = combacia(percorso, '/parent/job-requests/:requestId/reject'))) {
    const requestId = p[0];
    return modifica((a) => {
      const richiesta = a.richieste.find((r) => r.id === requestId);
      if (!richiesta) throw new ErroreLocale(404, 'NON_TROVATO', 'Richiesta non trovata.');
      if (richiesta.status !== 'PENDING') throw new ErroreLocale(409, 'CONFLITTO', 'Questa richiesta è già stata gestita.');
      const lavoro = a.lavori.find((l) => l.id === richiesta.jobId);
      richiesta.status = 'REJECTED';
      richiesta.parentNote = corpo.parentNote ?? null;
      richiesta.decidedAt = new Date().toISOString();
      const nota = (corpo.parentNote ?? '').trim();
      avvisa(
        a, richiesta.childId, 'LAVORO', '💬',
        nota ? `${lavoro?.title ?? 'Lavoro'}: ${nota}` : `${lavoro?.title ?? 'Lavoro'}: per questa volta no. Riprova quando vuoi!`,
      );
      return { ...richiesta, jobTitle: lavoro?.title, jobEmoji: lavoro?.emoji };
    });
  }

  if (metodo === 'GET' && (p = combacia(percorso, '/parent/children/:id/dashboard'))) {
    const a = leggiArchivio();
    return { state: statoBambino(a, p[0]), stats: statistiche(a, p[0]), integrity: verificaIntegrita(a, p[0]) };
  }

  throw new ErroreLocale(404, 'NON_TROVATO', `Percorso non gestito: ${metodo} ${percorso}`);
}
