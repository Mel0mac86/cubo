/**
 * Copia l'app compilata dentro docs/, la cartella che GitHub Pages può servire
 * direttamente da questo branch ("Deploy from a branch" → /docs).
 *
 * La build in modalità locale finisce in web/dist-locale, tenuta separata da
 * web/dist: quest'ultima è la versione con server, servita dall'API.
 *
 * Perché docs/ e non un branch separato: così si pubblica senza dover unire
 * nulla e senza toccare altri branch — utile quando si lavora dal telefono.
 *
 * I file della documentazione (i .md) restano dove sono: lo script rimuove solo
 * quello che aveva generato la volta prima, elencato in docs/.generato.json.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..');
const sorgente = join(radice, 'web', 'dist-locale');
const destinazione = join(radice, 'docs');
const elenco = join(destinazione, '.generato.json');

if (!existsSync(join(sorgente, 'index.html'))) {
  console.error('❌ Manca web/dist-locale: esegui prima la compilazione (npm run build:pages).');
  process.exit(1);
}

// 1. Ripulisce solo i file generati in precedenza.
if (existsSync(elenco)) {
  for (const nome of JSON.parse(readFileSync(elenco, 'utf8'))) {
    rmSync(join(destinazione, nome), { recursive: true, force: true });
  }
}

// 2. Copia la nuova build.
mkdirSync(destinazione, { recursive: true });
const generati = readdirSync(sorgente);
for (const nome of generati) {
  cpSync(join(sorgente, nome), join(destinazione, nome), { recursive: true });
}

// 3. .nojekyll: senza questo file GitHub Pages passa il sito da Jekyll, che
//    ignora le cartelle che iniziano con "_" e può rompere gli asset.
writeFileSync(join(destinazione, '.nojekyll'), '');
generati.push('.nojekyll');

writeFileSync(elenco, JSON.stringify(generati.sort(), null, 2) + '\n');
generati.push('.generato.json');

console.log(`✅ App pubblicata in docs/ (${generati.length} elementi)`);
console.log('   Su GitHub: Settings → Pages → Deploy from a branch → questo branch → /docs');
