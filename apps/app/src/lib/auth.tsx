import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthTokens, User } from '@caw/shared';
import { api, setAccessToken, setUnauthorizedHandler } from './api';
import { connectSocket, disconnectSocket } from './socket';
import { deleteItem, getItem, setItem } from './storage';

const ACCESS_KEY = 'caw.access';
const REFRESH_KEY = 'caw.refresh';
const HAS_PIN_KEY = 'caw.hasPin';

/**
 * - loading      — restoring the persisted session; show a splash.
 * - guest        — no session on this device; phone + OTP flow.
 * - otp-verified — OTP just succeeded; device has no PIN yet, must set one.
 * - locked       — a session is persisted and this device has a PIN; needs the
 *                   PIN (not a full OTP) to unlock it.
 * - authed       — unlocked; full app access.
 */
export type Status = 'loading' | 'guest' | 'otp-verified' | 'locked' | 'authed';

/** Where each non-loading status should route to. Shared by the layouts. */
export function routeForStatus(status: Status): string {
  switch (status) {
    case 'authed':
      return '/(tabs)/wallet';
    case 'otp-verified':
      return '/(auth)/create-pin';
    case 'locked':
      return '/(auth)/unlock';
    default:
      return '/(auth)/phone';
  }
}

interface AuthValue {
  status: Status;
  user: User | null;
  requestOtp: (phone: string) => Promise<{ resendInSeconds: number; isNewUser: boolean }>;
  verifyOtp: (phone: string, code: string, displayName?: string) => Promise<void>;
  createPin: (pin: string) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<void>;
  /** Abandon the locked/otp-verified session on this device and start over via OTP. */
  useDifferentAccount: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const refreshTokenRef = useRef<string | null>(null);

  const applyTokens = useCallback(async (tokens: AuthTokens) => {
    setAccessToken(tokens.accessToken);
    refreshTokenRef.current = tokens.refreshToken;
    await setItem(ACCESS_KEY, tokens.accessToken);
    await setItem(REFRESH_KEY, tokens.refreshToken);
    connectSocket(tokens.accessToken);
  }, []);

  const clear = useCallback(async () => {
    setAccessToken(null);
    refreshTokenRef.current = null;
    await deleteItem(ACCESS_KEY);
    await deleteItem(REFRESH_KEY);
    await deleteItem(HAS_PIN_KEY);
    disconnectSocket();
    setUser(null);
    setStatus('guest');
  }, []);

  // Transparently refresh the session when a request hits 401.
  useEffect(() => {
    setUnauthorizedHandler(async () => {
      const rt = refreshTokenRef.current;
      if (!rt) return false;
      try {
        const { tokens } = await api.refresh(rt);
        await applyTokens(tokens);
        return true;
      } catch {
        await clear();
        return false;
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [applyTokens, clear]);

  // Restore a persisted session on launch. A refresh token is the durable
  // credential; if the device also has a PIN set, stop there and let the PIN
  // screen do the unlocking instead of silently hitting the network.
  useEffect(() => {
    (async () => {
      const access = await getItem(ACCESS_KEY);
      const refresh = await getItem(REFRESH_KEY);
      const hasPin = await getItem(HAS_PIN_KEY);

      if (!refresh) {
        setStatus('guest');
        return;
      }
      refreshTokenRef.current = refresh;

      if (hasPin) {
        setStatus('locked');
        return;
      }

      if (access) setAccessToken(access);
      try {
        const me = await api.me();
        setUser(me.user);
        connectSocket(access!);
        setStatus('authed');
      } catch {
        try {
          const { tokens } = await api.refresh(refresh);
          await applyTokens(tokens);
          const me = await api.me();
          setUser(me.user);
          setStatus('authed');
        } catch {
          await clear();
        }
      }
    })();
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestOtp = useCallback((phone: string) => api.requestOtp(phone), []);

  const verifyOtp = useCallback(
    async (phone: string, code: string, displayName?: string) => {
      const { user: u, tokens } = await api.verifyOtp(phone, code, displayName);
      await applyTokens(tokens);
      setUser(u);
      // A fresh OTP sign-in always lands here, even for a returning user on a
      // new device — this device has no PIN yet, so it needs to set one.
      setStatus('otp-verified');
    },
    [applyTokens],
  );

  const createPin = useCallback(async (pin: string) => {
    await api.setPin(pin);
    await setItem(HAS_PIN_KEY, '1');
    setStatus('authed');
  }, []);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const rt = refreshTokenRef.current;
      if (!rt) throw new Error('No session to unlock');
      const { user: u, tokens } = await api.verifyPin(rt, pin);
      await applyTokens(tokens);
      setUser(u);
      setStatus('authed');
    },
    [applyTokens],
  );

  const useDifferentAccount = useCallback(() => clear(), [clear]);
  const logout = useCallback(() => clear(), [clear]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      requestOtp,
      verifyOtp,
      createPin,
      unlockWithPin,
      useDifferentAccount,
      logout,
    }),
    [status, user, requestOtp, verifyOtp, createPin, unlockWithPin, useDifferentAccount, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
