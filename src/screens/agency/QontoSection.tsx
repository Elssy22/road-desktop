import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { CardList, CardNote, CategoryCard, TextAction } from '../../components/ui';
import { refreshQontoReceipts } from '../../db/qontoReceiptsDb';
import { formatDueLabel } from '../../lib/dates';
import { formatMoney, formatTotals, totalsByCurrency } from '../../lib/money';
import {
  fetchQontoItems,
  groupQontoItems,
  QONTO_KIND_LABELS,
  syncQonto,
  type QontoItem,
  type QontoKind,
} from '../../lib/qonto';
import { useToday } from '../../lib/useToday';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

type Feedback = { tone: 'success' | 'danger' | 'muted'; text: string };

const KIND_ORDER: QontoKind[] = ['client_invoice', 'quote', 'transaction'];

/** "12 importés (Factures clients 4 · Devis 2 · Transactions 6)" */
function describeImport(imported: Partial<Record<QontoKind, number>>, total: number): string {
  const parts = KIND_ORDER.filter((k) => imported[k] !== undefined).map((k) => `${QONTO_KIND_LABELS[k]} ${imported[k]}`);
  return `${total} élément${total > 1 ? 's' : ''} importé${total > 1 ? 's' : ''}${parts.length ? ` (${parts.join(' · ')})` : ''}.`;
}

/**
 * Section « Depuis Qonto » de l'écran Finances : lecture seule, en ligne uniquement.
 * Les données sont importées par l'Edge Function qonto-sync, jamais modifiées ici.
 */
export function QontoSection({ userId }: { userId: string }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const { colors, spacing, typography, categories } = useTheme();
  const tint = categories.finance;
  const today = useToday();
  const [items, setItems] = useState<QontoItem[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Hors ligne ou migration 009 absente : la section reste vide, le bouton reste utilisable.
  const load = useCallback(
    () => fetchQontoItems(userId).catch(() => null),
    [userId]
  );

  useEffect(() => {
    let active = true;
    load().then((rows) => {
      if (active) setItems((prev) => rows ?? prev ?? []);
    });
    return () => {
      active = false;
    };
  }, [load]);

  const onSync = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      const result = await syncQonto();
      const failed = result.errors.map((e) => `${QONTO_KIND_LABELS[e.kind] ?? e.kind} : ${e.message}`);
      setFeedback({
        tone: failed.length ? 'danger' : 'success',
        text: [describeImport(result.imported, result.total), ...failed].join('\n'),
      });
      const rows = await load();
      if (rows) setItems(rows);
      // Copie locale des encaissements : les objectifs de CA (Agence, Objectifs) suivent tout de suite.
      await runLocal(() => refreshQontoReceipts(db, userId)).catch(() => undefined);
    } catch (e) {
      setFeedback({ tone: 'danger', text: `Échec de la synchronisation : ${(e as Error).message}` });
    } finally {
      setSyncing(false);
    }
  };

  const groups = useMemo(() => groupQontoItems(items ?? [], today), [items, today]);
  const toneColor = (tone: Feedback['tone']) =>
    tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.textMuted;

  return (
    // Carte lavande (Finances), sous les cartes de l'écran Argent (DECISIONS.md §30).
    <View style={{ marginTop: spacing.lg }}>
      <CategoryCard
        tint={tint}
        icon="business-outline"
        title="Depuis Qonto"
        action={
          syncing ? (
            <ActivityIndicator color={tint.fg} />
          ) : (
            <TextAction
              label="Synchroniser"
              icon="sync-outline"
              tint={tint}
              accessibilityLabel="Synchroniser Qonto"
              onPress={onSync}
            />
          )
        }
      >
        <CardNote>Importé automatiquement · lecture seule</CardNote>
        {feedback && (
          <Text accessibilityLiveRegion="polite" style={[typography.small, { color: toneColor(feedback.tone) }]}>
            {feedback.text}
          </Text>
        )}

        {items === null ? (
          <ActivityIndicator color={tint.fg} />
        ) : groups.length === 0 ? (
          <CardNote>Rien d’importé pour l’instant. Lance une synchronisation (connexion requise).</CardNote>
        ) : (
          groups.map((group) => (
            <View key={group.key} style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              <View style={[styles.row, { justifyContent: 'space-between', gap: spacing.md }]}>
                <Text style={[typography.bodyStrong, styles.shrink, { color: group.tone === 'muted' ? colors.text : toneColor(group.tone) }]}>
                  {group.title} · {group.data.length}
                </Text>
                <Text style={[typography.small, styles.shrink, { color: tint.fg, fontWeight: '700' }]}>
                  {formatTotals(totalsByCurrency(group.data))}
                </Text>
              </View>
              <CardList>
                {group.data.map((item, i) => (
                  <QontoRow
                    key={item.id}
                    item={item}
                    today={today}
                    late={group.tone === 'danger'}
                    isLast={i === group.data.length - 1}
                  />
                ))}
              </CardList>
            </View>
          ))
        )}
      </CategoryCard>
    </View>
  );
}

function QontoRow({ item, today, late, isLast }: { item: QontoItem; today: string; late: boolean; isLast: boolean }) {
  const { colors, spacing, fontSize } = useTheme();
  const dates = [
    item.qonto_date && formatDueLabel(item.qonto_date, today),
    item.due_date && `${item.kind === 'quote' ? 'Expire' : 'Échéance'} ${formatDueLabel(item.due_date, today)}`,
  ].filter(Boolean);

  return (
    <View
      style={{
        padding: spacing.lg,
        gap: 2,
        borderBottomColor: colors.border,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
      }}
    >
      <View style={[styles.row, { gap: spacing.md }]}>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: fontSize.body, fontWeight: '500' }}>
          {item.label || 'Sans libellé'}
        </Text>
        <Text
          style={{
            // Transactions : les encaissements ressortent en vert, les débits restent neutres.
            color: item.kind === 'transaction' && item.amount > 0 ? colors.success : colors.text,
            fontSize: fontSize.body,
            fontWeight: '600',
          }}
        >
          {formatMoney(item.amount, item.currency)}
        </Text>
      </View>
      {dates.length > 0 && (
        <Text style={{ color: late ? colors.danger : colors.textMuted, fontSize: fontSize.caption }}>
          {dates.join(' · ')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  shrink: { flexShrink: 1 },
});
