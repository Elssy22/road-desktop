import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Sheet, SheetOption } from '../../components/Sheet';
import {
  Badge,
  CardNote,
  CardSectionFooter,
  CardSectionHeader,
  CardSectionItem,
  CategoryCard,
  Chip,
  ChipRow,
  TextAction,
} from '../../components/ui';
import {
  listTenderOffers,
  setTenderStatus,
  TENDER_STATUS_LABELS,
  TENDER_STATUSES,
  type TenderOffer,
  type TenderStatus,
} from '../../db/tenderOffersDb';
import { formatEditedLabel } from '../../lib/dates';
import { useToday } from '../../lib/useToday';
import {
  deadlineLabel,
  fetchVeilleSettings,
  isUrgent,
  offersFor,
  syncBoamp,
  type VeilleSettings,
} from '../../lib/veille';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

const EMPTY: TenderOffer[] = [];

/** Libellés courts des filtres (le sélecteur de chaque carte garde les libellés complets). */
const FILTER_LABELS: Record<TenderStatus, string> = {
  nouveau: 'Nouveaux',
  interessant: 'Intéressants',
  ignore: 'Ignorés',
  candidate: 'Candidatures',
};

const STATUS_ICONS: Record<TenderStatus, IconName> = {
  nouveau: 'sparkles-outline',
  interessant: 'star-outline',
  ignore: 'eye-off-outline',
  candidate: 'paper-plane-outline',
};

type Feedback = { tone: 'success' | 'danger'; text: string };

/**
 * Veille BOAMP : appels d'offres repérés par l'Edge Function boamp-sync.
 * La liste vient de SQLite (consultable et triable hors ligne) ; seule la
 * recherche de nouveaux avis demande le réseau.
 */
export function VeilleScreen({ userId }: { userId: string }) {
  const db = useSQLiteContext();
  const { syncing, syncNow, runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, typography, categories } = useTheme();
  const tint = categories.veille;

  const load = useCallback((d: SQLiteDatabase) => listTenderOffers(d, userId), [userId]);
  const { data: all } = useLocalQuery(load, EMPTY);
  const [filter, setFilter] = useState<TenderStatus>('nouveau');
  const [settings, setSettings] = useState<VeilleSettings | null>(null);
  const [searching, setSearching] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [editing, setEditing] = useState<TenderOffer | null>(null);

  // Hors ligne ou migration 015 absente : pas d'état de synchro, la liste reste utilisable.
  useEffect(() => {
    let active = true;
    fetchVeilleSettings(userId)
      .then((s) => active && setSettings(s))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  const counts = useMemo(() => {
    const out = { nouveau: 0, interessant: 0, ignore: 0, candidate: 0 } as Record<TenderStatus, number>;
    for (const o of all) out[o.status] = (out[o.status] ?? 0) + 1;
    return out;
  }, [all]);
  const visible = useMemo(() => offersFor(all, filter, today), [all, filter, today]);

  const onSearch = async () => {
    setSearching(true);
    setFeedback(null);
    try {
      const result = await syncBoamp();
      setFeedback({
        tone: 'success',
        text:
          result.added > 0
            ? `${result.added} nouvel${result.added > 1 ? 's' : ''} appel${result.added > 1 ? 's' : ''} d’offres.`
            : 'Aucun nouvel appel d’offres.',
      });
      // Ramène les nouveaux avis dans SQLite.
      await syncNow();
    } catch (e) {
      setFeedback({ tone: 'danger', text: `Échec de la recherche : ${(e as Error).message}` });
    } finally {
      setSearching(false);
      fetchVeilleSettings(userId)
        .then(setSettings)
        .catch(() => undefined);
    }
  };

  const onStatus = (offer: TenderOffer, status: TenderStatus) => {
    setEditing(null);
    if (status !== offer.status) void runLocal(() => setTenderStatus(db, offer, status));
  };

  const lastRun = settings?.last_run_at
    ? `Dernière recherche : ${formatEditedLabel(settings.last_run_at, today)}`
    : settings
      ? 'Aucune recherche pour l’instant.'
      : 'Connexion requise pour chercher de nouveaux avis.';

  const header = (
    <View style={{ paddingTop: spacing.lg }}>
      <CategoryCard
        tint={tint}
        icon="search-outline"
        title="Recherche BOAMP"
        action={
          searching ? (
            <ActivityIndicator color={tint.fg} />
          ) : (
            <TextAction
              label="Synchroniser"
              icon="sync-outline"
              tint={tint}
              accessibilityLabel="Chercher de nouveaux appels d’offres"
              onPress={onSearch}
            />
          )
        }
      >
        <CardNote>{lastRun}</CardNote>
        {settings?.last_run_status === 'erreur' && !feedback && (
          <CardNote tone="danger">Dernière tentative en échec{settings.last_run_message ? ` : ${settings.last_run_message}` : '.'}</CardNote>
        )}
        {feedback && (
          <Text
            accessibilityLiveRegion="polite"
            style={[typography.small, { color: feedback.tone === 'danger' ? colors.danger : colors.success }]}
          >
            {feedback.text}
          </Text>
        )}
      </CategoryCard>
      <ChipRow>
        {TENDER_STATUSES.map((s) => (
          <Chip
            key={s}
            label={`${FILTER_LABELS[s]} · ${counts[s]}`}
            selected={filter === s}
            onPress={() => setFilter(s)}
          />
        ))}
      </ChipRow>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/agency/veille-settings')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Mots-clés de la veille"
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingHorizontal: spacing.sm })}
            >
              <Ionicons name="options-outline" size={22} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      {/* Catégorie Veille : la liste est une carte lavande (DECISIONS.md §33). */}
      <FlatList
        data={visible}
        keyExtractor={(o) => o.id}
        refreshing={syncing}
        onRefresh={syncNow}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
        ListHeaderComponent={
          <>
            {header}
            {visible.length > 0 ? (
              <CardSectionHeader
                tint={tint}
                icon={STATUS_ICONS[filter]}
                title={TENDER_STATUS_LABELS[filter]}
                count={visible.length}
              />
            ) : null}
          </>
        }
        ListFooterComponent={visible.length > 0 ? <CardSectionFooter tint={tint} /> : null}
        ListEmptyComponent={
          <View style={{ marginTop: spacing.lg }}>
            <CategoryCard tint={tint} icon={STATUS_ICONS[filter]} title={TENDER_STATUS_LABELS[filter]}>
              <CardNote>
                {filter === 'nouveau'
                  ? 'Aucun nouvel appel d’offres. Lance une recherche avec « Synchroniser ».'
                  : 'Aucun appel d’offres avec ce statut.'}
              </CardNote>
            </CategoryCard>
          </View>
        }
        renderItem={({ item, index }) => {
          const last = index === visible.length - 1;
          return (
            <CardSectionItem tint={tint} first={index === 0} last={last}>
              <TenderRow offer={item} today={today} isLast={last} onStatus={() => setEditing(item)} />
            </CardSectionItem>
          );
        }}
      />
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title="Statut de l’appel d’offres">
        {TENDER_STATUSES.map((s) => (
          <SheetOption
            key={s}
            label={TENDER_STATUS_LABELS[s]}
            selected={editing?.status === s}
            icon={
              <Ionicons name={STATUS_ICONS[s]} size={20} color={editing?.status === s ? colors.primary : tint.fg} />
            }
            onPress={() => editing && onStatus(editing, s)}
          />
        ))}
      </Sheet>
    </>
  );
}

async function openNotice(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Lien inaccessible', 'Impossible d’ouvrir l’avis officiel dans le navigateur.');
  }
}

function TenderRow({
  offer,
  today,
  isLast,
  onStatus,
}: {
  offer: TenderOffer;
  today: string;
  isLast: boolean;
  onStatus: () => void;
}) {
  const { colors, spacing, typography, categories } = useTheme();
  const tint = categories.veille;
  const urgent = isUrgent(offer, today);
  const meta = [offer.buyer, offer.department && `Dép. ${offer.department}`, offer.procedure].filter(Boolean);

  return (
    <View
      style={{
        padding: spacing.lg,
        gap: spacing.xs,
        borderBottomColor: colors.border,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
      }}
    >
      <Text numberOfLines={3} style={[typography.bodyStrong, { color: colors.text }]}>
        {offer.title}
      </Text>
      <Text numberOfLines={2} style={[typography.small, { color: colors.textMuted }]}>
        {meta.join(' · ')}
      </Text>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Text style={[typography.small, styles.shrink, { color: urgent ? colors.danger : colors.textMuted, fontWeight: urgent ? '600' : '400' }]}>
          {deadlineLabel(offer, today)}
        </Text>
        {urgent && <Badge label="Urgent" color={colors.danger} />}
      </View>
      {offer.categories.length > 0 && (
        <Text numberOfLines={1} style={[typography.caption, { color: colors.textFaint }]}>
          {offer.categories.join(' · ')}
        </Text>
      )}
      <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.xs }]}>
        <TextAction
          label={TENDER_STATUS_LABELS[offer.status]}
          icon={STATUS_ICONS[offer.status]}
          tint={tint}
          accessibilityLabel={`Statut : ${TENDER_STATUS_LABELS[offer.status]}. Changer`}
          onPress={onStatus}
        />
        {offer.url && (
          <TextAction
            label="Voir l’avis"
            icon="open-outline"
            tint={tint}
            accessibilityLabel="Ouvrir l’avis officiel dans le navigateur"
            onPress={() => void openNotice(offer.url!)}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  shrink: { flexShrink: 1 },
});
