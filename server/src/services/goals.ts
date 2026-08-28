/**
 * Obiettivi di risparmio.
 *
 * Il progresso di un obiettivo non e' "il saldo di SAVE": e' la somma dei
 * movimenti SAVE attribuiti a quell'obiettivo (colonna goal_id) piu' quanto
 * il bambino aveva gia' da parte quando lo ha creato. Cosi' gli obiettivi
 * completati mantengono la loro storia e quello nuovo riparte da zero.
 */
import type { Db } from '../db/pool.js';
import type { PoolClient } from 'pg';
import { badRequest, notFound, conflict } from '../errors.js';
import type { Goal } from '../domain/types.js';
import {
  computeGoalProgress,
  estimateWeeklySavingRate,
  weeklyFromAllowance,
  type GoalProgress,
  type WeeklyRate,
} from '../domain/goals.js';
import type { Cents } from '../domain/money.js';
import { getChild } from './children.js';

export interface GoalWithProgress extends Goal {
  progress: GoalProgress;
}

function mapGoal(row: Record<string, any>): Goal {
  return {
    id: row.id,
    childId: row.child_id,
    name: row.name,
    emoji: row.emoji,
    imageUrl: row.image_url,
    targetCents: row.target_cents,
    savedAtCreationCents: row.saved_at_creation_cents,
    targetDate: row.target_date ? new Date(row.target_date).toISOString().slice(0, 10) : null,
    status: row.status,
    isPrimary: row.is_primary,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

/** Ritmo di risparmio settimanale del bambino (storico reale, con fallback sulla paghetta). */
export async function getWeeklyRate(db: Db, childId: string, now = new Date()): Promise<WeeklyRate> {
  const child = await getChild(db, childId);
  const { rows } = await db.query(
    `SELECT occurred_at, amount_cents
       FROM transactions
      WHERE child_id = $1 AND jar = 'SAVE' AND amount_cents > 0
        AND occurred_at >= now() - interval '8 weeks'
      ORDER BY occurred_at`,
    [childId],
  );
  const fallback = weeklyFromAllowance(
    child.settings.allowanceCents,
    child.settings.defaultSplit.save,
    child.settings.defaultSplit.spend,
    child.settings.defaultSplit.give,
  );
  return estimateWeeklySavingRate(
    rows.map((r) => ({ occurredAt: r.occurred_at, amountCents: r.amount_cents })),
    { windowWeeks: 8, fallbackWeeklyCents: fallback, now },
  );
}

/** Quanto e' stato messo da parte per un obiettivo. */
export async function getGoalSaved(db: Db, goal: Goal): Promise<Cents> {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(amount_cents), 0) AS somma FROM transactions WHERE goal_id = $1 AND jar = 'SAVE'`,
    [goal.id],
  );
  return Math.max(0, goal.savedAtCreationCents + Number(rows[0].somma));
}

export async function listGoals(
  db: Db,
  childId: string,
  opts: { rate?: WeeklyRate; now?: Date; includeArchived?: boolean } = {},
): Promise<GoalWithProgress[]> {
  const rate = opts.rate ?? (await getWeeklyRate(db, childId, opts.now));
  const { rows } = await db.query(
    `SELECT g.*, COALESCE(t.somma, 0) AS contribuito
       FROM goals g
       LEFT JOIN (
         SELECT goal_id, SUM(amount_cents) AS somma
           FROM transactions WHERE child_id = $1 AND jar = 'SAVE' GROUP BY goal_id
       ) t ON t.goal_id = g.id
      WHERE g.child_id = $1 ${opts.includeArchived ? '' : "AND g.status <> 'ARCHIVED'"}
      ORDER BY g.is_primary DESC, g.status, g.created_at DESC`,
    [childId],
  );
  return rows.map((row) => {
    const goal = mapGoal(row);
    const saved = Math.max(0, goal.savedAtCreationCents + Number(row.contribuito));
    return {
      ...goal,
      progress: computeGoalProgress({
        targetCents: goal.targetCents,
        savedCents: goal.status === 'COMPLETED' ? goal.targetCents : saved,
        rate,
        now: opts.now,
      }),
    };
  });
}

export async function getPrimaryGoal(db: Db, childId: string, rate?: WeeklyRate, now?: Date): Promise<GoalWithProgress | null> {
  const goals = await listGoals(db, childId, { rate, now });
  return goals.find((g) => g.isPrimary && g.status === 'ACTIVE') ?? goals.find((g) => g.status === 'ACTIVE') ?? null;
}

export interface CreateGoalInput {
  name: string;
  emoji?: string;
  imageUrl?: string | null;
  targetCents: Cents;
  savedAtCreationCents?: Cents;
  targetDate?: string | null;
  makePrimary?: boolean;
}

export async function createGoal(client: PoolClient, childId: string, input: CreateGoalInput): Promise<Goal> {
  const nome = input.name?.trim();
  if (!nome) throw badRequest('Dai un nome al tuo obiettivo!');
  if (!Number.isInteger(input.targetCents) || input.targetCents <= 0) {
    throw badRequest('Il prezzo dell’obiettivo deve essere maggiore di zero.');
  }
  const iniziale = input.savedAtCreationCents ?? 0;
  if (!Number.isInteger(iniziale) || iniziale < 0) throw badRequest('Il risparmio iniziale non è valido.');

  const primario = input.makePrimary !== false;
  if (primario) {
    await client.query(`UPDATE goals SET is_primary = FALSE WHERE child_id = $1 AND is_primary`, [childId]);
  }
  const { rows } = await client.query(
    `INSERT INTO goals (child_id, name, emoji, image_url, target_cents, saved_at_creation_cents, target_date, is_primary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [childId, nome, input.emoji ?? '⭐', input.imageUrl ?? null, input.targetCents, iniziale, input.targetDate ?? null, primario],
  );
  return mapGoal(rows[0]);
}

export async function updateGoal(
  client: PoolClient,
  childId: string,
  goalId: string,
  input: Partial<CreateGoalInput> & { status?: Goal['status'] },
): Promise<Goal> {
  const { rows: esistente } = await client.query(`SELECT * FROM goals WHERE id = $1 AND child_id = $2`, [goalId, childId]);
  if (esistente.length === 0) throw notFound('Obiettivo non trovato.');
  if (input.targetCents !== undefined && (!Number.isInteger(input.targetCents) || input.targetCents <= 0)) {
    throw badRequest('Il prezzo dell’obiettivo deve essere maggiore di zero.');
  }
  if (input.makePrimary) {
    await client.query(`UPDATE goals SET is_primary = FALSE WHERE child_id = $1 AND is_primary`, [childId]);
  }
  const { rows } = await client.query(
    `UPDATE goals SET
       name = COALESCE($3, name),
       emoji = COALESCE($4, emoji),
       image_url = COALESCE($5, image_url),
       target_cents = COALESCE($6, target_cents),
       target_date = COALESCE($7, target_date),
       status = COALESCE($8, status),
       is_primary = COALESCE($9, is_primary)
     WHERE id = $1 AND child_id = $2 RETURNING *`,
    [
      goalId,
      childId,
      input.name?.trim() ?? null,
      input.emoji ?? null,
      input.imageUrl ?? null,
      input.targetCents ?? null,
      input.targetDate ?? null,
      input.status ?? null,
      input.makePrimary === undefined ? null : input.makePrimary,
    ],
  );
  return mapGoal(rows[0]);
}

export async function setPrimaryGoal(client: PoolClient, childId: string, goalId: string): Promise<Goal> {
  const { rows: esiste } = await client.query(
    `SELECT id FROM goals WHERE id = $1 AND child_id = $2 AND status = 'ACTIVE'`,
    [goalId, childId],
  );
  if (esiste.length === 0) throw notFound('Obiettivo non trovato (o già completato).');
  await client.query(`UPDATE goals SET is_primary = FALSE WHERE child_id = $1 AND is_primary`, [childId]);
  const { rows } = await client.query(`UPDATE goals SET is_primary = TRUE WHERE id = $1 RETURNING *`, [goalId]);
  return mapGoal(rows[0]);
}

export async function deleteGoal(client: PoolClient, childId: string, goalId: string): Promise<void> {
  const { rowCount } = await client.query(
    `UPDATE goals SET status = 'ARCHIVED', is_primary = FALSE WHERE id = $1 AND child_id = $2 AND status <> 'COMPLETED'`,
    [goalId, childId],
  );
  if (!rowCount) throw conflict('Non puoi archiviare un obiettivo già completato.');
}

export { mapGoal };
