/**
 * SINCRONIZZAZIONE OFFLINE.
 *
 * La PWA registra le operazioni fatte senza rete in una coda locale e le
 * rimanda qui appena torna la connessione. Ogni operazione porta un `clientId`
 * univoco: se arriva due volte (retry, doppio invio) viene applicata una volta
 * sola e la seconda risposta e' "DUPLICATO". Nessuna transazione va persa e
 * nessuna viene duplicata.
 */
import { Router } from 'express';
import { z } from 'zod';
import { withTransaction, pool } from '../db/pool.js';
import { requireAuth, requireChildOfFamily } from '../middleware/auth.js';
import { registerPurchase } from '../services/operations.js';
import { allocatePendingIncome } from '../services/pendingIncome.js';
import { requestJob } from '../services/jobs.js';
import { submitQuiz } from '../services/lessons.js';
import { getChildState } from '../services/state.js';
import { AppError } from '../errors.js';

export const syncRouter = Router({ mergeParams: true });
syncRouter.use(requireAuth, requireChildOfFamily);

const operazioneSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('PURCHASE'),
    clientId: z.string().min(1).max(80),
    occurredAt: z.string().datetime().optional(),
    payload: z.object({
      amountCents: z.number().int().positive(),
      description: z.string().min(1).max(80),
      jar: z.enum(['SPEND', 'SAVE']).default('SPEND'),
      emoji: z.string().max(8).optional(),
      simulated: z.boolean().optional(),
    }),
  }),
  z.object({
    kind: z.literal('ALLOCATE'),
    clientId: z.string().min(1).max(80),
    occurredAt: z.string().datetime().optional(),
    payload: z.object({
      pendingIncomeId: z.string().uuid(),
      split: z.object({
        save: z.number().int().min(0).max(100),
        spend: z.number().int().min(0).max(100),
        give: z.number().int().min(0).max(100),
      }),
    }),
  }),
  z.object({
    kind: z.literal('JOB_REQUEST'),
    clientId: z.string().min(1).max(80),
    occurredAt: z.string().datetime().optional(),
    payload: z.object({ jobId: z.string().uuid(), note: z.string().max(200).optional() }),
  }),
  z.object({
    kind: z.literal('QUIZ'),
    clientId: z.string().min(1).max(80),
    occurredAt: z.string().datetime().optional(),
    payload: z.object({
      lessonId: z.string().max(40),
      answers: z.array(z.object({ id: z.string().max(20), answerIndex: z.number().int().min(0).max(9) })),
    }),
  }),
]);

export type OperazioneSync = z.infer<typeof operazioneSchema>;

syncRouter.post('/', async (req, res, next) => {
  try {
    const { operations } = z.object({ operations: z.array(operazioneSchema).max(100) }).parse(req.body);
    const childId = req.childId!;
    const esiti: { clientId: string; kind: string; status: 'APPLICATA' | 'DUPLICATO' | 'ERRORE'; message?: string }[] = [];

    // Le operazioni si applicano in ordine cronologico: lo storico resta coerente.
    const ordinate = [...operations].sort(
      (a, b) => new Date(a.occurredAt ?? 0).getTime() - new Date(b.occurredAt ?? 0).getTime(),
    );

    for (const op of ordinate) {
      try {
        await withTransaction(async (client) => {
          switch (op.kind) {
            case 'PURCHASE': {
              const { rows } = await client.query(
                `SELECT id FROM transactions WHERE child_id = $1 AND client_id = $2`,
                [childId, op.clientId],
              );
              if (rows.length > 0) {
                esiti.push({ clientId: op.clientId, kind: op.kind, status: 'DUPLICATO' });
                return;
              }
              await registerPurchase(client, childId, {
                ...op.payload,
                clientId: op.clientId,
                occurredAt: op.occurredAt ? new Date(op.occurredAt) : undefined,
              });
              break;
            }
            case 'ALLOCATE': {
              const { rows } = await client.query(
                `SELECT status FROM pending_incomes WHERE id = $1 AND child_id = $2`,
                [op.payload.pendingIncomeId, childId],
              );
              if (rows[0]?.status === 'ALLOCATED') {
                esiti.push({ clientId: op.clientId, kind: op.kind, status: 'DUPLICATO' });
                return;
              }
              await allocatePendingIncome(client, childId, op.payload.pendingIncomeId, op.payload.split, op.clientId);
              break;
            }
            case 'JOB_REQUEST': {
              const { rows } = await client.query(
                `SELECT id FROM job_requests WHERE child_id = $1 AND job_id = $2 AND status = 'PENDING'`,
                [childId, op.payload.jobId],
              );
              if (rows.length > 0) {
                esiti.push({ clientId: op.clientId, kind: op.kind, status: 'DUPLICATO' });
                return;
              }
              await requestJob(client, childId, op.payload.jobId, op.payload.note);
              break;
            }
            case 'QUIZ': {
              await submitQuiz(client, childId, op.payload.lessonId, op.payload.answers);
              break;
            }
          }
          esiti.push({ clientId: op.clientId, kind: op.kind, status: 'APPLICATA' });
        });
      } catch (err) {
        // Un'operazione non valida non blocca le altre: viene segnalata al client.
        const messaggio = err instanceof AppError ? err.message : (err as Error).message;
        esiti.push({ clientId: op.clientId, kind: op.kind, status: 'ERRORE', message: messaggio });
      }
    }

    res.json({ results: esiti, state: await getChildState(pool, childId) });
  } catch (err) {
    next(err);
  }
});
