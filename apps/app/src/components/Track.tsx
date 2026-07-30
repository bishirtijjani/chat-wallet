import { View, type DimensionValue } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

/** An inset progress track with a solid primary fill (DESIGN.md §8). */
export function Track({ fraction }: { fraction: number }) {
  const theme = useTheme();
  const outer = {
    height: 10,
    borderRadius: theme.radius.pill,
    marginVertical: theme.space.md,
    padding: 2,
    backgroundColor: theme.colors.bg,
  } as Record<string, unknown>;
  outer.boxShadow = theme.elevation.inset;
  const width = `${Math.max(Math.min(fraction, 1) * 100, 3)}%` as DimensionValue;
  return (
    <View style={outer as object}>
      <View
        style={{
          height: '100%',
          width,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.primary,
        }}
      />
    </View>
  );
}

/** A status pill: semantic color on an inset chip. */
export function StatusPill({ status }: { status: string }) {
  const theme = useTheme();
  const color =
    status === 'active'
      ? theme.colors.success
      : status === 'forming'
        ? theme.colors.warning
        : status === 'cancelled'
          ? theme.colors.danger
          : theme.colors.textSecondary;
  const box = {
    borderRadius: theme.radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: theme.colors.bg,
  } as Record<string, unknown>;
  box.boxShadow = theme.elevation.inset;
  return (
    <View style={box as object}>
      <AppText variant="caption" style={{ color, fontWeight: '700', letterSpacing: 0.4 }}>
        {status.toUpperCase()}
      </AppText>
    </View>
  );
}
