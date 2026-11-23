import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Ban, CheckCircle2, ChevronRight, Download, FileText, History, Mail, Printer, Search, ShieldOff, Unlock } from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';
import { creditUtilisation, todayManila, formatDate, formatDateTime, formatPhp, holdLiftTier, nextCollectionStage, soaWindow, type CollectionStage, type GateAction } from '../../lib/shared';
import {
  ApprovalTimeline, Badge, Banner, Button, Card, CardHeader, ConfirmDialog, DataTable, DatePicker, Drawer, EmptyState, FormGrid, Input, KpiTile, Modal, MoneyText, PageHeader, Select, Stack, StatusBadge, Textarea, cn, userText, type ColumnDef,
} from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, useAction, useData, useRefLookups } from '../../shared/hooks';
import { Crumb, ScreenTag } from '../../shared/components';
import { DocFooter, DocHeader, PrintPreview } from '../../shared/print';

const today = () => todayManila(); // Manila calendar day (was the UTC day — the as-of date showed yesterday before 08:00 Manila)
const lnk = 'font-medium text-brand-600 hover:underline';
const pendingTag = (_q: string) => <Badge tone="warning" dot={false}>proposed default</Badge>;

// ── SCR-38 Client Status Inquiry (DBL-CNC-001/002/003/004) ─────────────────
export function ClientStatusPage() {
  const [sp, setSp] = useSearchParams();
  const code = sp.get('client') ?? '';
  const [q, setQ] = useState('');
  const { userName, setting, ref } = useRefLookups();
  const search = useData(['credit-search', q], () => api.credit.search(q), q.trim().length > 0);
  const data = useData(['credit-status', code], () => api.credit.status(code), !!code);
  const { can } = useAuth();
  const [lift, setLift] = useState(false);
  const [basis, setBasis] = useState({ basis: 'Balance settled', arrangement: '' });
  const [hold, setHold] = useState(false);
  const [h, setH] = useState({ reason: '', effectiveDate: today(), approvedBy: '' });
  const [ov, setOv] = useState<{ action: GateAction; label: string; reason: string; validUntil: string } | null>(null);
  const req = useAction(() => api.credit.requestHoldLift(code, basis.basis, basis.arrangement), { success: 'Hold-lift request submitted for tiered approval', onSuccess: () => setLift(false) });
  const manual = useAction(() => api.credit.manualHold(code, h), { success: 'Client placed on hold', onSuccess: () => { setHold(false); setH({ reason: '', effectiveDate: today(), approvedBy: '' }); } });
  const ovr = useAction(() => api.credit.requestOverride(code, ov!.action, ov!.reason, ov!.validUntil), { success: 'Override request sent to the C&C Manager', onSuccess: () => setOv(null) });
  const d = data.data;
  const t1 = Number(setting('cnc.tier1_max') ?? 100000), t2 = Number(setting('cnc.tier2_max') ?? 500000);
  const tier = d ? holdLiftTier(d.outstanding, t1, t2) : null;
  const util = d ? creditUtilisation(d.exposure, d.creditLimit) : null;
  const blocked = d && ['On Hold', 'Blacklisted', 'Inactive'].includes(d.standing);
  const approvers = (ref?.users ?? []).filter((u) => u.roles.some((r) => r === 'CNC_MANAGER' || r === 'FINANCE_MANAGER'));
  const primary = d?.client.contacts.find((c) => c.isPrimary) ?? d?.client.contacts[0];
  const pendingLift = d?.liftRequests.find((w) => w.status === 'Pending');
  const rescueGate = d?.gates.find((g) => /rescue/i.test(g.label));
  const pick = (c: string) => { setSp({ client: c }); setQ(''); };
  return (
    <>
      <PageHeader title="Client status inquiry" meta={<ScreenTag id="SCR-38" />} description="Single lookup of credit standing used at the point of EWA, gate release, repair or service — the hard credit gate (BR-01, DBL-CNC-001/002). Visible to C&C, Accounting, Finance, Sales/AE and Operations."
        actions={<div className="relative w-96">
          <Input aria-label="Search client" placeholder="Search client name, code or branch…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Search className="pointer-events-none absolute right-3 top-2.5 size-4 text-muted" />
          {q.trim() && (
            <div className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-line bg-surface shadow-lg">
              {search.isLoading ? <p className="p-3 text-sm text-muted">Searching…</p> : search.data?.length ? search.data.map((c) => (
                <button key={c.clientCode} onClick={() => pick(c.clientCode)} className="flex w-full items-center justify-between gap-2 border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-alt">
                  <span><span className="font-medium">{c.clientName}</span><span className="block text-xs text-muted">{c.clientCode} · {c.branchCode} · AE {c.aeName}</span></span><StatusBadge domain="client" value={c.status} />
                </button>)) : <p className="p-3 text-sm text-danger">No match found for “{q}”. Check the spelling, client code or branch.</p>}
            </div>
          )}
        </div>} />
      {!code && <Card><EmptyState title="Search for a client" hint="Type a client name, client code (C-00123) or branch (MNL, CEB, BTG) to see its credit standing and which transactions are allowed." icon={<Search className="size-6" />} /></Card>}
      {data.error && <Banner tone="danger" title={data.error instanceof ApiError && data.error.status === 404 ? 'No match found' : 'Could not load client status'}>{errMessage(data.error)}</Banner>}
      {d && (
        <Stack>
          <div className={cn('flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5', blocked ? 'border-danger-line bg-danger-bg' : d.standing === 'Over Limit' ? 'border-warning-line bg-warning-bg' : 'border-success-line bg-success-bg')}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{d.client.clientCode} · {d.branchName} · AE {d.aeName}</p>
              <p className="text-xl font-bold text-ink">{d.client.clientName}</p>
              <p className="mt-1 flex items-center gap-2 text-sm">{blocked ? <ShieldOff className="size-4 text-danger" /> : <CheckCircle2 className="size-4 text-success" />}<span className={cn('font-semibold', blocked && 'text-danger')}>{d.standing}</span><StatusBadge domain="client" value={d.client.status} /></p>
              {blocked && <p className="mt-1 text-sm text-danger">{d.holdSince ? `Placed on hold ${formatDate(d.holdSince)}: ` : ''}{userText(d.blockReason)}{d.oldestDays > 0 ? ` · now ${d.oldestDays} days overdue` : ''}</p>}
              {primary && <p className="mt-1 text-xs text-muted">Contact: {primary.firstName} {primary.lastName} · {primary.phone} · {primary.email}</p>}
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex flex-wrap gap-2">
                {d.client.status === 'Hold' && can('cnc.hold_lift', 'add') && <Button icon={<Unlock className="size-4" />} onClick={() => setLift(true)} disabled={!!pendingLift} title={pendingLift ? `Request ${pendingLift.id} is already pending approval` : undefined}>Request hold lift</Button>}
                {d.client.status === 'Active' && can('cnc.aging', 'edit') && <Button variant="danger" icon={<Ban className="size-4" />} onClick={() => setHold(true)}>Manual hold</Button>}
                <Link to={`/credit/soa/${code}`}><Button variant="secondary" icon={<FileText className="size-4" />}>Statement / ledger</Button></Link>
              </div>
              {d.client.status === 'Hold' && pendingLift && <p className="text-xs text-muted">Hold-lift request {pendingLift.id} pending approval</p>}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <KpiTile label="Outstanding" value={formatPhp(d.outstanding)} tone={d.outstanding ? 'warning' : 'default'} /><KpiTile label="Days overdue (oldest)" value={d.oldestDays} tone={d.oldestDays > d.threshold ? 'danger' : 'default'} hint={`Auto-hold after ${d.threshold} days`} />
            <KpiTile label="Credit limit" value={d.creditLimit ? formatPhp(d.creditLimit) : '—'} hint="From the accreditation sign-off · source pending confirmation" /><KpiTile label="Exposure" value={formatPhp(d.exposure)} hint={`AR ${formatPhp(d.outstanding)} + on-hire est. ${formatPhp(d.onHireEst)} (${d.unitsOnHire} unit${d.unitsOnHire === 1 ? '' : 's'})`} tone={util?.tone === 'warning' || util?.tone === 'danger' ? util.tone : 'default'} />
            <KpiTile label="E-wallet" value={d.ewallet ? <MoneyText value={d.ewallet.balance} /> : '—'} tone={d.ewallet && d.ewallet.balance < d.ewallet.minimumBalance ? 'danger' : 'default'} hint={d.ewallet ? `min ${formatPhp(d.ewallet.minimumBalance)}` : 'No e-wallet'} />
            <KpiTile label="Cash bond held" value={formatPhp(d.cashBond)} />
          </div>
          <div className="grid items-start gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader title="Hard-gate flags" description="Enforced server-side for every transaction (BR-01)" />
              {blocked && <p className="mb-3 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">Blocked gates: {userText(d.blockReason)}</p>}
              <ul className="space-y-2">{d.gates.map((g) => (
                <li key={g.action} className="rounded-lg border border-line px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{g.label}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {!g.allowed && g.code === 'CREDIT_GATE_BLOCKED' && !g.override && <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => setOv({ action: g.action as GateAction, label: g.label, reason: '', validUntil: today() })}>Request override</Button>}
                      {g.code === 'OVERRIDE' ? <Badge tone="purple">Override</Badge> : g.allowed ? <Badge tone="success">Allowed</Badge> : <Badge tone="danger">Blocked</Badge>}
                    </span>
                  </div>
                  {!g.allowed && (() => { const why = g.code === 'ELIGIBILITY' ? g.reason : g.blockReason ?? g.reason; return blocked && why === d.blockReason ? null : <p className="mt-1 text-xs text-danger">{userText(why)}</p>; })()}
                  {g.override && <p className="mt-1 text-xs text-muted">{g.override.status === 'Pending' ? `Override pending — C&C Manager (${g.override.workflowId})` : `Override until ${formatDate(g.override.validUntil)} · approved by ${userName(g.override.approvedBy)} ${formatDateTime(g.override.approvedAt)}`}</p>}                </li>
              ))}</ul>
              <p className="mt-3 text-xs text-muted">Gate In (returns) is never blocked, including Blacklisted. EWA, gate release, repair and rescue screens show the same reason via the credit-gate banner.</p>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title="Outstanding invoices" description={`Automatic hold when any invoice is more than ${d.threshold} days past due — the hold date is the due date + ${d.threshold + 1} days`} />
              <DataTable data={d.openInvoices} searchable={false} emptyTitle="No open invoices" columns={[{ accessorKey: 'invoiceNo', header: 'Invoice', cell: (c) => <Link className="font-mono text-brand-600 hover:underline" to={`/billing/invoices/${c.getValue()}`}>{c.getValue<string>()}</Link> },
                { accessorKey: 'dueDate', header: 'Due', cell: (c) => formatDate(c.getValue<string>()) }, { accessorKey: 'daysOverdue', header: 'Days overdue', meta: { align: 'right' }, cell: (c) => <span className={cn(c.getValue<number>() > d.threshold && 'font-semibold text-danger')}>{c.getValue<number>()}</span> },
                { accessorKey: 'daysToHold', header: 'To auto-hold', cell: (c) => { const n = c.getValue<number>(); const on = formatDate(c.row.original.holdOn); return n <= 0 ? <Badge tone="danger" dot={false}>Threshold passed</Badge> : n <= 5 ? <Badge tone="warning" dot={false}>in {n} days · {on}</Badge> : <span className="text-xs text-muted">in {n} days · {on}</span>; } },
                { accessorKey: 'balance', header: 'Balance', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) }]} />
            </Card>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader title="Credit-limit utilisation" description="Exposure ÷ credit limit (DBL-CNC-001)" />
              {util?.pct == null ? <p className="text-sm text-muted">No credit limit set.</p> : <>
                <div className="mb-1 flex justify-between text-sm"><span>{formatPhp(d.exposure)} of {formatPhp(d.creditLimit)}</span><strong>{util.pct}%</strong></div>
                <div className="h-2 rounded-full bg-surface-alt"><div className={cn('h-2 rounded-full', util.tone === 'danger' ? 'bg-danger' : util.tone === 'warning' ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.min(100, util.pct)}%` }} /></div>
                <p className="mt-2 text-xs text-muted">Exposure = open AR + on-hire estimate ({d.unitsOnHire} unit{d.unitsOnHire === 1 ? '' : 's'} on hire × each unit's contract daily rate × 7 days, the same rates as billing{d.unitRateMissing ? `; ${d.unitRateMissing} unit(s) without a contract rate counted at ₱1,000/day` : ''}). Definition and limit source pending confirmation.</p></>}
            </Card>
            <Card>
              <CardHeader title="Eligibility & collection" />
              <p className="mb-1 text-xs text-muted">Transaction types enabled on the client profile</p>
              <div className="mb-3 flex flex-wrap gap-1">{([['Long-term lease', d.client.allowLt], ['Short-term lease', d.client.allowSt], ['Online EWA', d.client.allowOnline], ['Special', d.client.allowSpecial], ['Rescue', d.client.allowRescue]] as const).map(([l, on]) => {
                const held = on && l === 'Rescue' && rescueGate && !rescueGate.allowed;
                return <Badge key={l} tone={held ? 'warning' : on ? 'success' : 'neutral'} dot={false}>{l} {held ? '— blocked by credit gate' : on ? '✓' : '✕'}</Badge>;
              })}</div>
              <p className="text-sm">Collection stage <StatusBadge domain="collection" value={d.collection.stage} />{d.collection.nextActionDue && <span className="ml-1 text-xs text-muted">next {formatDate(d.collection.nextActionDue)}</span>}</p>
              <p className="mt-1 text-xs text-muted">SOA last sent {d.collection.lastSoaSentAt ? formatDate(d.collection.lastSoaSentAt) : '—'} · acknowledged {d.collection.acknowledgedAt ? formatDate(d.collection.acknowledgedAt) : '—'}</p>
            </Card>
            <Card>
              <CardHeader title="Related records" />
              <ul className="space-y-1.5 text-sm">
                <li><Link className={lnk} to={`/credit/soa/${code}`}>Transaction ledger / SOA (running balance) →</Link></li>
                <li><Link className={lnk} to="/credit/aging">Aging receivables & collection →</Link></li>
                <li><Link className={lnk} to={`/ewallet/${code}`}>E-wallet & cash bond ledger →</Link></li>
                <li><Link className={lnk} to={`/clients/${code}`}>Client profile →</Link></li>
              </ul>
            </Card>
          </div>
          {/* Review 1.2: contract status / expiry and units on hire (the gate depends on them), credit term, last payment, and items still to land. */}
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Contract, terms & payments" description={`As of ${formatDateTime(d.asOf)}`} />
              {d.contracts.length ? <ul className="mb-3 divide-y divide-line text-sm">{d.contracts.map((k) => (
                <li key={k.contractNo} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><Link className="font-mono text-brand-600 hover:underline" to={`/contracts/${k.contractNo}`}>{k.contractNo}</Link>
                  <span className="flex items-center gap-2 text-xs text-muted">{k.expiryDate ? `expires ${formatDate(k.expiryDate)}` : 'no fixed expiry'} · {k.creditTermDays} days<StatusBadge domain="contract" value={k.status} />{k.expired && k.status !== 'Expired' && <Badge tone="danger" dot={false}>expired</Badge>}</span></li>))}</ul>
                : <p className="mb-3 text-sm text-danger">No contract on record — EWA and gate release need an active contract.</p>}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted">Units on hire</dt><dd className="text-right font-medium">{d.unitsOnHire}</dd>
                <dt className="text-muted">Credit term</dt><dd className="text-right font-medium">{d.creditTermDays != null ? `${d.creditTermDays} days` : '—'}</dd>
                <dt className="text-muted">Last payment</dt><dd className="text-right font-medium">{d.lastPayment ? <><Link className={lnk} to={`/billing/receipts?receipt=${d.lastPayment.receiptNo}`}>{d.lastPayment.orNo}</Link> · {formatPhp(d.lastPayment.amount)} · {formatDate(d.lastPayment.date)}</> : '—'}</dd>
              </dl>
            </Card>
            <Card>
              <CardHeader title="Pending items that will change the standing" description="Not yet in the outstanding balance" />
              {d.pending.receipts.length + d.pending.creditMemos.length + d.pending.debitMemos.length === 0 ? <p className="text-sm text-muted">Nothing pending.</p> : <ul className="divide-y divide-line text-sm">
                {d.pending.receipts.map((x) => <li key={x.receiptNo} className="flex flex-wrap justify-between gap-2 py-1.5"><span>Payment awaiting Treasury clearance <Link className={cn(lnk, 'font-mono')} to={`/billing/receipts?receipt=${x.receiptNo}`}>{x.receiptNo}</Link>{x.pdc && x.checkDate ? <span className="text-xs text-muted"> · PDC dated {formatDate(x.checkDate)}</span> : null}</span><span className="tabular text-success">−{formatPhp(x.amount)}</span></li>)}
                {d.pending.creditMemos.map((x) => <li key={x.memoNo} className="flex flex-wrap justify-between gap-2 py-1.5"><span>Credit memo <Link className={cn(lnk, 'font-mono')} to={`/billing/memos?memo=${x.memoNo}`}>{x.memoNo}</Link> <span className="text-xs text-muted">{x.status === 'Approved' ? 'approved, not applied' : 'pending approval'}{x.invoiceNo ? ` · ${x.invoiceNo}` : ''}</span></span><span className="tabular text-success">−{formatPhp(x.amount)}</span></li>)}
                {d.pending.debitMemos.map((x) => <li key={x.memoNo} className="flex flex-wrap justify-between gap-2 py-1.5"><span>Debit memo <Link className={cn(lnk, 'font-mono')} to={`/billing/memos?memo=${x.memoNo}`}>{x.memoNo}</Link> <span className="text-xs text-muted">{x.status.toLowerCase()}{x.invoiceNo ? ` · ${x.invoiceNo}` : ''}</span></span><span className="tabular text-danger">+{formatPhp(x.amount)}</span></li>)}
              </ul>}
            </Card>
          </div>
          {d.client.status === 'Hold' && tier && (
            <Card>
              <CardHeader title="Hold-lift approval route" description="Tiered by outstanding balance (DBL-CNC-004 / BR-03). Approvals are decided in the Inbox." actions={<Link className={lnk} to="/approvals">Open approvals →</Link>} />
              <div className="grid gap-2 sm:grid-cols-3">{[{ n: 1, l: `Up to ${formatPhp(t1)}`, r: 'Officer 1' }, { n: 2, l: `Up to ${formatPhp(t2)}`, r: 'Officer 1 + Finance Manager' }, { n: 3, l: `${formatPhp(Number(setting('cnc.tier3_min') ?? 1000000))} and above`, r: 'Officers 1, 2 and 3' }].map((x) => (
                <div key={x.n} className={cn('rounded-lg border p-3 text-sm', tier.tier === x.n ? 'border-brand-300 bg-brand-50' : 'border-line')}><p className="font-semibold">Tier {x.n} {tier.tier === x.n && <Badge tone="brand" dot={false}>this client</Badge>}</p><p className="text-muted">{x.l}</p><p>{x.r}</p></div>))}</div>
              {d.outstanding > t2 && d.outstanding < 1000000 && <p className="mt-2 text-xs text-warning">₱500k–₱1M is not covered by the approval tiers; routed to Tier 3 {pendingTag('Q-CNC-02')}</p>}
            </Card>
          )}
          {!!d.liftRequests.length && <Card><CardHeader title="Hold-lift requests" />{d.liftRequests.map((w) => { const st = w.steps[w.currentStep]; const esc = w.status === 'Pending' && st?.dueAt && st.dueAt < new Date().toISOString(); return <div key={w.id} className="mb-4"><p className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted">{w.id} · {formatDateTime(w.requestedAt)} · {formatPhp(w.amount)} · {st?.label} · <StatusBadge domain="approval" value={w.status} />{esc && <Badge tone="warning" icon={<AlertTriangle className="size-3" />}>Escalated — no action since {formatDateTime(st.dueAt)}</Badge>}</p><ApprovalTimeline workflow={w} userName={userName} /></div>; })}</Card>}
          <Card><CardHeader title="Hold history" description="Each hold and lift with reason, approvers and dates" />{d.holdEvents.length ? <ul className="divide-y divide-line">{d.holdEvents.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
              <span><Badge tone={e.type === 'Reactivated' ? 'success' : 'danger'} dot={false}>{e.type === 'Reactivated' ? 'Lifted' : e.type}</Badge> <span className="ml-2">{userText(e.reason) ?? (e.invoiceNo ? `${e.invoiceNo} · ${e.daysOverdue} days overdue` : '')}</span>{e.approvedBy && <span className="ml-2 text-xs text-muted">approved by {e.approvedBy.split(', ').map((x) => userName(x)).join(', ')}</span>}</span>
              <span className="text-muted">{e.effectiveDate ? `effective ${formatDate(e.effectiveDate)} · ` : ''}{formatDateTime(e.at)} · {userName(e.by)} · {formatPhp(e.outstanding)}</span>
            </li>))}</ul> : <p className="text-sm text-muted">No holds on record.</p>}</Card>
        </Stack>
      )}
      <Modal open={lift} onClose={() => setLift(false)} title="Request hold lift" description="Tiered by outstanding balance (BR-03)" footer={<><Button variant="secondary" onClick={() => setLift(false)}>Cancel</Button><Button loading={req.isPending} disabled={basis.basis !== 'Balance settled' && !basis.arrangement.trim()} onClick={() => req.mutate(undefined)}>Submit for approval</Button></>}>
        {d && tier && <Stack>
          <div className="rounded-lg border border-line p-3 text-sm"><p>Outstanding balance <strong>{formatPhp(d.outstanding)}</strong></p><p className="mt-1">Approval route: <Badge tone="brand" dot={false}>{tier.label}</Badge></p>
            {d.outstanding > t2 && d.outstanding < 1000000 && <p className="mt-2 text-xs text-warning">₱500k–₱1M is not covered by the approval tiers; routed to Tier 3 per proposed default.</p>}</div>
          <Select label="Basis" required value={basis.basis} onChange={(e) => setBasis({ ...basis, basis: e.target.value })} options={['Balance settled', 'Payment arrangement confirmed'].map((x) => ({ value: x, label: x }))} />
          {basis.basis !== 'Balance settled' && <Textarea label="Payment arrangement details" required value={basis.arrangement} onChange={(e) => setBasis({ ...basis, arrangement: e.target.value })} placeholder="e.g. ₱50,000 monthly for 3 months starting Nov 15" />}
          <p className="text-xs text-muted">Any rejection keeps the account On Hold. Steps not acted on within the escalation window are escalated. You cannot approve your own request.</p>
          {req.error && <Banner tone="danger">{errMessage(req.error)}</Banner>}
        </Stack>}
      </Modal>
      <Modal open={hold} onClose={() => setHold(false)} title="Place client on hold" description="Manual hold (DBL-CNC-003) — C&C officers/managers only. Blocks chassis release, gate pass, repair scheduling and new services; notifies C&C, Operations, Sales/AE and the client."
        footer={<><Button variant="secondary" onClick={() => setHold(false)}>Cancel</Button><Button variant="danger" loading={manual.isPending} disabled={!h.reason.trim() || !h.approvedBy || !h.effectiveDate} onClick={() => manual.mutate(undefined)}>Place on hold</Button></>}>
        <Stack>
          <Textarea label="Reason" required value={h.reason} onChange={(e) => setH({ ...h, reason: e.target.value })} placeholder="e.g. bounced check CHK-00112; repeated broken payment promises" />
          <FormGrid><Input label="Effective date" type="date" required max={today()} value={h.effectiveDate} onChange={(e) => setH({ ...h, effectiveDate: e.target.value })} />
            <Select label="Authorised by" required value={h.approvedBy} onChange={(e) => setH({ ...h, approvedBy: e.target.value })} placeholder="Select" options={approvers.map((u) => ({ value: u.userId, label: u.name }))} /></FormGrid>
          <p className="text-xs text-muted">Appears in the hold history as “Manual Hold” with reason, effective date, authoriser and who recorded it.</p>
          {manual.error && <Banner tone="danger">{errMessage(manual.error)}</Banner>}
        </Stack>
      </Modal>
      <Modal open={!!ov} onClose={() => setOv(null)} title={`Request override — ${ov?.label ?? ''}`} description="DBL-CNC-001 authorised override of one blocked gate, time-boxed."
        footer={<><Button variant="secondary" onClick={() => setOv(null)}>Cancel</Button><Button loading={ovr.isPending} disabled={!ov?.reason.trim() || !ov?.validUntil} onClick={() => ovr.mutate(undefined)}>Submit for approval</Button></>}>
        {ov && <Stack>
          <Textarea label="Business reason" required value={ov.reason} onChange={(e) => setOv({ ...ov, reason: e.target.value })} placeholder="e.g. client paid today, receipt clearing; urgent vessel cut-off" />
          <Input label="Valid until" type="date" required min={today()} value={ov.validUntil} onChange={(e) => setOv({ ...ov, validUntil: e.target.value })} />
          <p className="text-sm">Approval path: <Badge tone="brand" dot={false}>C&amp;C Manager</Badge> {pendingTag('Q-CNC-07')}</p>
          <p className="text-xs text-muted">Approver and date are recorded on the gate; the override lapses automatically after the valid-until date.</p>
          {ovr.error && <Banner tone="danger">{errMessage(ovr.error)}</Banner>}
        </Stack>}
      </Modal>
    </>
  );
}

// ── SCR-39 Aging Receivables & Collection Dashboard (DBL-RPT-015 / DBL-CNC-005/006/009/010) ──
type Filters = { asOf: string; branch: string; ae: string; status: string; stage: string; bucket: string; includeZero: boolean };
const BUCKETS = [['current', 'Current'], ['d1_30', '1–30'], ['d31_60', '31–60'], ['d61_90', '61–90'], ['d91_180', '91–180'], ['d180', 'Over 180']] as const;
export function AgingPage() {
  const [f, setF] = useState<Filters>({ asOf: today(), branch: '', ae: '', status: '', stage: '', bucket: '', includeZero: false });
  const data = useData(['aging', f.asOf, f.includeZero], () => api.credit.aging({ asOf: f.asOf, includeZero: f.includeZero }));
  const nav = useNavigate();
  const { can } = useAuth();
  const { userName, branchOptions, ref } = useRefLookups();
  const [next, setNext] = useState<{ code: string; name: string; from: CollectionStage; to: CollectionStage; total: number; notes: string } | null>(null);
  const [hist, setHist] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [ct, setCt] = useState({ channel: 'Phone', notes: '', promiseDate: '', promiseAmount: 0 });
  const logC = useAction(() => api.credit.logContact(hist!, { channel: ct.channel, notes: ct.notes, promiseDate: ct.promiseDate || undefined, promiseAmount: ct.promiseAmount || undefined }), { success: 'Contact logged', onSuccess: () => setCt({ channel: 'Phone', notes: '', promiseDate: '', promiseAmount: 0 }) });
  const adv =useAction(() => api.credit.advanceCollection(next!.code, next!.notes, letterText(next!)), { success: (cc) => (cc.pendingApproval ? 'Demand letter submitted for C&C Manager approval' : `Collection stage → ${cc.stage}`), onSuccess: () => setNext(null) });
  const d = data.data;
  type Row = NonNullable<typeof d>['clients'][number];
  const rows = useMemo(() => (d?.clients ?? []).filter((c) => (!f.branch || c.branchCode === f.branch) && (!f.ae || c.ae === f.ae) && (!f.status || c.status === f.status) && (!f.stage || c.stage === f.stage) && (!f.bucket || (c[f.bucket as keyof Row] as number) > 0)), [d, f]);
  const sum = (k: (typeof BUCKETS)[number][0] | 'total') => rows.reduce((a, c) => a + c[k], 0);
  const h = d?.clients.find((c) => c.clientCode === hist);
  const forbidden = data.error instanceof ApiError && data.error.status === 403;
  const exportXls = () => {
    const head = ['Client', 'Code', 'Branch', 'AE', 'Class', 'Status', ...BUCKETS.map((b) => b[1]), 'Total', 'Stage', 'Credit limit', 'Credit term (days)', 'Collection owner', 'Last contact', 'Promise to pay'];
    const body = rows.map((c) => [c.clientName, c.clientCode, c.branchCode, userName(c.ae), c.classification, c.status, ...BUCKETS.map((b) => c[b[0]]), c.total, c.stage, c.creditLimit ?? '', c.creditTermDays ?? '', c.owner ? userName(c.owner) : '', c.lastContactAt?.slice(0, 10) ?? '', c.promiseToPay ? `${c.promiseToPay.amount} by ${c.promiseToPay.date}` : '']);
    const html = `<table><tr>${head.map((x) => `<th>${x}</th>`).join('')}</tr>${body.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</table>`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel' })); a.download = `aging-receivables-${f.asOf}.xls`; a.click();
  };
  // Table fits the 1600 px page (UI/UX re-audit): branch, class and status sit under the client name; e-wallet/memo effect under
  // Total; SOA sent/ack under the stage. Bucket cells drop the repeated '₱' (the column total in the heading carries it) and the
  // filtered totals sit under each heading so they line up with their columns. The Excel export keeps every field.
  const amt = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const head = (l: string, v: number) => () => <span className="flex flex-col items-end leading-tight"><span>{l}</span><span className="tabular text-[11px] font-semibold normal-case tracking-normal text-ink-2" title={`Total ${l} for the ${rows.length} clients shown`}>{formatPhp(v)}</span></span>;
  const money = (k: (typeof BUCKETS)[number][0], cls?: (v: number) => string | false): ColumnDef<Row> => ({ accessorKey: k, header: head(BUCKETS.find((b) => b[0] === k)![1], sum(k)), meta: { align: 'right' }, cell: (c) => { const v = c.getValue<number>(); return v ? <span className={cn('tabular', cls?.(v))}>{amt(v)}</span> : <span className="text-disabled">—</span>; } });
  const cols: ColumnDef<Row>[] = [
    { accessorKey: 'clientName', header: 'Client', meta: { wrap: true }, cell: (c) => { const r = c.row.original; return <div className="min-w-48">
      <p className="font-medium">{c.getValue<string>()}</p>
      <p className="whitespace-nowrap text-xs text-muted">{r.clientCode} · {r.branchCode} · AE {userName(r.ae)}</p>
      <p className="whitespace-nowrap text-[11px] text-muted" title="Credit limit and contract credit term">Limit {r.creditLimit ? formatPhp(r.creditLimit) : '—'}{r.creditLimit ? ` (${Math.round((r.total / r.creditLimit) * 1000) / 10}% used by AR)` : ''} · {r.creditTermDays != null ? `${r.creditTermDays}-day term` : 'term —'}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-1"><StatusBadge domain="client" value={r.status} />{r.classification !== 'Regular' && <Badge tone="purple" dot={false}>{r.classification}</Badge>}{r.liftTier && <span className="text-[11px] text-muted">Lift: {r.liftTier.split(' — ')[0]}</span>}</div></div>; } },
    money('current'), money('d1_30'), money('d31_60', (v) => v > 0 && 'text-warning'), money('d61_90', (v) => v > 0 && 'text-danger'), money('d91_180', (v) => v > 0 && 'font-semibold text-danger'), money('d180', (v) => v > 0 && 'font-semibold text-danger'),
    { accessorKey: 'total', header: head('Total', sum('total')), meta: { align: 'right' }, cell: (c) => { const r = c.row.original; return <div><MoneyText value={c.getValue<number>()} strong />
      <div className="whitespace-nowrap text-[11px] leading-snug text-muted" title="Not included in the AR total, which is open invoice balances only">
        {r.ewalletBalance != null && <p>E-wallet balance <MoneyText value={r.ewalletBalance} /></p>}
        {r.cmUnapplied ? <p>CM approved, not applied −{formatPhp(r.cmUnapplied)}</p> : null}
        {r.dmOutstanding ? <p>DM posted, not invoiced +{formatPhp(r.dmOutstanding)}</p> : null}
        {r.dmFromWallet ? <p>DM paid from e-wallet {formatPhp(r.dmFromWallet)}</p> : null}</div></div>; } },
    { accessorKey: 'stage', header: 'Stage / SOA', meta: { wrap: true }, cell: (c) => { const r = c.row.original; const w = soaWindow(r.acknowledgedAt); return <div className="min-w-44 text-xs">
      <div className="flex flex-wrap items-center gap-1"><StatusBadge domain="collection" value={c.getValue<string>()} />{r.actionOverdueDays > 0 && <Badge tone="danger" dot={false}>Overdue {r.actionOverdueDays}d</Badge>}</div>
      {r.pendingDemand && <p className="mt-0.5 text-warning">Demand letter awaiting approval</p>}{r.nextActionDue && <p className="mt-0.5 text-muted">Next action {formatDate(r.nextActionDue)}</p>}
      <p className="mt-0.5 text-muted">{r.lastSoaSentAt ? `SOA ${formatDate(r.lastSoaSentAt)} · ${r.acknowledgedAt ? `ack ${formatDate(r.acknowledgedAt)} · ${w.status === 'Within window' ? `${w.daysLeft}d left` : w.status}` : 'not acknowledged'}` : 'SOA not sent'}</p>
      <p className="mt-0.5 text-muted">Owner {r.owner ? userName(r.owner) : '—'} · last contact {r.lastContactAt ? formatDate(r.lastContactAt) : '—'}</p>
      {r.promiseToPay && <p className={cn('mt-0.5', r.promiseToPay.date < today() ? 'font-medium text-danger' : 'text-success')}>Promise to pay {formatPhp(r.promiseToPay.amount)} by {formatDate(r.promiseToPay.date)}{r.promiseToPay.date < today() ? ' — broken' : ''}</p>}</div>; } },
    { id: 'a', header: '', cell: (c) => { const r = c.row.original; const to = nextCollectionStage(r.stage); const canNext = to && !r.pendingDemand && r.total - r.current > 0 && can('cnc.aging', 'edit'); return <div className="flex items-center gap-1">
      <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); nav(`/credit/soa/${r.clientCode}`); }}>Ledger / SOA</Button>
      <Button size="sm" variant="secondary" className="shrink-0" aria-label="Collection history" icon={<History className="size-4 shrink-0" />} onClick={(e) => { e.stopPropagation(); setHist(r.clientCode); }}>History</Button>
      {canNext ? <Button size="sm" variant="ghost" className="w-8! shrink-0 px-0!" aria-label={`Move to next stage: ${to === 'Demand Letter' ? 'Demand letter' : to}`} title={`Move to next stage: ${to === 'Demand Letter' ? 'Demand letter' : to}`} icon={<ChevronRight className="size-4 shrink-0" />} onClick={(e) => { e.stopPropagation(); setNext({ code: r.clientCode, name: r.clientName, from: r.stage, to: to!, total: r.total, notes: '' }); }} /> : <span className="w-8" aria-hidden />}</div>; } },
  ];
  if (forbidden) return <><PageHeader title="Aging receivables & collection" meta={<ScreenTag id="SCR-39" />} /><Card><EmptyState title="You don't have access to Aging & Collection" hint="Ask your administrator for the cnc.aging permission (C&C, Accounting, Treasury, Finance)." icon={<ShieldOff className="size-6" />} /></Card></>;
  return (
    <>
      <PageHeader title="Aging receivables & collection" meta={<ScreenTag id="SCR-39" />} description="Portfolio aging (DBL-RPT-015 / DBL-CNC-005), the collection ladder SOA → 1st reminder (day 5) → 2nd reminder → demand letter (DBL-CNC-006), and tiered hold reactivation (₱100k / ₱500k / ₱1M+)."
        actions={<div className="flex gap-2"><Button variant="secondary" icon={<Download className="size-4" />} onClick={exportXls}>Export Excel</Button><Button variant="secondary" icon={<Printer className="size-4" />} disabled={!d} onClick={() => setPrinting(true)}>Print / PDF</Button></div>} />
      {/* Print copy: landscape report document (header, scope, summary, buckets, by branch, every filtered client, totals) — not the screen. */}
      {d && (() => {
        const td = 'border border-black/30 px-1.5 py-0.5', num = cn(td, 'text-right tabular');
        const scope = [`As of ${formatDate(f.asOf)}`, branchOptions.find((o) => o.value === f.branch)?.label ?? 'All branches', f.ae ? `AE ${userName(f.ae)}` : 'All AEs', f.status || 'All statuses', f.stage || 'All stages', f.bucket ? `Bucket ${BUCKETS.find((b) => b[0] === f.bucket)?.[1]}` : 'Any bucket'].join(' · ');
        return (
          <PrintPreview open={printing} onClose={() => setPrinting(false)} title="Aging receivables & collection" landscape>
            <DocHeader title="AGING RECEIVABLES REPORT" no={`AGING-${f.asOf}`} date={formatDateTime(new Date().toISOString())} extra={<p>{rows.length} client{rows.length === 1 ? '' : 's'}</p>} />
            <p className="mb-2"><span className="font-semibold">Scope:</span> {scope}</p>
            <table className="mb-3 w-full border-collapse"><thead><tr className="bg-black/5">{['Total AR', 'Overdue AR', '% overdue', 'Clients on hold', 'Lift requests pending', 'Actions overdue'].map((x) => <th key={x} className={cn(td, 'text-right')}>{x}</th>)}</tr></thead>
              <tbody><tr><td className={num}>{formatPhp(d.total.total)}</td><td className={num}>{formatPhp(d.overdue)}</td><td className={num}>{d.total.total ? `${Math.round((d.overdue / d.total.total) * 100)}%` : '—'}</td><td className={num}>{d.onHold}</td><td className={num}>{d.pendingLifts}</td><td className={num}>{d.actionsOverdue}</td></tr></tbody></table>
            <div className="mb-3 grid grid-cols-[2fr_3fr] gap-4 break-inside-avoid [&_table]:text-[10.5px] [&_th]:whitespace-nowrap">
              <div><p className="mb-1 font-semibold">Portfolio buckets</p><table className="w-full border-collapse"><tbody>
                {BUCKETS.map(([k, l]) => <tr key={k}><td className={td}>{l}</td><td className={num}>{formatPhp(d.total[k])}</td><td className={num}>{d.total.total ? `${Math.round((d.total[k] / d.total.total) * 100)}%` : '—'}</td></tr>)}
                <tr className="font-semibold"><td className={td}>Total</td><td className={num}>{formatPhp(d.total.total)}</td><td className={num}>100%</td></tr></tbody></table></div>
              <div><p className="mb-1 font-semibold">Aging buckets by branch</p><table className="w-full border-collapse"><thead><tr className="bg-black/5"><th className={cn(td, 'text-left')}>Branch</th>{BUCKETS.map(([k, l]) => <th key={k} className={cn(td, 'text-right')}>{l}</th>)}<th className={cn(td, 'text-right')}>Total</th></tr></thead>
                <tbody>{d.byBranch.map((b) => <tr key={b.branch}><td className={td}>{b.branch}</td>{BUCKETS.map(([k]) => <td key={k} className={num}>{amt(b[k])}</td>)}<td className={cn(num, 'font-semibold')}>{amt(BUCKETS.reduce((a, [k]) => a + b[k], 0))}</td></tr>)}</tbody></table></div>
            </div>
            <table className="w-full border-collapse text-[10.5px]"><thead><tr className="bg-black/5">{['Client', 'Branch', 'AE', 'Status', ...BUCKETS.map((b) => b[1]), 'Total', 'Stage'].map((x, i) => <th key={x} className={cn(td, i >= 4 && i <= 10 ? 'text-right' : 'text-left')}>{x}</th>)}</tr></thead>
              <tbody>{rows.map((r) => <tr key={r.clientCode}><td className={td}>{r.clientName}<span className="block text-[9.5px] text-black/60">{r.clientCode}</span></td><td className={td}>{r.branchCode}</td><td className={td}>{userName(r.ae)}</td><td className={td}>{r.status}</td>{BUCKETS.map(([k]) => <td key={k} className={num}>{r[k] ? amt(r[k]) : '—'}</td>)}<td className={cn(num, 'font-semibold')}>{amt(r.total)}</td><td className={td}>{r.stage === 'Demand Letter' ? 'Demand letter' : r.stage}{r.actionOverdueDays > 0 ? ` · overdue ${r.actionOverdueDays}d` : ''}</td></tr>)}</tbody>
              <tfoot><tr className="font-semibold"><td className={td} colSpan={4}>Total ({rows.length} client{rows.length === 1 ? '' : 's'})</td>{BUCKETS.map(([k]) => <td key={k} className={num}>{amt(sum(k))}</td>)}<td className={num}>{formatPhp(sum('total'))}</td><td className={td} /></tr></tfoot></table>
            <p className="mt-2 text-[10px]">Amounts in ₱. Buckets by days past due as of {formatDate(f.asOf)}; totals reflect the filters above.</p>
            <DocFooter copy="AGING RECEIVABLES REPORT" />
          </PrintPreview>
        );
      })()}
      {data.error && <Banner tone="danger" className="mb-4" title="Aging could not be loaded" actions={<Button size="sm" variant="secondary" onClick={() => data.refetch()}>Retry</Button>}>{errMessage(data.error)}</Banner>}
      <div className="mb-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="Total AR" value={formatPhp(d?.total.total)} /><KpiTile label="Overdue AR" value={formatPhp(d?.overdue)} tone="danger" />
        <KpiTile label="% overdue" value={d?.total.total ? `${Math.round(((d.overdue) / d.total.total) * 100)}%` : '—'} tone="warning" />
        <KpiTile label="Clients on hold" value={d?.onHold ?? '—'} tone="danger" onClick={() => setF({ ...f, status: 'Hold' })} hint="Filter the table" />
        <KpiTile label="Lift requests pending" value={d?.pendingLifts ?? '—'} onClick={() => nav('/approvals')} hint="Open the approval queue" />
        <KpiTile label="Actions overdue" value={d?.actionsOverdue ?? '—'} tone={d?.actionsOverdue ? 'danger' : 'default'} hint="Stage action past its due date" />
      </div>
      {!!d?.liftQueue.length && <Card className="mb-5"><CardHeader title="Hold-lift approval queue" actions={<Link className={lnk} to="/approvals">Open in Inbox →</Link>} />
        <ul className="divide-y divide-line">{d.liftQueue.map((w) => <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span><Link className={lnk} to={`/credit/status?client=${w.clientCode}`}>{w.clientName}</Link> · {formatPhp(w.amount)} · <Badge tone="brand" dot={false}>{w.tier}</Badge></span>{w.escalated ? <Badge tone="warning" icon={<AlertTriangle className="size-3" />}>Escalated — due {formatDateTime(w.dueAt)}</Badge> : <span className="text-xs text-muted">due {formatDateTime(w.dueAt)}</span>}</li>)}</ul></Card>}
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Aging buckets by branch" />
          {/* Rendered only once the data is in, without bar animation: animating from the empty loading state left the stacks
              drawn at their initial (pre-measure) width at the left edge, offset from the branch labels. */}
          <div className="h-72">{d?.byBranch.length ? <ResponsiveContainer width="100%" height="100%"><BarChart key={d.byBranch.map((b) => b.branch).join()} data={d.byBranch} barCategoryGap="30%" maxBarSize={72}><CartesianGrid stroke="#EEF2F6" vertical={false} /><XAxis dataKey="branch" type="category" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(v) => `₱${Math.round(v / 1000)}k`} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip formatter={(v: number) => formatPhp(v)} cursor={{ fill: '#F1F5F9' }} /><Legend />
            {BUCKETS.map(([k, l], i) => <Bar key={k} dataKey={k} name={l} stackId="a" isAnimationActive={false} fill={['#0058A8', '#3878B8', '#F79009', '#DC6803', '#B42318', '#7A271A'][i]} />)}</BarChart></ResponsiveContainer>
            : <p className="flex h-full items-center justify-center text-sm text-muted">{data.isLoading ? 'Loading…' : 'No receivables by branch.'}</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Portfolio buckets" />
          {d && ([['Current', d.total.current, '#0058A8'], ['1–30 days', d.total.d1_30, '#3878B8'], ['31–60 days', d.total.d31_60, '#F79009'], ['61–90 days', d.total.d61_90, '#DC6803'], ['91–180 days', d.total.d91_180, '#B42318'], ['Over 180 days', d.total.d180, '#7A271A']] as const).map(([l, v, col]) => (
            <div key={l} className="mb-3"><div className="mb-1 flex justify-between text-sm"><span>{l}</span><span className="tabular">{formatPhp(v)}</span></div><div className="h-2 rounded-full bg-surface-alt"><div className="h-2 rounded-full" style={{ width: `${d.total.total ? (v / d.total.total) * 100 : 0}%`, background: col }} /></div></div>
          ))}
        </Card>
      </div>
      <DataTable data={rows} loading={data.isLoading} columns={cols} pageSize={10} onRowClick={(r) => nav(`/credit/status?client=${r.clientCode}`)}
        footer={<div className="flex flex-wrap justify-between gap-2 text-[12px]"><span className="text-muted">Column totals for the {rows.length} client{rows.length === 1 ? '' : 's'} shown appear under each bucket heading. Bucket amounts in ₱.</span><span>Total AR shown <span className="tabular font-bold">{formatPhp(sum('total'))}</span></span></div>} rowClassName={(r) => (r.status === 'Hold' ? 'bg-danger-bg/30' : undefined)}
        emptyTitle={d?.clients.length ? 'No clients match the filters' : 'No receivables'} emptyHint={d?.clients.length ? 'Clear a filter to see more clients.' : 'No client has an outstanding balance as of this date.'}
        toolbar={<div className="flex flex-wrap items-end gap-2">
          <Input aria-label="As of" type="date" wrapperClassName="w-44" max={today()} value={f.asOf} onChange={(e) => setF({ ...f, asOf: e.target.value || today() })} />
          <Select aria-label="Branch" wrapperClassName="w-40" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={branchOptions} />
          <Select aria-label="AE" wrapperClassName="w-40" value={f.ae} onChange={(e) => setF({ ...f, ae: e.target.value })} placeholder="All AEs" options={(ref?.users ?? []).filter((u) => u.roles.includes('ACCOUNT_EXECUTIVE')).map((u) => ({ value: u.userId, label: u.name }))} />
          <Select aria-label="Status" wrapperClassName="w-40" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" options={['Active', 'Hold', 'Blacklist', 'Inactive'].map((x) => ({ value: x, label: x }))} />
          <Select aria-label="Stage" wrapperClassName="w-40" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} placeholder="All stages" options={['None', 'SOA Sent', '1st Reminder', '2nd Reminder', 'Demand Letter'].map((x) => ({ value: x, label: x === 'Demand Letter' ? 'Demand letter' : x }))} />
          <Select aria-label="Bucket" wrapperClassName="w-40" value={f.bucket} onChange={(e) => setF({ ...f, bucket: e.target.value })} placeholder="Any bucket" options={BUCKETS.map(([k, l]) => ({ value: k, label: `Has ${l}` }))} />
        </div>} />
      <p className="mt-2 text-xs text-muted">
        Showing {f.includeZero ? 'all' : `clients with an outstanding balance (${d?.withBalance ?? '—'} of ${d?.clientCount ?? '—'})`}. <button className="text-brand-600 hover:underline" onClick={() => setF({ ...f, includeZero: !f.includeZero })}>{f.includeZero ? 'Hide zero-balance clients' : 'Include zero-balance clients'}</button>.
        {f.asOf !== today() && ' As-of view re-buckets invoices issued by that date using current balances.'} The lines under each Total are for reference and are not in the AR total (open invoice balances only): the e-wallet balance (a separate prepaid fund), approved credit memos not yet applied to an invoice, debit memos posted outside an invoice, and debit memos already paid from the e-wallet. Whether posted memos should count in AR <Badge tone="warning" dot={false}>pending decision</Badge>. Buckets use the invoice due date (invoice date + credit term); the SOA column shows the acknowledgment-based 30-day window — which clock governs aging and the auto-hold <Badge tone="warning" dot={false}>pending decision</Badge>. Classification comes from the client's Legal / Collection-agency flags (other classes pending confirmation).
      </p>
      <Drawer open={!!h} onClose={() => setHist(null)} title={`Collection history — ${h?.clientName ?? ''}`}>
        {h && <Stack>
          <p className="text-sm">Current stage <StatusBadge domain="collection" value={h.stage} />{h.nextActionDue && <span className="ml-2 text-muted">next action {formatDate(h.nextActionDue)}</span>}</p>
          {h.actionOverdueDays > 0 && <Banner tone="danger" title="Escalation alert">No action for {h.actionOverdueDays} day(s) after the due date — C&amp;C Manager is alerted after 1–2 days.</Banner>}
          <Card><CardHeader title="Stage history & action log" />{h.history.length ? <ul className="divide-y divide-line">{h.history.map((a, i) => <li key={i} className="py-2 text-sm"><p className="font-medium">{a.action === 'Demand Letter' ? 'Demand letter' : a.action}</p><p className="text-xs text-muted">{formatDateTime(a.at)} · {userName(a.by)}{a.notes ? ` · ${a.notes}` : ''}{a.letter ? ' · letter attached' : ''}</p></li>)}</ul> : <p className="text-sm text-muted">No collection actions yet.</p>}</Card>
          <Card><CardHeader title="SOA send log" />{h.sends.length ? <ul className="divide-y divide-line">{h.sends.map((s) => <li key={s.id} className="py-2 text-sm"><p><span className="font-mono">{s.soaNo}</span> · {s.channel} · {s.to}{s.trackingNo ? ` · ${s.trackingNo}` : ''}</p><p className="text-xs text-muted">{formatDateTime(s.at)} · {userName(s.by)}</p></li>)}</ul> : <p className="text-sm text-muted">SOA not sent yet.</p>}
            <p className="mt-2 text-xs text-muted">Acknowledged {h.acknowledgedAt ? formatDate(h.acknowledgedAt) : '— (30-day window starts at acknowledgment)'}</p></Card>
          {can('cnc.aging', 'edit') && <Card><CardHeader title="Log client contact" description="Call, email or visit — with an optional promise to pay. You become the collection owner if none is set." />
            <Stack>
              <FormGrid><Select label="Channel" value={ct.channel} onChange={(e) => setCt({ ...ct, channel: e.target.value })} options={['Phone', 'Email', 'Visit', 'SMS'].map((x) => ({ value: x, label: x }))} />
                <Input label="Promise-to-pay date" type="date" min={today()} value={ct.promiseDate} onChange={(e) => setCt({ ...ct, promiseDate: e.target.value })} hint="Optional" /></FormGrid>
              {ct.promiseDate && <Input label="Promised amount" type="number" min={0} value={ct.promiseAmount || ''} onChange={(e) => setCt({ ...ct, promiseAmount: Number(e.target.value) })} placeholder="0.00" />}
              <Textarea label="What was discussed" required value={ct.notes} onChange={(e) => setCt({ ...ct, notes: e.target.value })} placeholder="e.g. spoke to AP head; will pay INV-MNL-00001068 on Friday" />
              {logC.error && <Banner tone="danger">{errMessage(logC.error)}</Banner>}
              <div className="flex justify-end"><Button size="sm" loading={logC.isPending} disabled={!ct.notes.trim() || (!!ct.promiseDate && !(ct.promiseAmount > 0))} onClick={() => logC.mutate(undefined)}>Log contact</Button></div>
            </Stack></Card>}
          <Link className={lnk} to={`/credit/soa/${h.clientCode}`}>Open ledger / SOA to send or record acknowledgment →</Link>
        </Stack>}
      </Drawer>
      <Modal open={!!next} onClose={() => setNext(null)} size="lg" title={next ? `Move ${next.name} to “${next.to === 'Demand Letter' ? 'Demand letter' : next.to}”?` : ''} description="Confirm the escalation and review the letter that will be sent."
        footer={<><Button variant="secondary" onClick={() => setNext(null)}>Cancel</Button><Button loading={adv.isPending} onClick={() => adv.mutate(undefined)}>{next?.to === 'Demand Letter' ? 'Submit for approval' : 'Confirm & send'}</Button></>}>
        {next && <Stack>
          <p className="text-sm">From <StatusBadge domain="collection" value={next.from} /> to <StatusBadge domain="collection" value={next.to} /></p>
          {next.to === 'Demand Letter' && <Banner tone="warning" title="Approval required">The demand letter is released only after C&amp;C Manager approval {pendingTag('Q-CNC-06')}.</Banner>}
          <div className="max-h-72 overflow-auto whitespace-pre-line rounded-lg border border-line bg-white p-4 font-serif text-[13px] text-black">{letterText(next)}</div>
          <Textarea label="Notes for the action log" value={next.notes} onChange={(e) => setNext({ ...next, notes: e.target.value })} placeholder="e.g. client promised to pay by Friday" />
          {adv.error && <Banner tone="danger">{errMessage(adv.error)}</Banner>}
        </Stack>}
      </Modal>
    </>
  );
}

function letterText(n: { name: string; to: CollectionStage; total: number }) {
  const title = n.to === 'SOA Sent' ? 'STATEMENT OF ACCOUNT — COVER LETTER' : n.to === '1st Reminder' ? 'FIRST PAYMENT REMINDER' : n.to === '2nd Reminder' ? 'SECOND PAYMENT REMINDER' : 'DEMAND LETTER';
  const body = n.to === 'Demand Letter' ? 'Despite our previous reminders, the above amount remains unpaid. Formal demand is hereby made for full settlement within five (5) days from receipt of this letter; otherwise we will be constrained to endorse the account for legal action.'
    : n.to === 'SOA Sent' ? 'Please find attached your Statement of Account. Kindly review and acknowledge receipt; settlement is expected within 30 days of acknowledgment.'
      : 'Our records show the above amount is past due. We would appreciate settlement at your earliest convenience. Kindly disregard this notice if payment has been made.';
  return `${title}\n\n${formatDate(new Date().toISOString())}\n\n${n.name}\n\nDear Sir/Madam,\n\nOutstanding balance: ${formatPhp(n.total)}\n\n${body}\n\nCredit & Collection\nDelbros Leasing\n\n(Template wording pending Legal/C&C confirmation)`;
}

// ── SOA / client transaction ledger with running balance (DBL-CNC-005/010, docs/12 §5) ──
export function SoaPage() {
  const { code = '' } = useParams();
  const data = useData(['soa', code], () => api.credit.soa(code));
  const { can } = useAuth();
  const { userName, setting } = useRefLookups();
  const payee = String(setting('co.payee_bank') ?? '').trim();
  const [print, setPrint] = useState(false);
  const [send, setSend] = useState<{ channel: 'Email' | 'Courier'; to: string; trackingNo: string } | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const snd = useAction(() => api.credit.sendSoa(code, send!), { success: (s) => `SOA ${s.soaNo} sent by ${s.channel.toLowerCase()}`, onSuccess: () => setSend(null) });
  const ak = useAction((dt: string) => api.credit.acknowledgeSoa(code, dt), { success: 'Acknowledgment recorded — 30-day window started', onSuccess: () => setAck(null) });
  if (data.error) return <><PageHeader breadcrumb={<Crumb items={[{ to: '/credit/aging', label: 'Aging' }, { label: 'SOA' }]} />} title="Statement of account" /><Banner tone="danger" title="SOA generation failed" actions={<Button size="sm" variant="secondary" onClick={() => data.refetch()}>Retry</Button>}>{errMessage(data.error)}</Banner></>;
  if (!data.data) return <p className="text-muted">Loading…</p>;
  const s = data.data;
  const pastDue = s.aging.total - s.aging.current;
  const win = soaWindow(s.acknowledgedAt);
  const addr = [s.client.address1, s.client.address2, s.client.city, s.client.zipCode, s.client.country].filter(Boolean).join(', ');
  const Body = () => (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-4 text-[12px]">
        <div><p className="font-semibold">{s.client.clientName} ({s.client.clientCode})</p><p>{addr}</p><p>Billing: {s.client.billingCycle}</p><p>Contract(s): {s.contracts.length ? s.contracts.join(', ') : '—'}</p></div>
        <div className="text-right"><p>Account status: <strong>{s.client.status}</strong></p><p>Collection stage: <strong>{s.stage === 'Demand Letter' ? 'Demand letter' : s.stage}</strong></p><p>Acknowledged: <strong>{s.acknowledgedAt ? formatDate(s.acknowledgedAt) : 'Not yet'}</strong>{s.acknowledgedAt && ` · ${win.status}${win.daysLeft != null && win.daysLeft >= 0 ? ` (${win.daysLeft} days left)` : ''}`}</p></div>
      </div>
      <table className="mb-3 w-full border border-black/40 text-[12px]"><thead><tr className="bg-black/5">{['Current', '1–30', '31–60', '61–90', '91–180', 'Over 180', 'TOTAL DUE'].map((x) => <th key={x} className="border border-black/30 px-2 py-1 text-right">{x}</th>)}</tr></thead>
        <tbody><tr>{[s.aging.current, s.aging.d1_30, s.aging.d31_60, s.aging.d61_90, s.aging.d91_180, s.aging.d180, s.aging.total].map((v, i) => <td key={i} className={cn('border border-black/30 px-2 py-1 text-right tabular', i === 6 && 'font-bold')}>{formatPhp(v)}</td>)}</tr></tbody></table>
      {s.lines.length ? <table className="w-full border border-black/40 text-[12px]"><thead><tr className="bg-black/5">{['Date', 'Doc type / ref.', 'Doc no.', 'Due', 'Debit', 'Credit', 'Balance'].map((x, i) => <th key={x} className={cn('border border-black/30 px-2 py-1', i >= 4 ? 'text-right' : 'text-left', i === 1 && 'w-60')}>{x}</th>)}</tr></thead>
        <tbody>{s.lines.map((l) => <tr key={l.docType + l.docNo}><td className="whitespace-nowrap border border-black/20 px-2 py-1">{formatDate(l.date)}</td><td className="border border-black/20 px-2 py-1">{l.docType}{l.ref && <span className="block text-[11px] text-black/60">{l.ref}</span>}</td><td className="whitespace-nowrap border border-black/20 px-2 py-1 font-mono">{l.docNo}</td><td className="whitespace-nowrap border border-black/20 px-2 py-1">{formatDate(l.due)}</td><td className="border border-black/20 px-2 py-1 text-right">{l.debit ? formatPhp(l.debit) : ''}</td><td className="border border-black/20 px-2 py-1 text-right">{l.credit ? formatPhp(l.credit) : ''}</td><td className="border border-black/20 px-2 py-1 text-right tabular">{formatPhp(l.balance)}</td></tr>)}</tbody></table>
        : <p className="rounded border border-black/20 px-2 py-4 text-center text-[12px]">No transactions — the account has a zero balance.</p>}
      <p className="mt-2 text-right text-[13px] font-bold">BALANCE DUE {formatPhp(s.aging.total)}{pastDue > 0 && <span className="ml-3 text-danger">Past due {formatPhp(pastDue)}</span>}</p>
      <p className="mt-2 text-[12px]">E-wallet balance {s.ewallet ? formatPhp(s.ewallet.balance) : '—'} (minimum {s.ewallet ? formatPhp(s.ewallet.minimumBalance) : '—'}) · Cash bond held {formatPhp(s.cashBond)}</p>
      <div className="mt-2 grid grid-cols-2 gap-4 text-[11px]">
        <div><p className="font-semibold">Payment instructions</p><p>Deposit / transfer to Delbros Leasing{payee ? ` — ${payee}` : ''}. Quote the SOA and invoice numbers; email the proof to Treasury.</p></div>
        <div className="text-right"><p>Prepared by: <strong>{s.preparedBy ?? '—'}</strong></p><p>{formatDateTime(s.asOf)}</p></div>
      </div>
      <p className="mt-1 text-[11px]">{pastDue > 0 ? 'Please settle past-due balances promptly. Kindly disregard if payment has been made.' : 'Thank you — no amount is past due.'}</p>
    </div>
  );
  return (
    <>
      <PageHeader breadcrumb={<Crumb items={[{ to: '/credit/aging', label: 'Aging' }, { to: `/credit/status?client=${code}`, label: s.client.clientName }, { label: 'SOA' }]} />} title={`Statement of account — ${s.client.clientName}`} meta={<ScreenTag id="SCR-39" />} description={`${s.soaNo} · as of ${formatDateTime(s.asOf)} · transaction ledger with running balance`}
        actions={<div className="flex flex-wrap gap-2">
          {can('cnc.aging', 'edit') && <Button variant="secondary" icon={<Mail className="size-4" />} onClick={() => setSend({ channel: 'Email', to: s.contactEmail, trackingNo: '' })}>Send SOA</Button>}
          {can('cnc.aging', 'edit') && !!s.sends.length && <Button variant="secondary" onClick={() => setAck(today())}>Record acknowledgment</Button>}
          <Button icon={<Printer className="size-4" />} onClick={() => setPrint(true)}>Print / PDF</Button></div>} />
      {!s.acknowledgedAt && !!s.sends.length && <Banner tone="info" className="mb-4">Sent {formatDate(s.sends[0].at)} — awaiting client acknowledgment; the 30-day payment window starts at acknowledgment. Whether the SOA is a draft until acknowledged is pending confirmation.</Banner>}
      <Card><DocHeader title="STATEMENT OF ACCOUNT" no={s.soaNo} date={formatDate(s.asOf)} /><Body /></Card>
      <Card className="mt-5"><CardHeader title="Send log" description="Who sent the SOA, when and by which channel" />
        {s.sends.length ? <DataTable data={s.sends} searchable={false} columns={[{ accessorKey: 'at', header: 'Sent', cell: (c) => formatDateTime(c.getValue<string>()) }, { accessorKey: 'soaNo', header: 'SOA no.' }, { accessorKey: 'channel', header: 'Channel' }, { accessorKey: 'to', header: 'To' }, { accessorKey: 'trackingNo', header: 'Tracking' }, { accessorKey: 'by', header: 'By', cell: (c) => userName(c.getValue<string>()) }]} />
          : <p className="text-sm text-muted">Not sent yet. Use “Send SOA” to email or courier it.</p>}
      </Card>
      <PrintPreview open={print} onClose={() => setPrint(false)} title={s.soaNo}><DocHeader title="STATEMENT OF ACCOUNT" no={s.soaNo} date={formatDate(s.asOf)} /><Body /><DocFooter copy="CLIENT COPY" /></PrintPreview>
      <Modal open={!!send} onClose={() => setSend(null)} title="Send statement of account" description="Logged with who, when and channel. The first send moves the collection stage to “SOA Sent”."
        footer={<><Button variant="secondary" onClick={() => setSend(null)}>Cancel</Button><Button loading={snd.isPending} disabled={!send?.to.trim()} onClick={() => snd.mutate(undefined)}>Send</Button></>}>
        {send && <Stack>
          <Select label="Channel" required value={send.channel} onChange={(e) => setSend({ ...send, channel: e.target.value as 'Email' | 'Courier', to: e.target.value === 'Email' ? s.contactEmail : addr })} options={[{ value: 'Email', label: 'Email (PDF attached)' }, { value: 'Courier', label: 'Courier (printed copy)' }]} />
          <Input label={send.channel === 'Email' ? 'Recipient email' : 'Delivery address'} required value={send.to} onChange={(e) => setSend({ ...send, to: e.target.value })} placeholder={send.channel === 'Email' ? 'e.g. name@company.ph' : 'Unit, building, street, city'} />
          {send.channel === 'Courier' && <Input label="Courier / tracking no." value={send.trackingNo} onChange={(e) => setSend({ ...send, trackingNo: e.target.value })} placeholder="e.g. LBC 1234 5678 9012" />}
          {snd.error && <Banner tone="danger">{errMessage(snd.error)}</Banner>}
        </Stack>}
      </Modal>
      <ConfirmDialog open={!!ack} onClose={() => setAck(null)} title="Record client acknowledgment" message={<span>Date the client acknowledged the SOA (starts the 30-day window):<span className="mt-2 block w-48"><DatePicker aria-label="Acknowledgment date" required max={today()} value={ack ?? ''} onChange={setAck} /></span></span>} confirmLabel="Record" loading={ak.isPending} onConfirm={() => ack && ak.mutate(ack)} />
    </>
  );
}
