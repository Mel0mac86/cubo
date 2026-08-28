/** Obiettivi di beneficenza e storico delle donazioni. */
import type { Db } from '../db/pool.js';
import { badRequest, notFound } from '../errors.js';
import { DONATION_CAUSES, type DonationCause, type DonationGoal } from '../domain/types.js';
import type { Cents } from '../domain/money.js';

export const CAUSE_INFO: Record<DonationCause, { emoji: string; label: string; esempio: string }> = {
  ANIMALI: { emoji: '🐶', label: 'Animali', esempio: 'Rifugio per cani e gatti' },
  AMBIENTE: { emoji: '🌳', label: 'Ambiente', esempio: 'Piantare alberi' },
  PERSONE: { emoji: '❤️', label: 'Persone', esempio: 'Mensa solidale' },
  ISTRUZIONE: { emoji: '🏫', label: 'Istruzione', esempio: 'Libri per chi non può comprarli' },
  EMERGENZE: { emoji: '🌍', label: 'Emergenze', esempio: 'Aiuti dopo un terremoto' },
};

function mapDonationGoal(row: Record<string, any>): DonationGoal & { progressPercent: number; remainingCents: Cents } {
  const target = row.target_cents as number;
  const donato = row.donated_cents as number;
  return {
    id: row.id,
    childId: row.child_id,
    title: row.title,
    cause: row.cause,
    targetCents: target,
    donatedCents: donato,
    status: row.status,
    note: row.note,
    photoUrl: row.photo_url,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    progressPercent: target > 0 ? Math.round(Math.min(100, (donato * 100) / target) * 10) / 10 : 0,
    remainingCents: Math.max(0, target - donato),
  };
}

export async function listDonationGoals(db: Db, childId: string) {
  const { rows } = await db.query(
    `SELECT * FROM donation_goals WHERE child_id = $1 ORDER BY status, created_at DESC`,
    [childId],
  );
  return rows.map(mapDonationGoal);
}

export async function createDonationGoal(
  db: Db,
  childId: string,
  input: { title: string; cause: DonationCause; targetCents: Cents; note?: string | null; photoUrl?: string | null },
) {
  const titolo = input.title?.trim();
  if (!titolo) throw badRequest('Scrivi chi vuoi aiutare.');
  if (!DONATION_CAUSES.includes(input.cause)) throw badRequest('Scegli una causa valida.');
  if (!Number.isInteger(input.targetCents) || input.targetCents <= 0) throw badRequest('L’importo deve essere maggiore di zero.');
  const { rows } = await db.query(
    `INSERT INTO donation_goals (child_id, title, cause, target_cents, note, photo_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [childId, titolo, input.cause, input.targetCents, input.note ?? null, input.photoUrl ?? null],
  );
  return mapDonationGoal(rows[0]);
}

export async function updateDonationGoal(
  db: Db,
  childId: string,
  goalId: string,
  input: { title?: string; cause?: DonationCause; targetCents?: Cents; note?: string | null; photoUrl?: string | null },
) {
  const { rows } = await db.query(
    `UPDATE donation_goals SET
       title = COALESCE($3, title), cause = COALESCE($4, cause),
       target_cents = COALESCE($5, target_cents), note = COALESCE($6, note), photo_url = COALESCE($7, photo_url)
     WHERE id = $1 AND child_id = $2 RETURNING *`,
    [goalId, childId, input.title?.trim() ?? null, input.cause ?? null, input.targetCents ?? null, input.note ?? null, input.photoUrl ?? null],
  );
  if (rows.length === 0) throw notFound('Obiettivo di donazione non trovato.');
  return mapDonationGoal(rows[0]);
}

export async function listDonations(db: Db, childId: string) {
  const { rows } = await db.query(
    `SELECT d.*, g.title AS goal_title FROM donations d
       LEFT JOIN donation_goals g ON g.id = d.donation_goal_id
      WHERE d.child_id = $1 ORDER BY d.created_at DESC LIMIT 50`,
    [childId],
  );
  return rows.map((r) => ({
    id: r.id,
    amountCents: r.amount_cents,
    cause: r.cause as DonationCause,
    causeLabel: CAUSE_INFO[r.cause as DonationCause]?.label ?? r.cause,
    causeEmoji: CAUSE_INFO[r.cause as DonationCause]?.emoji ?? '❤️',
    note: r.note,
    photoUrl: r.photo_url,
    goalTitle: r.goal_title,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** Totale donato da sempre: e' il numero che il bambino vede crescere nel salvadanaio GIVE. */
export async function getTotalDonated(db: Db, childId: string): Promise<Cents> {
  const { rows } = await db.query(`SELECT COALESCE(SUM(amount_cents),0) AS totale FROM donations WHERE child_id = $1`, [childId]);
  return Number(rows[0].totale);
}

/** Messaggi motivazionali per la sezione GIVE (mai colpevolizzanti). */
export function messaggioGive(totaleDonatoCents: Cents, saldoGiveCents: Cents): string {
  if (totaleDonatoCents === 0 && saldoGiveCents === 0) return 'Il salvadanaio GIVE si riempie da solo ogni volta che arrivano dei soldi. 🌱';
  if (totaleDonatoCents === 0) return 'Hai già qualcosa da parte per aiutare. A chi ti piacerebbe darlo? 💛';
  if (totaleDonatoCents < 500) return 'Hai fatto la tua prima donazione: per qualcuno è stata una giornata migliore. ❤️';
  if (totaleDonatoCents < 2000) return 'Stai diventando davvero generoso. Continua così! 🌟';
  return 'Il tuo salvadanaio GIVE ha aiutato tante volte. Sei un campione di generosità! 🏆';
}
