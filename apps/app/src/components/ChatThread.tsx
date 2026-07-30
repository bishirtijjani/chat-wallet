import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message } from '@caw/shared';
import { useTheme } from '@/theme/ThemeProvider';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppText } from './AppText';
import { Surface } from './Surface';

/**
 * Reusable conversation view: loads history, streams new messages over the
 * socket, and sends. Used by both the circle screen and direct conversations.
 */
export function ChatThread({
  conversationId,
  meId,
  header,
  nameFor,
}: {
  conversationId: string;
  meId: string;
  header?: ReactElement;
  nameFor?: (userId: string) => string | undefined;
}) {
  const theme = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    const res = await api.messages(conversationId);
    // API returns newest-first; render oldest → newest.
    setMessages(res.messages.slice().reverse());
  }, [conversationId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNew = (m: Message) => {
      if (m.conversationId !== conversationId) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    };
    socket.on('message:new', onNew);
    return () => {
      socket.off('message:new', onNew);
    };
  }, [conversationId]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      const { message } = await api.sendMessage(conversationId, body);
      setMessages((prev) => (prev.some((x) => x.id === message.id) ? prev : [...prev, message]));
    } catch {
      setText(body); // restore on failure
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={header}
        renderItem={({ item }) =>
          item.type === 'system' ? (
            <SystemLine message={item} />
          ) : (
            <Bubble message={item} mine={item.senderId === meId} name={nameFor?.(item.senderId ?? '')} />
          )
        }
        contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.sm }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />
      <Composer value={text} onChange={setText} onSend={send} />
    </KeyboardAvoidingView>
  );
}

function SystemLine({ message }: { message: Message }) {
  const theme = useTheme();
  const kind = (message.metadata?.kind as string) ?? '';
  const dot =
    kind === 'payout'
      ? theme.colors.primary
      : kind === 'missed'
        ? theme.colors.danger
        : kind === 'reminder'
          ? theme.colors.warning
          : theme.colors.success;
  const emphatic = kind === 'payout' || kind === 'circle_completed';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingHorizontal: theme.space.lg,
        paddingVertical: 2,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
      <AppText
        variant="footnote"
        color={emphatic ? 'primary' : 'secondary'}
        style={{ textAlign: 'center', flexShrink: 1, fontWeight: emphatic ? '600' : '400' }}
      >
        {message.body}
      </AppText>
    </View>
  );
}

function Bubble({ message, mine, name }: { message: Message; mine: boolean; name?: string }) {
  const theme = useTheme();
  const bubble: ViewStyle = {
    maxWidth: '80%',
    alignSelf: mine ? 'flex-end' : 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radius.lg,
    marginVertical: 3,
  };
  if (mine) {
    bubble.backgroundColor = theme.colors.primary;
    bubble.borderBottomRightRadius = 8;
    (bubble as Record<string, unknown>).boxShadow = `0 8px 18px ${theme.colors.primary}44`;
    return (
      <View style={bubble}>
        <AppText variant="callout" color="onPrimary">
          {message.body}
        </AppText>
      </View>
    );
  }
  bubble.backgroundColor = theme.colors.bg;
  bubble.borderBottomLeftRadius = 8;
  (bubble as Record<string, unknown>).boxShadow = theme.elevation.raised;
  return (
    <View style={bubble}>
      {name ? (
        <AppText variant="caption" color="accent" style={{ fontWeight: '700', marginBottom: 2 }}>
          {name}
        </AppText>
      ) : null}
      <AppText variant="callout">{message.body}</AppText>
    </View>
  );
}

function Composer({
  value,
  onChange,
  onSend,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  const theme = useTheme();
  const field: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === 'web' ? 12 : 10,
  };
  (field as Record<string, unknown>).boxShadow = theme.elevation.inset;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: theme.space.md,
        paddingVertical: theme.space.md,
        backgroundColor: theme.colors.bg,
      }}
    >
      <View style={field}>
        <TextInput
          value={value}
          onChangeText={onChange}
          onSubmitEditing={onSend}
          placeholder="Message the circle…"
          placeholderTextColor={theme.colors.textTertiary}
          style={{ color: theme.colors.textPrimary, fontSize: 15, padding: 0 }}
          returnKeyType="send"
        />
      </View>
      <Pressable
        onPress={onSend}
        style={({ pressed }) => {
          const s: ViewStyle = {
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: pressed ? theme.colors.primaryPressed : theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
          };
          (s as Record<string, unknown>).boxShadow = `0 8px 18px ${theme.colors.primary}55`;
          return s;
        }}
      >
        <Ionicons name="send" size={19} color={theme.colors.onPrimary} />
      </Pressable>
    </View>
  );
}
