import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, SquareParking, Download, FileBarChart, LifeBuoy, Lock, Play, Printer, Search, ShieldAlert, Truck, Wrench } from 'lucide-react';
import { api } from '../../lib/api-client';
import { formatDate, formatDateTime, formatNumber, formatPhp, todayManila, FLEET_OTHER_STATUSES } from '../../lib/shared';
import { Badge, Banner, Button, Card, CardHeader, Checkbox, DataTable, DateRangeFilter, EmptyState, Input, KpiTile, PageHeader, Select, StatusBadge, cn, sentenceCase, stripCodes, type ColumnDef } from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, useData, useRefLookups } from '../../shared/hooks';
import { Crumb, ScreenTag } from '../../shared/components';
import { DocFooter, DocHeader, PrintPreview } from '../../shared/print';

const STATUS_COLORS: Record<string, string> = { Available: '#15803D', Allocated: '#3878B8', 'On Hire': '#0058A8', Breakdown: '#B42318', 'In Repair': '#DC6803', Rescue: '#F79009', Parked: '#7A5AF8', Other: '#667085' };

/** Compact panel header: icon chip, title and "View all" on one centred line, no reserved description space. */
const PanelHead = ({ title, icon: Icon, onAll }: { title: string; icon: typeof Truck; onAll: () => void }) => (
  <div className="flex min-h-[66px] items-center justify-between gap-3 border-b border-line px-5 py-3">
    <h2 className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold text-ink"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="size-4" aria-hidden /></span><span className="leading-snug">{title}</span></h2>
    <Button size="sm" variant="ghost" className="shrink-0" onClick={onAll}>View all <ChevronRight className="size-4" /></Button>
  </div>
);

/** Fleet status tile: coloured icon chip (same colours as the fleet chart), count, label and a "View list" cue. */
const STATUS_ICON: Record<string, typeof Truck> = { Available: CheckCircle2, Allocated: ClipboardCheck, 'On Hire': Truck, 'In Repair': Wrench, Rescue: LifeBuoy, Breakdown: AlertTriangle, Parked: SquareParking, Other: FileBarChart };
/** Staff review 1.2: what each fleet tile counts (unit status on the chassis master, not requests or job orders). */
const STATUS_HINT: Record<string, string> = {
  Available: 'Ready to allocate', Allocated: 'Reserved for a client', 'On Hire': 'Out with clients', 'In Repair': 'Job order confirmed or ongoing',
  Rescue: 'Unit being recovered (set at dispatch)', Breakdown: 'Unroadworthy, repair not started', Parked: 'Fleet unit parked, not for hire',
  Other: 'New, Unaccounted, Legal, Converted, Sold, Killed', // V1.4 row 13: same "Other" group as the Allocation board
};
function StatusTile({ status, value, onClick, note }: { status: string; value: number; onClick: () => void; note?: string }) {
  const Icon = STATUS_ICON[status] ?? Truck, color = STATUS_COLORS[status] ?? '#667085';
  return (
    <button type="button" onClick={onClick} title={STATUS_HINT[status]} className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface p-4 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{sentenceCase(status)}</span>
          <span className="mt-0.5 block text-[11px] leading-tight text-disabled">{note ?? STATUS_HINT[status]}</span></span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}14`, color }}><Icon className="size-4" aria-hidden /></span>
      </span>
      <span className="mt-auto flex items-end justify-between gap-2 pt-3">
        <span className="inline-flex items-center gap-0.5 pb-0.5 text-xs font-medium text-brand-700 group-hover:underline">View list <ChevronRight className="size-3" /></span>
        <span className={cn('text-right text-[28px] font-bold leading-none tabular', status === 'Breakdown' && value > 0 ? 'text-danger' : 'text-ink')}>{value}</span>
      </span>
      <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: color }} aria-hidden />
    </button>
  );
}

/** EWA validity left (24-hour rule), e.g. "20h 59m left · until 03-Nov-2026 07:28". */
function TimeLeft({ until }: { until: string }) {
  const ms = new Date(until).getTime() - Date.now();
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return <span className={cn('block text-xs', ms <= 0 ? 'text-danger' : h < 3 ? 'font-semibold text-warning' : 'text-muted')} title={`Valid until ${formatDateTime(until)}`}>{ms <= 0 ? 'Expired' : `${h}h ${m}m left`} · until {formatDateTime(until)}</span>;
}

/** Role landing for Branch Generalist / DYM and general "Dashboard" entry. */
export function OperationsDashboard() {
  const { user, can } = useAuth();
  const nav = useNavigate();
  const ewas = useData(['ewas', 'active'], () => api.gate.ewas({ status: 'Active' }), can('gate.ewa'));
  const board = useData(['alloc', {}], () => api.alloc.board({}), can('alloc.board'));
  const jos = useData(['jos', ''], () => api.repair.list({}), can('repair.jo'));
  const rescues = useData(['rescues', ''], () => api.rescue.list({}), can('rescue.request'));
  const approvals = useData(['approvals'], () => api.inbox.approvals());
  const alerts = useData(['home-alerts'], () => api.inbox.homeAlerts());
  const { userName } = useRefLookups();
  // V1.4 row 13: "Other" uses the Allocation board's mapping, so the two screens always add up to the same fleet.
  const count = (s: string) => (board.data ?? []).filter((c) => (s === 'Other' ? FLEET_OTHER_STATUSES.includes(c.status) : c.status === s)).length;
  const tqs = (board.data ?? []).filter((c) => c.readyForSignoff).length; // V1.4 row 14: Allocation "Ready for sign-off" (TQS) count
  const openRescue = (rescues.data ?? []).filter((r) => !['Completed', 'Cancelled', 'Blocked'].includes(r.status));
  // Labels match the sidebar so the same destination always reads the same.
  const quick = [
    { to: '/gate/out', label: 'Gate Out', icon: ArrowUpFromLine, perm: 'gate.out' }, { to: '/gate/in', label: 'Gate In', icon: ArrowDownToLine, perm: 'gate.in' },
    { to: '/gate/ewa', label: 'EWA', icon: Truck, perm: 'gate.ewa' }, { to: '/repair/new', label: 'New job order', icon: Wrench, perm: 'repair.jo' },
    { to: '/rescue', label: 'Rescue Requests', icon: LifeBuoy, perm: 'rescue.request' }, { to: '/regulatory/compliance', label: 'Compliance Dashboard', icon: CalendarClock, perm: 'reg.compliance' },
  ].filter((q) => can(q.perm));
  const row = 'flex min-h-12 items-center justify-between gap-3 px-5 py-2 text-sm transition-colors hover:bg-surface-alt/60';
  const first = user?.name.split(' ')[0] ?? '';
  const greeting = !first || /^(system|admin|administrator|service|user)$/i.test(first) ? 'Good day' : `Good day, ${first}`;
  return (
    <>
      <PageHeader title={greeting} description={`${user?.designation} · ${formatDateTime(new Date().toISOString())}`} />
      {!!approvals.data?.pending.length && (() => {
        // Review 1.1: list every waiting approval (up to 5, then "+N more") with its type, amount and SLA so the count always matches the list.
        const list = approvals.data.pending, shown = list.slice(0, 5);
        const overdue = (w: (typeof list)[number]) => { const d = w.steps[w.currentStep]?.dueAt; return !!d && new Date(d) < new Date(); };
        return (
          <Banner className="mb-5" tone="info" title={`${list.length} approval${list.length === 1 ? '' : 's'} waiting for you`} actions={<Button size="sm" onClick={() => nav('/approvals')}>Open inbox</Button>}>
            <ul className="mt-1 space-y-0.5">{shown.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Badge tone="brand" dot={false}>{sentenceCase(w.matrixCode.replaceAll('_', ' '))}</Badge>
                <button className="text-left hover:underline" onClick={() => nav(`/approvals?id=${w.id}`)}>{w.title}</button>
                {w.amount != null && <span className="font-medium tabular">{formatPhp(w.amount)}</span>}
                {overdue(w) ? <Badge tone="purple">Escalated</Badge> : null}
                {/* Staff review 1.2: requester, branch, submitted and due time on every item. */}
                <span className="text-xs text-muted">by {userName(w.requestedBy)} · {w.branchCode ?? 'HO'} · submitted {formatDateTime(w.requestedAt)}{w.steps[w.currentStep]?.dueAt ? ` · ${overdue(w) ? 'was due' : 'due'} ${formatDateTime(w.steps[w.currentStep]!.dueAt)}` : ''}</span>
              </li>))}
            </ul>
            {list.length > shown.length && <p className="mt-1 text-xs font-medium">+{list.length - shown.length} more in the inbox</p>}
          </Banner>
        );
      })()}
      {!!quick.length && (
        <div className="mb-5 flex flex-wrap gap-2">
          {quick.map((q) => <button key={q.to} onClick={() => nav(q.to)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink-2 shadow-[var(--shadow-card)] transition-colors hover:border-brand-300 hover:bg-brand-50"><q.icon className="size-4 text-brand-600" />{q.label}</button>)}
        </div>
      )}
      {can('alloc.board') && (
        <section className="mb-6" aria-label="Fleet status">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {['Available', 'Allocated', 'On Hire', 'In Repair', 'Rescue', 'Breakdown', 'Parked', 'Other'].map((s) => <StatusTile key={s} status={s} value={count(s)} onClick={() => nav(`/allocation?status=${encodeURIComponent(s)}`)}
              note={s === 'Rescue' && rescues.data ? `Unit status · ${openRescue.length} open request${openRescue.length === 1 ? '' : 's'}` : undefined} />)}
          </div>
          {/* V1.4 row 14: units awaiting quality sign-off — a subset of the tiles above (not another fleet status, so not added to the total). */}
          <button type="button" onClick={() => nav('/allocation?ready=1')} className="mt-3 flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-success/40 bg-success-bg/40 px-4 py-2.5 text-left text-sm hover:border-success hover:bg-success-bg/70">
            <ClipboardCheck className="size-4 text-success" aria-hidden />
            <span className="font-semibold text-ink">Ready for sign-off (TQS): <span className="tabular text-success">{tqs}</span></span>
            <span className="text-xs text-muted">Repaired units awaiting quality sign-off before they become Available — same count as Allocation → Ready for sign-off. Already counted in the tiles above, so not added to the fleet total.</span>
            <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-brand-700">Open on the Allocation board <ChevronRight className="size-3" /></span>
          </button>
          <p className="mt-2 text-xs text-muted">Tiles count units by their status on the chassis master and add up to the fleet ({(board.data ?? []).length} units). “Other” groups New, Unaccounted, Legal, Converted, Sold and Killed exactly as on the Allocation board; it is shown even at 0 so both screens list the same statuses (whether to show it only when non-zero is pending confirmation). Open rescue requests and job orders are listed below; a Draft job order does not move the unit to In repair.</p>
        </section>
      )}
      {/* Staff review 1.2: per-role alerts — each user sees only the areas their role can open (holds and overdue, registration expiry, low stock, PR / PO, late encoding). */}
      {!!alerts.data?.length && (
        <section className="mb-6" aria-label="Alerts for your role">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Alerts for your role</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {alerts.data.map((a) => (
              <button key={a.key} type="button" onClick={() => nav(a.link)} className="flex flex-col rounded-xl border border-line bg-surface p-3 text-left shadow-[var(--shadow-card)] hover:border-brand-300 hover:bg-brand-50/40">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{a.label}</span>
                <span className={cn('mt-1 text-2xl font-bold tabular', a.value ? (a.tone === 'danger' ? 'text-danger' : a.tone === 'warning' ? 'text-warning' : 'text-ink') : 'text-ink')}>{a.value}</span>
                <span className="mt-0.5 line-clamp-2 text-xs text-muted">{a.detail}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        {can('gate.ewa') && <Card padded={false}><PanelHead title="Active EWAs (ready for Gate Out)" icon={Truck} onAll={() => nav('/gate/ewa')} />
          <ul className="divide-y divide-line">{(ewas.data ?? []).slice(0, 8).map((e) => <li key={e.euNo} className={row}><span className="min-w-0 truncate"><button className="font-mono text-brand-700 hover:underline" onClick={() => nav(`/gate/ewa?eu=${e.euNo}`)}>{e.euNo}</button><span className="text-muted"> · </span><span className="text-ink-2">{e.clientName}</span><TimeLeft until={e.validUntil} /></span><Button size="sm" variant="ghost" className="shrink-0" onClick={() => nav('/gate/out')}>Release <ChevronRight className="size-4" /></Button></li>)}
            {!ewas.data?.length && <li className="px-5 py-6 text-center text-sm text-muted">No active EWAs.</li>}</ul></Card>}
        {can('repair.jo') && <Card padded={false}><PanelHead title="Open job orders" icon={Wrench} onAll={() => nav('/repair')} />
          <ul className="divide-y divide-line">{(jos.data ?? []).filter((j) => !j.status.startsWith('Closed')).slice(0, 8).map((j) => <li key={j.joNo} className={row}><button className="font-mono text-brand-700 hover:underline" onClick={() => nav(`/repair/jo/${j.joNo}`)}>{j.joNo}</button><StatusBadge domain="jo" value={j.status} /></li>)}</ul></Card>}
        {can('rescue.request') && <Card padded={false}><PanelHead title="Open rescues" icon={LifeBuoy} onAll={() => nav('/rescue')} />
          <ul className="divide-y divide-line">{openRescue.slice(0, 8).map((r) => <li key={r.rescueNo} className={row}><button className="font-mono text-brand-700 hover:underline" onClick={() => nav(`/rescue/${r.rescueNo}`)}>{r.rescueNo}</button><span className="flex items-center gap-2">{r.urgent && <span title="Urgent" aria-label="Urgent" className="inline-flex items-center gap-1 text-xs font-semibold text-danger"><AlertTriangle className="size-4" />Urgent</span>}<StatusBadge domain="rescue" value={r.status} /></span></li>)}
            {!openRescue.length && <li className="px-5 py-6 text-center text-sm text-muted">No open rescues.</li>}</ul></Card>}
      </div>
    </>
  );
}

const csvDownload = (name: string, rows: (string | number | undefined)[][]) => {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url);
};
/** KPI tile with a chevron cue: every executive tile drills down to its source screen. */
const Tile = (p: Parameters<typeof KpiTile>[0]) => <KpiTile {...p} icon={p.onClick ? <ChevronRight className="size-4 text-brand-600" aria-hidden /> : p.icon} />;
const Section = ({ children }: { children: string }) => <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{children}</h2>;

// ── SCR-45 Executive Dashboard ──────────────────────────────────────────────
export function ExecutiveDashboardPage() {
  const { branchOptions, ref } = useRefLookups();
  const [f, setF] = useState({ branch: '', region: '', from: '', to: '' });
  const data = useData(['exec', f], () => api.reports.executive(f));
  const nav = useNavigate();
  const d = data.data;
  const regions = [...new Set((ref?.branches ?? []).map((b) => b.region))].map((x) => ({ value: x, label: x }));
  const aging = useMemo(() => (!d ? [] : [{ b: 'Current', v: d.aging.current, c: '#0058A8' }, { b: '1–30', v: d.aging.d1_30, c: '#3878B8' }, { b: '31–60', v: d.aging.d31_60, c: '#F79009' }, { b: '61–90', v: d.aging.d61_90, c: '#DC6803' }, { b: '91–180', v: d.aging.d91_180, c: '#B42318' }, { b: 'Over 180', v: d.aging.d180, c: '#7A271A' }].map((a) => ({ ...a, v: Number(a.v) || 0 }))), [d]);
  const k = (v: number | undefined) => (v == null ? '—' : v);
  const prevHint = d ? `vs ${formatDate(d.period.prevFrom)} – ${formatDate(d.period.prevTo)}` : undefined;
  const view = (code: string) => () => nav(`/reports/view/${code}`);
  const exportKpis = () => d && csvDownload(`executive-kpis-${d.period.from}-${d.period.to}`, [['KPI', 'Value', 'Previous period'], ['Period', `${d.period.from} to ${d.period.to}`, `${d.period.prevFrom} to ${d.period.prevTo}`], ['Scope', f.branch || f.region || 'All branches'],
    ['Fleet', d.fleet], ['On hire', d.onHire], ['Utilisation %', d.utilisation], ...d.utilByContractType.map((u) => [`Utilisation ${u.type} %`, u.pct]), ['Breakdown / repair', d.breakdown], ['Open job orders', d.openJos],
    ['Billed (period)', d.billedMtd, d.prev.billed], ['Collected (period)', d.collectedMtd, d.prev.collected], ['AR total', d.ar], ['Overdue %', Math.round(d.overduePct)], ['Clients on hold', d.onHold], ['Lift requests pending', d.liftPending], ...d.collectionStages.map((s) => [`Collection: ${s.stage}`, s.count]),
    ['Active contracts', d.activeContracts], ['Contracts signed (period)', d.contractsSigned, d.prev.signed], ['Pipeline', d.pipeline], ['New clients (period)', d.newClients, d.prev.newClients], ['Sales activities (period)', d.salesActivities],
    ['Open rescues', d.rescueOpen], ['Rescue avg response (h)', d.rescueResponseHrs], ['Rescue cost (period)', d.rescueCost, d.prev.rescueCost],
    ['Reg. expired', d.regExpired], ['Reg. ≤ 2 weeks', d.reg14], ['Reg. 2 weeks–1 month', d.reg30], ['Reg. 1–3 months', d.reg90], ['Accredited clients', d.accreditedClients], ['Contract renewals due (90 d)', d.renewalsDue], ['Pull-outs (period)', d.pullOuts], ['Returns (period)', d.returns], ['Visits (period)', d.visits], ['Calls (period)', d.calls], ['Inventory variances', d.invVariances],
    ...d.rescueByMonth.map((m) => [`Rescues ${m.month}`, m.count]), ...d.rescueByClient.map((c) => [`Rescues — ${c.clientName}`, c.count]), ['Reg. current', d.regCurrent], ['Reg. pending', d.regPending],
    ['Low-stock lines', d.lowStock], ['Pending POs', d.pendingPos], ['PM due (7d)', d.pmDue], ['Partner-owned', d.ownership.partner], ['E-wallet total', d.walletTotal], ['Negative wallets', d.negativeWallets],
    ['Active EWAs', d.ewasActive], ['EWA extensions pending', d.ewasExtPending], ['Late encoding pending', d.lateEncodingPending], ['Idle units (30+ days)', d.idleUnits], ['Repair turnaround (days)', d.repairTurnaroundDays],
    ['Cash bonds held', d.cashBondsHeld], ['Receipts awaiting clearance', d.receiptsAwaiting, d.receiptsAwaitingAmt], ['Memos pending approval', d.memosPending], ['Rescues requested (period)', d.rescuesInPeriod, d.prev.rescues]]);
  return (
    <>
      <PageHeader title="Executive dashboard" meta={<ScreenTag id="SCR-45" />} description={`Single source of truth across branches (OBJ-004, DBL-RPT-001). Refreshed every 15 minutes · ${formatDateTime(new Date().toISOString())}`}
        actions={<><Button variant="secondary" icon={<Download className="size-4" />} disabled={!d} onClick={exportKpis}>Export CSV</Button><Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button></>} />
      <div className="mb-5 flex flex-wrap items-end gap-2 print:hidden">
        <Select aria-label="Region" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value, branch: '' })} placeholder="All regions" options={regions} />
        <Select aria-label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={branchOptions.filter((b) => !f.region || ref?.branches.find((x) => x.code === b.value)?.region === f.region)} />
        <DateRangeFilter label="Period" from={f.from} to={f.to} onChange={(v) => setF({ ...f, ...v })} />
        {d && <span className="pb-2 text-xs text-muted">{formatDate(d.period.from)} – {formatDate(d.period.to)} (default month to date) · compared with {formatDate(d.period.prevFrom)} – {formatDate(d.period.prevTo)}</span>}
      </div>
      {data.isError && <Banner className="mb-4" tone="danger" title="Dashboard could not be loaded">{errMessage(data.error)}</Banner>}
      {data.isLoading && <p className="mb-4 text-sm text-muted">Loading KPIs…</p>}
      <Section>Operations</Section>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Fleet" value={k(d?.fleet)} onClick={() => nav('/chassis')} /><Tile label="On hire" value={k(d?.onHire)} onClick={() => nav('/allocation')} />
        <Tile label="Utilisation" value={d ? `${d.utilisation}%` : '—'} tone="success" hint="On hire ÷ fleet" onClick={view('DBL-RPT-010-06')} /><Tile label="Breakdown / repair" value={k(d?.breakdown)} tone="danger" onClick={() => nav('/repair')} />
        <Tile label="Open job orders" value={k(d?.openJos)} hint={d ? `incl. ${d.joDraft} draft · units in Breakdown or In repair: ${d.breakdown}` : undefined} onClick={view('DBL-RPT-010-04')} />
      </div>
      {/* Staff review 1.2: gate, idle and repair tiles. */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Active EWAs" value={k(d?.ewasActive)} hint={d ? `${d.ewasExtPending} extension${d.ewasExtPending === 1 ? '' : 's'} pending` : undefined} onClick={view('DBL-RPT-010-10')} />
        <Tile label="Late encoding pending" value={k(d?.lateEncodingPending)} tone={d?.lateEncodingPending ? 'warning' : 'default'} hint="Credit Memo path, awaiting DYM / Treasury" onClick={view('DBL-RPT-010-11')} />
        <Tile label="Idle units (30+ days)" value={k(d?.idleUnits)} hint="Available for 30 days or more" onClick={view('DBL-RPT-010-06')} />
        <Tile label="Repair turnaround" value={d?.repairTurnaroundDays != null ? `${d.repairTurnaroundDays} d` : '—'} hint="Average days, job order created → closed" onClick={view('DBL-RPT-010-04')} />
        <Tile label="Pull-outs (period)" value={k(d?.pullOuts)} delta={d?.pullOutsDelta} hint={prevHint} onClick={() => nav('/gate/eir')} />
      </div>
      <div className="mb-5 grid items-start gap-5 lg:grid-cols-3">
        <Card><CardHeader title="Fleet status" actions={<Button size="sm" variant="ghost" onClick={() => nav('/allocation')}>Details <ChevronRight className="size-4" /></Button>} />
          <div className="flex items-center gap-4"><div className="h-48 w-48 shrink-0"><ResponsiveContainer><PieChart><Pie data={d?.statusMix.filter((s) => s.count) ?? []} dataKey="count" nameKey="status" innerRadius={55} outerRadius={85} paddingAngle={2}>{(d?.statusMix.filter((s) => s.count) ?? []).map((s) => <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? '#667085'} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
          <ul className="space-y-1.5 text-xs">{d?.statusMix.filter((s) => s.count).map((s) => <li key={s.status} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: STATUS_COLORS[s.status] }} />{sentenceCase(s.status)} <span className="text-muted">{s.count}</span></li>)}</ul></div>
          <p className="mt-2 text-xs text-muted">Legend total = fleet ({d?.fleet ?? '—'}).</p>
        </Card>
        <Card><CardHeader title="Utilisation by contract type" description="On-hire units, % of fleet" actions={<Button size="sm" variant="ghost" onClick={view('DBL-RPT-011-03')}>Details <ChevronRight className="size-4" /></Button>} />
          <ul className="space-y-2 text-sm">{d?.utilByContractType.map((u) => <li key={u.type}><div className="flex justify-between"><span className="font-medium">{u.type}</span><span className="tabular">{u.units} units · {u.pct}%</span></div><div className="mt-1 h-2 rounded bg-surface-alt"><div className="h-2 rounded bg-brand-600" style={{ width: `${Math.min(100, u.pct)}%` }} /></div></li>)}</ul>
        </Card>
        <Card><CardHeader title="Utilisation by client" actions={<Button size="sm" variant="ghost" onClick={view('DBL-RPT-010-06')}>Details <ChevronRight className="size-4" /></Button>} />
          <ul className="divide-y divide-line text-sm">{d?.utilByClient.slice(0, 6).map((u) => <li key={u.clientCode} className="flex justify-between py-1.5"><button className="text-left text-brand-700 hover:underline" onClick={() => nav(`/clients/${u.clientCode}`)}>{u.clientName}</button><span className="tabular">{u.units} · {u.pct}%</span></li>)}
            {d && !d.utilByClient.length && <li className="py-2 text-muted">No units on hire in this scope.</li>}</ul>
        </Card>
      </div>
      <Section>Finance & collections</Section>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Billed (period)" value={formatPhp(d?.billedMtd)} delta={d?.billedDelta} hint={<>Invoices issued in period, incl. VAT · <span className="whitespace-nowrap">{prevHint}</span></>} onClick={() => nav('/billing/invoices')} />
        <Tile label="Collected (period)" value={formatPhp(d?.collectedMtd)} delta={d?.collectedDelta} tone="success" hint={prevHint} onClick={() => nav('/billing/receipts')} />
        <Tile label="AR total" value={formatPhp(d?.ar)} onClick={() => nav('/credit/aging')} /><Tile label="Overdue" value={d ? `${Math.round(d.overduePct)}%` : '—'} tone="danger" hint="Share of AR total past due (1 day or more)" onClick={() => nav('/credit/aging')} />
      </div>
      <p className="-mt-3 mb-4 text-xs text-muted">Collected counts receipts dated in the period that are cleared or OR issued. Provisional receipts, checks not yet deposited, bounced and cancelled receipts are left out; cleared e-wallet funding is included.</p>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Tile label="Cash bonds held" value={formatPhp(d?.cashBondsHeld)} hint={d ? `${d.cashBondCount} bond${d.cashBondCount === 1 ? '' : 's'} (held or withdrawal pending)` : undefined} onClick={view('DBL-RPT-014-10')} />
        <Tile label="Receipts awaiting clearance" value={k(d?.receiptsAwaiting)} tone={d?.receiptsAwaiting ? 'warning' : 'default'} hint={d ? `${formatPhp(d.receiptsAwaitingAmt)} · provisional or check not deposited` : undefined} onClick={() => nav('/billing/receipts')} />
        <Tile label="Memos pending approval" value={k(d?.memosPending)} hint="Credit and debit memos" onClick={() => nav('/billing/memos')} />
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader title="Receivables aging (6 buckets)" actions={<Button size="sm" variant="ghost" onClick={() => nav('/credit/aging')}>Details <ChevronRight className="size-4" /></Button>} />
          {/* Bars are drawn without animation: the card's width settles after the KPI grid lays out, and an in-flight
              recharts animation from the 0-width first measure left the bars stuck as slivers at the left edge. */}
          <div className="h-60 min-w-0">{aging.length ? <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 600, height: 240 }} debounce={50}>
            <BarChart key={aging.map((a) => a.v).join('|')} data={aging} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%"><CartesianGrid stroke="#EEF2F6" vertical={false} /><XAxis dataKey="b" type="category" interval={0} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis type="number" width={56} tickFormatter={(v: number) => `₱${Math.round(v / 1000)}k`} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: '#F1F5F9' }} formatter={(v: number) => formatPhp(v)} /><Bar dataKey="v" name="Balance" maxBarSize={64} isAnimationActive={false} radius={[4, 4, 0, 0]}>{aging.map((a) => <Cell key={a.b} fill={a.c} />)}</Bar></BarChart></ResponsiveContainer>
            : <p className="pt-8 text-center text-sm text-muted">{data.isLoading ? 'Loading…' : 'No receivables in this scope.'}</p>}</div>
        </Card>
        <Card><CardHeader title="Credit & collection" description="Holds, lift requests and collection stages" />
          <div className="grid grid-cols-2 gap-3"><Tile label="Clients on hold" value={k(d?.onHold)} tone="danger" onClick={() => nav('/credit/status')} /><Tile label="Lift requests pending" value={k(d?.liftPending)} tone="warning" onClick={() => nav('/approvals')} /></div>
          <ul className="mt-3 divide-y divide-line text-sm">{d?.collectionStages.map((s) => <li key={s.stage}><button className="flex w-full justify-between py-1.5 hover:text-brand-700" onClick={() => nav('/credit/aging')}><span>{s.stage}</span><span className="tabular font-medium">{s.count}</span></button></li>)}</ul>
        </Card>
      </div>
      <div className="mb-5 grid items-start gap-5 lg:grid-cols-3">
        <Card><CardHeader title="Sales" description="Contracts, pipeline and activity" />
          <div className="grid grid-cols-3 gap-3"><Tile label="Active contracts" value={k(d?.activeContracts)} onClick={view('DBL-RPT-011-03')} /><Tile label="Contracts signed" value={k(d?.contractsSigned)} delta={d?.contractsSignedDelta} hint="in period" onClick={view('DBL-RPT-011-03')} />
            <Tile label="Pipeline" value={k(d?.pipeline)} hint="Prospects + accreditations" onClick={view('DBL-RPT-011-01')} /><Tile label="New clients" value={k(d?.newClients)} delta={d?.newClientsDelta} hint="in period" onClick={() => nav('/clients/sales')} />
            <Tile label="Sales activities" value={k(d?.salesActivities)} delta={d?.salesActivitiesDelta} hint={d ? `${d.visits} visit${d.visits === 1 ? '' : 's'} · ${d.calls} call${d.calls === 1 ? '' : 's'} · in period` : 'Visits + calls'} onClick={() => nav('/clients/sales')} />
            <Tile label="Accredited clients" value={k(d?.accreditedClients)} hint="Active + on hold" onClick={() => nav('/clients')} /><Tile label="Renewals due" value={k(d?.renewalsDue)} hint="Contracts expiring ≤ 90 days" onClick={view('DBL-RPT-011-03')} />
            <Tile label="Pull-outs / returns" value={d ? `${d.pullOuts} / ${d.returns}` : '—'} hint="Gate Out / Gate In in period" onClick={() => nav('/gate/eir')} /></div>
        </Card>
        <Card><CardHeader title="Rescue" description="Open requests, response time and cost" />
          <div className="grid grid-cols-2 gap-3"><Tile label="Open rescues" value={k(d?.rescueOpen)} hint="Excludes completed / cancelled" onClick={view('DBL-RPT-010-03')} /><Tile label="Avg response" value={d?.rescueResponseHrs != null ? `${d.rescueResponseHrs} h` : '—'} hint="Request → dispatch" onClick={view('DBL-RPT-010-03')} />
            <Tile label="Rescue cost" value={formatPhp(d?.rescueCost)} delta={d?.rescueCostDelta} hint="Completed in period" onClick={view('DBL-RPT-010-03')} /><Tile label="Completed (all)" value={k(d?.rescueCompleted)} onClick={() => nav('/rescue/dashboard')} />
            <Tile label="Requested (period)" value={k(d?.rescuesInPeriod)} delta={d?.rescuesDelta} hint={prevHint} onClick={view('DBL-RPT-005-01')} /></div>
          {d && <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div><p className="mb-1 font-semibold uppercase tracking-wide text-muted">By month (last 6)</p><ul className="space-y-0.5">{d.rescueByMonth.map((m) => <li key={m.month} className="flex justify-between"><span>{formatDate(`${m.month}-01`).slice(3)}</span><span className="tabular font-medium">{m.count}</span></li>)}</ul></div>
            <div><p className="mb-1 font-semibold uppercase tracking-wide text-muted">By client</p><ul className="space-y-0.5">{d.rescueByClient.slice(0, 6).map((c) => <li key={c.clientCode} className="flex justify-between gap-2"><span className="truncate" title={c.clientName}>{c.clientName}</span><span className="tabular font-medium">{c.count}</span></li>)}{!d.rescueByClient.length && <li className="text-muted">No rescues.</li>}</ul></div>
            <button className="col-span-2 text-left text-brand-700 hover:underline" onClick={view('DBL-RPT-005-01')}>Rescues by month and client report →</button>
          </div>}
        </Card>
        <Card><CardHeader title="Compliance" description="Registration expiry status" />
          <div className="grid grid-cols-3 gap-3"><Tile label="Expired" value={k(d?.regExpired)} tone={d?.regExpired ? 'danger' : 'success'} hint="Target 0" onClick={() => nav('/regulatory/compliance')} /><Tile label="≤ 2 weeks" value={k(d?.reg14)} tone="danger" onClick={() => nav('/regulatory/compliance')} /><Tile label="2 weeks–1 month" value={k(d?.reg30)} tone="warning" onClick={() => nav('/regulatory/compliance')} />
            <Tile label="1–3 months" value={k(d?.reg90)} onClick={() => nav('/regulatory/compliance')} /><Tile label="Current" value={k(d?.regCurrent)} tone="success" onClick={view('DBL-RPT-013-02')} /><Tile label="Pending" value={k(d?.regPending)} onClick={view('DBL-RPT-013-03')} /></div>
        </Card>
      </div>
      <Section>Assets, inventory & e-wallet</Section>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <Tile label="DCIR (today)" value="Open" hint="Daily chassis inventory report" onClick={() => nav('/allocation/dcir')} /><Tile label="Inventory variances" value={k(d?.invVariances)} tone={d?.invVariances ? 'warning' : 'default'} hint="Last count ≠ system qty" onClick={view('DBL-RPT-012-03')} />
        <Tile label="Low-stock lines" value={k(d?.lowStock)} tone="warning" onClick={() => nav('/inventory')} /><Tile label="Pending POs" value={k(d?.pendingPos)} onClick={() => nav('/procurement?tab=po')} /><Tile label="PM due (7d)" value={k(d?.pmDue)} onClick={() => nav('/assets')} />
        <Tile label="Partner-owned" value={d ? `${d.ownership.partner}/${d.fleet}` : '—'} hint="Of total fleet" onClick={view('DBL-RPT-010-07')} /><Tile label="E-wallet total" value={formatPhp(d?.walletTotal)} onClick={() => nav('/ewallet')} /><Tile label="Negative wallets" value={k(d?.negativeWallets)} tone="danger" onClick={() => nav('/ewallet')} />
      </div>
      <p className="mt-4 text-xs text-muted">Tiles shown depend on your report permissions. Previous-period comparison uses the period of equal length immediately before the selected range.</p>
    </>
  );
}

type Catalog = ReturnType<typeof api.reports.catalog>;

// ── SCR-46 Report Library ───────────────────────────────────────────────────
export function ReportLibraryPage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [mod, setMod] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState('');
  const all = api.reports.catalog();
  const stats = useMemo(() => api.reports.runStats(), []);
  const rolesOf = (perm: string) => api.reports.rolesFor(perm);
  const modules =[...new Set(all.map((r) => r.module))].map((x) => ({ value: x, label: x }));
  const needle = q.trim().toLowerCase();
  const rows = all.filter((r) => (showAll || can(r.perm)) && (!mod || r.module === mod) && (!needle || `${r.code} ${r.frs} ${r.name} ${r.description} ${r.module}`.toLowerCase().includes(needle)));
  const groups = [...new Set(rows.map((r) => r.module))].map((m) => ({ module: m, rows: rows.filter((r) => r.module === m) }));
  const open = (r: Catalog[number]) => { if (r.status !== 'Available') return; nav(r.dataset || !can(r.perm) ? `/reports/view/${r.code}` : r.link!); };
  const columns: ColumnDef<Catalog[number]>[] = [
    { accessorKey: 'code', header: 'Code', meta: { nowrap: true }, cell: (c) => <span className="inline-block w-28 font-mono text-xs" title={`FRS ref. ${c.row.original.frs}`}>{c.getValue<string>()}</span> },
    { accessorKey: 'name', header: 'Report', meta: { nowrap: true }, cell: (c) => <span className="flex w-[20rem] flex-wrap items-center gap-2 font-medium"><FileBarChart className="size-4 shrink-0 text-brand-600" />{c.getValue<string>()}{c.row.original.restricted && <Badge tone="warning" icon={<Lock className="size-3" />}>Restricted</Badge>}{!can(c.row.original.perm) && <Badge tone="neutral" icon={<Lock className="size-3" />}>No access</Badge>}{c.row.original.status !== 'Available' && <Badge tone="neutral" dot={false}>Pending scope</Badge>}</span> },
    { accessorKey: 'description', header: 'Description', cell: (c) => <span className="line-clamp-2 text-xs text-ink-2">{stripCodes(c.getValue<string>())}</span> },
    // Staff review 1.2: roles that can open the report (from the role templates), formats, and last run / run count from the audit log.
    { id: 'roles', header: 'Who can open', cell: (c) => { const rs = rolesOf(c.row.original.perm).filter((r) => r.code !== 'SYS_ADMIN'); const t = rs.map((r) => r.label.replace(/\s*\(.*\)$/, '')); return <span className="block w-[13rem] text-xs text-ink-2" title={['System Administrator', ...t].join(', ')}>{t.slice(0, 3).join(', ') || 'System Administrator only'}{t.length > 3 && <span className="text-muted"> +{t.length - 3} more</span>}</span>; } },
    { id: 'formats', header: 'Formats', meta: { nowrap: true }, cell: (c) => <span className="text-xs text-muted">{c.row.original.status !== 'Available' ? '—' : c.row.original.dataset ? 'Screen · CSV · Print' : 'Opens the module screen'}</span> },
    { id: 'last', header: 'Last run', meta: { nowrap: true }, cell: (c) => { const s = stats[c.row.original.code]; return s?.lastRun ? <span className="text-xs"><span className="block">{formatDateTime(s.lastRun)}</span><span className="block text-muted">{s.lastBy} · {s.runs} run{s.runs === 1 ? '' : 's'}</span></span> : <span className="text-xs text-muted">{c.row.original.dataset ? 'Not run yet' : '—'}</span>; } },
    { id: 'go', header: '', cell: (c) => (c.row.original.status === 'Available' ? <ChevronRight className="size-4 text-muted" /> : null) }];
  const exportList = () => csvDownload('report-library', [['Code', 'FRS ref.', 'Report', 'Module', 'Description', 'Opens', 'Status', 'Who can open', 'Formats', 'Last run', 'Runs'], ...rows.map((r) => [r.code, r.frs, r.name, r.module, r.description, r.dataset ? 'Report' : 'Module screen', r.status,
    rolesOf(r.perm).map((x) => x.label).join('; '), r.status !== 'Available' ? '' : r.dataset ? 'Screen, CSV, Print' : 'Module screen', stats[r.code]?.lastRun ?? '', stats[r.code]?.runs ?? 0])]);
  return (
    <>
      <PageHeader title="Report library" meta={<ScreenTag id="SCR-46" />} description="Standard reports available to your role, grouped by module. Every report opens on screen with CSV export and print; PDF and XLSX downloads are coming soon." />
      <Card className="mb-4 px-4 py-3"><div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-disabled" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports…" aria-label="Search reports" className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-8 pr-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-100" /></div>
        <div className="min-w-36 max-w-52 flex-1"><Select aria-label="Module" value={mod} onChange={(e) => setMod(e.target.value)} placeholder="All modules" options={modules} /></div>
        <Checkbox label="Show reports I cannot open" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        <span className="ml-auto text-xs text-muted">{rows.length} report{rows.length === 1 ? '' : 's'}</span>
        <Button className="h-9" variant="secondary" size="sm" icon={<Download className="size-4" />} disabled={!rows.length} onClick={exportList}>Export</Button>
      </div></Card>
      {!groups.length && <Card><EmptyState title="No reports available" hint="No report matches the search, or none in this module is granted to your role." /></Card>}
      <div className="space-y-5">{groups.map((g) => <section key={g.module}>
        <Section>{`${g.module} (${g.rows.length})`}</Section>
        <DataTable data={g.rows} columns={columns} onRowClick={open} searchable={false} pageSize={500}
          rowClassName={(r) => (r.status !== 'Available' || !can(r.perm) ? 'opacity-60' : undefined)} />
      </section>)}</div>
      {rows.some((r) => r.status !== 'Available') && <p className="mt-3 text-xs text-muted">Reports marked “Pending scope” are listed for completeness; whether they are in this release is still to be decided.</p>}
      <p className="mt-1 text-xs text-muted">Codes follow the FRS report groups (DBL-RPT-&lt;group&gt;-&lt;nn&gt;); hover a code for its FRS reference. “Who can open” lists the role templates with access (the System Administrator can open every report). Scheduling and emailing reports are not offered yet (pending confirmation).</p>
    </>
  );
}

// ── SCR-46 Standard Report Viewer (reusable template) ───────────────────────
export function ReportViewerPage() {
  const { code = '' } = useParams();
  const { can } = useAuth();
  const nav = useNavigate();
  const { branchOptions, clientOptions } = useRefLookups();
  const item = api.reports.catalog().find((r) => r.code === code);
  const [draft, setDraft] = useState({ from: '', to: '', branch: '', client: '' });
  const [f, setF] = useState(draft);
  const [printing, setPrinting] = useState(false);
  const allowed = !!item && can(item.perm);
  const runnable = allowed && item?.status === 'Available' && !!item.dataset;
  const res = useData(['report', code, f], () => api.reports.run(code, f), runnable);
  // Staff review 1.2: report-specific pick-lists (e.g. status, unit type, region, plate month) built from the columns flagged `filter`.
  const [pick, setPick] = useState<Record<string, string>>({});
  const filterCols = (res.data?.columns ?? []).filter((c) => c.filter);
  const allRows = res.data?.rows ?? [];
  const viewRows = useMemo(() => allRows.filter((r) => Object.entries(pick).every(([k, v]) => !v || String(r[k] ?? '') === v)), [allRows, pick]);
  const summaryCol = (res.data?.columns ?? []).find((c) => c.summary);
  // One display rule for screen and print: money, numbers, ISO dates as dd-Mon-yyyy, empty as —.
  const show = (c: { money?: boolean; num?: boolean }, v: unknown) => c.money ? formatPhp(v as number) : c.num ? formatNumber(v as number) : v == null || v === '' ? '—' : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(v) : String(v);
  const cols = useMemo<ColumnDef<Record<string, unknown>>[]>(() => (res.data?.columns ?? []).map((c) => ({ accessorKey: c.key, header: c.label, meta: c.money || c.num ? { align: 'right' } : undefined,
    cell: (x) => show(c, x.getValue()) })), [res.data]);
  const totals = (res.data?.columns ?? []).filter((c) => c.money).map((c) => ({ label: c.label, v: viewRows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0) }));
  const header = <PageHeader breadcrumb={<Crumb items={[{ to: '/reports', label: 'Report library' }, { label: item?.name ?? 'Report' }]} />} title={item?.name ?? 'Report'} description={item ? `${item.module} — ${item.description}` : undefined}
    actions={runnable && <><Button variant="secondary" icon={<Printer className="size-4" />} disabled={!res.data?.rows.length} onClick={() => setPrinting(true)}>Print</Button></>} />;
  if (!item) return <>{header}<EmptyState title="Report not found" hint={`No report with code ${code}.`} action={<Button onClick={() => nav('/reports')}>Back to library</Button>} /></>;
  if (!allowed) return <>{header}<Banner tone="danger" title="You don’t have access to this report" actions={<Button size="sm" variant="secondary" onClick={() => nav('/reports')}>Back to library</Button>}><span className="flex items-center gap-2"><ShieldAlert className="size-4" />This report requires the “{item.perm}” permission{item.restricted ? ' and is role-restricted' : ''}. Ask your administrator for access. The attempt is not logged as a report run.</span></Banner></>;
  if (item.status !== 'Available') return <>{header}<Banner tone="info" title="Phase 2 / pending scope">This report is listed for completeness. Whether it is in this release is a client decision.</Banner></>;
  // Module-view reports are the module screen itself — go straight there instead of showing an interstitial.
  if (!item.dataset) return item.link ? <Navigate to={item.link} replace /> : <>{header}<EmptyState title="Report not available" hint="This report has no screen yet." action={<Button onClick={() => nav('/reports')}>Back to library</Button>} /></>;
  return (
    <>
      {header}
      <Card className="mb-4 print:hidden"><div className="flex flex-wrap items-end gap-3">
        <Input label="Date from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /><Input label="Date to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} error={draft.from && draft.to && draft.to < draft.from ? 'Must be on/after From' : undefined} />
        <Select label="Branch" value={draft.branch} onChange={(e) => setDraft({ ...draft, branch: e.target.value })} placeholder="All branches" options={branchOptions} />
        <Select label="Client" value={draft.client} onChange={(e) => setDraft({ ...draft, client: e.target.value })} placeholder="All clients" options={clientOptions} />
        <Button icon={<Play className="size-4" />} disabled={!!(draft.from && draft.to && draft.to < draft.from)} loading={res.isFetching} onClick={() => setF(draft)}>Run report</Button>
        <Button variant="ghost" onClick={() => { const e = { from: '', to: '', branch: '', client: '' }; setDraft(e); setF(e); setPick({}); }}>Reset</Button>
      </div>
      {!!filterCols.length && <div className="mt-3 flex flex-wrap items-end gap-3">{filterCols.map((c) => (
        <Select key={c.key} label={c.label} value={pick[c.key] ?? ''} onChange={(e) => setPick({ ...pick, [c.key]: e.target.value })} placeholder="All"
          options={[...new Set(allRows.map((r) => String(r[c.key] ?? '')).filter((v) => v && v !== '—'))].sort().map((v) => ({ value: v, label: v }))} />))}</div>}
      <p className="mt-2 text-xs text-muted">{item.dateBasis && <>Date from / to apply to the <strong>{item.dateBasis}</strong>. </>}Filters that do not apply to this report’s data (e.g. branch on a client-level report) are ignored. Each run and export is written to the audit log.</p></Card>
      {res.data && <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
        <span><strong className="tabular">{viewRows.length}</strong> record{viewRows.length === 1 ? '' : 's'}</span>
        {summaryCol && [...new Set(viewRows.map((r) => String(r[summaryCol.key] ?? '')))].sort().map((v) => <Badge key={v} tone="neutral" dot={false}>{v}: {viewRows.filter((r) => String(r[summaryCol.key] ?? '') === v).length}</Badge>)}
        <span className="ml-auto text-xs text-muted">Run {formatDateTime(res.data.runAt)} by {res.data.runBy}{viewRows.some((r) => r._link) ? ' · select a row to open its record' : ''}</span>
      </div>}
      {res.isError && <Banner className="mb-4" tone="danger" title="Report failed to run">{errMessage(res.error)}</Banner>}
      <DataTable data={res.data ? viewRows : undefined} loading={res.isLoading} columns={cols} exportName={item.code.toLowerCase()} emptyTitle="No rows for these filters" emptyHint="Widen the date range or clear branch / client."
        onRowClick={viewRows.some((r) => r._link) ? (r) => r._link && nav(String(r._link)) : undefined} />
      {!!totals.length && !!viewRows.length && <div className={cn('mt-3 flex flex-wrap justify-end gap-6 text-sm')}>{totals.map((t) => <span key={t.label}>{t.label}: <strong className="tabular">{formatPhp(t.v)}</strong></span>)}<span className="text-muted">{viewRows.length} rows</span></div>}
      {/* Print copy: document header, applied filters, every row (not just the current page), totals and footer. */}
      {res.data && (() => {
        const pc = res.data.columns, rows = viewRows;
        const scope = [f.from || f.to ? `Period ${f.from ? formatDate(f.from) : 'start'} – ${f.to ? formatDate(f.to) : 'today'}` : 'All dates', branchOptions.find((o) => o.value === f.branch)?.label ?? 'All branches', clientOptions.find((o) => o.value === f.client)?.label ?? 'All clients',
          ...filterCols.filter((c) => pick[c.key]).map((c) => `${c.label}: ${pick[c.key]}`)].join(' · ');
        const summary = summaryCol ? [...new Set(rows.map((r) => String(r[summaryCol.key] ?? '')))].sort().map((v) => `${v} ${rows.filter((r) => String(r[summaryCol.key] ?? '') === v).length}`).join(' · ') : '';
        return (
          <PrintPreview open={printing} onClose={() => setPrinting(false)} title={item.name} landscape={pc.length > 7}>
            <DocHeader title={item.name.toUpperCase()} no={`RPT-${todayManila()}`} date={formatDateTime(new Date().toISOString())} extra={<p>{rows.length} rows</p>} />
            <p className="mb-1"><span className="font-semibold">Scope:</span> {scope}{item.dateBasis ? ` (dates = ${item.dateBasis})` : ''} · {rows.length} records</p>
            <p className="mb-2">{summary && <><span className="font-semibold">Summary:</span> {summary} · </>}<span className="font-semibold">Run:</span> {formatDateTime(res.data.runAt)} by {res.data.runBy}</p>
            <table className="w-full border-collapse text-[10.5px]">
              <thead><tr className="bg-black/5">{pc.map((c) => <th key={c.key} className={cn('border border-black/40 px-1 py-1 text-left font-semibold', (c.money || c.num) && 'text-right')}>{c.label}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i} className="break-inside-avoid">{pc.map((c) => <td key={c.key} className={cn('border border-black/25 px-1 py-0.5', (c.money || c.num) && 'text-right tabular')}>{show(c, r[c.key])}</td>)}</tr>)}</tbody>
              {!!totals.length && <tfoot><tr className="font-semibold">{pc.map((c, i) => { const t = totals.find((x) => x.label === c.label); return <td key={c.key} className={cn('border border-black/40 px-1 py-1', t && 'text-right tabular')}>{t ? formatPhp(t.v) : i === 0 ? 'Total' : ''}</td>; })}</tr></tfoot>}
            </table>
            <DocFooter copy={item.name.toUpperCase()} />
          </PrintPreview>
        );
      })()}
    </>
  );
}
