/**
 * CELEBRAZIONI — coriandoli, monete che volano e suono opzionale.
 * Divertenti ma brevi: l'app non deve creare dipendenza.
 */

const COLORI = ['#5B3DF5', '#16B364', '#2E90FA', '#F79009', '#FFD76E', '#FF7AC4'];

let audioContext: AudioContext | null = null;

export function suonaTono(tipo: 'successo' | 'moneta' | 'livello' = 'successo'): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioContext ??= new Ctx();
    const note = tipo === 'livello' ? [523, 659, 784, 1047] : tipo === 'moneta' ? [880, 1175] : [660, 880];
    note.forEach((freq, i) => {
      const osc = audioContext!.createOscillator();
      const gain = audioContext!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audioContext!.currentTime + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.14, audioContext!.currentTime + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext!.currentTime + i * 0.09 + 0.22);
      osc.connect(gain).connect(audioContext!.destination);
      osc.start(audioContext!.currentTime + i * 0.09);
      osc.stop(audioContext!.currentTime + i * 0.09 + 0.24);
    });
  } catch {
    /* audio non disponibile: nessun problema, è opzionale */
  }
}

export function lanciaConfetti(quantita = 60): void {
  if (typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const contenitore = document.createElement('div');
  contenitore.className = 'confetti';
  for (let i = 0; i < quantita; i++) {
    const pezzo = document.createElement('div');
    pezzo.className = 'coriandolo';
    pezzo.style.left = `${Math.random() * 100}%`;
    pezzo.style.background = COLORI[i % COLORI.length];
    pezzo.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    pezzo.style.animationDelay = `${Math.random() * 0.4}s`;
    contenitore.appendChild(pezzo);
  }
  document.body.appendChild(contenitore);
  setTimeout(() => contenitore.remove(), 3600);
}

/** Le monete che volano verso i tre salvadanai quando arriva una entrata. */
export function monetineVerso(bersagli: { x: number; y: number }[], partenza?: { x: number; y: number }): void {
  if (typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const da = partenza ?? { x: window.innerWidth / 2, y: window.innerHeight / 3 };
  bersagli.forEach((bersaglio, indice) => {
    for (let i = 0; i < 5; i++) {
      const moneta = document.createElement('div');
      moneta.className = 'moneta-volante';
      moneta.textContent = '🪙';
      moneta.style.left = `${da.x}px`;
      moneta.style.top = `${da.y}px`;
      moneta.style.setProperty('--dx', `${bersaglio.x - da.x + (Math.random() * 40 - 20)}px`);
      moneta.style.setProperty('--dy', `${bersaglio.y - da.y + (Math.random() * 30 - 15)}px`);
      moneta.style.animationDelay = `${indice * 0.12 + i * 0.05}s`;
      document.body.appendChild(moneta);
      setTimeout(() => moneta.remove(), 1600);
    }
  });
}

/** Esegue le celebrazioni richieste dal server. */
export function celebra(codici: string[] | undefined, suono: boolean): void {
  if (!codici?.length) return;
  if (codici.includes('CONFETTI') || codici.includes('BADGE')) {
    lanciaConfetti(80);
    if (suono) suonaTono('livello');
  } else if (codici.includes('MONETE') || codici.includes('CRESCITA') || codici.includes('CUORI')) {
    lanciaConfetti(30);
    if (suono) suonaTono('moneta');
  } else if (codici.includes('COSTANZA') || codici.includes('OBIETTIVO_PRONTO')) {
    lanciaConfetti(50);
    if (suono) suonaTono('successo');
  }
}
