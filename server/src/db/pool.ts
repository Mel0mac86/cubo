import pg from 'pg';
import { config } from '../config.js';

/**
 * I BIGINT (centesimi) arrivano da node-postgres come stringa per non perdere
 * precisione. Gli importi della nostra app stanno abbondantemente dentro
 * Number.MAX_SAFE_INTEGER, quindi li convertiamo in interi JavaScript e
 * verifichiamo esplicitamente il limite.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`Importo fuori scala dal database: ${value}`);
  return n;
});
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value: string) => Number(value));

/**
 * I database gestiti (Render, Railway, Heroku, Neon...) richiedono TLS e
 * presentano certificati firmati da una CA interna. Si attiva TLS quando la
 * stringa di connessione lo richiede, senza pretendere una catena verificabile.
 * Con PGSSL_STRICT=true si torna alla verifica completa (serve una CA valida).
 */
function opzioniSsl(url: string): pg.PoolConfig['ssl'] {
  if (process.env.PGSSLMODE === 'disable') return undefined;
  const richiesto = /sslmode=(require|verify-ca|verify-full)/.test(url) || process.env.PGSSL === 'true';
  if (!richiesto) return undefined;
  return process.env.PGSSL_STRICT === 'true' ? true : { rejectUnauthorized: false };
}

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: opzioniSsl(config.databaseUrl),
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  // Un client inattivo caduto non deve abbattere il processo.
  console.error('[db] errore su client inattivo:', err.message);
});

export type Db = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  db: Db,
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return db.query<T>(text, params as never[]);
}

/**
 * Esegue una funzione dentro una transazione SQL.
 * Tutte le operazioni sul denaro passano da qui: o si applicano tutte, o nessuna.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* la connessione era gia' persa */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
