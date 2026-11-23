import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { Button, EmptyState } from '../lib/ui';
import { landingFor, useAuth } from './auth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export function RequirePermission({ perm, children }: { perm: string; children: ReactNode }) {
  const { can } = useAuth();
  if (perm !== '*' && !can(perm)) {
    return (
      <EmptyState icon={<ShieldAlert className="size-5" />} title="You don't have access to this screen"
        hint={`Required permission: ${perm} (view). Ask your System Administrator if you need it.`}
        action={<Link to="/"><Button variant="secondary">Go to my dashboard</Button></Link>} />
    );
  }
  return <>{children}</>;
}

export function RoleLanding() {
  const { user } = useAuth();
  return <Navigate to={user ? landingFor(user) : '/login'} replace state={{ mainNav: true }} />;
}
