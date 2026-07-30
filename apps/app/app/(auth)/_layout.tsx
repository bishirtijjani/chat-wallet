import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Splash } from '@/components/Splash';

export default function AuthLayout() {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'authed') return <Redirect href="/(tabs)/wallet" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
