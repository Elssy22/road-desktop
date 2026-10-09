import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import { NoteRow } from '../components/NoteRow';
import {
  CardNote,
  CardSectionFooter,
  CardSectionHeader,
  CardSectionItem,
  CategoryCard,
  Field,
  GradientButton,
} from '../components/ui';
import type { Note } from '../db/notesDb';
import { makeMatcher } from '../lib/search';
import { useToday } from '../lib/useToday';
import { useOfflineNotes } from '../sync/useOfflineNotes';
import { useTheme } from '../theme/ThemeProvider';

/** Id réservé par la route de détail pour « nouvelle note ». */
export const NEW_NOTE_ID = 'new';

type NoteSection = { key: 'pinned' | 'others'; title: string; data: Note[] };

export function NotesScreen({ userId }: { userId: string }) {
  const { notes, syncing, syncNow, togglePin } = useOfflineNotes(userId);
  const [query, setQuery] = useState('');
  const today = useToday();
  const { spacing, categories } = useTheme();
  const tint = categories.notes;

  // Les notes arrivent déjà triées (épinglées puis plus récentes) depuis SQLite.
  const sections = useMemo(() => {
    const matches = makeMatcher(query);
    const visible = notes.filter((n) => matches(n.title, n.body));
    const pinned = visible.filter((n) => n.pinned);
    const others = visible.filter((n) => !n.pinned);
    const result: NoteSection[] = [];
    if (pinned.length > 0) result.push({ key: 'pinned', title: 'Épinglées', data: pinned });
    if (others.length > 0) result.push({ key: 'others', title: 'Notes', data: others });
    return result;
  }, [notes, query]);

  const open = (id: string) => router.push(`/notes/${id}`);

  return (
    <View style={styles.container}>
      <View style={[styles.toolbar, { padding: spacing.lg, paddingBottom: 0, gap: spacing.sm }]}>
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher dans les notes"
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          style={styles.search}
        />
        <GradientButton label="Note" icon="add" accessibilityLabel="Nouvelle note" onPress={() => open(NEW_NOTE_ID)} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        refreshing={syncing}
        onRefresh={syncNow}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <View style={{ marginTop: spacing.lg }}>
            <CategoryCard tint={tint} icon="document-text-outline" title="Notes">
              <CardNote>
                {query.trim()
                  ? 'Aucune note ne correspond à la recherche.'
                  : 'Aucune note. Appuie sur « Note » pour en créer une.'}
              </CardNote>
            </CategoryCard>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <CardSectionHeader
            tint={tint}
            icon={section.key === 'pinned' ? 'pin-outline' : 'document-text-outline'}
            title={section.title}
            count={section.data.length}
          />
        )}
        renderSectionFooter={() => <CardSectionFooter tint={tint} />}
        renderItem={({ item, index, section }) => {
          const last = index === section.data.length - 1;
          return (
            <CardSectionItem tint={tint} first={index === 0} last={last}>
              <NoteRow
                note={item}
                today={today}
                onOpen={(n) => open(n.id)}
                onTogglePin={(n) => void togglePin(n)}
                isLast={last}
              />
            </CardSectionItem>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center' },
  search: { flex: 1 },
});
