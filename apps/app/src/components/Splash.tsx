import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

/** Full-screen loading state shown while the session is being restored. */
export function Splash() {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.bg,
        gap: theme.space.lg,
      }}
    >
      <AppText variant="largeTitle" rounded color="accent">
        Chat &amp; Wallet
      </AppText>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}
