/**
 * OPERAZIONI SUL DENARO.
 * Entrate, spese, donazioni, interesse, completamento obiettivi.
 * Ogni funzione gira dentro una transazione SQL e passa dal ledger.
 */
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { badRequest, conflict, notFound } from '../errors.js';
import { formatCents, type Cents } from '../domain/money.js';
import { previewSplit, validateSplit } from '../domain/split.js';
import { computeMonthlyInterest, periodKey } from '../domain/interest.js';
import { xpForSaving } from '../domain/xp.js';
import type { JarType, Split, TransactionType, DonationCause } from '../domain/types.js';
import { getJarBalances, postEntries, type LedgerEntry } from './ledger.js';
import { awardXp, notify, unlockAchievement, computeSavingStreak, type XpResult } from './gamification.js';
import { getChild } from './children.js';
import { getPrimaryGoal, getGoalSaved, mapGoal } from './goals.js';

export interface IncomeInput {
  amountCents: Cents;
  split: Split;
  type?: Extract<TransactionType, 'ALLOWANCE' | 'JOB' | 'GIFT' | 'ADJUSTMENT'>;
  description?: string;
  source?: string;
  createdByUserId?: string | null;
  clientId?: string | null;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface OperationResult {
  transactions: Awaited<ReturnType<typeof postEntries>>;
  xp: XpResult[];
  celebrations: string[];
  messages: string[];
}

/**
 * ARRIVO DI UNA ENTRATA (paghetta, regalo, lavoro approvato).
 * L'importo viene diviso nei tre salvadanai secondo la scelta del bambino.
 * La somma delle tre parti e' sempre esattamente uguale all'importo.
 */
export async function addIncome(client: PoolClient, childId: string, input: IncomeInput): Promise<OperationResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw badRequest('L’importo deve essere maggiore di zero.');
  }
  const child = await getChild(client, childId);
  validateSplit(input.split, child.settings.minGivePercent);

  const parti = previewSplit(input.amountCents, input.split);
  const groupId = randomUUID();
  const tipo = input.type ?? 'ALLOWANCE';
  const descrizione = input.description?.trim() || descrizionePredefinita(tipo);
  const goalCorrente = await getPrimaryGoal(client, childId);

  const entries: LedgerEntry[] = parti
    .filter((p) => p.amountCents !== 0)
    .map((p) => ({
      jar: p.jar,
      amountCents: p.amountCents,
      type: tipo,
      description: descrizione,
      source: input.source ?? 'genitore',
      goalId: p.jar === 'SAVE' ? goalCorrente?.id ?? null : null,
      metadata: { ...(input.metadata ?? {}), percent: p.percent, totaleEntrataCents: input.amountCents },
    }));

  const transactions = await postEntries(
    client,
    { childId, createdByUserId: input.createdByUserId, groupId, occurredAt: input.occurredAt, clientId: input.clientId },
    entries,
  );

  await client.query(
    `INSERT INTO allocation_choices (child_id, group_id, amount_cents, save_percent, spend_percent, give_percent, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [childId, groupId, input.amountCents, input.split.save, input.split.spend, input.split.give, input.source ?? 'app'],
  );

  const quotaSave = parti.find((p) => p.jar === 'SAVE')!.amountCents;
  const quotaGive = parti.find((p) => p.jar === 'GIVE')!.amountCents;
  const xp: XpResult[] = [];
  xp.push(await awardXp(client, childId, 'SPLIT_SCELTO', { metadata: { groupId } }));
  if (quotaSave > 0) {
    xp.push(await awardXp(client, childId, 'RISPARMIO_PER_EURO', { amount: xpForSaving(quotaSave), metadata: { groupId } }));
  }
  if (input.split.give > child.settings.minGivePercent) {
    await unlockAchievement(client, childId, 'CUORE_GRANDE', 'Cuore grande', '💛');
  }

  const messages: string[] = [];
  const celebrations: string[] = ['MONETE'];
  messages.push(
    `Hai diviso ${formatCents(input.amountCents)}: ${formatCents(quotaSave)} in SAVE, ` +
      `${formatCents(parti.find((p) => p.jar === 'SPEND')!.amountCents)} in SPEND, ${formatCents(quotaGive)} in GIVE.`,
  );

  await notify(client, childId, 'RISPARMIO', '🎉', `Hai messo da parte ${formatCents(quotaSave)} in SAVE!`);

  // L'obiettivo si e' avvicinato: e' il feedback educativo piu' importante.
  if (goalCorrente && quotaSave > 0) {
    const saved = await getGoalSaved(client, goalCorrente);
    if (saved >= goalCorrente.targetCents) {
      messages.push(`${goalCorrente.emoji} Hai raggiunto il tuo obiettivo "${goalCorrente.name}"!`);
      celebrations.push('OBIETTIVO_PRONTO');
      await notify(client, childId, 'OBIETTIVO', '🏁', `${goalCorrente.emoji} ${goalCorrente.name}: ci sei! Puoi comprarlo.`);
    } else {
      await notify(
        client,
        childId,
        'OBIETTIVO',
        goalCorrente.emoji,
        `Sei più vicino a ${goalCorrente.name}: mancano ${formatCents(goalCorrente.targetCents - saved)}.`,
      );
    }
  }

  // Costanza: premiata a partire da 4 settimane consecutive con un versamento in SAVE.
  const streak = await computeSavingStreak(client, childId, input.occurredAt ?? new Date());
  if (streak >= 4) {
    const nuovo = await unlockAchievement(client, childId, `COSTANZA_${Math.min(streak, 12)}`, `${streak} settimane di fila`, '🔥');
    if (nuovo) {
      xp.push(await awardXp(client, childId, 'COSTANZA_SETTIMANALE', { metadata: { streak } }));
      celebrations.push('COSTANZA');
    }
  }

  return { transactions, xp, celebrations, messages };
}

function descrizionePredefinita(tipo: TransactionType): string {
  switch (tipo) {
    case 'ALLOWANCE': return 'Paghetta';
    case 'JOB': return 'Lavoro extra';
    case 'GIFT': return 'Regalo';
    default: return 'Entrata';
  }
}

export interface PurchaseInput {
  amountCents: Cents;
  jar?: Extract<JarType, 'SPEND' | 'SAVE'>;
  description: string;
  emoji?: string;
  createdByUserId?: string | null;
  clientId?: string | null;
  occurredAt?: Date;
  simulated?: boolean; // true se il bambino ha usato il simulatore prima di comprare
}

/** REGISTRAZIONE DI UNA SPESA. Nessun blocco: si registra e si mostra l'effetto. */
export async function registerPurchase(client: PoolClient, childId: string, input: PurchaseInput): Promise<OperationResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw badRequest('L’importo della spesa deve essere maggiore di zero.');
  }
  const descrizione = input.description?.trim();
  if (!descrizione) throw badRequest('Scrivi cosa hai comprato.');

  const jar = input.jar ?? 'SPEND';
  const goal = jar === 'SAVE' ? await getPrimaryGoal(client, childId) : null;

  const transactions = await postEntries(
    client,
    { childId, createdByUserId: input.createdByUserId, occurredAt: input.occurredAt, clientId: input.clientId },
    [
      {
        jar,
        amountCents: -input.amountCents,
        type: 'PURCHASE',
        description: descrizione,
        source: 'bambino',
        goalId: jar === 'SAVE' ? goal?.id ?? null : null,
        metadata: { emoji: input.emoji ?? '🛍️', simulato: !!input.simulated },
      },
    ],
  );

  const xp: XpResult[] = [await awardXp(client, childId, 'SPESA_REGISTRATA', { metadata: { descrizione } })];
  if (input.simulated) xp.push(await awardXp(client, childId, 'SIMULATORE_USATO'));
  await unlockAchievement(client, childId, 'PRIMA_SPESA', 'Prima spesa registrata', '🧾');

  const messages = [`Hai registrato ${descrizione}: ${formatCents(input.amountCents)} da ${jar}.`];
  return { transactions, xp, celebrations: [], messages };
}

/** COMPLETAMENTO DI UN OBIETTIVO: il bambino ha comprato la sua bici. */
export async function completeGoal(client: PoolClient, childId: string, goalId: string): Promise<OperationResult> {
  const { rows } = await client.query(`SELECT * FROM goals WHERE id = $1 AND child_id = $2 FOR UPDATE`, [goalId, childId]);
  if (rows.length === 0) throw notFound('Obiettivo non trovato.');
  const goal = mapGoal(rows[0]);
  if (goal.status === 'COMPLETED') throw conflict('Questo obiettivo è già stato completato.');

  const saved = await getGoalSaved(client, goal);
  if (saved < goal.targetCents) {
    throw conflict(`Ti mancano ancora ${formatCents(goal.targetCents - saved)} per "${goal.name}".`);
  }

  const saldi = await getJarBalances(client, childId);
  // Si prelevano solo i soldi realmente presenti nel salvadanaio SAVE:
  // la parte "gia' risparmiata prima dell'app" non e' denaro tracciato qui.
  const daPrelevare = Math.min(goal.targetCents, saldi.SAVE);
  const transactions =
    daPrelevare > 0
      ? await postEntries(client, { childId }, [
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

  await client.query(
    `UPDATE goals SET status = 'COMPLETED', completed_at = now(), is_primary = FALSE WHERE id = $1`,
    [goal.id],
  );

  const xp = [await awardXp(client, childId, 'OBIETTIVO_COMPLETATO', { metadata: { goalId: goal.id } })];
  await unlockAchievement(client, childId, `OBIETTIVO_${goal.id.slice(0, 8)}`, `Obiettivo: ${goal.name}`, goal.emoji);
  await notify(client, childId, 'OBIETTIVO', '🏆', `Ce l’hai fatta: ${goal.emoji} ${goal.name}!`);

  return {
    transactions,
    xp,
    celebrations: ['CONFETTI', 'BADGE'],
    messages: [`🎉 Obiettivo completato: ${goal.name} (${formatCents(goal.targetCents)})!`],
  };
}

export interface DonationInput {
  amountCents: Cents;
  cause: DonationCause;
  donationGoalId?: string | null;
  note?: string | null;
  photoUrl?: string | null;
  confirmedByUserId: string;   // la donazione richiede SEMPRE la conferma di un genitore
  clientId?: string | null;
}

/** DONAZIONE dal salvadanaio GIVE (confermata dal genitore). */
export async function makeDonation(client: PoolClient, childId: string, input: DonationInput): Promise<OperationResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw badRequest('L’importo della donazione deve essere maggiore di zero.');
  }
  let obiettivoGive: Record<string, any> | null = null;
  if (input.donationGoalId) {
    const { rows } = await client.query(
      `SELECT * FROM donation_goals WHERE id = $1 AND child_id = $2 FOR UPDATE`,
      [input.donationGoalId, childId],
    );
    if (rows.length === 0) throw notFound('Obiettivo di donazione non trovato.');
    obiettivoGive = rows[0];
  }

  const descrizione = obiettivoGive ? `Donazione: ${obiettivoGive.title}` : `Donazione ${etichettaCausa(input.cause)}`;
  const transactions = await postEntries(
    client,
    { childId, createdByUserId: input.confirmedByUserId, clientId: input.clientId },
    [
      {
        jar: 'GIVE',
        amountCents: -input.amountCents,
        type: 'DONATION',
        description: descrizione,
        source: 'donazione',
        metadata: { causa: input.cause, nota: input.note ?? null },
      },
    ],
  );

  const { rows: donazione } = await client.query(
    `INSERT INTO donations (child_id, donation_goal_id, amount_cents, cause, note, photo_url, confirmed_by_user_id, transaction_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      childId,
      input.donationGoalId ?? null,
      input.amountCents,
      input.cause,
      input.note ?? null,
      input.photoUrl ?? null,
      input.confirmedByUserId,
      transactions[0]?.id ?? null,
    ],
  );

  const xp: XpResult[] = [await awardXp(client, childId, 'DONAZIONE', { metadata: { donazioneId: donazione[0].id } })];
  await unlockAchievement(client, childId, 'PRIMA_DONAZIONE', 'Prima donazione', '❤️');
  const celebrations = ['CUORI'];
  const messages = [`Hai donato ${formatCents(input.amountCents)}. Grazie da parte di chi riceve! ❤️`];

  if (obiettivoGive) {
    const nuovoTotale = Number(obiettivoGive.donated_cents) + input.amountCents;
    const completato = nuovoTotale >= Number(obiettivoGive.target_cents);
    await client.query(
      `UPDATE donation_goals SET donated_cents = $2, status = $3, completed_at = $4 WHERE id = $1`,
      [obiettivoGive.id, nuovoTotale, completato ? 'COMPLETED' : 'ACTIVE', completato ? new Date() : null],
    );
    if (completato) {
      xp.push(await awardXp(client, childId, 'OBIETTIVO_GIVE_COMPLETATO', { metadata: { id: obiettivoGive.id } }));
      celebrations.push('CONFETTI');
      messages.push(`🎉 OBIETTIVO GIVE COMPLETATO: ${obiettivoGive.title}!`);
      await notify(client, childId, 'DONAZIONE', '🎉', `Obiettivo GIVE completato: ${obiettivoGive.title}!`);
    }
  }

  await notify(client, childId, 'DONAZIONE', '❤️', `Hai donato ${formatCents(input.amountCents)}. Sei stato generoso!`);
  return { transactions, xp, celebrations, messages };
}

function etichettaCausa(c: DonationCause): string {
  return { ANIMALI: 'per gli animali', AMBIENTE: 'per l’ambiente', PERSONE: 'per le persone', ISTRUZIONE: 'per la scuola', EMERGENZE: 'per le emergenze' }[c];
}

/** 🌱 ACCREDITO DELL'INTERESSE su SAVE (una sola volta per mese). */
export async function accrueInterest(
  client: PoolClient,
  childId: string,
  opts: { now?: Date; createdByUserId?: string | null; force?: boolean } = {},
): Promise<OperationResult & { interestCents: Cents; skipped?: string }> {
  const now = opts.now ?? new Date();
  const child = await getChild(client, childId);
  if (!child.settings.interestEnabled) {
    return { transactions: [], xp: [], celebrations: [], messages: [], interestCents: 0, skipped: 'INTERESSE_DISATTIVO' };
  }
  const periodo = periodKey(now);
  const { rows: gia } = await client.query(
    `SELECT id FROM interest_accruals WHERE child_id = $1 AND period_key = $2`,
    [childId, periodo],
  );
  if (gia.length > 0 && !opts.force) {
    return { transactions: [], xp: [], celebrations: [], messages: [], interestCents: 0, skipped: 'GIA_ACCREDITATO' };
  }

  const saldi = await getJarBalances(client, childId);
  const calcolo = computeMonthlyInterest(saldi.SAVE, child.settings.interestCentsPerEuro);
  if (calcolo.interestCents <= 0) {
    return { transactions: [], xp: [], celebrations: [], messages: [], interestCents: 0, skipped: 'NIENTE_DA_ACCREDITARE' };
  }

  const goal = await getPrimaryGoal(client, childId);
  const transactions = await postEntries(client, { childId, createdByUserId: opts.createdByUserId, occurredAt: now }, [
    {
      jar: 'SAVE',
      amountCents: calcolo.interestCents,
      type: 'INTEREST',
      description: `Interesse del mese (${child.settings.interestCentsPerEuro} cent per euro)`,
      source: 'sistema',
      goalId: goal?.id ?? null,
      metadata: { periodo, baseCents: calcolo.baseCents, euriInteri: calcolo.euriInteri },
    },
  ]);

  await client.query(
    `INSERT INTO interest_accruals (child_id, period_key, base_cents, cents_per_euro, interest_cents, transaction_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (child_id, period_key) DO NOTHING`,
    [childId, periodo, calcolo.baseCents, calcolo.centsPerEuro, calcolo.interestCents, transactions[0]?.id ?? null],
  );

  const xp = [await awardXp(client, childId, 'INTERESSE_RISCOSSO', { metadata: { periodo } })];
  await unlockAchievement(client, childId, 'PRIMO_INTERESSE', 'Il denaro cresce', '🌱');
  await notify(client, childId, 'INTERESSE', '🌱', `Il tuo risparmio è cresciuto di ${formatCents(calcolo.interestCents)}!`);

  return {
    transactions,
    xp,
    celebrations: ['CRESCITA'],
    messages: [
      `Avevi ${formatCents(calcolo.baseCents)} in SAVE. Interesse: ${formatCents(calcolo.interestCents)}. ` +
        `Nuovo saldo: ${formatCents(calcolo.newBalanceCents)}.`,
    ],
    interestCents: calcolo.interestCents,
  };
}

/** Giroconto fra salvadanai (solo genitore, es. correzione di un errore). */
export async function transferBetweenJars(
  client: PoolClient,
  childId: string,
  input: { from: JarType; to: JarType; amountCents: Cents; reason?: string; createdByUserId?: string | null },
): Promise<OperationResult> {
  if (input.from === input.to) throw badRequest('I due salvadanai devono essere diversi.');
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw badRequest('Importo non valido.');
  const child = await getChild(client, childId);
  const goal = await getPrimaryGoal(client, childId);
  const motivo = input.reason?.trim() || 'Giroconto';

  const transactions = await postEntries(client, { childId, createdByUserId: input.createdByUserId }, [
    {
      jar: input.from,
      amountCents: -input.amountCents,
      type: 'TRANSFER_OUT',
      description: `${motivo} → ${input.to}`,
      source: 'genitore',
      goalId: input.from === 'SAVE' ? goal?.id ?? null : null,
    },
    {
      jar: input.to,
      amountCents: input.amountCents,
      type: 'TRANSFER_IN',
      description: `${motivo} ← ${input.from}`,
      source: 'genitore',
      goalId: input.to === 'SAVE' ? goal?.id ?? null : null,
    },
  ]);

  return {
    transactions,
    xp: [],
    celebrations: [],
    messages: [`Spostati ${formatCents(input.amountCents)} da ${input.from} a ${input.to}. (${child.name})`],
  };
}
