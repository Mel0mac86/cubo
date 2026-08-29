/** 🟠 Salvadanaio DONO — obiettivi di beneficenza, donazioni e messaggi motivazionali. */
import { useState } from 'react';
import { useApp } from '../state/store';
import { api } from '../lib/api';
import { Bottone, Campo, CampoEuro, Card, BarraProgresso, Sheet, Vuoto } from '../components/ui';
import { formatCents, formatDate, JAR_INFO } from '../lib/format';

const CAUSE: Record<string, { emoji: string; label: string }> = {
  ANIMALI: { emoji: '🐶', label: 'Animali' },
  AMBIENTE: { emoji: '🌳', label: 'Ambiente' },
  PERSONE: { emoji: '❤️', label: 'Persone' },
  ISTRUZIONE: { emoji: '🏫', label: 'Istruzione' },
  EMERGENZE: { emoji: '🌍', label: 'Emergenze' },
};

export function Dona({ chiediGenitore }: { chiediGenitore: (azioneDopo: () => void) => void }) {
  const { stato, childId, azione, modalitaGenitore, aggiorna } = useApp();
  const [nuovo, setNuovo] = useState(false);
  const [titolo, setTitolo] = useState('');
  const [causa, setCausa] = useState('ANIMALI');
  const [obiettivoCents, setObiettivoCents] = useState<number | null>(null);
  const [nota, setNota] = useState('');
  const [donazioneAperta, setDonazioneAperta] = useState<any | null>(null);
  const [importoDonazione, setImportoDonazione] = useState<number | null>(null);
  const [notaDonazione, setNotaDonazione] = useState('');

  if (!stato) return null;
  const give = stato.give;

  async function creaObiettivoGive() {
    if (!childId || !obiettivoCents) return;
    const esito = await azione(
      () => api.post(`/children/${childId}/donation-goals`, { title: titolo.trim(), cause: causa, targetCents: obiettivoCents, note: nota || null }),
      { messaggio: `Obiettivo ${JAR_INFO.GIVE.nome} creato ❤️` },
    );
    if (esito !== null) {
      setNuovo(false);
      setTitolo('');
      setObiettivoCents(null);
      setNota('');
      await aggiorna();
    }
  }

  async function confermaDonazione() {
    if (!childId || !importoDonazione) return;
    const esito = await azione(
      () =>
        api.post(
          `/parent/children/${childId}/donations`,
          {
            amountCents: importoDonazione,
            cause: donazioneAperta?.cause ?? causa,
            donationGoalId: donazioneAperta?.id ?? null,
            note: notaDonazione || null,
          },
          { parent: true },
        ),
    );
    if (esito !== null) {
      setDonazioneAperta(null);
      setImportoDonazione(null);
      setNotaDonazione('');
    }
  }

  function apriDonazione(obiettivo: any | null) {
    const apri = () => {
      setDonazioneAperta(obiettivo ?? { id: null, cause: 'PERSONE', title: 'Donazione libera' });
      setImportoDonazione(obiettivo?.remainingCents ?? null);
    };
    if (modalitaGenitore) apri();
    else chiediGenitore(apri);
  }

  return (
    <div className="contenuto">
      <Card className="stack" style={{ background: 'linear-gradient(140deg,#ffab3d,#f79009)', color: '#fff', border: 0 }}>
        <div className="riga">
          <span style={{ fontSize: 40 }}>🟠</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.06em' }}>{JAR_INFO.GIVE.nome}</div>
            <div style={{ fontSize: 34, fontWeight: 800 }}>{formatCents(stato.jars.GIVE)}</div>
            <div className="piccolo">Donati finora: {formatCents(give.totalDonatedCents)}</div>
          </div>
        </div>
        <p className="piccolo">{give.message}</p>
      </Card>

      <div className="sezione-titolo">
        <h2>❤️ I miei obiettivi di dono</h2>
        <button className="azione" onClick={() => setNuovo(true)}>
          + Nuovo
        </button>
      </div>

      {give.donationGoals.length === 0 ? (
        <Card>
          <Vuoto emoji="🐶" titolo="Chi vuoi aiutare?" testo="Scegli una causa e datti un piccolo obiettivo." />
          <Bottone variante="give" onClick={() => setNuovo(true)}>
            Scegli una causa
          </Bottone>
        </Card>
      ) : (
        give.donationGoals.map((g: any) => (
          <Card key={g.id} className="stack">
            <div className="riga">
              <span style={{ fontSize: 34 }}>{CAUSE[g.cause]?.emoji ?? '❤️'}</span>
              <div className="testo">
                <h3>{g.title}</h3>
                <div className="piccolo morbido">
                  {formatCents(g.donatedCents)} di {formatCents(g.targetCents)}
                </div>
              </div>
              {g.status === 'COMPLETED' && <span className="badge-stato approvato">🎉 FATTO</span>}
            </div>
            <BarraProgresso percento={g.progressPercent} piccola />
            {g.note && <p className="piccolo morbido">“{g.note}”</p>}
            {g.status !== 'COMPLETED' && (
              <Bottone variante="give" onClick={() => apriDonazione(g)}>
                ❤️ Dona ora {g.remainingCents > 0 && `(mancano ${formatCents(g.remainingCents)})`}
              </Bottone>
            )}
          </Card>
        ))
      )}

      <Bottone variante="secondario" onClick={() => apriDonazione(null)} disabled={stato.jars.GIVE <= 0}>
        Fai una donazione libera
      </Bottone>
      <p className="piccolo morbido centrato">
        🔒 Per far uscire davvero i soldi serve la conferma di un genitore. Nessun pagamento automatico.
      </p>

      {give.donations.length > 0 && (
        <Card>
          <div className="sezione-titolo">
            <h2>Donazioni fatte</h2>
          </div>
          <div className="lista">
            {give.donations.map((d: any) => (
              <div className="voce" key={d.id}>
                <div className="ico-cerchio">{d.causeEmoji}</div>
                <div className="testo">
                  <div className="titolo">{d.goalTitle ?? d.causeLabel}</div>
                  <div className="sotto">
                    {formatDate(d.createdAt)}
                    {d.note ? ` · “${d.note}”` : ''}
                  </div>
                </div>
                <div className="importo">{formatCents(d.amountCents)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {nuovo && (
        <Sheet titolo="Nuovo obiettivo di dono" emoji="❤️" onClose={() => setNuovo(false)}>
          <div className="stack">
            <Campo label="Chi vuoi aiutare?">
              <input value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Rifugio degli animali" maxLength={60} />
            </Campo>
            <Campo label="Quale causa?">
              <div className="chip-riga">
                {Object.entries(CAUSE).map(([id, info]) => (
                  <button key={id} className={`chip ${causa === id ? 'attivo' : ''}`} onClick={() => setCausa(id)}>
                    {info.emoji} {info.label}
                  </button>
                ))}
              </div>
            </Campo>
            <CampoEuro label="Quanto vuoi donare in tutto?" valoreCents={obiettivoCents} onChange={setObiettivoCents} />
            <Campo label="Perché ti sta a cuore? (facoltativo)">
              <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
            </Campo>
            <Bottone variante="give" onClick={() => void creaObiettivoGive()} disabled={!titolo.trim() || !obiettivoCents}>
              Crea l’obiettivo
            </Bottone>
          </div>
        </Sheet>
      )}

      {donazioneAperta && (
        <Sheet titolo="Conferma donazione" emoji="🔒" onClose={() => setDonazioneAperta(null)}>
          <div className="stack">
            <div className="avviso">Questa operazione richiede la conferma di un genitore (modalità genitore attiva).</div>
            <CampoEuro label="Quanto doni?" valoreCents={importoDonazione} onChange={setImportoDonazione} aiuto={`Nel salvadanaio ${JAR_INFO.GIVE.nome} ci sono ${formatCents(stato.jars.GIVE)}.`} />
            <Campo label="Vuoi scrivere una nota?">
              <input value={notaDonazione} onChange={(e) => setNotaDonazione(e.target.value)} placeholder="Per i cani del rifugio" maxLength={300} />
            </Campo>
            <Bottone variante="give" onClick={() => void confermaDonazione()} disabled={!importoDonazione || importoDonazione > stato.jars.GIVE}>
              ❤️ Conferma la donazione
            </Bottone>
          </div>
        </Sheet>
      )}
    </div>
  );
}
