import { useUserId } from '../../../../auth/SessionProvider';
import { VaultScreen } from '../../../../screens/agency/VaultScreen';

export default function VaultRoute() {
  return <VaultScreen userId={useUserId()} />;
}
