import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Archive, ArchiveRestore, BellRing, Check, CheckCheck, Mail, MailOpen, Plus, Send, X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { formatDateTime, formatPhp, manilaDay, ROLE_TEMPLATES, RESOURCES, type AppNotification, type NotificationRule, type RoleCode, type WorkflowInstance } from '../../lib/shared';
import {
  ApprovalTimeline, Badge, Banner, Button, Card, DataTable, DateRangeFilter, Drawer, EmptyState, Input, PageHeader, Select, Stack, StatusBadge, Switch, Tabs, Textarea, cn, type ColumnDef,
} from '../../lib/ui';
import { useAction, useData, useRefLookups } from '../../shared/hooks';
import { useAuth } from '../../app/auth';

/** Staff review 1.2: every approval type the engine can raise, with a plain name (the type filter lists them all, not only those present). */
export const APPROVAL_TYPES: Record<string, string> = {
  ACCOUNT_UNLOCK: 'Account unlock', ACCREDITATION: 'Accreditation', ASSET_DISPOSAL: 'Asset disposal', CASH_BOND_WITHDRAWAL: 'Cash bond withdrawal', CHASSIS_TRANSFER: 'Chassis transfer',
  CONTRACT_APPROVAL: 'Contract approval', CONTRACT_TERMINATION: 'Contract termination', CROSS_BRANCH_RETURN: 'Cross-branch return code (BR-16)', DEMAND_LETTER: 'Demand letter',
  EWA_EXTENSION: 'EWA extension (BR-06)', EWALLET_SPECIAL: 'E-wallet special transaction', FORCE_INBOUND: 'Force inbound (BR-17)', GATE_OVERRIDE: 'Credit gate override',
  HOLD_LIFT: 'Hold lift (BR-03)', JOB_ORDER: 'Job order confirmation', LATE_ENCODING_CM: 'Late encoding Credit Memo (BR-05)', MEMO: 'Credit / debit memo',
  PAYMENT_REQUEST: 'RFP / petty cash (BR-10)', PR_PO: 'Purchase request / PO (BR-09)', SETTING_CHANGE: 'Setting change (BR-18)', STOCK_ADJUSTMENT: 'Stock adjustment',
  STOCK_COUNT: 'Stock count', STOCK_TRANSFER: 'Stock transfer', USER_ACCESS: 'User access',
};
const typeName = (c: string) => APPROVAL_TYPES[c] ?? c.replaceAll('_', ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase());
const dueOf = (w: WorkflowInstance) => w.steps[w.currentStep]?.dueAt;
const isEscalated = (w: WorkflowInstance) => w.status === 'Pending' && !!dueOf(w) && new Date(dueOf(w)!) < new Date();
/** Priority shown on the list (proposed rule, pending confirmation): High when escalated, due within 2 h, or ₱250,000 and over. */
const priorityOf = (w: WorkflowInstance): 'High' | 'Normal' => {
  if (w.status !== 'Pending') return 'Normal';
  const d = dueOf(w);
  return isEscalated(w) || (d && new Date(d).getTime() - Date.now() < 2 * 3_600_000) || (w.amount ?? 0) >= 250000 ? 'High' : 'Normal';
};
/** The last decided step — outcome, decided by and decided on for the History and Submitted tabs. */
const lastDecision = (w: WorkflowInstance) => [...w.steps].reverse().find((s) => s.decision !== 'Pending' && s.decidedAt);

const SUBJECT_LINK: Record<string, (id: string) => string> = {
  client: (id) => `/clients/${id}`, jo: (id) => `/repair/jo/${id}`, chassis: (id) => `/chassis/${id}`, ewa: () => '/gate/ewa', gatepass: () => '/gate/late',
  pr: () => '/procurement', payment: () => '/procurement', memo: () => '/billing/memos', cashbond: () => '/cash-bonds', ewallet: (id) => `/ewallet/${id}`, stock: () => '/inventory/transactions', user: () => '/admin/users', setting: () => '/admin/settings',
};

// ── SUP-02 My Approvals ─────────────────────────────────────────────────────
export function ApprovalsPage() {
  const data = useData(['approvals'], () => api.inbox.approvals());
  const { userName, setting } = useRefLookups();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('pending');
  const [sel, setSel] = useState<WorkflowInstance | null>(null);
  const [comment, setComment] = useState('');
  const decide = useAction((d: 'Approved' | 'Rejected') => api.inbox.decide(sel!.id, d, comment), {
    success: (wf) => (wf.status === 'Pending' ? 'Signed — waiting for the other approver(s) on this step' : `Request ${wf.status.toLowerCase()}`),
    onSuccess: () => { setSel(null); setComment(''); },
  });
  const [type, setType] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  // Staff review 1.2: a link such as /approvals?id=WF-XBR-1 (from a notification or the home page) opens that request directly.
  const linkId = params.get('id');
  useEffect(() => {
    if (!linkId || !data.data) return;
    const groups = data.data as Record<string, WorkflowInstance[]>;
    const hit = Object.values(groups).flat().find((w) => w.id === linkId);
    if (hit) { setSel(hit); setTab((['pending', 'submitted', 'history'] as const).find((k) => groups[k].some((w) => w.id === linkId)) ?? 'pending'); }
    else api.inbox.workflow(linkId).then((w) => w && setSel(w));
  }, [linkId, data.data]);
  const close = () => { setSel(null); if (linkId) setParams({}, { replace: true }); };
  const all = data.data ? (data.data as Record<string, WorkflowInstance[]>)[tab] : undefined;
  const inRange = (w: WorkflowInstance) => { const d = manilaDay(w.requestedAt); return (!range.from || d >= range.from) && (!range.to || d <= range.to); };
  const rows = all?.filter((w) => (!type || w.matrixCode === type) && inRange(w));
  const types = Object.keys(APPROVAL_TYPES).map((v) => ({ value: v, label: APPROVAL_TYPES[v] })).sort((a, b) => a.label.localeCompare(b.label));
  const n = (k: 'pending' | 'escalated' | 'submitted' | 'history') => data.data?.[k].length || undefined; // zero counts are hidden
  const decidedTab = tab === 'history' || tab === 'submitted';
  const subjectCell = (w: WorkflowInstance) => SUBJECT_LINK[w.subjectType]
    ? <Link to={SUBJECT_LINK[w.subjectType](w.subjectId)} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap font-mono text-xs text-brand-700 hover:underline">{w.subjectId}</Link>
    : <span className="font-mono text-xs">{w.subjectId || '—'}</span>;
  const cols: ColumnDef<WorkflowInstance>[] = [
    { accessorKey: 'id', header: 'Ref', meta: { nowrap: true }, cell: (c) => <span className="font-mono text-xs">{c.getValue<string>()}</span> },
    { accessorKey: 'title', header: 'Request', cell: (c) => <span className="font-medium">{c.getValue<string>()}</span> },
    { accessorKey: 'matrixCode', header: 'Type', cell: (c) => <Badge tone="brand" dot={false}>{typeName(c.getValue<string>())}</Badge> },
    { id: 'subject', header: 'Client / unit / record', cell: (c) => subjectCell(c.row.original) },
    { id: 'priority', header: 'Priority', cell: (c) => (priorityOf(c.row.original) === 'High' ? <Badge tone="danger">High</Badge> : <span className="text-xs text-muted">Normal</span>) },
    { accessorKey: 'amount', header: 'Amount', meta: { align: 'right' }, cell: (c) => (c.getValue() != null ? formatPhp(c.getValue<number>()) : '—') },
    // Review 1.1: "Step n of m" with the next step, so the approver sees where the request is in the chain.
    { id: 'step', header: 'Current step', cell: (c) => { const w = c.row.original, s = w.steps[w.currentStep], next = w.steps[w.currentStep + 1]; return s ? <span><span className="block">{s.label}</span><span className="block text-xs text-muted">Step {w.currentStep + 1} of {w.steps.length}{w.status === 'Pending' && next ? ` · next: ${next.label}` : ''}</span></span> : '—'; } },
    { accessorKey: 'branchCode', header: 'Branch', cell: (c) => c.getValue<string>() ?? <span className="text-muted">HO</span> },
    { accessorKey: 'requestedBy', header: 'Requested by', cell: (c) => userName(c.getValue<string>()) },
    { accessorKey: 'requestedAt', header: 'Submitted', cell: (c) => <span className="whitespace-nowrap">{formatDateTime(c.getValue<string>())}</span> },
    { id: 'sla', header: decidedTab ? 'Outcome / SLA' : 'SLA', cell: (c) => { const d = c.row.original.steps[c.row.original.currentStep]?.dueAt; return c.row.original.status !== 'Pending' ? <StatusBadge domain="approval" value={c.row.original.status} /> : d && new Date(d) < new Date() ? <span className="whitespace-nowrap"><Badge tone="purple">Escalated</Badge><span className="block text-xs text-danger">was due {formatDateTime(d)}</span></span> : d ? <Badge tone="warning">Due {formatDateTime(d)}</Badge> : <span className="text-muted">—</span>; } },
    // History / Submitted by me: outcome, decided by and decided on (last decided step).
    ...(decidedTab ? [
      { id: 'decidedBy', header: 'Decided by', cell: (c) => { const s = lastDecision(c.row.original); return s?.decidedBy ? <span><span className="block">{userName(s.decidedBy)}</span><span className="block text-xs text-muted">{s.label}</span></span> : '—'; } },
      { id: 'decidedAt', header: 'Decided on', cell: (c) => { const s = lastDecision(c.row.original); return s?.decidedAt ? <span className="whitespace-nowrap">{formatDateTime(s.decidedAt)}</span> : '—'; } },
    ] as ColumnDef<WorkflowInstance>[] : []),
  ];
  const canDecide = sel && data.data?.pending.some((w) => w.id === sel.id);
  const sla = sel ? Number(setting(`wf.escalation_hours.${sel.matrixCode}`) ?? setting('wf.escalation_hours') ?? 48) : 0;
  return (
    <>
      <PageHeader title="My approvals" description="All approvals waiting for you, in one place. Select a row to see the full request, the approver chain and comments, and to approve or reject." />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[
        { id: 'pending', label: 'Pending my action', count: n('pending') }, { id: 'escalated', label: 'Escalated', count: n('escalated') },
        { id: 'submitted', label: 'Submitted by me', count: n('submitted') }, { id: 'history', label: 'History', count: n('history') }]} />
      <DataTable data={rows} loading={data.isLoading} columns={cols} onRowClick={(r) => { setSel(r); setComment(''); }} emptyTitle="Nothing waiting for you" emptyHint="New approval tasks for your roles appear here and in the bell." pageSize={20} exportName={`approvals-${tab}`}
        toolbar={<div className="flex flex-wrap items-center gap-2"><Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} placeholder="All types" options={types} wrapperClassName="w-60" /><DateRangeFilter label="Submitted" from={range.from} to={range.to} onChange={setRange} /></div>} />
      <p className="mt-2 text-xs text-muted">Each step has its own timer (Admin → Settings → Workflow, per approval type; counted from when the step starts). When it lapses the step shows Escalated. Priority is High when escalated, due within 2 hours, or ₱250,000 and over (proposed rule).</p>
      <Drawer open={!!sel} onClose={close} title={sel?.title ?? ''}
        footer={canDecide ? <>
          <Button variant="danger" loading={decide.isPending} disabled={!comment.trim()} onClick={() => decide.mutate('Rejected')}>Reject</Button>
          <Button variant="success" loading={decide.isPending} onClick={() => decide.mutate('Approved')}>Approve</Button>
        </> : undefined}>
        {sel && (
          <Stack>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted">Reference</p><span className="font-mono">{sel.id}</span></div>
              <div><p className="text-xs text-muted">Priority</p>{priorityOf(sel)}</div>
              <div><p className="text-xs text-muted">Client / unit / record</p>{subjectCell(sel)}</div>
              <div><p className="text-xs text-muted">Status</p><StatusBadge domain="approval" value={sel.status} /></div>
              <div><p className="text-xs text-muted">Type</p>{typeName(sel.matrixCode)}</div>
              <div><p className="text-xs text-muted">Amount</p>{sel.amount != null ? formatPhp(sel.amount) : '—'}</div>
              <div><p className="text-xs text-muted">Requested by</p>{userName(sel.requestedBy)}</div>
              <div><p className="text-xs text-muted">Submitted</p>{formatDateTime(sel.requestedAt)}</div>
              <div><p className="text-xs text-muted">Branch</p>{sel.branchCode ?? 'HO'}</div>
              <div><p className="text-xs text-muted">Step</p>{sel.steps[sel.currentStep] ? `${sel.currentStep + 1} of ${sel.steps.length} — ${sel.steps[sel.currentStep].label}` : '—'}{sel.status === 'Pending' && sel.steps[sel.currentStep]?.dueAt && <span className={cn('block text-xs', new Date(sel.steps[sel.currentStep].dueAt!) < new Date() ? 'text-danger' : 'text-muted')}>{new Date(sel.steps[sel.currentStep].dueAt!) < new Date() ? 'Escalated — was due' : 'Due'} {formatDateTime(sel.steps[sel.currentStep].dueAt)}</span>}</div>
            </div>
            {sel.status === 'Pending' && <p className="text-xs text-muted">Step timer for {typeName(sel.matrixCode)}: {sla} h from when the step starts (Admin → Settings → Workflow).</p>}
            {SUBJECT_LINK[sel.subjectType] && <Link to={SUBJECT_LINK[sel.subjectType](sel.subjectId)} className="text-sm font-medium text-brand-600 hover:underline">Open {sel.subjectType} {sel.subjectId} →</Link>}
            <div><p className="mb-1 text-[13px] font-medium text-ink-2">Approver chain and comments</p>
              <Card className="bg-surface-alt/40"><ApprovalTimeline workflow={sel} userName={userName} /></Card></div>
            {canDecide ? <Textarea label="Comment" hint="Required when rejecting. Recorded in the audit trail." value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment — e.g. reason for rejecting" />
              : sel.status === 'Pending' && <Banner tone="info">This step is not assigned to you, you already signed it, or you submitted the request (segregation of duties).</Banner>}
          </Stack>
        )}
      </Drawer>
    </>
  );
}

// ── SUP-03 Notification centre ──────────────────────────────────────────────
export function NotificationsPage() {
  const data = useData(['notifications'], () => api.inbox.notifications());
  const archivedQ = useData(['notifications', 'archived'], () => api.inbox.notifications({ archived: true }));
  const nav = useNavigate();
  const { userName } = useRefLookups();
  const readAll = useAction(() => api.inbox.markRead(), { success: 'All marked as read' });
  const read = useAction((id: string) => api.inbox.markRead(id), { silent: true });
  const unreadOne = useAction((id: string) => api.inbox.markUnread(id), { silent: true });
  const archive = useAction((p: { id: string; on: boolean }) => api.inbox.archive(p.id, p.on), { success: (on) => (on ? 'Archived' : 'Moved back to the inbox') });
  const ack = useAction((id: string) => api.inbox.ack(id), { success: 'Acknowledged — repeat SMS stopped for all recipients' });
  const [tab, setTab] = useState('unread');
  const [cat, setCat] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const PAGE = 10;
  const unread = (data.data ?? []).filter((n) => !n.read).length;
  const src = tab === 'archived' ? archivedQ.data ?? [] : data.data ?? [];
  const list = src.filter((n) => (tab !== 'unread' || !n.read) && (!cat || n.category === cat) && (!range.from || manilaDay(n.at) >= range.from) && (!range.to || manilaDay(n.at) <= range.to));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice((Math.min(page, pages) - 1) * PAGE, Math.min(page, pages) * PAGE);
  const cats = [...new Set([...(data.data ?? []), ...(archivedQ.data ?? [])].map((n) => n.category).filter(Boolean))] as string[];
  // Date groups: Today / Yesterday / dd-Mon-yyyy (Manila calendar).
  const today = manilaDay(new Date().toISOString()), yest = manilaDay(new Date(Date.now() - 86_400_000).toISOString());
  const groupOf = (n: AppNotification) => { const d = manilaDay(n.at); return d === today ? 'Today' : d === yest ? 'Yesterday' : formatDateTime(n.at).slice(0, 11); };
  const CAT_TONE: Record<string, 'brand' | 'danger' | 'purple' | 'warning' | 'neutral' | 'info'> = { Approval: 'brand', Security: 'danger', Escalation: 'purple', Delivery: 'warning', System: 'neutral' };
  const roleLabel = (r?: string) => (r ? (ROLE_TEMPLATES as Record<string, { label: string }>)[r]?.label ?? r : '');
  return (
    <>
      <PageHeader title="Notifications" description="Alerts for you and your role. Select a notice to open its record. Each notice shows the rule that sent it and the channels used." actions={<Button variant="secondary" icon={<CheckCheck className="size-4" />} disabled={!unread} onClick={() => readAll.mutate(undefined)}>Mark all read</Button>} />
      <Tabs className="mb-4" value={tab} onChange={(t) => { setTab(t); setPage(1); }} items={[{ id: 'unread', label: 'Unread', count: unread || undefined }, { id: 'all', label: 'All', count: data.data?.length || undefined }, { id: 'archived', label: 'Archived', count: archivedQ.data?.length || undefined }]} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select aria-label="Category" value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} placeholder="All categories" options={cats.map((c) => ({ value: c, label: c }))} wrapperClassName="w-48" />
        <DateRangeFilter label="Date" from={range.from} to={range.to} onChange={(v) => { setRange(v); setPage(1); }} />
        <span className="ml-auto text-xs text-muted">{list.length} notice{list.length === 1 ? '' : 's'}</span>
      </div>
      <Card padded={false}>
        {!list.length ? <EmptyState icon={<BellRing className="size-5" />} title={tab === 'archived' ? 'Nothing archived' : data.data?.length ? 'No notifications match' : 'You’re all caught up'} hint="Alerts about your branch and tasks will appear here." /> : (
          <ul>
            {shown.map((n, i) => (
              <li key={n.id}>
                {(i === 0 || groupOf(shown[i - 1]) !== groupOf(n)) && <p className="border-b border-line bg-surface-alt/60 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{groupOf(n)}</p>}
                <div className={cn('flex gap-3 border-b border-line px-5 py-3', !n.read && 'bg-brand-50/50')}>
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-600')} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => { read.mutate(n.id); if (n.link) nav(n.link); }}>
                    <p className="flex flex-wrap items-center gap-2"><span className={cn('text-sm', n.read ? 'text-ink-2' : 'font-semibold text-ink')}>{n.title}</span>{n.category && <Badge tone={CAT_TONE[n.category] ?? 'info'} dot={false}>{n.category}</Badge>}</p>
                    <p className="text-[13px] text-muted">{n.body}</p>
                    <p className="mt-0.5 text-xs text-disabled">{formatDateTime(n.at)}{n.ruleId && <> · rule {n.ruleId}</>}{n.channels?.length ? <> · {n.channels.join(' + ')}</> : null}{n.recipientRole && <> · to {roleLabel(n.recipientRole)}</>}{n.link && <span className="text-brand-600"> · Open record →</span>}</p>
                    {n.ackAt && <p className="mt-0.5 text-xs text-success">Acknowledged by {userName(n.ackBy ?? n.userId)} on {formatDateTime(n.ackAt)}</p>}
                  </button>
                  <div className="flex shrink-0 items-start gap-1">
                    {n.requiresAck && !n.ackAt && <Button size="sm" onClick={() => ack.mutate(n.id)}>Acknowledge</Button>}
                    {tab !== 'archived' && <Button size="sm" variant="ghost" aria-label={n.read ? 'Mark as unread' : 'Mark as read'} title={n.read ? 'Mark as unread' : 'Mark as read'} icon={n.read ? <Mail className="size-4" /> : <MailOpen className="size-4" />} onClick={() => (n.read ? unreadOne.mutate(n.id) : read.mutate(n.id))} />}
                    <Button size="sm" variant="ghost" aria-label={tab === 'archived' ? 'Move back to inbox' : 'Archive'} title={tab === 'archived' ? 'Move back to inbox' : 'Archive'} icon={tab === 'archived' ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} onClick={() => archive.mutate({ id: n.id, on: tab !== 'archived' })} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {pages > 1 && <div className="mt-3 flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-muted">Page {Math.min(page, pages)} of {pages}</span><Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </>
  );
}

// ── Staff review 1.2: My profile (user menu) ───────────────────────────────
export function ProfilePage() {
  const { user } = useAuth();
  const { branchName } = useRefLookups();
  const nav = useNavigate();
  if (!user) return null;
  const roleLabels = user.roles.map((r) => (ROLE_TEMPLATES as Record<string, { label: string }>)[r]?.label ?? r);
  const byModule = [...new Set(RESOURCES.map((r) => r.module))].map((m) => {
    const res = RESOURCES.filter((r) => r.module === m && user.grants[r.id]?.length);
    return { m, res, acts: [...new Set(res.flatMap((r) => user.grants[r.id]))] };
  }).filter((x) => x.res.length);
  const field = (label: string, v: ReactNode) => <div><p className="text-xs text-muted">{label}</p><p className="text-sm text-ink">{v || '—'}</p></div>;
  return (
    <>
      <PageHeader title="My profile" description="Your account details, role and branch scope. To change your name, email, phone, role or branches ask IT (Admin → Users & roles); every change is audited." actions={<Button variant="secondary" onClick={() => nav('/account/password')}>Change password</Button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card><div className="grid gap-3">
          {field('User ID', <span className="font-mono">{user.userId}</span>)}{field('Name', user.name)}{field('Designation', user.designation)}
          {field('Email', user.email)}{field('Mobile', user.mobile)}{field('Department', user.department)}
          {field('Role(s)', roleLabels.join(', '))}
          {field('Branch scope', user.branchAccess === 'ALL' ? 'All branches' : (user.branchAccess as string[]).map((b) => branchName(b)).join(', '))}
          {field('Home branch', user.branchCode === 'HO' ? 'Head Office' : branchName(user.branchCode))}
          {field('Signed in', user.lastLogin ? formatDateTime(user.lastLogin) : '—')}
          {field('Previous sign-in', user.previousLogin ? formatDateTime(user.previousLogin) : 'First sign-in')}
        </div></Card>
        <Card className="lg:col-span-2"><p className="mb-2 text-[13px] font-medium text-ink-2">What you can do (from your role{user.roles.length > 1 ? 's' : ''})</p>
          <ul className="divide-y divide-line text-sm">{byModule.map((x) => <li key={x.m} className="flex flex-wrap justify-between gap-2 py-1.5"><span className="font-medium">{x.m}</span><span className="text-xs text-muted">{x.res.map((r) => r.description).join(', ')} · {x.acts.join(', ')}</span></li>)}</ul>
          <p className="mt-3 text-xs text-muted">Users with several branches see all of them together; the branch shown in the top bar is your scope. Switching to a single branch is not offered (pending confirmation).</p>
        </Card>
      </div>
    </>
  );
}

// ── SCR-44 Notification rule configuration ─────────────────────────────────
/** Staff review 1.2: module / category of a rule, from its event key. */
const RULE_MODULE: [RegExp, string][] = [[/^(client\.accreditation|client\.portal|client\.internal|client\.reactivated)/, 'Clients & Sales'], [/^client\.hold|^hold_lift|^collection|^ar\.|^invoice\.overdue|^payment/, 'Credit & Collection'],
  [/^contract|^cashbond/, 'Contracts & cash bonds'], [/^ewa|^gate|^late_encoding/, 'Gate operations'], [/^rescue/, 'Rescue'], [/^jo\./, 'Repair'], [/^prc|^inventory/, 'Procurement & inventory'],
  [/^billing/, 'Finance'], [/^ewallet/, 'E-wallet'], [/^registration/, 'Regulatory'], [/^workflow/, 'Approvals'], [/^report/, 'Reports'], [/^user|^integration/, 'Administration']];
const ruleModule = (eventType: string) => RULE_MODULE.find(([re]) => re.test(eventType))?.[1] ?? 'Other';
export function NotificationRulesPage() {
  const data = useData(['rules'], () => api.notifications.rules());
  const [sel, setSel] = useState<NotificationRule | null>(null);
  const save = useAction((r: NotificationRule) => api.notifications.saveRule(r), { success: 'Rule saved — applies platform-wide immediately (audited)', onSuccess: () => setSel(null) });
  const test = useAction((id: string) => api.notifications.test(id), { success: 'Test notification sent to you' });
  const [mode, setMode] = useState('');
  const [mod, setMod] = useState('');
  const { userName: ruleUser } = useRefLookups();
  const roleList = (rs?: RoleCode[]) => (rs ?? []).map((r) => ROLE_TEMPLATES[r]?.label ?? r).join(', ');
  const rulesAll = data.data ?? [];
  const rulesShown = rulesAll.filter((r) => (!mode || (mode === 'repeat' ? r.mode === 'Repeat until ack' : mode === 'esc' ? !!r.escalationHours : mode === 'inactive' ? !r.active : mode === 'proposed' ? !!r.pending : true)) && (!mod || ruleModule(r.eventType) === mod));
  const cols: ColumnDef<NotificationRule>[] = [
    { accessorKey: 'id', header: 'ID', cell: (c) => <span className="font-mono">{c.getValue<string>()}</span> },
    // Staff review 1.2: module of the event, when it fires (condition), the message subject, and every recipient (no "+2 more").
    { id: 'module', accessorFn: (r) => ruleModule(r.eventType), header: 'Module', meta: { nowrap: true }, cell: (c) => <span className="text-[13px]">{c.getValue<string>()}</span> },
    { accessorKey: 'description', header: 'Event', meta: { wrap: true }, cell: (c) => { const r = c.row.original; const subject = r.template?.subject ?? `[Delbros] ${r.description}`; return <div title={r.eventType} className="min-w-[14rem]"><p className="font-medium">{c.getValue<string>()}{r.template && <span className="ml-1.5 text-[11px] font-medium text-success">custom template</span>}</p>
      <p className="text-[11px] text-muted">{r.condition ? `If: ${r.condition}` : 'Fires on every event'}</p><p className="max-w-[18rem] truncate text-[11px] text-muted" title={r.template ? `${r.template.subject}\n\n${r.template.body}` : 'Default template: subject + event summary + link'}>Subject: {subject}</p></div>; } },
    { id: 'rcpt', header: 'Recipients', meta: { wrap: true }, cell: (c) => {
      const all = [...c.row.original.recipientRoles.map((r) => ROLE_TEMPLATES[r]?.label ?? r), c.row.original.includeAe && 'AE assigned', c.row.original.includeClient && 'Client', ...c.row.original.namedRecipients].filter(Boolean) as string[];
      if (!all.length) return <span className="text-[13px]" title="The users assigned to the task or record">Assignees</span>;
      return <div className="flex w-[16rem] flex-wrap gap-1">{all.map((x) => <Badge key={x} dot={false}>{x}</Badge>)}</div>;
    } },
    { id: 'ch', header: 'Channels', cell: (c) => <div className="flex gap-1">{c.row.original.channels.map((x) => <Badge key={x} tone="info" dot={false}>{x}</Badge>)}</div> },
    { accessorKey: 'mode', header: 'Mode', cell: (c) => <div><Badge tone={c.getValue() === 'Repeat until ack' ? 'info' : 'neutral'} dot={false}>{c.getValue<string>()}</Badge>{c.row.original.repeatMinutes && c.getValue() === 'Repeat until ack' ? <p className="text-[11px] text-muted">every {c.row.original.repeatMinutes} min</p> : null}</div> },
    { accessorKey: 'escalationHours', header: 'Escalation', meta: { wrap: true }, cell: (c) => (c.getValue() ? <div className="text-[13px]"><p>{c.getValue<number>()} h →</p><p className="max-w-[11rem] whitespace-normal text-[11px] text-muted">{roleList(c.row.original.escalateTo) || 'target not set'}</p>{c.row.original.pending && <span title={`Pending decision ${c.row.original.pending}`}><Badge tone="warning">Proposed</Badge></span>}</div> : c.row.original.pending ? <span title={`Pending decision ${c.row.original.pending}`}><Badge tone="warning">Proposed</Badge></span> : '—') },
    { accessorKey: 'active', header: 'Active', cell: (c) => <StatusBadge domain="generic" value={c.getValue() ? 'Active' : 'Inactive'} /> },
    { accessorKey: 'lastChangedAt', header: 'Last changed', meta: { nowrap: true }, cell: (c) => (c.row.original.lastChangedAt ? <div className="text-xs"><p>{formatDateTime(c.row.original.lastChangedAt)}</p><p className="text-muted">{ruleUser(c.row.original.lastChangedBy)}</p></div> : <span className="text-xs text-muted" title="Not changed since go-live">Initial setup</span>) },
  ];
  return (
    <>
      <PageHeader title="Notification rules" description="Who is notified, how and when for every event in the platform. Select a rule to edit its condition, recipients, channels, mode, escalation and message template. Every save is audited." />
      <Banner tone="warning" className="mb-4" title="Some rules are proposed and awaiting client confirmation">Which categories send SMS, the repeat alerts for chassis in/out, and escalation targets marked “Proposed” are still to be confirmed. The collection-stage rules start firing once Credit &amp; Collection sends stage-specific events; until then one rule covers every stage.</Banner>
      {data.data && <p className="mb-2 text-xs text-muted"><strong className="text-ink">{rulesAll.length}</strong> rules · {rulesAll.filter((r) => r.active).length} active · <strong className="text-warning">{rulesAll.filter((r) => r.pending).length}</strong> proposed (awaiting confirmation) · {rulesAll.filter((r) => r.escalationHours).length} with an escalation timer · {rulesAll.filter((r) => r.mode === 'Repeat until ack').length} repeat until acknowledged. Mode: One-time = sent once per event (each stage of a staged rule, e.g. 3 / 2 / 1 months, is its own event); Repeat until acknowledged = resent every n minutes until someone acknowledges.</p>}
      <DataTable data={data.data ? rulesShown : undefined} loading={data.isLoading} columns={cols} onRowClick={setSel} exportName="notification-rules"
        toolbar={<><Select aria-label="Filter" value={mode} onChange={(e) => setMode(e.target.value)} placeholder="All rules" options={[{ value: 'repeat', label: 'Repeat until ack' }, { value: 'esc', label: 'With escalation timer' }, { value: 'proposed', label: 'Proposed (to confirm)' }, { value: 'inactive', label: 'Inactive' }]} wrapperClassName="w-52" />
          <Select aria-label="Module" value={mod} onChange={(e) => setMod(e.target.value)} placeholder="All modules" options={[...new Set(rulesAll.map((r) => ruleModule(r.eventType)))].sort().map((m) => ({ value: m, label: m }))} wrapperClassName="w-48" /></>} />
      {sel && <RuleEditor rule={sel} onClose={() => setSel(null)} onSave={(r) => save.mutate(r)} onTest={() => test.mutate(sel.id)} saving={save.isPending} />}
    </>
  );
}

// Condition builder: "field operator value" clauses joined with "and" (e.g. amount > 250000 and urgent = true).
type Clause = { field: string; op: string; value: string };
const OPS = [{ value: '=', label: 'is' }, { value: '!=', label: 'is not' }, { value: '>', label: 'is more than' }, { value: '>=', label: 'is at least' }, { value: '<', label: 'is less than' }, { value: '<=', label: 'is at most' }];
const COND_FIELDS = ['amount', 'urgent', 'stage', 'days_late', 'days_overdue', 'balance', 'severity', 'branch'];
const NUM = /^-?\d+(\.\d+)?$/;
const parseCond = (s?: string): Clause[] | null => {
  if (!s?.trim()) return [];
  const out: Clause[] = [];
  for (const part of s.split(/\s*,\s*|\s+and\s+/i)) {
    const m = part.trim().match(/^([A-Za-z_][\w.]*)\s*(>=|<=|!=|=|>|<)\s*(.+)$/);
    if (!m) return null;
    const v = m[3].trim();
    if (!(NUM.test(v) || /^(true|false)$/i.test(v) || /^'[^']*'$/.test(v))) return null;
    out.push({ field: m[1], op: m[2], value: v.replace(/^'|'$/g, '') });
  }
  return out;
};
const clauseErr = (c: Clause) => {
  if (!c.field && !c.value.trim()) return undefined; // an untouched row is ignored
  if (!/^[A-Za-z_][\w.]*$/.test(c.field)) return 'Choose a field';
  if (!c.value.trim()) return 'Enter a value';
  if (['>', '>=', '<', '<='].includes(c.op) && !NUM.test(c.value.trim())) return 'Needs a number';
  return undefined;
};
const serializeCond = (cs: Clause[]) => cs.filter((c) => c.field && c.value.trim()).map((c) => { const v = c.value.trim(); return `${c.field} ${c.op} ${NUM.test(v) || /^(true|false)$/i.test(v) ? v : `'${v.replace(/'/g, '')}'`}`; }).join(' and ');

function RuleEditor({ rule, onClose, onSave, onTest, saving }: { rule: NotificationRule; onClose: () => void; onSave: (r: NotificationRule) => void; onTest: () => void; saving: boolean }) {
  const [r, setR] = useState(rule);
  const parsed = parseCond(rule.condition);
  const [worded, setWorded] = useState(parsed === null); // legacy condition written in words — kept as is unless replaced
  const [clauses, setClauses] = useState<Clause[]>(parsed?.length ? parsed : [{ field: '', op: '=', value: '' }]);
  const setClause = (i: number, p: Partial<Clause>) => { const next = clauses.map((c, j) => (j === i ? { ...c, ...p } : c)); setClauses(next); setR({ ...r, condition: serializeCond(next) || undefined }); };
  const removeClause = (i: number) => { const next = clauses.filter((_, j) => j !== i); const keep = next.length ? next : [{ field: '', op: '=', value: '' }]; setClauses(keep); setR({ ...r, condition: serializeCond(keep) || undefined }); };
  const condErr = !worded && clauses.some((c) => clauseErr(c));
  const opLabel = (op: string) => OPS.find((o) => o.value === op)?.label ?? op;
  const preview = serializeCond(clauses) ? `Sends only when ${clauses.filter((c) => c.field && c.value.trim()).map((c) => `${c.field.replace(/_/g, ' ')} ${opLabel(c.op)} ${c.value.trim()}`).join(' and ')}.` : 'No condition — sends for every event.';
  const toggleCh = (c: NotificationRule['channels'][number]) => setR({ ...r, channels: r.channels.includes(c) ? r.channels.filter((x) => x !== c) : [...r.channels, c] });
  const tpl = r.template ?? { subject: `[Delbros] ${r.description}`, body: '{{summary}}\n\nOpen in Delbros Leasing: {{link}}', sms: r.channels.includes('SMS') ? 'Delbros: {{summary}}' : '' };
  const internal = Object.entries(ROLE_TEMPLATES).filter(([k]) => !['CLIENT', 'VENDOR'].includes(k));
  const errs = {
    channels: !r.channels.length ? 'Select at least one channel' : undefined,
    repeat: r.mode === 'Repeat until ack' && !(Number(r.repeatMinutes) > 0) ? 'Required for repeat-until-ack' : undefined,
    esc: r.escalationHours && !r.escalateTo?.length ? 'Choose the escalation target' : undefined,
    tpl: !tpl.subject.trim() || !tpl.body.trim() ? 'Subject and body are required' : undefined,
    cond: condErr ? 'Complete or remove the unfinished condition' : undefined,
  };
  const invalid = Object.values(errs).some(Boolean);
  return (
    <Drawer open onClose={onClose} title={`${r.id} · ${r.description}`} width="max-w-2xl"
      footer={<><Button variant="ghost" className="mr-auto" icon={<Send className="size-4" />} onClick={onTest}>Send test to me</Button><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} disabled={invalid} onClick={() => onSave({ ...r, template: tpl })}>Save rule</Button></>}>
      <Stack>
        <div>
          <p className="mb-1 text-[13px] font-medium text-ink-2">Event</p>
          <p className="text-sm font-medium text-ink">{r.description}</p>
          <p className="font-mono text-[11px] text-muted" title="System event key">{r.eventType}</p>
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">Condition (optional)</p>
          {worded ? (
            <div className="rounded-lg border border-line bg-surface-alt/50 px-3 py-2 text-[13px]">
              <p className="text-ink">{r.condition}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">Described in words and applied as configured.
                <Button size="sm" variant="ghost" onClick={() => { setWorded(false); setClauses([{ field: '', op: '=', value: '' }]); setR({ ...r, condition: undefined }); }}>Replace with field conditions</Button></p>
            </div>
          ) : (
            <div className="space-y-2">
              {clauses.map((c, i) => { const e = clauseErr(c); return (
                <div key={i}>
                  <div className="flex items-start gap-2">
                    {i > 0 && <span className="mt-2 w-8 text-xs font-medium uppercase text-muted">and</span>}
                    <Select aria-label="Field" placeholder="Choose a field" value={c.field} onChange={(ev) => setClause(i, { field: ev.target.value })} options={[...new Set([...COND_FIELDS, ...(c.field ? [c.field] : [])])].map((f) => ({ value: f, label: f.replace(/_/g, ' ') }))} wrapperClassName="flex-1" />
                    <Select aria-label="Operator" value={c.op} onChange={(ev) => setClause(i, { op: ev.target.value })} options={OPS} wrapperClassName="w-36" />
                    <Input aria-label="Value" placeholder="Value, e.g. 250000" value={c.value} onChange={(ev) => setClause(i, { value: ev.target.value })} wrapperClassName="flex-1" />
                    <Button size="sm" variant="ghost" className="mt-0.5" aria-label="Remove condition" title="Remove condition" icon={<X className="size-4" />} onClick={() => removeClause(i)} />
                  </div>
                  {e && <p className="mt-1 text-xs text-danger">{e}</p>}
                </div>); })}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setClauses([...clauses, { field: '', op: '=', value: '' }])}>Add condition</Button>
                <p className={cn('text-xs', condErr ? 'text-danger' : 'text-muted')}>{condErr ? errs.cond : preview}</p>
              </div>
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Recipient roles</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {Object.entries(ROLE_TEMPLATES).filter(([k]) => !['CLIENT', 'VENDOR'].includes(k)).map(([k, v]) => (
              <label key={k} className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-brand-600" checked={r.recipientRoles.includes(k as RoleCode)}
                onChange={(e) => setR({ ...r, recipientRoles: e.target.checked ? [...r.recipientRoles, k as RoleCode] : r.recipientRoles.filter((x) => x !== k) })} />{v.label}</label>
            ))}
          </div>
        </div>
        <Input label="Named recipients / mailboxes" value={r.namedRecipients.join(', ')} onChange={(e) => setR({ ...r, namedRecipients: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="e.g. billing@company.ph, ops@company.ph" hint="Comma-separated, e.g. department mailboxes" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Switch label="Include AE assigned" checked={r.includeAe} onChange={(v) => setR({ ...r, includeAe: v })} />
          <Switch label="Include client contacts" checked={r.includeClient} onChange={(v) => setR({ ...r, includeClient: v })} />
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Channels</p>
          <div className="flex gap-2">{(['Email', 'SMS', 'In-App'] as const).map((c) => (
            <button key={c} type="button" aria-pressed={r.channels.includes(c)} onClick={() => toggleCh(c)} className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm', r.channels.includes(c) ? 'border-brand-600 bg-brand-600 text-white' : 'border-disabled bg-surface text-ink-2 hover:border-brand-600')}>{r.channels.includes(c) && <Check className="size-3.5" aria-hidden />}{c}</button>
          ))}</div>
          {errs.channels && <p className="mt-1 text-xs text-danger">{errs.channels}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Mode" value={r.mode} onChange={(e) => setR({ ...r, mode: e.target.value as NotificationRule['mode'] })} options={[{ value: 'One-time', label: 'One-time' }, { value: 'Repeat until ack', label: 'Repeat until acknowledged' }]} />
          {r.mode === 'Repeat until ack' && <Input label="Repeat every (min)" type="number" min={1} value={r.repeatMinutes ?? ''} placeholder="e.g. 30" error={errs.repeat} onChange={(e) => setR({ ...r, repeatMinutes: Number(e.target.value) || undefined })} />}
          <Input label="Escalate after (hours)" type="number" min={1} value={r.escalationHours ?? ''} placeholder="e.g. 24" onChange={(e) => setR({ ...r, escalationHours: Number(e.target.value) || undefined })} hint="Blank = no escalation. Enter hours to choose who it escalates to." />
        </div>
        {!!r.escalationHours && <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Escalate to<span className="text-danger">*</span>{r.pending && <span title={`Pending decision ${r.pending}`} className="ml-2"><Badge tone="warning">Proposed</Badge></span>}</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {internal.map(([k, v]) => (
              <label key={k} className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-brand-600" checked={!!r.escalateTo?.includes(k as RoleCode)}
                onChange={(e) => setR({ ...r, escalateTo: e.target.checked ? [...(r.escalateTo ?? []), k as RoleCode] : (r.escalateTo ?? []).filter((x) => x !== k) })} />{v.label}</label>
            ))}
          </div>
          {errs.esc && <p className="mt-1 text-xs text-danger">{errs.esc}</p>}
        </div>}
        <div className="rounded-lg border border-line p-3">
          <p className="mb-2 text-[13px] font-medium text-ink-2">Message template</p>
          <Stack>
            <Input label="Email subject" required value={tpl.subject} onChange={(e) => setR({ ...r, template: { ...tpl, subject: e.target.value } })} placeholder="e.g. Invoice {{docNo}} is due for {{clientName}}" />
            <Textarea label="Email / in-app body" required rows={4} value={tpl.body} onChange={(e) => setR({ ...r, template: { ...tpl, body: e.target.value } })} placeholder="Message text — e.g. {{summary}}. Open: {{link}}" error={errs.tpl} hint="Placeholders: {{clientName}}, {{docNo}}, {{amount}}, {{branch}}, {{summary}}, {{link}} — resolved at send time" />
            {r.channels.includes('SMS') && <Input label="SMS text" maxLength={160} value={tpl.sms ?? ''} onChange={(e) => setR({ ...r, template: { ...tpl, sms: e.target.value } })} placeholder="Short text, e.g. {{docNo}} needs action: {{link}}" hint={`${(tpl.sms ?? '').length}/160 characters`} />}
          </Stack>
        </div>
        <Switch label="Rule active" checked={r.active} onChange={(v) => setR({ ...r, active: v })} />
      </Stack>
    </Drawer>
  );
}
