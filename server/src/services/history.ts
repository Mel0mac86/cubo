/** STORICO — elenco filtrabile e leggibile dei movimenti. */
import type { Db } from '../db/pool.js';
import type { HistoryFilter, JarType, TransactionType } from '../domain/types.js';
import { formatCents } from '../domain/money.js';
import { FILTRI_STORICO, ICONE_TIPO, ETICHETTE_TIPO } from '../domain/etichette.js';

export { ICONE_TIPO, ETICHETTE_TIPO };

export interface HistoryItem {
  id: string;
  occurredAt: string;
  type: TransactionType;
  typeLabel: string;
  emoji: string;
  jar: JarType;
  amountCents: number;
  amountLabel: string;
  balanceAfterCents: number;
  description: string;
  source: string;
  groupId: string | null;
}

export async function listHistory(
  db: Db,
  childId: string,
  opts: { filter?: HistoryFilter; limit?: number; offset?: number } = {},
): Promise<{ items: HistoryItem[]; total: number }> {
  const filtro = FILTRI_STORICO[opts.filter ?? 'TUTTO'] ?? {};
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);

  const where = ['child_id = $1'];
  const params: unknown[] = [childId];
  if (filtro.tipi) { params.push(filtro.tipi); where.push(`type = ANY($${params.length})`); }
  if (filtro.jar) { params.push(filtro.jar); where.push(`jar = $${params.length}`); }
  if (filtro.direzione === 'IN') where.push('amount_cents > 0');
  if (filtro.direzione === 'OUT') where.push('amount_cents < 0');

  const clausola = where.join(' AND ');
  const { rows: conteggio } = await db.query(`SELECT COUNT(*)::int AS n FROM transactions WHERE ${clausola}`, params);
  const { rows } = await db.query(
    `SELECT * FROM transactions WHERE ${clausola} ORDER BY occurred_at DESC, created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  return {
    total: conteggio[0].n,
    items: rows.map((r) => ({
      id: r.id,
      occurredAt: new Date(r.occurred_at).toISOString(),
      type: r.type,
      typeLabel: ETICHETTE_TIPO[r.type as TransactionType],
      emoji: (r.metadata?.emoji as string) || ICONE_TIPO[r.type as TransactionType],
      jar: r.jar,
      amountCents: r.amount_cents,
      amountLabel: `${r.amount_cents > 0 ? '+' : '−'}${formatCents(Math.abs(r.amount_cents))}`,
      balanceAfterCents: r.balance_after_cents,
      description: r.description,
      source: r.source,
      groupId: r.group_id,
    })),
  };
}

/** Statistiche per la dashboard del genitore. */
export async function getStats(db: Db, childId: string) {
  const { rows: perTipo } = await db.query(
    `SELECT type, SUM(amount_cents) FILTER (WHERE amount_cents > 0)::bigint AS entrate,
            SUM(-amount_cents) FILTER (WHERE amount_cents < 0)::bigint AS uscite,
            COUNT(*)::int AS movimenti
       FROM transactions WHERE child_id = $1 GROUP BY type`,
    [childId],
  );
  const { rows: perJar } = await db.query(
    `SELECT jar, SUM(amount_cents) FILTER (WHERE amount_cents > 0)::bigint AS entrate,
            SUM(-amount_cents) FILTER (WHERE amount_cents < 0)::bigint AS uscite
       FROM transactions WHERE child_id = $1 GROUP BY jar`,
    [childId],
  );
  const { rows: distribuzione } = await db.query(
    `SELECT ROUND(AVG(save_percent))::int AS save, ROUND(AVG(spend_percent))::int AS spend,
            ROUND(AVG(give_percent))::int AS give, COUNT(*)::int AS scelte
       FROM allocation_choices WHERE child_id = $1`,
    [childId],
  );
  const { rows: ultimeSettimane } = await db.query(
    `SELECT to_char(date_trunc('week', occurred_at), 'YYYY-MM-DD') AS settimana,
            SUM(amount_cents) FILTER (WHERE jar = 'SAVE' AND amount_cents > 0)::bigint AS risparmiato,
            SUM(-amount_cents) FILTER (WHERE amount_cents < 0 AND type = 'PURCHASE')::bigint AS speso
       FROM transactions
      WHERE child_id = $1 AND occurred_at >= now() - interval '12 weeks'
      GROUP BY 1 ORDER BY 1`,
    [childId],
  );

  return {
    perTipo: perTipo.map((r) => ({
      type: r.type,
      label: ETICHETTE_TIPO[r.type as TransactionType],
      entrateCents: Number(r.entrate ?? 0),
      usciteCents: Number(r.uscite ?? 0),
      movimenti: r.movimenti,
    })),
    perJar: perJar.map((r) => ({ jar: r.jar, entrateCents: Number(r.entrate ?? 0), usciteCents: Number(r.uscite ?? 0) })),
    distribuzioneMedia: distribuzione[0]?.scelte
      ? { save: distribuzione[0].save, spend: distribuzione[0].spend, give: distribuzione[0].give, scelte: distribuzione[0].scelte }
      : null,
    settimane: ultimeSettimane.map((r) => ({
      settimana: r.settimana,
      risparmiatoCents: Number(r.risparmiato ?? 0),
      spesoCents: Number(r.speso ?? 0),
    })),
  };
}
