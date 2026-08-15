/**
 * Costruisce il sito da pubblicare su GitHub Pages.
 *
 *   node scripts/build-pages.mjs /cubo
 *
 * L'argomento e' la sottocartella in cui vivra' il sito. Su GitHub Pages, per
 * un repository di progetto, l'indirizzo e' https://<utente>.github.io/<repo>/,
 * quindi il percorso di base e' "/<repo>". Se il sito sta alla radice di un
 * dominio (Netlify, Vercel, dominio proprio) si passa una stringa vuota.
 *
 * Rispetto a un `expo export` normale qui succedono tre cose in piu':
 *
 * 1. LA CHIAVE DI GEMINI VIENE TOLTA. Le variabili EXPO_PUBLIC_ finiscono
 *    dentro il pacchetto JavaScript, e un sito pubblicato e' leggibile da
 *    chiunque: pubblicare il build fatto in locale significherebbe regalare la
 *    propria chiave al mondo. Senza chiave l'app funziona identica, usa solo le
 *    spiegazioni scritte a mano.
 * 2. Viene creato .nojekyll. Senza, GitHub Pages passa il sito da Jekyll, che
 *    IGNORA le cartelle che iniziano con l'underscore: sparirebbe _expo/, cioe'
 *    tutto il codice dell'app, e resterebbe una pagina viola vuota.
 * 3. index.html viene copiato in 404.html, cosi anche un indirizzo sbagliato
 *    apre l'app invece della pagina di errore di GitHub.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] ?? '').replace(/\/$/, '');
const out = join(root, 'dist');

console.log(`Costruisco il sito per il percorso "${base || '/'}"`);

rmSync(out, { recursive: true, force: true });

/*
 * La chiave resta fuori: il sito e' pubblico.
 *
 * Toglierla dall'ambiente NON BASTA: Expo legge il file .env per conto suo,
 * quindi se la si cancella soltanto da process.env se la ritrova comunque e la
 * infila nel pacchetto. Serve EXPO_NO_DOTENV per dirgli di non leggere .env, e
 * per sicurezza mettiamo anche la variabile a vuoto. Questo problema e' stato
 * scoperto proprio dal controllo qui sotto, che aveva bloccato una
 * pubblicazione con la chiave dentro.
 */
const env = {
  ...process.env,
  PUBLIC_BASE_PATH: base,
  EXPO_NO_DOTENV: '1',
  EXPO_PUBLIC_GEMINI_API_KEY: '',
};
delete env.EXPO_PUBLIC_GEMINI_API_KEY;

// --clear e' indispensabile: Metro tiene in cache le trasformazioni, e la
// versione con la chiave gia' incorporata sopravviverebbe alla ricostruzione.
// Anche questo l'ha scoperto il controllo qui sotto.
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist', '--clear'], {
  cwd: root,
  stdio: 'inherit',
  env,
});

writeFileSync(join(out, '.nojekyll'), '');
copyFileSync(join(out, 'index.html'), join(out, '404.html'));

/* ---- verifiche prima di pubblicare ---- */

const bundle = execFileSync('sh', ['-c', `cat ${join(out, '_expo/static/js/web')}/*.js`], {
  maxBuffer: 200 * 1024 * 1024,
}).toString();

const problemi = [];

// 1. nessuna chiave nel pacchetto
if (/AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z_-]{20,}/.test(bundle)) {
  problemi.push('Nel pacchetto sembra esserci una chiave di accesso!');
}

// 2. nessun CDN esterno
if (/cdn\.jsdelivr|unpkg\.com|cdnjs\./.test(bundle)) {
  problemi.push('Il pacchetto contiene un riferimento a un CDN esterno!');
}

// 3. il percorso di base e' finito davvero nell'HTML
const html = readFileSync(join(out, 'index.html'), 'utf8');
const script = html.match(/<script src="([^"]+)"/)?.[1] ?? '';
if (base && !script.startsWith(`${base}/`)) {
  problemi.push(`Il pacchetto e' cercato in "${script}" invece che sotto "${base}/".`);
}

// 4. i file che servono ci sono tutti
for (const f of [
  'index.html',
  '404.html',
  '.nojekyll',
  'manifest.webmanifest',
  'sw.js',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
]) {
  if (!existsSync(join(out, f))) problemi.push(`Manca ${f}`);
}

if (problemi.length) {
  console.error('\n❌ Il sito NON e pronto per la pubblicazione:');
  for (const p of problemi) console.error('   - ' + p);
  process.exit(1);
}

console.log('\n✅ Sito pronto in dist/');
console.log(`   pacchetto: ${script}`);
console.log('   chiave Gemini: non presente (corretto, il sito e pubblico)');
console.log('   CDN esterni: nessuno');
