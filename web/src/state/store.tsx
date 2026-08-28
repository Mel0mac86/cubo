/**
 * Stato globale dell'app: sessione, stato del bambino, coda offline, avvisi.
 * Un solo posto in cui si parla con il server, così le schermate restano semplici.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, OfflineError, applicaOttimistico, nuovoClientId, type OperazioneOffline } from '../lib/api';
import { celebra } from '../lib/celebrate';

export interface Split { save: number; spend: number; give: number }

export interface Toast { id: number; messaggio: string; tipo?: 'ok' | 'errore' }

interface Sessione {
  token: string;
  family: { id: string; name: string };
  children: any[];
}

interface Contesto {
  pronto: boolean;
  sessione: Sessione | null;
  stato: any | null;
  childId: string | null;
  online: boolean;
  inCoda: number;
  modalitaGenitore: boolean;
  toasts: Toast[];
  avvisa: (messaggio: string, tipo?: 'ok' | 'errore') => void;
  accedi: (email: string, password: string) => Promise<void>;
  registra: (dati: Record<string, unknown>) => Promise<void>;
  entraDemo: () => Promise<void>;
  esci: () => void;
  scegliBambino: (id: string) => Promise<void>;
  aggiorna: () => Promise<void>;
  sbloccaGenitore: (pin: string) => Promise<boolean>;
  bloccaGenitore: () => void;
  /**
   * Chiamate al server con gestione uniforme di errori, celebrazioni e offline.
   * Restituisce `null` SOLO in caso di errore vero: se l'operazione viene messa in
   * coda perché manca la rete è comunque un successo (per il bambino è "fatto"),
   * e la risposta è `{ accodata: true }`.
   */
  azione: <T>(fn: () => Promise<T>, opzioni?: { offline?: OperazioneOffline; messaggio?: string }) => Promise<T | { accodata: true } | null>;
  api: typeof api;
}

const Ctx = createContext<Contesto | null>(null);

export function useApp(): Contesto {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp va usato dentro <AppProvider>');
  return c;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [pronto, setPronto] = useState(false);
  const [sessione, setSessione] = useState<Sessione | null>(null);
  const [stato, setStato] = useState<any | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [inCoda, setInCoda] = useState(0);
  const [modalitaGenitore, setModalitaGenitore] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerGenitore = useRef<number | null>(null);

  const avvisa = useCallback((messaggio: string, tipo?: 'ok' | 'errore') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, messaggio, tipo }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const caricaStato = useCallback(async (id: string) => {
    try {
      const nuovo = await api.get<any>(`/children/${id}/state`);
      setStato(nuovo);
      api.salvaStato(id, nuovo);
      return nuovo;
    } catch (err) {
      // Senza rete si mostra l'ultima fotografia salvata sul telefono.
      const salvato = api.statoSalvato(id);
      if (salvato) {
        setStato(salvato);
        return salvato;
      }
      throw err;
    }
  }, []);

  const sincronizza = useCallback(
    async (id: string) => {
      if (api.coda.length === 0) return;
      try {
        const esito = await api.sincronizza(id);
        setInCoda(api.coda.length);
        if (esito) {
          setStato(esito.state);
          api.salvaStato(id, esito.state);
          const applicate = esito.results.filter((r) => r.status === 'APPLICATA').length;
          if (applicate > 0) avvisa(`Sincronizzate ${applicate} operazioni fatte offline ✅`, 'ok');
        }
      } catch {
        /* niente rete: la coda resta e si riproverà */
      }
    },
    [avvisa],
  );

  // Avvio: recupera sessione e stato salvati.
  useEffect(() => {
    api.carica();
    const idSalvato = api.childId;
    setInCoda(api.coda.length);
    (async () => {
      if (api.token) {
        try {
          const me = await api.get<{ family: any; children: any[] }>('/auth/me');
          setSessione({ token: api.token, family: me.family, children: me.children });
          const id = idSalvato && me.children.some((c) => c.id === idSalvato) ? idSalvato : me.children[0]?.id ?? null;
          if (id) {
            api.childId = id;
            setChildId(id);
            await caricaStato(id);
            await sincronizza(id);
          }
        } catch (err) {
          if (err instanceof OfflineError && idSalvato) {
            setChildId(idSalvato);
            const salvato = api.statoSalvato(idSalvato);
            if (salvato) {
              setStato(salvato);
              setSessione({ token: api.token!, family: api.famiglia ?? { id: '', name: '' }, children: [] });
            }
          } else if (err instanceof ApiError && err.status === 401) {
            api.esci();
          }
        }
      }
      setPronto(true);
    })();
  }, [caricaStato, sincronizza]);

  // Rete che va e viene.
  useEffect(() => {
    const suOnline = () => {
      setOnline(true);
      if (childId) void sincronizza(childId).then(() => caricaStato(childId));
    };
    const suOffline = () => {
      setOnline(false);
      avvisa('Sei offline: continui a usare l’app, sincronizzo dopo. 📴');
    };
    window.addEventListener('online', suOnline);
    window.addEventListener('offline', suOffline);
    return () => {
      window.removeEventListener('online', suOnline);
      window.removeEventListener('offline', suOffline);
    };
  }, [childId, sincronizza, caricaStato, avvisa]);

  const dopoAccesso = useCallback(
    async (risposta: { token: string; family: any; children: any[] }) => {
      api.salvaSessione(risposta.token, risposta.family, risposta.children[0]?.id ?? null);
      setSessione({ token: risposta.token, family: risposta.family, children: risposta.children });
      const id = risposta.children[0]?.id ?? null;
      setChildId(id);
      if (id) await caricaStato(id);
    },
    [caricaStato],
  );

  const accedi = useCallback(
    async (email: string, password: string) => {
      const r = await api.post<any>('/auth/login', { email, password });
      await dopoAccesso(r);
    },
    [dopoAccesso],
  );

  const registra = useCallback(
    async (dati: Record<string, unknown>) => {
      const r = await api.post<any>('/auth/register', dati);
      await dopoAccesso(r);
    },
    [dopoAccesso],
  );

  const entraDemo = useCallback(async () => {
    const r = await api.post<any>('/auth/demo');
    await dopoAccesso(r);
  }, [dopoAccesso]);

  const esci = useCallback(() => {
    api.esci();
    setSessione(null);
    setStato(null);
    setChildId(null);
    setModalitaGenitore(false);
  }, []);

  const scegliBambino = useCallback(
    async (id: string) => {
      api.childId = id;
      setChildId(id);
      await caricaStato(id);
    },
    [caricaStato],
  );

  const aggiorna = useCallback(async () => {
    if (childId) await caricaStato(childId);
  }, [childId, caricaStato]);

  const sbloccaGenitore = useCallback(
    async (pin: string) => {
      try {
        const r = await api.post<{ parentToken: string; expiresInMinutes: number }>('/auth/parent-mode', { pin });
        api.parentToken = r.parentToken;
        setModalitaGenitore(true);
        if (timerGenitore.current) window.clearTimeout(timerGenitore.current);
        timerGenitore.current = window.setTimeout(() => {
          api.parentToken = null;
          setModalitaGenitore(false);
          avvisa('Modalità genitore chiusa automaticamente 🔒');
        }, r.expiresInMinutes * 60_000);
        return true;
      } catch (err) {
        avvisa(err instanceof ApiError ? err.message : 'PIN non corretto.', 'errore');
        return false;
      }
    },
    [avvisa],
  );

  const bloccaGenitore = useCallback(() => {
    api.parentToken = null;
    setModalitaGenitore(false);
    if (timerGenitore.current) window.clearTimeout(timerGenitore.current);
  }, []);

  const azione = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      opzioni: { offline?: OperazioneOffline; messaggio?: string } = {},
    ): Promise<T | { accodata: true } | null> => {
      try {
        const risultato: any = await fn();
        if (risultato?.state) {
          setStato(risultato.state);
          if (childId) api.salvaStato(childId, risultato.state);
        } else if (childId) {
          await caricaStato(childId);
        }
        celebra(risultato?.celebrations, stato?.child?.settings?.soundEnabled ?? true);
        if (opzioni.messaggio) avvisa(opzioni.messaggio, 'ok');
        else if (risultato?.messages?.[0]) avvisa(risultato.messages[0], 'ok');
        return risultato as T;
      } catch (err) {
        if (err instanceof OfflineError && opzioni.offline) {
          api.accoda(opzioni.offline);
          setInCoda(api.coda.length);
          setStato((s: any) => {
            const nuovo = applicaOttimistico(s, opzioni.offline!);
            if (childId) api.salvaStato(childId, nuovo);
            return nuovo;
          });
          avvisa('Sei offline: lo salvo e lo mando appena torna la rete 📴');
          return { accodata: true };
        }
        avvisa(err instanceof ApiError || err instanceof OfflineError ? err.message : 'Qualcosa è andato storto.', 'errore');
        return null;
      }
    },
    [avvisa, caricaStato, childId, stato],
  );

  const valore = useMemo<Contesto>(
    () => ({
      pronto,
      sessione,
      stato,
      childId,
      online,
      inCoda,
      modalitaGenitore,
      toasts,
      avvisa,
      accedi,
      registra,
      entraDemo,
      esci,
      scegliBambino,
      aggiorna,
      sbloccaGenitore,
      bloccaGenitore,
      azione,
      api,
    }),
    [pronto, sessione, stato, childId, online, inCoda, modalitaGenitore, toasts, avvisa, accedi, registra, entraDemo, esci, scegliBambino, aggiorna, sbloccaGenitore, bloccaGenitore, azione],
  );

  return <Ctx.Provider value={valore}>{children}</Ctx.Provider>;
}

export { nuovoClientId };
