import { Redirect } from 'expo-router';
import { routeForStatus, useAuth } from '@/lib/auth';
import { Splash } from '@/components/Splash';

/** Entry: route to the app or to sign-in once the session state is known. */
export default function Index() {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  return <Redirect href={routeForStatus(status)} />;
}
