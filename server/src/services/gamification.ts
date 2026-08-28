/**
 * XP, livelli, badge e notifiche educative.
 * Le notifiche sono sempre positive e non insistenti (punto 13 del capitolato).
 */
import type { PoolClient } from 'pg';
import type { Db } from '../db/pool.js';
import { XP_RULES, levelFromXp, type XpReason, type LevelState } from '../domain/xp.js';
import type { Notification } from '../domain/types.js';

export interface XpResult {
  reason: XpReason;
  amount: number;
  xpBefore: number;
  xpAfter: number;
  levelBefore: LevelState;
  levelAfter: LevelState;
  levelUp: boolean;
}

/** Assegna XP e aggiorna il livello. Restituisce anche se c'e' stato un level-up. */
export async function awardXp(
  client: PoolClient,
  childId: string,
  reason: XpReason,
  options: { amount?: number; metadata?: Record<string, unknown> } = {},
): Promise<XpResult> {
  const amount = Math.max(0, Math.round(options.amount ?? XP_RULES[reason]));
  const { rows: prima } = await client.query(`SELECT xp FROM children WHERE id = $1 FOR UPDATE`, [childId]);
  const xpBefore = prima[0]?.xp ?? 0;
  const xpAfter = xpBefore + amount;

  if (amount > 0) {
    await client.query(`UPDATE children SET xp = $1 WHERE id = $2`, [xpAfter, childId]);
    await client.query(`INSERT INTO xp_events (child_id, reason, amount, metadata) VALUES ($1,$2,$3,$4)`, [
      childId,
      reason,
      amount,
      JSON.stringify(options.metadata ?? {}),
    ]);
  }

  const levelBefore = levelFromXp(xpBefore);
  const levelAfter = levelFromXp(xpAfter);
  const levelUp = levelAfter.level > levelBefore.level;

  if (levelUp) {
    await notify(client, childId, 'LIVELLO', '🏆', `Nuovo livello: ${levelAfter.emoji} ${levelAfter.name}!`);
    await unlockAchievement(client, childId, `LIVELLO_${levelAfter.level}`, `${levelAfter.name}`, levelAfter.emoji);
  }

  return { reason, amount, xpBefore, xpAfter, levelBefore, levelAfter, levelUp };
}

/** Sblocca un badge (una sola volta per bambino). */
export async function unlockAchievement(
  client: PoolClient,
  childId: string,
  code: string,
  title: string,
  emoji: string,
): Promise<boolean> {
  const { rowCount } = await client.query(
    `INSERT INTO achievements (child_id, code, title, emoji)
     VALUES ($1,$2,$3,$4) ON CONFLICT (child_id, code) DO NOTHING`,
    [childId, code, title, emoji],
  );
  return (rowCount ?? 0) > 0;
}

export type NotificationKind = Notification['kind'];

/** Crea una notifica educativa. */
export async function notify(
  client: PoolClient,
  childId: string,
  kind: NotificationKind,
  emoji: string,
  message: string,
): Promise<void> {
  await client.query(`INSERT INTO notifications (child_id, kind, emoji, message) VALUES ($1,$2,$3,$4)`, [
    childId,
    kind,
    emoji,
    message,
  ]);
}

export async function listNotifications(db: Db, childId: string, limit = 20): Promise<Notification[]> {
  const { rows } = await db.query(
    `SELECT * FROM notifications WHERE child_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [childId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    childId: r.child_id,
    kind: r.kind,
    emoji: r.emoji,
    message: r.message,
    createdAt: new Date(r.created_at).toISOString(),
    readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
  }));
}

export async function markNotificationsRead(db: Db, childId: string): Promise<void> {
  await db.query(`UPDATE notifications SET read_at = now() WHERE child_id = $1 AND read_at IS NULL`, [childId]);
}

export async function listAchievements(db: Db, childId: string) {
  const { rows } = await db.query(
    `SELECT id, code, title, emoji, unlocked_at FROM achievements WHERE child_id = $1 ORDER BY unlocked_at DESC`,
    [childId],
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    emoji: r.emoji,
    unlockedAt: new Date(r.unlocked_at).toISOString(),
  }));
}

/**
 * Costanza: quante settimane consecutive (compresa quella corrente) hanno
 * almeno un versamento in SAVE. E' il dato che alimenta il badge "Costanza".
 */
export async function computeSavingStreak(db: Db, childId: string, now = new Date()): Promise<number> {
  const { rows } = await db.query(
    `SELECT DISTINCT date_trunc('week', occurred_at) AS settimana
       FROM transactions
      WHERE child_id = $1 AND jar = 'SAVE' AND amount_cents > 0
      ORDER BY settimana DESC
      LIMIT 60`,
    [childId],
  );
  if (rows.length === 0) return 0;
  const MS_SETTIMANA = 7 * 86_400_000;
  const inizioSettimana = (d: Date) => {
    const x = new Date(d);
    const giorno = (x.getDay() + 6) % 7; // lunedi' = 0, come date_trunc('week')
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - giorno);
    return x.getTime();
  };
  const settimane = rows.map((r) => inizioSettimana(new Date(r.settimana)));
  let atteso = inizioSettimana(now);
  // la settimana corrente puo' non avere ancora versamenti: si parte dalla precedente
  if (settimane[0] !== atteso) atteso -= MS_SETTIMANA;
  let streak = 0;
  for (const s of settimane) {
    if (s === atteso) {
      streak += 1;
      atteso -= MS_SETTIMANA;
    } else if (s < atteso) {
      break;
    }
  }
  return streak;
}
