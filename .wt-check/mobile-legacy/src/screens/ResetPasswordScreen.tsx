import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { parseRecoveryLink } from '../auth/recoveryLink';
import { useSession } from '../auth/SessionProvider';
import { AuthLayout } from '../components/AuthLayout';
import { Button, Field } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/ThemeProvider';

// Minimum par défaut de Supabase Auth ; le serveur reste juge (politique du projet).
const MIN_PASSWORD_LENGTH = 6;
const NETWORK_ERROR = 'Impossible de joindre le serveur. Vérifie ta connexion puis réessaie.';
const LINK_INVALID =
  'Ce lien de réinitialisation est invalide, expiré ou déjà utilisé. Demande un nouveau lien.';

type Step =
  | { name: 'checking' }
  | { name: 'form' }
  | { name: 'invalid'; message: string }
  | { name: 'done' };

function linkErrorMessage(code: string): string {
  if (code === 'otp_expired')
    return 'Ce lien a expiré ou a déjà été utilisé. Demande un nouveau lien de réinitialisation.';
  return LINK_INVALID;
}

function updateErrorMessage(error: unknown): string {
  if (isAuthRetryableFetchError(error)) return NETWORK_ERROR;
  if (isAuthApiError(error)) {
    if (error.code === 'same_password')
      return 'Le nouveau mot de passe doit être différent de l’ancien.';
    if (error.code === 'weak_password') return `Mot de passe trop faible : ${error.message}`;
  }
  return 'Le mot de passe n’a pas pu être modifié. Réessaie dans un instant.';
}

/**
 * Cible du lien « mot de passe oublié » (deep link `road://reset-password#access_token=…`).
 * Expo Router ignore le fragment pour le routage : les jetons sont relus depuis l'URL brute
 * (expo-linking), puis `setSession` ouvre la session de récupération avant `updateUser`.
 * Route hors des `Stack.Protected` : accessible avec ou sans session.
 */
export function ResetPasswordScreen() {
  const url = Linking.useLinkingURL();
  const { session } = useSession();
  const { colors, spacing, typography } = useTheme();
  // Résultat de l'échange des jetons du dernier lien traité (puis de updateUser).
  const [outcome, setOutcome] = useState<{ url: string; step: Step } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un même lien n'est traité qu'une fois (useLinkingURL peut renvoyer la même URL).
  const handledUrl = useRef<string | null>(null);

  const link = useMemo(() => parseRecoveryLink(url), [url]);
  const step: Step =
    link.kind === 'error'
      ? { name: 'invalid', message: linkErrorMessage(link.code) }
      : link.kind === 'tokens'
        ? outcome?.url === url
          ? outcome.step
          : { name: 'checking' }
        : (outcome?.step ?? { name: 'invalid', message: LINK_INVALID });
  const setStep = (next: Step) => setOutcome((o) => o && { ...o, step: next });

  useEffect(() => {
    if (link.kind !== 'tokens' || !url || url === handledUrl.current) return;
    handledUrl.current = url;
    const done = (next: Step) => setOutcome({ url, step: next });
    supabase.auth
      .setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
      .then(({ error: e }) =>
        done(
          e
            ? { name: 'invalid', message: isAuthRetryableFetchError(e) ? NETWORK_ERROR : LINK_INVALID }
            : { name: 'form' }
        )
      )
      .catch(() => done({ name: 'invalid', message: NETWORK_ERROR }));
  }, [link, url]);

  const submit = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.updateUser({ password });
      if (!e) setStep({ name: 'done' });
      else if (isAuthApiError(e) && (e.status === 401 || e.code === 'session_not_found'))
        setStep({ name: 'invalid', message: LINK_INVALID });
      else setError(updateErrorMessage(e));
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const body = [typography.body, { color: colors.textMuted }];

  let title;
  let content;
  switch (step.name) {
    case 'checking':
      title = 'Nouveau mot de passe';
      content = (
        <>
          <ActivityIndicator color={colors.primary} />
          <Text style={[body, styles.center]}>Vérification du lien…</Text>
        </>
      );
      break;
    case 'invalid':
      title = 'Lien invalide';
      content = (
        <>
          <Text style={[body, { color: colors.danger }]}>{step.message}</Text>
          {session ? (
            <Button label="Retour à l’app" onPress={() => router.replace('/')} />
          ) : (
            <Button
              label="Demander un nouveau lien"
              onPress={() => router.replace({ pathname: '/sign-in', params: { mode: 'forgot' } })}
            />
          )}
        </>
      );
      break;
    case 'done':
      title = 'Mot de passe modifié';
      content = (
        <>
          <Text style={body}>Ton nouveau mot de passe est enregistré. Tu es connecté.</Text>
          <Button label="Continuer" onPress={() => router.replace('/')} />
        </>
      );
      break;
    case 'form':
      title = 'Nouveau mot de passe';
      content = (
        <>
          <Text style={[body, { marginBottom: spacing.sm }]}>
            Choisis un nouveau mot de passe pour {session?.user.email ?? 'ton compte'}.
          </Text>
          <Field
            placeholder="Nouveau mot de passe"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            value={password}
            onChangeText={setPassword}
          />
          <Field
            placeholder="Confirmation"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            value={confirmation}
            onChangeText={setConfirmation}
          />
          {busy ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
          ) : (
            <View style={{ marginTop: spacing.sm }}>
              <Button label="Enregistrer" onPress={submit} />
            </View>
          )}
          {error && <Text style={[typography.small, { color: colors.danger }]}>{error}</Text>}
        </>
      );
      break;
  }

  return <AuthLayout title={title}>{content}</AuthLayout>;
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
