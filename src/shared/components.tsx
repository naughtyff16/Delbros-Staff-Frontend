import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Badge, Banner, Card, CardHeader, cn } from '../lib/ui';
import { formatDateTime } from '../lib/shared';
import type { GateAction } from '../lib/shared';

/**
 * Staff UI changes V1.4 (rows 30–31): notices sent for one record — event, rule, every recipient (read / acknowledged), channels and the
 * per-channel delivery state. Email / SMS show "Queued" until the mail / SMS service reports back; nothing is shown as delivered unless it was.
 */
export function RecordNotices({ refNo, link, title = 'Notifications for this record' }: { refNo: string; link?: string; title?: string }) {
  const q = useQuery({ queryKey: ['record-notices', refNo, link], queryFn: () => api.inbox.recordNotices(refNo, link) });
  const tone = (s: string) => (s === 'Sent' ? 'success' : s === 'Failed' ? 'danger' : s === 'Queued' ? 'warning' : 'neutral');
  return (
    <Card>
      <CardHeader title={title} description="Each event with its rule, channels, recipients and delivery state. Sent = handed to the channel; Queued = waiting for the mail / SMS service, which sets Sent or Failed." />
      {q.isLoading ? <p className="text-sm text-muted">Loading…</p> : !q.data?.length ? <p className="text-sm text-muted">No notices recorded for {refNo}.</p> : (
        <ul className="divide-y divide-line">{q.data.map((g) => (
          <li key={g.key} className="py-3 first:pt-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-medium text-ink">{g.title}</span>{g.ruleId && <Badge tone="neutral" dot={false}>{g.ruleId}{g.ruleName ? ` · ${g.ruleName}` : ''}</Badge>}<span className="text-xs text-muted">{formatDateTime(g.at)}</span></div>
            <p className="text-xs text-muted">{g.body}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">{g.delivery.map((d) => <Badge key={d.channel} tone={tone(d.state)} dot={false}>{d.channel}: {d.state}{d.at ? ` · ${formatDateTime(d.at)}` : ''}</Badge>)}</div>
            {g.requiresAck && <p className={cn('mt-1 text-xs font-medium', g.ackAt ? 'text-success' : 'text-danger')}>{g.ackAt ? `Acknowledged by ${g.ackByName} · ${formatDateTime(g.ackAt)}` : 'Not acknowledged yet'}{g.repeats != null ? ` · ${g.repeats} SMS repeat${g.repeats === 1 ? '' : 's'} sent ${g.ackAt ? 'before acknowledgment' : 'so far'} (every ${g.repeatMinutes} min until acknowledged)` : ''}</p>}
            <p className="mt-1 text-xs text-ink-2"><span className="font-medium">Recipients ({g.recipients.length}):</span> {g.recipients.map((r) => `${r.name}${r.role ? ` (${r.role})` : ''}${r.read ? ' ✓ read' : ''}`).join(', ')}</p>
          </li>))}</ul>)}
    </Card>
  );
}

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
