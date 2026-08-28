/** OBIETTIVI — crea, scegli il principale, guarda i progressi, completa. */
import { useRef, useState } from 'react';
import { useApp } from '../state/store';
import { api } from '../lib/api';
import { Bottone, Campo, CampoEuro, Card, BarraProgresso, Sheet, Vuoto, SceltaEmoji } from '../components/ui';
import { formatCents, formatDate, settimaneTesto, formatPercent } from '../lib/format';

const EMOJI_OBIETTIVI = ['🚲', '🎮', '🛴', '🎧', '🏖️', '📱', '⚽', '🎸', '📚', '⭐'];

export function Obiettivi() {
  const { stato, childId, azione, aggiorna } = useApp();
  const [nuovo, setNuovo] = useState(false);
  const [nome, setNome] = useState('');
  const [emoji, setEmoji] = useState('🚲');
  const [prezzo, setPrezzo] = useState<number | null>(null);
  const [giaRisparmiato, setGiaRisparmiato] = useState<number | null>(0);
  const [dataDesiderata, setDataDesiderata] = useState('');
  const [immagine, setImmagine] = useState<string | null>(null);
  const inputFile = useRef<HTMLInputElement>(null);

  if (!stato) return null;
  const attivi = stato.goals.filter((g: any) => g.status === 'ACTIVE');
  const completati = stato.goals.filter((g: any) => g.status === 'COMPLETED');

  async function creaObiettivo() {
    if (!childId || !prezzo) return;
    const esito = await azione(
      () =>
        api.post(`/children/${childId}/goals`, {
          name: nome.trim(),
          emoji,
          targetCents: prezzo,
          savedAtCreationCents: giaRisparmiato ?? 0,
          targetDate: dataDesiderata || null,
          imageUrl: immagine,
          makePrimary: true,
        }),
      { messaggio: `Nuovo obiettivo: ${emoji} ${nome} 🎯` },
    );
    if (esito !== null) {
      setNuovo(false);
      setNome('');
      setPrezzo(null);
      setImmagine(null);
      setGiaRisparmiato(0);
      setDataDesiderata('');
      await aggiorna();
    }
  }

  function caricaFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) return alert('La foto è troppo grande: scegline una più piccola.');
    const lettore = new FileReader();
    lettore.onload = () => setImmagine(String(lettore.result));
    lettore.readAsDataURL(file);
  }

  return (
    <div className="contenuto">
      <div className="sezione-titolo">
        <h1>🎯 I miei obiettivi</h1>
        <button className="azione" onClick={() => setNuovo(true)}>
          + Nuovo
        </button>
      </div>

      {attivi.length === 0 && <Card><Vuoto emoji="🎯" titolo="Nessun obiettivo attivo" testo="Creane uno: ti dirò quante settimane mancano." /></Card>}

      {attivi.map((g: any) => (
        <Card key={g.id} className="stack">
          <div className="riga">
            {g.imageUrl ? <img src={g.imageUrl} alt={g.name} style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover' }} /> : <span style={{ fontSize: 40 }}>{g.emoji}</span>}
            <div className="testo">
              <h3>{g.name}</h3>
              <div className="piccolo morbido">
                {formatCents(g.progress.savedCents)} di {formatCents(g.targetCents)}
                {g.targetDate && ` · entro il ${formatDate(g.targetDate)}`}
              </div>
            </div>
            {g.isPrimary && <span className="badge-stato approvato">PRINCIPALE</span>}
          </div>

          <BarraProgresso percento={g.progress.percent} />
          <div className="riga">
            <span className="grassetto" style={{ color: 'var(--save)', fontSize: 20 }}>{formatPercent(g.progress.percent)}</span>
            <span className="spazio" />
            <span className="piccolo morbido">
              {g.progress.completed ? 'Obiettivo raggiunto!' : `Mancano ${formatCents(g.progress.remainingCents)} · ${settimaneTesto(g.progress.weeksRemaining)}`}
            </span>
          </div>

          <div className="riga-bottoni">
            {g.progress.completed ? (
              <Bottone
                variante="save"
                onClick={() => void azione(() => api.post(`/children/${childId}/goals/${g.id}/complete`))}
              >
                🎉 L’ho comprato!
              </Bottone>
            ) : (
              <>
                {!g.isPrimary && (
                  <Bottone variante="secondario" piccolo onClick={() => void azione(() => api.post(`/children/${childId}/goals/${g.id}/primary`), { messaggio: 'Nuovo obiettivo principale!' })}>
                    Rendi principale
                  </Bottone>
                )}
                <Bottone variante="fantasma" piccolo onClick={() => void azione(() => api.del(`/children/${childId}/goals/${g.id}`), { messaggio: 'Obiettivo archiviato.' })}>
                  Archivia
                </Bottone>
              </>
            )}
          </div>
        </Card>
      ))}

      {completati.length > 0 && (
        <Card>
          <div className="sezione-titolo">
            <h2>🏆 Già raggiunti</h2>
          </div>
          <div className="lista">
            {completati.map((g: any) => (
              <div className="voce" key={g.id}>
                <div className="ico-cerchio">{g.emoji}</div>
                <div className="testo">
                  <div className="titolo">{g.name}</div>
                  <div className="sotto">{formatDate(g.completedAt)}</div>
                </div>
                <div className="importo">{formatCents(g.targetCents)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {nuovo && (
        <Sheet titolo="Nuovo obiettivo" emoji="🎯" onClose={() => setNuovo(false)}>
          <div className="stack">
            <Campo label="Che cosa vuoi?">
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Bicicletta" autoFocus maxLength={60} />
            </Campo>
            <Campo label="Scegli un'immagine">
              <SceltaEmoji valore={emoji} onChange={setEmoji} opzioni={EMOJI_OBIETTIVI} />
            </Campo>
            <div className="riga">
              <Bottone variante="neutro" piccolo onClick={() => inputFile.current?.click()}>
                📷 Usa una foto
              </Bottone>
              {immagine && (
                <>
                  <img src={immagine} alt="anteprima" style={{ width: 46, height: 46, borderRadius: 12, objectFit: 'cover' }} />
                  <Bottone variante="fantasma" piccolo onClick={() => setImmagine(null)}>
                    Togli
                  </Bottone>
                </>
              )}
              <input ref={inputFile} type="file" accept="image/*" hidden onChange={caricaFoto} />
            </div>
            <CampoEuro label="Quanto costa?" valoreCents={prezzo} onChange={setPrezzo} />
            <CampoEuro label="Hai già messo da parte qualcosa?" valoreCents={giaRisparmiato} onChange={setGiaRisparmiato} aiuto="Soldi che hai già fuori dall'app. Se non ne hai, lascia 0." />
            <Campo label="Per quando ti piacerebbe? (facoltativo)">
              <input type="date" value={dataDesiderata} onChange={(e) => setDataDesiderata(e.target.value)} />
            </Campo>
            <Bottone onClick={() => void creaObiettivo()} disabled={!nome.trim() || !prezzo || prezzo <= 0}>
              Crea l’obiettivo
            </Bottone>
          </div>
        </Sheet>
      )}
    </div>
  );
}
