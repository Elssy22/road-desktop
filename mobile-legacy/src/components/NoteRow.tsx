import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Note } from '../db/notesDb';
import { formatEditedLabel, type DateKey } from '../lib/dates';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  note: Note;
  today: DateKey;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  isLast?: boolean;
};

/** Première ligne non vide du corps, pour l'aperçu (et comme titre de secours). */
const firstLine = (body: string) => body.split('\n').find((l) => l.trim() !== '')?.trim() ?? '';

export function NoteRow({ note, today, onOpen, onTogglePin, isLast }: Props) {
  const { colors, spacing, fontSize } = useTheme();

  const title = note.title.trim();
  const preview = title ? note.body.trim() : note.body.trim().slice(firstLine(note.body).length).trim();
  const displayTitle = title || firstLine(note.body) || 'Sans titre';

  return (
    <View
      style={[
        styles.row,
        {
          paddingVertical: spacing.md,
          paddingLeft: spacing.lg,
          paddingRight: spacing.sm,
          gap: spacing.md,
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Pressable style={styles.main} onPress={() => onOpen(note)} accessibilityHint="Ouvrir la note">
        <Text
          numberOfLines={1}
          style={{
            color: title || note.body.trim() ? colors.text : colors.textFaint,
            fontSize: fontSize.body,
            fontWeight: '600',
          }}
        >
          {displayTitle}
        </Text>
        <Text numberOfLines={2} style={{ color: colors.textMuted, fontSize: fontSize.small, marginTop: 2 }}>
          <Text style={{ color: colors.textFaint }}>{formatEditedLabel(note.updated_at, today)}</Text>
          {preview ? `  ${preview.replace(/\s+/g, ' ')}` : ''}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onTogglePin(note)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={note.pinned ? 'Désépingler' : 'Épingler'}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: spacing.sm })}
      >
        <Ionicons
          name={note.pinned ? 'pin' : 'pin-outline'}
          size={18}
          color={note.pinned ? colors.primary : colors.textFaint}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1 },
});
