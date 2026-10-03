import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, CardList, CardNote, CategoryCard, EmptyText, ListRow, Panel } from '../../components/ui';
import { VaultPassphrasePanel } from '../../components/VaultPassphrasePanel';
import { getContact } from '../../db/crmDb';
import { DOCUMENTS, getDocument, type VaultDocument } from '../../db/documentsDb';
import { softDeleteRow } from '../../db/entityTable';
import { getProject } from '../../db/projectsDb';
import { formatEditedLabel } from '../../lib/dates';
import { decryptDocument, isVaultUnlocked } from '../../lib/vault';
import { downloadEncrypted, openDecrypted, removeEncrypted } from '../../lib/vaultFiles';
import { useToday } from '../../lib/useToday';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

type Detail = { doc: VaultDocument | null; contactName: string | null; projectTitle: string | null };
const EMPTY: Detail = { doc: null, contactName: null, projectTitle: null };

/** Fiche d'un document : déchiffrement à la demande (phrase redemandée si le coffre est verrouillé). */
export function VaultDocumentScreen({ userId, id }: { userId: string; id: string }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, fontSize } = useTheme();
  // Sans catégorie métier : menthe, comme la carte Sécurité des Réglages.
  const tint = colors.tints.mint;
  const [unlocked, setUnlocked] = useState(() => isVaultUnlocked(userId));
  const [step, setStep] = useState<'downloading' | 'decrypting' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (d: SQLiteDatabase): Promise<Detail> => {
      const doc = await getDocument(d, id);
      return {
        doc,
        contactName: doc?.contact_id ? ((await getContact(d, doc.contact_id))?.name ?? null) : null,
        projectTitle: doc?.project_id ? ((await getProject(d, doc.project_id))?.title ?? null) : null,
      };
    },
    [id]
  );
  const { data, loaded } = useLocalQuery(load, EMPTY);
  const { doc } = data;

  const open = async () => {
    if (!doc || step) return;
    setError(null);
    try {
      setStep('downloading');
      const blob = await downloadEncrypted(doc.storage_path);
      setStep('decrypting');
      await new Promise((r) => setTimeout(r, 50));
      const { meta, bytes } = decryptDocument(userId, blob);
      setStep(null);
      await openDecrypted(meta, bytes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStep(null);
    }
  };

  const confirmDelete = () => {
    if (!doc) return;
    Alert.alert('Supprimer ce document ?', 'Le fichier chiffré sera supprimé du serveur.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void runLocal(() => softDeleteRow(db, DOCUMENTS, doc));
          void removeEncrypted(doc.storage_path);
          router.back();
        },
      },
    ]);
  };

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  if (!doc) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Stack.Screen options={{ title: 'Document' }} />
        <EmptyText>Ce document n’existe plus (supprimé sur un autre appareil ?).</EmptyText>
      </View>
    );
  }

  const infoRows = [
    data.contactName && { icon: 'person-outline' as const, text: data.contactName },
    data.projectTitle && { icon: 'git-branch-outline' as const, text: data.projectTitle },
    { icon: 'time-outline' as const, text: `Ajouté ${formatEditedLabel(doc.created_at, today).toLowerCase()}` },
  ].filter((r): r is { icon: 'person-outline' | 'git-branch-outline' | 'time-outline'; text: string } => !!r);

  return (
    <>
      <Stack.Screen options={{ title: doc.title || 'Document' }} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Coffre : carte menthe, comme sa carte du menu Agence (DECISIONS.md §29-30). */}
        <CategoryCard tint={tint} icon="document-lock-outline" title="Document">
          <CardList>
            {infoRows.map((r, i) => (
              <ListRow
                key={r.icon}
                title={r.text}
                left={<Ionicons name={r.icon} size={18} color={tint.fg} />}
                isLast={i === infoRows.length - 1}
              />
            ))}
          </CardList>
          <CardNote>
            Le document est déchiffré sur l’appareil uniquement, puis proposé à l’ouverture ou au partage. La copie
            temporaire est effacée en quittant le coffre.
          </CardNote>
        </CategoryCard>

        <View style={{ gap: spacing.lg }}>
          {!unlocked ? (
            <VaultPassphrasePanel userId={userId} onUnlocked={() => setUnlocked(true)} />
          ) : step ? (
            <View style={[styles.row, { gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.sm }]}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>
                {step === 'downloading' ? 'Téléchargement…' : 'Déchiffrement…'}
              </Text>
            </View>
          ) : (
            <Button label="Déchiffrer et ouvrir" onPress={() => void open()} />
          )}

          {error && (
            <Panel style={{ padding: spacing.lg, borderWidth: 1, borderColor: colors.danger }}>
              <Text style={{ color: colors.danger, fontSize: fontSize.small }}>{error}</Text>
            </Panel>
          )}

          <Button label="Supprimer le document" variant="danger" onPress={confirmDelete} />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
});
