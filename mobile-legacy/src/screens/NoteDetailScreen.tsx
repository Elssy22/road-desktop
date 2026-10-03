import Ionicons from '@expo/vector-icons/Ionicons';
import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { Stack, router } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { CardNote, CategoryCard, Panel } from '../components/ui';
import { getNote, saveNote, softDeleteNote } from '../db/notesDb';
import { useSync } from '../sync/SyncProvider';
import { useTheme } from '../theme/ThemeProvider';
import { NEW_NOTE_ID } from './NotesScreen';

// Sauvegarde auto après une courte pause de frappe (et à la sortie de l'écran) :
// pas de bouton « Enregistrer », et pas une entrée d'outbox par caractère.
const SAVE_DEBOUNCE_MS = 700;

type Content = { title: string; body: string; pinned: boolean };

const EMPTY: Content = { title: '', body: '', pinned: false };
const isEmpty = (c: Content) => !c.title.trim() && !c.body.trim() && !c.pinned;
const sameContent = (a: Content, b: Content) =>
  a.title === b.title && a.body === b.body && a.pinned === b.pinned;

export function NoteDetailScreen({ userId, id }: { userId: string; id: string }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const { colors, spacing, fontSize, typography, categories } = useTheme();
  const tint = categories.notes;
  const headerHeight = useHeaderHeight();

  const isNew = id === NEW_NOTE_ID;
  // Une nouvelle note reçoit son id tout de suite mais n'est écrite en base
  // qu'à la première saisie : ouvrir puis quitter ne crée pas de note vide.
  const [noteId] = useState(() => (isNew ? randomUUID() : id));
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>(isNew ? 'ready' : 'loading');
  const [draft, setDraft] = useState<Content>(EMPTY);

  // Source de vérité pour les sauvegardes différées (lues hors du render).
  const draftRef = useRef<Content>(EMPTY);
  /** Dernier contenu écrit en base ; `null` tant que la note n'existe pas en local. */
  const savedRef = useRef<Content | null>(null);
  const deletedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chargement unique : on ne recharge pas sur `dataVersion` pour ne pas écraser
  // la saisie en cours si une sync arrive pendant l'édition.
  useEffect(() => {
    if (isNew) return;
    let active = true;
    getNote(db, noteId)
      .then((note) => {
        if (!active) return;
        if (!note) {
          setStatus('missing');
          return;
        }
        const content = { title: note.title, body: note.body, pinned: note.pinned };
        draftRef.current = content;
        savedRef.current = content;
        setDraft(content);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('missing');
      });
    return () => {
      active = false;
    };
  }, [db, noteId, isNew]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const content = draftRef.current;
    const saved = savedRef.current;
    if (deletedRef.current) return;
    if (saved ? sameContent(saved, content) : isEmpty(content)) return;
    savedRef.current = content;
    await runLocal(() => saveNote(db, { id: noteId, user_id: userId, ...content }));
  }, [db, runLocal, noteId, userId]);

  // Sortie de l'écran (retour, changement d'onglet…) : on écrit ce qui reste.
  useEffect(() => () => void flush(), [flush]);

  const update = (patch: Partial<Content>, immediate = false) => {
    draftRef.current = { ...draftRef.current, ...patch };
    setDraft(draftRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (immediate) void flush();
    else timerRef.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  };

  const confirmDelete = () => {
    const remove = async () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      deletedRef.current = true;
      if (savedRef.current) await runLocal(() => softDeleteNote(db, { id: noteId, user_id: userId }));
      router.back();
    };
    // Rien d'écrit en base : pas besoin de confirmation.
    if (!savedRef.current) {
      void remove();
      return;
    }
    Alert.alert('Supprimer la note ?', 'Elle sera supprimée sur tous tes appareils.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => void remove() },
    ]);
  };

  const headerButton = (
    icon: 'pin' | 'pin-outline' | 'trash-outline',
    label: string,
    color: string,
    onPress: () => void
  ) => (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingHorizontal: spacing.sm })}
    >
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: isNew ? 'Nouvelle note' : 'Note',
          headerRight:
            status === 'ready'
              ? () => (
                  <View style={styles.headerActions}>
                    {headerButton(
                      draft.pinned ? 'pin' : 'pin-outline',
                      draft.pinned ? 'Désépingler' : 'Épingler',
                      draft.pinned ? colors.primary : colors.textMuted,
                      () => update({ pinned: !draftRef.current.pinned }, true)
                    )}
                    {headerButton('trash-outline', 'Supprimer la note', colors.danger, confirmDelete)}
                  </View>
                )
              : undefined,
        }}
      />

      {status === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {status === 'missing' && (
        <View style={{ padding: spacing.lg }}>
          <CategoryCard tint={tint} icon="document-text-outline" title="Note introuvable">
            <CardNote>Cette note n&apos;existe plus (supprimée, peut-être sur un autre appareil).</CardNote>
          </CategoryCard>
        </View>
      )}

      {status === 'ready' && (
        <KeyboardAvoidingView
          style={[styles.container, { padding: spacing.lg, paddingTop: spacing.sm }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={headerHeight}
        >
          {/* Feuille blanche sur le fond doux, liseré lavande de la catégorie Notes. */}
          <Panel style={[styles.container, { overflow: 'hidden', borderTopWidth: 4, borderTopColor: tint.iconBg }]}>
            <TextInput
              value={draft.title}
              onChangeText={(title) => update({ title })}
              onBlur={() => void flush()}
              placeholder="Titre"
              placeholderTextColor={colors.textFaint}
              autoFocus={isNew}
              returnKeyType="next"
              submitBehavior="submit"
              style={[
                typography.heading,
                {
                  color: colors.text,
                  paddingHorizontal: spacing.lg,
                  paddingTop: spacing.lg,
                  paddingBottom: spacing.sm,
                },
              ]}
            />
            <TextInput
              value={draft.body}
              onChangeText={(body) => update({ body })}
              onBlur={() => void flush()}
              placeholder="Écris ta note…"
              placeholderTextColor={colors.textFaint}
              multiline
              textAlignVertical="top"
              style={[
                styles.body,
                {
                  color: colors.text,
                  fontSize: fontSize.body,
                  lineHeight: fontSize.body * 1.4,
                  paddingHorizontal: spacing.lg,
                  paddingBottom: spacing.xxl,
                },
              ]}
            />
          </Panel>
        </KeyboardAvoidingView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1 },
});
