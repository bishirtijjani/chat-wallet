import { createContext, useContext, type ReactNode } from 'react';
import { makeTheme, type Theme } from '@caw/shared';

const lightTheme = makeTheme('light');

const ThemeContext = createContext<Theme>(lightTheme);

/**
 * Provides the active theme. Always light for now — there's no in-app
 * toggle yet, and following the OS scheme meant dark-mode devices/browsers
 * got dark with no way back to light. Revisit once a manual toggle exists.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={lightTheme}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): Theme => useContext(ThemeContext);
