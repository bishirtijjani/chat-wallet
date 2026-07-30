import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from '@/lib/api';
import type { ConversationSummaryView } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/components/Screen';
import { Surface } from '@/components/Surface';
import { AppText } from '@/components/AppText';
import { shortTime } from '@/lib/format';

export default function ChatScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<ConversationSummaryView[]>([]);

  const load = useCallback(async () => {
    const { conversations } = await api.conversations();
    setItems(conversations);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const open = (c: ConversationSummaryView) => {
    // A circle's group chat opens the circle; other conversations open directly.
    if (c.circleId) router.push(`/circle/${c.circleId}`);
    else router.push(`/conversation/${c.id}`);
  };

  return (
    <Screen>
      <AppText variant="title1" rounded style={{ paddingVertical: theme.space.sm }}>
        Chat
      </AppText>

      {items.length === 0 ? (
        <AppText variant="subhead" color="tertiary" style={{ paddingVertical: theme.space.lg }}>
          No conversations yet. Start a circle to chat with your group.
        </AppText>
      ) : (
        <View style={{ gap: theme.space.md }}>
          {items.map((c) => (
            <Pressable key={c.id} onPress={() => open(c)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.99 : 1 }] })}>
              <Surface level="raised" radius={theme.radius.lg} style={{ padding: theme.space.md, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Surface level="inset" radius={theme.radius.pill} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
                  <AppText variant="headline" color="accent" rounded>
                    {(c.title ?? 'DM').slice(0, 1).toUpperCase()}
                  </AppText>
                </Surface>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <AppText variant="headline" style={{ flex: 1 }} numberOfLines={1}>
                      {c.title ?? 'Direct message'}
                    </AppText>
                    {c.lastMessage ? (
                      <AppText variant="caption" color="tertiary">
                        {shortTime(c.lastMessage.createdAt)}
                      </AppText>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <AppText variant="footnote" color="secondary" style={{ flex: 1 }} numberOfLines={1}>
                      {c.lastMessage?.body ?? 'No messages yet'}
                    </AppText>
                    {c.unreadCount > 0 ? <UnreadBadge count={c.unreadCount} /> : null}
                  </View>
                </View>
              </Surface>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

function UnreadBadge({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        borderRadius: 10,
        backgroundColor: theme.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
      }}
    >
      <AppText variant="caption" color="onPrimary" style={{ fontWeight: '700' }} tabular>
        {count}
      </AppText>
    </View>
  );
}
