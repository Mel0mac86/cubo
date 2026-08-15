import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Controlli sui file che rendono l'app installabile sulla schermata Home.
 *
 * Sono verifiche noiose ma preziose: basta una riga tolta per sbaglio da
 * index.html e l'icona salvata sull'iPhone, invece di aprire l'app a schermo
 * intero, riapre Safari con la barra degli indirizzi. E' un difetto che non si
 * nota provando l'app nel browser: si scopre solo dopo averla installata.
 */

const root = join(__dirname, '..');
const html = readFileSync(join(root, 'public/index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'));
const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');

describe('index.html: quello che serve a iPhone', () => {
  it('dichiara di poter girare a schermo intero', () => {
    // Senza questo meta, "Aggiungi a Home" crea solo un segnalibro di Safari.
    expect(html).toMatch(/<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"/);
    expect(html).toMatch(/<meta\s+name="mobile-web-app-capable"\s+content="yes"/);
  });

  it('dice a iPhone quale nome e quale icona usare sulla Home', () => {
    expect(html).toMatch(/<meta\s+name="apple-mobile-web-app-title"\s+content="Rubik Hero"/);
    // Percorso relativo: su GitHub Pages il sito sta in una sottocartella.
    expect(html).toMatch(/<link\s+rel="apple-touch-icon"\s+href="\.\/apple-touch-icon\.png"/);
  });

  it('imposta lo stile della barra di stato e il colore del tema', () => {
    expect(html).toMatch(/apple-mobile-web-app-status-bar-style/);
    expect(html).toMatch(/<meta\s+name="theme-color"\s+content="#2E1065"/);
  });

  it('usa viewport-fit=cover per arrivare sotto il notch', () => {
    expect(html).toMatch(/viewport-fit=cover/);
  });

  it('impedisce lo zoom con il doppio tocco', () => {
    // Un doppio tocco durante la risoluzione zoomerebbe la pagina e il bambino
    // si ritroverebbe il cubo storto senza capire perche'.
    expect(html).toMatch(/user-scalable=no/);
    expect(html).toMatch(/maximum-scale=1/);
  });

  it('collega il manifest', () => {
    expect(html).toMatch(/<link\s+rel="manifest"\s+href="\.\/manifest\.webmanifest"/);
  });

  it('registra il service worker', () => {
    expect(html).toMatch(/navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
    // E non deve esplodere se il service worker non e' disponibile (HTTP semplice).
    expect(html).toMatch(/\.catch\(/);
  });

  it('mostra qualcosa mentre il codice dell app arriva', () => {
    // Il pacchetto e' di alcuni megabyte: senza questo, il bambino vedrebbe
    // uno schermo viola vuoto per qualche secondo.
    expect(html).toMatch(/id="avvio"/);
    expect(html).toMatch(/Rubik Hero/);
  });

  it('lascia scrivibili i campi di testo pur bloccando la selezione altrove', () => {
    expect(html).toMatch(/user-select:\s*none/);
    expect(html).toMatch(/input,[\s\S]*?textarea\s*\{[\s\S]*?user-select:\s*text/);
  });
});

describe('manifest', () => {
  it('si apre a schermo intero, in verticale', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('portrait');
    // "./" e non "/": il sito deve funzionare anche dentro una sottocartella.
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
  });

  it('e in italiano e ha nome e descrizione', () => {
    expect(manifest.lang).toBe('it');
    expect(manifest.name).toBe('Rubik Hero');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12); // altrimenti iOS taglia
    expect(manifest.description.length).toBeGreaterThan(20);
  });

  it('ha le icone richieste, e una ritagliabile per Android', () => {
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    const maskable = manifest.icons.filter((i: { purpose: string }) => i.purpose === 'maskable');
    expect(maskable.length).toBeGreaterThanOrEqual(1);
  });

  it('i file delle icone esistono davvero', () => {
    for (const icon of manifest.icons as { src: string }[]) {
      expect(existsSync(join(root, 'public', icon.src.replace(/^\//, '')))).toBe(true);
    }
    expect(existsSync(join(root, 'public/apple-touch-icon.png'))).toBe(true);
  });

  it('i colori coincidono con quelli di index.html', () => {
    expect(manifest.background_color).toBe('#2E1065');
    expect(manifest.theme_color).toBe('#2E1065');
  });
});

describe('service worker', () => {
  it('mette in cache il guscio dell app', () => {
    expect(sw).toMatch(/BASE \+ 'index\.html'/);
    expect(sw).toMatch(/BASE \+ 'manifest\.webmanifest'/);
    expect(sw).toMatch(/apple-touch-icon\.png/);
  });

  it('usa la rete per la navigazione, cosi gli aggiornamenti arrivano', () => {
    // Se index.html venisse servito sempre dalla cache, dopo una nuova
    // pubblicazione il telefono resterebbe con la versione vecchia per sempre.
    expect(sw).toMatch(/richiesta\.mode === 'navigate'/);
    expect(sw).toMatch(/await fetch\(richiesta\)/);
  });

  it('non intercetta le richieste verso altri siti', () => {
    // Le chiamate a Gemini devono fallire subito quando non c'e' rete,
    // non restare appese in attesa.
    expect(sw).toMatch(/url\.origin !== self\.location\.origin/);
  });

  it('cancella le cache delle versioni precedenti', () => {
    expect(sw).toMatch(/caches\.delete/);
    expect(sw).toMatch(/skipWaiting/);
    expect(sw).toMatch(/clients\.claim/);
  });

  it("l'installazione non fallisce se manca un file", () => {
    expect(sw).toMatch(/cache\.add\(url\)\.catch/);
  });
});

describe('niente contatti con siti terzi', () => {
  /**
   * Questo controllo nasce da un problema vero, trovato solo aprendo l'app in
   * un browser: la libreria della fotocamera di Expo, nella sua versione web,
   * crea un lettore di codici QR che scarica jsQR da un CDN esterno gia' al
   * caricamento del modulo — bastava importarla per contattare jsdelivr, anche
   * senza aprire la fotocamera. Noi i codici QR non li leggiamo, e l'app
   * promette al genitore di non contattare nessuno.
   *
   * La soluzione e' avere due file separati: sul web si usa direttamente
   * getUserMedia, cosi expo-camera non entra proprio nel pacchetto.
   */
  const sorgenti = (dir: string): string[] => {
    const out: string[] = [];
    const visita = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) visita(p);
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
      }
    };
    visita(dir);
    return out;
  };

  const files = sorgenti(join(root, 'src'));

  it('esiste una versione web della fotocamera', () => {
    expect(existsSync(join(root, 'src/ui/components/CameraSurface.web.tsx'))).toBe(true);
    expect(existsSync(join(root, 'src/ui/components/CameraSurface.tsx'))).toBe(true);
  });

  it('expo-camera e importato solo dal file nativo della fotocamera', () => {
    const colpevoli = files.filter(
      (f) =>
        /from ['"]expo-camera['"]/.test(readFileSync(f, 'utf8')) &&
        !f.endsWith('CameraSurface.tsx'),
    );
    expect(colpevoli.map((f) => f.replace(root, ''))).toEqual([]);
  });

  it('la versione web della fotocamera non importa expo-camera', () => {
    const web = readFileSync(join(root, 'src/ui/components/CameraSurface.web.tsx'), 'utf8');
    expect(web).not.toMatch(/expo-camera/);
    expect(web).toMatch(/getUserMedia/);
  });

  it("nessun file del progetto punta a un CDN esterno", () => {
    const cdn = /https?:\/\/(cdn\.|unpkg\.com|cdnjs\.|ajax\.googleapis)/;
    const colpevoli = files.filter((f) => cdn.test(readFileSync(f, 'utf8')));
    expect(colpevoli.map((f) => f.replace(root, ''))).toEqual([]);
  });

  it("l'unico indirizzo esterno usato e quello di Gemini, ed e facoltativo", () => {
    const conRete = files.filter((f) => /https:\/\//.test(readFileSync(f, 'utf8')));
    const domini = new Set<string>();
    for (const f of conRete) {
      for (const m of readFileSync(f, 'utf8').matchAll(/https:\/\/([a-z0-9.-]+)/g)) {
        domini.add(m[1]);
      }
    }
    expect([...domini]).toEqual(['generativelanguage.googleapis.com']);
    // ...e la chiamata parte solo se un adulto ha configurato la chiave.
    const gemini = readFileSync(join(root, 'src/services/gemini.ts'), 'utf8');
    expect(gemini).toMatch(/if \(!isGeminiConfigured\(\)\) return null/);
  });

  it('la fotocamera web si spegne quando si esce dalla schermata', () => {
    const web = readFileSync(join(root, 'src/ui/components/CameraSurface.web.tsx'), 'utf8');
    expect(web).toMatch(/getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/);
  });
});

describe('il service worker salva anche il codice dell app', () => {
  /**
   * Difetto trovato collaudando il sito servito da una sottocartella: l'app si
   * apriva, ma staccando la rete e ricaricando restava una pagina vuota.
   *
   * Il motivo: il pacchetto JavaScript ha l'impronta del contenuto nel nome,
   * quindi non si puo' elencare a mano nel guscio; e alla PRIMA visita viene
   * scaricato prima che il service worker sia attivo, quindi non passa dal suo
   * filtro e non finisce in cache. Ora il service worker se lo va a cercare da
   * solo dentro index.html mentre si installa.
   */
  it('cerca il pacchetto dentro index.html durante l installazione', () => {
    expect(sw).toMatch(/async function trovaPacchetti/);
    expect(sw).toMatch(/<script\[\^>\]\+src=/);
    expect(sw).toMatch(/\[\.\.\.GUSCIO, \.\.\.\(await trovaPacchetti\(\)\)\]/);
  });

  it('usa percorsi relativi, cosi funziona anche in una sottocartella', () => {
    // Su GitHub Pages il sito sta sotto /nome-repo/: con i percorsi assoluti
    // il service worker cercherebbe i file fuori dal sito.
    expect(sw).toMatch(/const BASE = new URL\('\.\/', self\.location\)\.pathname/);
    expect(sw).not.toMatch(/'\/index\.html'/);
    expect(html).toMatch(/register\('\.\/sw\.js'\)/);
    expect(manifest.start_url).toBe('./');
  });
});

describe('quando l app non riesce ad avviarsi', () => {
  /**
   * Uno schermo viola muto e' il modo peggiore di fallire: il bambino non
   * capisce, il genitore non sa cosa dire, e chi deve sistemare il problema non
   * ha nessuna informazione. E' successo davvero, aprendo il sito mentre la
   * pubblicazione era ancora in corso: il pacchetto rispondeva "non trovato",
   * il telefono se lo teneva in cache e l'app restava bloccata li' per sempre.
   */
  it('dopo dodici secondi spiega che qualcosa non va', () => {
    expect(html).toMatch(/setTimeout\(mostraGuasto, 12000\)/);
    expect(html).toMatch(/Non riesco ad avviarmi/);
  });

  it('offre un pulsante che cancella tutto e ricomincia', () => {
    expect(html).toMatch(/id="ripara"/);
    expect(html).toMatch(/caches\.delete/);
    expect(html).toMatch(/r\.unregister\(\)/);
    // ...e ricarica saltando la cache
    expect(html).toMatch(/location\.replace\(location\.pathname \+ '\?fresco='/);
  });

  it('raccoglie gli errori invece di ingoiarli', () => {
    expect(html).toMatch(/addEventListener\('error'/);
    expect(html).toMatch(/addEventListener\('unhandledrejection'/);
    expect(html).toMatch(/id="dettagli"/);
  });

  it('il service worker riprova saltando la cache se un file non arriva', () => {
    expect(sw).toMatch(/fetch\(richiesta\.url, \{ cache: 'reload' \}\)/);
  });

  it('la versione della cache e cambiata, cosi il vecchio stato viene buttato', () => {
    expect(sw).toMatch(/rubik-hero-v2/);
  });
});
