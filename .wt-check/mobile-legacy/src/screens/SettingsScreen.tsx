import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSession } from '../auth/SessionProvider';
import { Button, CardList, CardNote, CategoryCard, ListRow, SegmentedControl } from '../components/ui';
import { supabase } from '../lib/supabase';
import { NotificationSettingsSection } from '../notifications/NotificationSettingsSection';
import { AppLockSettingsSection } from '../security/AppLockSettingsSection';
import { useSync } from '../sync/SyncProvider';
import { setColorScheme } from '../theme/appearance';
import { useTheme } from '../theme/ThemeProvider';

const SCHEMES = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
] as const;

/**
 * Réglages : pas de catégorie métier ici, chaque carte prend une teinte de la
 * palette pastel (DECISIONS.md §26) pour se repérer d'un coup d'œil.
 */
export function SettingsScreen() {
  const { session } = useSession();
  const { online, syncing, pending, lastError, lastSyncAt, syncNow } = useSync();
  const { colors, spacing, typography, scheme } = useTheme();
  const { tints } = colors;

  const status = !online ? 'Hors ligne' : syncing ? 'Synchronisation…' : 'En ligne';
  const statusColor = !online ? colors.textFaint : lastError ? colors.danger : pending > 0 ? colors.warning : colors.success;
  const plural = pending > 1 ? 's' : '';

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
      <CategoryCard tint={tints.lavender} icon="color-palette-outline" title="Apparence">
        <SegmentedControl options={SCHEMES} value={scheme} onChange={setColorScheme} tint={tints.lavender} />
      </CategoryCard>

      <CategoryCard tint={tints.sky} icon="sync-outline" title="Synchronisation">
        <CardList>
          <View style={{ padding: spacing.lg, gap: spacing.xs }}>
            <View style={[styles.row, { gap: spacing.sm }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[typography.bodyStrong, { color: colors.text }]}>{status}</Text>
            </View>
            <Text style={[typography.small, { color: colors.textMuted }]}>
              {pending > 0 ? `${pending} action${plural} en attente de sync` : 'Tout est synchronisé'}
            </Text>
            {lastSyncAt && (
              <Text style={[typography.small, { color: colors.textMuted }]}>
                Dernière sync : {lastSyncAt.toLocaleTimeString()}
              </Text>
            )}
            {lastError && online && (
              <Text style={[typography.small, { color: colors.danger }]}>Erreur : {lastError}</Text>
            )}
          </View>
        </CardList>
        <Button label="Synchroniser maintenant" variant="secondary" onPress={() => void syncNow()} />
      </CategoryCard>

      <NotificationSettingsSection />

      <AppLockSettingsSection />

      <CategoryCard tint={tints.peach} icon="calendar-number-outline" title="Organisation">
        <CardList>
          <ListRow
            title="Revue de la semaine"
            subtitle="Bilan hebdomadaire guidé"
            onPress={() => router.push('/weekly-review')}
            isLast
          />
        </CardList>
      </CategoryCard>

      <CategoryCard tint={tints.mint} icon="shield-checkmark-outline" title="Données personnelles">
        <CardList>
          <ListRow
            title="Purge RGPD des prospects"
            subtitle="Prospects inactifs depuis 3 ans, à supprimer avec confirmation"
            onPress={() => router.push('/prospect-purge')}
            isLast
          />
        </CardList>
      </CategoryCard>

      <CategoryCard tint={tints.rose} icon="person-circle-outline" title="Compte">
        <CardNote>{session?.user.email}</CardNote>
        <Button label="Se déconnecter" variant="danger" onPress={() => void supabase.auth.signOut()} />
      </CategoryCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});
