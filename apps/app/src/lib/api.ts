import type {
  AuthTokens,
  Circle,
  Frequency,
  Reputation,
  User,
  Wallet,
  Message,
} from '@caw/shared';
import { API_URL } from './config';
import type {
  CircleDetail,
  ConversationSummaryView,
  DashboardView,
  HistoryItem,
} from './types';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken: string | null = null;
let onUnauthorized: (() => Promise<boolean>) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Register a handler that tries to refresh the session on a 401 (returns true if it did). */
export function setUnauthorizedHandler(handler: (() => Promise<boolean>) | null): void {
  onUnauthorized = handler;
}

async function request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401 && retry && onUnauthorized) {
    const refreshed = await onUnauthorized();
    if (refreshed) return request<T>(path, init, false);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.message ?? 'Request failed', err?.code, err?.details);
  }
  return data as T;
}

const post = (path: string, body?: unknown) =>
  request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

export const api = {
  // Auth
  requestOtp: (phone: string) =>
    post('/auth/otp/request', { phone }) as Promise<{
      resendInSeconds: number;
      isNewUser: boolean;
    }>,
  verifyOtp: (phone: string, code: string, displayName?: string) =>
    post('/auth/otp/verify', { phone, code, displayName }) as Promise<{
      user: User;
      tokens: AuthTokens;
    }>,
  refresh: (refreshToken: string) =>
    post('/auth/refresh', { refreshToken }) as Promise<{ tokens: AuthTokens }>,
  me: () => request<{ user: User }>('/auth/me'),
  setPin: (pin: string) => post('/auth/pin/set', { pin }) as Promise<void>,
  verifyPin: (refreshToken: string, pin: string) =>
    post('/auth/pin/verify', { refreshToken, pin }) as Promise<{
      user: User;
      tokens: AuthTokens;
    }>,

  // Wallet
  wallet: () => request<{ wallet: Wallet }>('/wallet'),
  walletHistory: () => request<{ history: HistoryItem[] }>('/wallet/history'),
  fund: (amount: number) => post('/wallet/fund', { amount }) as Promise<{ balance: number }>,

  // Circles
  circles: () => request<{ circles: Circle[] }>('/circles'),
  circle: (id: string) => request<{ circle: CircleDetail }>(`/circles/${id}`),
  createCircle: (input: {
    name: string;
    contributionAmount: number;
    frequency: Frequency;
    memberCap: number;
  }) => post('/circles', input) as Promise<{ circle: Circle }>,
  addMember: (id: string, phone: string) =>
    post(`/circles/${id}/members`, { phone }) as Promise<unknown>,
  setPayoutOrder: (id: string, order: string[]) =>
    request(`/circles/${id}/order`, { method: 'PUT', body: JSON.stringify({ order }) }),
  startCircle: (id: string) => post(`/circles/${id}/start`) as Promise<{ cycleFee: number }>,
  collect: (id: string) =>
    post(`/circles/${id}/collect`) as Promise<{ collected: number; pending: number }>,
  settle: (id: string) =>
    post(`/circles/${id}/settle`) as Promise<{ paidTo: string; amount: number; completed: boolean }>,
  dashboard: (id: string) => request<{ dashboard: DashboardView }>(`/circles/${id}/dashboard`),
  reputation: () => request<{ reputation: Reputation }>('/users/me/reputation'),

  // Chat
  conversations: () => request<{ conversations: ConversationSummaryView[] }>('/conversations'),
  messages: (id: string) => request<{ messages: Message[] }>(`/conversations/${id}/messages`),
  sendMessage: (id: string, body: string) =>
    post(`/conversations/${id}/messages`, { body }) as Promise<{ message: Message }>,
};
