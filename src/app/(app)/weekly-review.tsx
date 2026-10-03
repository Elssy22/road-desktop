import { useUserId } from '../../auth/SessionProvider';
import { WeeklyReviewScreen } from '../../screens/WeeklyReviewScreen';

export default function WeeklyReviewRoute() {
  return <WeeklyReviewScreen userId={useUserId()} />;
}
