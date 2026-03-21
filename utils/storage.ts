import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEY = 'budget_app_state_v2';
const LEGACY_STORAGE_KEY = 'budget_app_state_v1';

export async function loadPersistedState() {
  const current = await AsyncStorage.getItem(STORAGE_KEY);
  if (current) {
    return JSON.parse(current);
  }

  const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    return JSON.parse(legacy);
  }

  return null;
}

export async function savePersistedState(state: unknown) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
