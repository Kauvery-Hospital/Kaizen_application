/** Inactivity limit before the portal requires sign-in again. */
export const IDLE_SESSION_TIMEOUT_MS = 15 * 60 * 1000;

const LAST_ACTIVITY_KEY = 'kaizen.auth.lastActivityAt';
const SESSION_EXPIRED_FLAG_KEY = 'kaizen.auth.sessionExpired';

export function touchSessionActivity(at = Date.now()): void {
  try {
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // ignore private mode / quota
  }
}

export function clearSessionActivity(): void {
  try {
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // ignore
  }
}

export function getLastSessionActivityAt(): number | null {
  try {
    const raw = sessionStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function isIdleSessionExpired(
  idleMs: number = IDLE_SESSION_TIMEOUT_MS,
  now = Date.now(),
): boolean {
  const last = getLastSessionActivityAt();
  if (last == null) return false;
  return now - last >= idleMs;
}

export function markSessionExpired(): void {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG_KEY, '1');
  } catch {
    // ignore
  }
}

export function consumeSessionExpiredFlag(): boolean {
  try {
    const v = sessionStorage.getItem(SESSION_EXPIRED_FLAG_KEY);
    sessionStorage.removeItem(SESSION_EXPIRED_FLAG_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export function clearSessionExpiredFlag(): void {
  try {
    sessionStorage.removeItem(SESSION_EXPIRED_FLAG_KEY);
  } catch {
    // ignore
  }
}
