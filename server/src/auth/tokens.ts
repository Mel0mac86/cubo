/**
 * Autenticazione: un unico account familiare + PIN per la modalita' genitore.
 *
 * - token FAMIGLIA (lungo): permette di usare l'app come bambino;
 * - token GENITORE (breve, default 30 minuti): si ottiene inserendo il PIN e
 *   sblocca la dashboard genitore. Il bambino non puo' ottenerlo senza PIN.
 */
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { unauthorized } from '../errors.js';

export type TokenScope = 'family' | 'parent';

export interface TokenPayload {
  userId: string;
  familyId: string;
  role: 'PARENT' | 'CHILD';
  scope: TokenScope;
}

export function signToken(payload: TokenPayload, expiresIn?: string): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: (expiresIn ?? config.jwtExpiresIn) as jwt.SignOptions['expiresIn'],
  });
}

export function signParentToken(payload: Omit<TokenPayload, 'scope'>): string {
  return signToken({ ...payload, scope: 'parent' }, `${config.parentSessionMinutes}m`);
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    throw unauthorized('Sessione scaduta: accedi di nuovo.');
  }
}

export async function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifySecret(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Il PIN genitore deve essere di almeno 4 cifre. */
export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin ?? '');
}
