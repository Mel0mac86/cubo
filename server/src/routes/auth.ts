import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { createFamily, createChild } from '../services/family.js';
import { listChildrenOfFamily } from '../services/children.js';
import { signToken, signParentToken, verifySecret } from '../auth/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import { unauthorized, badRequest, notFound } from '../errors.js';
import { seedDemoFamily, DEMO_EMAIL, DEMO_PASSWORD, DEMO_PIN } from '../seed/demo.js';
import { NOME_BAMBINO_PROVVISORIO } from '../domain/etichette.js';
import { withTransaction as inTransazione } from '../db/pool.js';

/**
 * Una famiglia senza nemmeno un profilo bambino non ha niente da mostrare:
 * l'app resterebbe ferma sulla schermata di caricamento. Qui si garantisce che
 * ce ne sia sempre almeno uno, creandolo al volo per le famiglie registrate
 * prima di questa correzione.
 */
async function assicuraBambino(familyId: string) {
  const bambini = await listChildrenOfFamily(pool, familyId);
  if (bambini.length > 0) return bambini;
  await inTransazione((client) => createChild(client, familyId, { name: NOME_BAMBINO_PROVVISORIO }));
  return listChildrenOfFamily(pool, familyId);
}

export const authRouter = Router();

const registrazioneSchema = z.object({
  familyName: z.string().min(1).max(80),
  parentName: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  pin: z.string().regex(/^\d{4,8}$/, 'Il PIN deve avere da 4 a 8 cifre'),
  childName: z.string().min(1).max(40).optional(),
  childAge: z.number().int().min(3).max(21).optional(),
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const dati = registrazioneSchema.parse(req.body);
    const risultato = await withTransaction(async (client) => {
      const { family, parentUser } = await createFamily(client, dati);
      // Sempre un profilo: senza, l'app non avrebbe niente da caricare.
      const bambino = await createChild(client, family.id, {
        name: dati.childName ?? NOME_BAMBINO_PROVVISORIO,
        age: dati.childAge ?? null,
      });
      return { family, parentUser, bambino };
    });
    res.status(201).json({
      token: signToken({
        userId: risultato.parentUser.id,
        familyId: risultato.family.id,
        role: 'PARENT',
        scope: 'family',
      }),
      family: { id: risultato.family.id, name: risultato.family.name },
      children: [risultato.bambino],
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const { rows } = await pool.query(
      `SELECT u.*, f.password_hash, f.name AS family_name FROM users u
         JOIN families f ON f.id = u.family_id
        WHERE u.email = $1 AND u.role = 'PARENT'`,
      [email.trim().toLowerCase()],
    );
    if (rows.length === 0 || !(await verifySecret(password, rows[0].password_hash))) {
      throw unauthorized('Email o password non corretti.');
    }
    const bambini = await assicuraBambino(rows[0].family_id);
    res.json({
      token: signToken({ userId: rows[0].id, familyId: rows[0].family_id, role: 'PARENT', scope: 'family' }),
      family: { id: rows[0].family_id, name: rows[0].family_name },
      children: bambini,
    });
  } catch (err) {
    next(err);
  }
});

/** Accesso rapido al profilo dimostrativo (Sofia). */
authRouter.post('/demo', async (_req, res, next) => {
  try {
    await seedDemoFamily({ reuseExisting: true });
    const { rows } = await pool.query(
      `SELECT u.*, f.name AS family_name FROM users u JOIN families f ON f.id = u.family_id WHERE u.email = $1`,
      [DEMO_EMAIL],
    );
    if (rows.length === 0) throw notFound('Profilo demo non disponibile.');
    const bambini = await assicuraBambino(rows[0].family_id);
    res.json({
      token: signToken({ userId: rows[0].id, familyId: rows[0].family_id, role: 'PARENT', scope: 'family' }),
      family: { id: rows[0].family_id, name: rows[0].family_name },
      children: bambini,
      credenziali: { email: DEMO_EMAIL, password: DEMO_PASSWORD, pin: DEMO_PIN },
    });
  } catch (err) {
    next(err);
  }
});

/** Sblocco della modalita' genitore con il PIN: restituisce un token a scadenza breve. */
authRouter.post('/parent-mode', requireAuth, async (req, res, next) => {
  try {
    const { pin } = z.object({ pin: z.string().min(4).max(8) }).parse(req.body);
    const { rows } = await pool.query(
      `SELECT p.pin_hash, p.user_id FROM parents p WHERE p.family_id = $1 LIMIT 1`,
      [req.auth!.familyId],
    );
    if (rows.length === 0) throw badRequest('Nessun genitore configurato per questa famiglia.');
    if (!(await verifySecret(pin, rows[0].pin_hash))) throw unauthorized('PIN non corretto.');
    res.json({
      parentToken: signParentToken({ userId: rows[0].user_id, familyId: req.auth!.familyId, role: 'PARENT' }),
      expiresInMinutes: Number(process.env.PARENT_SESSION_MINUTES ?? 30),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT id, name FROM families WHERE id = $1`, [req.auth!.familyId]);
    const bambini = await assicuraBambino(req.auth!.familyId);
    res.json({
      family: rows[0] ?? null,
      children: bambini,
      scope: req.auth!.scope,
      parentMode: req.auth!.scope === 'parent',
    });
  } catch (err) {
    next(err);
  }
});
