import React, { useMemo, useState } from 'react';
import { PORTAL_NAME } from '../constants';
import { Role, User, type UserUnitScopes } from '../types';
import { KAUVERY_CARD_SURFACE, KAUVERY_PAGE_BG } from '../theme/kauverySurfaces';

interface LoginPageProps {
  onLogin: (user: User) => void;
  sessionExpired?: boolean;
  onDismissSessionExpired?: () => void;
}

type BackendRole =
  | 'EMPLOYEE'
  | 'UNIT_COORDINATOR'
  | 'SELECTION_COMMITTEE'
  | 'IMPLEMENTER'
  | 'BUSINESS_EXCELLENCE'
  | 'BUSINESS_EXCELLENCE_HEAD'
  | 'HOD_FINANCE'
  | 'HOD_HR'
  | 'HOD_QUALITY'
  | 'ADMIN'
  | 'SUPER_ADMIN'
  | 'BE_MEMBER'
  | 'BE_HEAD'
  | string;

const BACKEND_TO_UI_ROLE: Record<string, Role> = {
  EMPLOYEE: Role.EMPLOYEE,
  UNIT_COORDINATOR: Role.UNIT_COORDINATOR,
  SELECTION_COMMITTEE: Role.SELECTION_COMMITTEE,
  IMPLEMENTER: Role.IMPLEMENTER,
  BUSINESS_EXCELLENCE: Role.BUSINESS_EXCELLENCE,
  BUSINESS_EXCELLENCE_HEAD: Role.BUSINESS_EXCELLENCE_HEAD,
  HOD_FINANCE: Role.FINANCE_HOD,
  HOD_HR: Role.HR_HEAD,
  HOD_QUALITY: Role.QUALITY_HOD,
  HOD_OPS: Role.OPS_HEAD,
  HOD_NURSING: Role.NURSING_HEAD,
  BE_MEMBER: Role.BUSINESS_EXCELLENCE,
  BE_HEAD: Role.BUSINESS_EXCELLENCE_HEAD,
  ADMIN: Role.ADMIN,
  SUPER_ADMIN: Role.ADMIN,
};

async function messageFromFailedResponse(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return `Request failed (${res.status})`;
  try {
    const body = JSON.parse(text) as { message?: string | string[] };
    const m = body.message;
    if (Array.isArray(m)) return m.join(' ');
    if (typeof m === 'string') return m;
  } catch {
    // plain text
  }
  return text;
}

function normalizeApiBase(url: string): string {
  return url.replace(/\/+$/, '');
}

const KAUVERY_LOGO_SRC_CANDIDATES = [
  '/images/kauvery_logo.png',
  '/images/kauvery_logo.svg',
  '/images/kauvery_logo.jpg',
  '/images/kauvery_logo.jpeg',
  '/images/kauvery_logo.webp',
  '/images/kauvery_logo/kauvery_logo.png',
  '/images/kauvery_logo/logo.png',
] as const;

const BrandLogo: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [idx, setIdx] = useState(0);
  if (idx >= KAUVERY_LOGO_SRC_CANDIDATES.length) {
    return (
      <div
        className={`flex items-center justify-center text-kauvery-purple font-black tracking-wide ${className}`}
        aria-label="Kauvery"
      >
        KAUVERY
      </div>
    );
  }
  return (
    <img
      src={KAUVERY_LOGO_SRC_CANDIDATES[idx]}
      alt="Kauvery"
      className={className}
      onError={() => setIdx((n) => n + 1)}
      draggable={false}
    />
  );
};

type LoginApiUser = {
  id: string;
  name: string;
  employeeCode?: string;
  roles?: BackendRole[];
  departmentHodAssignments?: string[];
  unitScopes?: UserUnitScopes;
};

type LoginResponse = {
  accessToken: string;
  user: LoginApiUser;
};

export const LoginPage: React.FC<LoginPageProps> = ({
  onLogin,
  sessionExpired = false,
  onDismissSessionExpired,
}) => {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>(Role.EMPLOYEE);
  const [roleChoices, setRoleChoices] = useState<Role[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = useMemo(
    () =>
      normalizeApiBase(
        import.meta.env.VITE_API_BASE_URL ||
          (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin),
      ),
    [],
  );

  const mapBackendRoles = (backendRoles: BackendRole[]): Role[] => {
    const mapped = backendRoles
      .map((r) => BACKEND_TO_UI_ROLE[String(r)] || Role.EMPLOYEE)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    return mapped.length > 0 ? mapped : [Role.EMPLOYEE];
  };

  const finishLogin = (user: LoginApiUser, accessToken: string, role: Role, roles: Role[]) => {
    onLogin({
      id: user.id,
      name: user.name,
      role,
      roles,
      departmentHodAssignments: Array.isArray(user.departmentHodAssignments)
        ? user.departmentHodAssignments.filter(Boolean)
        : [],
      unitScopes: user.unitScopes,
      employeeCode: user.employeeCode,
      accessToken,
    });
  };

  const handleSubmitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!employeeId.trim()) {
      setError('Enter your employee ID.');
      return;
    }
    if (!password.trim()) {
      setError('Enter your password.');
      return;
    }

    onDismissSessionExpired?.();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeCode: employeeId.trim(),
          password,
        }),
      });

      if (!res.ok) {
        throw new Error(await messageFromFailedResponse(res));
      }

      const data = (await res.json()) as LoginResponse;
      if (!data?.accessToken || !data?.user?.id || !data?.user?.name) {
        throw new Error('Invalid response from server.');
      }

      const finalRoles = mapBackendRoles(data.user.roles ?? []);
      setRoleChoices(finalRoles);
      setPassword('');

      // Default behavior: prefer Admin when present (covers SUPER_ADMIN -> Admin mapping),
      // otherwise prefer Employee if present, else fallback to the first assigned role.
      const preferred = finalRoles.includes(Role.ADMIN)
        ? Role.ADMIN
        : finalRoles.includes(Role.EMPLOYEE)
          ? Role.EMPLOYEE
          : finalRoles[0];
      setSelectedRole(preferred);
      finishLogin(data.user, data.accessToken, preferred, finalRoles);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to login. Check your connection and try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`relative min-h-screen overflow-hidden font-sans text-slate-800 ${KAUVERY_PAGE_BG}`}>
      {/* Decorative brand pattern (subtle, on-brand) */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 opacity-[0.14] [mask-image:radial-gradient(circle_at_50%_45%,black_0%,black_55%,transparent_88%)]">
          {/* Smaller, repeated logos (keep subtle) */}
          <div className="absolute -top-6 -left-6 w-[220px] h-[220px] rotate-[-16deg] blur-[0.2px]">
            <BrandLogo className="w-full h-full object-contain" />
          </div>
          <div className="absolute top-[10%] left-[26%] w-[200px] h-[200px] rotate-[10deg] blur-[0.2px]">
            <BrandLogo className="w-full h-full object-contain" />
          </div>
          <div className="absolute top-[6%] right-[10%] w-[210px] h-[210px] rotate-[-8deg] blur-[0.2px]">
            <BrandLogo className="w-full h-full object-contain" />
          </div>
          <div className="absolute top-[34%] left-[8%] w-[210px] h-[210px] rotate-[14deg] blur-[0.2px]">
            <BrandLogo className="w-full h-full object-contain" />
          </div>
          <div className="absolute top-[38%] left-[46%] w-[230px] h-[230px] rotate-[-10deg] blur-[0.2px]">
            <BrandLogo className="w-full h-full object-contain" />
          </div>
          <div className="absolute top-[30%] right-[6%] w-[200px] h-[200px] rotate-[9deg] blur-[0.2px]">
            <BrandLogo className="w-full h-full object-contain" />
          </div>
          <div className="absolute bottom-[18%] left-[18%] w-[220px] h-[220px] rotate-[-12deg] blur-[0.2px]">
            <BrandLogo className="w-full h-full object-contain" />
          </div>
          <div className="absolute bottom-[10%] right-[12%] w-[240px] h-[240px] rotate-[12deg] blur-[0.2px]">
            <BrandLogo className="w-full h-full object-contain" />
          </div>
          <div className="absolute -bottom-10 -left-10 w-[260px] h-[260px] rotate-[6deg] blur-[0.2px]">
            <BrandLogo className="w-full h-full object-contain" />
          </div>
        </div>
        {/* soft glow accents */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-kauvery-purple/25 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-[420px] h-[420px] rounded-full bg-kauvery-pink/20 blur-3xl" />
      </div>

      <div className="relative min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className={`relative overflow-hidden rounded-3xl border border-kauvery-purple/15 shadow-2xl shadow-kauvery-soft ${KAUVERY_CARD_SURFACE}`}>
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-kauvery-purple via-kauvery-violet to-kauvery-pink" />

            <div className="p-8 sm:p-10">
              {sessionExpired && (
                <div
                  role="alert"
                  className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm"
                >
                  <p className="text-sm font-semibold text-slate-800">
                    Your session has expired
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-600">
                    You were signed out. Please sign in again.
                  </p>
                </div>
              )}
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-kauvery-purple/20 border border-kauvery-purple/40 shadow-sm flex items-center justify-center overflow-hidden">
                  <BrandLogo className="max-h-12 max-w-14 object-contain" />
                </div>
                <div className="mt-4 text-xs uppercase tracking-widest text-kauvery-peach/90 font-extrabold">
                  {PORTAL_NAME}
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                  Sign in to continue
                </h1>
                <p className="text-sm text-slate-600 font-semibold mt-2">
                  Use your employee ID and HRMS password.
                </p>
              </div>

              <form onSubmit={handleSubmitCredentials} className="mt-8 space-y-5">
                <div>
                  <label className="block text-xs font-extrabold text-slate-400 uppercase mb-1.5">
                    Employee ID
                  </label>
                  <div className="relative">
                    <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">
                      badge
                    </span>
                    <input
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      placeholder="Enter your employee ID"
                      autoComplete="username"
                      className="w-full pl-11 pr-3 py-3 rounded-xl border border-kauvery-purple/25 text-sm text-slate-800 font-semibold bg-white placeholder:text-slate-400 focus:ring-2 focus:ring-kauvery-purple/30 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-400 uppercase mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">
                      lock
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      className="w-full pl-11 pr-3 py-3 rounded-xl border border-kauvery-purple/25 text-sm text-slate-800 font-semibold bg-white placeholder:text-slate-400 focus:ring-2 focus:ring-kauvery-purple/30 outline-none"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-xs text-red-700 font-extrabold bg-red-50 border border-red-200 rounded-xl p-3">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-kauvery-purple to-kauvery-violet text-white font-black shadow-lg shadow-kauvery-glow hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
                >
                  {isSubmitting ? 'Signing in...' : 'Sign In'}
                </button>

                <div className="pt-2 text-[11px] text-slate-500 font-semibold leading-relaxed text-center">
                  By continuing, you agree to follow your organization’s information security policies.
                </div>
              </form>
            </div>
          </div>

          <div className="mt-5 text-center text-[11px] text-slate-500 font-semibold">
            Secure access • Role-based workflow
          </div>
        </div>
      </div>
    </div>
  );
};
