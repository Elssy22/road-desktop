import { useLocalSearchParams } from 'expo-router';

import { useUserId } from '../../../../auth/SessionProvider';
import { MoneyFormScreen } from '../../../../screens/agency/MoneyFormScreen';

/** `/agency/money-form` crée une ligne ; `?id=…` modifie une ligne existante. */
export default function MoneyFormRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <MoneyFormScreen key={id ?? 'new'} userId={useUserId()} id={id} />;
}
