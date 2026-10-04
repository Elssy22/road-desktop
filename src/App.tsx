import { useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { parseRecoveryLink } from './auth/recoveryLink';
import { SessionProvider, useSession } from './auth/SessionProvider';
import { AppLayout } from './components/AppLayout';
import { AgencyScreen } from './screens/agency/AgencyScreen';
import { ContactDetailScreen } from './screens/agency/ContactDetailScreen';
import { ContactFormScreen } from './screens/agency/ContactFormScreen';
import { ContactImportScreen } from './screens/agency/ContactImportScreen';
import { ContactsScreen } from './screens/agency/ContactsScreen';
import { GoalFormScreen } from './screens/agency/GoalFormScreen';
import { GoalsScreen } from './screens/agency/GoalsScreen';
import { KeyDateFormScreen } from './screens/agency/KeyDateFormScreen';
import { KeyDatesScreen } from './screens/agency/KeyDatesScreen';
import { MeetingReportScreen } from './screens/agency/MeetingReportScreen';
import { MoneyFormScreen } from './screens/agency/MoneyFormScreen';
import { MoneyScreen } from './screens/agency/MoneyScreen';
import { PipelineScreen } from './screens/agency/PipelineScreen';
import { ProjectDetailScreen } from './screens/agency/ProjectDetailScreen';
import { ProjectsScreen } from './screens/agency/ProjectsScreen';
import { ProspectPurgeScreen } from './screens/agency/ProspectPurgeScreen';
import { VaultDocumentScreen } from './screens/agency/VaultDocumentScreen';
import { VaultScreen } from './screens/agency/VaultScreen';
import { VeilleScreen } from './screens/agency/VeilleScreen';
import { VeilleSettingsScreen } from './screens/agency/VeilleSettingsScreen';
import { AppointmentFormScreen } from './screens/AppointmentFormScreen';
import { AuthScreen } from './screens/AuthScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { NotesScreen } from './screens/NotesScreen';
import { ReminderFormScreen } from './screens/ReminderFormScreen';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { SearchScreen } from './screens/SearchScreen';
import { ChangePasswordScreen, SettingsScreen } from './screens/SettingsScreen';
import { TasksScreen } from './screens/TasksScreen';
import { TodayScreen } from './screens/TodayScreen';
import { WeeklyReviewScreen } from './screens/WeeklyReviewScreen';

function Root() {
  const { session, ready } = useSession();
  // Lien « mot de passe oublié » arrivé dans la webview : lu avant le routeur,
  // qui prendrait le fragment `#access_token=…` pour une route inconnue.
  const [recovery, setRecovery] = useState(() => parseRecoveryLink(window.location.href));
  const [authMode, setAuthMode] = useState<'signIn' | 'forgot'>('signIn');

  // Rien à afficher tant que la session persistée n'a pas été relue (quelques ms).
  if (!ready) return null;
  if (recovery.kind !== 'none') {
    return (
      <ResetPasswordScreen
        link={recovery}
        layout="auth"
        onFinish={(next) => {
          // Jetons retirés de l'URL : un rechargement ne rejoue pas le lien.
          window.history.replaceState(null, '', `${window.location.pathname}#/today`);
          setAuthMode(next ?? 'signIn');
          setRecovery({ kind: 'none' });
        }}
      />
    );
  }
  if (!session) return <AuthScreen key={authMode} initialMode={authMode} />;

  // Routes en hash (#/today) : la webview Tauri sert des fichiers statiques,
  // aucune réécriture d'URL côté serveur n'est nécessaire au rechargement.
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/today" element={<TodayScreen userId={session.user.id} />} />
          <Route path="/tasks" element={<TasksScreen />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/agency" element={<AgencyScreen userId={session.user.id} />} />
          <Route path="/agency/contacts" element={<ContactsScreen />} />
          <Route path="/agency/contacts/new" element={<ContactFormScreen />} />
          <Route path="/agency/contacts/import" element={<ContactImportScreen />} />
          <Route path="/agency/contacts/:id" element={<ContactDetailScreen />} />
          <Route path="/agency/contacts/:id/edit" element={<ContactFormScreen />} />
          <Route path="/agency/pipeline" element={<PipelineScreen />} />
          <Route path="/agency/projects" element={<ProjectsScreen />} />
          <Route path="/agency/projects/:id" element={<ProjectDetailScreen />} />
          <Route path="/agency/goals" element={<GoalsScreen userId={session.user.id} />} />
          <Route path="/agency/goals/new" element={<GoalFormScreen userId={session.user.id} />} />
          <Route path="/agency/goals/:id" element={<GoalFormScreen userId={session.user.id} />} />
          <Route path="/agency/key-dates" element={<KeyDatesScreen />} />
          <Route path="/agency/key-dates/new" element={<KeyDateFormScreen />} />
          <Route path="/agency/key-dates/:id" element={<KeyDateFormScreen />} />
          <Route path="/agency/money" element={<MoneyScreen userId={session.user.id} />} />
          <Route path="/agency/money/new" element={<MoneyFormScreen />} />
          <Route path="/agency/money/:id" element={<MoneyFormScreen />} />
          <Route path="/agency/vault" element={<VaultScreen userId={session.user.id} />} />
          <Route path="/agency/vault/:id" element={<VaultDocumentScreen userId={session.user.id} />} />
          <Route path="/agency/veille" element={<VeilleScreen userId={session.user.id} />} />
          <Route path="/agency/veille/settings" element={<VeilleSettingsScreen userId={session.user.id} />} />
          <Route path="/agency/meeting-report" element={<MeetingReportScreen userId={session.user.id} />} />
          <Route path="/agency/prospect-purge" element={<ProspectPurgeScreen />} />
          <Route path="/agency/*" element={<Navigate to="/agency" replace />} />
          <Route path="/appointments/new" element={<AppointmentFormScreen />} />
          <Route path="/appointments/:id" element={<AppointmentFormScreen />} />
          <Route path="/reminders/new" element={<ReminderFormScreen />} />
          <Route path="/reminders/:id" element={<ReminderFormScreen />} />
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/weekly-review" element={<WeeklyReviewScreen userId={session.user.id} />} />
          <Route path="/notes" element={<NotesScreen />} />
          <Route path="/notes/:id" element={<NotesScreen />} />
          <Route path="/notes/*" element={<Navigate to="/notes" replace />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/settings/password" element={<ChangePasswordScreen />} />
          <Route path="/settings/*" element={<Navigate to="/settings" replace />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Root />
    </SessionProvider>
  );
}
