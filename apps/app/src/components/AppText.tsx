import { Platform, Text, type TextProps, type TextStyle } from 'react-native';
import type { TypeToken } from '@caw/shared';
import { useTheme } from '@/theme/ThemeProvider';

type ColorToken =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'onPrimary'
  | 'success'
  | 'warning'
  | 'danger';

// Rounded companion face for headings & numbers (DESIGN.md §5). Only meaningful
// on web here; native uses the system face until SF Pro Rounded is bundled.
const ROUNDED_FAMILY = Platform.select({
  web: 'ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif',
  default: undefined,
}) as string | undefined;

export function AppText({
  variant = 'body',
  color = 'primary',
  rounded = false,
  tabular = false,
  style,
  ...rest
}: TextProps & {
  variant?: TypeToken;
  color?: ColorToken;
  rounded?: boolean;
  tabular?: boolean;
}) {
  const theme = useTheme();
  const t = theme.type[variant];
  const colorMap: Record<ColorToken, string> = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    tertiary: theme.colors.textTertiary,
    accent: theme.colors.primary,
    onPrimary: theme.colors.onPrimary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
  };

  const resolved: TextStyle = {
    fontSize: t.size,
    lineHeight: t.line,
    fontWeight: t.weight as TextStyle['fontWeight'],
    letterSpacing: t.tracking,
    color: colorMap[color],
  };
  if (rounded && ROUNDED_FAMILY) resolved.fontFamily = ROUNDED_FAMILY;
  if (tabular) resolved.fontVariant = ['tabular-nums'];

  return <Text style={[resolved, style]} {...rest} />;
}
