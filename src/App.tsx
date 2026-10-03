import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { SessionProvider, useSession } from './auth/SessionProvider';
import { AppLayout } from './components/AppLayout';
import { AgencyScreen } from './screens/agency/AgencyScreen';
import { ContactDetailScreen } from './screens/agency/ContactDetailScreen';
import { ContactFormScreen } from './screens/agency/ContactFormScreen';
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
import { AuthScreen } from './screens/AuthScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { ComingSoonScreen } from './screens/ComingSoonScreen';
import { TasksScreen } from './screens/TasksScreen';
import { TodayScreen } from './screens/TodayScreen';

function Root() {
  const { session, ready } = useSession();
  // Rien à afficher tant que la session persistée n'a pas été relue (quelques ms).
  if (!ready) return null;
  if (!session) return <AuthScreen />;

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
          <Route path="/notes/*" element={<ComingSoonScreen title="Notes" />} />
          <Route path="/settings/*" element={<ComingSoonScreen title="Réglages" />} />
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
