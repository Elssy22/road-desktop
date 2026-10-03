import { useUserId } from '../../../auth/SessionProvider';
import { TasksScreen } from '../../../screens/TasksScreen';

export default function TasksRoute() {
  return <TasksScreen userId={useUserId()} />;
}
