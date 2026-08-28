import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { childRouter } from './routes/child.js';
import { parentRouter } from './routes/parent.js';
import { syncRouter } from './routes/sync.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { LESSONS } from './content/lessons.js';
import { LEVELS } from './domain/xp.js';
import { CAUSE_INFO } from './services/donations.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
  // Le immagini degli obiettivi arrivano come data URL: serve un limite generoso.
  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'my-money-adventure', env: config.env, time: new Date().toISOString() });
  });

  /** Contenuti pubblici (non contengono dati personali). */
  app.get('/api/content', (_req, res) => {
    res.json({
      levels: LEVELS,
      lessons: LESSONS.map((l) => ({
        id: l.id,
        position: l.position,
        title: l.title,
        emoji: l.emoji,
        summary: l.summary,
        minutes: l.minutes,
      })),
      causes: Object.entries(CAUSE_INFO).map(([id, info]) => ({ id, ...info })),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/parent', parentRouter);
  app.use('/api/children/:childId/sync', syncRouter);
  app.use('/api/children/:childId', childRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
