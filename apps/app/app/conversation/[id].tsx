import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/components/AppText';
import { ChatThread } from '@/components/ChatThread';

export default function ConversationScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: theme.space.md, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
        </Pressable>
        <AppText variant="title3" rounded>
          Conversation
        </AppText>
      </View>
      {user && id ? <ChatThread conversationId={id} meId={user.id} /> : null}
    </View>
  );
}
