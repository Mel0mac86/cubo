/** 💰 GUADAGNA — i lavoretti extra: richiedi, aspetta l'approvazione, incassa. */
import { useState } from 'react';
import { useApp, nuovoClientId } from '../state/store';
import { api } from '../lib/api';
import { Bottone, Card, Sheet, Vuoto, Campo } from '../components/ui';
import { formatCents, formatDayMonth } from '../lib/format';

export function Guadagna() {
  const { stato, childId, azione } = useApp();
  const [lavoroAperto, setLavoroAperto] = useState<any | null>(null);
  const [nota, setNota] = useState('');

  if (!stato) return null;
  const richiestePerLavoro = new Map<string, any>(
    stato.jobRequests.filter((r: any) => r.status === 'PENDING').map((r: any) => [r.jobId, r]),
  );

  async function chiediLavoro() {
    if (!lavoroAperto || !childId) return;
    const clientId = nuovoClientId();
    const esito = await azione(
      () => api.post(`/children/${childId}/jobs/${lavoroAperto.id}/request`, { note: nota || undefined }),
      {
        messaggio: '⏳ Richiesta inviata! Aspetta l’approvazione.',
        offline: { kind: 'JOB_REQUEST', clientId, occurredAt: new Date().toISOString(), payload: { jobId: lavoroAperto.id, note: nota || undefined } },
      },
    );
    if (esito !== null) {
      setLavoroAperto(null);
      setNota('');
    }
  }

  const storicoRichieste = stato.jobRequests.filter((r: any) => r.status !== 'PENDING').slice(0, 8);

  return (
    <div className="contenuto">
      <div className="sezione-titolo">
        <h1>💰 Guadagna</h1>
      </div>
      <p className="morbido piccolo">
        Scegli un lavoretto, fallo davvero e chiedi l’approvazione. Quando un genitore dice sì, i soldi si dividono
        automaticamente nei tuoi tre salvadanai.
      </p>

      {stato.jobs.length === 0 ? (
        <Card>
          <Vuoto emoji="🧰" titolo="Nessun lavoretto disponibile" testo="Chiedi a un genitore di aggiungerne qualcuno dalla modalità genitore." />
        </Card>
      ) : (
        <div className="stack-s">
          {stato.jobs.map((l: any) => {
            const inAttesa = richiestePerLavoro.get(l.id);
            return (
              <Card key={l.id} className="compatta">
                <div className="riga">
                  <div className="ico-cerchio" style={{ fontSize: 26 }}>{l.emoji}</div>
                  <div className="testo">
                    <div className="grassetto">{l.title}</div>
                    {l.description && <div className="piccolo morbido">{l.description}</div>}
                  </div>
                  <div className="importo entrata" style={{ fontSize: 20 }}>{formatCents(l.rewardCents)}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                  {inAttesa ? (
                    <div className="badge-stato attesa">⏳ In attesa di approvazione</div>
                  ) : (
                    <Bottone variante="save" onClick={() => setLavoroAperto(l)}>
                      RICHIEDI LAVORO
                    </Bottone>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {storicoRichieste.length > 0 && (
        <Card>
          <div className="sezione-titolo">
            <h2>Le mie richieste</h2>
          </div>
          <div className="lista">
            {storicoRichieste.map((r: any) => (
              <div className="voce" key={r.id}>
                <div className="ico-cerchio">{r.jobEmoji ?? '💪'}</div>
                <div className="testo">
                  <div className="titolo">{r.jobTitle}</div>
                  <div className="sotto">
                    {formatDayMonth(r.decidedAt ?? r.requestedAt)}
                    {r.parentNote ? ` · “${r.parentNote}”` : ''}
                  </div>
                </div>
                <span className={`badge-stato ${r.status === 'APPROVED' ? 'approvato' : 'rifiutato'}`}>
                  {r.status === 'APPROVED' ? `✅ ${formatCents(r.approvedRewardCents ?? r.requestedRewardCents)}` : '❌ No'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {lavoroAperto && (
        <Sheet titolo={lavoroAperto.title} emoji={lavoroAperto.emoji} onClose={() => setLavoroAperto(null)}>
          <div className="stack">
            <div className="centrato">
              <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--save)' }}>{formatCents(lavoroAperto.rewardCents)}</div>
              <p className="morbido piccolo">Un genitore controllerà e poi approverà.</p>
            </div>
            <Campo label="Vuoi scrivere qualcosa? (facoltativo)">
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="L’ho già fatto tutto!" maxLength={200} />
            </Campo>
            <Bottone variante="save" onClick={() => void chiediLavoro()}>
              ⏳ Invia la richiesta
            </Bottone>
          </div>
        </Sheet>
      )}
    </div>
  );
}
