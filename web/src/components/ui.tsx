/** Componenti di base riutilizzati da tutte le schermate. */
import { useEffect, useState, type ReactNode } from 'react';
import { formatCents, parseEuroToCents } from '../lib/format';

export function Card({ children, className = '', ...resto }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className}`} {...resto}>
      {children}
    </div>
  );
}

export function Bottone({
  children,
  variante = 'primario',
  piccolo,
  ...resto
}: { children: ReactNode; variante?: 'primario' | 'secondario' | 'neutro' | 'save' | 'spend' | 'give' | 'fantasma'; piccolo?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`btn ${variante} ${piccolo ? 'piccolo' : ''}`} {...resto}>
      {children}
    </button>
  );
}

export function Sheet({
  titolo,
  emoji,
  onClose,
  children,
}: {
  titolo: string;
  emoji?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const gestisci = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', gestisci);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', gestisci);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="sheet-sfondo" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titolo}>
        <div className="sheet-maniglia" />
        <div className="sheet-titolo">
          {emoji && <span style={{ fontSize: 26 }}>{emoji}</span>}
          <h2>{titolo}</h2>
          <button className="sheet-chiudi" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Campo({
  label,
  aiuto,
  errore,
  children,
}: {
  label: string;
  aiuto?: string;
  errore?: string | null;
  children: ReactNode;
}) {
  return (
    <div className={`campo ${errore ? 'errore' : ''}`}>
      <label>{label}</label>
      {children}
      {errore ? <span className="messaggio-errore">{errore}</span> : aiuto ? <span className="aiuto">{aiuto}</span> : null}
    </div>
  );
}

/** Campo per gli importi in euro: accetta virgola e punto, restituisce centesimi. */
export function CampoEuro({
  label,
  valoreCents,
  onChange,
  aiuto,
  autoFocus,
}: {
  label: string;
  valoreCents: number | null;
  onChange: (cents: number | null) => void;
  aiuto?: string;
  autoFocus?: boolean;
}) {
  const [testo, setTesto] = useState(valoreCents !== null ? (valoreCents / 100).toFixed(2).replace('.', ',') : '');
  return (
    <Campo label={label} aiuto={aiuto}>
      <input
        inputMode="decimal"
        placeholder="0,00"
        value={testo}
        autoFocus={autoFocus}
        onChange={(e) => {
          const v = e.target.value;
          setTesto(v);
          onChange(parseEuroToCents(v));
        }}
        aria-label={label}
      />
    </Campo>
  );
}

export function BarraProgresso({ percento, piccola }: { percento: number; piccola?: boolean }) {
  return (
    <div className={`progresso ${piccola ? 'piccola' : ''}`} role="progressbar" aria-valuenow={Math.round(percento)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.max(0, Math.min(100, percento))}%` }} />
    </div>
  );
}

export function Vuoto({ emoji, titolo, testo }: { emoji: string; titolo: string; testo?: string }) {
  return (
    <div className="vuoto">
      <span className="emoji">{emoji}</span>
      <div className="grassetto">{titolo}</div>
      {testo && <div className="piccolo">{testo}</div>}
    </div>
  );
}

export function Importo({ cents, className = '' }: { cents: number; className?: string }) {
  return <span className={`tabellare ${className}`}>{formatCents(cents)}</span>;
}

/** Gli avvisi compaiono in alto e si impilano: non coprono mai i pulsanti. */
export function AreaToast({ toasts }: { toasts: { id: number; messaggio: string; tipo?: 'ok' | 'errore' }[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-area" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tipo ?? ''}`} role="status">
          {t.messaggio}
        </div>
      ))}
    </div>
  );
}

export function SceltaEmoji({ valore, onChange, opzioni }: { valore: string; onChange: (e: string) => void; opzioni: string[] }) {
  return (
    <div className="griglia-emoji">
      {opzioni.map((e) => (
        <button key={e} type="button" className={`bottone-emoji ${valore === e ? 'attivo' : ''}`} onClick={() => onChange(e)} aria-label={e} aria-pressed={valore === e}>
          {e}
        </button>
      ))}
    </div>
  );
}
