import { useUserId } from '../../../../auth/SessionProvider';
import { VeilleScreen } from '../../../../screens/agency/VeilleScreen';

export default function VeilleRoute() {
  return <VeilleScreen userId={useUserId()} />;
}
