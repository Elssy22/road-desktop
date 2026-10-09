import { useLocalSearchParams } from 'expo-router';

import { useUserId } from '../../../../auth/SessionProvider';
import { MeetingReportScreen } from '../../../../screens/agency/MeetingReportScreen';

/** `/agency/meeting-report` ; `?contactId=…` pré-remplit le contact (depuis sa fiche). */
export default function MeetingReportRoute() {
  const { contactId } = useLocalSearchParams<{ contactId?: string }>();
  return <MeetingReportScreen userId={useUserId()} contactId={contactId} />;
}
