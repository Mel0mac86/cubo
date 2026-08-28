/**
 * STATO COMPLETO DEL BAMBINO.
 * Un'unica risposta con tutto quello che serve alla home: cosi' la PWA
 * puo' salvarla in locale e restare utilizzabile anche senza connessione.
 */
import type { Db } from '../db/pool.js';
import { levelFromXp } from '../domain/xp.js';
import { projectCompound, computeMonthlyInterest, periodKey } from '../domain/interest.js';
import { formatCents } from '../domain/money.js';
import { weeklyFromAllowance } from '../domain/goals.js';
import { getChild } from './children.js';
import { getJarBalances, totalBalance } from './ledger.js';
import { getWeeklyRate, listGoals } from './goals.js';
import { listHistory } from './history.js';
import { listJobs, listJobRequests } from './jobs.js';
import { listDonationGoals, listDonations, getTotalDonated, messaggioGive, CAUSE_INFO } from './donations.js';
import { listAchievements, listNotifications, computeSavingStreak } from './gamification.js';
import { listLessons } from './lessons.js';
import { listPendingIncomes } from './pendingIncome.js';

export async function getChildState(db: Db, childId: string, now = new Date()) {
  const child = await getChild(db, childId);
  // Le query sono sequenziali di proposito: questa funzione viene chiamata anche
  // con un client dentro una transazione, e un client pg non accetta query in
  // parallelo (interleaving). Su un database locale sono comunque pochi ms.
  const saldi = await getJarBalances(db, childId);
  const rate = await getWeeklyRate(db, childId, now);
  const goals = await listGoals(db, childId, { rate, now });
  const storico = await listHistory(db, childId, { limit: 50 });
  const lavori = await listJobs(db, child.familyId, { soloAttivi: true });
  const richieste = await listJobRequests(db, { childId });
  const obiettiviGive = await listDonationGoals(db, childId);
  const donazioni = await listDonations(db, childId);
  const totaleDonato = await getTotalDonated(db, childId);
  const badge = await listAchievements(db, childId);
  const notifiche = await listNotifications(db, childId, 15);
  const lezioni = await listLessons(db, childId);
  const streak = await computeSavingStreak(db, childId, now);
  const entrateInAttesa = await listPendingIncomes(db, childId);

  const obiettivoPrincipale = goals.find((g) => g.isPrimary && g.status === 'ACTIVE') ?? goals.find((g) => g.status === 'ACTIVE') ?? null;

  const { rows: interessi } = await db.query(
    `SELECT period_key, base_cents, interest_cents, created_at FROM interest_accruals
      WHERE child_id = $1 ORDER BY created_at DESC LIMIT 6`,
    [childId],
  );
  const periodoCorrente = periodKey(now);
  const anteprimaInteresse = computeMonthlyInterest(saldi.SAVE, child.settings.interestCentsPerEuro);

  const ultimeSpese = storico.items.filter((i) => i.type === 'PURCHASE').slice(0, 5);

  return {
    generatedAt: now.toISOString(),
    child: {
      id: child.id,
      familyId: child.familyId,
      name: child.name,
      age: child.age,
      avatar: child.avatar,
      avatarColor: child.avatarColor,
      xp: child.xp,
      onboardingCompleted: child.onboardingCompleted,
      settings: child.settings,
      level: levelFromXp(child.xp),
    },
    jars: {
      SAVE: saldi.SAVE,
      SPEND: saldi.SPEND,
      GIVE: saldi.GIVE,
      totalCents: totalBalance(saldi),
      labels: {
        SAVE: formatCents(saldi.SAVE),
        SPEND: formatCents(saldi.SPEND),
        GIVE: formatCents(saldi.GIVE),
        total: formatCents(totalBalance(saldi)),
      },
    },
    rate,
    pendingIncomes: entrateInAttesa,
    goals,
    primaryGoal: obiettivoPrincipale,
    history: storico.items,
    historyTotal: storico.total,
    recentPurchases: ultimeSpese,
    jobs: lavori,
    jobRequests: richieste,
    pendingJobRequests: richieste.filter((r) => r.status === 'PENDING').length,
    give: {
      totalDonatedCents: totaleDonato,
      donationGoals: obiettiviGive,
      donations: donazioni,
      causes: Object.entries(CAUSE_INFO).map(([id, info]) => ({ id, ...info })),
      message: messaggioGive(totaleDonato, saldi.GIVE),
      minPercent: child.settings.minGivePercent,
    },
    interest: {
      enabled: child.settings.interestEnabled,
      centsPerEuro: child.settings.interestCentsPerEuro,
      currentPeriod: periodoCorrente,
      alreadyAccruedThisPeriod: interessi.some((i) => i.period_key === periodoCorrente),
      preview: anteprimaInteresse,
      history: interessi.map((i) => ({
        period: i.period_key,
        baseCents: i.base_cents,
        interestCents: i.interest_cents,
        createdAt: new Date(i.created_at).toISOString(),
      })),
      projection: projectCompound(saldi.SAVE, child.settings.interestCentsPerEuro, 4),
    },
    achievements: badge,
    notifications: notifiche,
    unreadNotifications: notifiche.filter((n) => !n.readAt).length,
    lessons: lezioni,
    streak,
    expectedWeeklySaveCents: weeklyFromAllowance(
      child.settings.allowanceCents,
      child.settings.defaultSplit.save,
      child.settings.defaultSplit.spend,
      child.settings.defaultSplit.give,
    ),
  };
}

export type ChildState = Awaited<ReturnType<typeof getChildState>>;
