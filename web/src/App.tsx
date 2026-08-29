import { useEffect, useState } from 'react';
import { useApp } from './state/store';
import { Intestazione } from './components/Intestazione';
import { Accesso } from './screens/Accesso';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { Obiettivi } from './screens/Obiettivi';
import { Spendi } from './screens/Spendi';
import { Guadagna } from './screens/Guadagna';
import { Dona } from './screens/Dona';
import { StoricoConInteresse } from './screens/Storico';
import { Impara } from './screens/Impara';
import { Coach } from './screens/Coach';
import { Genitore, GateGenitore } from './screens/Genitore';
import { Profilo } from './screens/Profilo';
import { AreaToast } from './components/ui';

type Schermata = 'casa' | 'obiettivi' | 'spendi' | 'guadagna' | 'dona' | 'storico' | 'impara' | 'coach' | 'genitore';

const NAV_VALIDE: Schermata[] = ['casa', 'obiettivi', 'spendi', 'guadagna', 'dona', 'storico', 'impara', 'coach'];

const NAV: { id: Schermata; ico: string; label: string }[] = [
  { id: 'casa', ico: '🏠', label: 'Casa' },
  { id: 'guadagna', ico: '💰', label: 'Guadagna' },
  { id: 'impara', ico: '🎓', label: 'Impara' },
  { id: 'coach', ico: '🤖', label: 'Coach' },
  { id: 'storico', ico: '📜', label: 'Storico' },
];

export default function App() {
  const { pronto, sessione, stato, toasts, online, inCoda, modalitaGenitore } = useApp();
  const [schermata, setSchermata] = useState<Schermata>('casa');
  const [profiloAperto, setProfiloAperto] = useState(false);
  const [gateAperto, setGateAperto] = useState(false);
  const [dopoSblocco, setDopoSblocco] = useState<null | (() => void)>(null);

  // Il tasto "indietro" del telefono torna alla home invece di uscire dall'app.
  useEffect(() => {
    const gestisci = () => setSchermata('casa');
    window.addEventListener('popstate', gestisci);
    return () => window.removeEventListener('popstate', gestisci);
  }, []);

  // Scorciatoie dell'icona sulla schermata Home (manifest "shortcuts"): /?vai=spendi
  useEffect(() => {
    const richiesta = new URLSearchParams(window.location.search).get('vai');
    if (richiesta && NAV_VALIDE.includes(richiesta as Schermata)) {
      setSchermata(richiesta as Schermata);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  if (!pronto) {
    return (
      <div className="schermata-accesso centrato">
        <div className="logo-grande">🪙</div>
        <p className="morbido">Un attimo…</p>
      </div>
    );
  }

  if (!sessione) return <Accesso />;

  if (!stato) {
    return (
      <div className="schermata-accesso centrato">
        <div className="logo-grande">🪙</div>
        <p className="morbido">Sto caricando i tuoi salvadanai…</p>
      </div>
    );
  }

  if (!stato.child.onboardingCompleted) {
    return (
      <div className="app">
        <Onboarding />
        <AreaToast toasts={toasts} />
      </div>
    );
  }

  function vaiA(destinazione: string) {
    setSchermata(destinazione as Schermata);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function apriGenitore() {
    if (modalitaGenitore) {
      vaiA('genitore');
      return;
    }
    setDopoSblocco(() => () => vaiA('genitore'));
    setGateAperto(true);
  }

  function chiediGenitore(azioneDopo: () => void) {
    if (modalitaGenitore) {
      azioneDopo();
      return;
    }
    setDopoSblocco(() => azioneDopo);
    setGateAperto(true);
  }

  return (
    <div className="app">
      <Intestazione onAvatar={() => setProfiloAperto(true)} onGenitore={apriGenitore} />

      {!online && <div className="striscia-offline">📴 Sei offline — continui a usare l’app, sincronizzo appena torna la rete</div>}
      {online && inCoda > 0 && <div className="striscia-offline">⏳ {inCoda} operazioni da sincronizzare…</div>}

      {schermata === 'casa' && <Home vaiA={vaiA} />}
      {schermata === 'obiettivi' && <Obiettivi />}
      {schermata === 'spendi' && <Spendi />}
      {schermata === 'guadagna' && <Guadagna />}
      {schermata === 'dona' && <Dona chiediGenitore={chiediGenitore} />}
      {schermata === 'storico' && <StoricoConInteresse />}
      {schermata === 'impara' && <Impara />}
      {schermata === 'coach' && <Coach />}
      {schermata === 'genitore' && (modalitaGenitore ? <Genitore onEsci={() => vaiA('casa')} /> : <div className="contenuto"><p className="morbido centrato">Serve il PIN del genitore.</p></div>)}

      <nav className="nav">
        {NAV.map((v) => (
          <button
            key={v.id}
            className={schermata === v.id ? 'attivo' : ''}
            onClick={() => vaiA(v.id)}
            aria-current={schermata === v.id ? 'page' : undefined}
          >
            <span className="ico">{v.ico}</span>
            {v.label}
            {v.id === 'casa' && stato.pendingIncomes.length > 0 && <span className="pallino" />}
          </button>
        ))}
      </nav>

      {profiloAperto && <Profilo onChiudi={() => setProfiloAperto(false)} />}
      {gateAperto && (
        <GateGenitore
          onSbloccato={() => {
            setGateAperto(false);
            dopoSblocco?.();
            setDopoSblocco(null);
          }}
          onChiudi={() => {
            setGateAperto(false);
            setDopoSblocco(null);
          }}
        />
      )}

      <AreaToast toasts={toasts} />
    </div>
  );
}
