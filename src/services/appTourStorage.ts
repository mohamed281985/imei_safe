import { Preferences } from '@capacitor/preferences';

const TOUR_STORAGE_PREFIX = 'imei-safe:app-tour:v1:';

const getStorageKey = (userId?: string | null) =>
  `${TOUR_STORAGE_PREFIX}${userId ? `user:${userId}` : 'device:guest'}`;

const readValue = async (key: string) => {
  try {
    const { value } = await Preferences.get({ key });
    if (value !== null) return value;
  } catch (error) {
    console.warn('App tour preference read failed; using browser storage.', error);
  }

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeValue = async (key: string, value: string | null) => {
  try {
    if (value === null) await Preferences.remove({ key });
    else await Preferences.set({ key, value });
  } catch (error) {
    console.warn('App tour preference write failed; using browser storage.', error);
  }

  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Capacitor Preferences remains the primary store on native platforms.
  }
};

export const hasCompletedAppTour = async (userId?: string | null) =>
  (await readValue(getStorageKey(userId))) === 'true';

export const completeAppTour = (userId?: string | null) =>
  writeValue(getStorageKey(userId), 'true');

export const resetAppTour = (userId?: string | null) =>
  writeValue(getStorageKey(userId), null);