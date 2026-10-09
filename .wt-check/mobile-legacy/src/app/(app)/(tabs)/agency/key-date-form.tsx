import { useLocalSearchParams } from 'expo-router';

import { useUserId } from '../../../../auth/SessionProvider';
import { KeyDateFormScreen } from '../../../../screens/agency/KeyDateFormScreen';

/** `/agency/key-date-form` crée une date clé ; `?id=…` modifie une date existante. */
export default function KeyDateFormRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <KeyDateFormScreen key={id ?? 'new'} userId={useUserId()} id={id} />;
}
