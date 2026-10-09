import { useEffect, useState } from 'react';
import { AppState, Switch, Text, View } from 'react-native';

import { CardList, CategoryCard, ListRow } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import {
  AVAILABILITY_MESSAGES,
  authenticate,
  getBiometricAvailability,
  updateAppLockSettings,
  useAppLockSettings,
  type BiometricAvailability,
} from './appLock';

export function AppLockSettingsSection() {
  const settings = useAppLockSettings();
  const { colors, spacing, fontSize } = useTheme();
  const [availability, setAvailability] = useState<BiometricAvailability | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Relue au retour au premier plan : une empreinte a pu être ajoutée ou retirée
  // dans les réglages du téléphone.
  useEffect(() => {
    let active = true;
    const check = () => {
      getBiometricAvailability()
        .then((a) => {
          if (!active) return;
          setAvailability(a);
          if (a !== 'available' && settings.enabled) {
            updateAppLockSettings({ enabled: false, notice: AVAILABILITY_MESSAGES[a] });
          }
          // Biométrie reconfigurée : l'avertissement n'a plus lieu d'être.
          if (a === 'available' && settings.notice) updateAppLockSettings({ notice: null });
        })
        .catch(() => undefined);
    };
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, [settings.enabled, settings.notice]);

  const toggle = async (value: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const a = await getBiometricAvailability();
      setAvailability(a);
      if (value && a !== 'available') return;
      // Activer comme désactiver passe par une authentification : on vérifie
      // que le capteur répond (et iOS demande l'accès à Face ID à ce moment-là).
      const outcome = await authenticate(value ? 'Activer le verrouillage' : 'Désactiver le verrouillage');
      if (outcome.ok) updateAppLockSettings({ enabled: value, notice: null });
      else setError(outcome.message);
    } finally {
      setBusy(false);
    }
  };

  const unavailable = availability !== null && availability !== 'available';
  const muted = { color: colors.textMuted, fontSize: fontSize.small };
  const warning = { color: colors.danger, fontSize: fontSize.small };

  return (
    <CategoryCard tint={colors.tints.mint} icon="lock-closed-outline" title="Sécurité">
      <CardList>
        <ListRow
          title="Verrouiller l'app"
          subtitle="Face ID, empreinte ou code du téléphone à l'ouverture"
          right={
            <Switch
              value={settings.enabled}
              onValueChange={(v) => void toggle(v)}
              disabled={busy || (unavailable && !settings.enabled)}
              trackColor={{ true: colors.accent }}
              accessibilityLabel="Verrouiller l'app"
            />
          }
          chevron={false}
          isLast
        />
      </CardList>
      <View style={{ paddingHorizontal: spacing.xs, gap: spacing.sm }}>
        {unavailable && (
          <Text style={warning}>
            {settings.notice ? 'Verrouillage désactivé automatiquement. ' : ''}
            {AVAILABILITY_MESSAGES[availability]}
          </Text>
        )}
        {error && <Text style={warning}>{error}</Text>}
        {settings.enabled && (
          <Text style={muted}>
            Redemandé à chaque ouverture et au retour dans l&apos;app après plus d&apos;une minute en arrière-plan.
          </Text>
        )}
      </View>
    </CategoryCard>
  );
}
