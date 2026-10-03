import { useUserId } from '../../auth/SessionProvider';
import { SearchScreen } from '../../screens/SearchScreen';

export default function SearchRoute() {
  return <SearchScreen userId={useUserId()} />;
}
