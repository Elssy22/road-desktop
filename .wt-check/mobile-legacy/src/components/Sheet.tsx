import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';

/** Feuille modale ancrée en bas de l'écran (menus, sélecteur de date). */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          paddingTop: spacing.lg,
          paddingHorizontal: spacing.lg,
          paddingBottom: Math.max(insets.bottom, spacing.lg),
        }}
      >
        {title && (
          <Text
            numberOfLines={1}
            style={{
              color: colors.textMuted,
              fontSize: fontSize.small,
              marginBottom: spacing.md,
            }}
          >
            {title}
          </Text>
        )}
        {children}
      </View>
    </Modal>
  );
}

export function SheetOption({
  label,
  icon,
  onPress,
  destructive,
  selected,
}: {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  destructive?: boolean;
  selected?: boolean;
}) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.option,
        { paddingVertical: spacing.md, gap: spacing.md, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      {icon}
      <Text
        style={{
          flex: 1,
          fontSize: fontSize.body,
          color: destructive ? colors.danger : selected ? colors.primary : colors.text,
          fontWeight: selected ? '600' : '400',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  option: { flexDirection: 'row', alignItems: 'center' },
});
