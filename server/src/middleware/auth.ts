import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type TokenPayload } from '../auth/tokens.js';
import { forbidden, unauthorized, notFound } from '../errors.js';
import { pool } from '../db/pool.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: TokenPayload;
      /** Id del bambino verificato da requireChildOfFamily. */
      childId?: string;
    }
  }
}

/** Richiede una sessione familiare valida (bambino o genitore). */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());
  try {
    req.auth = verifyToken(header.slice(7));
    next();
  } catch (err) {
    next(err);
  }
}

/** Richiede la modalita' genitore sbloccata con il PIN. */
export function requireParent(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(unauthorized());
  if (req.auth.scope !== 'parent' || req.auth.role !== 'PARENT') {
    return next(forbidden('Questa parte è riservata ai genitori: serve il PIN.'));
  }
  next();
}

/** Verifica che il bambino indicato nell'URL appartenga alla famiglia della sessione. */
export async function requireChildOfFamily(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) throw unauthorized();
    const childId = String(req.params.childId ?? req.body?.childId ?? '');
    if (!childId) throw notFound('Bambino non indicato.');
    const { rows } = await pool.query(`SELECT id FROM children WHERE id = $1 AND family_id = $2`, [
      childId,
      req.auth.familyId,
    ]);
    if (rows.length === 0) throw notFound('Bambino non trovato in questa famiglia.');
    req.childId = childId;
    next();
  } catch (err) {
    next(err);
  }
}
