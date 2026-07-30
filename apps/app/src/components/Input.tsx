import { TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';

/** An inset (pressed-in) input field with a label above (DESIGN.md §8). */
export function Input({
  label,
  style,
  ...props
}: TextInputProps & { label?: string }) {
  const theme = useTheme();
  const box: ViewStyle = {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
  };
  (box as Record<string, unknown>).boxShadow = theme.elevation.inset;
  return (
    <View style={{ gap: theme.space.sm }}>
      {label ? (
        <AppText variant="subhead" color="secondary">
          {label}
        </AppText>
      ) : null}
      <View style={box}>
        <TextInput
          placeholderTextColor={theme.colors.textTertiary}
          style={[{ color: theme.colors.textPrimary, fontSize: 17, padding: 0 }, style]}
          {...props}
        />
      </View>
    </View>
  );
}
