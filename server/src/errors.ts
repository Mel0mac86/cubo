/** Errore applicativo con status HTTP e messaggio adatto ai bambini. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, code = 'RICHIESTA_NON_VALIDA', details?: unknown) =>
  new AppError(400, code, msg, details);
export const unauthorized = (msg = 'Devi accedere per continuare.') =>
  new AppError(401, 'NON_AUTENTICATO', msg);
export const forbidden = (msg = 'Questa parte è riservata ai genitori.') =>
  new AppError(403, 'NON_AUTORIZZATO', msg);
export const notFound = (msg = 'Non trovato.') => new AppError(404, 'NON_TROVATO', msg);
export const conflict = (msg: string, code = 'CONFLITTO') => new AppError(409, code, msg);
export const locked = (msg: string) => new AppError(423, 'FUNZIONE_BLOCCATA', msg);
