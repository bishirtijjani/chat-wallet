import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Splash } from '@/components/Splash';

/**
 * guest, otp-verified, and locked all have real screens inside this group
 * (phone/otp, create-pin, unlock respectively), so they render the Stack —
 * whichever screen the caller navigated to. Only 'authed' truly leaves the
 * group. Redirecting here on every render for otp-verified/locked (instead
 * of just guest) would fire even once already on that screen, since the
 * status doesn't change until the screen's own action completes — that
 * makes the Stack (and the screen inside it) never mount.
 */
export default function AuthLayout() {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'authed') return <Redirect href="/(tabs)/wallet" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
