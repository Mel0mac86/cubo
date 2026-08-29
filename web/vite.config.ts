import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const qui = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // I file .env non finiscono in process.env: vanno letti esplicitamente.
  // È da qui che la build per GitHub Pages prende la sottocartella (/cubo/).
  const env = loadEnv(mode, qui, '');

  return {
    base: env.VITE_BASE || '/',
    plugins: [react()],
    resolve: {
      alias: {
        // Le regole del denaro sono scritte una volta sola e usate da server e
        // app: qui il frontend punta agli stessi file del dominio.
        '@dominio': resolve(qui, '../server/src/domain'),
        '@contenuti': resolve(qui, '../server/src/content'),
      },
    },
    server: {
      port: 5173,
      fs: { allow: [resolve(qui, '..')] },
      proxy: { '/api': { target: env.API_URL || 'http://localhost:4000', changeOrigin: true } },
    },
    // La versione pubblicata non porta le sourcemap: peserebbero più dell'app
    // stessa e finirebbero nel repository a ogni ricompilazione.
    build: { outDir: 'dist', sourcemap: mode !== 'locale' },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
}) as never;
