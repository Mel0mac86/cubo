/**
 * 👨‍👩‍👧 MODALITÀ GENITORE — protetta da PIN.
 * Qui si aggiungono soldi, si approvano i lavori, si cambiano le regole
 * e si vede come sta andando. Il bambino non può entrare senza il PIN.
 */
import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { api } from '../lib/api';
import { Bottone, Campo, CampoEuro, Card, Sheet, Vuoto, BarraProgresso } from '../components/ui';
import { SplitSliders } from '../components/SplitSliders';
import { formatCents, formatDayMonth, JAR_INFO } from '../lib/format';
import type { Split } from '../lib/split';

export function GateGenitore({ onSbloccato, onChiudi }: { onSbloccato: () => void; onChiudi: () => void }) {
  const { sbloccaGenitore } = useApp();
  const [pin, setPin] = useState('');
  const [inCorso, setInCorso] = useState(false);

  async function prova() {
    setInCorso(true);
    const ok = await sbloccaGenitore(pin);
    setInCorso(false);
    setPin('');
    if (ok) onSbloccato();
  }

  return (
    <Sheet titolo="Modalità genitore" emoji="🔒" onClose={onChiudi}>
      <div className="stack">
        <p className="morbido">Questa parte è riservata ai genitori. Inserisci il PIN di famiglia.</p>
        <Campo label="PIN">
          <input
            inputMode="numeric"
            type="password"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && pin.length >= 4 && void prova()}
            autoFocus
            style={{ fontSize: 30, letterSpacing: '.4em', textAlign: 'center' }}
          />
        </Campo>
        <Bottone onClick={() => void prova()} disabled={pin.length < 4 || inCorso}>
          {inCorso ? 'Controllo…' : 'Sblocca'}
        </Bottone>
      </div>
    </Sheet>
  );
}

export function Genitore({ onEsci }: { onEsci: () => void }) {
  const { stato, childId, azione, aggiorna, bloccaGenitore, avvisa } = useApp();
  const [sezione, setSezione] = useState<'denaro' | 'lavori' | 'regole' | 'andamento'>('denaro');
  const [dashboard, setDashboard] = useState<any | null>(null);

  useEffect(() => {
    if (!childId) return;
    api.get<any>(`/parent/children/${childId}/dashboard`, { parent: true }).then(setDashboard).catch(() => setDashboard(null));
  }, [childId, stato]);

  if (!stato) return null;

  return (
    <div className="contenuto">
      <div className="sezione-titolo">
        <h1>👨‍👩‍👧 Genitore</h1>
        <button
          className="azione"
          onClick={() => {
            bloccaGenitore();
            onEsci();
          }}
        >
          🔒 Esci
        </button>
      </div>
      <p className="piccolo morbido">
        Bambino: <span className="grassetto">{stato.child.name}</span> · Totale {formatCents(stato.jars.totalCents)}
      </p>

      <div className="chip-riga">
        {[
          { id: 'denaro', label: '💶 Denaro' },
          { id: 'lavori', label: '💪 Lavori' },
          { id: 'regole', label: '⚙️ Regole' },
          { id: 'andamento', label: '📊 Andamento' },
        ].map((s) => (
          <button key={s.id} className={`chip ${sezione === s.id ? 'attivo' : ''}`} onClick={() => setSezione(s.id as never)}>
            {s.label}
          </button>
        ))}
      </div>

      {sezione === 'denaro' && <SezioneDenaro />}
      {sezione === 'lavori' && <SezioneLavori />}
      {sezione === 'regole' && <SezioneRegole />}
      {sezione === 'andamento' && <SezioneAndamento dashboard={dashboard} />}

      <Bottone
        variante="fantasma"
        onClick={() => {
          void azione(() => api.post(`/parent/children/${childId}/interest`, {}, { parent: true })).then(() => {
            void aggiorna();
            avvisa('Interesse verificato.', 'ok');
          });
        }}
      >
        🌱 Accredita l’interesse del mese
      </Bottone>
    </div>
  );
}

function SezioneDenaro() {
  const { stato, childId, azione, aggiorna } = useApp();
  const [importo, setImporto] = useState<number | null>(null);
  const [descrizione, setDescrizione] = useState('Paghetta');
  const [tipo, setTipo] = useState<'ALLOWANCE' | 'GIFT'>('ALLOWANCE');
  const [modo, setModo] = useState<'ASK_CHILD' | 'AUTO'>('ASK_CHILD');
  const [giroconto, setGiroconto] = useState(false);
  const [da, setDa] = useState<'SAVE' | 'SPEND' | 'GIVE'>('SPEND');
  const [a, setA] = useState<'SAVE' | 'SPEND' | 'GIVE'>('SAVE');
  const [importoGiro, setImportoGiro] = useState<number | null>(null);

  if (!stato) return null;

  async function aggiungi() {
    if (!importo || !childId) return;
    const esito = await azione(
      () => api.post(`/parent/children/${childId}/income`, { amountCents: importo, description: descrizione, type: tipo, mode: modo }, { parent: true }),
      { messaggio: modo === 'ASK_CHILD' ? `${formatCents(importo)} inviati: ora ${stato.child.name} sceglie come dividerli.` : `${formatCents(importo)} aggiunti e divisi.` },
    );
    if (esito !== null) {
      setImporto(null);
      await aggiorna();
    }
  }

  return (
    <>
      <Card className="stack">
        <h3>Aggiungi denaro</h3>
        <CampoEuro label="Importo" valoreCents={importo} onChange={setImporto} />
        <Campo label="Descrizione">
          <input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} maxLength={80} />
        </Campo>
        <Campo label="Tipo">
          <div className="riga-bottoni">
            <Bottone variante={tipo === 'ALLOWANCE' ? 'primario' : 'neutro'} onClick={() => setTipo('ALLOWANCE')} piccolo>
              💶 Paghetta
            </Bottone>
            <Bottone variante={tipo === 'GIFT' ? 'primario' : 'neutro'} onClick={() => setTipo('GIFT')} piccolo>
              🎁 Regalo
            </Bottone>
          </div>
        </Campo>
        <Campo label="Chi decide la divisione?" aiuto="Consigliato: lascia scegliere al bambino. È il cuore educativo dell'app.">
          <div className="riga-bottoni">
            <Bottone variante={modo === 'ASK_CHILD' ? 'save' : 'neutro'} onClick={() => setModo('ASK_CHILD')} piccolo>
              🧒 Il bambino
            </Bottone>
            <Bottone variante={modo === 'AUTO' ? 'primario' : 'neutro'} onClick={() => setModo('AUTO')} piccolo>
              ⚡ Divisione abituale
            </Bottone>
          </div>
        </Campo>
        <Bottone onClick={() => void aggiungi()} disabled={!importo}>
          Aggiungi {importo ? formatCents(importo) : ''}
        </Bottone>
      </Card>

      {stato.pendingIncomes.length > 0 && (
        <Card>
          <h3>In attesa che {stato.child.name} scelga</h3>
          <div className="lista">
            {stato.pendingIncomes.map((p: any) => (
              <div className="voce" key={p.id}>
                <div className="ico-cerchio">⏳</div>
                <div className="testo">
                  <div className="titolo">{p.description}</div>
                  <div className="sotto">{formatDayMonth(p.createdAt)}</div>
                </div>
                <div className="importo">{formatCents(p.amountCents)}</div>
                <Bottone
                  variante="fantasma"
                  piccolo
                  onClick={() => void azione(() => api.del(`/parent/children/${childId}/pending-incomes/${p.id}`, { parent: true }), { messaggio: 'Entrata annullata.' })}
                >
                  Annulla
                </Bottone>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="stack">
        <div className="riga">
          <h3>Giroconto fra salvadanai</h3>
          <span className="spazio" />
          <Bottone variante="fantasma" piccolo onClick={() => setGiroconto((g) => !g)}>
            {giroconto ? 'Chiudi' : 'Apri'}
          </Bottone>
        </div>
        {giroconto && (
          <>
            <p className="piccolo morbido">Serve per correggere un errore. Ogni movimento resta nello storico.</p>
            <div className="riga">
              <select value={da} onChange={(e) => setDa(e.target.value as never)} style={{ flex: 1, padding: 12, borderRadius: 12, border: '2px solid var(--bordo)' }}>
                <option value="SAVE">{JAR_INFO.SAVE.nome}</option>
                <option value="SPEND">{JAR_INFO.SPEND.nome}</option>
                <option value="GIVE">{JAR_INFO.GIVE.nome}</option>
              </select>
              <span>→</span>
              <select value={a} onChange={(e) => setA(e.target.value as never)} style={{ flex: 1, padding: 12, borderRadius: 12, border: '2px solid var(--bordo)' }}>
                <option value="SAVE">{JAR_INFO.SAVE.nome}</option>
                <option value="SPEND">{JAR_INFO.SPEND.nome}</option>
                <option value="GIVE">{JAR_INFO.GIVE.nome}</option>
              </select>
            </div>
            <CampoEuro label="Importo" valoreCents={importoGiro} onChange={setImportoGiro} />
            <Bottone
              variante="secondario"
              disabled={!importoGiro || da === a}
              onClick={() =>
                void azione(() => api.post(`/parent/children/${childId}/transfer`, { from: da, to: a, amountCents: importoGiro }, { parent: true })).then(() => setImportoGiro(null))
              }
            >
              Sposta
            </Bottone>
          </>
        )}
      </Card>
    </>
  );
}

function SezioneLavori() {
  const { stato, childId, azione, aggiorna } = useApp();
  const [richieste, setRichieste] = useState<any[]>([]);
  const [nuovo, setNuovo] = useState(false);
  const [titolo, setTitolo] = useState('');
  const [emoji, setEmoji] = useState('💪');
  const [compenso, setCompenso] = useState<number | null>(null);
  const [modifica, setModifica] = useState<any | null>(null);
  const [importoApprovato, setImportoApprovato] = useState<number | null>(null);
  const [notaGenitore, setNotaGenitore] = useState('');

  useEffect(() => {
    api.get<any[]>('/parent/job-requests?status=PENDING', { parent: true }).then(setRichieste).catch(() => setRichieste([]));
  }, [stato]);

  async function ricarica() {
    await aggiorna();
    const r = await api.get<any[]>('/parent/job-requests?status=PENDING', { parent: true }).catch(() => []);
    setRichieste(r);
  }

  return (
    <>
      <Card className="stack">
        <div className="riga">
          <h3>⏳ Richieste in attesa</h3>
          <span className="spazio" />
          <span className="badge-stato attesa">{richieste.length}</span>
        </div>
        {richieste.length === 0 ? (
          <Vuoto emoji="✅" titolo="Nessuna richiesta" testo="Quando il bambino chiede un lavoro lo trovi qui." />
        ) : (
          <div className="lista">
            {richieste.map((r) => (
              <div className="voce" key={r.id} style={{ flexWrap: 'wrap' }}>
                <div className="ico-cerchio">{r.jobEmoji}</div>
                <div className="testo">
                  <div className="titolo">{r.jobTitle}</div>
                  <div className="sotto">
                    {formatDayMonth(r.requestedAt)}
                    {r.note ? ` · “${r.note}”` : ''}
                  </div>
                </div>
                <div className="importo">{formatCents(r.requestedRewardCents)}</div>
                <div className="riga-bottoni" style={{ width: '100%', marginTop: 8 }}>
                  <Bottone
                    variante="save"
                    piccolo
                    onClick={() => void azione(() => api.post(`/parent/job-requests/${r.id}/approve`, {}, { parent: true })).then(ricarica)}
                  >
                    ✅ Approva
                  </Bottone>
                  <Bottone variante="neutro" piccolo onClick={() => { setModifica(r); setImportoApprovato(r.requestedRewardCents); setNotaGenitore(''); }}>
                    ✏️ Modifica
                  </Bottone>
                  <Bottone
                    variante="fantasma"
                    piccolo
                    onClick={() => void azione(() => api.post(`/parent/job-requests/${r.id}/reject`, { parentNote: 'Facciamolo un’altra volta!' }, { parent: true })).then(ricarica)}
                  >
                    ❌ Rifiuta
                  </Bottone>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="stack">
        <div className="riga">
          <h3>💪 Lavori disponibili</h3>
          <span className="spazio" />
          <Bottone variante="fantasma" piccolo onClick={() => setNuovo(true)}>
            + Nuovo
          </Bottone>
        </div>
        <div className="lista">
          {stato?.jobs.map((l: any) => (
            <div className="voce" key={l.id}>
              <div className="ico-cerchio">{l.emoji}</div>
              <div className="testo">
                <div className="titolo">{l.title}</div>
              </div>
              <div className="importo">{formatCents(l.rewardCents)}</div>
              <Bottone
                variante="fantasma"
                piccolo
                onClick={() => void azione(() => api.patch(`/parent/jobs/${l.id}`, { active: false }, { parent: true }), { messaggio: 'Lavoro disattivato.' }).then(ricarica)}
              >
                Togli
              </Bottone>
            </div>
          ))}
        </div>
      </Card>

      {nuovo && (
        <Sheet titolo="Nuovo lavoretto" emoji="💪" onClose={() => setNuovo(false)}>
          <div className="stack">
            <Campo label="Che lavoro è?">
              <input value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Lavare la macchina" autoFocus maxLength={60} />
            </Campo>
            <Campo label="Emoji">
              <input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} style={{ fontSize: 28, textAlign: 'center' }} />
            </Campo>
            <CampoEuro label="Compenso" valoreCents={compenso} onChange={setCompenso} />
            <Bottone
              disabled={!titolo.trim() || !compenso}
              onClick={() =>
                void azione(() => api.post('/parent/jobs', { title: titolo, emoji, rewardCents: compenso }, { parent: true }), { messaggio: 'Lavoro creato!' }).then(() => {
                  setNuovo(false);
                  setTitolo('');
                  setCompenso(null);
                  void ricarica();
                })
              }
            >
              Crea il lavoro
            </Bottone>
          </div>
        </Sheet>
      )}

      {modifica && (
        <Sheet titolo="Approva modificando" emoji="✏️" onClose={() => setModifica(null)}>
          <div className="stack">
            <p className="morbido">{modifica.jobEmoji} {modifica.jobTitle}</p>
            <CampoEuro label="Compenso approvato" valoreCents={importoApprovato} onChange={setImportoApprovato} />
            <Campo label="Messaggio per il bambino">
              <input value={notaGenitore} onChange={(e) => setNotaGenitore(e.target.value)} placeholder="Hai fatto anche i cerchioni!" maxLength={200} />
            </Campo>
            <Bottone
              variante="save"
              disabled={!importoApprovato}
              onClick={() =>
                void azione(() =>
                  api.post(`/parent/job-requests/${modifica.id}/approve`, { approvedRewardCents: importoApprovato, parentNote: notaGenitore || null }, { parent: true }),
                ).then(() => {
                  setModifica(null);
                  void ricarica();
                })
              }
            >
              ✅ Approva {importoApprovato ? formatCents(importoApprovato) : ''}
            </Bottone>
          </div>
        </Sheet>
      )}
    </>
  );
}

function SezioneRegole() {
  const { stato, childId, azione, aggiorna } = useApp();
  const impostazioni = stato?.child.settings;
  const [minGive, setMinGive] = useState(impostazioni?.minGivePercent ?? 10);
  const [split, setSplit] = useState<Split>(impostazioni?.defaultSplit ?? { save: 60, spend: 30, give: 10 });
  const [paghetta, setPaghetta] = useState<number | null>(impostazioni?.allowanceCents ?? 0);
  const [interesse, setInteresse] = useState(impostazioni?.interestCentsPerEuro ?? 5);
  const [interesseAttivo, setInteresseAttivo] = useState(impostazioni?.interestEnabled ?? true);
  const [bloccate, setBloccate] = useState<string[]>(impostazioni?.lockedFeatures ?? []);
  const [suono, setSuono] = useState(impostazioni?.soundEnabled ?? true);

  if (!stato || !impostazioni) return null;

  const FUNZIONI = [
    { id: 'SPESE', label: 'Registrare spese' },
    { id: 'LAVORI', label: 'Richiedere lavori' },
    { id: 'DONAZIONI', label: `Creare obiettivi ${JAR_INFO.GIVE.nome}` },
    { id: 'OBIETTIVI', label: 'Creare obiettivi' },
    { id: 'COACH', label: 'Money Coach' },
  ];

  async function salva() {
    await azione(
      () =>
        api.patch(
          `/parent/children/${childId}/settings`,
          {
            minGivePercent: minGive,
            defaultSplit: split,
            allowanceCents: paghetta ?? 0,
            interestCentsPerEuro: interesse,
            interestEnabled: interesseAttivo,
            lockedFeatures: bloccate,
            soundEnabled: suono,
          },
          { parent: true },
        ),
      { messaggio: 'Regole aggiornate ✅' },
    );
    await aggiorna();
  }

  return (
    <>
      <Card className="stack">
        <h3>🟠 Regola {JAR_INFO.GIVE.nome}</h3>
        <p className="piccolo morbido">{JAR_INFO.GIVE.nome} non può scendere sotto questa percentuale, salvo modifica qui.</p>
        <div className="riga">
          <input type="range" min={0} max={50} step={5} value={minGive} onChange={(e) => setMinGive(Number(e.target.value))} className="slider-give" style={{ flex: 1 }} />
          <span className="grassetto" style={{ minWidth: 52, textAlign: 'right' }}>{minGive}%</span>
        </div>
      </Card>

      <Card className="stack">
        <h3>Divisione abituale</h3>
        <p className="piccolo morbido">È la proposta che vede il bambino quando arrivano dei soldi.</p>
        <SplitSliders split={split} onChange={setSplit} totaleCents={1000} minGive={minGive} />
      </Card>

      <Card className="stack">
        <h3>💶 Paghetta ricorrente</h3>
        <CampoEuro label="Importo settimanale (per la previsione)" valoreCents={paghetta} onChange={setPaghetta} aiuto="Serve a stimare le settimane mancanti finché non c'è abbastanza storico." />
      </Card>

      <Card className="stack">
        <h3>🌱 Interesse educativo</h3>
        <label className="riga" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={interesseAttivo} onChange={(e) => setInteresseAttivo(e.target.checked)} style={{ width: 22, height: 22 }} />
          <span>Attivo</span>
        </label>
        <div className="riga">
          <input type="range" min={0} max={20} value={interesse} onChange={(e) => setInteresse(Number(e.target.value))} className="slider-save" style={{ flex: 1 }} disabled={!interesseAttivo} />
          <span className="grassetto" style={{ minWidth: 120, textAlign: 'right' }}>{interesse} cent/€</span>
        </div>
        <p className="piccolo morbido">
          Con {formatCents(stato.jars.SAVE)} in SAVE l’interesse di questo mese sarebbe {formatCents(stato.interest.preview.interestCents)}.
        </p>
      </Card>

      <Card className="stack">
        <h3>🔒 Blocca temporaneamente</h3>
        {FUNZIONI.map((f) => (
          <label key={f.id} className="riga" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={bloccate.includes(f.id)}
              onChange={(e) => setBloccate((b) => (e.target.checked ? [...b, f.id] : b.filter((x) => x !== f.id)))}
              style={{ width: 22, height: 22 }}
            />
            <span>{f.label}</span>
          </label>
        ))}
        <label className="riga" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={suono} onChange={(e) => setSuono(e.target.checked)} style={{ width: 22, height: 22 }} />
          <span>🔊 Suoni delle celebrazioni</span>
        </label>
      </Card>

      <Bottone onClick={() => void salva()}>Salva le regole</Bottone>
    </>
  );
}

function SezioneAndamento({ dashboard }: { dashboard: any | null }) {
  const { stato } = useApp();
  if (!stato) return null;
  const stats = dashboard?.stats;
  const distribuzione = stats?.distribuzioneMedia;

  return (
    <>
      <Card className="stack">
        <h3>📊 Come divide i soldi</h3>
        {distribuzione ? (
          <>
            <p className="piccolo morbido">Media su {distribuzione.scelte} scelte fatte dal bambino.</p>
            {(['save', 'spend', 'give'] as const).map((k) => (
              <div key={k}>
                <div className="riga piccolo">
                  <span className="grassetto">{k.toUpperCase()}</span>
                  <span className="spazio" />
                  <span>{distribuzione[k]}%</span>
                </div>
                <BarraProgresso percento={distribuzione[k]} piccola />
              </div>
            ))}
          </>
        ) : (
          <p className="morbido piccolo">Ancora nessuna divisione registrata.</p>
        )}
      </Card>

      <Card className="stack">
        <h3>📈 Ultime settimane</h3>
        {stats?.settimane?.length ? (
          <div className="lista">
            {stats.settimane.slice(-8).reverse().map((s: any) => (
              <div className="voce" key={s.settimana}>
                <div className="ico-cerchio" style={{ background: 'var(--save-soft)' }}>📅</div>
                <div className="testo">
                  <div className="titolo">Settimana del {formatDayMonth(s.settimana)}</div>
                  <div className="sotto">Speso {formatCents(s.spesoCents)}</div>
                </div>
                <div className="importo entrata">+{formatCents(s.risparmiatoCents)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="morbido piccolo">Nessun dato ancora.</p>
        )}
      </Card>

      <Card className="stack">
        <h3>🧾 Riepilogo</h3>
        <div className="lista">
          {stats?.perTipo?.map((t: any) => (
            <div className="voce" key={t.type}>
              <div className="testo">
                <div className="titolo">{t.label}</div>
                <div className="sotto">{t.movimenti} movimenti</div>
              </div>
              {t.entrateCents > 0 && <div className="importo entrata">+{formatCents(t.entrateCents)}</div>}
              {t.usciteCents > 0 && <div className="importo">−{formatCents(t.usciteCents)}</div>}
            </div>
          ))}
        </div>
        {dashboard?.integrity && (
          <div className={`avviso ${dashboard.integrity.ok ? '' : 'attenzione'}`}>
            {dashboard.integrity.ok ? '✅ Contabilità verificata: saldi e movimenti coincidono.' : '⚠️ Controlla i movimenti: i saldi non coincidono.'}
          </div>
        )}
      </Card>
    </>
  );
}
