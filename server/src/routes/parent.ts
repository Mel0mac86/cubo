/** API della MODALITA' GENITORE (richiede token sbloccato con PIN). */
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { requireAuth, requireParent, requireChildOfFamily } from '../middleware/auth.js';
import { badRequest } from '../errors.js';
import { createChild } from '../services/family.js';
import { listChildrenOfFamily, updateSettings, getChild } from '../services/children.js';
import { createPendingIncome, cancelPendingIncome, listPendingIncomes } from '../services/pendingIncome.js';
import { addIncome, accrueInterest, transferBetweenJars, makeDonation } from '../services/operations.js';
import { createJob, updateJob, listJobs, listJobRequests, approveJobRequest, rejectJobRequest } from '../services/jobs.js';
import { getStats } from '../services/history.js';
import { getChildState } from '../services/state.js';
import { verifyIntegrity } from '../services/ledger.js';
import { projectCompound, compareSimpleVsCompound } from '../domain/interest.js';
import { DONATION_CAUSES } from '../domain/types.js';

export const parentRouter = Router();
parentRouter.use(requireAuth, requireParent);

const centsSchema = z.number().int().positive().max(100_000_00);
const splitSchema = z.object({
  save: z.number().int().min(0).max(100),
  spend: z.number().int().min(0).max(100),
  give: z.number().int().min(0).max(100),
});

parentRouter.get('/children', async (req, res, next) => {
  try {
    res.json(await listChildrenOfFamily(pool, req.auth!.familyId));
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/children', async (req, res, next) => {
  try {
    const dati = z
      .object({
        name: z.string().min(1).max(40),
        age: z.number().int().min(3).max(21).nullable().optional(),
        avatar: z.string().min(1).max(8).optional(),
        avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        allowanceCents: z.number().int().min(0).max(100_000_00).optional(),
        minGivePercent: z.number().int().min(0).max(100).optional(),
        split: splitSchema.optional(),
      })
      .parse(req.body);
    const bambino = await withTransaction((client) =>
      createChild(client, req.auth!.familyId, { ...dati, age: dati.age ?? null }),
    );
    res.status(201).json(bambino);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- DENARO
/**
 * Inserimento di una nuova entrata.
 *  - mode "ASK_CHILD" (predefinito): l'entrata resta in attesa e sara' il bambino
 *    a scegliere la divisione con gli slider;
 *  - mode "AUTO": si applica subito la divisione indicata (o quella predefinita).
 */
parentRouter.post('/children/:childId/income', requireChildOfFamily, async (req, res, next) => {
  try {
    const dati = z
      .object({
        amountCents: centsSchema,
        description: z.string().max(80).optional(),
        type: z.enum(['ALLOWANCE', 'GIFT', 'ADJUSTMENT']).default('ALLOWANCE'),
        mode: z.enum(['ASK_CHILD', 'AUTO']).default('ASK_CHILD'),
        split: splitSchema.optional(),
      })
      .parse(req.body);

    const risultato = await withTransaction(async (client) => {
      if (dati.mode === 'ASK_CHILD') {
        const pending = await createPendingIncome(client, req.childId!, {
          amountCents: dati.amountCents,
          type: dati.type,
          description: dati.description,
          createdByUserId: req.auth!.userId,
        });
        return { pending, state: await getChildState(client, req.childId!) };
      }
      const bambino = await getChild(client, req.childId!);
      const esito = await addIncome(client, req.childId!, {
        amountCents: dati.amountCents,
        split: dati.split ?? bambino.settings.defaultSplit,
        type: dati.type,
        description: dati.description,
        source: 'genitore',
        createdByUserId: req.auth!.userId,
      });
      return { ...esito, state: await getChildState(client, req.childId!) };
    });
    res.status(201).json(risultato);
  } catch (err) {
    next(err);
  }
});

parentRouter.get('/children/:childId/pending-incomes', requireChildOfFamily, async (req, res, next) => {
  try {
    res.json(await listPendingIncomes(pool, req.childId!));
  } catch (err) {
    next(err);
  }
});

parentRouter.delete('/children/:childId/pending-incomes/:pendingId', requireChildOfFamily, async (req, res, next) => {
  try {
    await withTransaction((client) => cancelPendingIncome(client, req.childId!, String(req.params.pendingId)));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/children/:childId/transfer', requireChildOfFamily, async (req, res, next) => {
  try {
    const dati = z
      .object({
        from: z.enum(['SAVE', 'SPEND', 'GIVE']),
        to: z.enum(['SAVE', 'SPEND', 'GIVE']),
        amountCents: centsSchema,
        reason: z.string().max(80).optional(),
      })
      .parse(req.body);
    const risultato = await withTransaction(async (client) => {
      const esito = await transferBetweenJars(client, req.childId!, { ...dati, createdByUserId: req.auth!.userId });
      return { ...esito, state: await getChildState(client, req.childId!) };
    });
    res.status(201).json(risultato);
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------- INTERESSE
parentRouter.post('/children/:childId/interest', requireChildOfFamily, async (req, res, next) => {
  try {
    const { force } = z.object({ force: z.boolean().optional() }).parse(req.body ?? {});
    const risultato = await withTransaction(async (client) => {
      const esito = await accrueInterest(client, req.childId!, { createdByUserId: req.auth!.userId, force });
      return { ...esito, state: await getChildState(client, req.childId!) };
    });
    res.status(201).json(risultato);
  } catch (err) {
    next(err);
  }
});

parentRouter.get('/children/:childId/interest/projection', requireChildOfFamily, async (req, res, next) => {
  try {
    const mesi = Math.min(60, Math.max(1, Number(req.query.months ?? 12)));
    const stato = await getChildState(pool, req.childId!);
    res.json({
      steps: projectCompound(stato.jars.SAVE, stato.child.settings.interestCentsPerEuro, mesi, Number(req.query.monthlyDepositCents ?? 0)),
      confronto: compareSimpleVsCompound(stato.jars.SAVE, stato.child.settings.interestCentsPerEuro, mesi),
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------- IMPOSTAZIONI
parentRouter.patch('/children/:childId/settings', requireChildOfFamily, async (req, res, next) => {
  try {
    const dati = z
      .object({
        minGivePercent: z.number().int().min(0).max(100).optional(),
        defaultSplit: splitSchema.optional(),
        interestCentsPerEuro: z.number().int().min(0).max(100).optional(),
        interestEnabled: z.boolean().optional(),
        allowanceCents: z.number().int().min(0).max(100_000_00).optional(),
        allowanceDay: z.number().int().min(0).max(6).optional(),
        lockedFeatures: z.array(z.enum(['SPESE', 'LAVORI', 'DONAZIONI', 'OBIETTIVI', 'COACH'])).optional(),
        soundEnabled: z.boolean().optional(),
      })
      .parse(req.body);
    res.json(await updateSettings(pool, req.childId!, dati));
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------- LAVORI
parentRouter.get('/jobs', async (req, res, next) => {
  try {
    res.json(await listJobs(pool, req.auth!.familyId));
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/jobs', async (req, res, next) => {
  try {
    const dati = z
      .object({
        title: z.string().min(1).max(60),
        emoji: z.string().max(8).optional(),
        rewardCents: centsSchema,
        description: z.string().max(200).nullable().optional(),
      })
      .parse(req.body);
    res.status(201).json(await createJob(pool, req.auth!.familyId, dati));
  } catch (err) {
    next(err);
  }
});

parentRouter.patch('/jobs/:jobId', async (req, res, next) => {
  try {
    const dati = z
      .object({
        title: z.string().min(1).max(60).optional(),
        emoji: z.string().max(8).optional(),
        rewardCents: centsSchema.optional(),
        description: z.string().max(200).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    res.json(await updateJob(pool, req.auth!.familyId, String(req.params.jobId), dati));
  } catch (err) {
    next(err);
  }
});

parentRouter.get('/job-requests', async (req, res, next) => {
  try {
    const stato = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    if (stato && !['PENDING', 'APPROVED', 'REJECTED'].includes(stato)) throw badRequest('Stato non valido.');
    res.json(await listJobRequests(pool, { familyId: req.auth!.familyId, status: stato as never }));
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/job-requests/:requestId/approve', async (req, res, next) => {
  try {
    const dati = z
      .object({ approvedRewardCents: centsSchema.optional(), parentNote: z.string().max(200).nullable().optional() })
      .parse(req.body ?? {});
    const risultato = await withTransaction(async (client) => {
      const esito = await approveJobRequest(client, String(req.params.requestId), {
        ...dati,
        parentUserId: req.auth!.userId,
        familyId: req.auth!.familyId,
      });
      return { ...esito, state: await getChildState(client, esito.request.childId) };
    });
    res.json(risultato);
  } catch (err) {
    next(err);
  }
});

parentRouter.post('/job-requests/:requestId/reject', async (req, res, next) => {
  try {
    const dati = z.object({ parentNote: z.string().max(200).nullable().optional() }).parse(req.body ?? {});
    const richiesta = await withTransaction((client) =>
      rejectJobRequest(client, String(req.params.requestId), { ...dati, parentUserId: req.auth!.userId, familyId: req.auth!.familyId }),
    );
    res.json(richiesta);
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------- DONAZIONI
/** La donazione esce dal salvadanaio GIVE solo con la conferma esplicita del genitore. */
parentRouter.post('/children/:childId/donations', requireChildOfFamily, async (req, res, next) => {
  try {
    const dati = z
      .object({
        amountCents: centsSchema,
        cause: z.enum(DONATION_CAUSES),
        donationGoalId: z.string().uuid().nullable().optional(),
        note: z.string().max(300).nullable().optional(),
        photoUrl: z.string().max(2_000_000).nullable().optional(),
      })
      .parse(req.body);
    const risultato = await withTransaction(async (client) => {
      const esito = await makeDonation(client, req.childId!, { ...dati, confirmedByUserId: req.auth!.userId });
      return { ...esito, state: await getChildState(client, req.childId!) };
    });
    res.status(201).json(risultato);
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------- DASHBOARD
parentRouter.get('/children/:childId/dashboard', requireChildOfFamily, async (req, res, next) => {
  try {
    const [stato, statistiche, integrita] = await Promise.all([
      getChildState(pool, req.childId!),
      getStats(pool, req.childId!),
      verifyIntegrity(pool, req.childId!),
    ]);
    res.json({ state: stato, stats: statistiche, integrity: integrita });
  } catch (err) {
    next(err);
  }
});
