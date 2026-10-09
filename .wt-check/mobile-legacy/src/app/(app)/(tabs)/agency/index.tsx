import { useUserId } from '../../../../auth/SessionProvider';
import { AgencyScreen } from '../../../../screens/agency/AgencyScreen';

export default function AgencyRoute() {
  return <AgencyScreen userId={useUserId()} />;
}
