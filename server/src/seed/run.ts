import { migrate } from '../db/migrate.js';
import { seedDemoFamily } from './demo.js';
import { closePool } from '../db/pool.js';
import { formatCents } from '../domain/money.js';

const ricrea = process.argv.includes('--reset');

migrate()
  .then(() => seedDemoFamily({ reuseExisting: !ricrea }))
  .then((r) => {
    console.log('✅ Profilo demo pronto');
    console.log(`   Email:    ${r.email}`);
    console.log(`   Password: ${r.password}`);
    console.log(`   PIN:      ${r.pin}`);
    console.log(`   SAVE ${formatCents(r.balances.SAVE)} · SPEND ${formatCents(r.balances.SPEND)} · GIVE ${formatCents(r.balances.GIVE)}`);
  })
  .catch((e) => {
    console.error('❌ Seed fallito:', e);
    process.exitCode = 1;
  })
  .finally(() => closePool());
