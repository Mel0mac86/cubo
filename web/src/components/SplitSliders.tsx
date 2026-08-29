/**
 * I tre slider dei salvadanai (SAVE / SPEND / GIVE nei dati).
 * Il totale è sempre 100% e il dono non può scendere sotto la regola di famiglia:
 * l'app corregge da sola invece di dare errori al bambino.
 */
import { formatCents, JAR_INFO } from '../lib/format';
import { normalizzaSplit, ripartisci, splitValido, type Split } from '../lib/split';

const RIGHE: { chiave: keyof Split; etichetta: string; emoji: string; classe: string }[] = [
  { chiave: 'save', etichetta: JAR_INFO.SAVE.nome, emoji: JAR_INFO.SAVE.emoji, classe: 'slider-save' },
  { chiave: 'spend', etichetta: JAR_INFO.SPEND.nome, emoji: JAR_INFO.SPEND.emoji, classe: 'slider-spend' },
  { chiave: 'give', etichetta: JAR_INFO.GIVE.nome, emoji: JAR_INFO.GIVE.emoji, classe: 'slider-give' },
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
            <span className="aiuto piccolo morbido">In famiglia avete deciso: {JAR_INFO.GIVE.nome} almeno {minGive}%.</span>
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
