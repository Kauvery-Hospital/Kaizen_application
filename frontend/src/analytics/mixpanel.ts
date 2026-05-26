import mixpanel from 'mixpanel-browser';
import type { Role } from '../types';

const token = import.meta.env.VITE_MIXPANEL_TOKEN?.trim();

let enabled = false;

export function isMixpanelEnabled(): boolean {
  return enabled;
}

export function initMixpanel(): void {
  if (!token) {
    if (import.meta.env.DEV) {
      console.info('[mixpanel] VITE_MIXPANEL_TOKEN not set — analytics disabled');
    }
    return;
  }
  mixpanel.init(token, {
    debug: import.meta.env.DEV,
    track_pageview: false,
    persistence: 'localStorage',
    ignore_dnt: false,
  });
  enabled = true;
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (!enabled) return;
  mixpanel.track(event, props);
}

export function identifyUser(user: {
  id: string;
  name?: string;
  role?: Role;
  employeeCode?: string;
  roles?: Role[];
}): void {
  if (!enabled) return;
  mixpanel.identify(user.id);
  mixpanel.people.set({
    $name: user.name,
    role: user.role,
    employee_code: user.employeeCode,
    roles: user.roles?.join(', '),
  });
}

export function resetAnalytics(): void {
  if (!enabled) return;
  mixpanel.reset();
}
