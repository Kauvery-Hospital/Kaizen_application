import type { Role } from '../types';

const token = import.meta.env.VITE_MIXPANEL_TOKEN?.trim();
const MIXPANEL_CDN =
  'https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js';

type MixpanelClient = {
  init: (t: string, config: Record<string, unknown>) => void;
  track: (event: string, props?: Record<string, unknown>) => void;
  identify: (id: string) => void;
  people: { set: (props: Record<string, unknown>) => void };
  reset: () => void;
};

declare global {
  interface Window {
    mixpanel?: MixpanelClient;
  }
}

let enabled = false;
let scriptLoaded = false;
let scriptLoading: Promise<MixpanelClient> | null = null;
const pendingCalls: Array<(mp: MixpanelClient) => void> = [];

function loadMixpanelScript(): Promise<MixpanelClient> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Mixpanel requires a browser environment'));
  }
  if (window.mixpanel) {
    scriptLoaded = true;
    return Promise.resolve(window.mixpanel);
  }
  if (scriptLoading) return scriptLoading;

  scriptLoading = new Promise<MixpanelClient>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-kaizen-mixpanel]',
    );
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.mixpanel) resolve(window.mixpanel);
        else reject(new Error('Mixpanel script loaded but global is missing'));
      });
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Mixpanel script')),
      );
      return;
    }

    const script = document.createElement('script');
    script.src = MIXPANEL_CDN;
    script.async = true;
    script.dataset.kaizenMixpanel = '1';
    script.onload = () => {
      if (window.mixpanel) {
        scriptLoaded = true;
        resolve(window.mixpanel);
      } else {
        reject(new Error('Mixpanel script loaded but global is missing'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Mixpanel script'));
    document.head.appendChild(script);
  });

  return scriptLoading;
}

function withMixpanel(fn: (mp: MixpanelClient) => void): void {
  if (!enabled || !token) return;
  if (scriptLoaded && window.mixpanel) {
    fn(window.mixpanel);
    return;
  }
  pendingCalls.push(fn);
  void loadMixpanelScript()
    .then((mp) => {
      pendingCalls.splice(0).forEach((call) => call(mp));
    })
    .catch((err) => {
      if (import.meta.env.DEV) {
        console.warn('[mixpanel] Failed to load SDK', err);
      }
      pendingCalls.length = 0;
      enabled = false;
    });
}

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

  enabled = true;
  void loadMixpanelScript()
    .then((mp) => {
      mp.init(token, {
        debug: import.meta.env.DEV,
        track_pageview: false,
        persistence: 'localStorage',
        ignore_dnt: false,
      });
      const queued = pendingCalls.splice(0);
      queued.forEach((call) => call(mp));
    })
    .catch((err) => {
      if (import.meta.env.DEV) {
        console.warn('[mixpanel] Init failed', err);
      }
      enabled = false;
      pendingCalls.length = 0;
    });
}

export function track(event: string, props?: Record<string, unknown>): void {
  withMixpanel((mp) => mp.track(event, props));
}

export function identifyUser(user: {
  id: string;
  name?: string;
  role?: Role;
  employeeCode?: string;
  roles?: Role[];
}): void {
  withMixpanel((mp) => {
    mp.identify(user.id);
    mp.people.set({
      $name: user.name,
      role: user.role,
      employee_code: user.employeeCode,
      roles: user.roles?.join(', '),
    });
  });
}

export function resetAnalytics(): void {
  withMixpanel((mp) => mp.reset());
}
