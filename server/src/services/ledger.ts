/**
 * LEDGER — l'unico punto del sistema in cui il denaro si muove.
 *
 * Garanzie:
 *  - ogni movimento e' scritto in `transactions` con saldo prima e dopo;
 *  - i saldi dei salvadanai non possono mai diventare negativi;
 *  - la riga di salvadanaio viene bloccata (SELECT ... FOR UPDATE) per evitare
 *    che due richieste contemporanee producano saldi incoerenti;
 *  - un `clientId` (generato offline dal telefono) rende l'operazione
 *    idempotente: rimandare la stessa transazione non la duplica.
 */
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { AppError, badRequest, conflict, notFound } from '../errors.js';
import { assertCents, formatCents, type Cents } from '../domain/money.js';
import type { JarType, Transaction, TransactionType, JarBalances } from '../domain/types.js';
import { NOMI_JAR } from '../domain/etichette.js';
import type { Db } from '../db/pool.js';

export interface LedgerEntry {
  jar: JarType;
  amountCents: Cents; // positivo = entra, negativo = esce
  type: TransactionType;
  description: string;
  source?: string;
  goalId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface LedgerContext {
  childId: string;
  createdByUserId?: string | null;
  groupId?: string;
  occurredAt?: Date;
  clientId?: string | null;
}

export class FondiInsufficientiError extends AppError {
  constructor(jar: JarType, disponibile: Cents, richiesto: Cents) {
    super(
      400,
      'FONDI_INSUFFICIENTI',
      `Nel salvadanaio ${NOMI_JAR[jar]} ci sono ${formatCents(disponibile)}, ma ne servono ${formatCents(richiesto)}.`,
      { jar, disponibileCents: disponibile, richiestoCents: richiesto },
    );
  }
}

function mapTransaction(row: Record<string, any>): Transaction {
  return {
    id: row.id,
    childId: row.child_id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    type: row.type,
    jar: row.jar,
    amountCents: row.amount_cents,
    balanceBeforeCents: row.balance_before_cents,
    balanceAfterCents: row.balance_after_cents,
    description: row.description,
    source: row.source,
    createdByUserId: row.created_by_user_id,
    groupId: row.group_id,
    metadata: row.metadata ?? {},
  };
}

/** Saldi correnti dei tre salvadanai. */
export async function getJarBalances(db: Db, childId: string): Promise<JarBalances> {
  const { rows } = await db.query(`SELECT type, balance_cents FROM jars WHERE child_id = $1`, [childId]);
  const saldi: JarBalances = { SAVE: 0, SPEND: 0, GIVE: 0 };
  for (const r of rows) saldi[r.type as JarType] = r.balance_cents;
  return saldi;
}

export function totalBalance(saldi: JarBalances): Cents {
  return saldi.SAVE + saldi.SPEND + saldi.GIVE;
}

/**
 * Registra uno o piu' movimenti come un'unica operazione atomica.
 * Deve essere chiamata dentro una transazione SQL (withTransaction).
 */
export async function postEntries(
  client: PoolClient,
  ctx: LedgerContext,
  entries: LedgerEntry[],
): Promise<Transaction[]> {
  if (entries.length === 0) return [];

  // 1) idempotenza: la stessa operazione inviata due volte (retry offline)
  if (ctx.clientId) {
    const { rows } = await client.query(
      `SELECT * FROM transactions WHERE child_id = $1 AND client_id = $2 ORDER BY created_at`,
      [ctx.childId, ctx.clientId],
    );
    if (rows.length > 0) return rows.map(mapTransaction);
  }

  const groupId = ctx.groupId ?? randomUUID();
  const occurredAt = ctx.occurredAt ?? new Date();
  const risultato: Transaction[] = [];

  // 2) blocco dei salvadanai coinvolti in ordine stabile: niente deadlock
  const jarCoinvolti = [...new Set(entries.map((e) => e.jar))].sort();
  const saldi = new Map<JarType, Cents>();
  for (const jar of jarCoinvolti) {
    const { rows } = await client.query(
      `SELECT balance_cents FROM jars WHERE child_id = $1 AND type = $2 FOR UPDATE`,
      [ctx.childId, jar],
    );
    if (rows.length === 0) throw notFound(`Salvadanaio ${jar} non trovato.`);
    saldi.set(jar as JarType, rows[0].balance_cents);
  }

  for (const entry of entries) {
    assertCents(entry.amountCents, 'importo del movimento');
    if (entry.amountCents === 0) throw badRequest('Un movimento da 0 € non ha senso.');

    const prima = saldi.get(entry.jar)!;
    const dopo = prima + entry.amountCents;
    if (dopo < 0) throw new FondiInsufficientiError(entry.jar, prima, Math.abs(entry.amountCents));

    const { rows } = await client.query(
      `INSERT INTO transactions
         (child_id, occurred_at, type, jar, amount_cents, balance_before_cents, balance_after_cents,
          description, source, created_by_user_id, goal_id, group_id, client_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        ctx.childId,
        occurredAt,
        entry.type,
        entry.jar,
        entry.amountCents,
        prima,
        dopo,
        entry.description,
        entry.source ?? 'app',
        ctx.createdByUserId ?? null,
        entry.goalId ?? null,
        groupId,
        // il client_id identifica l'intera operazione: lo mettiamo solo sulla prima riga
        ctx.clientId && risultato.length === 0 ? ctx.clientId : null,
        JSON.stringify(entry.metadata ?? {}),
      ],
    );

    await client.query(`UPDATE jars SET balance_cents = $1 WHERE child_id = $2 AND type = $3`, [
      dopo,
      ctx.childId,
      entry.jar,
    ]);
    saldi.set(entry.jar, dopo);
    risultato.push(mapTransaction(rows[0]));
  }

  return risultato;
}

/** Verifica di integrita': la somma dei movimenti deve coincidere con i saldi. */
export async function verifyIntegrity(db: Db, childId: string): Promise<{ ok: boolean; dettagli: Record<JarType, { saldo: Cents; somma: Cents }> }> {
  const saldi = await getJarBalances(db, childId);
  const { rows } = await db.query(
    `SELECT jar, COALESCE(SUM(amount_cents), 0) AS somma FROM transactions WHERE child_id = $1 GROUP BY jar`,
    [childId],
  );
  const somme: Record<string, number> = { SAVE: 0, SPEND: 0, GIVE: 0 };
  for (const r of rows) somme[r.jar] = Number(r.somma);
  const dettagli = {
    SAVE: { saldo: saldi.SAVE, somma: somme.SAVE },
    SPEND: { saldo: saldi.SPEND, somma: somme.SPEND },
    GIVE: { saldo: saldi.GIVE, somma: somme.GIVE },
  };
  const ok = (Object.keys(dettagli) as JarType[]).every((j) => dettagli[j].saldo === dettagli[j].somma);
  return { ok, dettagli };
}

export { mapTransaction, conflict };
