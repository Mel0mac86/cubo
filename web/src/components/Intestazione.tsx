/** Barra in alto: avatar, nome, livello, XP, saldo totale e accesso genitore. */
import { useApp } from '../state/store';
import { formatCents } from '../lib/format';

export function Intestazione({ onAvatar, onGenitore }: { onAvatar: () => void; onGenitore: () => void }) {
  const { stato, modalitaGenitore } = useApp();
  if (!stato) return null;
  const { child, jars } = stato;
  const livello = child.level;

  return (
    <header className="intestazione">
      <div className="intestazione-riga">
        <button className="avatar" onClick={onAvatar} aria-label="Il mio profilo" style={{ background: `${child.avatarColor}55` }}>
          {child.avatar}
        </button>
        <div className="intestazione-testo">
          <div className="intestazione-nome">{child.name}</div>
          <div className="intestazione-livello">
            {livello.emoji} Liv. {livello.level} · {livello.name}
          </div>
        </div>
        <div className="saldo-totale">
          <div className="etichetta">Totale</div>
          <div className="valore">{formatCents(jars.totalCents)}</div>
        </div>
        <button
          className="avatar"
          style={{ width: 42, height: 42, fontSize: 20 }}
          onClick={onGenitore}
          aria-label={modalitaGenitore ? 'Modalità genitore attiva' : 'Modalità genitore'}
        >
          {modalitaGenitore ? '🔓' : '🔒'}
        </button>
      </div>

      <div className="barra-xp">
        <div style={{ width: `${livello.progressPercent}%` }} />
      </div>
      <div className="xp-testo">
        <span>⭐ {child.xp} XP</span>
        <span>{livello.isMax ? 'Livello massimo!' : `${livello.xpForNextLevel} XP al livello ${livello.level + 1}`}</span>
      </div>
    </header>
  );
}
