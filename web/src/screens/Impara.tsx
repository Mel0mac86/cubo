/** 🎓 IMPARA — mini-lezioni da 2-3 minuti con quiz finale. */
import { useState } from 'react';
import { useApp } from '../state/store';
import { api } from '../lib/api';
import { Bottone, Card, Sheet, BarraProgresso } from '../components/ui';
import { lanciaConfetti, suonaTono } from '../lib/celebrate';

export function Impara() {
  const { stato, childId, azione } = useApp();
  const [lezione, setLezione] = useState<any | null>(null);
  const [pagina, setPagina] = useState(0);
  const [risposte, setRisposte] = useState<Record<string, number>>({});
  const [esito, setEsito] = useState<any | null>(null);
  const [caricamento, setCaricamento] = useState(false);

  if (!stato) return null;

  async function apri(id: string) {
    if (!childId) return;
    setCaricamento(true);
    try {
      const l = await api.get<any>(`/children/${childId}/lessons/${id}`);
      setLezione(l);
      setPagina(0);
      setRisposte({});
      setEsito(null);
    } catch {
      /* gestito dal toast globale in caso di errore di rete */
    } finally {
      setCaricamento(false);
    }
  }

  async function consegnaQuiz() {
    if (!lezione || !childId) return;
    const r: any = await azione(() =>
      api.post(`/children/${childId}/lessons/${lezione.id}/quiz`, {
        answers: Object.entries(risposte).map(([id, answerIndex]) => ({ id, answerIndex })),
      }),
    );
    if (r) {
      setEsito(r);
      if (r.perfetto) {
        lanciaConfetti(70);
        suonaTono('livello');
      }
    }
  }

  const completate = stato.lessons.filter((l: any) => l.completed).length;

  return (
    <div className="contenuto">
      <div className="sezione-titolo">
        <h1>🎓 Impara</h1>
      </div>
      <Card className="compatta">
        <div className="riga">
          <div className="testo">
            <div className="grassetto">
              {completate} di {stato.lessons.length} lezioni completate
            </div>
            <div className="piccolo morbido">Ogni lezione dura 2-3 minuti e finisce con un mini quiz.</div>
          </div>
          <div style={{ fontSize: 28 }}>{completate === stato.lessons.length ? '🏆' : '📚'}</div>
        </div>
        <div style={{ marginTop: 10 }}>
          <BarraProgresso percento={(completate / stato.lessons.length) * 100} piccola />
        </div>
      </Card>

      <div className="stack-s">
        {stato.lessons.map((l: any) => (
          <button key={l.id} className="card compatta" onClick={() => void apri(l.id)} style={{ textAlign: 'left', cursor: 'pointer' }} disabled={caricamento}>
            <div className="riga">
              <div className="ico-cerchio" style={{ fontSize: 24 }}>{l.emoji}</div>
              <div className="testo">
                <div className="grassetto">
                  {l.position}. {l.title}
                </div>
                <div className="piccolo morbido">{l.summary}</div>
              </div>
              {l.completed ? (
                <span className="badge-stato approvato">
                  {l.bestScore}/{l.totalQuestions}
                </span>
              ) : (
                <span className="piccolo morbido nowrap">{l.minutes} min</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {lezione && (
        <Sheet titolo={lezione.title} emoji={lezione.emoji} onClose={() => setLezione(null)}>
          {esito ? (
            <div className="stack centrato">
              <div style={{ fontSize: 56 }}>{esito.perfetto ? '🏆' : esito.score > 0 ? '👏' : '💪'}</div>
              <h2>
                {esito.score} su {esito.total}
              </h2>
              <p className="morbido">{esito.perfetto ? 'Perfetto! Hai capito tutto.' : 'Bravo! Guarda le spiegazioni qui sotto.'}</p>
              <div className="lista" style={{ textAlign: 'left' }}>
                {esito.dettagli.map((d: any, i: number) => (
                  <div className="voce" key={d.id}>
                    <div className="ico-cerchio">{d.corretta ? '✅' : '💡'}</div>
                    <div className="testo">
                      <div className="titolo" style={{ whiteSpace: 'normal' }}>
                        {lezione.quiz[i]?.question}
                      </div>
                      <div className="sotto" style={{ whiteSpace: 'normal' }}>{d.explanation}</div>
                    </div>
                  </div>
                ))}
              </div>
              {esito.xp?.length > 0 && (
                <div className="avviso">
                  +{esito.xp.reduce((a: number, x: any) => a + x.amount, 0)} XP guadagnati ⭐
                </div>
              )}
              <Bottone onClick={() => setLezione(null)}>Chiudi</Bottone>
            </div>
          ) : pagina < lezione.pages.length ? (
            <div className="stack">
              <div className="centrato">
                <div style={{ fontSize: 52 }}>{lezione.pages[pagina].emoji}</div>
                <h2>{lezione.pages[pagina].title}</h2>
              </div>
              <p>{lezione.pages[pagina].body}</p>
              <BarraProgresso percento={((pagina + 1) / (lezione.pages.length + 1)) * 100} piccola />
              <div className="riga-bottoni">
                {pagina > 0 && (
                  <Bottone variante="neutro" onClick={() => setPagina((p) => p - 1)}>
                    ← Indietro
                  </Bottone>
                )}
                <Bottone onClick={() => setPagina((p) => p + 1)}>
                  {pagina === lezione.pages.length - 1 ? '❓ Vai al quiz' : 'Avanti →'}
                </Bottone>
              </div>
            </div>
          ) : (
            <div className="stack">
              <h2>❓ Mini quiz</h2>
              {lezione.quiz.map((q: any) => (
                <Card key={q.id} className="compatta stack-s">
                  <div className="grassetto">{q.question}</div>
                  {q.options.map((o: string, i: number) => (
                    <button
                      key={i}
                      className={`chip ${risposte[q.id] === i ? 'attivo' : ''}`}
                      style={{ width: '100%', justifyContent: 'flex-start', padding: '12px 16px', whiteSpace: 'normal', textAlign: 'left' }}
                      onClick={() => setRisposte((r) => ({ ...r, [q.id]: i }))}
                    >
                      {o}
                    </button>
                  ))}
                </Card>
              ))}
              <Bottone onClick={() => void consegnaQuiz()} disabled={Object.keys(risposte).length < lezione.quiz.length}>
                Consegna il quiz
              </Bottone>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
