import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { resetPasswordRedirectUrl } from '../auth/recoveryLink';
import { useSession } from '../auth/SessionProvider';
import { AuthLayout } from '../components/AuthLayout';
import { Button, Field } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/ThemeProvider';

type Notice = { text: string; tone: 'error' | 'info' };

const RESET_SENT =
  'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé. ' +
  'Ouvre le lien reçu par email depuis ce téléphone (l’app Road doit être installée).';
const NETWORK_ERROR = 'Impossible de joindre le serveur. Vérifie ta connexion puis réessaie.';

/**
 * Message affiché après une demande de réinitialisation. Ne doit jamais révéler
 * si un compte existe : Supabase répond déjà sans erreur pour un email inconnu,
 * et on ne détaille pas les autres erreurs serveur.
 */
function resetErrorMessage(error: unknown): string {
  if (isAuthRetryableFetchError(error)) return NETWORK_ERROR;
  if (isAuthApiError(error) && error.status === 429)
    return 'Trop de demandes : patiente quelques minutes avant de réessayer.';
  return 'La demande n’a pas pu aboutir. Réessaie dans un instant.';
}

/**
 * Connexion email / mot de passe : indispensable pour que les deux appareils
 * partagent le même auth.uid() (et donc les mêmes données via la RLS).
 * Nécessite une connexion la première fois ; la session est ensuite persistée.
 */
export function AuthScreen() {
  const { error: sessionError } = useSession();
  const { colors, spacing, typography } = useTheme();
  // `?mode=forgot` : retour depuis un lien de réinitialisation expiré (écran reset-password).
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'signIn' | 'forgot'>(params.mode === 'forgot' ? 'forgot' : 'signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const run = async (action: 'signIn' | 'signUp') => {
    setBusy(true);
    setNotice(null);
    const credentials = { email: email.trim(), password };
    const { data, error } =
      action === 'signIn'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
    setBusy(false);
    if (error) setNotice({ text: error.message, tone: 'error' });
    else if (action === 'signUp' && !data.session)
      setNotice({ text: 'Compte créé : confirme ton email puis connecte-toi.', tone: 'error' });
  };

  const sendReset = async () => {
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setNotice({ text: 'Saisis une adresse email valide.', tone: 'error' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: resetPasswordRedirectUrl(),
      });
      setNotice(error ? { text: resetErrorMessage(error), tone: 'error' } : { text: RESET_SENT, tone: 'info' });
    } catch {
      // resetPasswordForEmail relance les erreurs non-Auth : on ne plante pas l'écran.
      setNotice({ text: NETWORK_ERROR, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: 'signIn' | 'forgot') => {
    setMode(next);
    setNotice(null);
  };

  const forgot = mode === 'forgot';

  return (
    <AuthLayout title={forgot ? 'Mot de passe oublié' : 'Bonjour'}>
      <Text style={[typography.body, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        {forgot
          ? 'Indique ton email : on t’envoie un lien pour choisir un nouveau mot de passe.'
          : 'Connecte-toi pour retrouver ta journée.'}
      </Text>
      <Field
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {!forgot && (
        <Field placeholder="Mot de passe" secureTextEntry value={password} onChangeText={setPassword} />
      )}
      {busy ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
      ) : forgot ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Button label="Envoyer le lien" onPress={sendReset} />
          <Button label="Retour à la connexion" variant="secondary" onPress={() => switchMode('signIn')} />
        </View>
      ) : (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Button label="Se connecter" onPress={() => run('signIn')} />
          <Button label="Créer un compte" variant="secondary" onPress={() => run('signUp')} />
          <Pressable onPress={() => switchMode('forgot')} hitSlop={6} accessibilityRole="button">
            <Text style={[typography.small, styles.center, { color: colors.primary, fontWeight: '600', marginTop: spacing.sm }]}>
              Mot de passe oublié ?
            </Text>
          </Pressable>
        </View>
      )}
      {(notice ?? sessionError) && (
        <Text style={[typography.small, { color: notice?.tone === 'info' ? colors.success : colors.danger }]}>
          {notice?.text ?? `Session : ${sessionError}`}
        </Text>
      )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
