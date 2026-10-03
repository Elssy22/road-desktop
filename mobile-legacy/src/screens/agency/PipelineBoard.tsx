import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { askMarkAsActiveClient, PipelineStageSheet, STAGE_ICONS } from '../../components/PipelineStageSheet';
import { CardList, CardNote, CategoryCard, ListRow, TextAction } from '../../components/ui';
import {
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGES,
  segmentLabel,
  setPipelineStage,
  type Contact,
  type PipelineStage,
} from '../../db/crmDb';
import { formatDueLabel, type DateKey } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

/** Relance la plus proche d'abord (sans date en dernier), puis par nom. */
const byFollowup = (a: Contact, b: Contact) =>
  (a.next_followup_date ?? '9999').localeCompare(b.next_followup_date ?? '9999') ||
  a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

/**
 * Kanban simplifié pour mobile (filtre « Prospects » de l'écran Contacts) : les
 * cinq colonnes du pipeline sont empilées en cartes roses, avec le total
 * potentiel de chacune. Pas de glisser-déposer : « Étape » sur chaque ligne
 * ouvre le sélecteur. `prospects` = contacts filtrés ayant une étape.
 */
export function PipelineBoard({
  prospects,
  filtered,
  today,
}: {
  prospects: Contact[];
  /** Une recherche est active (message de liste vide). */
  filtered: boolean;
  today: DateKey;
}) {
  const db = useSQLiteContext();
  const { runLocal, syncing, syncNow } = useSync();
  const { colors, spacing, typography, categories } = useTheme();
  const tint = categories.contacts;
  const [editing, setEditing] = useState<Contact | null>(null);

  const columns = useMemo(
    () =>
      PIPELINE_STAGES.map((stage) => {
        const items = prospects.filter((c) => c.pipeline_stage === stage).sort(byFollowup);
        const total = Math.round(items.reduce((sum, c) => sum + (c.pipeline_amount ?? 0), 0) * 100) / 100;
        return { stage, items, total };
      }),
    [prospects]
  );

  const changeStage = (c: Contact, stage: PipelineStage) => {
    setEditing(null);
    if (stage === c.pipeline_stage) return;
    void runLocal(() => setPipelineStage(db, c, stage));
    if (stage === 'signe') {
      askMarkAsActiveClient(c.name, () => void runLocal(() => setPipelineStage(db, { ...c, pipeline_stage: stage }, null)));
    }
  };

  const subtitle = (c: Contact) => {
    const parts = [segmentLabel(c.segment)];
    if (c.pipeline_amount != null) parts.push(formatMoney(c.pipeline_amount, 'EUR'));
    if (c.next_followup_date) {
      const label = formatDueLabel(c.next_followup_date, today);
      parts.push(c.next_followup_date < today ? `Relance en retard (${label})` : `Relance ${label}`);
    }
    return parts.filter(Boolean).join(' · ') || null;
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={syncNow} />}
      >
        {prospects.length === 0 ? (
          <CategoryCard tint={tint} icon="trending-up-outline" title="Prospection">
            <CardNote>
              {filtered
                ? 'Aucun prospect ne correspond.'
                : 'Aucun prospect. Dans la fiche d’un contact, « Modifier » puis active « Prospection » pour le suivre ici.'}
            </CardNote>
          </CategoryCard>
        ) : (
          columns.map(({ stage, items, total }) => (
            <CategoryCard
              key={stage}
              tint={tint}
              icon={STAGE_ICONS[stage]}
              title={PIPELINE_STAGE_LABELS[stage]}
              count={items.length}
              action={
                total > 0 ? (
                  <Text style={[typography.small, { color: tint.fg, fontWeight: '700' }]}>{formatMoney(total, 'EUR')}</Text>
                ) : undefined
              }
            >
              {items.length > 0 ? (
                <CardList>
                  {items.map((c, i) => (
                    <ListRow
                      key={c.id}
                      title={c.name || 'Sans nom'}
                      subtitle={subtitle(c)}
                      muted={stage === 'perdu'}
                      chevron={false}
                      right={
                        <TextAction
                          label="Étape"
                          icon="swap-vertical"
                          tint={tint}
                          accessibilityLabel={`Changer l’étape de ${c.name || 'ce contact'}`}
                          onPress={() => setEditing(c)}
                        />
                      }
                      onPress={() => router.push(`/agency/contacts/${c.id}`)}
                      isLast={i === items.length - 1}
                    />
                  ))}
                </CardList>
              ) : (
                <CardNote>Aucun prospect à cette étape.</CardNote>
              )}
            </CategoryCard>
          ))
        )}
        {prospects.length > 0 && (
          <View style={{ paddingHorizontal: spacing.xs }}>
            <Text style={[typography.small, { color: colors.textMuted }]}>
              Appuie sur un prospect pour ouvrir sa fiche, sur « Étape » pour le changer de colonne.
            </Text>
          </View>
        )}
      </ScrollView>
      <PipelineStageSheet
        visible={editing !== null}
        title={editing ? `Étape · ${editing.name || 'Sans nom'}` : undefined}
        value={editing?.pipeline_stage ?? null}
        onSelect={(s) => editing && changeStage(editing, s)}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
