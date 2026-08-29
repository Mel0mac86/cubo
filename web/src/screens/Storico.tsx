/** 📜 STORICO — tutti i movimenti, con filtri a colori e icone. */
import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { api } from '../lib/api';
import { Card, Vuoto, Bottone } from '../components/ui';
import { formatCents, formatDayMonth, JAR_INFO, nomeJar } from '../lib/format';

const FILTRI = [
  { id: 'TUTTO', label: 'Tutto', emoji: '📜' },
  { id: 'ENTRATE', label: 'Entrate', emoji: '💶' },
  { id: 'SPESE', label: 'Spese', emoji: '🛍️' },
  { id: 'RISPARMIO', label: 'Risparmio', emoji: '🟢' },
  { id: 'DONAZIONI', label: 'Donazioni', emoji: '❤️' },
  { id: 'INTERESSI', label: 'Interessi', emoji: '🌱' },
  { id: 'LAVORI', label: 'Lavori', emoji: '💪' },
];

export function Storico() {
  const { childId, stato } = useApp();
  const [filtro, setFiltro] = useState('TUTTO');
  const [voci, setVoci] = useState<any[]>(stato?.history ?? []);
  const [totale, setTotale] = useState(stato?.historyTotal ?? 0);
  const [caricamento, setCaricamento] = useState(false);

  useEffect(() => {
    if (!childId) return;
    let annullato = false;
    setCaricamento(true);
    api
      .get<any>(`/children/${childId}/history?filter=${filtro}&limit=100`)
      .then((r) => {
        if (!annullato) {
          setVoci(r.items);
          setTotale(r.total);
        }
      })
      .catch(() => {
        // offline: si mostra quello che c'è nello stato salvato
        if (!annullato) setVoci(stato?.history ?? []);
      })
      .finally(() => !annullato && setCaricamento(false));
    return () => {
      annullato = true;
    };
  }, [childId, filtro, stato]);

  return (
    <div className="contenuto">
      <div className="sezione-titolo">
        <h1>📜 Storico</h1>
      </div>

      <div className="chip-riga">
        {FILTRI.map((f) => (
          <button key={f.id} className={`chip ${filtro === f.id ? 'attivo' : ''}`} onClick={() => setFiltro(f.id)}>
            {f.emoji} {f.label}
          </button>
        ))}
      </div>

      <Card>
        {caricamento && voci.length === 0 ? (
          <p className="morbido centrato">Carico…</p>
        ) : voci.length === 0 ? (
          <Vuoto emoji="🗒️" titolo="Ancora niente qui" testo="Appena ci sarà un movimento lo troverai in questa lista." />
        ) : (
          <>
            <p className="piccolo morbido" style={{ marginBottom: 6 }}>
              {totale} moviment{totale === 1 ? 'o' : 'i'}
            </p>
            <div className="lista">
              {voci.map((v) => (
                <div className="voce" key={v.id}>
                  <div
                    className="ico-cerchio"
                    style={{
                      background:
                        v.jar === 'SAVE' ? 'var(--save-soft)' : v.jar === 'SPEND' ? 'var(--spend-soft)' : 'var(--give-soft)',
                    }}
                  >
                    {v.emoji}
                  </div>
                  <div className="testo">
                    <div className="titolo">{v.description}</div>
                    <div className="sotto">
                      {formatDayMonth(v.occurredAt)} · {v.typeLabel} · {nomeJar(v.jar)}
                      {v.inAttesaDiSincronizzazione && ' · ⏳ da sincronizzare'}
                    </div>
                  </div>
                  <div className={`importo ${v.amountCents > 0 ? 'entrata' : 'uscita'}`}>
                    {v.amountCents > 0 ? '+' : '−'}
                    {formatCents(Math.abs(v.amountCents), { simbolo: false })} €
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/** 🌱 IL DENARO CRESCE — spiegazione dell'interesse con simulazione. */
export function DenaroCresce() {
  const { stato } = useApp();
  if (!stato) return null;
  const i = stato.interest;

  return (
    <Card className="stack">
      <div className="sezione-titolo">
        <h2>🌱 Il denaro cresce</h2>
      </div>
      {!i.enabled ? (
        <p className="morbido">L’interesse è spento. Un genitore può accenderlo dalla modalità genitore.</p>
      ) : (
        <>
          <p className="piccolo morbido">
            Ogni mese ricevi <span className="grassetto">{i.centsPerEuro} centesimi per ogni euro</span> che resta nel salvadanaio {JAR_INFO.SAVE.nome}.
            È un premio per la pazienza!
          </p>
          <div className="confronto">
            <div className="colonna senza">
              <div className="titolo">Hai in {JAR_INFO.SAVE.nome}</div>
              <div className="valore" style={{ fontSize: 22 }}>{formatCents(i.preview.baseCents)}</div>
            </div>
            <div className="colonna con">
              <div className="titolo">Interesse</div>
              <div className="valore" style={{ fontSize: 22, color: 'var(--save)' }}>+{formatCents(i.preview.interestCents)}</div>
            </div>
          </div>
          <div className="avviso">Nuovo saldo: {formatCents(i.preview.newBalanceCents)}</div>

          <div>
            <div className="grassetto" style={{ marginBottom: 6 }}>Se continui così…</div>
            <div className="lista">
              {i.projection.map((p: any) => (
                <div className="voce" key={p.month}>
                  <div className="ico-cerchio" style={{ background: 'var(--save-soft)' }}>{p.month}</div>
                  <div className="testo">
                    <div className="titolo">
                      Fra {p.month} {p.month === 1 ? 'mese' : 'mesi'}
                    </div>
                    <div className="sotto">interesse +{formatCents(p.interestCents)}</div>
                  </div>
                  <div className="importo entrata">{formatCents(p.endCents)}</div>
                </div>
              ))}
            </div>
          </div>
          {i.alreadyAccruedThisPeriod && <div className="avviso calmo">L’interesse di questo mese è già arrivato ✅</div>}
        </>
      )}
    </Card>
  );
}

export function StoricoConInteresse() {
  const [tab, setTab] = useState<'storico' | 'cresce'>('storico');
  return (
    <>
      <div className="contenuto" style={{ paddingBottom: 0 }}>
        <div className="riga-bottoni">
          <Bottone variante={tab === 'storico' ? 'primario' : 'neutro'} onClick={() => setTab('storico')}>
            📜 Storico
          </Bottone>
          <Bottone variante={tab === 'cresce' ? 'primario' : 'neutro'} onClick={() => setTab('cresce')}>
            🌱 Il denaro cresce
          </Bottone>
        </div>
      </div>
      {tab === 'storico' ? <Storico /> : <div className="contenuto"><DenaroCresce /></div>}
    </>
  );
}
