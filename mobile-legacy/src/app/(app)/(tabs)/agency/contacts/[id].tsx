import { useLocalSearchParams } from 'expo-router';

import { useUserId } from '../../../../../auth/SessionProvider';
import { ContactDetailScreen } from '../../../../../screens/agency/ContactDetailScreen';

export default function ContactDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ContactDetailScreen key={id} userId={useUserId()} id={id} />;
}
