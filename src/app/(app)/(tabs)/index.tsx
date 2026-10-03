import { useUserId } from '../../../auth/SessionProvider';
import { TodayScreen } from '../../../screens/TodayScreen';

export default function TodayRoute() {
  return <TodayScreen userId={useUserId()} />;
}
