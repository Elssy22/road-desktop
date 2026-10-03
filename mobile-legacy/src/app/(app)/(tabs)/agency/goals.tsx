import { useUserId } from '../../../../auth/SessionProvider';
import { GoalsScreen } from '../../../../screens/agency/GoalsScreen';

export default function GoalsRoute() {
  return <GoalsScreen userId={useUserId()} />;
}
