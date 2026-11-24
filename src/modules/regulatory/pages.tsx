import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BellRing, CalendarCheck, ChevronRight, FileText, Paperclip, Pencil, Plus, RefreshCw, RotateCcw, Send, Upload } from 'lucide-react';
import { api } from '../../lib/api-client';
import { formatDate, formatDateTime, formatPhp, todayManila, type Registration } from '../../lib/shared';
import { Badge, Banner, Button, Card, CardHeader, Checkbox, DataTable, DateRangeFilter, Drawer, FormGrid, Input, KeyValueGrid, KpiTile, Modal, MoneyInput, PageHeader, Select, Stack, StatusBadge, Textarea, cn, type ColumnDef } from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, fieldError, useAction, useData, useRefLookups } from '../../shared/hooks';
import { ScreenTag } from '../../shared/components';

type Row = Awaited<ReturnType<typeof api.regulatory.list>>[number];
type Filters = { window: string; branch: string; region: string; unitType: string; plateEnding: string; onHire: string; status: string; from: string; to: string };
const EMPTY: Filters = { window: '', branch: '', region: '', unitType: '', plateEnding: '', onHire: '', status: '', from: '', to: '' };

const UNIT_TYPES = ['Chassis', 'Trailer', 'Vehicle', 'Motorcycle', 'Prime Mover'] as const;
// DBL-REG-002 schedule by last plate digit (LTO convention) — proposed mapping, confirm with Regulatory.
const MONTH_FOR = ['Oct', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
const PLATE_OPTS = '1234567890'.split('').map((d) => ({ value: d, label: `Ends in ${d} · ${MONTH_FOR[Number(d)]}` }));
const STATUS_OPTS = ['Registered', 'Expiring', 'Renewal In Progress', 'Expired', 'Pending'].map((x) => ({ value: x, label: x === 'Registered' ? 'Registered / current' : x }));
const STAGE_LABEL: Record<string, string> = { '90': '3-month', '30': '1-month', '14': '2-week', expired: 'Escalation', manual: 'Manual' };

const daysCell = (r: { daysLeft: number; pending?: boolean }) => r.pending || r.daysLeft === 99999 ? <span className="text-muted">—</span>
  : <span className={cn('tabular', r.daysLeft < 0 ? 'font-bold text-danger' : r.daysLeft <= 14 ? 'font-semibold text-danger' : r.daysLeft <= 90 ? 'text-warning' : 'text-ink-2')}>{r.daysLeft < 0 ? `${-r.daysLeft} days overdue` : `${r.daysLeft} days`}</span>;
/** Last notice as one chip; recipients on hover. */
const short = (iso: string) => formatDate(iso).slice(0, 6); // dd-Mon; full date in the tooltip
/** Staff review 1.2: the next notice on the 90 / 30 / 14-day cycle (escalation the day after expiry). */
const nextNoticeText = (r: Row) => (r.nextNotice ? `${r.nextNotice.stage === 'expired' ? (r.daysLeft < 0 ? 'Escalation on next run' : 'Escalation if not renewed') : `${STAGE_LABEL[r.nextNotice.stage]} notice`} · ${formatDate(r.nextNotice.at)}` : undefined);
const noticeCell = (r: Row) => {
  const next = nextNoticeText(r);
  const nextLine = next && <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted" title="Next notice">Next: {r.nextNotice!.stage === 'expired' ? 'escalation' : STAGE_LABEL[r.nextNotice!.stage]} {short(r.nextNotice!.at)}</p>;
  if (r.escalatedAt) return <span title={`Escalated to ${r.escalatedTo} on ${formatDate(r.escalatedAt)}`}><Badge tone="danger">Escalated {short(r.escalatedAt)}</Badge></span>;
  if (!r.lastNotice) return <div><span className="text-xs text-muted">{r.pending ? 'n/a (pending)' : 'Not yet due'}</span>{nextLine}</div>;
  return <div><span title={`${STAGE_LABEL[r.lastNotice.stage]} notice sent ${formatDate(r.lastNotice.at)} to ${r.lastNotice.recipients}${next ? ` · next: ${next}` : ''}`}><Badge tone={r.lastNotice.stage === 'manual' ? 'neutral' : 'warning'} dot={false}>{STAGE_LABEL[r.lastNotice.stage]} {short(r.lastNotice.at)}</Badge></span>{nextLine}</div>;
};
/** OR / CR copies on file (paperclip + count), or a warning when a registered unit has none. */
const docsLine = (r: Row) => (r.documents.length ? <span className="inline-flex items-center gap-0.5 text-[11px] text-muted" title={r.documents.join(', ')}><Paperclip className="size-3" />{r.documents.length} cop{r.documents.length === 1 ? 'y' : 'ies'}</span>
  : !r.pending ? <span className="text-[11px] font-medium text-warning">OR/CR copy missing</span> : null);
/** Status badge; a renewal in progress also shows who is processing it and the expected date. */
const statusCell = (r: Row) => <div><StatusBadge domain="registration" value={r.status} />{r.renewalInProgress && r.renewal && <p className="mt-0.5 max-w-40 text-[11px] text-muted" title={[r.renewal.reference, r.renewal.expectedDate && `expected ${formatDate(r.renewal.expectedDate)}`].filter(Boolean).join(' · ')}>{r.renewalByName ?? r.renewal.processedBy}{r.renewal.expectedDate ? ` · exp. ${short(r.renewal.expectedDate)}` : ''}</p>}</div>;
const unitCell = (r: Row, detail?: string) => <span className="font-mono font-medium" title={detail ? `${r.subjectType} · ${detail}` : r.subjectType}>{r.subjectId}</span>;
/** Strip the list's derived fields so an edit saves only the stored record. */
const toRecord = (r: Row): Registration => {
  const { daysLeft, status, window, chassisType, plateEnding, renewalMonth, offSchedule, category, onHire, clientCode, clientName, renewalCostEff, responsibleName, lastNotice, nextNotice, chassisStatus, allocatedTo, lastRenewal, renewalByName, ...base } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
  return base;
};
const onHireCell = (r: Row) => (r.onHire ? <div className="text-xs" title={r.clientName}><Badge tone="brand" dot={false}>On hire</Badge><p className="mt-0.5 max-w-40 truncate text-muted">{r.clientName}</p></div> : <span className="text-xs text-muted">Off hire</span>);
/** Two-line cell: value plus a muted second line. */
const twoLine = (main: ReactNode, sub?: ReactNode) => <div className="leading-tight">{main}{sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}</div>;
/** Combined values for merged columns, so the CSV export keeps every field. */
const withMerged = (r: Row) => ({ ...r,
  unitPlate: [r.subjectId, r.plateNo].filter(Boolean).join(' · '),
  plateRenewal: r.plateNo ? `${r.plateNo}${r.plateEnding ? ` (ends ${r.plateEnding} · ${r.renewalMonth})` : ''}` : '',
  orCr: [r.orNo && `OR ${r.orNo}`, r.crNo && `CR ${r.crNo}`, r.agency && r.agency !== 'LTO' && r.agency].filter(Boolean).join(' / '),
  expiryIssued: r.expiryDate ? `${r.expiryDate}${r.issueDate ? ` (issued ${r.issueDate})` : ''}` : '',
  branchRegion: [r.branchCode, r.region].filter(Boolean).join(' · ') });
type MRow = ReturnType<typeof withMerged>;
/** Same row actions on the Registration master and the Compliance dashboard: short text labels, full meaning in the tooltip. */
function RowActions({ row, open, onResend, resending, onFollowUp }: { row: Row; open: () => void; onResend?: () => void; resending?: boolean; onFollowUp?: () => void }) {
  const { can } = useAuth();
  const edit = can('reg.registration', 'edit');
  const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn(); };
  // The whole row opens the record, so no separate "Open" button; labelled actions wrap two per line to keep the table inside its card.
  return <div className="grid w-max grid-cols-[auto_auto] justify-items-start gap-0.5">
    {(!edit || row.pending) && <Button size="sm" variant="ghost" className="!px-2" onClick={stop(open)}>Open</Button>}
    {edit && !row.pending && <Button size="sm" variant="ghost" className="!px-2" title="Mark renewed" icon={<RefreshCw className="size-4" />} onClick={stop(open)}>Renew</Button>}
    {edit && !row.pending && onResend && <Button size="sm" variant="ghost" className="!px-2" title="Resend notice" icon={<Send className="size-4" />} loading={resending} onClick={stop(onResend)}>Resend</Button>}
    {edit && onFollowUp && <Button size="sm" variant="ghost" className="!px-2" title="Follow-up (responsible, date, cost)" icon={<CalendarCheck className="size-4" />} onClick={stop(onFollowUp)}>Follow-up</Button>}</div>;
}

function FilterBar({ f, setF, show }: { f: Filters; setF: (f: Filters) => void; show: (keyof Filters)[] }) {
  const { branchOptions, ref } = useRefLookups();
  const regions = [...new Set((ref?.branches ?? []).map((b) => b.region))].map((x) => ({ value: x, label: x }));
  const s = (k: keyof Filters) => show.includes(k);
  return <>
    {s('window') && <Select aria-label="Window" value={f.window} onChange={(e) => setF({ ...f, window: e.target.value })} placeholder="Any window" options={[{ value: 'expired', label: 'Expired' }, { value: '14', label: '≤ 2 weeks' }, { value: '30', label: '2 weeks–1 month' }, { value: '90', label: '1–3 months' }, { value: 'ok', label: 'Current (> 3 months)' }, { value: 'pending', label: 'Pending registration' }]} />}
    {s('status') && <Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" options={STATUS_OPTS} />}
    {s('unitType') && <Select aria-label="Unit type" value={f.unitType} onChange={(e) => setF({ ...f, unitType: e.target.value })} placeholder="All unit types" options={UNIT_TYPES.map((x) => ({ value: x, label: x }))} />}
    {s('region') && <Select aria-label="Region" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} placeholder="All regions" options={regions} />}
    {s('branch') && <Select aria-label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={branchOptions} />}
    {s('plateEnding') && <Select aria-label="Plate ending / renewal month" value={f.plateEnding} onChange={(e) => setF({ ...f, plateEnding: e.target.value })} placeholder="Plate ending" options={PLATE_OPTS} />}
    {s('onHire') && <Select aria-label="On hire" value={f.onHire} onChange={(e) => setF({ ...f, onHire: e.target.value })} placeholder="On & off hire" options={[{ value: 'yes', label: 'On hire' }, { value: 'no', label: 'Off hire' }]} />}
    {s('from') && <DateRangeFilter label="Expiry" from={f.from} to={f.to} onChange={(v) => setF({ ...f, ...v })} />}
    {JSON.stringify(f) !== JSON.stringify(EMPTY) && <Button variant="ghost" size="sm" onClick={() => setF(EMPTY)}>Clear</Button>}
  </>;
}

/** DBL-REG-006 counts: chassis & trailers by region; vehicles, motorcycles and prime movers nationwide; plus nationwide rollup. */
function RegionSummary({ rows }: { rows: Row[] }) {
  const cnt = (rs: Row[]) => ({ registered: rs.filter((r) => r.window === 'ok').length, near: rs.filter((r) => ['14', '30', '90'].includes(r.window)).length, expired: rs.filter((r) => r.window === 'expired').length, pending: rs.filter((r) => r.window === 'pending').length, total: rs.length });
  // Staff UI changes V1.4 (row 55, REG-006): regional counts for EVERY unit category — chassis & trailers, vehicles, motorcycles and
  // prime movers — each with a nationwide subtotal; the subtotals reconcile to the nationwide rollup.
  const groups: { label: string; match: (r: Row) => boolean }[] = [
    { label: 'Chassis & trailers', match: (r) => ['Chassis', 'Trailer'].includes(r.subjectType) }, { label: 'Vehicles', match: (r) => r.subjectType === 'Vehicle' },
    { label: 'Motorcycles', match: (r) => r.subjectType === 'Motorcycle' }, { label: 'Prime movers', match: (r) => r.subjectType === 'Prime Mover' },
  ];
  const regionOf = (r: Row) => r.region || 'Head Office';
  const lines: { label: string; sub?: boolean; c: ReturnType<typeof cnt>; strong?: boolean; subtotal?: boolean }[] = groups.flatMap((g) => {
    const rs = rows.filter(g.match); if (!rs.length) return [];
    const regions = [...new Set(rs.map(regionOf))].sort();
    return [...regions.map((reg) => ({ label: `${reg} — ${g.label.toLowerCase()}`, sub: true, c: cnt(rs.filter((r) => regionOf(r) === reg)) })), { label: `${g.label} — nationwide`, subtotal: true, c: cnt(rs) }];
  });
  const sumTotals = groups.reduce((a, g) => a + rows.filter(g.match).length, 0);
  lines.push({ label: `Nationwide rollup (all units)${sumTotals === rows.length ? '' : ' — check: category subtotals differ'}`, c: cnt(rows), strong: true });
  return (
    <Card padded={false} className="mb-5"><div className="border-b border-line px-5 py-3"><CardHeader className="mb-0" title="Compliance counts by region" description="Registered (current), near expiry (≤ 3 months), expired and pending registration — every unit category by region, with a nationwide subtotal per category and the nationwide rollup (REG-006)." /></div>
      <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead className="bg-surface-alt text-[11px] uppercase text-muted"><tr><th className="px-4 py-2 text-left">Region / category</th><th className="px-3 py-2 text-right">Registered</th><th className="px-3 py-2 text-right">Near expiry</th><th className="px-3 py-2 text-right">Expired</th><th className="px-3 py-2 text-right">Pending</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
        <tbody>{lines.map((l) => <tr key={l.label} className={cn('border-t border-line', l.strong && 'bg-surface-alt/60 font-semibold', l.subtotal && 'bg-surface-alt/30 font-medium')}><td className={cn('py-1.5', l.sub ? 'pl-8 pr-4 text-ink-2' : 'px-4')}>{l.label}</td><td className="px-3 py-1.5 text-right tabular text-success">{l.c.registered}</td><td className="px-3 py-1.5 text-right tabular text-warning">{l.c.near}</td><td className={cn('px-3 py-1.5 text-right tabular', l.c.expired && 'font-semibold text-danger')}>{l.c.expired}</td><td className="px-3 py-1.5 text-right tabular">{l.c.pending}</td><td className="px-3 py-1.5 text-right tabular">{l.c.total}</td></tr>)}</tbody></table></div>
    </Card>
  );
}

// ── SCR-42 Registration Master (OR/CR tracking) ────────────────────────────
export function RegistrationPage() {
  const [params, setParams] = useSearchParams();
  const [f, setF] = useState<Filters>(EMPTY);
  const data = useData(['regs', f], () => api.regulatory.list(f));
  const all = useData(['regs', 'all'], () => api.regulatory.list({}));
  const { eqName } = useRefLookups();
  const { can } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState<Registration | true | null>(null);
  const selId = params.get('id');
  const sel = (all.data ?? []).find((r) => r.id === selId) ?? null;
  const run = useAction(() => api.regulatory.runNotices(), { success: (n) => `${n} notice(s) sent (90/30 days → Regulatory + Accounting; 14 days → Operations + Sales; expired → escalation)` });
  const rows = all.data ?? [];
  const chassisRecs = rows.filter((r) => r.subjectType === 'Chassis').length;
  const view = useMemo(() => data.data?.map(withMerged), [data.data]);
  const cols: ColumnDef<MRow>[] = [
    { accessorKey: 'subjectId', header: 'Unit', cell: (c) => unitCell(c.row.original, c.row.original.subjectType === 'Chassis' ? eqName(c.row.original.chassisType) : c.row.original.description) },
    { accessorKey: 'plateRenewal', header: 'Plate · renewal', cell: (c) => { const r = c.row.original; return r.plateNo ? twoLine(r.plateNo, r.plateEnding && <span className="tabular">Ends {r.plateEnding} · {r.renewalMonth}{r.offSchedule && <span className="ml-1 font-semibold text-warning" title={`Expiry month (${formatDate(r.expiryDate).slice(3, 6)}) differs from the plate-ending month (${r.renewalMonth}). Confirm with Regulatory.`}>· off schedule</span>}</span>) : <span className="text-muted">—</span>; } },
    { accessorKey: 'subjectType', header: 'Unit type', meta: { nowrap: true } },
    { accessorKey: 'orCr', header: 'OR / CR no.', cell: (c) => { const r = c.row.original; return r.orNo || r.crNo ? <div>{twoLine(r.orNo || '—', <>{r.crNo || '—'}{r.agency && r.agency !== 'LTO' ? ` · ${r.agency}` : ''}</>)}{docsLine(r)}</div> : <span className="text-muted">—</span>; } },
    { accessorKey: 'expiryIssued', header: 'Expiry', cell: (c) => { const r = c.row.original; return r.expiryDate ? twoLine(formatDate(r.expiryDate), r.issueDate && `Issued ${formatDate(r.issueDate)}`) : <span className="text-muted">—</span>; } },
    { accessorKey: 'daysLeft', header: 'Days left', meta: { align: 'right' }, cell: (c) => daysCell(c.row.original) },
    { accessorKey: 'branchCode', header: 'Branch' },
    { accessorKey: 'onHire', header: 'On hire / client', cell: (c) => onHireCell(c.row.original) },
    { accessorKey: 'status', header: 'Status', cell: (c) => statusCell(c.row.original) },
    { id: 'notice', header: 'Last / next notice', cell: (c) => noticeCell(c.row.original) },
    { id: 'a', header: '', cell: (c) => <RowActions row={c.row.original} open={() => setParams({ id: c.row.original.id })} /> },
  ];
  return (
    <>
      <PageHeader title="Registration master (OR/CR)" meta={<ScreenTag id="SCR-42" />} description="Every chassis, trailer, vehicle, motorcycle and prime mover registration with expiry tracking (DBL-REG-001). Renewal schedule by plate-ending digit (DBL-REG-002). Expired registrations block Gate Out and the Available sign-off (BR-07). Target: zero expired (DBL-REG-004)."
        actions={<>{can('reg.registration', 'add') && <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setForm(true)}>Add record</Button>}<Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => alert('LTO reference upload (INT-004): CSV/XLSX → discrepancy report. Connects to the API in the build phase.')}>LTO reference upload</Button>
          {can('reg.registration', 'edit') && <Button icon={<BellRing className="size-4" />} loading={run.isPending} onClick={() => run.mutate(undefined)} title="Notices also run automatically every day">Run expiry notices</Button>}</>} />
      {all.isError && <Banner className="mb-4" tone="danger" title="Registrations could not be loaded">{errMessage(all.error)}</Banner>}
      {/* Review 1.1 (DBL-REG-006): status counts on this screen too; a tile filters the list. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(['Registered', 'Expiring', 'Renewal In Progress', 'Expired', 'Pending'] as const).map((s) => { const cnt = rows.filter((r) => r.status === s).length; return <KpiTile key={s} label={s === 'Registered' ? 'Registered / current' : s === 'Pending' ? 'Pending registration' : s} value={all.isLoading ? '—' : cnt} hint={s === 'Expired' ? 'Target 0' : s === 'Expiring' ? 'Within 3 months' : undefined} tone={s === 'Expired' ? (cnt ? 'danger' : 'success') : s === 'Expiring' ? 'warning' : s === 'Registered' ? 'success' : 'default'} onClick={() => setF({ ...f, status: f.status === s ? '' : s })} />; })}
        <KpiTile label="Off plate schedule" value={all.isLoading ? '—' : rows.filter((r) => r.offSchedule).length} hint="Expiry month ≠ plate month" />
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p>{rows.length} records: {chassisRecs} chassis + {rows.length - chassisRecs} trailers, vehicles, motorcycles and prime movers. Notices run daily at the 3-month, 1-month and 2-week marks.</p>
        <Button size="sm" variant="ghost" onClick={() => nav('/regulatory/compliance')}>Compliance counts by region <ChevronRight className="size-4" /></Button>
      </div>
      <DataTable data={view} loading={data.isLoading} columns={cols} onRowClick={(r) => setParams({ id: r.id })} exportName="registrations" emptyTitle="No registration records match the filters" emptyHint="Clear the filters or add a record."
        rowClassName={(r) => (r.window === 'expired' ? 'bg-danger-bg/40' : undefined)}
        toolbar={<FilterBar f={f} setF={setF} show={['window', 'status', 'unitType', 'branch', 'plateEnding', 'onHire']} />} />
      {sel && <RegDrawer row={sel} onClose={() => setParams({})} onEdit={() => setForm(toRecord(sel))} />}
      {form && <RegFormModal init={form === true ? undefined : form} onClose={() => setForm(null)} />}
    </>
  );
}

function RegDrawer({ row: sel, onClose, onEdit }: { row: Row; onClose: () => void; onEdit: () => void }) {
  const { can, user } = useAuth();
  const { userName } = useRefLookups();
  const hist = useData(['reg-history', sel.id, sel.notices?.length, sel.renewals?.length, sel.renewalInProgress, sel.documents.length], () => api.regulatory.history(sel.id));
  const blank = { orNo: '', crNo: '', issueDate: todayManila(), newExpiry: '', cost: 0, receiptNo: '', ltoRef: sel.renewal?.reference ?? '', documents: [] as string[] };
  const [renew, setRenew] = useState(blank);
  const [startOpen, setStartOpen] = useState(false);
  const [fu, setFu] = useState({ followUp: sel.followUp ?? '', followUpDate: sel.followUpDate ?? '', renewalCost: sel.renewalCostEff });
  const doRenew = useAction(() => api.regulatory.renew(sel.id, renew), { success: 'Renewed — notice cycle restarted and audited', onSuccess: () => setRenew({ ...blank, ltoRef: '' }) });
  const restart = useAction(() => api.regulatory.restartCycle(sel.id), { success: 'Monitoring cycle restarted' });
  const resend = useAction(() => api.regulatory.resendNotice(sel.id), { success: 'Notice resent' });
  const saveFu = useAction(() => api.regulatory.setFollowUp(sel.id, { followUp: fu.followUp || undefined, followUpDate: fu.followUpDate || undefined, renewalCost: fu.renewalCost }), { success: 'Follow-up saved' });
  const upload = useAction((names: string[]) => api.regulatory.attach(sel.id, names), { success: 'Document attached (audited)' });
  const edit = can('reg.registration', 'edit');
  const renewErr = renew.newExpiry && sel.expiryDate && renew.newExpiry <= sel.expiryDate ? 'Must be after the current expiry' : renew.newExpiry && renew.issueDate && renew.newExpiry <= renew.issueDate ? 'Must be after the new issue date' : undefined;
  const lr = sel.lastRenewal;
  const unitState = sel.chassisStatus ? `${sel.chassisStatus}${sel.allocatedTo ? ` · allocated to ${sel.allocatedTo}` : sel.onHire ? ` · ${sel.clientName}` : ''}` : sel.subjectType === 'Chassis' ? '—' : 'Company unit (not leased)';
  return (
    <Drawer open onClose={onClose} title={`${sel.subjectId}${sel.plateNo ? ` · plate ${sel.plateNo}` : ''}`} width="max-w-2xl"
      footer={edit && <><Button variant="secondary" icon={<Pencil className="size-4" />} onClick={onEdit}>Edit</Button>{!sel.pending && <Button variant="secondary" icon={<Send className="size-4" />} loading={resend.isPending} onClick={() => resend.mutate(undefined)}>Resend notice</Button>}<Button variant="secondary" icon={<RotateCcw className="size-4" />} loading={restart.isPending} onClick={() => restart.mutate(undefined)}>Restart cycle</Button></>}>
      <Stack>
        <div className="flex flex-wrap items-center gap-2"><StatusBadge domain="registration" value={sel.status} />{daysCell(sel)}{sel.window === 'expired' && <Badge tone="danger">Gate Out & Available sign-off blocked</Badge>}{sel.onHire && <Badge tone="brand" dot={false}>On hire · {sel.clientName}</Badge>}{sel.allocatedTo && <Badge tone="warning" dot={false}>Allocated · {sel.allocatedTo}</Badge>}</div>
        {sel.window === 'expired' && (sel.allocatedTo || sel.onHire) && <Banner tone="danger" title={sel.allocatedTo ? `Allocated to ${sel.allocatedTo} — cannot be released` : `Already out on hire with ${sel.clientName}`}>
          {sel.allocatedTo ? 'Gate Out refuses this unit until the renewal is recorded here; the allocation stays, so tell the AE / client about the delay or swap the unit on the Allocation board.' : 'The unit left the yard before the registration expired. It cannot be re-released after it returns until renewed. What to do while it is out (client notice, recall, billing) is pending confirmation (Q-REG-HIRE).'}</Banner>}
        <KeyValueGrid cols={3} items={[{ label: 'Unit type', value: sel.subjectType }, { label: 'OR no.', value: sel.orNo || '—' }, { label: 'CR no.', value: sel.crNo || '—' }, { label: 'Issue date', value: formatDate(sel.issueDate) }, { label: 'Expiry date', value: formatDate(sel.expiryDate) }, { label: 'Renewal month', value: sel.renewalMonth ? `${sel.renewalMonth} (plate ends ${sel.plateEnding})${sel.offSchedule ? ` — expiry is in ${formatDate(sel.expiryDate).slice(3, 6)}, off schedule` : ''}` : '—' },
          { label: 'Agency', value: sel.agency }, { label: 'Branch / region', value: `${sel.branchCode ?? '—'} · ${sel.region}` }, { label: 'Responsible', value: sel.responsibleName ?? '—' },
          { label: 'Unit status / client', value: unitState }, { label: 'Next notice', value: nextNoticeText(sel) ?? (sel.escalatedAt ? `None — escalated ${formatDate(sel.escalatedAt)}` : '—') },
          { label: 'Last renewed', value: lr ? `${formatDate(lr.at)} by ${userName(lr.by)}${lr.receiptNo ? ` · receipt ${lr.receiptNo}` : ''}${lr.cost ? ` · ${formatPhp(lr.cost)}` : ''}` : '—' },
          ...(sel.feePaid || sel.feeReceiptNo ? [{ label: 'Registration fee paid', value: `${sel.feePaid ? formatPhp(sel.feePaid) : '—'}${sel.feeReceiptNo ? ` · receipt ${sel.feeReceiptNo}` : ''}` }] : []),
          ...(sel.notes ? [{ label: 'Notes', value: sel.notes }] : [])]} />
        <Card><CardHeader title="Documents (OR/CR copies)" description={sel.onHire ? 'On-hire unit — client-portal visibility of these copies is pending confirmation (Q-REG-PORTAL).' : undefined} />
          <ul className="mb-2 space-y-1 text-sm">{sel.documents.map((d) => <li key={d} className="flex items-center gap-1.5"><Paperclip className="size-3.5 text-muted" />{d}</li>)}{!sel.documents.length && <li className="text-muted">No documents uploaded.</li>}</ul>
          {edit && <Input aria-label="Upload OR/CR copy" type="file" multiple accept=".pdf,image/*" onChange={(e) => e.target.files?.length && upload.mutate(Array.from(e.target.files).map((x) => x.name))} />}
        </Card>
        {edit && !sel.pending && <Card className="bg-surface-alt/40"><CardHeader title="Renewal" description="Start renewal → record the new OR and expiry → the 90/30/14-day monitoring cycle restarts (DBL-REG-004, WF-11). Every step is audited." actions={<Button size="sm" variant="secondary" disabled={sel.renewalInProgress} onClick={() => setStartOpen(true)}>{sel.renewalInProgress ? 'Renewal in progress' : 'Start renewal'}</Button>} />
          {sel.renewalInProgress && <p className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink-2">In progress{sel.renewal ? <> since {formatDate(sel.renewal.startedAt)} · processed by <strong>{sel.renewalByName ?? sel.renewal.processedBy ?? '—'}</strong>{sel.renewal.reference ? ` · ${sel.renewal.reference}` : ''}{sel.renewal.expectedDate ? ` · expected ${formatDate(sel.renewal.expectedDate)}` : ''}</> : ' (no details recorded)'}</p>}
          <FormGrid cols={3}>
            <Input label="New OR no." required value={renew.orNo} placeholder="e.g. OR7000000" onChange={(e) => setRenew({ ...renew, orNo: e.target.value })} />
            <Input label="New CR no." value={renew.crNo} placeholder={sel.crNo ? `Blank = keep ${sel.crNo}` : 'e.g. CR8000000'} onChange={(e) => setRenew({ ...renew, crNo: e.target.value })} hint="Only if LTO issued a new CR" />
            <Input label="Renewal / new issue date" type="date" required value={renew.issueDate} onChange={(e) => setRenew({ ...renew, issueDate: e.target.value })} />
            <Input label="New expiry date" type="date" required value={renew.newExpiry} error={renewErr} onChange={(e) => setRenew({ ...renew, newExpiry: e.target.value })} />
            <MoneyInput label="Actual renewal cost (paid)" value={renew.cost || ''} onChange={(e) => setRenew({ ...renew, cost: Number(e.target.value) })} hint="What LTO charged — kept for actual vs forecast" />
            <Input label="Payment receipt / LTO reference" value={renew.receiptNo} placeholder="e.g. LTO-RCPT-530100" onChange={(e) => setRenew({ ...renew, receiptNo: e.target.value })} />
          </FormGrid>
          <Input className="mt-3" label="New OR / CR copy" type="file" multiple accept=".pdf,image/*" onChange={(e) => e.target.files && setRenew({ ...renew, documents: Array.from(e.target.files).map((x) => x.name) })} hint={renew.documents.length ? `Attached: ${renew.documents.join(', ')}` : 'Scanned copy of the renewed OR / CR (PDF / image)'} />
          <div className="mt-3 flex items-center justify-between gap-2"><p className="text-xs text-muted">Renewed by: you ({user?.name ?? '—'}) — recorded with the date in the audit trail.</p><Button icon={<RefreshCw className="size-4" />} loading={doRenew.isPending} disabled={!renew.orNo || !renew.newExpiry || !renew.issueDate || !!renewErr} onClick={() => doRenew.mutate(undefined)}>Mark renewed</Button></div>
        </Card>}
        {!!sel.renewals?.length && <Card><CardHeader title="Renewal history" description="Each renewal with who recorded it, the receipt and the actual cost." />
          <ul className="space-y-1.5 text-sm">{[...sel.renewals].reverse().map((h, i) => <li key={i} className="flex flex-wrap justify-between gap-x-3"><span>{formatDate(h.issueDate)} → {formatDate(h.expiryDate)} · OR {h.orNo}{h.crNo ? ` / CR ${h.crNo}` : ''}{h.receiptNo ? ` · receipt ${h.receiptNo}` : ''}{h.documents?.length ? ` · ${h.documents.length} cop${h.documents.length === 1 ? 'y' : 'ies'}` : ''}</span><span className="shrink-0 text-xs text-muted">{h.cost ? `${formatPhp(h.cost)} · ` : ''}{userName(h.by)} · {formatDate(h.at)}</span></li>)}</ul></Card>}
        {edit && <Card><CardHeader title="Follow-up & budget" description="Accountability for each expiring registration (BO-REG-05) and renewal cost for the budget forecast (BO-REG-06)." />
          <FormGrid cols={3}><Input label="Follow-up" value={fu.followUp} placeholder="e.g. Documents filed at LTO, awaiting release" onChange={(e) => setFu({ ...fu, followUp: e.target.value })} /><Input label="Follow-up date" type="date" value={fu.followUpDate} onChange={(e) => setFu({ ...fu, followUpDate: e.target.value })} /><MoneyInput label="Budget estimate (next renewal)" value={fu.renewalCost || ''} onChange={(e) => setFu({ ...fu, renewalCost: Number(e.target.value) })} hint="Used in the budget forecast. Default from settings (pending Q-REG-COST); the actual cost is entered on Mark renewed." /></FormGrid>
          <p className="mt-2 text-xs text-muted">The follow-up date is the next date to chase the renewal — move it forward each time you follow up.</p>
          <div className="mt-3 flex justify-end"><Button size="sm" variant="secondary" loading={saveFu.isPending} onClick={() => saveFu.mutate(undefined)}>Save follow-up</Button></div></Card>}
        <Card><CardHeader title="Notification history" description="3-month & 1-month → Regulatory + Accounting; 2-week → Operations + Sales (DBL-REG-003); expired → escalation." />
          <ul className="space-y-1.5 text-sm">{(hist.data?.notices ?? []).map((n, i) => <li key={i} className="flex justify-between gap-3"><span><Badge tone={n.stage === 'expired' ? 'danger' : n.stage === 'manual' ? 'neutral' : 'warning'} dot={false}>{STAGE_LABEL[n.stage]}</Badge> {n.recipients}</span><span className="shrink-0 text-xs text-muted">{formatDateTime(n.at)}</span></li>)}
            {!hist.data?.notices.length && <li className="text-muted">No notices sent yet.</li>}</ul></Card>
        <Card><CardHeader title="Audit trail" />
          <ul className="space-y-1 text-sm">{(hist.data?.audit ?? []).map((a) => <li key={a.id} className="flex justify-between gap-3"><span><span className="font-mono text-xs">{a.action}</span>{a.reason ? ` — ${a.reason}` : ''}</span><span className="shrink-0 text-xs text-muted">{userName(a.actor)} · {formatDateTime(a.at)}</span></li>)}
            {!hist.data?.audit.length && <li className="text-muted">No changes recorded yet. Edits, Start renewal, Mark renewed, uploads, escalations and resent notices appear here with who and when.</li>}</ul></Card>
      </Stack>
      {startOpen && <StartRenewalModal row={sel} onClose={() => setStartOpen(false)} />}
    </Drawer>
  );
}

function RegFormModal({ init, onClose }: { init?: Registration; onClose: () => void }) {
  const { branchOptions, ref } = useRefLookups();
  const isNew = !init;
  const [v, setV] = useState<Registration>(init ?? { id: '', subjectType: 'Chassis', subjectId: '', plateNo: '', orNo: '', crNo: '', issueDate: '', expiryDate: '', agency: 'LTO', region: 'NCR', renewalInProgress: false, documents: [], pending: false, branchCode: '' });
  const [touched, setTouched] = useState(false);
  const set = (p: Partial<Registration>) => setV({ ...v, ...p });
  const miss = (k: 'orNo' | 'crNo' | 'plateNo' | 'issueDate' | 'expiryDate') => (touched && !v.pending && !String(v[k] ?? '').trim() ? 'Required — Missing OR/CR data' : undefined);
  const orderErr = v.issueDate && v.expiryDate && v.expiryDate <= v.issueDate ? 'Expiry date must be after the issue date' : undefined;
  // Staff review 1.2: show how the status will be set (same rule as the list: api.regulatory.list).
  const daysToExp = v.expiryDate ? Math.round((Date.parse(v.expiryDate) - Date.parse(todayManila())) / 86_400_000) : undefined;
  const derivedStatus = v.pending ? 'Pending' : daysToExp === undefined ? '—' : daysToExp < 0 ? 'Expired' : v.renewalInProgress ? 'Renewal In Progress' : daysToExp <= 90 ? 'Expiring' : 'Registered';
  // DBL-REG-002 check at entry: warn (not block) when the expiry month is not the plate-ending renewal month.
  const plateDigit = v.plateNo.replace(/\D/g, '').slice(-1);
  const offSched = !v.pending && plateDigit && v.expiryDate && Number(v.expiryDate.slice(5, 7)) !== (Number(plateDigit) || 10)
    ? `Plate ends ${plateDigit} → LTO renewal month is ${MONTH_FOR[Number(plateDigit)]}; this expiry is in another month. Check the date or confirm with Regulatory.` : undefined;
  const act = useAction(() => api.regulatory.save({ ...v, region: ref?.branches.find((b) => b.code === v.branchCode)?.region ?? v.region }, isNew), { success: isNew ? 'Registration record added (audited)' : 'Registration updated (audited)', onSuccess: onClose });
  const fe = (k: string) => fieldError(act.error, k);
  return (
    <Modal open onClose={onClose} title={isNew ? 'Add registration record' : `Edit registration — ${init.subjectId}`} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.isPending} disabled={!!orderErr} onClick={() => { setTouched(true); act.mutate(undefined); }}>Save</Button></>}>
      <Stack>
        <FormGrid cols={3}>
          <Select label="Unit type" required value={v.subjectType} onChange={(e) => set({ subjectType: e.target.value as Registration['subjectType'] })} options={UNIT_TYPES.map((x) => ({ value: x, label: x }))} disabled={!isNew} />
          <Input label={v.subjectType === 'Chassis' ? 'Chassis no.' : 'Unit / asset no.'} required value={v.subjectId} readOnly={!isNew} placeholder={v.subjectType === 'Chassis' ? 'e.g. DW-MNL-1001' : 'e.g. AST-FL-007'} onChange={(e) => set({ subjectId: e.target.value })} error={fe('subjectId') ?? (touched && !v.subjectId ? 'Required' : undefined)} />
          <Select label="Branch" value={v.branchCode ?? ''} onChange={(e) => set({ branchCode: e.target.value })} placeholder={v.subjectType === 'Chassis' ? 'From chassis master' : 'Select'} options={[{ value: 'HO', label: 'HO — Head Office' }, ...branchOptions]} />
        </FormGrid>
        <Checkbox label="Pending registration (new unit, no OR/CR yet)" checked={!!v.pending} onChange={(e) => set({ pending: e.target.checked })} />
        <FormGrid cols={3}>
          <Input label="Plate no." required={!v.pending} value={v.plateNo} placeholder="e.g. ABC 1234" onChange={(e) => set({ plateNo: e.target.value.toUpperCase() })} error={fe('plateNo') ?? miss('plateNo')} hint={v.plateNo ? `Renewal month: ${MONTH_FOR[Number(v.plateNo.replace(/\D/g, '').slice(-1) || 0)]}` : undefined} />
          <Input label="OR no." required={!v.pending} value={v.orNo} placeholder="e.g. OR7000000" onChange={(e) => set({ orNo: e.target.value })} error={fe('orNo') ?? miss('orNo')} />
          <Input label="CR no." required={!v.pending} value={v.crNo} placeholder="e.g. CR8000000" onChange={(e) => set({ crNo: e.target.value })} error={fe('crNo') ?? miss('crNo')} />
          <Input label="Issue date" type="date" required={!v.pending} value={v.issueDate} onChange={(e) => set({ issueDate: e.target.value })} error={fe('issueDate') ?? miss('issueDate')} />
          <Input label="Expiry date" type="date" required={!v.pending} value={v.expiryDate} onChange={(e) => set({ expiryDate: e.target.value })} error={orderErr ?? fe('expiryDate') ?? miss('expiryDate')} hint={offSched ? <span className="text-warning">{offSched}</span> : 'Normally 1 year after the issue date, in the plate-ending month'} />
          <Input label="Agency" value={v.agency} placeholder="e.g. LTO" onChange={(e) => set({ agency: e.target.value })} />
          <MoneyInput label="Registration fee paid" value={v.feePaid || ''} onChange={(e) => set({ feePaid: Number(e.target.value) || undefined })} hint="Optional — amount on the LTO receipt" />
          <Input label="Fee receipt no." value={v.feeReceiptNo ?? ''} placeholder="e.g. LTO-RCPT-530100" onChange={(e) => set({ feeReceiptNo: e.target.value || undefined })} />
          <div><p className="mb-1.5 text-[13px] font-medium text-ink-2">Registration status</p><div className="flex h-9 items-center">{derivedStatus === '—' ? <span className="text-sm text-muted">Set from the dates</span> : <StatusBadge domain="registration" value={derivedStatus} />}</div>
            <p className="mt-1 text-xs text-muted">Automatic: Pending (box ticked), Current, Expiring (≤ 90 days), Expired (past expiry). Renewal In Progress is set with Start renewal on the record.</p></div>
        </FormGrid>
        <Textarea label="Notes / remarks" rows={2} value={v.notes ?? ''} placeholder="e.g. Plate still with the previous owner; LTO transfer filed" onChange={(e) => set({ notes: e.target.value || undefined })} />
        <Input label="OR/CR documents" type="file" multiple accept=".pdf,image/*" onChange={(e) => e.target.files && set({ documents: [...v.documents, ...Array.from(e.target.files).map((x) => x.name)] })} hint={v.documents.length ? `Attached: ${v.documents.join(', ')}` : 'Scanned OR and CR copies (PDF / image)'} />
        {act.error && <Banner tone="danger" title={(act.error as { code?: string }).code === 'MISSING_ORCR' ? 'Missing OR/CR data' : 'Cannot save'}>{errMessage(act.error)}</Banner>}
        <p className="text-xs text-muted">Changes are written to the audit trail with before/after values.</p>
      </Stack>
    </Modal>
  );
}

/** Staff review 1.2: Start renewal records who processes it, the LTO appointment / reference and the expected completion date. */
function StartRenewalModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const { ref } = useRefLookups();
  const [v, setV] = useState({ processedBy: row.responsible ?? '', reference: row.renewal?.reference ?? '', expectedDate: row.followUpDate ?? '' });
  const act = useAction(() => api.regulatory.markInProgress(row.id, v), { success: 'Renewal started (in progress) — audited', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Start renewal — ${row.subjectId}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.isPending} disabled={!v.processedBy} onClick={() => act.mutate(undefined)}>Start renewal</Button></>}>
      <FormGrid>
        <Select label="Processed by" required value={v.processedBy} onChange={(e) => setV({ ...v, processedBy: e.target.value })} placeholder="Select" options={(ref?.users ?? []).filter((u) => u.roles.some((r) => ['REGULATORY', 'OPS_MANAGER', 'BRANCH_GENERALIST', 'APS_OFFICER'].includes(r))).map((u) => ({ value: u.userId, label: u.name }))} />
        <Input label="Expected completion" type="date" value={v.expectedDate} onChange={(e) => setV({ ...v, expectedDate: e.target.value })} />
        <Input label="LTO appointment / reference" value={v.reference} placeholder="e.g. LTO appointment 88010" onChange={(e) => setV({ ...v, reference: e.target.value })} />
      </FormGrid>
      <p className="mt-3 text-xs text-muted">The status changes to Renewal In Progress. The unit stays blocked at Gate Out if the registration has already expired.</p>
    </Modal>
  );
}

function FollowUpModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const { ref } = useRefLookups();
  const [v, setV] = useState({ responsible: row.responsible ?? '', followUp: row.followUp ?? '', followUpDate: row.followUpDate ?? '', renewalCost: row.renewalCostEff });
  const act = useAction(() => api.regulatory.setFollowUp(row.id, { ...v, responsible: v.responsible || undefined }), { success: 'Follow-up saved', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Follow-up — ${row.subjectId}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.isPending} onClick={() => act.mutate(undefined)}>Save</Button></>}>
      <FormGrid>
        <Select label="Responsible person" value={v.responsible} onChange={(e) => setV({ ...v, responsible: e.target.value })} placeholder="Select" options={(ref?.users ?? []).filter((u) => u.roles.some((r) => ['REGULATORY', 'OPS_MANAGER', 'BRANCH_GENERALIST', 'APS_OFFICER'].includes(r))).map((u) => ({ value: u.userId, label: u.name }))} />
        <Input label="Follow-up date" type="date" value={v.followUpDate} onChange={(e) => setV({ ...v, followUpDate: e.target.value })} />
        <Input label="Follow-up status / action" value={v.followUp} placeholder="e.g. Documents filed at LTO, awaiting release" onChange={(e) => setV({ ...v, followUp: e.target.value })} />
        <MoneyInput label="Budget estimate (next renewal)" value={v.renewalCost || ''} onChange={(e) => setV({ ...v, renewalCost: Number(e.target.value) })} hint="Used in the budget forecast" />
      </FormGrid>
    </Modal>
  );
}

// ── SCR-43 Compliance Reporting Dashboard ──────────────────────────────────
export function CompliancePage() {
  const [f, setF] = useState<Filters>(EMPTY);
  const data = useData(['regs', 'compliance', f], () => api.regulatory.list({ ...f, window: '' }));
  const nav = useNavigate();
  const { setting } = useRefLookups();
  const [fu, setFu] = useState<Row | null>(null);
  const resend = useAction((id: string) => api.regulatory.resendNotice(id), { success: 'Notice resent' });
  const rows = data.data ?? [];
  const n = (w: string) => rows.filter((r) => r.window === w).length;
  const list = rows.filter((r) => r.window !== 'ok' && (!f.window || r.window === f.window));
  const budget = useMemo(() => '1234567890'.split('').map((d) => { const u = rows.filter((r) => r.plateEnding === d); return { d, month: MONTH_FOR[Number(d)], units: u.length, cost: u.reduce((a, r) => a + r.renewalCostEff, 0) }; }), [rows]);
  const annual = budget.reduce((a, b) => a + b.cost, 0);
  // Staff review 1.2: actual renewal spend this calendar year (renewals recorded with their cost) against the forecast, and the budget by region.
  const year = todayManila().slice(0, 4);
  const spentRen = (r: Row) => (r.renewals ?? []).filter((h) => h.at.slice(0, 4) === year && h.cost);
  const actual = useMemo(() => '1234567890'.split('').map((d) => rows.filter((r) => r.plateEnding === d).reduce((a, r) => a + spentRen(r).reduce((s, h) => s + (h.cost ?? 0), 0), 0)), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const spentList = rows.flatMap(spentRen);
  const spentTotal = spentList.reduce((a, h) => a + (h.cost ?? 0), 0);
  const byRegion = useMemo(() => [...new Set(rows.map((r) => r.region))].sort().map((g) => { const u = rows.filter((r) => r.region === g && r.plateEnding); return { g, units: u.length, cost: u.reduce((a, r) => a + r.renewalCostEff, 0), spent: rows.filter((r) => r.region === g).reduce((a, r) => a + spentRen(r).reduce((s, h) => s + (h.cost ?? 0), 0), 0) }; }), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = (k: number) => (rows.length ? `${Math.round((k / rows.length) * 1000) / 10}%` : '—');
  const tile = (w: string) => () => setF({ ...f, window: f.window === w ? '' : w });
  return (
    <>
      <PageHeader title="Compliance dashboard" meta={<ScreenTag id="SCR-43" />} description="Registration compliance reporting (DBL-REG-006): registered, near-expiry, expired and pending by region with a nationwide rollup. Notice cadence: 3 months & 1 month → Regulatory + Accounting; 2 weeks → Operations + Sales; expired → escalation (DBL-REG-003)."
        actions={<><Button variant="secondary" icon={<FileText className="size-4" />} onClick={() => nav('/reports/view/DBL-RPT-013-02')}>Registered detailed</Button><Button variant="secondary" icon={<FileText className="size-4" />} onClick={() => nav('/reports/view/DBL-RPT-013-03')}>Unregistered detailed</Button></>} />
      {data.isError && <Banner className="mb-4" tone="danger" title="Compliance data could not be loaded">{errMessage(data.error)}</Banner>}
      <Card className="mb-4 !px-4 !py-3"><div className="flex flex-wrap items-center gap-2 [&>[data-field]]:min-w-36 [&>[data-field]]:max-w-52 [&>[data-field]]:flex-1"><FilterBar f={f} setF={setF} show={['region', 'branch', 'unitType', 'status', 'plateEnding', 'onHire', 'from']} /></div></Card>
      <div className="mb-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="Expired" value={n('expired')} tone={n('expired') ? 'danger' : 'success'} hint="Target 0" onClick={tile('expired')} /><KpiTile label="≤ 2 weeks" value={n('14')} tone="danger" onClick={tile('14')} />
        <KpiTile label="2 weeks–1 month" value={n('30')} tone="warning" hint="15–30 days left" onClick={tile('30')} /><KpiTile label="1–3 months" value={n('90')} tone="warning" hint="31–90 days left" onClick={tile('90')} />
        <KpiTile label="Registered / current" value={n('ok')} tone="success" hint={`> 3 months left · detailed report lists ${n('ok') + n('14') + n('30') + n('90')} (incl. expiring)`} onClick={() => nav('/reports/view/DBL-RPT-013-02')} /><KpiTile label="Pending registration" value={n('pending')} onClick={tile('pending')} />
      </div>
      {rows.length > 0 && <p className="-mt-3 mb-4 text-xs text-muted">Share of {rows.length} units: <strong className="text-ink">{pct(n('ok'))}</strong> registered and current · <strong className="text-ink">{pct(n('ok') + n('14') + n('30') + n('90'))}</strong> registered incl. near expiry · {pct(n('14') + n('30') + n('90'))} near expiry · <span className={n('expired') ? 'font-semibold text-danger' : ''}>{pct(n('expired'))} expired</span> · {pct(n('pending'))} pending.</p>}
      {n('expired') > 0 && <Banner className="mb-4" tone="danger" title={`${n('expired')} registration(s) expired`}>These units cannot leave the gate until renewed. Expired units are escalated to Regulatory + Operations Manager + Accounting on the next notice run.</Banner>}
      <RegionSummary rows={rows} />
      <DataTable<MRow> data={list.map(withMerged)} loading={data.isLoading} exportName="compliance-report" onRowClick={(r) => nav(`/regulatory?id=${r.id}`)} emptyTitle="No registrations need attention" emptyHint="Nothing expired, expiring within 3 months or pending for the selected filters."
        rowClassName={(r) => (r.window === 'expired' ? 'bg-danger-bg/40' : undefined)} columns={[
        { accessorKey: 'unitPlate', header: 'Unit · plate', cell: (c) => twoLine(unitCell(c.row.original), c.row.original.plateNo || '—') },
        { accessorKey: 'subjectType', header: 'Unit type', meta: { nowrap: true } },
        { accessorKey: 'branchRegion', header: 'Branch', cell: (c) => twoLine(c.row.original.branchCode ?? '—', c.row.original.region) }, { accessorKey: 'onHire', header: 'On hire / client', cell: (c) => onHireCell(c.row.original) },
        { accessorKey: 'expiryDate', header: 'Expiry', cell: (c) => twoLine(c.getValue<string>() ? formatDate(c.getValue<string>()) : '—', daysCell(c.row.original)) },
        { id: 'who', header: 'Notified', cell: (c) => noticeCell(c.row.original) },
        { accessorKey: 'responsibleName', header: 'Responsible', meta: { wrap: true }, cell: (c) => { const r = c.row.original; const st = r.followUp ? `${r.followUp}${r.followUpDate ? ` · ${formatDate(r.followUpDate)}` : ''}` : ''; return <div className="min-w-40 text-xs"><p className="font-medium text-ink-2">{c.getValue<string>() ?? '—'}</p>{st && <p className="text-muted">{st}</p>}</div>; } },
        { accessorKey: 'renewalCostEff', header: 'Budget est.', meta: { align: 'right' }, cell: (c) => <span title="Budget estimate for the next renewal (record value or the settings default)">{formatPhp(c.getValue<number>())}</span> },
        { accessorKey: 'status', header: 'Status', cell: (c) => statusCell(c.row.original) },
        { id: 'a', header: '', cell: (c) => <RowActions row={c.row.original} open={() => nav(`/regulatory?id=${c.row.original.id}`)} onResend={() => resend.mutate(c.row.original.id)} resending={resend.isPending && resend.variables === c.row.original.id} onFollowUp={() => setFu(c.row.original)} /> }]} />
      <Card className="mt-5"><CardHeader title="Budget forecast by plate ending" description={<>Renewal units and cost per plate-ending month. Cost per unit uses the record’s renewal cost or the proposed default of {formatPhp(Number(setting('reg.renewal_cost_default') ?? 1800))}.</>} actions={<Button size="sm" variant="ghost" onClick={() => nav('/reports/view/DBL-RPT-013-01')}>Open report</Button>} />
        <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead className="bg-surface-alt text-[11px] uppercase text-muted"><tr><th className="px-3 py-2 text-left">Plate ending</th>{budget.map((b) => <th key={b.d} className="px-2 py-2 text-right">{b.d} · {b.month}</th>)}<th className="px-3 py-2 text-right">Annual</th></tr></thead>
          <tbody><tr className="border-t border-line"><td className="px-3 py-1.5">Units</td>{budget.map((b) => <td key={b.d} className="px-2 py-1.5 text-right tabular">{b.units}</td>)}<td className="px-3 py-1.5 text-right font-semibold tabular">{budget.reduce((a, b) => a + b.units, 0)}</td></tr>
            <tr className="border-t border-line"><td className="px-3 py-1.5">Monthly budget</td>{budget.map((b) => <td key={b.d} className="px-2 py-1.5 text-right tabular">{formatPhp(b.cost)}</td>)}<td className="px-3 py-1.5 text-right font-semibold tabular">{formatPhp(annual)}</td></tr>
            <tr className="border-t border-line"><td className="whitespace-nowrap px-3 py-1.5" title="Actual cost recorded on Mark renewed, renewals dated this calendar year">Actual spend {year}</td>{budget.map((b, i) => <td key={b.d} className="px-2 py-1.5 text-right tabular text-ink-2">{actual[i] ? formatPhp(actual[i]) : '—'}</td>)}<td className="px-3 py-1.5 text-right font-semibold tabular">{formatPhp(spentTotal)}</td></tr></tbody></table></div>
        <p className="mt-2 text-xs text-muted">{spentList.length} renewal(s) paid in {year} so far, {formatPhp(spentTotal)} in total{spentList.length ? `, average ${formatPhp(spentTotal / spentList.length)} per renewal against the ${formatPhp(Number(setting('reg.renewal_cost_default') ?? 1800))} budget default` : ''}. The rest of the year is still to be renewed.</p>
        <div className="mt-3 overflow-x-auto"><table className="w-full max-w-xl text-[13px]"><thead className="bg-surface-alt text-[11px] uppercase text-muted"><tr><th className="px-3 py-2 text-left">Region</th><th className="px-3 py-2 text-right">Units</th><th className="px-3 py-2 text-right">Annual budget</th><th className="px-3 py-2 text-right">Actual {year}</th></tr></thead>
          <tbody>{byRegion.map((r) => <tr key={r.g} className="border-t border-line"><td className="px-3 py-1.5">{r.g}</td><td className="px-3 py-1.5 text-right tabular">{r.units}</td><td className="px-3 py-1.5 text-right tabular">{formatPhp(r.cost)}</td><td className="px-3 py-1.5 text-right tabular">{formatPhp(r.spent)}</td></tr>)}</tbody></table></div>
      </Card>
      {fu && <FollowUpModal row={fu} onClose={() => setFu(null)} />}
    </>
  );
}

export type { Registration };
