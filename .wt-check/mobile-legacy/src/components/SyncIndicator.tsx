import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useSync } from '../sync/SyncProvider';
import { useTheme } from '../theme/ThemeProvider';

/** Pastille discrète en en-tête : état réseau + actions en attente. Appui = sync. */
export function SyncIndicator() {
  const { online, syncing, pending, lastError, syncNow } = useSync();
  const { colors, spacing, fontSize } = useTheme();

  const color = !online ? colors.warning : lastError ? colors.danger : colors.textFaint;
  const icon = !online ? 'cloud-offline-outline' : lastError ? 'alert-circle-outline' : 'cloud-done-outline';
  const label = !online ? 'Hors ligne' : lastError ? 'Erreur de synchronisation' : 'Synchronisé';

  return (
    <Pressable
      onPress={() => void syncNow()}
      hitSlop={8}
      style={[styles.row, { paddingHorizontal: spacing.lg, gap: spacing.xs }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}${pending > 0 ? `, ${pending} en attente` : ''}. Synchroniser`}
    >
      {pending > 0 && <Text style={{ color, fontSize: fontSize.caption }}>{pending}</Text>}
      {syncing ? (
        <ActivityIndicator size="small" color={colors.textFaint} />
      ) : (
        <Ionicons name={icon} size={20} color={color} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
