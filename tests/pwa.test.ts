import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
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
    expect(html).toMatch(/<link\s+rel="apple-touch-icon"\s+href="\/apple-touch-icon\.png"/);
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
    expect(html).toMatch(/<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"/);
  });

  it('registra il service worker', () => {
    expect(html).toMatch(/navigator\.serviceWorker\.register\('\/sw\.js'\)/);
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
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
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
    expect(sw).toMatch(/'\/index\.html'/);
    expect(sw).toMatch(/'\/manifest\.webmanifest'/);
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
