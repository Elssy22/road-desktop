import { useLocalSearchParams } from 'expo-router';

import { useUserId } from '../../auth/SessionProvider';
import { ReminderFormScreen } from '../../screens/ReminderFormScreen';

/**
 * `/reminder-form` crée un rappel (`?taskId=…`, `?contactId=…`, `?date=YYYY-MM-DD`
 * pour le préremplir) ; `?id=…` modifie un rappel existant.
 */
export default function ReminderFormRoute() {
  const { id, taskId, contactId, date } = useLocalSearchParams<{
    id?: string;
    taskId?: string;
    contactId?: string;
    date?: string;
  }>();
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  return (
    <ReminderFormScreen
      key={id ?? 'new'}
      userId={useUserId()}
      id={id}
      taskId={taskId}
      contactId={contactId}
      date={day}
    />
  );
}
