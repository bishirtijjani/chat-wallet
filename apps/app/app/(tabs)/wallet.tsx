import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Wallet } from '@caw/shared';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import type { HistoryItem } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/components/Screen';
import { Surface } from '@/components/Surface';
import { AppText } from '@/components/AppText';
import { Money } from '@/components/Money';
import { PrimaryButton, NeoButton } from '@/components/Button';
import { shortTime } from '@/lib/format';

const KIND_LABEL: Record<string, string> = {
  wallet_funding: 'Added money',
  wallet_transfer: 'Transfer',
  wallet_cashout: 'Cash out',
  cashout_fee: 'Cash-out fee',
  contribution: 'Contribution',
  payout: 'Payout received',
  cycle_fee: 'Cycle fee',
};

export default function WalletScreen() {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [funding, setFunding] = useState(false);

  const load = useCallback(async () => {
    const [w, h] = await Promise.all([api.wallet(), api.walletHistory()]);
    setWallet(w.wallet);
    setHistory(h.history);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const addMoney = async () => {
    setFunding(true);
    try {
      await api.fund(2_000_000); // demo top-up (₦20,000) via the PSP sandbox
      await load();
    } finally {
      setFunding(false);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.space.sm }}>
        <AppText variant="title1" rounded>
          Wallet
        </AppText>
        <Pressable onPress={logout} hitSlop={10}>
          <Ionicons name="log-out-outline" size={22} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      <Surface level="floating" radius={theme.radius.xl} style={{ padding: theme.space.lg, marginTop: theme.space.sm }}>
        <AppText variant="caption" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
          Total balance {user?.displayName ? `· ${user.displayName}` : ''}
        </AppText>
        <View style={{ marginTop: 6 }}>
          <Money kobo={wallet?.balance ?? 0} variant="largeTitle" rounded />
        </View>
        <View style={{ flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.md }}>
          <Chip label="NGN" />
          {wallet ? <Chip label="Sandbox demo balance" /> : null}
        </View>
      </Surface>

      <View style={{ flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.lg }}>
        <PrimaryButton label="Add money" onPress={addMoney} loading={funding} style={{ flex: 1 }} />
        <NeoButton label="Send" style={{ flex: 1 }} />
        <NeoButton label="Cash out" style={{ flex: 1 }} />
      </View>

      <AppText variant="headline" style={{ marginTop: theme.space.xl, marginBottom: theme.space.sm }}>
        Recent
      </AppText>

      {history.length === 0 ? (
        <AppText variant="subhead" color="tertiary" style={{ paddingVertical: theme.space.lg }}>
          No activity yet. Tap “Add money” to fund your wallet.
        </AppText>
      ) : (
        history.map((item, i) => (
          <View key={item.transactionId + i}>
            <TxRow item={item} />
            {i < history.length - 1 ? (
              <View style={{ height: 1, backgroundColor: theme.colors.shadowDark, opacity: 0.4 }} />
            ) : null}
          </View>
        ))
      )}
    </Screen>
  );
}

function Chip({ label }: { label: string }) {
  const theme = useTheme();
  const box = {
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.bg,
  } as Record<string, unknown>;
  box.boxShadow = theme.elevation.inset;
  return (
    <View style={box}>
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
    </View>
  );
}

function TxRow({ item }: { item: HistoryItem }) {
  const theme = useTheme();
  const credit = item.direction === 'credit';
  const signed = credit ? item.amount : -item.amount;
  const iconName = credit ? 'arrow-up' : 'arrow-down';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 }}>
      <Surface level="raised" radius={theme.radius.md} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={iconName} size={19} color={credit ? theme.colors.success : theme.colors.textSecondary} />
      </Surface>
      <View style={{ flex: 1 }}>
        <AppText variant="callout" style={{ fontWeight: '600' }}>
          {KIND_LABEL[item.kind] ?? item.kind}
        </AppText>
        <AppText variant="footnote" color="secondary">
          {shortTime(item.createdAt)}
        </AppText>
      </View>
      <Money kobo={signed} variant="callout" color={credit ? 'success' : 'primary'} signed />
    </View>
  );
}
