/**
 * ENTRATE IN ATTESA DI DIVISIONE.
 *
 * Punto 2 del capitolato: il genitore inserisce l'entrata ("Nuova paghetta: €10")
 * ma e' il BAMBINO a decidere come dividerla fra SAVE, SPEND e GIVE.
 * Finche' non sceglie, i soldi restano in attesa e non toccano i salvadanai.
 */
import type { PoolClient } from 'pg';
import type { Db } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../errors.js';
import type { Cents } from '../domain/money.js';
import type { Split, TransactionType } from '../domain/types.js';
import { addIncome, type OperationResult } from './operations.js';

export interface PendingIncome {
  id: string;
  childId: string;
  amountCents: Cents;
  type: TransactionType;
  description: string;
  status: 'PENDING' | 'ALLOCATED' | 'CANCELLED';
  createdAt: string;
}

function map(row: Record<string, any>): PendingIncome {
  return {
    id: row.id,
    childId: row.child_id,
    amountCents: row.amount_cents,
    type: row.type,
    description: row.description,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function createPendingIncome(
  client: PoolClient,
  childId: string,
  input: { amountCents: Cents; type?: 'ALLOWANCE' | 'GIFT' | 'ADJUSTMENT'; description?: string; createdByUserId?: string | null },
): Promise<PendingIncome> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw badRequest('L’importo deve essere maggiore di zero.');
  const { rows } = await client.query(
    `INSERT INTO pending_incomes (child_id, amount_cents, type, description, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [childId, input.amountCents, input.type ?? 'ALLOWANCE', input.description?.trim() || 'Paghetta', input.createdByUserId ?? null],
  );
  return map(rows[0]);
}

export async function listPendingIncomes(db: Db, childId: string): Promise<PendingIncome[]> {
  const { rows } = await db.query(
    `SELECT * FROM pending_incomes WHERE child_id = $1 AND status = 'PENDING' ORDER BY created_at`,
    [childId],
  );
  return rows.map(map);
}

/** Il bambino conferma la sua divisione: i soldi entrano davvero nei salvadanai. */
export async function allocatePendingIncome(
  client: PoolClient,
  childId: string,
  pendingId: string,
  split: Split,
  clientId?: string | null,
): Promise<OperationResult & { pending: PendingIncome }> {
  const { rows } = await client.query(
    `SELECT * FROM pending_incomes WHERE id = $1 AND child_id = $2 FOR UPDATE`,
    [pendingId, childId],
  );
  if (rows.length === 0) throw notFound('Entrata non trovata.');
  if (rows[0].status !== 'PENDING') throw conflict('Questa entrata è già stata divisa.');

  const risultato = await addIncome(client, childId, {
    amountCents: rows[0].amount_cents,
    split,
    type: rows[0].type,
    description: rows[0].description,
    source: 'bambino',
    createdByUserId: rows[0].created_by_user_id,
    clientId,
    metadata: { pendingIncomeId: pendingId },
  });

  const { rows: aggiornata } = await client.query(
    `UPDATE pending_incomes SET status = 'ALLOCATED', allocated_group_id = $2, allocated_at = now() WHERE id = $1 RETURNING *`,
    [pendingId, risultato.transactions[0]?.groupId ?? null],
  );
  return { ...risultato, pending: map(aggiornata[0]) };
}

export async function cancelPendingIncome(client: PoolClient, childId: string, pendingId: string): Promise<void> {
  const { rowCount } = await client.query(
    `UPDATE pending_incomes SET status = 'CANCELLED' WHERE id = $1 AND child_id = $2 AND status = 'PENDING'`,
    [pendingId, childId],
  );
  if (!rowCount) throw notFound('Entrata non trovata o già divisa.');
}
