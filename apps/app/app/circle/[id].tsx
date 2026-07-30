import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import type { CircleDetail, DashboardView } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/components/AppText';
import { Surface } from '@/components/Surface';
import { Money } from '@/components/Money';
import { Input } from '@/components/Input';
import { PrimaryButton, NeoButton } from '@/components/Button';
import { ChatThread } from '@/components/ChatThread';
import { Track } from '@/components/Track';

export default function CircleScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const circleId = id ?? '';

  const [detail, setDetail] = useState<CircleDetail | null>(null);
  const [dashboard, setDashboard] = useState<DashboardView | null>(null);

  const load = useCallback(async () => {
    const [c, d] = await Promise.all([api.circle(circleId), api.dashboard(circleId)]);
    setDetail(c.circle);
    setDashboard(d.dashboard);
  }, [circleId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const nameFor = useMemo(() => {
    const map = new Map((detail?.members ?? []).map((m) => [m.userId, m.displayName ?? m.phone]));
    return (uid: string) => map.get(uid);
  }, [detail]);

  const isCoordinator = !!user && detail?.coordinatorId === user.id;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: theme.space.md, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
        </Pressable>
        <AppText variant="title3" rounded numberOfLines={1} style={{ flex: 1 }}>
          {detail?.name ?? 'Circle'}
        </AppText>
      </View>

      {detail && user ? (
        <ChatThread
          conversationId={detail.conversationId}
          meId={user.id}
          nameFor={nameFor}
          header={
            <CircleHeader
              detail={detail}
              dashboard={dashboard}
              isCoordinator={isCoordinator}
              onChanged={load}
            />
          }
        />
      ) : null}
    </View>
  );
}

function CircleHeader({
  detail,
  dashboard,
  isCoordinator,
  onChanged,
}: {
  detail: CircleDetail;
  dashboard: DashboardView | null;
  isCoordinator: boolean;
  onChanged: () => Promise<void>;
}) {
  const theme = useTheme();
  const round = dashboard?.currentRound ?? null;
  const potFraction = round && round.potTarget > 0 ? round.potCollected / round.potTarget : 0;

  return (
    <View style={{ gap: theme.space.md, marginBottom: theme.space.sm }}>
      {/* Pot card */}
      <Surface level="floating" radius={theme.radius.xl} style={{ padding: theme.space.lg }}>
        {round ? (
          <>
            <AppText variant="caption" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              Round {round.roundNumber} of {detail.memberCap} · this {detail.frequency.replace('ly', '')}'s pot
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <Money kobo={round.potCollected} variant="title1" rounded />
              <AppText variant="title3" color="tertiary">
                / <Money kobo={round.potTarget} variant="title3" color="tertiary" withKobo={false} />
              </AppText>
            </View>
            <Track fraction={potFraction} />
            <AppText variant="footnote" color="secondary">
              Pays out to <AppText variant="footnote" style={{ fontWeight: '700' }}>{round.recipientName ?? '—'}</AppText>
            </AppText>
          </>
        ) : (
          <>
            <AppText variant="caption" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              {detail.status === 'completed' ? 'Cycle complete' : 'Forming'}
            </AppText>
            <AppText variant="title2" rounded style={{ marginTop: 4 }}>
              {detail.status === 'completed'
                ? 'All rounds paid 🎉'
                : `${detail.members.length} of ${detail.memberCap} joined`}
            </AppText>
            <AppText variant="footnote" color="secondary" style={{ marginTop: 6 }}>
              <Money kobo={detail.contributionAmount} variant="footnote" color="secondary" withKobo={false} />{' '}
              per member, {detail.frequency}
            </AppText>
          </>
        )}
      </Surface>

      {/* Payout order */}
      {dashboard && dashboard.members.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {dashboard.members
            .slice()
            .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
            .map((m) => (
              <MemberAvatar
                key={m.membershipId}
                name={m.name}
                position={m.position}
                state={
                  m.isRecipientThisRound
                    ? 'now'
                    : round && m.position !== null && m.position < round.roundNumber
                      ? 'done'
                      : 'pending'
                }
              />
            ))}
        </View>
      ) : null}

      {isCoordinator ? (
        <CoordinatorPanel detail={detail} onChanged={onChanged} />
      ) : null}
    </View>
  );
}

function MemberAvatar({
  name,
  position,
  state,
}: {
  name: string;
  position: number | null;
  state: 'done' | 'now' | 'pending';
}) {
  const theme = useTheme();
  const base = {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: state === 'done' ? theme.colors.primary : theme.colors.bg,
  } as Record<string, unknown>;
  base.boxShadow = state === 'now' ? theme.elevation.inset : state === 'done' ? `0 8px 16px ${theme.colors.primary}55` : theme.elevation.raised;
  return (
    <View style={{ alignItems: 'center', gap: 5, width: 54 }}>
      <View style={base as object}>
        <AppText variant="headline" rounded color={state === 'done' ? 'onPrimary' : state === 'now' ? 'accent' : 'secondary'}>
          {name.slice(0, 1).toUpperCase()}
        </AppText>
      </View>
      <AppText variant="caption" color="secondary" numberOfLines={1}>
        {position ? `${position}. ` : ''}
        {name.split(' ')[0]}
      </AppText>
    </View>
  );
}

function CoordinatorPanel({ detail, onChanged }: { detail: CircleDetail; onChanged: () => Promise<void> }) {
  const theme = useTheme();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      Alert.alert('Could not complete', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (detail.status === 'forming') {
    const full = detail.members.length >= detail.memberCap;
    return (
      <Surface level="raised" radius={theme.radius.lg} style={{ padding: theme.space.md, gap: theme.space.md }}>
        <AppText variant="subhead" color="secondary">
          You're the coordinator — {detail.members.length}/{detail.memberCap} members.
        </AppText>
        <Input label="Add member by phone" value={phone} onChangeText={setPhone} placeholder="080…" keyboardType="phone-pad" />
        <NeoButton
          label="Add member"
          onPress={() =>
            run(async () => {
              await api.addMember(detail.id, phone.trim());
              setPhone('');
            })
          }
        />
        <PrimaryButton
          label={full ? 'Start circle' : `Add ${detail.memberCap - detail.members.length} more to start`}
          disabled={!full || busy}
          onPress={() =>
            run(async () => {
              await api.setPayoutOrder(detail.id, detail.members.map((m) => m.id));
              await api.startCircle(detail.id);
            })
          }
        />
      </Surface>
    );
  }

  if (detail.status === 'active') {
    return (
      <PrimaryButton
        label="Run this round (collect &amp; pay out)"
        loading={busy}
        onPress={() =>
          run(async () => {
            await api.collect(detail.id);
            const res = await api.settle(detail.id);
            Alert.alert('Round settled', `₦ paid to ${res.paidTo}.${res.completed ? ' The cycle is complete! 🎉' : ''}`);
          })
        }
      />
    );
  }

  return null;
}
