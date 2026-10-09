import { useUserId } from '../../../../../auth/SessionProvider';
import { ContactsScreen } from '../../../../../screens/agency/ContactsScreen';

export default function ContactsRoute() {
  return <ContactsScreen userId={useUserId()} />;
}
