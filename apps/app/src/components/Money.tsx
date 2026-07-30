import type { TypeToken } from '@caw/shared';
import { AppText } from './AppText';
import { naira } from '@/lib/format';

type ColorToken = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'success' | 'danger' | 'onPrimary';

/** A money figure: tabular digits so values don't jump as they update (DESIGN.md §5). */
export function Money({
  kobo,
  variant = 'body',
  color = 'primary',
  rounded = false,
  withKobo = true,
  signed = false,
}: {
  kobo: number;
  variant?: TypeToken;
  color?: ColorToken;
  rounded?: boolean;
  withKobo?: boolean;
  signed?: boolean;
}) {
  const text = (signed && kobo > 0 ? '+' : '') + naira(kobo, withKobo);
  return (
    <AppText variant={variant} color={color} rounded={rounded} tabular>
      {text}
    </AppText>
  );
}
