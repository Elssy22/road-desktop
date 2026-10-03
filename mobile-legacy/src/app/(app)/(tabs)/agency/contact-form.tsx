import { useLocalSearchParams } from 'expo-router';

import { useUserId } from '../../../../auth/SessionProvider';
import { ContactFormScreen } from '../../../../screens/agency/ContactFormScreen';

/** `/agency/contact-form` crée un contact ; `?id=…` modifie un contact existant. */
export default function ContactFormRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <ContactFormScreen key={id ?? 'new'} userId={useUserId()} id={id} />;
}
