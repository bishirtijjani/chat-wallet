import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Input } from '@/components/Input';
import { PrimaryButton } from '@/components/Button';
import { useTheme } from '@/theme/ThemeProvider';

export default function OtpScreen() {
  const theme = useTheme();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { verifyOtp, requestOtp } = useAuth();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await verifyOtp(phone ?? '', code.trim(), name.trim() || undefined);
      // On success the auth state flips to 'authed' and the router redirects.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not verify. Try again.');
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      await requestOtp(phone ?? '');
      setResent(true);
    } catch {
      /* ignore */
    }
  };

  return (
    <Screen>
      <View style={{ marginTop: theme.space.xxl, gap: theme.space.sm }}>
        <AppText variant="largeTitle" rounded>
          Enter code
        </AppText>
        <AppText variant="body" color="secondary">
          We sent a 6-digit code to {phone}. In development it's printed in the API logs.
        </AppText>
      </View>

      <View style={{ marginTop: theme.space.xl, gap: theme.space.lg }}>
        <Input
          label="6-digit code"
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />
        <Input
          label="Your name (first time only)"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Amina"
        />
        {error ? (
          <AppText variant="footnote" color="danger">
            {error}
          </AppText>
        ) : null}
        <PrimaryButton label="Verify & continue" onPress={submit} loading={loading} disabled={code.trim().length < 6} />
        <Pressable onPress={resend} style={{ alignSelf: 'center' }}>
          <AppText variant="subhead" color="accent">
            {resent ? 'Code re-sent' : 'Resend code'}
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}
