import { useUserId } from '../../../../../auth/SessionProvider';
import { ProjectsScreen } from '../../../../../screens/agency/ProjectsScreen';

export default function ProjectsRoute() {
  return <ProjectsScreen userId={useUserId()} />;
}
