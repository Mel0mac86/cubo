import { networkInterfaces } from 'node:os';
import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { seedDemoFamily } from './seed/demo.js';

async function main() {
  await migrate();
  if (config.seedOnBoot) await seedDemoFamily({ reuseExisting: true });

  const app = createApp();
  // 0.0.0.0: così l'app è raggiungibile anche dal telefono sulla stessa rete Wi-Fi.
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`🪙  My Money Adventure — http://localhost:${config.port}`);
    for (const indirizzo of indirizziDiRete()) {
      console.log(`📱  Dal telefono (stessa Wi-Fi): http://${indirizzo}:${config.port}`);
    }
    console.log(`    Database: ${config.databaseUrl.replace(/:[^:@/]+@/, ':****@')}`);
    console.log(`    Money Coach AI: ${config.anthropicApiKey ? 'attivo' : 'motore deterministico (nessuna API key)'}`);
  });
}

/** Indirizzi IPv4 della macchina sulla rete locale. */
function indirizziDiRete(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

main().catch((err) => {
  console.error('Avvio fallito:', err);
  process.exit(1);
});
