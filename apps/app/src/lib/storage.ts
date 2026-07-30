import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cross-platform key/value storage for the session tokens. Uses AsyncStorage,
 * which works on iOS, Android, and web from one API.
 *
 * NOTE: for production, refresh tokens should move to the OS keychain
 * (expo-secure-store) on native and an httpOnly cookie on web. AsyncStorage is
 * fine for this milestone.
 */
export async function setItem(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function getItem(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function deleteItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
