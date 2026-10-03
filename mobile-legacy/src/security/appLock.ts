import * as LocalAuthentication from 'expo-local-authentication';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

// Verrouillage de l'app (expo-local-authentication, SDK 57). Réglage propre à
// l'appareil (pas de sync), dans le kv-store SQLite comme les notifications.

export type AppLockSettings = {
  enabled: boolean;
  /**
   * Message à afficher dans Réglages quand le verrou a été coupé
   * automatiquement (biométrie retirée du téléphone depuis l'activation).
   */
  notice: string | null;
};

const DEFAULT: AppLockSettings = { enabled: false, notice: null };
const KEY = 'app-lock:settings';

/** Délai en arrière-plan au-delà duquel le retour dans l'app redemande l'authentification. */
export const LOCK_AFTER_BACKGROUND_MS = 60_000;

let current: AppLockSettings | null = null;
const listeners = new Set<() => void>();

function read(): AppLockSettings {
  try {
    const raw = Storage.getItemSync(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AppLockSettings>) : null;
    return {
      enabled: parsed?.enabled === true,
      notice: typeof parsed?.notice === 'string' ? parsed.notice : null,
    };
  } catch {
    return DEFAULT;
  }
}

export function getAppLockSettings(): AppLockSettings {
  current ??= read();
  return current;
}

export function updateAppLockSettings(patch: Partial<AppLockSettings>) {
  current = { ...getAppLockSettings(), ...patch };
  Storage.setItemSync(KEY, JSON.stringify(current));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useAppLockSettings = () => useSyncExternalStore(subscribe, getAppLockSettings);

export type BiometricAvailability = 'available' | 'no-hardware' | 'not-enrolled' | 'unsupported';

/** Capteur présent et au moins une empreinte / un visage enregistré sur le téléphone. */
export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'unsupported';
  if (!(await LocalAuthentication.hasHardwareAsync())) return 'no-hardware';
  if (!(await LocalAuthentication.isEnrolledAsync())) return 'not-enrolled';
  return 'available';
}

export const AVAILABILITY_MESSAGES: Record<Exclude<BiometricAvailability, 'available'>, string> = {
  'no-hardware': "Ce téléphone n'a pas de capteur Face ID / empreinte : verrouillage impossible.",
  'not-enrolled':
    "Aucune empreinte ni aucun visage n'est enregistré sur ce téléphone. Configure-les dans les réglages du téléphone, puis réessaie.",
  unsupported: 'Verrouillage non disponible sur cette plateforme.',
};

const ERROR_MESSAGES: Partial<Record<LocalAuthentication.LocalAuthenticationError, string>> = {
  user_cancel: 'Authentification annulée.',
  system_cancel: 'Authentification interrompue.',
  app_cancel: 'Authentification interrompue.',
  lockout: 'Trop de tentatives : capteur temporairement bloqué. Réessaie avec le code du téléphone.',
  authentication_failed: 'Authentification refusée.',
  timeout: 'Délai dépassé.',
  not_enrolled: "Aucune biométrie n'est enregistrée sur ce téléphone.",
  passcode_not_set: "Aucun code n'est défini sur ce téléphone.",
};

export type AuthOutcome = { ok: true } | { ok: false; message: string };

/** Face ID / empreinte, avec repli sur le code du téléphone. */
export async function authenticate(promptMessage = 'Déverrouiller Road'): Promise<AuthOutcome> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Annuler',
      fallbackLabel: 'Utiliser le code',
      // Repli sur le code du téléphone si la biométrie échoue ou est bloquée.
      disableDeviceFallback: false,
    });
    if (res.success) return { ok: true };
    return { ok: false, message: ERROR_MESSAGES[res.error] ?? `Échec de l'authentification (${res.error}).` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
