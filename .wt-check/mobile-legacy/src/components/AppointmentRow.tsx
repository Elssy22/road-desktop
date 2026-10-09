import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatTimeRange, type AppointmentWithContact } from '../db/appointmentsDb';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Ligne d'un rendez-vous : barre de couleur « agenda », horaire, titre, lieu et
 * contact. Pas de case à cocher (un RDV n'est pas « fait », il est passé : il
 * est alors grisé). Appui : fiche du RDV. `showDebrief` ajoute, une fois le RDV
 * passé, un raccourci vers le compte-rendu.
 */
export function AppointmentRow({
  appointment,
  showDebrief,
  isLast,
}: {
  appointment: AppointmentWithContact;
  showDebrief?: boolean;
  isLast?: boolean;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const past = new Date(appointment.end_at ?? appointment.start_at) < new Date();
  const details = [appointment.location, appointment.contact_name].filter(Boolean).join(' · ');

  return (
    <View
      style={[
        styles.row,
        {
          paddingVertical: spacing.md,
          paddingLeft: spacing.lg,
          paddingRight: spacing.md,
          gap: spacing.md,
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: colors.appointment, opacity: past ? 0.4 : 1 }]} />
      <Pressable
        style={styles.main}
        onPress={() => router.push({ pathname: '/appointment-form', params: { id: appointment.id } })}
        accessibilityRole="button"
        accessibilityHint="Ouvrir le rendez-vous"
      >
        <Text style={{ color: past ? colors.textFaint : colors.appointment, fontSize: fontSize.caption, fontWeight: '600' }}>
          {formatTimeRange(appointment)}
        </Text>
        <Text numberOfLines={2} style={{ color: past ? colors.textMuted : colors.text, fontSize: fontSize.body }}>
          {appointment.title || 'Rendez-vous'}
        </Text>
        {details.length > 0 && (
          <View style={[styles.row, { gap: spacing.xs, marginTop: 2 }]}>
            <Ionicons
              name={appointment.location ? 'location-outline' : 'person-outline'}
              size={12}
              color={colors.textMuted}
            />
            <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.textMuted, fontSize: fontSize.caption }}>
              {details}
            </Text>
          </View>
        )}
      </Pressable>
      {showDebrief && past && (
        <Pressable
          onPress={() =>
            router.push(
              {
                pathname: '/agency/meeting-report',
                params: appointment.contact_id ? { contactId: appointment.contact_id } : {},
              },
              { withAnchor: true }
            )
          }
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Compte-rendu du RDV ${appointment.title}`}
        >
          <Ionicons name="document-text-outline" size={22} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1 },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
});
