import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { getVaultConfig, passphraseProblem, resetVaultOnDevice, setupVault, unlockVault } from '../lib/vault';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Field, Panel } from './ui';

/**
 * Création du coffre (première fois sur cet appareil) ou déverrouillage.
 * La phrase n'est jamais stockée : seul un hash de vérification l'est, en local.
 */
export function VaultPassphrasePanel({ userId, onUnlocked }: { userId: string; onUnlocked: () => void }) {
  const { colors, spacing, fontSize, radius } = useTheme();
  const [configured, setConfigured] = useState(() => getVaultConfig(userId) != null);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = configured ? null : passphraseProblem(passphrase, confirmation);
  const canSubmit = !busy && passphrase.length > 0 && (configured || (!problem && understood));

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (configured) await unlockVault(userId, passphrase);
      else await setupVault(userId, passphrase);
      setPassphrase('');
      setConfirmation('');
      onUnlocked();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = () =>
    Alert.alert(
      'Saisir une autre phrase ?',
      'La phrase enregistrée sur cet appareil sera oubliée. Les documents déjà chiffrés ne seront lisibles qu’avec la phrase qui a servi à les chiffrer : il n’existe aucune récupération.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Oublier sur cet appareil',
          style: 'destructive',
          onPress: () =>
            void resetVaultOnDevice(userId).then(() => {
              setConfigured(false);
              setError(null);
            }),
        },
      ]
    );

  return (
    // Carte blanche, comme les écrans de connexion (DECISIONS.md §28, §30).
    <Panel style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Ionicons name={configured ? 'lock-closed-outline' : 'key-outline'} size={20} color={colors.primary} />
        <Text style={{ color: colors.text, fontSize: fontSize.heading, fontWeight: '600' }}>
          {configured ? 'Coffre verrouillé' : 'Choisis ta phrase secrète'}
        </Text>
      </View>

      {!configured && (
        <View
          style={{
            borderColor: colors.danger,
            borderWidth: 1,
            borderRadius: radius.md,
            padding: spacing.md,
            gap: spacing.xs,
          }}
        >
          <Text style={{ color: colors.danger, fontWeight: '700', fontSize: fontSize.small }}>
            ⚠️ Si vous oubliez cette phrase, les documents chiffrés sont perdus définitivement, sans récupération
            possible.
          </Text>
          <Text style={{ color: colors.text, fontSize: fontSize.small }}>
            Elle n’est envoyée nulle part et personne (ni l’app, ni Supabase) ne peut la retrouver. Note-la dans un
            gestionnaire de mots de passe. Sur un autre appareil, saisis exactement la même phrase.
          </Text>
        </View>
      )}

      <Field
        value={passphrase}
        onChangeText={setPassphrase}
        placeholder={configured ? 'Phrase secrète' : 'Phrase secrète (10 caractères min.)'}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        editable={!busy}
        onSubmitEditing={configured ? () => void submit() : undefined}
      />
      {!configured && (
        <>
          <Field
            value={confirmation}
            onChangeText={setConfirmation}
            placeholder="Confirme la phrase secrète"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            editable={!busy}
          />
          {passphrase.length > 0 && problem && (
            <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>{problem}</Text>
          )}
          <Pressable
            onPress={() => setUnderstood((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: understood }}
            style={[styles.row, { gap: spacing.sm }]}
          >
            <Ionicons
              name={understood ? 'checkbox' : 'square-outline'}
              size={22}
              color={understood ? colors.primary : colors.textFaint}
            />
            <Text style={{ color: colors.text, fontSize: fontSize.small, flexShrink: 1 }}>
              J’ai compris : sans cette phrase, mes documents seront irrécupérables.
            </Text>
          </Pressable>
        </>
      )}

      {error && <Text style={{ color: colors.danger, fontSize: fontSize.small }}>{error}</Text>}

      {busy ? (
        <View style={[styles.row, { gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.sm }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>Calcul de la clé (quelques secondes)…</Text>
        </View>
      ) : (
        <Button
          label={configured ? 'Déverrouiller' : 'Créer le coffre'}
          onPress={() => void submit()}
          disabled={!canSubmit}
        />
      )}

      {configured && !busy && (
        <Pressable onPress={confirmReset} hitSlop={6} accessibilityRole="button">
          <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, textAlign: 'center' }}>
            Autre phrase, ou coffre créé sur un autre appareil ?
          </Text>
        </Pressable>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
