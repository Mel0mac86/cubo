/** API della modalita' BAMBINO. */
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { requireAuth, requireChildOfFamily } from '../middleware/auth.js';
import { badRequest } from '../errors.js';
import { getChildState } from '../services/state.js';
import { getChild, updateChild, assertFeatureUnlocked } from '../services/children.js';
import { normalizeSplit, previewSplit, validateSplit } from '../domain/split.js';
import { simulatePurchase } from '../domain/simulator.js';
import { allocatePendingIncome, listPendingIncomes } from '../services/pendingIncome.js';
import { registerPurchase, completeGoal } from '../services/operations.js';
import { createGoal, updateGoal, setPrimaryGoal, deleteGoal, listGoals, getWeeklyRate, getPrimaryGoal } from '../services/goals.js';
import { listHistory } from '../services/history.js';
import { requestJob, listJobRequests, listJobs } from '../services/jobs.js';
import { listDonationGoals, createDonationGoal, updateDonationGoal, listDonations } from '../services/donations.js';
import { listLessons, getLessonForChild, submitQuiz } from '../services/lessons.js';
import { ask, getConversation, SUGGERIMENTI, isAiAvailable } from '../services/coach.js';
import { listNotifications, markNotificationsRead, awardXp } from '../services/gamification.js';
import { getJarBalances, verifyIntegrity } from '../services/ledger.js';
import { HISTORY_FILTERS, DONATION_CAUSES } from '../domain/types.js';

export const childRouter = Router({ mergeParams: true });
childRouter.use(requireAuth, requireChildOfFamily);

const splitSchema = z.object({
  save: z.number().int().min(0).max(100),
  spend: z.number().int().min(0).max(100),
  give: z.number().int().min(0).max(100),
});
const centsSchema = z.number().int().positive().max(100_000_00);

/** Stato completo: tutto quello che serve alla home in un'unica chiamata. */
childRouter.get('/state', async (req, res, next) => {
  try {
    res.json(await getChildState(pool, req.childId!));
  } catch (err) {
    next(err);
  }
});

/** Prima esperienza: nome, avatar, primo obiettivo e divisione iniziale. */
childRouter.post('/onboarding', async (req, res, next) => {
  try {
    const dati = z
      .object({
        name: z.string().min(1).max(40),
        age: z.number().int().min(3).max(21).nullable().optional(),
        avatar: z.string().min(1).max(8).optional(),
        avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        goal: z
          .object({
            name: z.string().min(1).max(60),
            emoji: z.string().min(1).max(8).optional(),
            targetCents: centsSchema,
            targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
            savedAtCreationCents: z.number().int().min(0).max(100_000_00).optional(),
          })
          .optional(),
        split: splitSchema.optional(),
      })
      .parse(req.body);

    const risultato = await withTransaction(async (client) => {
      const bambino = await getChild(client, req.childId!);
      if (dati.split) {
        validateSplit(dati.split, bambino.settings.minGivePercent);
        await client.query(
          `UPDATE settings SET default_save_percent=$2, default_spend_percent=$3, default_give_percent=$4, updated_at=now()
            WHERE child_id=$1`,
          [bambino.id, dati.split.save, dati.split.spend, dati.split.give],
        );
      }
      if (dati.goal) {
        await createGoal(client, bambino.id, { ...dati.goal, makePrimary: true });
      }
      await updateChild(client, bambino.id, {
        name: dati.name,
        age: dati.age ?? undefined,
        avatar: dati.avatar,
        avatarColor: dati.avatarColor,
        onboardingCompleted: true,
      });
      await awardXp(client, bambino.id, 'ONBOARDING_COMPLETATO');
      return getChildState(client, bambino.id);
    });
    res.status(201).json(risultato);
  } catch (err) {
    next(err);
  }
});

childRouter.patch('/profile', async (req, res, next) => {
  try {
    const dati = z
      .object({
        name: z.string().min(1).max(40).optional(),
        avatar: z.string().min(1).max(8).optional(),
        avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        age: z.number().int().min(3).max(21).nullable().optional(),
      })
      .parse(req.body);
    res.json(await updateChild(pool, req.childId!, { ...dati, age: dati.age ?? undefined }));
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ SLIDER
/** Anteprima della divisione: quanti euro finiscono in ogni salvadanaio. */
childRouter.post('/split/preview', async (req, res, next) => {
  try {
    const { amountCents, split, changed } = z
      .object({ amountCents: centsSchema, split: splitSchema, changed: z.enum(['save', 'spend', 'give']).optional() })
      .parse(req.body);
    const bambino = await getChild(pool, req.childId!);
    const normalizzato = normalizeSplit(split, bambino.settings.minGivePercent, changed);
    const valido = normalizzato.save + normalizzato.spend + normalizzato.give === 100 &&
      normalizzato.give >= bambino.settings.minGivePercent;
    res.json({
      split: normalizzato,
      valid: valido,
      minGivePercent: bambino.settings.minGivePercent,
      rows: previewSplit(amountCents, normalizzato),
      totalCents: amountCents,
    });
  } catch (err) {
    next(err);
  }
});

childRouter.get('/pending-incomes', async (req, res, next) => {
  try {
    res.json(await listPendingIncomes(pool, req.childId!));
  } catch (err) {
    next(err);
  }
});

/** Il bambino conferma come dividere una nuova entrata. */
childRouter.post('/pending-incomes/:pendingId/allocate', async (req, res, next) => {
  try {
    const { split, clientId } = z.object({ split: splitSchema, clientId: z.string().max(80).optional() }).parse(req.body);
    const risultato = await withTransaction(async (client) => {
      const esito = await allocatePendingIncome(client, req.childId!, String(req.params.pendingId), split, clientId);
      return { ...esito, state: await getChildState(client, req.childId!) };
    });
    res.status(201).json(risultato);
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------- SIMULATORE
/** Simulatore delle scelte: mostra l'impatto di un acquisto sull'obiettivo. */
childRouter.post('/simulate', async (req, res, next) => {
  try {
    const { amountCents, jar, label } = z
      .object({ amountCents: centsSchema, jar: z.enum(['SPEND', 'SAVE']).default('SPEND'), label: z.string().max(60).optional() })
      .parse(req.body);
    const [saldi, rate, goal] = await Promise.all([
      getJarBalances(pool, req.childId!),
      getWeeklyRate(pool, req.childId!),
      getPrimaryGoal(pool, req.childId!),
    ]);
    res.json(
      simulatePurchase({
        amountCents,
        jar,
        jarBalanceCents: saldi[jar],
        goal: goal ? { name: goal.name, emoji: goal.emoji, targetCents: goal.targetCents, savedCents: goal.progress.savedCents } : null,
        rate,
        label,
      }),
    );
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ SPESE
childRouter.post('/purchases', async (req, res, next) => {
  try {
    const dati = z
      .object({
        amountCents: centsSchema,
        description: z.string().min(1).max(80),
        jar: z.enum(['SPEND', 'SAVE']).default('SPEND'),
        emoji: z.string().max(8).optional(),
        clientId: z.string().max(80).optional(),
        simulated: z.boolean().optional(),
        occurredAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    const risultato = await withTransaction(async (client) => {
      const bambino = await getChild(client, req.childId!);
      assertFeatureUnlocked(bambino.settings, 'SPESE');
      const esito = await registerPurchase(client, req.childId!, {
        ...dati,
        occurredAt: dati.occurredAt ? new Date(dati.occurredAt) : undefined,
      });
      return { ...esito, state: await getChildState(client, req.childId!) };
    });
    res.status(201).json(risultato);
  } catch (err) {
    next(err);
  }
});

childRouter.get('/history', async (req, res, next) => {
  try {
    const filtro = String(req.query.filter ?? 'TUTTO').toUpperCase();
    if (!HISTORY_FILTERS.includes(filtro as never)) throw badRequest('Filtro non valido.');
    res.json(
      await listHistory(pool, req.childId!, {
        filter: filtro as never,
        limit: Number(req.query.limit ?? 50),
        offset: Number(req.query.offset ?? 0),
      }),
    );
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------- OBIETTIVI
childRouter.get('/goals', async (req, res, next) => {
  try {
    res.json(await listGoals(pool, req.childId!, { includeArchived: req.query.all === '1' }));
  } catch (err) {
    next(err);
  }
});

const goalSchema = z.object({
  name: z.string().min(1).max(60),
  emoji: z.string().min(1).max(8).optional(),
  imageUrl: z.string().max(2_000_000).nullable().optional(),
  targetCents: centsSchema,
  savedAtCreationCents: z.number().int().min(0).max(100_000_00).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  makePrimary: z.boolean().optional(),
});

childRouter.post('/goals', async (req, res, next) => {
  try {
    const dati = goalSchema.parse(req.body);
    const goal = await withTransaction(async (client) => {
      const bambino = await getChild(client, req.childId!);
      assertFeatureUnlocked(bambino.settings, 'OBIETTIVI');
      return createGoal(client, req.childId!, dati);
    });
    res.status(201).json(goal);
  } catch (err) {
    next(err);
  }
});

childRouter.patch('/goals/:goalId', async (req, res, next) => {
  try {
    const dati = goalSchema.partial().parse(req.body);
    const goal = await withTransaction((client) => updateGoal(client, req.childId!, String(req.params.goalId), dati));
    res.json(goal);
  } catch (err) {
    next(err);
  }
});

childRouter.post('/goals/:goalId/primary', async (req, res, next) => {
  try {
    res.json(await withTransaction((client) => setPrimaryGoal(client, req.childId!, String(req.params.goalId))));
  } catch (err) {
    next(err);
  }
});

childRouter.post('/goals/:goalId/complete', async (req, res, next) => {
  try {
    const risultato = await withTransaction(async (client) => {
      const esito = await completeGoal(client, req.childId!, String(req.params.goalId));
      return { ...esito, state: await getChildState(client, req.childId!) };
    });
    res.json(risultato);
  } catch (err) {
    next(err);
  }
});

childRouter.delete('/goals/:goalId', async (req, res, next) => {
  try {
    await withTransaction((client) => deleteGoal(client, req.childId!, String(req.params.goalId)));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------- LAVORI
childRouter.get('/jobs', async (req, res, next) => {
  try {
    const bambino = await getChild(pool, req.childId!);
    res.json(await listJobs(pool, bambino.familyId, { soloAttivi: true }));
  } catch (err) {
    next(err);
  }
});

childRouter.get('/job-requests', async (req, res, next) => {
  try {
    res.json(await listJobRequests(pool, { childId: req.childId! }));
  } catch (err) {
    next(err);
  }
});

childRouter.post('/jobs/:jobId/request', async (req, res, next) => {
  try {
    const { note } = z.object({ note: z.string().max(200).optional() }).parse(req.body ?? {});
    const richiesta = await withTransaction(async (client) => {
      const bambino = await getChild(client, req.childId!);
      assertFeatureUnlocked(bambino.settings, 'LAVORI');
      return requestJob(client, req.childId!, String(req.params.jobId), note);
    });
    res.status(201).json(richiesta);
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------- DONAZIONI
childRouter.get('/donation-goals', async (req, res, next) => {
  try {
    res.json({
      goals: await listDonationGoals(pool, req.childId!),
      donations: await listDonations(pool, req.childId!),
      causes: DONATION_CAUSES,
    });
  } catch (err) {
    next(err);
  }
});

childRouter.post('/donation-goals', async (req, res, next) => {
  try {
    const dati = z
      .object({
        title: z.string().min(1).max(60),
        cause: z.enum(DONATION_CAUSES),
        targetCents: centsSchema,
        note: z.string().max(300).nullable().optional(),
        photoUrl: z.string().max(2_000_000).nullable().optional(),
      })
      .parse(req.body);
    const bambino = await getChild(pool, req.childId!);
    assertFeatureUnlocked(bambino.settings, 'DONAZIONI');
    res.status(201).json(await createDonationGoal(pool, req.childId!, dati));
  } catch (err) {
    next(err);
  }
});

childRouter.patch('/donation-goals/:goalId', async (req, res, next) => {
  try {
    const dati = z
      .object({
        title: z.string().min(1).max(60).optional(),
        cause: z.enum(DONATION_CAUSES).optional(),
        targetCents: centsSchema.optional(),
        note: z.string().max(300).nullable().optional(),
        photoUrl: z.string().max(2_000_000).nullable().optional(),
      })
      .parse(req.body);
    res.json(await updateDonationGoal(pool, req.childId!, String(req.params.goalId), dati));
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------- LEZIONI
childRouter.get('/lessons', async (req, res, next) => {
  try {
    res.json(await listLessons(pool, req.childId!));
  } catch (err) {
    next(err);
  }
});

childRouter.get('/lessons/:lessonId', async (req, res, next) => {
  try {
    res.json(getLessonForChild(String(req.params.lessonId)));
  } catch (err) {
    next(err);
  }
});

childRouter.post('/lessons/:lessonId/quiz', async (req, res, next) => {
  try {
    const { answers } = z
      .object({ answers: z.array(z.object({ id: z.string().max(20), answerIndex: z.number().int().min(0).max(9) })) })
      .parse(req.body);
    const risultato = await withTransaction(async (client) => {
      const esito = await submitQuiz(client, req.childId!, String(req.params.lessonId), answers);
      return { ...esito, state: await getChildState(client, req.childId!) };
    });
    res.json(risultato);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------- MONEY COACH
childRouter.get('/coach', async (req, res, next) => {
  try {
    res.json({
      messages: await getConversation(pool, req.childId!),
      suggestions: SUGGERIMENTI,
      aiEnabled: isAiAvailable(),
    });
  } catch (err) {
    next(err);
  }
});

childRouter.post('/coach', async (req, res, next) => {
  try {
    const { question } = z.object({ question: z.string().min(1).max(300) }).parse(req.body);
    const risposta = await withTransaction(async (client) => {
      const bambino = await getChild(client, req.childId!);
      assertFeatureUnlocked(bambino.settings, 'COACH');
      return ask(client, req.childId!, question);
    });
    res.json(risposta);
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------- NOTIFICHE
childRouter.get('/notifications', async (req, res, next) => {
  try {
    res.json(await listNotifications(pool, req.childId!, Number(req.query.limit ?? 20)));
  } catch (err) {
    next(err);
  }
});

childRouter.post('/notifications/read', async (req, res, next) => {
  try {
    await markNotificationsRead(pool, req.childId!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/** Verifica di integrita' contabile (usata dai test e dalla dashboard genitore). */
childRouter.get('/integrity', async (req, res, next) => {
  try {
    res.json(await verifyIntegrity(pool, req.childId!));
  } catch (err) {
    next(err);
  }
});
