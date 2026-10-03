import { useLocalSearchParams } from 'expo-router';

import { useUserId } from '../../../../auth/SessionProvider';
import { VaultDocumentScreen } from '../../../../screens/agency/VaultDocumentScreen';

/** `/agency/vault-document?id=…` : fiche d'un document du coffre. */
export default function VaultDocumentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VaultDocumentScreen key={id} userId={useUserId()} id={id} />;
}
