import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import {
  CardNote,
  CardSectionFooter,
  CardSectionHeader,
  CardSectionItem,
  CategoryCard,
} from '../../components/ui';
import {
  effectiveStatus,
  KIND_LABELS,
  listMoneyItems,
  MONEY_STATUS_LABELS,
  MONEY_STATUSES,
  type MoneyItemWithLinks,
} from '../../db/moneyDb';
import { formatDueLabel } from '../../lib/dates';
import { formatMoney, formatTotals, totalsByCurrency } from '../../lib/money';
import { useToday } from '../../lib/useToday';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { QontoSection } from './QontoSection';

const EMPTY: MoneyItemWithLinks[] = [];

const STATUS_ICONS: Record<string, 'alert-circle-outline' | 'time-outline' | 'checkmark-done-outline'> = {
  en_retard: 'alert-circle-outline',
  en_attente: 'time-outline',
  payé: 'checkmark-done-outline',
};

type Group = { status: string; title: string; total: string; data: MoneyItemWithLinks[] };

/** Suivi financier : lignes groupées par statut, total par groupe (par devise). */
export function MoneyScreen({ userId }: { userId: string }) {
  const { syncing, syncNow } = useSync();
  const today = useToday();
  const { colors, spacing, typography, categories } = useTheme();
  const tint = categories.finance;
  const load = useCallback((d: SQLiteDatabase) => listMoneyItems(d, userId), [userId]);
  const { data: items } = useLocalQuery(load, EMPTY);

  const sections = useMemo(() => {
    const byStatus = new Map<string, MoneyItemWithLinks[]>();
    for (const item of items) {
      const s = effectiveStatus(item, today);
      byStatus.set(s, [...(byStatus.get(s) ?? []), item]);
    }
    // Statuts connus dans l'ordre prévu, puis d'éventuels statuts libres (autre appareil, saisie SQL…).
    const order = [...MONEY_STATUSES, ...[...byStatus.keys()].filter((s) => !(MONEY_STATUSES as readonly string[]).includes(s))];
    return order
      .filter((s) => byStatus.has(s))
      .map((s): Group => {
        const data = byStatus.get(s)!;
        return { status: s, title: MONEY_STATUS_LABELS[s] ?? s, total: formatTotals(totalsByCurrency(data)), data };
      });
  }, [items, today]);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/agency/money-form')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Nouvelle ligne"
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingHorizontal: spacing.sm })}
            >
              <Ionicons name="add" size={24} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      {/* Catégorie Finances : un statut = une carte lavande (DECISIONS.md §30). */}
      <SectionList
        sections={sections}
        keyExtractor={(m) => m.id}
        refreshing={syncing}
        onRefresh={syncNow}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
        ListEmptyComponent={
          <View style={{ marginTop: spacing.lg }}>
            <CategoryCard tint={tint} icon="wallet-outline" title="Finances">
              <CardNote>Aucune ligne. Ajoute une commission, une facture ou un paiement avec le bouton +.</CardNote>
            </CategoryCard>
          </View>
        }
        ListFooterComponent={<QontoSection userId={userId} />}
        renderSectionHeader={({ section }) => (
          <CardSectionHeader
            tint={tint}
            icon={STATUS_ICONS[section.status] ?? 'wallet-outline'}
            title={section.title}
            titleColor={section.status === 'en_retard' ? colors.danger : undefined}
            count={section.data.length}
            action={<Text style={[typography.small, styles.total, { color: tint.fg }]}>{section.total}</Text>}
          />
        )}
        renderSectionFooter={() => <CardSectionFooter tint={tint} />}
        renderItem={({ item, index, section }) => {
          const last = index === section.data.length - 1;
          return (
            <CardSectionItem tint={tint} first={index === 0} last={last}>
              <MoneyRow item={item} today={today} late={section.status === 'en_retard'} isLast={last} />
            </CardSectionItem>
          );
        }}
      />
    </>
  );
}

function MoneyRow({
  item,
  today,
  late,
  isLast,
}: {
  item: MoneyItemWithLinks;
  today: string;
  late: boolean;
  isLast: boolean;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const links = [item.contact_name, item.project_title].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/agency/money-form', params: { id: item.id } })}
      style={({ pressed }) => ({
        padding: spacing.lg,
        gap: 2,
        borderBottomColor: colors.border,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
      })}
    >
      <View style={[styles.row, { gap: spacing.md }]}>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: fontSize.body, fontWeight: '500' }}>
          {item.label || 'Sans libellé'}
        </Text>
        <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: '600' }}>
          {formatMoney(item.amount, item.currency)}
        </Text>
      </View>
      <View style={[styles.row, { gap: spacing.sm, flexWrap: 'wrap' }]}>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>{KIND_LABELS[item.kind] ?? item.kind}</Text>
        {item.due_date && (
          <Text style={{ color: late ? colors.danger : colors.textMuted, fontSize: fontSize.caption }}>
            · Échéance {formatDueLabel(item.due_date, today)}
          </Text>
        )}
      </View>
      {links ? (
        <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: fontSize.caption }}>
          {links}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  total: { fontWeight: '700', flexShrink: 1, textAlign: 'right' },
});
