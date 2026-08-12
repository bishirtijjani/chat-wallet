import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Splash } from '@/components/Splash';

export default function AuthLayout() {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'authed') return <Redirect href="/(tabs)/wallet" />;
  if (status === 'otp-verified') return <Redirect href="/(auth)/create-pin" />;
  if (status === 'locked') return <Redirect href="/(auth)/unlock" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
