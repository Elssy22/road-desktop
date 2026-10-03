import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Sheet, SheetOption } from '../../components/Sheet';
import { Button, CardList, CardNote, CategoryCard, EmptyText, Field, ListRow, Panel } from '../../components/ui';
import { VaultPassphrasePanel } from '../../components/VaultPassphrasePanel';
import { listContacts, type ContactWithLast } from '../../db/crmDb';
import { addDocument, listDocuments, type DocumentWithLinks } from '../../db/documentsDb';
import { listProjects, type ProjectWithProgress } from '../../db/projectsDb';
import { formatEditedLabel } from '../../lib/dates';
import { encryptDocument, isVaultUnlocked, lockVault } from '../../lib/vault';
import { clearOpenedDocuments, readPickedFile, uploadEncrypted } from '../../lib/vaultFiles';
import { useToday } from '../../lib/useToday';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

type Lists = { documents: DocumentWithLinks[]; contacts: ContactWithLast[]; projects: ProjectWithProgress[] };
const EMPTY: Lists = { documents: [], contacts: [], projects: [] };

type Draft = {
  uri: string;
  size: number | undefined;
  name: string;
  mime: string;
  title: string;
  contact_id: string | null;
  project_id: string | null;
};

/** Coffre : liste des documents (titres en clair) et ajout d'un fichier chiffré. */
export function VaultScreen({ userId }: { userId: string }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, radius, fontSize } = useTheme();
  // Sans catégorie métier : menthe, comme la carte Sécurité des Réglages.
  const tint = colors.tints.mint;
  const [unlocked, setUnlocked] = useState(() => isVaultUnlocked(userId));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState<'reading' | 'encrypting' | 'uploading' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<'contact' | 'project' | null>(null);

  const load = useCallback(
    async (d: SQLiteDatabase): Promise<Lists> => ({
      documents: await listDocuments(d, userId),
      contacts: await listContacts(d, userId),
      projects: (await listProjects(d, userId)).filter((p) => p.status !== 'terminé'),
    }),
    [userId]
  );
  const { data, loaded } = useLocalQuery(load, EMPTY);

  // Le coffre a pu être déverrouillé (ou verrouillé) depuis la fiche d'un document.
  useFocusEffect(useCallback(() => setUnlocked(isVaultUnlocked(userId)), [userId]));
  // Les copies déchiffrées ouvertes depuis le coffre ne restent pas dans le cache.
  useEffect(() => () => clearOpenedDocuments(), []);

  const lock = () => {
    lockVault(userId);
    setUnlocked(false);
    setDraft(null);
  };

  const pick = async () => {
    setError(null);
    // Android : on garde l'URI content:// (lue via ContentResolver par expo-file-system). La copie
    // dans le cache est refusée en lecture sous Expo Go (permissions limitées au dossier du projet)
    // et laisserait en plus une copie en clair du document dans le cache.
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: Platform.OS !== 'android',
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setDraft({
      uri: a.uri,
      size: a.size,
      name: a.name,
      mime: a.mimeType ?? 'application/octet-stream',
      title: a.name.replace(/\.[^.]+$/, ''),
      contact_id: null,
      project_id: null,
    });
  };

  const send = async () => {
    if (!draft || step) return;
    setError(null);
    try {
      setStep('reading');
      const bytes = await readPickedFile(draft.uri, draft.size);
      setStep('encrypting');
      // Laisse l'indicateur s'afficher avant le calcul (synchrone, en JS).
      await new Promise((r) => setTimeout(r, 50));
      const encrypted = encryptDocument(userId, bytes, { name: draft.name, mime: draft.mime });
      setStep('uploading');
      const storage_path = await uploadEncrypted(userId, encrypted);
      // La ligne n'est écrite qu'une fois le fichier chiffré envoyé : jamais de document sans fichier.
      await runLocal(async () => {
        await addDocument(db, userId, {
          title: draft.title.trim() || draft.name,
          storage_path,
          contact_id: draft.contact_id,
          project_id: draft.project_id,
        });
      });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStep(null);
    }
  };

  const contactName = data.contacts.find((c) => c.id === draft?.contact_id)?.name ?? null;
  const projectTitle = data.projects.find((p) => p.id === draft?.project_id)?.title ?? null;
  const stepLabel = { reading: 'Lecture du fichier…', encrypting: 'Chiffrement…', uploading: 'Envoi du fichier chiffré…' };

  const pickerRow = (
    icon: 'person-outline' | 'git-branch-outline',
    text: string | null,
    placeholder: string,
    onPress: () => void,
    onClear: () => void
  ) => (
    // Présenté comme un champ blanc sur le fond pastel de la carte.
    <View
      style={[
        styles.row,
        {
          justifyContent: 'space-between',
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={[styles.row, styles.flex, { gap: spacing.sm, paddingVertical: spacing.md }]}
      >
        <Ionicons name={icon} size={18} color={tint.fg} />
        <Text numberOfLines={1} style={{ flexShrink: 1, color: text ? colors.text : colors.textFaint, fontSize: fontSize.body }}>
          {text ?? placeholder}
        </Text>
      </Pressable>
      {text && (
        <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>Retirer</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Coffre',
          headerRight: unlocked
            ? () => (
                <Pressable onPress={lock} hitSlop={8} accessibilityRole="button" accessibilityLabel="Verrouiller le coffre">
                  <Ionicons name="lock-open-outline" size={20} color={colors.textMuted} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Coffre : cartes menthe, comme sa carte du menu Agence (DECISIONS.md §29-30). */}
        {!unlocked ? (
          <View style={{ marginBottom: spacing.lg }}>
            <VaultPassphrasePanel userId={userId} onUnlocked={() => setUnlocked(true)} />
          </View>
        ) : draft ? (
          <CategoryCard tint={tint} icon="document-attach-outline" title="Nouveau document">
            <View style={{ gap: spacing.md }}>
              <CardNote>
                {draft.name}
                {draft.size != null ? ` · ${(draft.size / 1024).toFixed(0)} Ko` : ''}
              </CardNote>
              <Field
                value={draft.title}
                onChangeText={(title) => setDraft((d) => d && { ...d, title })}
                placeholder="Titre"
                editable={!step}
              />
              <CardNote>Le titre est visible en clair sur le serveur ; le fichier et son nom sont chiffrés.</CardNote>
              {pickerRow('person-outline', contactName, 'Contact (facultatif)', () => setPicking('contact'), () =>
                setDraft((d) => d && { ...d, contact_id: null })
              )}
              {pickerRow('git-branch-outline', projectTitle, 'Projet (facultatif)', () => setPicking('project'), () =>
                setDraft((d) => d && { ...d, project_id: null })
              )}
              {step ? (
                <View style={[styles.row, { gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.sm }]}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>{stepLabel[step]}</Text>
                </View>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  <Button label="Chiffrer et envoyer" onPress={() => void send()} />
                  <Button label="Annuler" variant="secondary" onPress={() => setDraft(null)} />
                </View>
              )}
            </View>
          </CategoryCard>
        ) : (
          <View style={{ marginBottom: spacing.lg }}>
            <Button label="Ajouter un document" onPress={() => void pick()} />
          </View>
        )}

        {error && (
          <Panel style={{ padding: spacing.lg, borderWidth: 1, borderColor: colors.danger, marginBottom: spacing.lg }}>
            <Text style={{ color: colors.danger, fontSize: fontSize.small }}>{error}</Text>
          </Panel>
        )}

        <CategoryCard tint={tint} icon="lock-closed-outline" title="Documents" count={data.documents.length}>
          {!loaded ? (
            <ActivityIndicator color={tint.fg} />
          ) : data.documents.length === 0 ? (
            <CardNote>Aucun document dans le coffre.</CardNote>
          ) : (
            <CardList>
              {data.documents.map((d, i) => (
                <ListRow
                  key={d.id}
                  title={d.title || 'Sans titre'}
                  subtitle={[d.contact_name, d.project_title, formatEditedLabel(d.created_at, today)].filter(Boolean).join(' · ')}
                  left={<Ionicons name="document-lock-outline" size={20} color={tint.fg} />}
                  onPress={() => router.push({ pathname: '/agency/vault-document', params: { id: d.id } })}
                  isLast={i === data.documents.length - 1}
                />
              ))}
            </CardList>
          )}
        </CategoryCard>
      </ScrollView>

      <Sheet visible={picking === 'contact'} onClose={() => setPicking(null)} title="Contact lié">
        {data.contacts.length === 0 ? (
          <EmptyText>Aucun contact.</EmptyText>
        ) : (
          <ScrollView style={{ maxHeight: 360 }}>
            {data.contacts.map((c) => (
              <SheetOption
                key={c.id}
                label={c.club ? `${c.name} · ${c.club}` : c.name}
                selected={draft?.contact_id === c.id}
                onPress={() => {
                  setDraft((d) => d && { ...d, contact_id: c.id });
                  setPicking(null);
                }}
              />
            ))}
          </ScrollView>
        )}
      </Sheet>
      <Sheet visible={picking === 'project'} onClose={() => setPicking(null)} title="Projet lié">
        {data.projects.length === 0 ? (
          <EmptyText>Aucun projet en cours.</EmptyText>
        ) : (
          <ScrollView style={{ maxHeight: 360 }}>
            {data.projects.map((p) => (
              <SheetOption
                key={p.id}
                label={p.title}
                selected={draft?.project_id === p.id}
                onPress={() => {
                  setDraft((d) => d && { ...d, project_id: p.id });
                  setPicking(null);
                }}
              />
            ))}
          </ScrollView>
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
