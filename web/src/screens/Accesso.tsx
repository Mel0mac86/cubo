/** Schermata di accesso: entra, crea la famiglia, oppure prova la demo. */
import { useState } from 'react';
import { useApp } from '../state/store';
import { Bottone, Campo, Card } from '../components/ui';
import { ApiError } from '../lib/api';

export function Accesso() {
  const { accedi, registra, entraDemo, avvisa } = useApp();
  const [modo, setModo] = useState<'accedi' | 'registra'>('accedi');
  const [caricamento, setCaricamento] = useState(false);
  const [dati, setDati] = useState({
    email: '',
    password: '',
    familyName: '',
    parentName: '',
    pin: '',
    childName: '',
    childAge: '9',
  });

  const aggiorna = (chiave: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDati((d) => ({ ...d, [chiave]: e.target.value }));

  async function invia() {
    setCaricamento(true);
    try {
      if (modo === 'accedi') {
        await accedi(dati.email, dati.password);
      } else {
        await registra({
          email: dati.email,
          password: dati.password,
          familyName: dati.familyName || 'La mia famiglia',
          parentName: dati.parentName || 'Genitore',
          pin: dati.pin,
          childName: dati.childName || undefined,
          childAge: dati.childName ? Number(dati.childAge) : undefined,
        });
      }
    } catch (err) {
      avvisa(err instanceof ApiError ? err.message : 'Non riesco a collegarmi. Controlla la connessione.', 'errore');
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <div className="schermata-accesso">
      <div className="centrato">
        <div className="logo-grande">🪙</div>
        <h1>My Money Adventure</h1>
        <p className="morbido">I tuoi tre salvadanai: risparmia, spendi, dona.</p>
      </div>

      <Card className="stack">
        <div className="chip-riga" role="tablist">
          <button className={`chip ${modo === 'accedi' ? 'attivo' : ''}`} onClick={() => setModo('accedi')} role="tab" aria-selected={modo === 'accedi'}>
            Entra
          </button>
          <button className={`chip ${modo === 'registra' ? 'attivo' : ''}`} onClick={() => setModo('registra')} role="tab" aria-selected={modo === 'registra'}>
            Crea la famiglia
          </button>
        </div>

        {modo === 'registra' && (
          <>
            <Campo label="Nome della famiglia">
              <input value={dati.familyName} onChange={aggiorna('familyName')} placeholder="Famiglia Rossi" />
            </Campo>
            <Campo label="Il tuo nome (genitore)">
              <input value={dati.parentName} onChange={aggiorna('parentName')} placeholder="Mamma / Papà" />
            </Campo>
          </>
        )}

        <Campo label="Email di famiglia">
          <input type="email" autoComplete="email" value={dati.email} onChange={aggiorna('email')} placeholder="famiglia@email.it" />
        </Campo>
        <Campo label="Password" aiuto={modo === 'registra' ? 'Almeno 8 caratteri.' : undefined}>
          <input type="password" autoComplete={modo === 'accedi' ? 'current-password' : 'new-password'} value={dati.password} onChange={aggiorna('password')} />
        </Campo>

        {modo === 'registra' && (
          <>
            <Campo label="PIN genitore" aiuto="Da 4 a 8 cifre. Serve per aprire la modalità genitore: non dirlo ai bambini!">
              <input inputMode="numeric" maxLength={8} value={dati.pin} onChange={aggiorna('pin')} placeholder="1234" />
            </Campo>
            <Campo label="Nome del bambino (opzionale)">
              <input value={dati.childName} onChange={aggiorna('childName')} placeholder="Sofia" />
            </Campo>
            {dati.childName && (
              <Campo label="Età">
                <input inputMode="numeric" value={dati.childAge} onChange={aggiorna('childAge')} />
              </Campo>
            )}
          </>
        )}

        <Bottone onClick={invia} disabled={caricamento || !dati.email || !dati.password}>
          {caricamento ? 'Un attimo…' : modo === 'accedi' ? 'Entra' : 'Crea la famiglia'}
        </Bottone>
      </Card>

      <Card className="stack">
        <div className="centrato">
          <h3>Vuoi provare subito?</h3>
          <p className="piccolo morbido">Entra nel profilo di Sofia, 9 anni, che sta risparmiando per la sua bicicletta.</p>
        </div>
        <Bottone variante="secondario" onClick={() => void entraDemo()}>
          🦄 Prova la demo di Sofia
        </Bottone>
      </Card>

      <p className="piccolo morbido centrato">
        Nessun conto bancario collegato. Nessun pagamento reale. I soldi veri restano in famiglia.
      </p>
    </div>
  );
}
