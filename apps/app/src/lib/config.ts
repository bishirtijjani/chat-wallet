/**
 * API base URL. Override per environment with EXPO_PUBLIC_API_URL (Expo inlines
 * EXPO_PUBLIC_* at build time). On a physical device, point this at your
 * machine's LAN IP, not localhost.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
