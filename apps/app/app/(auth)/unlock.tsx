import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { PIN } from '@caw/shared';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Input } from '@/components/Input';
import { PrimaryButton } from '@/components/Button';
import { useTheme } from '@/theme/ThemeProvider';

export default function UnlockScreen() {
  const theme = useTheme();
  const { unlockWithPin, useDifferentAccount } = useAuth();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await unlockWithPin(pin);
      // On success the auth state flips to 'authed' and the router redirects.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not unlock. Try again.');
      setPin('');
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ marginTop: theme.space.xxl, gap: theme.space.sm }}>
        <AppText variant="largeTitle" rounded>
          Enter your PIN
        </AppText>
        <AppText variant="body" color="secondary">
          Welcome back. Enter your PIN to continue.
        </AppText>
      </View>

      <View style={{ marginTop: theme.space.xl, gap: theme.space.lg }}>
        <Input
          label="PIN"
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, PIN.maxLength))}
          placeholder="••••"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN.maxLength}
          autoFocus
        />
        {error ? (
          <AppText variant="footnote" color="danger">
            {error}
          </AppText>
        ) : null}
        <PrimaryButton
          label="Unlock"
          onPress={submit}
          loading={loading}
          disabled={pin.length < PIN.minLength}
        />
        <Pressable onPress={() => useDifferentAccount()} style={{ alignSelf: 'center' }}>
          <AppText variant="subhead" color="accent">
            Not you? Sign in with your phone number
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}
