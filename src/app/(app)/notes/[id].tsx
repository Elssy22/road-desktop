import { useLocalSearchParams } from 'expo-router';

import { useUserId } from '../../../auth/SessionProvider';
import { NoteDetailScreen } from '../../../screens/NoteDetailScreen';

export default function NoteDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  // `key` : repartir d'un éditeur vierge si on passe d'une note à une autre.
  return <NoteDetailScreen key={id} userId={userId} id={id} />;
}
