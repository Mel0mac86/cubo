import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

  // ---------------------------------------------------------------------
  // FRONTEND COMPILATO (facoltativo)
  // Se esiste web/dist, l'API serve anche l'app: un solo indirizzo e una sola
  // porta. È quello che serve per aprirla dall'iPhone sulla rete di casa
  // (niente CORS, niente proxy) e per installarla sulla schermata Home.
  // ---------------------------------------------------------------------
  const qui = dirname(fileURLToPath(import.meta.url));
  const cartellaWeb = process.env.WEB_DIST ?? join(qui, '..', '..', 'web', 'dist');

  if (existsSync(join(cartellaWeb, 'index.html'))) {
    app.use(
      express.static(cartellaWeb, {
        index: false,
        setHeaders: (res, percorso) => {
          // I file con hash nel nome non cambiano mai: si possono tenere a lungo.
          if (percorso.includes(`${'/'}assets${'/'}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (percorso.endsWith('sw.js') || percorso.endsWith('index.html')) {
            // Il service worker e la pagina devono poter essere aggiornati subito.
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );

    // Tutte le altre rotte di lettura appartengono alla single-page application.
    // (HEAD incluso: alcuni client, iOS compreso, lo usano prima di caricare.)
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/')) return next();
      res.sendFile(join(cartellaWeb, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
