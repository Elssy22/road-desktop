import * as Network from 'expo-network';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { countPending } from '../db/localDb';
import { SyncError, syncOnce } from './syncEngine';

// Sans Realtime (prochaine étape), on interroge le serveur périodiquement pour
// voir les changements faits sur l'autre appareil.
const POLL_INTERVAL_MS = 15_000;

const isOnlineState = (s: Network.NetworkState) =>
  s.isConnected === true && s.isInternetReachable !== false;

type SyncState = {
  userId: string;
  pending: number;
  online: boolean;
  syncing: boolean;
  lastError: string | null;
  lastSyncAt: Date | null;
  /** Incrémenté à chaque changement des données locales : les écrans relisent SQLite. */
  dataVersion: number;
  syncNow: () => Promise<void>;
  /** Exécute une écriture locale, rafraîchit les écrans puis tente la sync. */
  runLocal: (op: () => Promise<void>) => Promise<void>;
};

const SyncContext = createContext<SyncState | null>(null);

/**
 * Un seul moteur de sync par utilisateur connecté, partagé par tous les onglets
 * (avant Expo Router, il vivait dans useOfflineTasks, propre à un seul écran).
 */
export function SyncProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const db = useSQLiteContext();
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const onlineRef = useRef(true);
  const inFlight = useRef(false);
  const rerun = useRef(false);

  const refresh = useCallback(async () => {
    setPending(await countPending(db, userId));
    setDataVersion((v) => v + 1);
  }, [db, userId]);

  const sync = useCallback(async () => {
    if (!onlineRef.current) return;
    if (inFlight.current) {
      rerun.current = true; // une action a eu lieu pendant la sync : on relancera
      return;
    }
    inFlight.current = true;
    setSyncing(true);
    try {
      do {
        rerun.current = false;
        const { pushed, pulled } = await syncOnce(db, userId);
        setLastError(null);
        setLastSyncAt(new Date());
        if (pushed > 0 || pulled > 0) await refresh();
      } while (rerun.current && onlineRef.current);
    } catch (e) {
      // Réseau coupé en plein vol, token expiré, etc. : l'outbox est intacte,
      // on réessaiera au prochain déclencheur.
      setLastError(e instanceof Error ? e.message : String(e));
      // Échec partiel (une table sur deux) : afficher ce qui a quand même bougé.
      if (e instanceof SyncError && (e.result.pushed > 0 || e.result.pulled > 0)) {
        await refresh().catch(() => undefined);
      }
    } finally {
      inFlight.current = false;
      setSyncing(false);
    }
  }, [db, userId, refresh]);

  // Déclencheurs : démarrage, retour du réseau, retour au premier plan, polling.
  useEffect(() => {
    let active = true;

    const applyNetworkState = (s: Network.NetworkState) => {
      const isOnline = isOnlineState(s);
      const cameBack = isOnline && !onlineRef.current;
      onlineRef.current = isOnline;
      setOnline(isOnline);
      if (cameBack) void sync();
    };

    // Le setState se fait dans le callback de la promesse (règle
    // react-hooks/set-state-in-effect), ignoré si l'effet a été démonté.
    countPending(db, userId)
      .then((n) => {
        if (active) setPending(n);
      })
      .catch((e) => setLastError(e instanceof Error ? e.message : String(e)));
    Network.getNetworkStateAsync()
      .then((s) => {
        onlineRef.current = isOnlineState(s);
        setOnline(onlineRef.current);
        void sync();
      })
      .catch(() => void sync());

    const netSub = Network.addNetworkStateListener(applyNetworkState);
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    const timer = setInterval(() => void sync(), POLL_INTERVAL_MS);

    return () => {
      active = false;
      netSub.remove();
      appSub.remove();
      clearInterval(timer);
    };
  }, [db, userId, sync]);

  // Chaque action écrit d'abord en local (UI instantanée), puis tente la sync.
  const runLocal = useCallback(
    async (op: () => Promise<void>) => {
      await op();
      await refresh();
      void sync();
    },
    [refresh, sync]
  );

  const value = useMemo(
    () => ({
      userId,
      pending,
      online,
      syncing,
      lastError,
      lastSyncAt,
      dataVersion,
      syncNow: sync,
      runLocal,
    }),
    [userId, pending, online, syncing, lastError, lastSyncAt, dataVersion, sync, runLocal]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync() doit être utilisé sous <SyncProvider>');
  return ctx;
}
