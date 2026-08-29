/**
 * Rilevamento della piattaforma per l'installazione sulla schermata Home.
 *
 * Su iPhone e iPad non esiste un prompt automatico: l'unica strada è il menu
 * Condividi di Safari. Per questo l'app spiega i passaggi invece di aspettare
 * un evento che su iOS non arriverà mai.
 */
export interface StatoInstallazione {
  /** L'app è già stata aperta dalla schermata Home (o installata). */
  installata: boolean;
  iOS: boolean;
  android: boolean;
  /** Su iOS: browser che espone "Aggiungi alla schermata Home" nel menu Condividi. */
  puoInstallareDaCondividi: boolean;
}

export function rilevaPiattaforma(): StatoInstallazione {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return { installata: false, iOS: false, android: false, puoInstallareDaCondividi: false };
  }
  const ua = navigator.userAgent;
  // iPadOS 13+ si presenta come Mac: lo si riconosce dal supporto al tocco.
  const iOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
  const android = /Android/i.test(ua);

  const installata =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return { installata, iOS, android, puoInstallareDaCondividi: iOS };
}

const CHIAVE_NASCOSTO = 'mma.installa.nascosto';

export function suggerimentoNascosto(): boolean {
  try {
    return localStorage.getItem(CHIAVE_NASCOSTO) === '1';
  } catch {
    return false;
  }
}

export function nascondiSuggerimento(): void {
  try {
    localStorage.setItem(CHIAVE_NASCOSTO, '1');
  } catch {
    /* modalità privata: pazienza, il suggerimento riapparirà */
  }
}
