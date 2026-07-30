import type { ReactNode } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

/** A screen container: theme background, safe-area top padding, optional scroll. */
export function Screen({
  children,
  scroll = true,
  padded = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  contentStyle?: ViewStyle;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bg: ViewStyle = { flex: 1, backgroundColor: theme.colors.bg };
  const pad: ViewStyle = {
    paddingTop: insets.top + theme.space.sm,
    paddingHorizontal: padded ? theme.space.lg : 0,
    paddingBottom: theme.space.xl,
  };

  if (scroll) {
    return (
      <View style={bg}>
        <ScrollView
          contentContainerStyle={[pad, contentStyle]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    );
  }
  return <View style={[bg, pad, contentStyle]}>{children}</View>;
}
