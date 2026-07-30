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

type Status = 'loading' | 'authed' | 'guest';

interface AuthValue {
  status: Status;
  user: User | null;
  requestOtp: (phone: string) => Promise<{ resendInSeconds: number }>;
  verifyOtp: (phone: string, code: string, displayName?: string) => Promise<void>;
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

  // Restore a persisted session on launch.
  useEffect(() => {
    (async () => {
      const access = await getItem(ACCESS_KEY);
      const refresh = await getItem(REFRESH_KEY);
      if (!access) {
        setStatus('guest');
        return;
      }
      setAccessToken(access);
      refreshTokenRef.current = refresh;
      try {
        const me = await api.me();
        setUser(me.user);
        connectSocket(access);
        setStatus('authed');
      } catch {
        if (refresh) {
          try {
            const { tokens } = await api.refresh(refresh);
            await applyTokens(tokens);
            const me = await api.me();
            setUser(me.user);
            setStatus('authed');
            return;
          } catch {
            /* fall through to clear */
          }
        }
        await clear();
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
      setStatus('authed');
    },
    [applyTokens],
  );

  const logout = useCallback(() => clear(), [clear]);

  const value = useMemo<AuthValue>(
    () => ({ status, user, requestOtp, verifyOtp, logout }),
    [status, user, requestOtp, verifyOtp, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
