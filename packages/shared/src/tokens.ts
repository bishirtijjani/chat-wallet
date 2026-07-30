/**
 * Design tokens — the source of truth for the look & feel (see docs/DESIGN.md).
 * Consumed by the Expo app across iOS, Android, and web. Colors are per-theme;
 * elevation is built from each theme's two shadow colors (the neumorphic
 * light/dark pair). Elevation is emitted as `boxShadow` strings, which RN 0.76+
 * and React Native Web both understand, so one value works on every platform.
 */

export type ThemeName = 'light' | 'dark';

export interface ThemeColors {
  bg: string;
  shadowLight: string;
  shadowDark: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  info: string;
  success: string;
  warning: string;
  danger: string;
}

export const palette: Record<ThemeName, ThemeColors> = {
  light: {
    bg: '#E8EDF3',
    shadowLight: '#FFFFFF',
    shadowDark: '#C4CDD8',
    textPrimary: '#2A2F36',
    textSecondary: '#6B7580',
    textTertiary: '#9AA3AD',
    primary: '#12B981',
    primaryPressed: '#0EA372',
    onPrimary: '#FFFFFF',
    info: '#3B82F6',
    success: '#12B981',
    warning: '#F5A524',
    danger: '#EF4444',
  },
  dark: {
    bg: '#22262C',
    shadowLight: '#2C323A',
    shadowDark: '#171A1F',
    textPrimary: '#E6EAF0',
    textSecondary: '#9AA3AD',
    textTertiary: '#6B7580',
    primary: '#2ED89B',
    primaryPressed: '#24BE86',
    onPrimary: '#0B0E12',
    info: '#5B9DFF',
    success: '#2ED89B',
    warning: '#FFB84D',
    danger: '#FF6B6B',
  },
};

/** 8pt grid with 4pt fine step (DESIGN.md §7). */
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** Soft, generous radii. */
export const radius = { sm: 12, md: 16, lg: 24, xl: 32, pill: 999 } as const;

/** Type scale (pt), Apple-HIG derived (DESIGN.md §5). */
export const type = {
  largeTitle: { size: 34, line: 41, weight: '800', tracking: -0.68 },
  title1: { size: 28, line: 34, weight: '800', tracking: -0.42 },
  title2: { size: 22, line: 28, weight: '700', tracking: -0.22 },
  title3: { size: 20, line: 25, weight: '600', tracking: -0.2 },
  headline: { size: 17, line: 22, weight: '600', tracking: 0 },
  body: { size: 17, line: 22, weight: '400', tracking: 0 },
  callout: { size: 16, line: 21, weight: '400', tracking: 0 },
  subhead: { size: 15, line: 20, weight: '400', tracking: 0.15 },
  footnote: { size: 13, line: 18, weight: '400', tracking: 0.13 },
  caption: { size: 12, line: 16, weight: '400', tracking: 0.24 },
} as const;

export type TypeToken = keyof typeof type;

/** Motion tokens (DESIGN.md §6). Durations in ms. */
export const motion = {
  ease: {
    out: 'cubic-bezier(0.23, 1, 0.32, 1)',
    inOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
    sheet: 'cubic-bezier(0.32, 0.72, 0, 1)',
  },
  duration: { press: 120, popover: 160, dropdown: 200, sheet: 320 },
  pressScale: 0.97,
} as const;

export interface Elevation {
  raised: string;
  floating: string;
  inset: string;
}

/**
 * Build the four dual-shadow recipes for a theme from its two shadow colors.
 * Inset flips the offsets inward (a pressed-in look).
 */
export function elevationFor(colors: ThemeColors): Elevation {
  const { shadowLight: l, shadowDark: d } = colors;
  return {
    raised: `6px 6px 12px ${d}, -6px -6px 12px ${l}`,
    floating: `10px 10px 22px ${d}, -10px -10px 22px ${l}`,
    inset: `inset 4px 4px 8px ${d}, inset -4px -4px 8px ${l}`,
  };
}

export interface Theme {
  name: ThemeName;
  colors: ThemeColors;
  elevation: Elevation;
  space: typeof space;
  radius: typeof radius;
  type: typeof type;
  motion: typeof motion;
}

export function makeTheme(name: ThemeName): Theme {
  const colors = palette[name];
  return { name, colors, elevation: elevationFor(colors), space, radius, type, motion };
}
