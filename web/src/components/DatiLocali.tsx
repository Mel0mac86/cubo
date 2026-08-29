/**
 * MODALITÀ LOCALE — dati e backup.
 *
 * Senza server i dati vivono solo su questo telefono. È importante che si
 * capisca (e che si possa fare una copia): se Safari cancella i dati dei siti,
 * senza backup non si recuperano.
 */
import { useRef, useState } from 'react';
import { Bottone, Card, Sheet } from './ui';
import { esportaBackup, importaBackup } from '../lib/locale/archivio';

export function DatiLocali({ onRipristinato }: { onRipristinato: () => void }) {
  const [aperto, setAperto] = useState(false);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);
  const inputFile = useRef<HTMLInputElement>(null);

  function salvaBackup() {
    try {
      const { nomeFile, contenuto } = esportaBackup();
      const url = URL.createObjectURL(new Blob([contenuto], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = nomeFile;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setEsito({ ok: true, testo: 'Backup creato. Salvalo in File o mandalo a te stesso.' });
    } catch {
      setEsito({ ok: false, testo: 'Non sono riuscito a creare il backup.' });
    }
  }

  function ripristina(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const lettore = new FileReader();
    lettore.onload = () => {
      const risultato = importaBackup(String(lettore.result));
      if (risultato.ok) {
        setEsito({ ok: true, testo: 'Backup ripristinato!' });
        setTimeout(onRipristinato, 800);
      } else {
        setEsito({ ok: false, testo: risultato.errore });
      }
    };
    lettore.readAsText(file);
  }

  return (
    <>
      <Bottone variante="neutro" onClick={() => setAperto(true)}>
        💾 Dati e backup
      </Bottone>

      {aperto && (
        <Sheet titolo="Dati e backup" emoji="💾" onClose={() => setAperto(false)}>
          <div className="stack">
            <Card className="compatta">
              <p className="piccolo">
                📱 I tuoi dati sono <span className="grassetto">solo su questo telefono</span>. Non passano da nessun
                server e nessuno può vederli. Non si spostano da soli su altri dispositivi.
              </p>
            </Card>

            <div className="avviso attenzione">
              ⚠️ Se cancelli i dati dei siti in Safari, o togli l’app dalla schermata Home, i risparmi registrati si
              perdono. Fai un backup ogni tanto: bastano due tocchi.
            </div>

            <Bottone onClick={salvaBackup}>💾 Salva un backup</Bottone>
            <Bottone variante="neutro" onClick={() => inputFile.current?.click()}>
              📂 Ripristina da un backup
            </Bottone>
            <input ref={inputFile} type="file" accept="application/json,.json" hidden onChange={ripristina} />

            {esito && <div className={esito.ok ? 'messaggio-ok' : 'messaggio-errore'}>{esito.testo}</div>}

            <p className="piccolo morbido">
              Il backup è un file di testo con tutti i movimenti, gli obiettivi e i progressi. Puoi tenerlo in File,
              su iCloud o mandartelo via email.
            </p>
          </div>
        </Sheet>
      )}
    </>
  );
}
