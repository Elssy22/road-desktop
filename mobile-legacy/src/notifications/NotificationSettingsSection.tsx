import { useEffect, useState } from 'react';
import { AppState, Linking, ScrollView, Switch, Text, View } from 'react-native';

import { Sheet, SheetOption } from '../components/Sheet';
import { Button, CardList, CategoryCard, ListRow } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import {
  getNotificationPermission,
  requestNotificationPermission,
  type PermissionState,
} from './scheduler';
import { formatTime, updateNotificationSettings, useNotificationSettings } from './settings';

/** Heures proposées pour le rappel du matin : de 5:00 à 22:00, par demi-heure. */
const TIME_OPTIONS = Array.from({ length: (22 - 5) * 2 + 1 }, (_, i) => ({
  hour: 5 + Math.floor(i / 2),
  minute: (i % 2) * 30,
}));

export function NotificationSettingsSection() {
  const settings = useNotificationSettings();
  const { colors, spacing, fontSize } = useTheme();
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeSheet, setTimeSheet] = useState(false);

  // Relue au retour au premier plan : l'autorisation a pu changer dans les
  // réglages du téléphone.
  useEffect(() => {
    let active = true;
    const check = () => {
      getNotificationPermission()
        .then((p) => {
          if (active) setPermission(p);
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
  }, []);

  const toggle = async (value: boolean) => {
    setError(null);
    if (!value) {
      updateNotificationSettings({ enabled: false });
      return;
    }
    setBusy(true);
    try {
      const p = await requestNotificationPermission();
      setPermission(p);
      if (p === 'granted') updateNotificationSettings({ enabled: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const unsupported = permission === 'unsupported';
  const refused = permission === 'denied' || permission === 'blocked';
  const muted = { color: colors.textMuted, fontSize: fontSize.small };
  const warning = { color: colors.danger, fontSize: fontSize.small };

  return (
    <CategoryCard tint={colors.tints.butter} icon="notifications-outline" title="Notifications">
      <CardList>
        <ListRow
          title="Notifications quotidiennes"
          subtitle="Rappel du matin et alerte J-7 des échéances clés"
          right={
            <Switch
              value={settings.enabled}
              onValueChange={(v) => void toggle(v)}
              disabled={busy || unsupported}
              trackColor={{ true: colors.accent }}
              accessibilityLabel="Notifications quotidiennes"
            />
          }
          chevron={false}
        />
        <ListRow
          title="Heure du rappel"
          subtitle="Rappel du matin et alertes d'échéance"
          right={<Text style={{ color: colors.text, fontSize: fontSize.body }}>{formatTime(settings.hour, settings.minute)}</Text>}
          onPress={() => setTimeSheet(true)}
          isLast
        />
      </CardList>

      <View style={{ paddingHorizontal: spacing.xs, gap: spacing.sm }}>
        {unsupported && <Text style={muted}>Notifications non disponibles sur cette plateforme.</Text>}
        {refused && (
          <>
            <Text style={warning}>
              {settings.enabled
                ? "Les notifications sont bloquées dans les réglages du téléphone : aucun rappel ne sera envoyé."
                : 'Notifications refusées. Autorise-les dans les réglages du téléphone pour recevoir les rappels.'}
            </Text>
            <Button label="Ouvrir les réglages du téléphone" variant="secondary" onPress={() => void Linking.openSettings()} />
          </>
        )}
        {error && <Text style={warning}>Erreur : {error}</Text>}
        {!unsupported && !refused && (
          <Text style={muted}>Les rappels ponctuels et les debriefs de RDV sont notifiés à leur heure, que ce réglage soit activé ou non.</Text>
        )}
        {settings.enabled && !refused && (
          <Text style={muted}>
            Le rappel résume les tâches présentes sur ce téléphone à la dernière ouverture de l&apos;app.
          </Text>
        )}
      </View>

      <Sheet visible={timeSheet} onClose={() => setTimeSheet(false)} title="Heure du rappel">
        <ScrollView style={{ maxHeight: 360 }}>
          {TIME_OPTIONS.map(({ hour, minute }) => (
            <SheetOption
              key={`${hour}:${minute}`}
              label={formatTime(hour, minute)}
              selected={hour === settings.hour && minute === settings.minute}
              onPress={() => {
                updateNotificationSettings({ hour, minute });
                setTimeSheet(false);
              }}
            />
          ))}
        </ScrollView>
      </Sheet>
    </CategoryCard>
  );
}
