/**
 * Copia l'app compilata nella cartella che GitHub Pages pubblica.
 *
 * La destinazione si passa con --dest (predefinita: ../soldibimbi, il
 * repository dedicato alla versione online). Il repository del codice resta
 * separato da quello pubblicato: così il sito non porta con sé sorgenti,
 * test e documentazione.
 *
 * La build in modalità locale finisce in web/dist-locale, tenuta separata da
 * web/dist: quest'ultima è la versione con server, servita dall'API.
 *
 * I file già presenti nella destinazione (il README, per esempio) restano dove
 * sono: lo script rimuove solo quello che aveva generato la volta prima,
 * elencato in .generato.json.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..');
const sorgente = join(radice, 'web', 'dist-locale');
const argomenti = process.argv.slice(2);
const indiceDest = argomenti.indexOf('--dest');
const destinazione = indiceDest >= 0 && argomenti[indiceDest + 1]
  ? resolve(argomenti[indiceDest + 1])
  : join(radice, '..', 'soldibimbi');
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

console.log(`✅ App pubblicata in ${destinazione} (${generati.length} elementi)`);
console.log('   Su GitHub: Settings → Pages → Deploy from a branch → main → / (root)');
