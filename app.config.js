/**
 * Configurazione Expo.
 *
 * Il grosso sta in app.json; qui aggiungiamo solo le cose che dipendono da
 * DOVE viene pubblicato il sito.
 *
 * GitHub Pages, per un repository di progetto, serve il sito dentro una
 * sottocartella (per esempio https://tuonome.github.io/cubo/), non alla
 * radice del dominio. Senza dirlo a Expo, il pacchetto verrebbe cercato in
 * /_expo/... invece che in /cubo/_expo/... e la pagina resterebbe viola e
 * vuota. Il percorso si passa cosi:
 *
 *   PUBLIC_BASE_PATH=/cubo npm run build:web
 *
 * Senza la variabile il sito viene costruito per la radice del dominio, che e'
 * il caso di Netlify, Vercel o di un dominio proprio.
 */

const base = process.env.PUBLIC_BASE_PATH ?? '';

module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...(config.experiments ?? {}),
    baseUrl: base,
  },
});
