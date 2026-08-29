/**
 * Salvadanaio SPENDO + SIMULATORE DELLE SCELTE.
 * Principio: "TU DECIDI. NOI TI MOSTRIAMO COSA SUCCEDE."
 * Il simulatore non impedisce nulla: mostra i due futuri e lascia scegliere.
 */
import { useState } from 'react';
import { useApp, nuovoClientId } from '../state/store';
import { api } from '../lib/api';
import { Bottone, Campo, CampoEuro, Card, Sheet, Vuoto, SceltaEmoji } from '../components/ui';
import { formatCents, formatDayMonth, settimaneTesto, JAR_INFO, nomeJar } from '../lib/format';

const EMOJI_SPESE = ['🛍️', '🍦', '🎮', '🍭', '📚', '🧸', '👕', '🎨', '🍕', '✨'];

export function Spendi() {
  const { stato, childId, azione } = useApp();
  const [importo, setImporto] = useState<number | null>(null);
  const [cosa, setCosa] = useState('');
  const [emoji, setEmoji] = useState('🛍️');
  const [jar, setJar] = useState<'SPEND' | 'SAVE'>('SPEND');
  const [simulazione, setSimulazione] = useState<any | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [sheetAperto, setSheetAperto] = useState(false);

  if (!stato) return null;

  async function simula() {
    if (!importo || !childId) return;
    setCaricamento(true);
    try {
      const r = await api.post<any>(`/children/${childId}/simulate`, { amountCents: importo, jar, label: cosa || undefined });
      setSimulazione(r);
    } catch {
      setSimulazione(null);
    } finally {
      setCaricamento(false);
    }
  }

  async function registra() {
    if (!importo || !childId) return;
    const clientId = nuovoClientId();
    const esito = await azione(
      () =>
        api.post(`/children/${childId}/purchases`, {
          amountCents: importo,
          description: cosa.trim() || 'Acquisto',
          jar,
          emoji,
          clientId,
          simulated: !!simulazione,
        }),
      {
        offline: {
          kind: 'PURCHASE',
          clientId,
          occurredAt: new Date().toISOString(),
          payload: { amountCents: importo, description: cosa.trim() || 'Acquisto', jar, emoji, simulated: !!simulazione },
        },
      },
    );
    if (esito !== null) {
      setSheetAperto(false);
      setImporto(null);
      setCosa('');
      setSimulazione(null);
    }
  }

  return (
    <div className="contenuto">
      <Card className="stack" style={{ background: 'linear-gradient(140deg,#4aa8ff,#2e90fa)', color: '#fff', border: 0 }}>
        <div className="riga">
          <span style={{ fontSize: 40 }}>🔵</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.06em' }}>{JAR_INFO.SPEND.nome}</div>
            <div style={{ fontSize: 34, fontWeight: 800 }}>{formatCents(stato.jars.SPEND)}</div>
            <div className="piccolo">Sono tuoi: puoi usarli quando vuoi.</div>
          </div>
        </div>
      </Card>

      <Bottone variante="spend" onClick={() => setSheetAperto(true)}>
        🛍️ Voglio comprare qualcosa
      </Bottone>

      <Card>
        <div className="sezione-titolo">
          <h2>Ultime spese</h2>
        </div>
        {stato.recentPurchases.length === 0 ? (
          <Vuoto emoji="🧾" titolo="Ancora nessuna spesa" testo="Quando compri qualcosa, segnalo qui: ti mostro cosa cambia." />
        ) : (
          <div className="lista">
            {stato.recentPurchases.map((s: any) => (
              <div className="voce" key={s.id}>
                <div className="ico-cerchio">{s.emoji}</div>
                <div className="testo">
                  <div className="titolo">{s.description}</div>
                  <div className="sotto">
                    {formatDayMonth(s.occurredAt)} · da {nomeJar(s.jar)}
                  </div>
                </div>
                <div className="importo">{formatCents(Math.abs(s.amountCents))}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {sheetAperto && (
        <Sheet titolo="Cosa vuoi comprare?" emoji="🛍️" onClose={() => setSheetAperto(false)}>
          <div className="stack">
            <CampoEuro label="Quanto costa?" valoreCents={importo} onChange={(v) => { setImporto(v); setSimulazione(null); }} autoFocus />
            <Campo label="Che cos'è?">
              <input value={cosa} onChange={(e) => setCosa(e.target.value)} placeholder="Uno slime" maxLength={80} />
            </Campo>
            <Campo label="Scegli un'icona">
              <SceltaEmoji valore={emoji} onChange={setEmoji} opzioni={EMOJI_SPESE} />
            </Campo>
            <Campo label="Da quale salvadanaio?">
              <div className="riga-bottoni">
                <Bottone variante={jar === 'SPEND' ? 'spend' : 'neutro'} onClick={() => { setJar('SPEND'); setSimulazione(null); }}>
                  {JAR_INFO.SPEND.emoji} {JAR_INFO.SPEND.nome}
                </Bottone>
                <Bottone variante={jar === 'SAVE' ? 'save' : 'neutro'} onClick={() => { setJar('SAVE'); setSimulazione(null); }}>
                  {JAR_INFO.SAVE.emoji} {JAR_INFO.SAVE.nome}
                </Bottone>
              </div>
            </Campo>

            {!simulazione && (
              <Bottone variante="secondario" onClick={() => void simula()} disabled={!importo || caricamento}>
                {caricamento ? 'Calcolo…' : '🔮 Cosa succede se lo compro?'}
              </Bottone>
            )}

            {simulazione && <RisultatoSimulazione simulazione={simulazione} />}

            <Bottone onClick={() => void registra()} disabled={!importo}>
              ✅ L’ho comprato, registra la spesa
            </Bottone>
            <p className="piccolo morbido centrato">Decidi tu. Io ti mostro solo cosa succede.</p>
          </div>
        </Sheet>
      )}
    </div>
  );
}

export function RisultatoSimulazione({ simulazione, compatto }: { simulazione: any; compatto?: boolean }) {
  const s = simulazione;
  return (
    <div className="stack">
      {s.senzaAcquisto && s.conAcquisto && s.goalName && (
        <>
          <div className="confronto">
            <div className="colonna senza">
              <div className="titolo">Senza acquisto</div>
              <div className="valore">
                {s.goalEmoji} {s.senzaAcquisto.weeksRemaining ?? '—'}
              </div>
              <div className="unita">{s.senzaAcquisto.weeksRemaining === 1 ? 'settimana' : 'settimane'}</div>
            </div>
            <div className="colonna con">
              <div className="titolo">Con acquisto</div>
              <div className="valore">
                {s.goalEmoji} {s.conAcquisto.weeksRemaining ?? '—'}
              </div>
              <div className="unita">{s.conAcquisto.weeksRemaining === 1 ? 'settimana' : 'settimane'}</div>
            </div>
          </div>
          <div className={`avviso ${s.impact === 'RITARDO' ? 'attenzione' : ''}`}>
            {s.impact === 'RITARDO'
              ? `Questo acquisto potrebbe spostare il tuo obiettivo di ${settimaneTesto(s.deltaWeeks).replace('circa ', '')}.`
              : s.impact === 'COSTO_OPPORTUNITA'
                ? `Il tuo obiettivo non cambia. Però se mettessi questi soldi in ${JAR_INFO.SAVE.nome}, ${s.goalName} arriverebbe ${settimaneTesto(s.opportunitaWeeks).replace('circa ', '')} prima.`
                : 'Il tuo obiettivo resta più o meno alla stessa distanza.'}
          </div>
        </>
      )}

      {!compatto && <div className="avviso calmo">{s.message}</div>}

      {s.tips?.length > 0 && (
        <ul className="piccolo morbido" style={{ margin: 0, paddingLeft: 20 }}>
          {s.tips.map((t: string, i: number) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}

      {!s.affordable && <div className="avviso attenzione">Ti mancano {formatCents(Math.abs(s.balanceAfterCents))} in questo salvadanaio 😅</div>}
    </div>
  );
}
