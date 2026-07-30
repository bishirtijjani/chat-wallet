import { View, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export type Elevation = 'flat' | 'raised' | 'floating' | 'inset';

/**
 * A neumorphic surface: one base color plus a dual light/dark shadow. `boxShadow`
 * is understood by RN 0.76+ (New Architecture) and React Native Web, so the same
 * value renders true soft UI on iOS, Android, and web (DESIGN.md §3).
 */
export function Surface({
  level = 'raised',
  radius,
  style,
  children,
  ...rest
}: ViewProps & { level?: Elevation; radius?: number }) {
  const theme = useTheme();
  const base: ViewStyle = {
    backgroundColor: theme.colors.bg,
    borderRadius: radius ?? theme.radius.lg,
  };
  if (level !== 'flat') {
    // boxShadow isn't in the RN ViewStyle types yet; it's valid at runtime.
    (base as Record<string, unknown>).boxShadow = theme.elevation[level];
  }
  return (
    <View style={[base, style]} {...rest}>
      {children}
    </View>
  );
}
