/**
 * 📲 «Aggiungi alla schermata Home».
 *
 * Su Android e desktop il browser offre un prompt di installazione e qui si
 * usa quello. Su iPhone/iPad il prompt non esiste: si mostrano i passaggi del
 * menu Condividi, che è l'unico modo previsto da Apple.
 */
import { useEffect, useState } from 'react';
import { Bottone, Card, Sheet } from './ui';
import { nascondiSuggerimento, rilevaPiattaforma, suggerimentoNascosto } from '../lib/installa';

interface EventoInstallazione extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Intercetta il prompt di installazione di Chrome/Edge (non esiste su iOS). */
function usaPromptInstallazione() {
  const [evento, setEvento] = useState<EventoInstallazione | null>(null);
  useEffect(() => {
    const gestisci = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstallazione);
    };
    window.addEventListener('beforeinstallprompt', gestisci);
    window.addEventListener('appinstalled', () => setEvento(null));
    return () => window.removeEventListener('beforeinstallprompt', gestisci);
  }, []);
  return { evento, azzera: () => setEvento(null) };
}

export function IstruzioniIPhone({ onChiudi }: { onChiudi: () => void }) {
  const { iOS } = rilevaPiattaforma();
  return (
    <Sheet titolo="Metti l’app sulla schermata Home" emoji="📲" onClose={onChiudi}>
      <div className="stack">
        <p className="morbido">
          {iOS
            ? 'Bastano tre tocchi: dopo avrai l’icona sul telefono e l’app si aprirà a tutto schermo, senza la barra del browser.'
            : 'Puoi installarla anche qui. Su iPhone i passaggi sono questi:'}
        </p>

        <ol className="passi-installa">
          <li>
            <span className="numero">1</span>
            <span>
              In basso in Safari tocca <span className="grassetto">Condividi</span>{' '}
              <IconaCondividi /> (il quadrato con la freccia verso l’alto).
            </span>
          </li>
          <li>
            <span className="numero">2</span>
            <span>
              Scorri l’elenco e tocca <span className="grassetto">Aggiungi alla schermata Home</span> ➕.
            </span>
          </li>
          <li>
            <span className="numero">3</span>
            <span>
              In alto a destra tocca <span className="grassetto">Aggiungi</span>. Fatto! 🎉
            </span>
          </li>
        </ol>

        <div className="avviso calmo">
          💡 L’app aperta dall’icona ha una memoria separata da Safari: la prima volta ti chiederà di
          rientrare con la password di famiglia.
        </div>

        <Bottone onClick={onChiudi}>Ho capito</Bottone>
      </div>
    </Sheet>
  );
}

function IconaCondividi() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
         style={{ verticalAlign: '-3px', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

/** Riquadro discreto in fondo alla home: si può chiudere e non torna più. */
export function SuggerimentoInstallazione() {
  const [piattaforma] = useState(rilevaPiattaforma);
  const [nascosto, setNascosto] = useState(suggerimentoNascosto);
  const [istruzioniAperte, setIstruzioniAperte] = useState(false);
  const { evento, azzera } = usaPromptInstallazione();

  if (piattaforma.installata || nascosto) return null;
  // Fuori da iOS il riquadro compare solo se il browser offre davvero l'installazione.
  if (!piattaforma.iOS && !evento) return null;

  async function installaOra() {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice;
    azzera();
  }

  function chiudi() {
    nascondiSuggerimento();
    setNascosto(true);
  }

  return (
    <>
      <Card className="compatta">
        <div className="riga">
          <div className="ico-cerchio" style={{ fontSize: 24 }}>📲</div>
          <div className="testo">
            <div className="grassetto">Tienila sul telefono</div>
            <div className="piccolo morbido">
              {piattaforma.iOS
                ? 'Aggiungila alla schermata Home: si apre a tutto schermo, come un’app.'
                : 'Installa l’app: si apre a tutto schermo, senza barra del browser.'}
            </div>
          </div>
        </div>
        <div className="riga-bottoni" style={{ marginTop: 10 }}>
          <Bottone piccolo onClick={() => (evento ? void installaOra() : setIstruzioniAperte(true))}>
            {evento ? 'Installa l’app' : 'Come si fa'}
          </Bottone>
          <Bottone variante="fantasma" piccolo onClick={chiudi}>
            Non ora
          </Bottone>
        </div>
      </Card>

      {istruzioniAperte && <IstruzioniIPhone onChiudi={() => setIstruzioniAperte(false)} />}
    </>
  );
}
