import { useUserId } from '../../../../auth/SessionProvider';
import { CalendarScreen } from '../../../../screens/CalendarScreen';

export default function CalendarRoute() {
  return <CalendarScreen userId={useUserId()} />;
}
