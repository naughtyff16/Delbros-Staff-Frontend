import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { can as canFn, type Action, type Grants, type User } from '../lib/shared';

type Session = (User & { grants: Grants }) | null;
interface AuthCtx {
  user: Session;
  login: (userId: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
  can: (resource: string, action?: Action) => boolean;
  hasRole: (...roles: User['roles']) => boolean;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Session>(() => api.auth.me());
  const qc = useQueryClient();
  const login = useCallback(async (id: string, pw: string) => { const u = await api.auth.login(id, pw, 'INTERNAL'); qc.clear(); setUser(u); return u; }, [qc]);
  const logout = useCallback(async () => { await api.auth.logout(); qc.clear(); setUser(null); }, [qc]);
  const value = useMemo<AuthCtx>(() => ({
    user, login, logout,
    can: (r, a = 'view') => !!user && canFn(user.grants, r, a),
    hasRole: (...roles) => !!user && user.roles.some((r) => roles.includes(r)),
  }), [user, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

/** Role-based landing route (docs/02 §4). */
export function landingFor(u: NonNullable<Session>): string {
  const r = u.roles;
  if (r.includes('SYS_ADMIN')) return '/dashboard'; // admins always start on the Dashboard
  if (r.some((x) => ['CEO', 'PRESIDENT', 'EXECUTIVE', 'VP', 'CHRO'].includes(x))) return '/reports/executive';
  if (r.some((x) => ['BRANCH_GENERALIST', 'DYM', 'BRANCH_HEAD', 'GATE_CLERK'].includes(x))) return '/dashboard';
  if (r.includes('DISPATCHER')) return '/rescue';
  if (r.some((x) => ['ACCOUNT_EXECUTIVE', 'SALES_DIRECTOR'].includes(x))) return '/clients';
  if (r.some((x) => ['CNC_OFFICER', 'CNC_MANAGER', 'EXEC_OFFICER'].includes(x))) return '/credit/aging';
  if (r.some((x) => ['ACCOUNTING', 'TREASURY', 'FINANCE_MANAGER'].includes(x))) return '/billing/invoices';
  if (r.some((x) => ['APS_OFFICER', 'APS_MANAGER', 'DEPT_HEAD', 'WAREHOUSE'].includes(x))) return '/procurement';
  if (r.includes('REGULATORY')) return '/regulatory/compliance';
  return '/dashboard';
}
