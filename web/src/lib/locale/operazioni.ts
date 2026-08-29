/**
 * MODALITÀ LOCALE — le operazioni sul denaro dentro il telefono.
 *
 * È il gemello del livello `services/` del server, con le stesse garanzie:
 *  - ogni movimento è registrato con saldo prima e dopo;
 *  - i salvadanai non vanno mai sotto zero;
 *  - la somma delle tre parti di una entrata è esattamente l'importo;
 *  - l'interesse si accredita una sola volta al mese.
 *
 * I calcoli non sono riscritti: arrivano dallo stesso dominio del server.
 */
import { formatCents, type Cents } from '@dominio/money.js';
import { previewSplit, validateSplit } from '@dominio/split.js';
import { computeGoalProgress, estimateWeeklySavingRate, weeklyFromAllowance, type WeeklyRate } from '@dominio/goals.js';
import { computeMonthlyInterest, periodKey, projectCompound } from '@dominio/interest.js';
import { levelFromXp, XP_RULES, xpForSaving, type XpReason } from '@dominio/xp.js';
import { CAUSE_INFO, ETICHETTE_TIPO, FILTRI_STORICO, ICONE_TIPO, NOMI_JAR, messaggioGive } from '@dominio/etichette.js';
import { DONATION_CAUSES, type DonationCause, type HistoryFilter, type JarType, type Split, type TransactionType } from '@dominio/types.js';
import { LESSONS, getLesson } from '@contenuti/lessons.js';
import { nuovoId, type Archivio, type BambinoLocale, type ObiettivoLocale, type TransazioneLocale } from './archivio';

export class ErroreLocale extends Error {
  constructor(public stato: number, public codice: string, messaggio: string) {
    super(messaggio);
  }
}

const SETTIMANA = 7 * 86_400_000;

export function bambino(a: Archivio, childId: string): BambinoLocale {
  const b = a.bambini.find((x) => x.id === childId);
  if (!b) throw new ErroreLocale(404, 'NON_TROVATO', 'Bambino non trovato.');
  return b;
}

export function saldi(a: Archivio, childId: string): Record<JarType, Cents> {
  return a.salvadanai[childId] ?? { SAVE: 0, SPEND: 0, GIVE: 0 };
}

// ------------------------------------------------------------------ LEDGER
export interface Movimento {
  jar: JarType;
  amountCents: Cents;
  type: TransactionType;
  description: string;
  source?: string;
  goalId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Registra uno o più movimenti. O si applicano tutti, o nessuno. */
export function registra(
  a: Archivio,
  childId: string,
  movimenti: Movimento[],
  opzioni: { groupId?: string; occurredAt?: Date; clientId?: string | null } = {},
): TransazioneLocale[] {
  if (opzioni.clientId) {
    const gia = a.transazioni.filter((t) => t.childId === childId && t.clientId === opzioni.clientId);
    if (gia.length > 0) return gia;   // idempotenza: la stessa operazione non si applica due volte
  }

  const correnti = { ...saldi(a, childId) };
  const groupId = opzioni.groupId ?? nuovoId();
  const quando = (opzioni.occurredAt ?? new Date()).toISOString();
  const create: TransazioneLocale[] = [];

  // Prima si verifica tutto, poi si scrive: così un errore non lascia dati a metà.
  for (const m of movimenti) {
    if (!Number.isInteger(m.amountCents) || m.amountCents === 0) {
      throw new ErroreLocale(400, 'IMPORTO_NON_VALIDO', 'Un movimento da 0 € non ha senso.');
    }
    const dopo = correnti[m.jar] + m.amountCents;
    if (dopo < 0) {
      throw new ErroreLocale(
        400,
        'FONDI_INSUFFICIENTI',
        `Nel salvadanaio ${NOMI_JAR[m.jar]} ci sono ${formatCents(correnti[m.jar])}, ma ne servono ${formatCents(Math.abs(m.amountCents))}.`,
      );
    }
    create.push({
      id: nuovoId(),
      childId,
      occurredAt: quando,
      type: m.type,
      jar: m.jar,
      amountCents: m.amountCents,
      balanceBeforeCents: correnti[m.jar],
      balanceAfterCents: dopo,
      description: m.description,
      source: m.source ?? 'app',
      goalId: m.goalId ?? null,
      groupId,
      clientId: opzioni.clientId && create.length === 0 ? opzioni.clientId : null,
      metadata: m.metadata ?? {},
    });
    correnti[m.jar] = dopo;
  }

  a.salvadanai[childId] = correnti;
  a.transazioni.push(...create);
  return create;
}

// ------------------------------------------------------- XP, BADGE, AVVISI
export interface EsitoXp {
  reason: XpReason;
  amount: number;
  xpBefore: number;
  xpAfter: number;
  levelBefore: ReturnType<typeof levelFromXp>;
  levelAfter: ReturnType<typeof levelFromXp>;
  levelUp: boolean;
}

export function assegnaXp(a: Archivio, childId: string, reason: XpReason, amount?: number): EsitoXp {
  const b = bambino(a, childId);
  const quanti = Math.max(0, Math.round(amount ?? XP_RULES[reason]));
  const prima = b.xp;
  const dopo = prima + quanti;
  if (quanti > 0) {
    b.xp = dopo;
    a.xp.push({ id: nuovoId(), childId, reason, amount: quanti, createdAt: new Date().toISOString() });
  }
  const levelBefore = levelFromXp(prima);
  const levelAfter = levelFromXp(dopo);
  const levelUp = levelAfter.level > levelBefore.level;
  if (levelUp) {
    avvisa(a, childId, 'LIVELLO', '🏆', `Nuovo livello: ${levelAfter.emoji} ${levelAfter.name}!`);
    sbloccaBadge(a, childId, `LIVELLO_${levelAfter.level}`, levelAfter.name, levelAfter.emoji);
  }
  return { reason, amount: quanti, xpBefore: prima, xpAfter: dopo, levelBefore, levelAfter, levelUp };
}

export function avvisa(a: Archivio, childId: string, kind: string, emoji: string, message: string): void {
  a.notifiche.unshift({ id: nuovoId(), childId, kind, emoji, message, createdAt: new Date().toISOString(), readAt: null });
  a.notifiche = a.notifiche.slice(0, 200);
}

export function sbloccaBadge(a: Archivio, childId: string, code: string, title: string, emoji: string): boolean {
  if (a.badge.some((x) => x.childId === childId && x.code === code)) return false;
  a.badge.unshift({ id: nuovoId(), childId, code, title, emoji, unlockedAt: new Date().toISOString() });
  return true;
}

/** Settimane consecutive con almeno un versamento in SAVE. */
export function costanza(a: Archivio, childId: string, ora = new Date()): number {
  const inizioSettimana = (d: Date) => {
    const x = new Date(d);
    const giorno = (x.getDay() + 6) % 7;
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - giorno);
    return x.getTime();
  };
  const settimane = [
    ...new Set(
      a.transazioni
        .filter((t) => t.childId === childId && t.jar === 'SAVE' && t.amountCents > 0)
        .map((t) => inizioSettimana(new Date(t.occurredAt))),
    ),
  ].sort((x, y) => y - x);
  if (settimane.length === 0) return 0;
  let atteso = inizioSettimana(ora);
  if (settimane[0] !== atteso) atteso -= SETTIMANA;
  let streak = 0;
  for (const s of settimane) {
    if (s === atteso) {
      streak += 1;
      atteso -= SETTIMANA;
    } else if (s < atteso) break;
  }
  return streak;
}

// --------------------------------------------------------------- OBIETTIVI
export function ritmoSettimanale(a: Archivio, childId: string, ora = new Date()): WeeklyRate {
  const b = bambino(a, childId);
  const entrate = a.transazioni
    .filter((t) => t.childId === childId && t.jar === 'SAVE' && t.amountCents > 0)
    .map((t) => ({ occurredAt: t.occurredAt, amountCents: t.amountCents }));
  const attesa = weeklyFromAllowance(
    b.settings.allowanceCents,
    b.settings.defaultSplit.save,
    b.settings.defaultSplit.spend,
    b.settings.defaultSplit.give,
  );
  return estimateWeeklySavingRate(entrate, { windowWeeks: 8, fallbackWeeklyCents: attesa, now: ora });
}

/** Quanto è stato messo da parte per un obiettivo (movimenti SAVE attribuiti a lui). */
export function risparmiatoPer(a: Archivio, obiettivo: ObiettivoLocale): Cents {
  const contributi = a.transazioni
    .filter((t) => t.goalId === obiettivo.id && t.jar === 'SAVE')
    .reduce((somma, t) => somma + t.amountCents, 0);
  return Math.max(0, obiettivo.savedAtCreationCents + contributi);
}

export function obiettiviConProgresso(a: Archivio, childId: string, rate: WeeklyRate, ora = new Date()) {
  return a.obiettivi
    .filter((g) => g.childId === childId && g.status !== 'ARCHIVED')
    .sort((x, y) => Number(y.isPrimary) - Number(x.isPrimary) || x.status.localeCompare(y.status) || y.createdAt.localeCompare(x.createdAt))
    .map((g) => ({
      ...g,
      progress: computeGoalProgress({
        targetCents: g.targetCents,
        savedCents: g.status === 'COMPLETED' ? g.targetCents : risparmiatoPer(a, g),
        rate,
        now: ora,
      }),
    }));
}

export function obiettivoPrincipale(a: Archivio, childId: string, rate: WeeklyRate, ora = new Date()) {
  const tutti = obiettiviConProgresso(a, childId, rate, ora);
  return tutti.find((g) => g.isPrimary && g.status === 'ACTIVE') ?? tutti.find((g) => g.status === 'ACTIVE') ?? null;
}

// ----------------------------------------------------------------- ENTRATE
export interface EsitoOperazione {
  transactions: TransazioneLocale[];
  xp: EsitoXp[];
  celebrations: string[];
  messages: string[];
}

export function aggiungiEntrata(
  a: Archivio,
  childId: string,
  dati: { amountCents: Cents; split: Split; type?: TransactionType; description?: string; source?: string; clientId?: string | null; occurredAt?: Date; metadata?: Record<string, unknown> },
): EsitoOperazione {
  if (!Number.isInteger(dati.amountCents) || dati.amountCents <= 0) {
    throw new ErroreLocale(400, 'IMPORTO_NON_VALIDO', 'L’importo deve essere maggiore di zero.');
  }
  const b = bambino(a, childId);
  validateSplit(dati.split, b.settings.minGivePercent);

  const parti = previewSplit(dati.amountCents, dati.split);
  const groupId = nuovoId();
  const tipo = dati.type ?? 'ALLOWANCE';
  const descrizione = dati.description?.trim() || (tipo === 'JOB' ? 'Lavoro extra' : tipo === 'GIFT' ? 'Regalo' : 'Paghetta');
  const rate = ritmoSettimanale(a, childId, dati.occurredAt);
  const goal = obiettivoPrincipale(a, childId, rate, dati.occurredAt);

  const transactions = registra(
    a,
    childId,
    parti
      .filter((p) => p.amountCents !== 0)
      .map((p) => ({
        jar: p.jar,
        amountCents: p.amountCents,
        type: tipo,
        description: descrizione,
        source: dati.source ?? 'genitore',
        goalId: p.jar === 'SAVE' ? goal?.id ?? null : null,
        metadata: { ...(dati.metadata ?? {}), percent: p.percent, totaleEntrataCents: dati.amountCents },
      })),
    { groupId, occurredAt: dati.occurredAt, clientId: dati.clientId },
  );

  a.scelte.push({
    id: nuovoId(),
    childId,
    groupId,
    amountCents: dati.amountCents,
    save: dati.split.save,
    spend: dati.split.spend,
    give: dati.split.give,
    source: dati.source ?? 'app',
    createdAt: new Date().toISOString(),
  });

  const quotaSave = parti.find((p) => p.jar === 'SAVE')!.amountCents;
  const quotaSpend = parti.find((p) => p.jar === 'SPEND')!.amountCents;
  const quotaGive = parti.find((p) => p.jar === 'GIVE')!.amountCents;

  const xp: EsitoXp[] = [assegnaXp(a, childId, 'SPLIT_SCELTO')];
  if (quotaSave > 0) xp.push(assegnaXp(a, childId, 'RISPARMIO_PER_EURO', xpForSaving(quotaSave)));
  if (dati.split.give > b.settings.minGivePercent) sbloccaBadge(a, childId, 'CUORE_GRANDE', 'Cuore grande', '💛');

  const messages = [
    `Hai diviso ${formatCents(dati.amountCents)}: ${formatCents(quotaSave)} in ${NOMI_JAR.SAVE}, ` +
      `${formatCents(quotaSpend)} in ${NOMI_JAR.SPEND}, ${formatCents(quotaGive)} in ${NOMI_JAR.GIVE}.`,
  ];
  const celebrations = ['MONETE'];
  avvisa(a, childId, 'RISPARMIO', '🎉', `Hai messo da parte ${formatCents(quotaSave)} in ${NOMI_JAR.SAVE}!`);

  if (goal && quotaSave > 0) {
    const risparmiato = risparmiatoPer(a, a.obiettivi.find((g) => g.id === goal.id)!);
    if (risparmiato >= goal.targetCents) {
      messages.push(`${goal.emoji} Hai raggiunto il tuo obiettivo "${goal.name}"!`);
      celebrations.push('OBIETTIVO_PRONTO');
      avvisa(a, childId, 'OBIETTIVO', '🏁', `${goal.emoji} ${goal.name}: ci sei! Puoi comprarlo.`);
    } else {
      avvisa(a, childId, 'OBIETTIVO', goal.emoji, `Sei più vicino a ${goal.name}: mancano ${formatCents(goal.targetCents - risparmiato)}.`);
    }
  }

  const streak = costanza(a, childId, dati.occurredAt);
  if (streak >= 4 && sbloccaBadge(a, childId, `COSTANZA_${Math.min(streak, 12)}`, `${streak} settimane di fila`, '🔥')) {
    xp.push(assegnaXp(a, childId, 'COSTANZA_SETTIMANALE'));
    celebrations.push('COSTANZA');
  }

  return { transactions, xp, celebrations, messages };
}

export function registraSpesa(
  a: Archivio,
  childId: string,
  dati: { amountCents: Cents; description: string; jar?: 'SPEND' | 'SAVE'; emoji?: string; clientId?: string | null; occurredAt?: Date; simulated?: boolean },
): EsitoOperazione {
  if (!Number.isInteger(dati.amountCents) || dati.amountCents <= 0) {
    throw new ErroreLocale(400, 'IMPORTO_NON_VALIDO', 'L’importo della spesa deve essere maggiore di zero.');
  }
  const descrizione = dati.description?.trim();
  if (!descrizione) throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'Scrivi cosa hai comprato.');

  const jar = dati.jar ?? 'SPEND';
  const rate = ritmoSettimanale(a, childId);
  const goal = jar === 'SAVE' ? obiettivoPrincipale(a, childId, rate) : null;

  const transactions = registra(
    a,
    childId,
    [
      {
        jar,
        amountCents: -dati.amountCents,
        type: 'PURCHASE',
        description: descrizione,
        source: 'bambino',
        goalId: goal?.id ?? null,
        metadata: { emoji: dati.emoji ?? '🛍️', simulato: !!dati.simulated },
      },
    ],
    { occurredAt: dati.occurredAt, clientId: dati.clientId },
  );

  const xp = [assegnaXp(a, childId, 'SPESA_REGISTRATA')];
  if (dati.simulated) xp.push(assegnaXp(a, childId, 'SIMULATORE_USATO'));
  sbloccaBadge(a, childId, 'PRIMA_SPESA', 'Prima spesa registrata', '🧾');

  return {
    transactions, xp, celebrations: [],
    messages: [`Hai registrato ${descrizione}: ${formatCents(dati.amountCents)} da ${NOMI_JAR[jar]}.`],
  };
}

export function completaObiettivo(a: Archivio, childId: string, goalId: string): EsitoOperazione {
  const goal = a.obiettivi.find((g) => g.id === goalId && g.childId === childId);
  if (!goal) throw new ErroreLocale(404, 'NON_TROVATO', 'Obiettivo non trovato.');
  if (goal.status === 'COMPLETED') throw new ErroreLocale(409, 'CONFLITTO', 'Questo obiettivo è già stato completato.');

  const risparmiato = risparmiatoPer(a, goal);
  if (risparmiato < goal.targetCents) {
    throw new ErroreLocale(409, 'CONFLITTO', `Ti mancano ancora ${formatCents(goal.targetCents - risparmiato)} per "${goal.name}".`);
  }

  const daPrelevare = Math.min(goal.targetCents, saldi(a, childId).SAVE);
  const transactions =
    daPrelevare > 0
      ? registra(a, childId, [
          {
            jar: 'SAVE',
            amountCents: -daPrelevare,
            type: 'PURCHASE',
            description: `Obiettivo raggiunto: ${goal.name}`,
            source: 'obiettivo',
            goalId: goal.id,
            metadata: { emoji: goal.emoji, obiettivo: goal.name },
          },
        ])
      : [];

  goal.status = 'COMPLETED';
  goal.completedAt = new Date().toISOString();
  goal.isPrimary = false;

  const xp = [assegnaXp(a, childId, 'OBIETTIVO_COMPLETATO')];
  sbloccaBadge(a, childId, `OBIETTIVO_${goal.id.slice(0, 8)}`, `Obiettivo: ${goal.name}`, goal.emoji);
  avvisa(a, childId, 'OBIETTIVO', '🏆', `Ce l’hai fatta: ${goal.emoji} ${goal.name}!`);

  return {
    transactions,
    xp,
    celebrations: ['CONFETTI', 'BADGE'],
    messages: [`🎉 Obiettivo completato: ${goal.name} (${formatCents(goal.targetCents)})!`],
  };
}

export function dona(
  a: Archivio,
  childId: string,
  dati: { amountCents: Cents; cause: DonationCause; donationGoalId?: string | null; note?: string | null; photoUrl?: string | null },
): EsitoOperazione {
  if (!Number.isInteger(dati.amountCents) || dati.amountCents <= 0) {
    throw new ErroreLocale(400, 'IMPORTO_NON_VALIDO', 'L’importo della donazione deve essere maggiore di zero.');
  }
  if (!DONATION_CAUSES.includes(dati.cause)) throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'Scegli una causa valida.');

  const obiettivoGive = dati.donationGoalId ? a.obiettiviGive.find((g) => g.id === dati.donationGoalId && g.childId === childId) : null;
  if (dati.donationGoalId && !obiettivoGive) throw new ErroreLocale(404, 'NON_TROVATO', 'Obiettivo di donazione non trovato.');

  const etichette: Record<DonationCause, string> = {
    ANIMALI: 'per gli animali', AMBIENTE: 'per l’ambiente', PERSONE: 'per le persone',
    ISTRUZIONE: 'per la scuola', EMERGENZE: 'per le emergenze',
  };
  const descrizione = obiettivoGive ? `Donazione: ${obiettivoGive.title}` : `Donazione ${etichette[dati.cause]}`;

  const transactions = registra(a, childId, [
    { jar: 'GIVE', amountCents: -dati.amountCents, type: 'DONATION', description: descrizione, source: 'donazione', metadata: { causa: dati.cause, nota: dati.note ?? null } },
  ]);

  a.donazioni.unshift({
    id: nuovoId(),
    childId,
    donationGoalId: obiettivoGive?.id ?? null,
    amountCents: dati.amountCents,
    cause: dati.cause,
    note: dati.note ?? null,
    photoUrl: dati.photoUrl ?? null,
    createdAt: new Date().toISOString(),
  });

  const xp = [assegnaXp(a, childId, 'DONAZIONE')];
  sbloccaBadge(a, childId, 'PRIMA_DONAZIONE', 'Prima donazione', '❤️');
  const celebrations = ['CUORI'];
  const messages = [`Hai donato ${formatCents(dati.amountCents)}. Grazie da parte di chi riceve! ❤️`];

  if (obiettivoGive) {
    obiettivoGive.donatedCents += dati.amountCents;
    if (obiettivoGive.donatedCents >= obiettivoGive.targetCents) {
      obiettivoGive.status = 'COMPLETED';
      obiettivoGive.completedAt = new Date().toISOString();
      xp.push(assegnaXp(a, childId, 'OBIETTIVO_GIVE_COMPLETATO'));
      celebrations.push('CONFETTI');
      messages.push(`🎉 OBIETTIVO ${NOMI_JAR.GIVE} COMPLETATO: ${obiettivoGive.title}!`);
      avvisa(a, childId, 'DONAZIONE', '🎉', `Obiettivo ${NOMI_JAR.GIVE} completato: ${obiettivoGive.title}!`);
    }
  }
  avvisa(a, childId, 'DONAZIONE', '❤️', `Hai donato ${formatCents(dati.amountCents)}. Sei stato generoso!`);
  return { transactions, xp, celebrations, messages };
}

export function accreditaInteresse(
  a: Archivio,
  childId: string,
  opzioni: { now?: Date; force?: boolean } = {},
): EsitoOperazione & { interestCents: Cents; skipped?: string } {
  const ora = opzioni.now ?? new Date();
  const b = bambino(a, childId);
  const vuoto = { transactions: [], xp: [], celebrations: [], messages: [], interestCents: 0 };

  if (!b.settings.interestEnabled) return { ...vuoto, skipped: 'INTERESSE_DISATTIVO' };
  const periodo = periodKey(ora);
  if (!opzioni.force && a.interessi.some((i) => i.childId === childId && i.periodo === periodo)) {
    return { ...vuoto, skipped: 'GIA_ACCREDITATO' };
  }

  const calcolo = computeMonthlyInterest(saldi(a, childId).SAVE, b.settings.interestCentsPerEuro);
  if (calcolo.interestCents <= 0) return { ...vuoto, skipped: 'NIENTE_DA_ACCREDITARE' };

  const goal = obiettivoPrincipale(a, childId, ritmoSettimanale(a, childId, ora), ora);
  const transactions = registra(
    a,
    childId,
    [
      {
        jar: 'SAVE',
        amountCents: calcolo.interestCents,
        type: 'INTEREST',
        description: `Interesse del mese (${b.settings.interestCentsPerEuro} cent per euro)`,
        source: 'sistema',
        goalId: goal?.id ?? null,
        metadata: { periodo, baseCents: calcolo.baseCents },
      },
    ],
    { occurredAt: ora },
  );

  a.interessi.unshift({
    id: nuovoId(), childId, periodo, baseCents: calcolo.baseCents,
    centsPerEuro: calcolo.centsPerEuro, interestCents: calcolo.interestCents, createdAt: ora.toISOString(),
  });

  const xp = [assegnaXp(a, childId, 'INTERESSE_RISCOSSO')];
  sbloccaBadge(a, childId, 'PRIMO_INTERESSE', 'Il denaro cresce', '🌱');
  avvisa(a, childId, 'INTERESSE', '🌱', `Il tuo risparmio è cresciuto di ${formatCents(calcolo.interestCents)}!`);

  return {
    transactions,
    xp,
    celebrations: ['CRESCITA'],
    messages: [
      `Avevi ${formatCents(calcolo.baseCents)} in ${NOMI_JAR.SAVE}. Interesse: ${formatCents(calcolo.interestCents)}. ` +
        `Nuovo saldo: ${formatCents(calcolo.newBalanceCents)}.`,
    ],
    interestCents: calcolo.interestCents,
  };
}

export function giroconto(
  a: Archivio,
  childId: string,
  dati: { from: JarType; to: JarType; amountCents: Cents; reason?: string },
): EsitoOperazione {
  if (dati.from === dati.to) throw new ErroreLocale(400, 'DATI_NON_VALIDI', 'I due salvadanai devono essere diversi.');
  if (!Number.isInteger(dati.amountCents) || dati.amountCents <= 0) {
    throw new ErroreLocale(400, 'IMPORTO_NON_VALIDO', 'Importo non valido.');
  }
  const goal = obiettivoPrincipale(a, childId, ritmoSettimanale(a, childId));
  const motivo = dati.reason?.trim() || 'Giroconto';
  const transactions = registra(a, childId, [
    { jar: dati.from, amountCents: -dati.amountCents, type: 'TRANSFER_OUT', description: `${motivo} → ${NOMI_JAR[dati.to]}`, source: 'genitore', goalId: dati.from === 'SAVE' ? goal?.id ?? null : null },
    { jar: dati.to, amountCents: dati.amountCents, type: 'TRANSFER_IN', description: `${motivo} ← ${NOMI_JAR[dati.from]}`, source: 'genitore', goalId: dati.to === 'SAVE' ? goal?.id ?? null : null },
  ]);
  return {
    transactions, xp: [], celebrations: [],
    messages: [`Spostati ${formatCents(dati.amountCents)} da ${NOMI_JAR[dati.from]} a ${NOMI_JAR[dati.to]}.`],
  };
}

// ----------------------------------------------------------------- STORICO
export function storico(a: Archivio, childId: string, opzioni: { filter?: HistoryFilter; limit?: number; offset?: number } = {}) {
  const filtro = FILTRI_STORICO[opzioni.filter ?? 'TUTTO'] ?? {};
  const tutte = a.transazioni
    .filter((t) => t.childId === childId)
    .filter((t) => (filtro.tipi ? filtro.tipi.includes(t.type) : true))
    .filter((t) => (filtro.jar ? t.jar === filtro.jar : true))
    .filter((t) => (filtro.direzione === 'IN' ? t.amountCents > 0 : filtro.direzione === 'OUT' ? t.amountCents < 0 : true))
    .sort((x, y) => y.occurredAt.localeCompare(x.occurredAt));

  const limite = Math.min(200, Math.max(1, opzioni.limit ?? 50));
  const salto = Math.max(0, opzioni.offset ?? 0);

  return {
    total: tutte.length,
    items: tutte.slice(salto, salto + limite).map((t) => ({
      id: t.id,
      occurredAt: t.occurredAt,
      type: t.type,
      typeLabel: ETICHETTE_TIPO[t.type],
      emoji: (t.metadata?.emoji as string) || ICONE_TIPO[t.type],
      jar: t.jar,
      amountCents: t.amountCents,
      amountLabel: `${t.amountCents > 0 ? '+' : '−'}${formatCents(Math.abs(t.amountCents))}`,
      balanceAfterCents: t.balanceAfterCents,
      description: t.description,
      source: t.source,
      groupId: t.groupId,
    })),
  };
}

/** Verifica contabile: la somma dei movimenti deve coincidere con i saldi. */
export function verificaIntegrita(a: Archivio, childId: string) {
  const correnti = saldi(a, childId);
  const somme: Record<JarType, Cents> = { SAVE: 0, SPEND: 0, GIVE: 0 };
  for (const t of a.transazioni.filter((x) => x.childId === childId)) somme[t.jar] += t.amountCents;
  const dettagli = {
    SAVE: { saldo: correnti.SAVE, somma: somme.SAVE },
    SPEND: { saldo: correnti.SPEND, somma: somme.SPEND },
    GIVE: { saldo: correnti.GIVE, somma: somme.GIVE },
  };
  return { ok: (Object.keys(dettagli) as JarType[]).every((j) => dettagli[j].saldo === dettagli[j].somma), dettagli };
}

export function statistiche(a: Archivio, childId: string) {
  const transazioni = a.transazioni.filter((t) => t.childId === childId);
  const perTipo = new Map<TransactionType, { entrateCents: number; usciteCents: number; movimenti: number }>();
  for (const t of transazioni) {
    const v = perTipo.get(t.type) ?? { entrateCents: 0, usciteCents: 0, movimenti: 0 };
    if (t.amountCents > 0) v.entrateCents += t.amountCents;
    else v.usciteCents += -t.amountCents;
    v.movimenti += 1;
    perTipo.set(t.type, v);
  }
  const scelte = a.scelte.filter((s) => s.childId === childId);
  const media = (campo: 'save' | 'spend' | 'give') =>
    Math.round(scelte.reduce((somma, s) => somma + s[campo], 0) / scelte.length);

  const inizioSettimana = (iso: string) => {
    const d = new Date(iso);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const settimane = new Map<string, { risparmiatoCents: number; spesoCents: number }>();
  const limite = Date.now() - 12 * SETTIMANA;
  for (const t of transazioni) {
    if (new Date(t.occurredAt).getTime() < limite) continue;
    const chiave = inizioSettimana(t.occurredAt);
    const v = settimane.get(chiave) ?? { risparmiatoCents: 0, spesoCents: 0 };
    if (t.jar === 'SAVE' && t.amountCents > 0) v.risparmiatoCents += t.amountCents;
    if (t.type === 'PURCHASE' && t.amountCents < 0) v.spesoCents += -t.amountCents;
    settimane.set(chiave, v);
  }

  return {
    perTipo: [...perTipo.entries()].map(([type, v]) => ({ type, label: ETICHETTE_TIPO[type], ...v })),
    perJar: (['SAVE', 'SPEND', 'GIVE'] as JarType[]).map((jar) => ({
      jar,
      entrateCents: transazioni.filter((t) => t.jar === jar && t.amountCents > 0).reduce((s, t) => s + t.amountCents, 0),
      usciteCents: transazioni.filter((t) => t.jar === jar && t.amountCents < 0).reduce((s, t) => s - t.amountCents, 0),
    })),
    distribuzioneMedia: scelte.length ? { save: media('save'), spend: media('spend'), give: media('give'), scelte: scelte.length } : null,
    settimane: [...settimane.entries()].sort().map(([settimana, v]) => ({ settimana, ...v })),
  };
}

// ---------------------------------------------------------------- LEZIONI
export function elencoLezioni(a: Archivio, childId: string) {
  return LESSONS.map((l) => {
    const p = a.lezioni.find((x) => x.childId === childId && x.lessonId === l.id);
    return {
      id: l.id, position: l.position, title: l.title, emoji: l.emoji, summary: l.summary,
      minutes: l.minutes, totalQuestions: l.quiz.length,
      completed: !!p?.completedAt, bestScore: p?.bestScore ?? 0, attempts: p?.attempts ?? 0,
    };
  }).sort((x, y) => x.position - y.position);
}

export function correggiQuiz(a: Archivio, childId: string, lessonId: string, risposte: { id: string; answerIndex: number }[]) {
  const lezione = getLesson(lessonId);
  if (!lezione) throw new ErroreLocale(404, 'NON_TROVATO', 'Lezione non trovata.');

  const mappa = new Map(risposte.map((r) => [r.id, r.answerIndex]));
  const dettagli = lezione.quiz.map((q) => ({
    id: q.id, corretta: mappa.get(q.id) === q.correctIndex, correctIndex: q.correctIndex, explanation: q.explanation,
  }));
  const score = dettagli.filter((d) => d.corretta).length;
  const total = lezione.quiz.length;
  const perfetto = score === total && total > 0;

  let progresso = a.lezioni.find((x) => x.childId === childId && x.lessonId === lessonId);
  const eraCompletata = !!progresso?.completedAt;
  const bestPrecedente = progresso?.bestScore ?? 0;
  if (!progresso) {
    progresso = { childId, lessonId, completedAt: null, bestScore: 0, attempts: 0 };
    a.lezioni.push(progresso);
  }
  progresso.completedAt ??= new Date().toISOString();
  progresso.bestScore = Math.max(progresso.bestScore, score);
  progresso.attempts += 1;
  a.quiz.unshift({ id: nuovoId(), childId, lessonId, score, total, createdAt: new Date().toISOString() });

  const xp: EsitoXp[] = [];
  // Gli XP si assegnano solo per i miglioramenti: ripetere il quiz non li moltiplica.
  const nuoveCorrette = Math.max(0, score - bestPrecedente);
  if (nuoveCorrette > 0) xp.push(assegnaXp(a, childId, 'QUIZ_RISPOSTA_CORRETTA', nuoveCorrette * 10));
  if (!eraCompletata) {
    xp.push(assegnaXp(a, childId, 'LEZIONE_COMPLETATA'));
    avvisa(a, childId, 'LEZIONE', '💡', `Hai completato la lezione "${lezione.title}"!`);
  }
  if (perfetto && bestPrecedente < total) {
    xp.push(assegnaXp(a, childId, 'QUIZ_PERFETTO'));
    sbloccaBadge(a, childId, `QUIZ_${lessonId}`, `Quiz perfetto: ${lezione.title}`, '🎓');
  }
  if (a.lezioni.filter((x) => x.childId === childId && x.completedAt).length >= LESSONS.length) {
    sbloccaBadge(a, childId, 'DIPLOMA', 'Tutte le lezioni completate', '🎓');
  }

  return { lessonId, score, total, perfetto, dettagli, xp, celebrations: perfetto ? ['CONFETTI'] : [] };
}

// ------------------------------------------------------- STATO COMPLETO
export function statoBambino(a: Archivio, childId: string, ora = new Date()) {
  const b = bambino(a, childId);
  const correnti = saldi(a, childId);
  const totale = correnti.SAVE + correnti.SPEND + correnti.GIVE;
  const rate = ritmoSettimanale(a, childId, ora);
  const goals = obiettiviConProgresso(a, childId, rate, ora);
  const cronologia = storico(a, childId, { limit: 50 });
  const lavori = a.lavori.filter((l) => l.familyId === b.familyId && l.active);

  const richieste = a.richieste
    .filter((r) => r.childId === childId)
    .sort((x, y) => y.requestedAt.localeCompare(x.requestedAt))
    .map((r) => {
      const lavoro = a.lavori.find((l) => l.id === r.jobId);
      return { ...r, jobTitle: lavoro?.title, jobEmoji: lavoro?.emoji };
    });

  const donazioni = a.donazioni
    .filter((d) => d.childId === childId)
    .map((d) => ({
      id: d.id, amountCents: d.amountCents, cause: d.cause,
      causeLabel: CAUSE_INFO[d.cause]?.label ?? d.cause,
      causeEmoji: CAUSE_INFO[d.cause]?.emoji ?? '❤️',
      note: d.note, photoUrl: d.photoUrl,
      goalTitle: a.obiettiviGive.find((g) => g.id === d.donationGoalId)?.title ?? null,
      createdAt: d.createdAt,
    }));
  const totaleDonato = donazioni.reduce((s, d) => s + d.amountCents, 0);

  const interessi = a.interessi.filter((i) => i.childId === childId).slice(0, 6);
  const periodoCorrente = periodKey(ora);
  const anteprima = computeMonthlyInterest(correnti.SAVE, b.settings.interestCentsPerEuro);
  const notifiche = a.notifiche.filter((n) => n.childId === childId).slice(0, 15);

  return {
    generatedAt: ora.toISOString(),
    modalita: 'locale' as const,
    child: { ...b, level: levelFromXp(b.xp) },
    jars: {
      ...correnti,
      totalCents: totale,
      labels: {
        SAVE: formatCents(correnti.SAVE), SPEND: formatCents(correnti.SPEND),
        GIVE: formatCents(correnti.GIVE), total: formatCents(totale),
      },
    },
    rate,
    pendingIncomes: a.entrateInAttesa.filter((e) => e.childId === childId && e.status === 'PENDING'),
    goals,
    primaryGoal: obiettivoPrincipale(a, childId, rate, ora),
    history: cronologia.items,
    historyTotal: cronologia.total,
    recentPurchases: cronologia.items.filter((i) => i.type === 'PURCHASE').slice(0, 5),
    jobs: lavori,
    jobRequests: richieste,
    pendingJobRequests: richieste.filter((r) => r.status === 'PENDING').length,
    give: {
      totalDonatedCents: totaleDonato,
      donationGoals: a.obiettiviGive
        .filter((g) => g.childId === childId)
        .map((g) => ({
          ...g,
          progressPercent: g.targetCents > 0 ? Math.round(Math.min(100, (g.donatedCents * 100) / g.targetCents) * 10) / 10 : 0,
          remainingCents: Math.max(0, g.targetCents - g.donatedCents),
        })),
      donations: donazioni,
      causes: Object.entries(CAUSE_INFO).map(([id, info]) => ({ id, ...info })),
      message: messaggioGive(totaleDonato, correnti.GIVE),
      minPercent: b.settings.minGivePercent,
    },
    interest: {
      enabled: b.settings.interestEnabled,
      centsPerEuro: b.settings.interestCentsPerEuro,
      currentPeriod: periodoCorrente,
      alreadyAccruedThisPeriod: interessi.some((i) => i.periodo === periodoCorrente),
      preview: anteprima,
      history: interessi.map((i) => ({ period: i.periodo, baseCents: i.baseCents, interestCents: i.interestCents, createdAt: i.createdAt })),
      projection: projectCompound(correnti.SAVE, b.settings.interestCentsPerEuro, 4),
    },
    achievements: a.badge.filter((x) => x.childId === childId),
    notifications: notifiche,
    unreadNotifications: notifiche.filter((n) => !n.readAt).length,
    lessons: elencoLezioni(a, childId),
    streak: costanza(a, childId, ora),
    expectedWeeklySaveCents: weeklyFromAllowance(
      b.settings.allowanceCents, b.settings.defaultSplit.save, b.settings.defaultSplit.spend, b.settings.defaultSplit.give,
    ),
  };
}

export type StatoLocale = ReturnType<typeof statoBambino>;
