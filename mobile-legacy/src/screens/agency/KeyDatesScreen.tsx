import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

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
import { CATEGORY_LABELS, listKeyDates, type KeyDateWithContact } from '../../db/keyDatesDb';
import { formatDueLabel } from '../../lib/dates';
import { alertColor, alertLevel, countdownLabel, daysUntil } from '../../lib/keyDateAlerts';
import { useToday } from '../../lib/useToday';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

const EMPTY: KeyDateWithContact[] = [];

type Filter = 'upcoming' | 'past';

export function KeyDatesScreen({ userId }: { userId: string }) {
  const { syncing, syncNow } = useSync();
  const today = useToday();
  const { colors, spacing, categories } = useTheme();
  const load = useCallback((d: SQLiteDatabase) => listKeyDates(d, userId), [userId]);
  const { data: all } = useLocalQuery(load, EMPTY);
  const [filter, setFilter] = useState<Filter>('upcoming');

  // À venir : de la plus proche à la plus lointaine ; passées : la plus récente d'abord.
  const { upcoming, past } = useMemo(
    () => ({
      upcoming: all.filter((k) => k.date >= today),
      past: all.filter((k) => k.date < today).reverse(),
    }),
    [all, today]
  );
  const visible = filter === 'upcoming' ? upcoming : past;
  const tint = categories.keyDates;
  const icon = filter === 'upcoming' ? 'hourglass-outline' : 'archive-outline';
  const title = filter === 'upcoming' ? 'À venir' : 'Passées';

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/agency/key-date-form')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Nouvelle date clé"
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingHorizontal: spacing.sm })}
            >
              <Ionicons name="add" size={24} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
          <SegmentedControl
            options={[
              { value: 'upcoming', label: `À venir · ${upcoming.length}` },
              { value: 'past', label: `Passées · ${past.length}` },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </View>
        {/* Catégorie Échéances clés : la liste est une carte beurre (DECISIONS.md §29). */}
        <FlatList
          data={visible}
          keyExtractor={(k) => k.id}
          refreshing={syncing}
          onRefresh={syncNow}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
          ListHeaderComponent={
            visible.length > 0 ? (
              <CardSectionHeader tint={tint} icon={icon} title={title} count={visible.length} />
            ) : null
          }
          ListFooterComponent={visible.length > 0 ? <CardSectionFooter tint={tint} /> : null}
          ListEmptyComponent={
            <View style={{ marginTop: spacing.lg }}>
              <CategoryCard tint={tint} icon={icon} title={title}>
                <CardNote>
                  {filter === 'upcoming'
                    ? 'Aucune échéance à venir. Ajoute une date clé avec le bouton +.'
                    : 'Aucune échéance passée.'}
                </CardNote>
              </CategoryCard>
            </View>
          }
          renderItem={({ item, index }) => {
            const last = index === visible.length - 1;
            return (
              <CardSectionItem tint={tint} first={index === 0} last={last}>
                <KeyDateRow keyDate={item} today={today} isLast={last} />
              </CardSectionItem>
            );
          }}
        />
      </View>
    </>
  );
}

/** Ligne d'échéance, réutilisée par l'encart de la Vue du jour. */
export function KeyDateRow({
  keyDate,
  today,
  isLast,
  fromOtherTab,
}: {
  keyDate: KeyDateWithContact;
  today: string;
  isLast: boolean;
  /** Ouvert depuis un autre onglet : garde le menu Agence sous le formulaire. */
  fromOtherTab?: boolean;
}) {
  const { colors } = useTheme();
  const days = daysUntil(keyDate.date, today);
  const level = alertLevel(days);
  const meta = [
    CATEGORY_LABELS[keyDate.category] ?? keyDate.category,
    formatDueLabel(keyDate.date, today),
    keyDate.contact_name,
  ].filter(Boolean);

  return (
    <ListRow
      title={keyDate.title || 'Sans titre'}
      subtitle={meta.join(' · ')}
      right={level ? <Badge label={countdownLabel(days)} color={alertColor(level, colors)} /> : null}
      onPress={() =>
        router.push(
          { pathname: '/agency/key-date-form', params: { id: keyDate.id } },
          fromOtherTab ? { withAnchor: true } : undefined
        )
      }
      isLast={isLast}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
