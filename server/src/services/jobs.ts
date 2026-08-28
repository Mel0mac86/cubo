/**
 * MENU GUADAGNA — lavori extra, richieste e approvazioni.
 *
 * Flusso: il genitore crea i lavori → il bambino chiede "RICHIEDI LAVORO"
 * → la richiesta va in ⏳ In attesa → il genitore approva/rifiuta/modifica
 * → all'approvazione i soldi entrano e vengono divisi come ha scelto il bambino.
 */
import type { PoolClient } from 'pg';
import type { Db } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { formatCents, type Cents } from '../domain/money.js';
import type { Job, JobRequest, JobRequestStatus } from '../domain/types.js';
import { addIncome, type OperationResult } from './operations.js';
import { awardXp, notify, unlockAchievement } from './gamification.js';
import { getChild } from './children.js';

function mapJob(row: Record<string, any>): Job {
  return {
    id: row.id,
    familyId: row.family_id,
    title: row.title,
    emoji: row.emoji,
    rewardCents: row.reward_cents,
    description: row.description,
    active: row.active,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapRequest(row: Record<string, any>): JobRequest & { jobTitle?: string; jobEmoji?: string } {
  return {
    id: row.id,
    jobId: row.job_id,
    childId: row.child_id,
    status: row.status,
    requestedRewardCents: row.requested_reward_cents,
    approvedRewardCents: row.approved_reward_cents,
    note: row.note,
    parentNote: row.parent_note,
    requestedAt: new Date(row.requested_at).toISOString(),
    decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
    decidedByUserId: row.decided_by_user_id,
    ...(row.title ? { jobTitle: row.title, jobEmoji: row.emoji } : {}),
  };
}

export async function listJobs(db: Db, familyId: string, opts: { soloAttivi?: boolean } = {}): Promise<Job[]> {
  const { rows } = await db.query(
    `SELECT * FROM jobs WHERE family_id = $1 ${opts.soloAttivi ? 'AND active' : ''} ORDER BY reward_cents, title`,
    [familyId],
  );
  return rows.map(mapJob);
}

export async function createJob(
  db: Db,
  familyId: string,
  input: { title: string; emoji?: string; rewardCents: Cents; description?: string | null },
): Promise<Job> {
  const titolo = input.title?.trim();
  if (!titolo) throw badRequest('Dai un nome al lavoro.');
  if (!Number.isInteger(input.rewardCents) || input.rewardCents <= 0) throw badRequest('Il compenso deve essere maggiore di zero.');
  const { rows } = await db.query(
    `INSERT INTO jobs (family_id, title, emoji, reward_cents, description) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [familyId, titolo, input.emoji ?? '💪', input.rewardCents, input.description ?? null],
  );
  return mapJob(rows[0]);
}

export async function updateJob(
  db: Db,
  familyId: string,
  jobId: string,
  input: { title?: string; emoji?: string; rewardCents?: Cents; description?: string | null; active?: boolean },
): Promise<Job> {
  if (input.rewardCents !== undefined && (!Number.isInteger(input.rewardCents) || input.rewardCents <= 0)) {
    throw badRequest('Il compenso deve essere maggiore di zero.');
  }
  const { rows } = await db.query(
    `UPDATE jobs SET
       title = COALESCE($3, title), emoji = COALESCE($4, emoji),
       reward_cents = COALESCE($5, reward_cents), description = COALESCE($6, description),
       active = COALESCE($7, active)
     WHERE id = $1 AND family_id = $2 RETURNING *`,
    [jobId, familyId, input.title?.trim() ?? null, input.emoji ?? null, input.rewardCents ?? null, input.description ?? null,
     input.active === undefined ? null : input.active],
  );
  if (rows.length === 0) throw notFound('Lavoro non trovato.');
  return mapJob(rows[0]);
}

export async function listJobRequests(
  db: Db,
  filtro: { childId?: string; familyId?: string; status?: JobRequestStatus },
): Promise<(JobRequest & { jobTitle?: string; jobEmoji?: string })[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filtro.childId) { params.push(filtro.childId); where.push(`r.child_id = $${params.length}`); }
  if (filtro.familyId) { params.push(filtro.familyId); where.push(`j.family_id = $${params.length}`); }
  if (filtro.status) { params.push(filtro.status); where.push(`r.status = $${params.length}`); }
  const { rows } = await db.query(
    `SELECT r.*, j.title, j.emoji FROM job_requests r JOIN jobs j ON j.id = r.job_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY r.requested_at DESC LIMIT 100`,
    params,
  );
  return rows.map(mapRequest);
}

/** Il bambino richiede un lavoro: passa in ⏳ In attesa di approvazione. */
export async function requestJob(client: PoolClient, childId: string, jobId: string, note?: string | null): Promise<JobRequest> {
  const { rows: lavoro } = await client.query(`SELECT * FROM jobs WHERE id = $1 AND active`, [jobId]);
  if (lavoro.length === 0) throw notFound('Questo lavoro non è disponibile.');

  const { rows: pendente } = await client.query(
    `SELECT id FROM job_requests WHERE job_id = $1 AND child_id = $2 AND status = 'PENDING'`,
    [jobId, childId],
  );
  if (pendente.length > 0) throw conflict('Hai già una richiesta in attesa per questo lavoro.');

  const { rows } = await client.query(
    `INSERT INTO job_requests (job_id, child_id, requested_reward_cents, note) VALUES ($1,$2,$3,$4) RETURNING *`,
    [jobId, childId, lavoro[0].reward_cents, note ?? null],
  );
  return mapRequest(rows[0]);
}

export interface ApprovalResult extends OperationResult {
  request: JobRequest;
}

/** Il genitore approva (eventualmente modificando l'importo): i soldi entrano subito. */
export async function approveJobRequest(
  client: PoolClient,
  requestId: string,
  input: { approvedRewardCents?: Cents; parentNote?: string | null; parentUserId: string; familyId: string },
): Promise<ApprovalResult> {
  const { rows } = await client.query(
    `SELECT r.*, j.title, j.emoji, j.family_id FROM job_requests r
       JOIN jobs j ON j.id = r.job_id
      WHERE r.id = $1 FOR UPDATE OF r`,
    [requestId],
  );
  if (rows.length === 0) throw notFound('Richiesta non trovata.');
  const richiesta = rows[0];
  if (richiesta.family_id !== input.familyId) throw notFound('Richiesta non trovata.');
  if (richiesta.status !== 'PENDING') throw conflict('Questa richiesta è già stata gestita.');

  const importo = input.approvedRewardCents ?? richiesta.requested_reward_cents;
  if (!Number.isInteger(importo) || importo <= 0) throw badRequest('Il compenso approvato deve essere maggiore di zero.');

  const child = await getChild(client, richiesta.child_id);
  const risultato = await addIncome(client, richiesta.child_id, {
    amountCents: importo,
    split: child.settings.defaultSplit,
    type: 'JOB',
    description: `${richiesta.emoji} ${richiesta.title}`,
    source: `lavoro:${richiesta.job_id}`,
    createdByUserId: input.parentUserId,
    metadata: { jobRequestId: requestId },
  });

  const { rows: aggiornata } = await client.query(
    `UPDATE job_requests SET status = 'APPROVED', approved_reward_cents = $2, parent_note = $3,
            decided_at = now(), decided_by_user_id = $4, transaction_group_id = $5
      WHERE id = $1 RETURNING *`,
    [requestId, importo, input.parentNote ?? null, input.parentUserId, risultato.transactions[0]?.groupId ?? null],
  );

  const xp = [...risultato.xp, await awardXp(client, richiesta.child_id, 'LAVORO_COMPLETATO', { metadata: { requestId } })];
  await unlockAchievement(client, richiesta.child_id, 'PRIMO_LAVORO', 'Primo lavoro completato', '💪');
  await notify(client, richiesta.child_id, 'LAVORO', '✅', `${richiesta.title}: approvato! Hai guadagnato ${formatCents(importo)}.`);

  return {
    ...risultato,
    xp,
    celebrations: [...risultato.celebrations, 'CONFETTI'],
    messages: [`✅ ${richiesta.title} approvato: ${formatCents(importo)}!`, ...risultato.messages],
    request: mapRequest({ ...aggiornata[0], title: richiesta.title, emoji: richiesta.emoji }),
  };
}

export async function rejectJobRequest(
  client: PoolClient,
  requestId: string,
  input: { parentNote?: string | null; parentUserId: string; familyId: string },
): Promise<JobRequest> {
  const { rows } = await client.query(
    `SELECT r.*, j.title, j.emoji, j.family_id FROM job_requests r JOIN jobs j ON j.id = r.job_id WHERE r.id = $1 FOR UPDATE OF r`,
    [requestId],
  );
  if (rows.length === 0 || rows[0].family_id !== input.familyId) throw notFound('Richiesta non trovata.');
  if (rows[0].status !== 'PENDING') throw conflict('Questa richiesta è già stata gestita.');

  const { rows: aggiornata } = await client.query(
    `UPDATE job_requests SET status = 'REJECTED', parent_note = $2, decided_at = now(), decided_by_user_id = $3
      WHERE id = $1 RETURNING *`,
    [requestId, input.parentNote ?? null, input.parentUserId],
  );
  await notify(
    client,
    rows[0].child_id,
    'LAVORO',
    '💬',
    input.parentNote?.trim()
      ? `${rows[0].title}: ${input.parentNote.trim()}`
      : `${rows[0].title}: per questa volta no. Riprova quando vuoi!`,
  );
  return mapRequest({ ...aggiornata[0], title: rows[0].title, emoji: rows[0].emoji });
}
