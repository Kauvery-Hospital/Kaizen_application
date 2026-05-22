import { useEffect, useRef } from 'react';
import {
  IDLE_SESSION_TIMEOUT_MS,
  isIdleSessionExpired,
  touchSessionActivity,
} from './idleSession';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;

const CHECK_INTERVAL_MS = 30_000;

/**
 * Signs the user out after {@link IDLE_SESSION_TIMEOUT_MS} without user activity.
 * Also re-checks when the tab becomes visible again.
 */
export function useIdleSessionTimeout(
  enabled: boolean,
  onExpire: () => void,
  idleMs: number = IDLE_SESSION_TIMEOUT_MS,
): void {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!enabled) return;

    const expireIfIdle = () => {
      if (isIdleSessionExpired(idleMs)) {
        onExpireRef.current();
      }
    };

    const onActivity = () => {
      touchSessionActivity();
    };

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, onActivity, { passive: true });
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        expireIfIdle();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const intervalId = window.setInterval(expireIfIdle, CHECK_INTERVAL_MS);

    touchSessionActivity();

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, onActivity);
      }
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(intervalId);
    };
  }, [enabled, idleMs]);
}
