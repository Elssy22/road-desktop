import { useLocalSearchParams } from 'expo-router';

import { useUserId } from '../../../../auth/SessionProvider';
import { GoalFormScreen } from '../../../../screens/agency/GoalFormScreen';

/** `/agency/goal-form` crée un objectif ; `?id=…` modifie un objectif existant. */
export default function GoalFormRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <GoalFormScreen key={id ?? 'new'} userId={useUserId()} id={id} />;
}
