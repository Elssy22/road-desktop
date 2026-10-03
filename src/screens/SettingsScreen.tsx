import { CalendarCheck, Database, Palette, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSession } from '../auth/SessionProvider';
import { CardList, CardNote, CategoryCard, ListRow, ScreenHeader, SegmentedControl, TextAction } from '../components/ui';
import { notifyDataChanged } from '../data/base';
import { supabase } from '../lib/supabase';
import { getAppearancePreference, setAppearancePreference, type AppearancePreference } from '../theme/cssVars';
import { ResetPasswordScreen } from './ResetPasswordScreen';

const APPEARANCES: readonly { value: AppearancePreference; label: string }[] = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

/** Connexion réseau de la webview (événements online / offline). */
function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * Réglages : portage web de mobile-legacy/src/screens/SettingsScreen.tsx.
 * Pas de catégorie métier ici : chaque carte reprend la teinte d'une catégorie
 * pour se repérer d'un coup d'œil (lavande, ciel, pêche, menthe, rose comme sur
 * le mobile). Adapté au desktop :
 * - « Synchronisation » devient « Données » : pas de cache local ni d'outbox
 *   (DECISIONS.md §35), seulement l'état de la connexion et une relecture ;
 * - notifications et verrouillage (Face ID) restent propres au mobile ;
 * - Apparence propose « Système » (suivre macOS), en plus de Clair / Sombre ;
 * - Compte ajoute « Changer le mot de passe ».
 */
export function SettingsScreen() {
  const navigate = useNavigate();
  const { session } = useSession();
  const online = useOnline();
  const [appearance, setAppearance] = useState(getAppearancePreference);
  const [busy, setBusy] = useState(false);

  const changeAppearance = (value: AppearancePreference) => {
    setAppearancePreference(value);
    setAppearance(value);
  };

  const signOut = async () => {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
  };

  return (
    <div className="screen">
      <ScreenHeader title="Réglages" />
      <div className="stack">
        <CategoryCard category="notes" icon={Palette} title="Apparence">
          <SegmentedControl options={APPEARANCES} value={appearance} onChange={changeAppearance} />
        </CategoryCard>

        <CategoryCard
          category="agenda"
          icon={Database}
          title="Données"
          action={<TextAction label="Recharger" category="agenda" onClick={notifyDataChanged} disabled={!online} />}
        >
          <CardList>
            <li className="row">
              <span className={online ? 'status-dot status-dot--ok' : 'status-dot'} aria-hidden />
              <div className="row__main">
                <span className="row__title row__title--strong">{online ? 'En ligne' : 'Hors ligne'}</span>
                <span className="row__subtitle">
                  {online
                    ? 'Connexion directe à Supabase : les données sont relues à chaque affichage et au retour sur la fenêtre.'
                    : 'Sans connexion, la version Mac ne peut ni lire ni enregistrer (pas de copie locale).'}
                </span>
              </div>
            </li>
          </CardList>
        </CategoryCard>

        <CategoryCard category="tasks" icon={CalendarCheck} title="Organisation">
          <CardList>
            <ListRow
              title="Revue de la semaine"
              subtitle="Bilan hebdomadaire guidé"
              onClick={() => navigate('/weekly-review')}
            />
          </CardList>
        </CategoryCard>

        <CategoryCard category="reminders" icon={ShieldCheck} title="Données personnelles">
          <CardList>
            <ListRow
              title="Purge RGPD des prospects"
              subtitle="Prospects inactifs depuis 3 ans, à supprimer avec confirmation"
              onClick={() => navigate('/agency/prospect-purge')}
            />
          </CardList>
        </CategoryCard>

        <CategoryCard category="contacts" icon={UserRound} title="Compte">
          <CardNote>{session?.user.email}</CardNote>
          <div className="form-actions form-actions--start">
            <button type="button" className="button button--secondary" onClick={() => navigate('/settings/password')}>
              Changer le mot de passe
            </button>
            <button type="button" className="button button--danger" disabled={busy} onClick={() => void signOut()}>
              Se déconnecter
            </button>
          </div>
        </CategoryCard>

        <CategoryCard category="keyDates" icon={Smartphone} title="Sur le mobile">
          <CardNote>
            Les notifications (rappels, debriefs de RDV, échéances) et le verrouillage par Face ID se règlent dans
            l’app mobile : la version Mac n’envoie pas de notification.
          </CardNote>
        </CategoryCard>
      </div>
    </div>
  );
}

/** `/settings/password` : changement du mot de passe, session ouverte. */
export function ChangePasswordScreen() {
  const navigate = useNavigate();
  return <ResetPasswordScreen link={{ kind: 'none' }} layout="app" onFinish={() => navigate('/settings')} />;
}
