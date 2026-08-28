import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';
import { MoneyError } from '../domain/money.js';
import { SplitError } from '../domain/split.js';

/** Gestore centrale degli errori: risposte sempre in italiano e comprensibili. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // Le regole di dominio (percentuali, importi) sono errori dell'utente, non del server.
  if (err instanceof SplitError) {
    res.status(400).json({ error: { code: 'RIPARTIZIONE_NON_VALIDA', message: err.message } });
    return;
  }
  if (err instanceof MoneyError) {
    res.status(400).json({ error: { code: 'IMPORTO_NON_VALIDO', message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'DATI_NON_VALIDI',
        message: 'Alcuni dati non sono corretti.',
        details: err.issues.map((i) => ({ campo: i.path.join('.'), problema: i.message })),
      },
    });
    return;
  }
  const anyErr = err as { status?: number; code?: string; message?: string; constraint?: string };
  if (anyErr?.status && anyErr.status < 500) {
    res.status(anyErr.status).json({ error: { code: anyErr.code ?? 'ERRORE', message: anyErr.message ?? 'Errore' } });
    return;
  }
  // Violazioni di vincoli del database: messaggio comprensibile invece di 500.
  if (anyErr?.code === '23505') {
    res.status(409).json({ error: { code: 'DUPLICATO', message: 'Questa operazione risulta già registrata.' } });
    return;
  }
  if (anyErr?.code === '23514') {
    res.status(400).json({
      error: { code: 'VINCOLO_NON_RISPETTATO', message: 'Operazione non consentita: controlla gli importi e le percentuali.' },
    });
    return;
  }
  console.error('[errore non gestito]', err);
  res.status(500).json({ error: { code: 'ERRORE_INTERNO', message: 'Qualcosa è andato storto. Riprova.' } });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NON_TROVATO', message: 'Percorso non trovato.' } });
}
