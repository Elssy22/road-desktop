import { router } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ListToolbar } from '../../components/ListToolbar';
import {
  Badge,
  CardNote,
  CardSectionFooter,
  CardSectionHeader,
  CardSectionItem,
  CategoryCard,
  ListRow,
  SegmentedControl,
} from '../../components/ui';
import { listContacts, segmentLabel, type ContactWithLast } from '../../db/crmDb';
import { daysSinceContact, FOLLOW_UP_DAYS } from '../../lib/followUp';
import { makeMatcher } from '../../lib/search';
import { useToday } from '../../lib/useToday';
import { useFollowupAutomation } from '../../sync/useFollowupAutomation';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { PipelineBoard } from './PipelineBoard';

const EMPTY: ContactWithLast[] = [];

type Mode = 'all' | 'followUp' | 'pipeline';

export function ContactsScreen({ userId }: { userId: string }) {
  const { syncing, syncNow } = useSync();
  useFollowupAutomation();
  const load = useCallback((db: SQLiteDatabase) => listContacts(db, userId), [userId]);
  const { data: contacts } = useLocalQuery(load, EMPTY);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('all');
  const onlyFollowUp = mode === 'followUp';
  const today = useToday();
  const { colors, spacing, categories } = useTheme();
  const tint = categories.contacts;

  const matching = useMemo(() => {
    const matches = makeMatcher(query);
    return contacts.filter((c) =>
      matches(c.name, c.role, c.club ?? '', c.notes ?? '', segmentLabel(c.segment) ?? '')
    );
  }, [contacts, query]);

  const rows = useMemo(
    () =>
      matching
        .map((c) => ({ contact: c, days: daysSinceContact(c, today) }))
        .filter(({ days }) => !onlyFollowUp || days >= FOLLOW_UP_DAYS),
    [matching, onlyFollowUp, today]
  );

  const prospects = useMemo(() => matching.filter((c) => c.pipeline_stage !== null), [matching]);

  const followUpCount = useMemo(
    () => contacts.filter((c) => daysSinceContact(c, today) >= FOLLOW_UP_DAYS).length,
    [contacts, today]
  );
  const prospectCount = useMemo(() => contacts.filter((c) => c.pipeline_stage !== null).length, [contacts]);

  return (
    <View style={styles.container}>
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder="Rechercher un contact, un club…"
        onAdd={() => router.push('/agency/contact-form')}
        addText="Contact"
        addLabel="Nouveau contact"
        below={
          contacts.length > 0 ? (
            <SegmentedControl<Mode>
              options={[
                { value: 'all', label: 'Tous' },
                { value: 'followUp', label: `À relancer · ${followUpCount}` },
                { value: 'pipeline', label: `Prospects · ${prospectCount}` },
              ]}
              value={mode}
              onChange={setMode}
            />
          ) : null
        }
      />
      {mode === 'pipeline' ? (
        // Pipeline de prospection : colonnes empilées (DECISIONS.md §31).
        <PipelineBoard prospects={prospects} filtered={query.trim().length > 0} today={today} />
      ) : (
        // Catégorie Contacts : la liste est une carte rose (DECISIONS.md §29).
        <FlatList
          data={rows}
          keyExtractor={(r) => r.contact.id}
          refreshing={syncing}
          onRefresh={syncNow}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
          ListHeaderComponent={
            rows.length > 0 ? (
              <CardSectionHeader
                tint={tint}
                icon={onlyFollowUp ? 'alarm-outline' : 'people-outline'}
                title={onlyFollowUp ? 'À relancer' : 'Contacts'}
                count={rows.length}
              />
            ) : null
          }
          ListFooterComponent={rows.length > 0 ? <CardSectionFooter tint={tint} /> : null}
          ListEmptyComponent={
            <View style={{ marginTop: spacing.lg }}>
              <CategoryCard tint={tint} icon="people-outline" title="Contacts">
                <CardNote>
                  {query.trim() || onlyFollowUp
                    ? 'Aucun contact ne correspond.'
                    : 'Aucun contact. Appuie sur « Contact » pour ajouter un client : créateur, club, coach, société…'}
                </CardNote>
              </CategoryCard>
            </View>
          }
          renderItem={({ item: { contact: c, days }, index }) => {
            const last = index === rows.length - 1;
            const subtitle = [c.role, c.club, segmentLabel(c.segment)].filter(Boolean).join(' · ');
            return (
              <CardSectionItem tint={tint} first={index === 0} last={last}>
                <ListRow
                  title={c.name || 'Sans nom'}
                  subtitle={subtitle || null}
                  right={
                    days >= FOLLOW_UP_DAYS ? (
                      <Badge label={`Relance · ${days} j`} color={colors.warning} />
                    ) : null
                  }
                  onPress={() => router.push(`/agency/contacts/${c.id}`)}
                  isLast={last}
                />
              </CardSectionItem>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
