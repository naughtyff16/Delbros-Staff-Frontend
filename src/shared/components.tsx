import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Banner } from '../lib/ui';
import type { GateAction } from '../lib/shared';

/** Red blocking banner driven by the credit gate (BR-01). Server still enforces. */
export function CreditGateBanner({ clientCode, action }: { clientCode?: string; action: GateAction }) {
  const q = useQuery({ queryKey: ['gate-check', clientCode, action], queryFn: () => api.credit.gateCheck(clientCode!, action), enabled: !!clientCode, staleTime: 0 });
  if (!clientCode || !q.data || q.data.allowed) return null;
  return (
    <Banner tone="danger" title="Transaction blocked by credit gate"
      actions={<Link to={`/credit/status?client=${clientCode}`} className="text-sm font-medium text-brand-700 hover:underline">Client status →</Link>}>
      {q.data.reason}
    </Banner>
  );
}

export function useGate(clientCode: string | undefined, action: GateAction) {
  const q = useQuery({ queryKey: ['gate-check', clientCode, action], queryFn: () => api.credit.gateCheck(clientCode!, action), enabled: !!clientCode, staleTime: 0 });
  return { allowed: !clientCode ? false : q.data?.allowed ?? false, reason: q.data?.reason, loading: q.isLoading };
}

/** Screen IDs (SCR-xx) are for traceability documents only — not shown to users (UI/UX audit). */
export function ScreenTag(_: { id: string }) {
  return null;
}

export function Crumb({ items }: { items: { to?: string; label: ReactNode }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1">
      {items.map((i, k) => (
        <span key={k} className="flex items-center gap-1">
          {k > 0 && <span aria-hidden>/</span>}
          {i.to ? <Link to={i.to} className="hover:text-brand-700 hover:underline">{i.label}</Link> : <span className="text-ink-2">{i.label}</span>}
        </span>
      ))}
    </nav>
  );
}
