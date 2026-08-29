/**
 * Client API + gestione offline.
 *
 * Quando la rete manca, le operazioni del bambino non vengono perse: finiscono
 * in una coda salvata sul telefono e vengono rimandate al server appena torna
 * la connessione (endpoint /sync). Ogni operazione ha un `clientId` univoco,
 * quindi un doppio invio non crea mai una transazione doppia.
 */

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Modalità locale: l'app gira senza server, con i dati sul telefono.
 * Si attiva compilando con VITE_MODALITA=locale (è la versione pubblicata su
 * GitHub Pages). Con un server disponibile resta tutto come prima.
 */
export const MODALITA_LOCALE = (import.meta.env?.VITE_MODALITA as string | undefined) === 'locale';

export class OfflineError extends Error {
  constructor(message = 'Sei offline: l’operazione è stata messa in coda.') {
    super(message);
    this.name = 'OfflineError';
  }
}

const CHIAVI = {
  token: 'mma.token',
  family: 'mma.family',
  childId: 'mma.childId',
  coda: 'mma.queue',
  stato: 'mma.state',
};

export type OperazioneOffline =
  | { kind: 'PURCHASE'; clientId: string; occurredAt: string; payload: { amountCents: number; description: string; jar: 'SPEND' | 'SAVE'; emoji?: string; simulated?: boolean } }
  | { kind: 'ALLOCATE'; clientId: string; occurredAt: string; payload: { pendingIncomeId: string; split: { save: number; spend: number; give: number } } }
  | { kind: 'JOB_REQUEST'; clientId: string; occurredAt: string; payload: { jobId: string; note?: string } }
  | { kind: 'QUIZ'; clientId: string; occurredAt: string; payload: { lessonId: string; answers: { id: string; answerIndex: number }[] } };

function leggi<T>(chiave: string, predefinito: T): T {
  try {
    const grezzo = localStorage.getItem(chiave);
    return grezzo ? (JSON.parse(grezzo) as T) : predefinito;
  } catch {
    return predefinito;
  }
}

function scrivi(chiave: string, valore: unknown): void {
  try {
    localStorage.setItem(chiave, JSON.stringify(valore));
  } catch {
    /* spazio esaurito o modalità privata: si continua senza cache */
  }
}

export function nuovoClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const api = {
  baseUrl: (import.meta.env?.VITE_API_URL as string | undefined) ?? '/api',
  token: null as string | null,
  parentToken: null as string | null,

  carica(): void {
    this.token = localStorage.getItem(CHIAVI.token);
  },

  salvaSessione(token: string, family: unknown, childId: string | null): void {
    this.token = token;
    localStorage.setItem(CHIAVI.token, token);
    scrivi(CHIAVI.family, family);
    if (childId) localStorage.setItem(CHIAVI.childId, childId);
  },

  esci(): void {
    this.token = null;
    this.parentToken = null;
    for (const k of Object.values(CHIAVI)) localStorage.removeItem(k);
  },

  get childId(): string | null {
    return localStorage.getItem(CHIAVI.childId);
  },
  set childId(id: string | null) {
    if (id) localStorage.setItem(CHIAVI.childId, id);
    else localStorage.removeItem(CHIAVI.childId);
  },

  get famiglia(): { id: string; name: string } | null {
    return leggi(CHIAVI.family, null as { id: string; name: string } | null);
  },

  async richiesta<T>(
    metodo: string,
    percorso: string,
    corpo?: unknown,
    opzioni: { parent?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = opzioni.parent ? this.parentToken : this.token;
    if (token) headers.Authorization = `Bearer ${token}`;

    // Senza server la richiesta viene servita dal motore che gira nel telefono.
    if (MODALITA_LOCALE) {
      const { richiestaLocale } = await import('./locale/motore');
      try {
        return await richiestaLocale<T>(metodo, percorso, corpo, opzioni, token);
      } catch (err) {
        const e = err as { stato?: number; codice?: string; message?: string };
        throw new ApiError(e.stato ?? 500, e.codice ?? 'ERRORE', e.message ?? 'Qualcosa è andato storto.');
      }
    }

    let risposta: Response;
    try {
      risposta = await fetch(`${this.baseUrl}${percorso}`, {
        method: metodo,
        headers,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    } catch {
      throw new OfflineError();
    }

    if (risposta.status === 503) {
      const testo = await risposta.text();
      if (testo.includes('offline')) throw new OfflineError();
    }
    if (risposta.status === 204) return undefined as T;

    const dati = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      const e = (dati as ApiErrorBody).error;
      throw new ApiError(risposta.status, e?.code ?? 'ERRORE', e?.message ?? 'Qualcosa è andato storto.', e?.details);
    }
    return dati as T;
  },

  get<T>(percorso: string, opzioni?: { parent?: boolean }) {
    return this.richiesta<T>('GET', percorso, undefined, opzioni);
  },
  post<T>(percorso: string, corpo?: unknown, opzioni?: { parent?: boolean }) {
    return this.richiesta<T>('POST', percorso, corpo, opzioni);
  },
  patch<T>(percorso: string, corpo?: unknown, opzioni?: { parent?: boolean }) {
    return this.richiesta<T>('PATCH', percorso, corpo, opzioni);
  },
  del<T>(percorso: string, opzioni?: { parent?: boolean }) {
    return this.richiesta<T>('DELETE', percorso, undefined, opzioni);
  },

  // ------------------------------------------------------------- OFFLINE
  get coda(): OperazioneOffline[] {
    return leggi<OperazioneOffline[]>(CHIAVI.coda, []);
  },

  accoda(op: OperazioneOffline): void {
    scrivi(CHIAVI.coda, [...this.coda, op]);
  },

  svuotaCoda(clientIds: string[]): void {
    scrivi(CHIAVI.coda, this.coda.filter((o) => !clientIds.includes(o.clientId)));
  },

  statoSalvato(childId: string): unknown | null {
    return leggi<unknown | null>(`${CHIAVI.stato}.${childId}`, null);
  },

  salvaStato(childId: string, stato: unknown): void {
    scrivi(`${CHIAVI.stato}.${childId}`, stato);
  },

  /** Rimanda al server le operazioni fatte offline. */
  async sincronizza(childId: string): Promise<{ results: { clientId: string; status: string; message?: string }[]; state: unknown } | null> {
    const coda = this.coda;
    if (coda.length === 0) return null;
    const risposta = await this.post<{ results: { clientId: string; status: string; message?: string }[]; state: unknown }>(
      `/children/${childId}/sync`,
      { operations: coda },
    );
    // Si rimuovono sia le applicate sia i duplicati: in entrambi i casi il server è a posto.
    this.svuotaCoda(risposta.results.filter((r) => r.status !== 'ERRORE').map((r) => r.clientId));
    return risposta;
  },
};

/**
 * Aggiornamento ottimistico dello stato locale mentre si è offline:
 * il bambino vede subito l'effetto della sua azione, il server confermerà dopo.
 */
export function applicaOttimistico(stato: any, op: OperazioneOffline): any {
  if (!stato) return stato;
  const copia = structuredClone(stato);
  const aggiornaTotale = () => {
    copia.jars.totalCents = copia.jars.SAVE + copia.jars.SPEND + copia.jars.GIVE;
  };

  if (op.kind === 'PURCHASE') {
    const jar = op.payload.jar;
    copia.jars[jar] = Math.max(0, copia.jars[jar] - op.payload.amountCents);
    aggiornaTotale();
    copia.history = [
      {
        id: op.clientId,
        occurredAt: op.occurredAt,
        type: 'PURCHASE',
        typeLabel: 'Acquisto',
        emoji: op.payload.emoji ?? '🛍️',
        jar,
        amountCents: -op.payload.amountCents,
        amountLabel: `−${(op.payload.amountCents / 100).toFixed(2).replace('.', ',')} €`,
        balanceAfterCents: copia.jars[jar],
        description: op.payload.description,
        source: 'offline',
        groupId: null,
        inAttesaDiSincronizzazione: true,
      },
      ...copia.history,
    ];
  }

  if (op.kind === 'ALLOCATE') {
    const inAttesa = copia.pendingIncomes?.find((p: any) => p.id === op.payload.pendingIncomeId);
    if (inAttesa) {
      const { save, spend, give } = op.payload.split;
      const totale = inAttesa.amountCents;
      const parteSave = Math.round((totale * save) / 100);
      const parteSpend = Math.round((totale * spend) / 100);
      const parteGive = totale - parteSave - parteSpend;
      copia.jars.SAVE += parteSave;
      copia.jars.SPEND += parteSpend;
      copia.jars.GIVE += parteGive;
      aggiornaTotale();
      copia.pendingIncomes = copia.pendingIncomes.filter((p: any) => p.id !== op.payload.pendingIncomeId);
    }
  }

  if (op.kind === 'JOB_REQUEST') {
    copia.jobRequests = [
      { id: op.clientId, jobId: op.payload.jobId, status: 'PENDING', requestedAt: op.occurredAt, inAttesaDiSincronizzazione: true },
      ...(copia.jobRequests ?? []),
    ];
    copia.pendingJobRequests = (copia.pendingJobRequests ?? 0) + 1;
  }

  return copia;
}
