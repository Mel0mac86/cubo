/**
 * Applica lo schema (idempotente) e i dati di riferimento (livelli, lezioni).
 * Uso: npm run db:migrate
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, closePool } from './pool.js';
import { LEVELS } from '../domain/xp.js';
import { LESSONS } from '../content/lessons.js';

const here = dirname(fileURLToPath(import.meta.url));

export async function migrate(): Promise<void> {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  await pool.query(sql);

  for (const l of LEVELS) {
    await pool.query(
      `INSERT INTO levels (level, name, emoji, min_xp, description)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (level) DO UPDATE
         SET name = EXCLUDED.name, emoji = EXCLUDED.emoji,
             min_xp = EXCLUDED.min_xp, description = EXCLUDED.description`,
      [l.level, l.name, l.emoji, l.minXp, l.description],
    );
  }

  for (const lezione of LESSONS) {
    await pool.query(
      `INSERT INTO lessons (id, position, title, emoji, summary, minutes, content, quiz)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE
         SET position = EXCLUDED.position, title = EXCLUDED.title, emoji = EXCLUDED.emoji,
             summary = EXCLUDED.summary, minutes = EXCLUDED.minutes,
             content = EXCLUDED.content, quiz = EXCLUDED.quiz`,
      [
        lezione.id,
        lezione.position,
        lezione.title,
        lezione.emoji,
        lezione.summary,
        lezione.minutes,
        JSON.stringify(lezione.pages),
        JSON.stringify(lezione.quiz),
      ],
    );
  }
}

/** Cancella tutti i dati applicativi mantenendo schema e contenuti didattici. */
export async function resetData(): Promise<void> {
  await pool.query(`TRUNCATE families RESTART IDENTITY CASCADE`);
}

const eseguitoDirettamente = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '');
if (eseguitoDirettamente) {
  migrate()
    .then(() => console.log('✅ Migrazione completata'))
    .catch((e) => {
      console.error('❌ Migrazione fallita:', e);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
