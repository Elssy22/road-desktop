import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button, CardList, CardNote, CategoryCard, ListRow, TextAction } from '../components/ui';
import {
  listProspectsForRetention,
  PIPELINE_STAGE_LABELS,
  purgeContacts,
  segmentLabel,
  type PipelineStage,
  type RetentionRow,
} from '../db/crmDb';
import { toDateKey, formatDueLabel } from '../lib/dates';
import { PROSPECT_RETENTION_YEARS, purgeCandidates } from '../lib/crmRetention';
import { useToday } from '../lib/useToday';
import { useLocalQuery } from '../sync/useLocalQuery';
import { useSync } from '../sync/SyncProvider';
import { useTheme } from '../theme/ThemeProvider';

const EMPTY: RetentionRow[] = [];
const dayOf = (iso: string | null) => (iso ? toDateKey(new Date(iso)) : null);

/**
 * Purge RGPD des prospects inactifs (DECISIONS.md §32) : liste les prospects
 * non signés sans signe de vie depuis 3 ans. Rien n'est supprimé sans une
 * confirmation explicite, contact par contact ou pour toute la liste.
 */
export function ProspectPurgeScreen({ userId }: { userId: string }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, categories } = useTheme();
  const tint = categories.contacts;

  const load = useCallback((d: SQLiteDatabase) => listProspectsForRetention(d, userId), [userId]);
  const { data: prospects, loaded } = useLocalQuery(load, EMPTY);

  const candidates = useMemo(
    () =>
      purgeCandidates(
        prospects.map((p) => ({
          ...p,
          created_day: toDateKey(new Date(p.created_at)),
          stage_changed_day: dayOf(p.stage_changed_at),
          last_interaction_day: dayOf(p.last_interaction_at),
          last_appointment_day: dayOf(p.last_appointment_at),
        })),
        today
      ),
    [prospects, today]
  );

  const purge = (list: RetentionRow[]) => void runLocal(() => purgeContacts(db, list));

  const confirmOne = (c: RetentionRow) =>
    Alert.alert(
      `Supprimer ${c.name || 'ce prospect'} ?`,
      'La fiche, ses interactions et ses relances sont supprimées et leurs données personnelles effacées. Action définitive.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => purge([c]) },
      ]
    );

  const confirmAll = () => {
    const n = candidates.length;
    Alert.alert(
      `Supprimer ${n} prospect${n > 1 ? 's' : ''} ?`,
      'Toutes les fiches listées, leurs interactions et leurs relances sont supprimées et leurs données personnelles effacées. Action définitive.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: `Supprimer les ${n}`, style: 'destructive', onPress: () => purge(candidates) },
      ]
    );
  };

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
      <CategoryCard tint={tint} icon="shield-checkmark-outline" title="Prospects inactifs" count={candidates.length}>
        <CardNote>
          Durée de conservation : un prospect non signé sans aucun signe de vie (création, changement d’étape,
          interaction, RDV) depuis {PROSPECT_RETENTION_YEARS} ans peut être supprimé. Rien n’est supprimé sans ta
          confirmation.
        </CardNote>
        {candidates.length > 0 ? (
          <CardList>
            {candidates.map((c, i) => (
              <ListRow
                key={c.id}
                title={c.name || 'Sans nom'}
                subtitle={[
                  PIPELINE_STAGE_LABELS[c.pipeline_stage as PipelineStage] ?? c.pipeline_stage,
                  segmentLabel(c.segment),
                  `Dernier signe de vie : ${formatDueLabel(c.last_sign_day, today)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                left={<Ionicons name="person-outline" size={18} color={tint.fg} />}
                right={
                  <TextAction
                    label="Supprimer"
                    icon="trash-outline"
                    tint={tint}
                    accessibilityLabel={`Supprimer ${c.name || 'ce prospect'}`}
                    onPress={() => confirmOne(c)}
                  />
                }
                onPress={() => router.push(`/agency/contacts/${c.id}`)}
                chevron={false}
                isLast={i === candidates.length - 1}
              />
            ))}
          </CardList>
        ) : (
          <CardNote>Aucun prospect à purger.</CardNote>
        )}
        {candidates.length > 1 && <Button label={`Tout supprimer (${candidates.length})`} variant="danger" onPress={confirmAll} />}
      </CategoryCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
