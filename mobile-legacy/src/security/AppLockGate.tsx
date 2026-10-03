import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import {
  AVAILABILITY_MESSAGES,
  LOCK_AFTER_BACKGROUND_MS,
  authenticate,
  getAppLockSettings,
  getBiometricAvailability,
  updateAppLockSettings,
} from './appLock';

/**
 * Verrou de l'espace connecté. Si le réglage est actif : authentification à
 * l'ouverture de l'app, puis à chaque retour au premier plan après plus de
 * `LOCK_AFTER_BACKGROUND_MS` en arrière-plan. Tant que l'app n'a pas été
 * déverrouillée une première fois, les écrans (et donc la lecture des données)
 * ne sont pas montés ; ensuite, l'écran de verrouillage les recouvre.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(() => getAppLockSettings().enabled);
  const [unlockedOnce, setUnlockedOnce] = useState(!locked);
  // App hors premier plan : masque le contenu (aperçu du sélecteur d'apps iOS).
  const [covered, setCovered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const authenticating = useRef(false);
  const backgroundAt = useRef<number | null>(null);

  const attempt = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    setBusy(true);
    setError(null);
    try {
      const availability = await getBiometricAvailability();
      if (availability !== 'available') {
        // Biométrie retirée du téléphone depuis l'activation : on coupe le
        // verrou plutôt que de bloquer l'accès, et on le signale dans Réglages.
        updateAppLockSettings({ enabled: false, notice: AVAILABILITY_MESSAGES[availability] });
        setLocked(false);
        setUnlockedOnce(true);
        return;
      }
      const outcome = await authenticate();
      if (outcome.ok) {
        setLocked(false);
        setUnlockedOnce(true);
      } else {
        setError(outcome.message);
      }
    } finally {
      authenticating.current = false;
      setBusy(false);
    }
  }, []);

  // Première demande automatique à chaque verrouillage ; ensuite, « Réessayer ».
  useEffect(() => {
    if (locked) void attempt();
  }, [locked, attempt]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const enabled = getAppLockSettings().enabled;
      setCovered(enabled && state !== 'active');
      // Le prompt système (code du téléphone sur Android notamment) peut faire
      // passer l'app en arrière-plan : à ignorer pendant l'authentification.
      if (authenticating.current) return;
      if (state === 'background') {
        backgroundAt.current ??= Date.now();
      } else if (state === 'active') {
        const since = backgroundAt.current;
        backgroundAt.current = null;
        if (enabled && since !== null && Date.now() - since >= LOCK_AFTER_BACKGROUND_MS) setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.fill}>
      {unlockedOnce && (
        <View
          style={styles.fill}
          // Lecteurs d'écran : rien d'accessible sous l'écran de verrouillage.
          accessibilityElementsHidden={locked}
          importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
        >
          {children}
        </View>
      )}
      {locked ? (
        <LockScreen error={error} busy={busy} onRetry={() => void attempt()} />
      ) : (
        covered && <PrivacyCover />
      )}
    </View>
  );
}

function LockScreen({ error, busy, onRetry }: { error: string | null; busy: boolean; onRetry: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.background, padding: spacing.xl, gap: spacing.lg }]}
    >
      <Ionicons name="lock-closed" size={48} color={colors.primary} />
      <Text style={{ color: colors.text, fontSize: fontSize.heading, fontWeight: '600' }}>Road est verrouillée</Text>
      <Text style={{ color: colors.textMuted, fontSize: fontSize.small, textAlign: 'center' }}>
        {busy ? 'Authentification en cours…' : (error ?? 'Déverrouille avec Face ID, ton empreinte ou le code du téléphone.')}
      </Text>
      <View style={{ alignSelf: 'stretch' }}>
        <Button label="Réessayer" onPress={onRetry} disabled={busy} />
      </View>
    </View>
  );
}

function PrivacyCover() {
  const { colors } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.background }]}>
      <Ionicons name="lock-closed" size={48} color={colors.textFaint} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
