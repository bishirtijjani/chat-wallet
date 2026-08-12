import { useRef } from 'react';
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * Primary CTA: a solid `primary` fill with a soft diffuse drop shadow — Apple
 * clarity for the one thing we most want tapped (DESIGN.md §8). Presses in on tap.
 *
 * Guards against firing `onPress` twice for one tap: react-native-web's
 * Pressable can dispatch more than one press event for a single interaction,
 * and since that happens before the caller's `loading` state has re-rendered,
 * the `disabled` prop alone doesn't catch it — a synchronous ref does.
 */
export function PrimaryButton({ label, onPress, loading, disabled, style }: ButtonProps) {
  const theme = useTheme();
  const isOff = disabled || loading;
  const firing = useRef(false);
  const handlePress = () => {
    if (firing.current || isOff) return;
    firing.current = true;
    // onPress is typed () => void, but every real caller here is async; if it
    // returns a promise, hold the guard until it settles so a same-tick
    // duplicate dispatch can't slip in before `loading` has re-rendered.
    const result = onPress?.() as unknown;
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).finally(() => {
        firing.current = false;
      });
    } else {
      firing.current = false;
    }
  };
  return (
    <Pressable
      onPress={handlePress}
      disabled={isOff}
      style={({ pressed }) => {
        const s: ViewStyle = {
          backgroundColor: pressed ? theme.colors.primaryPressed : theme.colors.primary,
          borderRadius: theme.radius.md,
          paddingVertical: theme.space.md,
          paddingHorizontal: theme.space.lg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isOff ? 0.6 : 1,
          transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
        };
        (s as Record<string, unknown>).boxShadow = `0 10px 22px ${theme.colors.primary}55`;
        return [s, style];
      }}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.onPrimary} />
      ) : (
        <AppText variant="headline" color="onPrimary">
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

/**
 * Secondary control: neumorphic raised that becomes inset when pressed
 * (DESIGN.md §8). Depth alone never signals state — pair with a clear label.
 */
export function NeoButton({ label, onPress, disabled, style }: ButtonProps) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={style}>
      {({ pressed }) => {
        const s: ViewStyle = {
          backgroundColor: theme.colors.bg,
          borderRadius: theme.radius.md,
          paddingVertical: theme.space.md,
          paddingHorizontal: theme.space.lg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
        };
        (s as Record<string, unknown>).boxShadow = pressed
          ? theme.elevation.inset
          : theme.elevation.raised;
        return (
          <View style={s}>
            <AppText variant="headline" color="secondary">
              {label}
            </AppText>
          </View>
        );
      }}
    </Pressable>
  );
}
