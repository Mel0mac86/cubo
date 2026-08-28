import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { seedDemoFamily } from './seed/demo.js';

async function main() {
  await migrate();
  if (config.seedOnBoot) await seedDemoFamily({ reuseExisting: true });

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`🪙  My Money Adventure API in ascolto su http://localhost:${config.port}`);
    console.log(`    Database: ${config.databaseUrl.replace(/:[^:@/]+@/, ':****@')}`);
    console.log(`    Money Coach AI: ${config.anthropicApiKey ? 'attivo' : 'motore deterministico (nessuna API key)'}`);
  });
}

main().catch((err) => {
  console.error('Avvio fallito:', err);
  process.exit(1);
});
