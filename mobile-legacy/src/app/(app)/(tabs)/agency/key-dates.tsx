import { useUserId } from '../../../../auth/SessionProvider';
import { KeyDatesScreen } from '../../../../screens/agency/KeyDatesScreen';

export default function KeyDatesRoute() {
  return <KeyDatesScreen userId={useUserId()} />;
}
