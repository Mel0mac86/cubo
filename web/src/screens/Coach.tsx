/** 🤖 MONEY COACH — spiega, simula, aiuta a ragionare. Non decide mai. */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { api } from '../lib/api';
import { Bottone, Card } from '../components/ui';
import { RisultatoSimulazione } from './Spendi';

export function Coach() {
  const { stato, childId, avvisa } = useApp();
  const [messaggi, setMessaggi] = useState<any[]>([]);
  const [suggerimenti, setSuggerimenti] = useState<string[]>([]);
  const [domanda, setDomanda] = useState('');
  const [inAttesa, setInAttesa] = useState(false);
  const [ultimaRisposta, setUltimaRisposta] = useState<any | null>(null);
  const fondo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!childId) return;
    api
      .get<any>(`/children/${childId}/coach`)
      .then((r) => {
        setMessaggi(r.messages);
        setSuggerimenti(r.suggestions);
      })
      .catch(() => setSuggerimenti(['Posso comprare un gioco da 20 €?', 'Quanto tempo ci vuole per il mio obiettivo?']));
  }, [childId]);

  useEffect(() => {
    fondo.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messaggi, ultimaRisposta]);

  async function chiedi(testo: string) {
    if (!testo.trim() || !childId) return;
    setMessaggi((m) => [...m, { id: `tmp-${Date.now()}`, role: 'child', content: testo }]);
    setDomanda('');
    setInAttesa(true);
    try {
      const r = await api.post<any>(`/children/${childId}/coach`, { question: testo });
      setMessaggi((m) => [...m, { id: `c-${Date.now()}`, role: 'coach', content: r.text, metadata: { options: r.options } }]);
      setUltimaRisposta(r);
    } catch {
      avvisa('Il Money Coach non è raggiungibile adesso. Riprova quando torna la rete.', 'errore');
    } finally {
      setInAttesa(false);
    }
  }

  if (!stato) return null;

  return (
    <div className="contenuto">
      <div className="sezione-titolo">
        <h1>🤖 Money Coach</h1>
      </div>
      <p className="piccolo morbido">
        Chiedimi quello che vuoi sui tuoi soldi. Io ti spiego e ti faccio vedere cosa succede — ma la scelta è sempre tua.
      </p>

      <div className="stack-s">
        {messaggi.length === 0 && (
          <Card className="compatta">
            <p className="morbido">
              Ciao {stato.child.name}! 👋 Prova a chiedermi qualcosa: uso i tuoi numeri veri per risponderti.
            </p>
          </Card>
        )}

        {messaggi.map((m) => (
          <div
            key={m.id}
            className="card compatta"
            style={{
              background: m.role === 'child' ? 'var(--viola)' : 'var(--superficie)',
              color: m.role === 'child' ? '#fff' : 'var(--testo)',
              marginLeft: m.role === 'child' ? 40 : 0,
              marginRight: m.role === 'child' ? 0 : 40,
              border: m.role === 'child' ? 0 : undefined,
            }}
          >
            {m.role === 'coach' && <span style={{ fontSize: 20 }}>🤖 </span>}
            {m.content}
            {m.metadata?.options?.length > 0 && (
              <div className="griglia-2" style={{ marginTop: 10 }}>
                {m.metadata.options.map((o: any) => (
                  <div key={o.id} className="avviso calmo" style={{ fontSize: 13 }}>
                    <span className="grassetto">{o.id}) {o.title}</span>
                    <br />
                    {o.detail}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {ultimaRisposta?.simulation && (
          <Card className="compatta">
            <RisultatoSimulazione simulazione={ultimaRisposta.simulation} compatto />
          </Card>
        )}

        {inAttesa && <div className="morbido piccolo">🤖 sto pensando…</div>}
        <div ref={fondo} />
      </div>

      <div className="chip-riga">
        {suggerimenti.map((s) => (
          <button key={s} className="chip" onClick={() => void chiedi(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="riga">
        <input
          className="campo"
          style={{ flex: 1, fontSize: 17, padding: '14px 16px', border: '2px solid var(--bordo)', borderRadius: 'var(--r-m)' }}
          value={domanda}
          onChange={(e) => setDomanda(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void chiedi(domanda)}
          placeholder="Scrivi la tua domanda…"
          maxLength={300}
          aria-label="La tua domanda"
        />
        <Bottone piccolo onClick={() => void chiedi(domanda)} disabled={!domanda.trim() || inAttesa}>
          Invia
        </Bottone>
      </div>
    </div>
  );
}
