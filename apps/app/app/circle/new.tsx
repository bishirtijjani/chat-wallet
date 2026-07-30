import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Frequency } from '@caw/shared';
import { api, ApiError } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/components/AppText';
import { Input } from '@/components/Input';
import { PrimaryButton } from '@/components/Button';
import { Surface } from '@/components/Surface';

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly'];

export default function NewCircleScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(''); // in naira
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [cap, setCap] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const naira = Number(amount);
    const memberCap = Number(cap);
    if (!name.trim() || !Number.isFinite(naira) || !Number.isInteger(memberCap)) {
      setError('Fill in every field with valid values.');
      return;
    }
    setLoading(true);
    try {
      const { circle } = await api.createCircle({
        name: name.trim(),
        contributionAmount: Math.round(naira * 100),
        frequency,
        memberCap,
      });
      router.replace(`/circle/${circle.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the circle.');
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top + 6, paddingHorizontal: theme.space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: theme.space.md }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 6, marginLeft: -6 }}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
        </Pressable>
        <AppText variant="title2" rounded>
          New circle
        </AppText>
      </View>

      <View style={{ gap: theme.space.lg }}>
        <Input label="Circle name" value={name} onChangeText={setName} placeholder="e.g. Kano Traders Adashe" />
        <Input
          label="Contribution per round (₦)"
          value={amount}
          onChangeText={setAmount}
          placeholder="5000"
          keyboardType="numeric"
        />

        <View style={{ gap: theme.space.sm }}>
          <AppText variant="subhead" color="secondary">
            Frequency
          </AppText>
          <Surface level="inset" radius={theme.radius.md} style={{ flexDirection: 'row', padding: 4 }}>
            {FREQUENCIES.map((f) => {
              const active = f === frequency;
              const segStyle = {
                paddingVertical: 10,
                alignItems: 'center',
                borderRadius: theme.radius.sm,
                backgroundColor: active ? theme.colors.bg : 'transparent',
              } as Record<string, unknown>;
              if (active) segStyle.boxShadow = theme.elevation.raised;
              return (
                <Pressable key={f} onPress={() => setFrequency(f)} style={{ flex: 1 }}>
                  <View style={segStyle as object}>
                    <AppText variant="subhead" color={active ? 'accent' : 'tertiary'} style={{ fontWeight: active ? '700' : '400', textTransform: 'capitalize' }}>
                      {f}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </Surface>
        </View>

        <Input
          label="Number of members (rounds in a cycle)"
          value={cap}
          onChangeText={setCap}
          placeholder="10"
          keyboardType="number-pad"
        />

        {error ? (
          <AppText variant="footnote" color="danger">
            {error}
          </AppText>
        ) : null}

        <PrimaryButton label="Create circle" onPress={submit} loading={loading} />
        <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
          You'll be the coordinator. Add members and set the payout order next.
        </AppText>
      </View>
    </View>
  );
}
