import { useLocalSearchParams } from 'expo-router';

import { useUserId } from '../../../../../auth/SessionProvider';
import { ProjectDetailScreen } from '../../../../../screens/agency/ProjectDetailScreen';

export default function ProjectDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProjectDetailScreen key={id} userId={useUserId()} id={id} />;
}
