/** HOME — i tre salvadanai, l'obiettivo principale e le cose da fare oggi. */
import { useState } from 'react';
import { useApp, nuovoClientId } from '../state/store';
import { api } from '../lib/api';
import { Bottone, Card, BarraProgresso, Sheet, Vuoto } from '../components/ui';
import { SplitSliders } from '../components/SplitSliders';
import { formatCents, formatDayMonth, settimaneTesto, formatDate, formatPercent } from '../lib/format';
import { splitValido, type Split } from '../lib/split';
import { monetineVerso } from '../lib/celebrate';
import { SuggerimentoInstallazione } from '../components/Installa';

export function Home({ vaiA }: { vaiA: (schermata: string, dati?: unknown) => void }) {
  const { stato, childId, azione } = useApp();
  const [entrataAperta, setEntrataAperta] = useState<any | null>(null);
  const [split, setSplit] = useState<Split>({ save: 60, spend: 30, give: 10 });
  const [inCorso, setInCorso] = useState(false);

  if (!stato) return null;
  const { jars, primaryGoal, pendingIncomes, jobRequests, notifications } = stato;
  const minGive = stato.child.settings.minGivePercent;

  function apriEntrata(entrata: any) {
    setSplit(stato.child.settings.defaultSplit);
    setEntrataAperta(entrata);
  }

  async function confermaDivisione() {
    if (!entrataAperta || !childId) return;
    setInCorso(true);
    const clientId = nuovoClientId();
    const esito = await azione(
      () => api.post(`/children/${childId}/pending-incomes/${entrataAperta.id}/allocate`, { split, clientId }),
      {
        offline: {
          kind: 'ALLOCATE',
          clientId,
          occurredAt: new Date().toISOString(),
          payload: { pendingIncomeId: entrataAperta.id, split },
        },
      },
    );
    setInCorso(false);
    setEntrataAperta(null);
    if (esito !== null) {
      // le monete volano verso i tre salvadanai
      const bersagli = ['salvadanaio-SAVE', 'salvadanaio-SPEND', 'salvadanaio-GIVE']
        .map((id) => document.getElementById(id)?.getBoundingClientRect())
        .filter(Boolean)
        .map((r) => ({ x: r!.left + r!.width / 2, y: r!.top + r!.height / 2 }));
      monetineVerso(bersagli);
    }
  }

  const richiesteInAttesa = jobRequests.filter((r: any) => r.status === 'PENDING');

  return (
    <div className="contenuto">
      {/* ---------------------------------------------- COSE DA FARE OGGI */}
      {pendingIncomes.length > 0 && (
        <Card className="stack" style={{ borderColor: 'var(--viola)', borderWidth: 2 }}>
          <div className="centrato">
            <div style={{ fontSize: 44 }}>💌</div>
            <h2>Sono arrivati dei soldi!</h2>
          </div>
          {pendingIncomes.map((e: any) => (
            <button key={e.id} className="voce" onClick={() => apriEntrata(e)} style={{ background: 'none', border: 0, cursor: 'pointer', width: '100%' }}>
              <div className="ico-cerchio">💶</div>
              <div className="testo">
                <div className="titolo">{e.description}</div>
                <div className="sotto">Decidi tu come dividerli</div>
              </div>
              <div className="importo entrata">{formatCents(e.amountCents)}</div>
            </button>
          ))}
          <Bottone onClick={() => apriEntrata(pendingIncomes[0])}>🫙 Dividi adesso</Bottone>
        </Card>
      )}

      {/* ------------------------------------------------ OBIETTIVO GRANDE */}
      {primaryGoal ? (
        <Card className="obiettivo-grande stack" onClick={() => vaiA('obiettivi')} style={{ cursor: 'pointer' }}>
          {primaryGoal.imageUrl ? (
            <img className="obiettivo-immagine" src={primaryGoal.imageUrl} alt={primaryGoal.name} />
          ) : (
            <div className="obiettivo-emoji">{primaryGoal.emoji}</div>
          )}
          <h2>{primaryGoal.name}</h2>
          <div className="obiettivo-cifre">
            {formatCents(primaryGoal.progress.savedCents)} / {formatCents(primaryGoal.targetCents)}
          </div>
          <BarraProgresso percento={primaryGoal.progress.percent} />
          <div className="obiettivo-percento">{formatPercent(primaryGoal.progress.percent)}</div>
          {primaryGoal.progress.completed ? (
            <div className="avviso">🎉 Ce l’hai fatta! Puoi comprarlo.</div>
          ) : (
            <>
              <div className="obiettivo-nota">Mancano {formatCents(primaryGoal.progress.remainingCents)}</div>
              <div className="obiettivo-nota">
                Al ritmo di adesso: <span className="grassetto">{settimaneTesto(primaryGoal.progress.weeksRemaining)}</span>
                {primaryGoal.progress.projectedDate && ` (${formatDate(primaryGoal.progress.projectedDate)})`}
              </div>
            </>
          )}
        </Card>
      ) : (
        <Card>
          <Vuoto emoji="🎯" titolo="Non hai ancora un obiettivo" testo="Sceglierne uno rende tutto più facile da capire." />
          <Bottone onClick={() => vaiA('obiettivi')}>Crea il mio obiettivo</Bottone>
        </Card>
      )}

      {/* ---------------------------------------------------- SALVADANAI */}
      <div className="salvadanai">
        <button id="salvadanaio-SAVE" className="salvadanaio save" onClick={() => vaiA('obiettivi')}>
          <span className="icona">🟢</span>
          <span>
            <span className="nome">SAVE</span>
            <div className="importo">{formatCents(jars.SAVE)}</div>
            <span className="nota">{primaryGoal ? `Per ${primaryGoal.name}` : 'Il tuo risparmio'}</span>
          </span>
          <span className="freccia">›</span>
        </button>

        <button id="salvadanaio-SPEND" className="salvadanaio spend" onClick={() => vaiA('spendi')}>
          <span className="icona">🔵</span>
          <span>
            <span className="nome">SPEND</span>
            <div className="importo">{formatCents(jars.SPEND)}</div>
            <span className="nota">Puoi usarli quando vuoi</span>
          </span>
          <span className="freccia">›</span>
        </button>

        <button id="salvadanaio-GIVE" className="salvadanaio give" onClick={() => vaiA('dona')}>
          <span className="icona">🟠</span>
          <span>
            <span className="nome">GIVE</span>
            <div className="importo">{formatCents(jars.GIVE)}</div>
            <span className="nota">Donati finora: {formatCents(stato.give.totalDonatedCents)}</span>
          </span>
          <span className="freccia">›</span>
        </button>
      </div>

      {/* ------------------------------------------------ AZIONI VELOCI */}
      <div className="griglia-2">
        <Bottone variante="spend" onClick={() => vaiA('spendi')}>
          🛍️ Ho speso
        </Bottone>
        <Bottone variante="save" onClick={() => vaiA('guadagna')}>
          💰 Guadagna
        </Bottone>
      </div>

      {richiesteInAttesa.length > 0 && (
        <Card className="compatta">
          <div className="riga">
            <span style={{ fontSize: 24 }}>⏳</span>
            <div className="testo">
              <div className="grassetto">
                {richiesteInAttesa.length === 1 ? '1 lavoro in attesa' : `${richiesteInAttesa.length} lavori in attesa`}
              </div>
              <div className="piccolo morbido">Un genitore deve approvare.</div>
            </div>
          </div>
        </Card>
      )}

      {/* ---------------------------------------------------- NOTIFICHE */}
      {notifications.length > 0 && (
        <Card>
          <div className="sezione-titolo">
            <h2>Novità</h2>
            <button className="azione" onClick={() => vaiA('storico')}>
              Storico →
            </button>
          </div>
          <div className="lista">
            {notifications.slice(0, 4).map((n: any) => (
              <div className="voce" key={n.id}>
                <div className="ico-cerchio">{n.emoji}</div>
                <div className="testo">
                  <div className="titolo" style={{ whiteSpace: 'normal' }}>{n.message}</div>
                  <div className="sotto">{formatDayMonth(n.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <SuggerimentoInstallazione />

      {/* --------------------------------------------- SHEET: DIVIDI SOLDI */}
      {entrataAperta && (
        <Sheet titolo={`Nuova entrata: ${formatCents(entrataAperta.amountCents)}`} emoji="💌" onClose={() => setEntrataAperta(null)}>
          <p className="morbido" style={{ marginBottom: 12 }}>
            <span className="grassetto">Decidi tu</span> come dividere {formatCents(entrataAperta.amountCents)} nei tuoi tre salvadanai.
          </p>
          <SplitSliders split={split} onChange={setSplit} totaleCents={entrataAperta.amountCents} minGive={minGive} />
          <Bottone onClick={() => void confermaDivisione()} disabled={inCorso || !splitValido(split, minGive)} style={{ marginTop: 12 }}>
            {inCorso ? 'Divido…' : '✨ Dividi i soldi'}
          </Bottone>
        </Sheet>
      )}
    </div>
  );
}
