import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Circle, Reputation } from '@caw/shared';
import { api } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/components/Screen';
import { Surface } from '@/components/Surface';
import { AppText } from '@/components/AppText';
import { Money } from '@/components/Money';
import { PrimaryButton } from '@/components/Button';
import { StatusPill, Track } from '@/components/Track';

export default function CirclesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [rep, setRep] = useState<Reputation | null>(null);

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([api.circles(), api.reputation()]);
    setCircles(c.circles);
    setRep(r.reputation);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  return (
    <Screen>
      <AppText variant="title1" rounded style={{ paddingVertical: theme.space.sm }}>
        Your circles
      </AppText>

      {rep ? (
        <Surface level="inset" radius={theme.radius.lg} style={{ padding: theme.space.md, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: theme.space.lg }}>
          <AppText variant="title1" color="accent" rounded tabular>
            {rep.reliabilityPct === null ? '—' : `${rep.reliabilityPct}%`}
          </AppText>
          <AppText variant="footnote" color="secondary" style={{ flex: 1 }}>
            <AppText variant="footnote" style={{ fontWeight: '700' }}>On-time reliability.</AppText>{' '}
            {rep.paid} paid, {rep.missed} missed · {rep.circlesCompleted} cycle
            {rep.circlesCompleted === 1 ? '' : 's'} completed.
          </AppText>
        </Surface>
      ) : null}

      <View style={{ gap: theme.space.md }}>
        {circles.map((circle) => (
          <CircleCard key={circle.id} circle={circle} onPress={() => router.push(`/circle/${circle.id}`)} />
        ))}
      </View>

      <PrimaryButton
        label="＋  Start a new circle"
        onPress={() => router.push('/circle/new')}
        style={{ marginTop: theme.space.lg }}
      />
    </Screen>
  );
}

const FREQ: Record<string, string> = { daily: 'daily', weekly: 'weekly', monthly: 'monthly' };

function CircleCard({ circle, onPress }: { circle: Circle; onPress: () => void }) {
  const theme = useTheme();
  const progress = circle.memberCap > 0 ? Math.min(circle.currentRound / circle.memberCap, 1) : 0;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
      <Surface level="raised" radius={theme.radius.lg} style={{ padding: theme.space.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <AppText variant="title3" rounded>
              {circle.name}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Money kobo={circle.contributionAmount} variant="footnote" color="secondary" withKobo={false} />
              <AppText variant="footnote" color="secondary">
                {' '}
                {FREQ[circle.frequency]} · {circle.memberCap} members
              </AppText>
            </View>
          </View>
          <StatusPill status={circle.status} />
        </View>

        <Track fraction={progress} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="caption" color="secondary" tabular>
            {circle.status === 'forming'
              ? 'Awaiting start'
              : `Round ${circle.currentRound} of ${circle.memberCap}`}
          </AppText>
        </View>
      </Surface>
    </Pressable>
  );
}

