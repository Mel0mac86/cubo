/** PRIMA ESPERIENZA — tre passi: chi sei, il tuo grande obiettivo, come dividi. */
import { useState } from 'react';
import { useApp } from '../state/store';
import { api } from '../lib/api';
import { NOME_BAMBINO_PROVVISORIO } from '@dominio/etichette.js';
import { Bottone, Campo, CampoEuro, SceltaEmoji } from '../components/ui';
import { SplitSliders } from '../components/SplitSliders';
import { lanciaConfetti, suonaTono } from '../lib/celebrate';
import type { Split } from '../lib/split';

const AVATAR = ['🦄', '🦊', '🐼', '🐯', '🐸', '🦁', '🐨', '🐧', '🐢', '🦉'];
const COLORI = ['#7C5CFF', '#16B364', '#2E90FA', '#F79009', '#FF7AC4', '#12B5CB'];
const OBIETTIVI = [
  { emoji: '🚲', nome: 'Bicicletta', prezzo: 25000 },
  { emoji: '🎮', nome: 'Console', prezzo: 40000 },
  { emoji: '🛴', nome: 'Monopattino', prezzo: 18000 },
  { emoji: '🎧', nome: 'Cuffie', prezzo: 8000 },
  { emoji: '🏖️', nome: 'Vacanza', prezzo: 50000 },
  { emoji: '⭐', nome: 'Il mio sogno', prezzo: 10000 },
];

export function Onboarding() {
  const { stato, childId, azione, aggiorna } = useApp();
  const minGive = stato?.child?.settings?.minGivePercent ?? 10;

  const [passo, setPasso] = useState(0);
  // Il segnaposto messo alla registrazione non va precompilato: il bambino
  // deve trovare il campo vuoto e scrivere il suo nome.
  const nomeIniziale = stato?.child?.name === NOME_BAMBINO_PROVVISORIO ? '' : stato?.child?.name ?? '';
  const [nome, setNome] = useState(nomeIniziale);
  const [eta, setEta] = useState(String(stato?.child?.age ?? 9));
  const [avatar, setAvatar] = useState(stato?.child?.avatar ?? '🦄');
  const [colore, setColore] = useState(stato?.child?.avatarColor ?? '#7C5CFF');
  const [obiettivo, setObiettivo] = useState(OBIETTIVI[0]);
  const [nomeObiettivo, setNomeObiettivo] = useState(OBIETTIVI[0].nome);
  const [prezzo, setPrezzo] = useState<number | null>(OBIETTIVI[0].prezzo);
  const [split, setSplit] = useState<Split>({ save: 60, spend: 30, give: 10 });
  const [salvataggio, setSalvataggio] = useState(false);

  async function concludi() {
    if (!childId) return;
    setSalvataggio(true);
    const esito = await azione(
      () =>
        api.post(`/children/${childId}/onboarding`, {
          name: nome.trim(),
          age: Number(eta) || null,
          avatar,
          avatarColor: colore,
          goal:
            prezzo && prezzo > 0
              ? { name: nomeObiettivo.trim() || obiettivo.nome, emoji: obiettivo.emoji, targetCents: prezzo }
              : undefined,
          split,
        }),
      { messaggio: `Benvenuto ${nome}! La tua avventura inizia adesso 🎉` },
    );
    setSalvataggio(false);
    if (esito !== null) {
      lanciaConfetti(90);
      suonaTono('livello');
      await aggiorna();
    }
  }

  return (
    <div className="contenuto" style={{ paddingTop: 32 }}>
      {passo === 0 && (
        <div className="stack">
          <div className="centrato">
            <div style={{ fontSize: 64 }}>👋</div>
            <h1>Ciao!</h1>
            <p className="morbido">Come ti chiami?</p>
          </div>
          <Campo label="Il mio nome">
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Sofia" autoFocus maxLength={40} />
          </Campo>
          <Campo label="Quanti anni hai?">
            <input inputMode="numeric" value={eta} onChange={(e) => setEta(e.target.value)} />
          </Campo>
          <Campo label="Scegli il tuo avatar">
            <SceltaEmoji valore={avatar} onChange={setAvatar} opzioni={AVATAR} />
          </Campo>
          <div className="riga" style={{ gap: 8, justifyContent: 'center' }}>
            {COLORI.map((c) => (
              <button
                key={c}
                aria-label={`Colore ${c}`}
                onClick={() => setColore(c)}
                style={{
                  width: 40, height: 40, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: colore === c ? '4px solid var(--testo)' : '2px solid var(--bordo)',
                }}
              />
            ))}
          </div>
          <Bottone onClick={() => setPasso(1)} disabled={!nome.trim()}>
            Avanti →
          </Bottone>
        </div>
      )}

      {passo === 1 && (
        <div className="stack">
          <div className="centrato">
            <div style={{ fontSize: 56 }}>{obiettivo.emoji}</div>
            <h1>Qual è il tuo grande obiettivo?</h1>
            <p className="morbido">Puoi cambiarlo quando vuoi.</p>
          </div>
          <div className="griglia-3">
            {OBIETTIVI.map((o) => (
              <button
                key={o.nome}
                className={`bottone-emoji ${obiettivo.nome === o.nome ? 'attivo' : ''}`}
                style={{ aspectRatio: 'auto', padding: '14px 6px', flexDirection: 'column', gap: 4, display: 'flex', alignItems: 'center' }}
                onClick={() => {
                  setObiettivo(o);
                  setNomeObiettivo(o.nome);
                  setPrezzo(o.prezzo);
                }}
              >
                <span style={{ fontSize: 30 }}>{o.emoji}</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{o.nome}</span>
              </button>
            ))}
          </div>
          <Campo label="Come si chiama il tuo obiettivo?">
            <input value={nomeObiettivo} onChange={(e) => setNomeObiettivo(e.target.value)} maxLength={60} />
          </Campo>
          <CampoEuro label="Quanto costa?" valoreCents={prezzo} onChange={setPrezzo} aiuto="Se non lo sai di preciso, metti una cifra vicina." />
          <div className="riga-bottoni">
            <Bottone variante="neutro" onClick={() => setPasso(0)}>
              ← Indietro
            </Bottone>
            <Bottone onClick={() => setPasso(2)} disabled={!prezzo || prezzo <= 0}>
              Avanti →
            </Bottone>
          </div>
        </div>
      )}

      {passo === 2 && (
        <div className="stack">
          <div className="centrato">
            <div style={{ fontSize: 52 }}>🫙</div>
            <h1>Quando ricevi dei soldi, come vuoi dividerli?</h1>
            <p className="morbido">Puoi cambiare idea ogni volta che arrivano.</p>
          </div>
          <div className="card">
            <SplitSliders split={split} onChange={setSplit} totaleCents={1000} minGive={minGive} />
            <p className="piccolo morbido centrato" style={{ marginTop: 8 }}>
              Esempio con 10 €. Il totale deve fare sempre 100%.
            </p>
          </div>
          <div className="riga-bottoni">
            <Bottone variante="neutro" onClick={() => setPasso(1)}>
              ← Indietro
            </Bottone>
            <Bottone onClick={() => void concludi()} disabled={salvataggio}>
              {salvataggio ? 'Preparo tutto…' : '🚀 Inizia!'}
            </Bottone>
          </div>
        </div>
      )}
    </div>
  );
}
