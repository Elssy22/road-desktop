import { useLocalSearchParams } from 'expo-router';

import { useUserId } from '../../auth/SessionProvider';
import { AppointmentFormScreen } from '../../screens/AppointmentFormScreen';

/**
 * `/appointment-form` crée un rendez-vous (`?date=YYYY-MM-DD`, `?contactId=…`
 * pour le préremplir) ; `?id=…` modifie un rendez-vous existant.
 */
export default function AppointmentFormRoute() {
  const { id, contactId, date } = useLocalSearchParams<{ id?: string; contactId?: string; date?: string }>();
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  return <AppointmentFormScreen key={id ?? 'new'} userId={useUserId()} id={id} contactId={contactId} date={day} />;
}
