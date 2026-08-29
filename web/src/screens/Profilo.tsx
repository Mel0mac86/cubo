/** Profilo del bambino: avatar, livello, badge e uscita. */
import { useState } from 'react';
import { useApp } from '../state/store';
import { IstruzioniIPhone } from '../components/Installa';
import { DatiLocali } from '../components/DatiLocali';
import { rilevaPiattaforma } from '../lib/installa';
import { MODALITA_LOCALE } from '../lib/api';
import { Bottone, Sheet, BarraProgresso, Card } from '../components/ui';
import { api } from '../lib/api';
import { formatCents } from '../lib/format';

const AVATAR = ['🦄', '🦊', '🐼', '🐯', '🐸', '🦁', '🐨', '🐧', '🐢', '🦉'];

export function Profilo({ onChiudi }: { onChiudi: () => void }) {
  const { stato, childId, azione, esci } = useApp();
  const [istruzioni, setIstruzioni] = useState(false);
  const [piattaforma] = useState(rilevaPiattaforma);
  if (!stato) return null;
  const { child, achievements, streak } = stato;

  return (
    <Sheet titolo="Il mio profilo" emoji={child.avatar} onClose={onChiudi}>
      <div className="stack">
        <div className="centrato">
          <div style={{ fontSize: 64 }}>{child.avatar}</div>
          <h2>{child.name}</h2>
          <p className="morbido">
            {child.level.emoji} Livello {child.level.level} — {child.level.name}
          </p>
          <p className="piccolo morbido">{child.level.description}</p>
        </div>

        <BarraProgresso percento={child.level.progressPercent} />
        <p className="piccolo morbido centrato">
          ⭐ {child.xp} XP {child.level.isMax ? '· livello massimo!' : `· ${child.level.xpForNextLevel} XP al livello ${child.level.level + 1}`}
        </p>

        <Card className="compatta">
          <div className="griglia-3 centrato">
            <div>
              <div className="grassetto" style={{ fontSize: 22 }}>{formatCents(stato.jars.totalCents)}</div>
              <div className="piccolo morbido">Totale</div>
            </div>
            <div>
              <div className="grassetto" style={{ fontSize: 22 }}>🔥 {streak}</div>
              <div className="piccolo morbido">settimane di fila</div>
            </div>
            <div>
              <div className="grassetto" style={{ fontSize: 22 }}>{achievements.length}</div>
              <div className="piccolo morbido">badge</div>
            </div>
          </div>
        </Card>

        <div>
          <h3 style={{ marginBottom: 8 }}>Cambia avatar</h3>
          <div className="griglia-emoji">
            {AVATAR.map((a) => (
              <button
                key={a}
                className={`bottone-emoji ${child.avatar === a ? 'attivo' : ''}`}
                onClick={() => void azione(() => api.patch(`/children/${childId}/profile`, { avatar: a }), { messaggio: 'Avatar cambiato!' })}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {achievements.length > 0 && (
          <div>
            <h3 style={{ marginBottom: 8 }}>🏅 I miei badge</h3>
            <div className="lista">
              {achievements.map((b: any) => (
                <div className="voce" key={b.id}>
                  <div className="ico-cerchio">{b.emoji}</div>
                  <div className="testo">
                    <div className="titolo">{b.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {piattaforma.installata ? (
          <div className="avviso calmo centrato">📲 Stai usando l’app dalla schermata Home. Perfetto!</div>
        ) : (
          <Bottone variante="secondario" onClick={() => setIstruzioni(true)}>
            📲 Metti l’app sulla schermata Home
          </Bottone>
        )}

        {MODALITA_LOCALE && <DatiLocali onRipristinato={() => window.location.reload()} />}

        <Bottone variante="fantasma" onClick={() => { esci(); onChiudi(); }}>
          Esci dall’account
        </Bottone>

        {istruzioni && <IstruzioniIPhone onChiudi={() => setIstruzioni(false)} />}
      </div>
    </Sheet>
  );
}
