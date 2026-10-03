import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CardNote, CategoryCard, ChipRow, Field, TextAction } from '../../components/ui';
import {
  fetchVeilleSettings,
  MAX_KEYWORDS,
  normalizeKeyword,
  saveKeywords,
  type KeywordList,
  type VeilleSettings,
} from '../../lib/veille';
import { useTheme } from '../../theme/ThemeProvider';

const LISTS: { key: KeywordList; title: string; icon: 'football-outline' | 'megaphone-outline'; help: string; placeholder: string }[] = [
  {
    key: 'sport_keywords',
    title: 'Sport',
    icon: 'football-outline',
    help: 'L’objet de l’avis doit contenir au moins un de ces mots.',
    placeholder: 'Ex. rugby, handball…',
  },
  {
    key: 'activity_keywords',
    title: 'Activité',
    icon: 'megaphone-outline',
    help: 'Et au moins un de ces mots, sauf si l’avis est classé « Publicité, Communication » par l’acheteur.',
    placeholder: 'Ex. vidéo, sponsoring…',
  },
];

/**
 * Mots-clés de la veille BOAMP, enregistrés en ligne dans veille_settings et
 * lus par l'Edge Function boamp-sync à chaque recherche.
 */
export function VeilleSettingsScreen({ userId }: { userId: string }) {
  const { spacing } = useTheme();
  const [settings, setSettings] = useState<VeilleSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchVeilleSettings(userId)
      .then((s) => active && setSettings(s))
      .catch((e: Error) => active && setLoadError(e.message));
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {settings ? (
          LISTS.map((list) => (
            <KeywordCard
              key={list.key}
              userId={userId}
              list={list}
              keywords={settings[list.key]}
              onSaved={(keywords) => setSettings((s) => s && { ...s, [list.key]: keywords })}
            />
          ))
        ) : loadError ? (
          <CardNote tone="danger">Réglages indisponibles (connexion requise) : {loadError}</CardNote>
        ) : (
          <ActivityIndicator />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function KeywordCard({
  userId,
  list,
  keywords,
  onSaved,
}: {
  userId: string;
  list: (typeof LISTS)[number];
  keywords: string[];
  onSaved: (keywords: string[]) => void;
}) {
  const { colors, spacing, radius, typography, categories } = useTheme();
  const tint = categories.veille;
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: string[]) => {
    setSaving(true);
    setError(null);
    try {
      await saveKeywords(userId, list.key, next);
      onSaved(next);
      return true;
    } catch (e) {
      setError(`Enregistrement impossible : ${(e as Error).message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    const word = normalizeKeyword(draft);
    if (!word) return;
    if (keywords.includes(word)) {
      setDraft('');
      return;
    }
    if (keywords.length >= MAX_KEYWORDS) {
      setError(`${MAX_KEYWORDS} mots-clés au maximum.`);
      return;
    }
    if (await save([...keywords, word])) setDraft('');
  };

  const remove = (word: string) => {
    // Sans mot « sport », la recherche ramènerait toute la communication publique.
    if (list.key === 'sport_keywords' && keywords.length === 1) {
      setError('Garde au moins un mot-clé sport.');
      return;
    }
    void save(keywords.filter((k) => k !== word));
  };

  return (
    <CategoryCard
      tint={tint}
      icon={list.icon}
      title={list.title}
      count={keywords.length}
      action={saving ? <ActivityIndicator color={tint.fg} /> : undefined}
    >
      <CardNote>{list.help}</CardNote>
      {keywords.length > 0 ? (
        <ChipRow>
          {keywords.map((word) => (
            <Pressable
              key={word}
              onPress={() => remove(word)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={`Retirer ${word}`}
              style={({ pressed }) => [
                styles.row,
                {
                  gap: spacing.xs,
                  backgroundColor: colors.surface,
                  borderRadius: radius.pill,
                  paddingVertical: spacing.xs + 2,
                  paddingLeft: spacing.md,
                  paddingRight: spacing.sm,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text style={[typography.small, { color: colors.text }]}>{word}</Text>
              <Ionicons name="close" size={14} color={tint.fg} />
            </Pressable>
          ))}
        </ChipRow>
      ) : (
        <CardNote>Aucun mot-clé : seule la catégorie « Publicité, Communication » compte.</CardNote>
      )}
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Field
          value={draft}
          onChangeText={setDraft}
          placeholder={list.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={add}
          editable={!saving}
          accessibilityLabel={`Nouveau mot-clé ${list.title.toLowerCase()}`}
          style={styles.flex}
        />
        <TextAction label="Ajouter" icon="add" tint={tint} onPress={add} disabled={saving || !draft.trim()} />
      </View>
      {error && <CardNote tone="danger">{error}</CardNote>}
    </CategoryCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
