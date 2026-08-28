/**
 * I tre slider SAVE / SPEND / GIVE.
 * Il totale è sempre 100% e GIVE non può scendere sotto la regola di famiglia:
 * l'app corregge da sola invece di dare errori al bambino.
 */
import { formatCents } from '../lib/format';
import { normalizzaSplit, ripartisci, splitValido, type Split } from '../lib/split';

const RIGHE: { chiave: keyof Split; etichetta: string; emoji: string; classe: string }[] = [
  { chiave: 'save', etichetta: 'SAVE', emoji: '🟢', classe: 'slider-save' },
  { chiave: 'spend', etichetta: 'SPEND', emoji: '🔵', classe: 'slider-spend' },
  { chiave: 'give', etichetta: 'GIVE', emoji: '🟠', classe: 'slider-give' },
];

export function SplitSliders({
  split,
  onChange,
  totaleCents,
  minGive,
}: {
  split: Split;
  onChange: (nuovo: Split) => void;
  totaleCents: number;
  minGive: number;
}) {
  const importi = splitValido(split, minGive)
    ? ripartisci(totaleCents, [split.save, split.spend, split.give])
    : [0, 0, 0];
  const totale = split.save + split.spend + split.give;
  const ok = totale === 100 && split.give >= minGive;

  return (
    <div>
      {RIGHE.map((riga, indice) => (
        <div className="slider-riga" key={riga.chiave}>
          <div className="slider-testa">
            <span className="etichetta">
              {riga.emoji} {riga.etichetta}
            </span>
            <span className="euro">{formatCents(importi[indice])}</span>
            <span className="percento">{split[riga.chiave]}%</span>
          </div>
          <input
            className={riga.classe}
            type="range"
            min={riga.chiave === 'give' ? minGive : 0}
            max={100}
            step={5}
            value={split[riga.chiave]}
            aria-label={`Percentuale ${riga.etichetta}`}
            onChange={(e) => onChange(normalizzaSplit({ ...split, [riga.chiave]: Number(e.target.value) }, minGive, riga.chiave))}
          />
          {riga.chiave === 'give' && minGive > 0 && (
            <span className="aiuto piccolo morbido">In famiglia avete deciso: GIVE almeno {minGive}%.</span>
          )}
        </div>
      ))}

      <div className={`totale-split ${ok ? 'ok' : 'ko'}`} aria-live="polite">
        {ok ? '✅' : '⚠️'} Totale {totale}%
        {!ok && totale !== 100 && ` — deve fare 100%`}
      </div>
    </div>
  );
}
