import { useUserId } from '../../auth/SessionProvider';
import { ProspectPurgeScreen } from '../../screens/ProspectPurgeScreen';

export default function ProspectPurgeRoute() {
  return <ProspectPurgeScreen userId={useUserId()} />;
}
