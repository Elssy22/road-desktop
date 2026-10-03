import { useUserId } from '../../../../auth/SessionProvider';
import { VeilleSettingsScreen } from '../../../../screens/agency/VeilleSettingsScreen';

export default function VeilleSettingsRoute() {
  return <VeilleSettingsScreen userId={useUserId()} />;
}
