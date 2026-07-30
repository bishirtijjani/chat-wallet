import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Input } from '@/components/Input';
import { PrimaryButton } from '@/components/Button';
import { useTheme } from '@/theme/ThemeProvider';

export default function PhoneScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { requestOtp } = useAuth();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await requestOtp(phone);
      router.push({ pathname: '/(auth)/otp', params: { phone } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ marginTop: theme.space.xxl, gap: theme.space.sm }}>
        <AppText variant="largeTitle" rounded>
          Welcome
        </AppText>
        <AppText variant="body" color="secondary">
          Save together, chat together. Enter your phone number to get started.
        </AppText>
      </View>

      <View style={{ marginTop: theme.space.xl, gap: theme.space.lg }}>
        <Input
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="080 1234 5678"
          keyboardType="phone-pad"
          autoFocus
        />
        {error ? (
          <AppText variant="footnote" color="danger">
            {error}
          </AppText>
        ) : null}
        <PrimaryButton label="Send code" onPress={submit} loading={loading} disabled={!phone.trim()} />
        <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
          We'll text you a 6-digit code. Standard rates may apply.
        </AppText>
      </View>
    </Screen>
  );
}
