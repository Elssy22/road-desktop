import { useUserId } from '../../../auth/SessionProvider';
import { NotesScreen } from '../../../screens/NotesScreen';

export default function NotesRoute() {
  return <NotesScreen userId={useUserId()} />;
}
