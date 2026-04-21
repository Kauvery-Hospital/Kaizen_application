import type { User } from '../types';

const STORAGE_KEY = 'kaizen.auth.session';

export function saveSession(user: User): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // ignore quota / private mode
  }
}

export function loadSession(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    if (!parsed?.id || !parsed?.name || !parsed?.role || !parsed?.accessToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
