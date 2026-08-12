import { useState } from 'react';
import { View } from 'react-native';
import { PIN } from '@caw/shared';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Input } from '@/components/Input';
import { PrimaryButton } from '@/components/Button';
import { useTheme } from '@/theme/ThemeProvider';

const validPin = (v: string) => v.length >= PIN.minLength && v.length <= PIN.maxLength;

export default function CreatePinScreen() {
  const theme = useTheme();
  const { createPin } = useAuth();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, PIN.maxLength);

  const submit = async () => {
    setError(null);
    if (!validPin(pin)) {
      setError(`PIN must be ${PIN.minLength}-${PIN.maxLength} digits`);
      return;
    }
    if (pin !== confirm) {
      setError('PINs do not match');
      return;
    }
    setLoading(true);
    try {
      await createPin(pin);
      // On success the auth state flips to 'authed' and the router redirects.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not set PIN. Try again.');
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ marginTop: theme.space.xxl, gap: theme.space.sm }}>
        <AppText variant="largeTitle" rounded>
          Set a PIN
        </AppText>
        <AppText variant="body" color="secondary">
          Use a {PIN.minLength}-{PIN.maxLength} digit PIN to open the app next time — no code
          needed.
        </AppText>
      </View>

      <View style={{ marginTop: theme.space.xl, gap: theme.space.lg }}>
        <Input
          label="Choose a PIN"
          value={pin}
          onChangeText={(v) => setPin(digitsOnly(v))}
          placeholder="••••"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN.maxLength}
          autoFocus
        />
        <Input
          label="Confirm PIN"
          value={confirm}
          onChangeText={(v) => setConfirm(digitsOnly(v))}
          placeholder="••••"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN.maxLength}
        />
        {error ? (
          <AppText variant="footnote" color="danger">
            {error}
          </AppText>
        ) : null}
        <PrimaryButton
          label="Save PIN"
          onPress={submit}
          loading={loading}
          disabled={!validPin(pin) || !validPin(confirm)}
        />
      </View>
    </Screen>
  );
}
