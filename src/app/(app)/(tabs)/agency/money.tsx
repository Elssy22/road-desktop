import { useUserId } from '../../../../auth/SessionProvider';
import { MoneyScreen } from '../../../../screens/agency/MoneyScreen';

export default function MoneyRoute() {
  return <MoneyScreen userId={useUserId()} />;
}
