import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BellRing, CheckCircle2, Camera, FileText, LocateFixed, MapPin, Plus, Siren, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { computeRescueCharge, formatDate, formatDateTime, formatPhp, rescueLineTotals, rescueSlaTone, todayManila, type RescueCostLine, type RescueStatus } from '../../lib/shared';
import {
  Badge, Banner, Button, Card, CardHeader, ConfirmDialog, DataTable, Field, FormGrid, FormSection, Input, KeyValueGrid, KpiTile, Modal, MoneyText, PageHeader, Select, Stack, StatusBadge, Switch, Textarea, cn, type ColumnDef,
} from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, fieldError, useAction, useData, useRefLookups } from '../../shared/hooks';
import { CreditGateBanner, Crumb } from '../../shared/components';

const elapsed = (m: number | null | undefined) => (m == null ? '—' : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`);
/** Same list as the client portal rescue form (portal review 1.1). */
const PROBLEM_TYPES = ['Flat / blown tire', 'Brake problem', 'Mechanical breakdown', 'Electrical / lights', 'Accident / collision', 'Other'];
const STATUSES: RescueStatus[] =['Requested', 'Verified', 'Confirmed', 'Dispatched', 'In Progress', 'Completed', 'Blocked', 'Cancelled'];
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
// Months on the Manila calendar; the range ends on the month's real last day (day 31 rolled into the next month, e.g. "01-Nov – 01-Dec").
const monthOptions = () => { const [y, mo] = todayManila().split('-').map(Number); return Array.from({ length: 12 }, (_, i) => { const t = y * 12 + (mo - 1) - i; const m = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; return { value: m, label: monthLabel(m) }; }); };
const monthEnd = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`; };
const monthRange = (m: string) => (m ? { from: `${m}-01`, to: monthEnd(m) } : {});

/** SLA thresholds from settings (res.sla_amber_hours / res.sla_red_hours — proposed 2h / 4h, pending client confirmation). */
function useSla() {
  const { setting } = useRefLookups();
  const amber = Number(setting('res.sla_amber_hours') ?? 2), red = Number(setting('res.sla_red_hours') ?? 4);
  const tone = (m: number | null | undefined, open: boolean) => (m == null || !open ? '' : { ok: '', amber: 'font-medium text-warning', red: 'font-bold text-danger' }[rescueSlaTone(m, amber, red)]);
  return { amber, red, tone };
}

type ListRow = Awaited<ReturnType<typeof api.rescue.list>>[number];
/** Flattened row (CSV export reads top-level keys only). */
const flat = (r: ListRow) => ({ ...r, travel: r.charge?.travel, service: r.charge?.service, vat: r.charge?.vat, chargeTotal: r.chargeable ? r.total ?? r.charge?.total : 0, client: `${r.clientName} (${r.clientCode})` });
type FlatRow = ReturnType<typeof flat>;

function breakdownCols(): ColumnDef<FlatRow>[] {
  const money = (k: keyof FlatRow, header: string): ColumnDef<FlatRow> => ({ accessorKey: k, header, meta: { align: 'right' }, cell: (c) => <span className="whitespace-nowrap">{c.getValue() != null ? formatPhp(c.getValue<number>()) : '—'}</span> });
  return [money('travel', 'Travel'), money('tireCost', 'Tire'), money('partsCost', 'Parts'), money('service', 'Service 10%'), money('vat', 'VAT 12%'), money('chargeTotal', 'Total')];
}

/** One "Charge" column for the request list; the itemised breakdown shows on hover (full breakdown stays on the detail and the dashboard). */
function chargeCol(): ColumnDef<FlatRow> {
  return { accessorKey: 'chargeTotal', header: 'Charge', meta: { align: 'right' }, cell: (c) => {
    const r = c.row.original;
    if (r.status !== 'Completed') return <span className="text-muted">—</span>;
    const p = (v?: number) => formatPhp(v ?? 0);
    const tip = `Travel ${p(r.travel)} · Tire ${p(r.tireCost)} · Parts ${p(r.partsCost)} · Service ${p(r.service)} · VAT ${p(r.vat)}${r.chargeable ? '' : ' · not chargeable'}`;
    return <span className="flex flex-col items-end"><span className="cursor-help whitespace-nowrap font-medium underline decoration-dotted decoration-line-strong underline-offset-4" title={tip}>{p(c.getValue<number>())}</span>{dmLine(r)}</span>;
  } };
}

/** Review 1.1: status with the reason (and who / when) for Blocked and Cancelled rescues. */
const statusCol = (): ColumnDef<FlatRow> => ({ accessorKey: 'status', header: 'Status', cell: (c) => { const r = c.row.original;
  const reason = r.status === 'Blocked' ? r.blockedReason : r.status === 'Cancelled' ? r.cancelReason : undefined;
  return <span className="flex max-w-60 flex-col items-start gap-0.5"><StatusBadge domain="rescue" value={r.status} />{reason && <span className="line-clamp-2 text-xs text-muted" title={reason}>{r.status === 'Blocked' ? 'Blocked: ' : 'Cancelled: '}{reason}</span>}</span>; } });
/** Review 1.2: problem type (same list as the portal), dispatching branch with the unit's home branch, and dispatch details. */
const problemCol = (): ColumnDef<FlatRow> => ({ accessorKey: 'problemType', header: 'Problem type', cell: (c) => <span className="whitespace-nowrap">{c.getValue<string>() ?? '—'}</span> });
const branchCol = (): ColumnDef<FlatRow> => ({ accessorKey: 'branchCode', header: 'Branch', cell: (c) => { const r = c.row.original; return <span className="flex flex-col whitespace-nowrap"><span>{r.branchCode}</span>{r.chassisBranch && r.chassisBranch !== r.branchCode && <span className="text-xs text-muted" title="Home branch of the unit">unit {r.chassisBranch}</span>}</span>; } });
const dispatchCol = (userName: (id?: string) => string): ColumnDef<FlatRow> => ({ accessorKey: 'crew', header: 'Dispatch', cell: (c) => { const r = c.row.original;
  if (!r.crew && !r.dispatchedAt) return <span className="text-xs text-muted">Not dispatched</span>;
  return <span className="flex flex-col whitespace-nowrap text-xs"><span className="font-medium text-ink-2">{r.crew ?? '—'}</span><span className="text-muted">{r.rescueVehicle ?? ''}{r.driverName ? ` · ${r.driverName}` : ''}</span>
    <span className="text-muted">{r.dispatchedAt ? `Sent ${formatDateTime(r.dispatchedAt)}` : ''}{r.eta ? ` · ETA ${formatDateTime(r.eta)}` : ''}</span>{r.completedAt && <span className="text-success">Completed {formatDateTime(r.completedAt)}{r.completedBy ? ` · ${userName(r.completedBy)}` : ''}</span>}</span>; } });
/** Review 1.1: Debit Memo number under the charge of a completed rescue. */
const dmLine = (r: FlatRow) => (r.debitMemoNo ? <span className="block font-mono text-xs text-muted">{r.debitMemoNo}</span> : null);

/** Client name with its code as a muted second line (one column instead of two; the CSV export carries both in one text). */
const clientCol = (): ColumnDef<FlatRow> => ({ accessorKey: 'client', header: 'Client', cell: (c) => <span className="flex min-w-36 flex-col"><span>{c.row.original.clientName}</span><span className="font-mono text-xs text-muted">{c.row.original.clientCode}</span></span> });

const plural =(n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── DBL-RES-007 / DBL-RPT-005: totals by month and by client (chassis rescued + ₱ charged) ──
function RescueTotals({ rows, range }: { rows: FlatRow[]; range?: string }) {
  const done = rows.filter((r) => r.status === 'Completed');
  // Review 1.1: the boxes state the period they cover; "all dates" names the first and last month that has rescues.
  const months = rows.map((r) => r.requestedAt.slice(0, 7)).sort();
  const covered = range && range !== 'All dates' ? range : months.length ? `All dates (${monthLabel(months[0])}${months[0] !== months[months.length - 1] ? ` – ${monthLabel(months[months.length - 1])}` : ''})` : 'All dates';
  const group = (key: (r: FlatRow) => string) => Object.values(done.reduce<Record<string, { key: string; rescues: number; chassis: Set<string>; charged: number; clientName?: string }>>((a, r) => {
    const k = key(r); const g = a[k] ?? { key: k, rescues: 0, chassis: new Set(), charged: 0, clientName: r.clientName }; g.rescues += 1; g.chassis.add(r.chassisNo); g.charged += r.chargeTotal ?? 0; a[k] = g; return a;
  }, {})).map((g) => ({ key: g.key, clientName: g.clientName, rescues: g.rescues, chassisRescued: g.chassis.size, charged: Math.round(g.charged * 100) / 100 }));
  const byMonth = group((r) => r.requestedAt.slice(0, 7)).sort((a, b) => b.key.localeCompare(a.key)).map((g) => ({ ...g, month: monthLabel(g.key) }));
  const byClient = group((r) => r.clientCode).sort((a, b) => b.charged - a.charged).map((g) => ({ ...g, clientCode: g.key }));
  const sum = (k: 'rescues' | 'chassisRescued' | 'charged') => byMonth.reduce((a, g) => a + g[k], 0);
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      {/* One frame per panel: the title sits in the table's own header row, beside Export. */}
      <DataTable data={byMonth} searchable={false} dense exportName="rescue-totals-by-month" emptyTitle="No completed rescues in the selected range"
        toolbar={<div><h3 className="text-[15px] font-semibold text-ink">Totals by month</h3><p className="text-[13px] text-muted">Completed rescues · {covered} · {plural(sum('rescues'), 'rescue')} · {formatPhp(sum('charged'))} charged</p></div>}
        columns={[{ accessorKey: 'month', header: 'Month' }, { accessorKey: 'rescues', header: 'Rescues', meta: { align: 'right' } },
          { accessorKey: 'chassisRescued', header: 'Chassis rescued', meta: { align: 'right' } }, { accessorKey: 'charged', header: 'Charged', meta: { align: 'right' }, cell: (c) => <span className="whitespace-nowrap">{formatPhp(c.getValue<number>())}</span> }]} />
      <DataTable data={byClient} searchable={false} dense exportName="rescue-totals-by-client" emptyTitle="No completed rescues in the selected range"
        toolbar={<div><h3 className="text-[15px] font-semibold text-ink">Totals by client</h3><p className="text-[13px] text-muted">Completed rescues · {covered}</p></div>}
        columns={[{ accessorKey: 'clientCode', header: 'Client code', cell: (c) => <span className="whitespace-nowrap font-mono">{c.getValue<string>()}</span> }, { accessorKey: 'clientName', header: 'Client' },
          { accessorKey: 'rescues', header: 'Rescues', meta: { align: 'right' } }, { accessorKey: 'chassisRescued', header: 'Chassis rescued', meta: { align: 'right' } }, { accessorKey: 'charged', header: 'Charged', meta: { align: 'right' }, cell: (c) => <span className="whitespace-nowrap">{formatPhp(c.getValue<number>())}</span> }]} />
    </div>
  );
}

/** Photo picker — keeps file names (binary storage arrives with the real API / object store). */
function PhotoPicker({ label, required, value, onChange, error, hint }: { label: string; required?: boolean; value: string[]; onChange: (v: string[]) => void; error?: string; hint?: string }) {
  return (
    <Field label={label} required={required} error={error} hint={hint ?? 'JPG / PNG, several allowed'}>
      {() => <div className="flex flex-wrap items-center gap-2">
        {value.map((n) => <span key={n} className="flex items-center gap-1 rounded-md border border-line bg-surface-alt px-2 py-1 text-xs"><Camera className="size-3.5 text-muted" />{n}<button type="button" aria-label={`Remove ${n}`} onClick={() => onChange(value.filter((x) => x !== n))}><X className="size-3.5 text-muted hover:text-danger" /></button></span>)}
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-sm text-brand-700 hover:border-brand-300">
          <Camera className="size-4" /> Add photo
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { const names = [...(e.target.files ?? [])].map((f) => f.name); onChange([...value, ...names.filter((n) => !value.includes(n))]); e.target.value = ''; }} />
        </label>
      </div>}
    </Field>
  );
}
const PhotoList = ({ items }: { items?: string[] }) => (items?.length ? <span className="flex flex-wrap gap-1">{items.map((n) => <Badge key={n} tone="neutral" dot={false} icon={<Camera className="size-3" />}>{n}</Badge>)}</span> : <span className="text-muted">None</span>);

// ── Rescue list + SCR-22 (internal logging on behalf of a client) ──────────
export function RescueListPage() {
  const [f, setF] = useState({ status: '', month: '', client: '', branch: '' });
  const data = useData(['rescues', f], () => api.rescue.list({ status: f.status, client: f.client, branch: f.branch, ...monthRange(f.month) }));
  const { clientOptions, branchOptions, userName } = useRefLookups();
  const sla = useSla();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => (data.data ?? []).map(flat), [data.data]);
  const cols: ColumnDef<FlatRow>[] = [
    { accessorKey: 'rescueNo', header: 'Reference', cell: (c) => <span className="flex items-center gap-1.5 whitespace-nowrap font-mono font-medium text-brand-700 group-hover:underline">{c.row.original.urgent && <Siren className="size-4 shrink-0 text-danger" aria-label="Urgent" />}{c.getValue<string>()}</span> },
    clientCol(), { accessorKey: 'chassisNo', header: 'Chassis', cell: (c) => <span className="whitespace-nowrap">{c.getValue<string>()}</span> },
    problemCol(),
    { accessorKey: 'locationText', header: 'Location', cell: (c) => <span className="block min-w-48 max-w-72" title={c.getValue<string>()}>{c.getValue<string>()}</span> },
    branchCol(),
    { accessorKey: 'requestedAt', header: 'Requested', cell: (c) => <span className="flex flex-col whitespace-nowrap"><span>{formatDateTime(c.getValue<string>())}</span><span className="text-xs text-muted">{c.row.original.requestedVia}{c.row.original.requestedBy ? ` · ${userName(c.row.original.requestedBy)}` : ''}</span></span> },
    { accessorKey: 'elapsedMin', header: 'Elapsed', meta: { align: 'right' }, cell: (c) => <span className={cn('whitespace-nowrap', sla.tone(c.getValue<number | null>(), c.row.original.isOpen))} title={c.row.original.timerStopped ? 'Timer stopped' : undefined}>{elapsed(c.getValue<number | null>())}</span> },
    statusCol(),
    // Review 1.2: the workflow steps (C&C eligibility, Sales confirmation, urgent SMS acknowledgement) and the dispatch details per row.
    { id: 'steps', header: 'Checks', cell: (c) => { const r = c.row.original; const step = (ok: boolean, label: string, who?: string, at?: string) => <span className={cn('whitespace-nowrap', ok ? 'text-success' : 'text-muted')}>{ok ? '✓' : '○'} {label}{who ? ` · ${userName(who)}` : ''}{at ? ` · ${formatDateTime(at)}` : ''}</span>;
      return <span className="flex flex-col text-xs">{step(!!r.verifiedBy, 'C&C eligibility', r.verifiedBy)}{step(!!r.confirmedBy, 'Sales confirmed', r.confirmedBy)}{r.urgent && step(!!r.urgentAckAt, r.urgentAckAt ? 'SMS acknowledged' : 'SMS not acknowledged', r.urgentAckBy, r.urgentAckAt)}</span>; } },
    dispatchCol(userName),
    chargeCol(),
  ];
  return (
    <>
      <PageHeader title="Rescue requests" description="Client-initiated roadside rescue. Eligibility (Allow Rescue, not on Hold) is verified by C&C, Sales confirms, then dispatch. Urgent requests repeat SMS until acknowledged."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Log request for client</Button>} />
      <DataTable data={rows} loading={data.isLoading} columns={cols} onRowClick={(r) => nav(`/rescue/${r.rescueNo}`)} exportName="rescues" emptyTitle="No rescues match the filters"
        toolbar={<>
          <Select aria-label="Month" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} placeholder="All months" options={monthOptions()} />
          <Select aria-label="Client" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} placeholder="All clients" options={clientOptions} />
          <Select aria-label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={branchOptions} />
          <Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" options={STATUSES.map((s) => ({ value: s, label: s }))} />
        </>} />
      <p className="mt-2 text-xs text-muted">Elapsed runs from request to completion and stops on completion, cancellation or block; amber after {sla.amber}h, red after {sla.red}h (proposed SLA, pending confirmation). Branch = the dispatching branch that sends the crew; the unit's home branch is shown under it when different. Hover a charge for its breakdown (travel, tire, parts, 10% service, 12% VAT); click a row for the full request.</p>
      <RescueTotals rows={rows} range={f.month ? monthLabel(f.month) : undefined} />
      <p className="mt-2 text-xs text-muted">Totals count Completed rescues only (they are the billed ones); dispatched work not yet completed shows on the Rescue dashboard as Open.</p>
      {open && <RescueRequestModal onClose={() => setOpen(false)} onDone={(no) => nav(`/rescue/${no}`)} />}
    </>
  );
}

export function RescueRequestModal({ onClose, onDone, clientLocked }: { onClose: () => void; onDone: (no: string) => void; clientLocked?: string }) {
  const { clientOptions, branchOptions, setting } = useRefLookups();
  const { user } = useAuth();
  const [clientCode, setClientCode] = useState(clientLocked ?? '');
  const client = useData(['client', clientCode], () => api.clients.get(clientCode), !!clientCode && !clientLocked);
  const [v, setV] = useState({ chassisNo: '', problemType: '', branchCode: '', locationText: '', incident: '', sceneContactName: '', sceneContactPhone: '', urgent: false, loadStatus: '' as '' | 'Loaded' | 'Empty', photos: [] as string[], lat: undefined as number | undefined, lng: undefined as number | undefined });
  const [geoErr, setGeoErr] = useState('');
  const act = useAction(() => api.rescue.request({ ...v, loadStatus: v.loadStatus || undefined, branchCode: v.branchCode || undefined, clientCode }), { success: (r) => (r.status === 'Blocked' ? `Logged ${r.rescueNo} — BLOCKED (client not eligible)` : `Rescue ${r.rescueNo} requested`), onSuccess: (r) => onDone(r.rescueNo) });
  const locate = () => {
    setGeoErr('');
    if (!navigator.geolocation) return setGeoErr('Geolocation is not available on this device.');
    navigator.geolocation.getCurrentPosition((p) => setV((x) => ({ ...x, lat: p.coords.latitude, lng: p.coords.longitude, locationText: x.locationText || `GPS ${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}` })), () => setGeoErr('Location permission denied — type the address instead.'));
  };
  const onHire = client.data?.onHire ?? [];
  // Review 1.1: warn when the chosen unit already has an open rescue (duplicate check).
  const openRescues = useData(['rescues', 'open-for', clientCode], () => api.rescue.list({ open: true, client: clientCode }), !!clientCode);
  const dup = (openRescues.data ?? []).find((r) => r.chassisNo === v.chassisNo);
  const cd = client.data?.client;
  return (
    <Modal open onClose={onClose} title="Rescue request" description="Captures location, load status, incident detail and photos for dispatch." size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.isPending} disabled={!clientCode || !v.chassisNo || !v.problemType || !v.branchCode || !v.loadStatus || !v.locationText || !v.incident || !v.sceneContactName || !v.sceneContactPhone} onClick={() => act.mutate(undefined)}>Submit request</Button></>}>
      <Stack>
        {!clientLocked && <Select label="Client" required value={clientCode} onChange={(e) => setClientCode(e.target.value)} placeholder="Select" options={clientOptions} />}
        {!clientLocked && <CreditGateBanner clientCode={clientCode || undefined} action="RESCUE_REQUEST" />}
        {/* Review 1.1: eligibility at intake, as soon as a client is chosen (C&C still verifies before dispatch). */}
        {cd && <div className="-mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-alt px-3 py-2 text-sm">
          <span className="font-medium text-ink-2">Eligibility</span>
          <Badge tone={cd.allowRescue ? 'success' : 'danger'} dot={false}>Allow Rescue: {cd.allowRescue ? 'Yes' : 'No'}</Badge>
          <span className="flex items-center gap-1 text-xs text-muted">Account <StatusBadge domain="client" value={cd.status} /></span>
          {/* Review 1.2: hold status and e-wallet balance at intake (BR-01 / BR-04). */}
          {client.data?.ewallet ? <span className={cn('text-xs', client.data.ewallet.balance < client.data.ewallet.minimumBalance ? 'font-medium text-warning' : 'text-muted')}>E-wallet {formatPhp(client.data.ewallet.balance)} (minimum {formatPhp(client.data.ewallet.minimumBalance)}{client.data.ewallet.balance < client.data.ewallet.minimumBalance ? ', below minimum' : ''})</span> : <span className="text-xs font-medium text-warning">No e-wallet</span>}
          <span className={cn('text-xs font-medium', cd.allowRescue && cd.status === 'Active' ? 'text-success' : 'text-danger')}>{cd.allowRescue && cd.status === 'Active' ? 'Eligible — C&C verifies before dispatch' : 'Not eligible — the request is logged as Blocked'}</span>
        </div>}
        {client.data && !client.data.client.allowRescue && <p className="-mt-2 text-xs text-danger">Hold / not-eligible clients are logged as <strong>Blocked</strong> for the audit trail and never reach dispatch.</p>}
        <FormGrid>
          <Select label="Chassis / unit" required value={v.chassisNo} onChange={(e) => { const c = onHire.find((x) => x.chassisNo === e.target.value); setV({ ...v, chassisNo: e.target.value, branchCode: c?.branchCode ?? v.branchCode }); }} placeholder={!clientCode ? 'Select a client first' : onHire.length ? 'Select on-hire unit' : 'No on-hire units'}
            error={dup ? `Already has an open rescue: ${dup.rescueNo} (${dup.status})` : undefined} hint="Only units on hire to this client are listed"
            options={onHire.map((c) => { const o = (openRescues.data ?? []).find((r) => r.chassisNo === c.chassisNo); return { value: c.chassisNo, label: o ? `${c.chassisNo} — open rescue ${o.rescueNo}` : c.chassisNo }; })} />
          {/* Review 1.2: same problem-type list as the client portal form (drives tire / parts planning, BR-11). */}
          <Select label="Problem type" required value={v.problemType} onChange={(e) => setV({ ...v, problemType: e.target.value })} placeholder="Select" options={PROBLEM_TYPES.map((p) => ({ value: p, label: p }))} hint="Helps the dispatcher bring the right tires and parts" />
          <Select label="Load status" required value={v.loadStatus} onChange={(e) => setV({ ...v, loadStatus: e.target.value as 'Loaded' | 'Empty' })} placeholder="Select" options={[{ value: 'Loaded', label: 'Loaded (container / cargo on chassis)' }, { value: 'Empty', label: 'Empty' }]} />
          <Select label="Dispatch branch" required value={v.branchCode} onChange={(e) => setV({ ...v, branchCode: e.target.value })} placeholder={v.chassisNo ? 'Select' : 'Select a unit first'} options={branchOptions} hint="Branch that sends the crew. Defaults to the unit's home branch; change it to the branch nearest the scene." />
        </FormGrid>
        <Switch label={<span className="flex items-center gap-1.5"><Siren className="size-4 text-danger" /> Urgent</span>} description="Repeats SMS until acknowledged" checked={v.urgent} onChange={(u) => setV({ ...v, urgent: u })} />
        <div>
          <div className="flex items-end gap-2">
            <Input wrapperClassName="flex-1" label="Current location" required placeholder="Address, landmark or highway km" value={v.locationText} onChange={(e) => setV({ ...v, locationText: e.target.value })} />
            <Button variant="secondary" icon={<LocateFixed className="size-4" />} onClick={locate}>Use my location</Button>
          </div>
          {v.lat != null && <p className="mt-1 text-xs text-success"><MapPin className="mr-1 inline size-3" />{v.lat.toFixed(5)}, {v.lng?.toFixed(5)} captured</p>}
          {geoErr && <p className="mt-1 text-xs text-danger">{geoErr}</p>}
          <p className="mt-1 text-xs text-muted">Type an address or landmark, or use your location to capture GPS coordinates.</p>
        </div>
        <Textarea label="Incident description" required placeholder="Describe what happened — e.g. flat tire on the left rear axle" value={v.incident} onChange={(e) => setV({ ...v, incident: e.target.value })} />
        <FormGrid>
          <Input label="Contact at scene" required placeholder="e.g. Juan Dela Cruz" value={v.sceneContactName} onChange={(e) => setV({ ...v, sceneContactName: e.target.value })} />
          <Input label="Contact number" required placeholder="e.g. 0917 123 4567" value={v.sceneContactPhone} onChange={(e) => setV({ ...v, sceneContactPhone: e.target.value })} />
        </FormGrid>
        <PhotoPicker label="Supporting photos" value={v.photos} onChange={(photos) => setV({ ...v, photos })} hint="Photos of the unit and the scene" />
        {dup && <Banner tone="warning" title={`${v.chassisNo} already has an open rescue`}>{dup.rescueNo} is {dup.status} (requested {formatDateTime(dup.requestedAt)}). Open that request instead of logging a duplicate, unless this is a separate incident. <Link className="font-medium underline" to={`/rescue/${dup.rescueNo}`}>Open {dup.rescueNo}</Link></Banner>}
        {/* Review 1.2: charge basis (BR-11) and who / where the request comes from, as on the portal form. */}
        <p className="rounded-lg border border-line bg-surface-alt px-3 py-2 text-xs text-ink-2"><b>Charge basis (BR-11), billed after completion by Debit Memo against the e-wallet:</b> travel (one-way km × 2 × {formatPhp(Number(setting('res.rate_per_km') ?? 50))} per km) + tires + parts, plus a {Math.round(Number(setting('res.service_charge_pct') ?? 0.1) * 100)}% service fee, plus {Math.round(Number(setting('fin.vat_pct') ?? 0.12) * 100)}% VAT.</p>
        <p className="text-xs text-muted">Source: <b>Internal</b> (logged on behalf of the client) · Requested by <b>{user?.name ?? user?.userId ?? '—'}</b> · {formatDateTime(new Date().toISOString())}</p>
        <p className="text-xs text-muted">On submit: a new RSC number is issued with status <b>Requested</b> (awaiting the C&amp;C eligibility check), and Sales, DYM, Branch Generalist, Operations Manager, C&amp;C and Accounting are notified{v.urgent ? '; urgent repeats SMS until acknowledged' : ''}.</p>
        {act.error && <Banner tone="danger">{errMessage(act.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

const STEPS: RescueStatus[] = ['Requested', 'Verified', 'Confirmed', 'Dispatched', 'In Progress', 'Completed'];
type LineDraft = Omit<RescueCostLine, 'description' | 'unitPrice'>;

// ── SCR-23 Rescue Dispatch & Cost Entry ────────────────────────────────────
export function RescueDetailPage() {
  const { no = '' } = useParams();
  const data = useData(['rescue', no], () => api.rescue.get(no));
  const { ref, setting, userName } = useRefLookups();
  const { can } = useAuth();
  const sla = useSla();
  const [crew, setCrew] = useState({ crew: '', eta: '', rescueVehicle: '', driverName: '', driverPhone: '' });
  const [cost, setCost] = useState({ oneWayKm: 0, chargeable: true, onsiteAssessment: '', clientAckName: '', beforePhotos: [] as string[], afterPhotos: [] as string[] });
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [done, setDone] = useState(false);
  const [dlg, setDlg] = useState<'' | 'cancel' | 'not-eligible'>('');
  type Adv = { action: 'verify' | 'confirm' | 'dispatch' | 'start' | 'cancel' | 'not-eligible'; data?: Parameters<typeof api.rescue.advance>[2] };
  const adv = useAction((a: Adv) => api.rescue.advance(no, a.action, a.data), { success: (r) => `Status: ${r.status}`, onSuccess: () => setDlg('') });
  const ack = useAction(() => api.rescue.acknowledge(no), { success: 'Urgent request acknowledged — SMS repeat stopped' });
  const price = (code: string) => { const p = ref?.parts.find((x) => x.partCode === code); return { description: p?.description ?? code, unitPrice: p?.rescuePrice ?? p?.standardCost ?? 0 }; };
  const costLines: RescueCostLine[] = lines.filter((l) => l.partCode && l.qty > 0).map((l) => ({ ...l, ...price(l.partCode) }));
  const lineTotals = rescueLineTotals(costLines);
  const complete = useAction(() => api.rescue.complete(no, { ...cost, ...lineTotals, costLines }), { success: (r) => `Completed — ${formatPhp(r.charge.total)}`, onSuccess: () => setDone(false) });
  const dm = useAction(() => api.rescue.generateDebitMemo(no), { success: (r) => `Debit Memo ${r.debitMemoNo} posted — e-wallet ${formatPhp(r.ewalletBalanceAfter)}` });
  const rate = Number(setting('res.rate_per_km') ?? 50);
  const svcPct = Number(setting('res.service_charge_pct') ?? 0.1), vatPct = Number(setting('fin.vat_pct') ?? 0.12);
  const r0 = data.data;
  const stored = r0?.status === 'Completed';
  const charge = useMemo(() => (stored && r0 ? computeRescueCharge({ oneWayKm: r0.oneWayKm ?? 0, ratePerKm: r0.ratePerKm ?? rate, tireCost: r0.tireCost ?? 0, partsCost: r0.partsCost ?? 0, serviceChargePct: svcPct, vatPct })
    : computeRescueCharge({ oneWayKm: cost.oneWayKm, ...lineTotals, ratePerKm: rate, serviceChargePct: svcPct, vatPct })), [stored, r0, cost.oneWayKm, lineTotals.tireCost, lineTotals.partsCost, rate, svcPct, vatPct]); // eslint-disable-line react-hooks/exhaustive-deps
  if (data.error) return <Banner tone="danger" title="Rescue not found">{errMessage(data.error)} <Link className="font-medium underline" to="/rescue">Back to rescues</Link></Banner>;
  if (!r0) return <p className="text-muted">Loading…</p>;
  const r = r0;
  const idx = STEPS.indexOf(r.status);
  const vendors = (ref?.vendors ?? []).map((v) => ({ value: v.name, label: v.name }));
  const partOpts = (kind: 'Tire' | 'Part') => (ref?.parts ?? []).filter((p) => (kind === 'Tire' ? p.category === 'Tires' : p.category !== 'Tires')).map((p) => ({ value: p.partCode, label: `${p.partCode} — ${p.description} (${formatPhp(p.rescuePrice ?? p.standardCost)})` }));
  const el = r.eligibility;
  const elapsedMin = Math.max(0, Math.round(((r.completedAt ?? r.cancelledAt ?? r.blockedAt) ? new Date((r.completedAt ?? r.cancelledAt ?? r.blockedAt)!).getTime() : Date.now()) / 60000 - new Date(r.requestedAt).getTime() / 60000));
  const pctLabel = (p: number) => `${Math.round(p * 100)}%`;
  const fe = (k: string) => fieldError(complete.error, k);
  return (
    <>
      <PageHeader breadcrumb={<Crumb items={[{ to: '/rescue', label: 'Rescue' }, { label: r.rescueNo }]} />} title={r.rescueNo}
        meta={<><StatusBadge domain="rescue" value={r.status} />{r.urgent && <Badge tone="danger" icon={<Siren className="size-3" />}>Urgent</Badge>}</>}
        description={<>{r.clientName} (<span className="font-mono">{r.clientCode}</span>) · {r.chassisNo} · requested {formatDateTime(r.requestedAt)} via {r.requestedVia} · elapsed <span className={sla.tone(elapsedMin, r.isOpen)}>{elapsed(elapsedMin)}</span>{!r.isOpen && ' (timer stopped)'}</>}
        actions={<>
          {r.urgent && !r.urgentAckAt && r.isOpen && can('rescue.request', 'edit') && <Button variant="danger" icon={<BellRing className="size-4" />} loading={ack.isPending} onClick={() => ack.mutate(undefined)}>Acknowledge urgent</Button>}
          {r.isOpen && r.status !== 'In Progress' && can('rescue.dispatch', 'edit') && <Button variant="ghost" onClick={() => setDlg('cancel')}>Cancel request</Button>}
        </>} />
      {r.status === 'Blocked' && <Banner tone="danger" className="mb-4" title="Client not eligible — dispatch blocked">{r.blockedReason}{r.notEligibleBy && ` · by ${userName(r.notEligibleBy)}`}{r.blockedAt && ` · ${formatDateTime(r.blockedAt)}`}</Banner>}
      {r.status === 'Cancelled' && <Banner tone="info" className="mb-4" title="Cancelled">Reason: {r.cancelReason ?? '— (not recorded)'} · by {userName(r.cancelledBy)} · {formatDateTime(r.cancelledAt)}. Elapsed timer stopped.</Banner>}
      {r.urgent && <Banner tone={r.urgentAckAt ? 'success' : 'danger'} className="mb-4" title={r.urgentAckAt ? 'Urgent — acknowledged' : 'Urgent — not yet acknowledged'}>
        {r.urgentAckAt ? `Acknowledged by ${userName(r.urgentAckBy)} on ${formatDateTime(r.urgentAckAt)}. SMS repeat stopped.` : `SMS repeats every ${setting('not.urgent_repeat_minutes') ?? 15} min to Sales, DYM, Branch Generalist, Ops Manager, C&C and Accounting until acknowledged.`}</Banner>}
      <ol className="mb-5 flex flex-wrap gap-2">{STEPS.map((s, i) => <li key={s} className={cn('rounded-full border px-3 py-1 text-xs font-medium', i < idx ? 'border-success-line bg-success-bg text-success' : i === idx ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-muted')}>{s}</li>)}</ol>
      <div className="grid gap-5 lg:grid-cols-3">
        <Stack className="lg:col-span-2">
          <Card>
            <CardHeader title="Request" />
            <KeyValueGrid cols={2} items={[{ label: 'Location', value: <span>{r.locationText}{r.lat != null && <a className="ml-2 text-brand-600 hover:underline" href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}`} target="_blank" rel="noreferrer">Open in maps ↗</a>}</span> },
              { label: 'Problem type', value: r.problemType ?? '—' }, { label: 'Requested by', value: `${r.requestedBy ? userName(r.requestedBy) : '—'} · ${r.requestedVia}` },
              { label: 'Incident', value: r.incident }, { label: 'Load status', value: r.loadStatus ?? '—' }, { label: 'Scene contact', value: `${r.sceneContactName} · ${r.sceneContactPhone}` }, { label: 'Dispatch branch', value: `${r.branchCode}${r.chassisBranch && r.chassisBranch !== r.branchCode ? ` (unit home branch ${r.chassisBranch})` : ''}` },
              { label: 'Supporting photos', value: <PhotoList items={r.photos} /> },
              { label: 'Eligibility verified by', value: r.verifiedBy ? userName(r.verifiedBy) : '—' }, { label: 'Sales confirmed by', value: r.confirmedBy ? userName(r.confirmedBy) : '—' }]} />
          </Card>
          {(r.dispatchedAt || r.crew) && <Card>
            <CardHeader title="Dispatch log" description="Crew, vehicle and driver sent to the scene" />
            <KeyValueGrid cols={3} items={[{ label: 'Crew / vendor', value: r.crew ?? '—' }, { label: 'Rescue vehicle', value: r.rescueVehicle ?? '—' }, { label: 'Driver', value: r.driverName ? `${r.driverName}${r.driverPhone ? ` · ${r.driverPhone}` : ''}` : '—' },
              { label: 'Dispatched', value: formatDateTime(r.dispatchedAt) }, { label: 'ETA', value: r.eta ? formatDateTime(r.eta) : '—' }, { label: 'Completed', value: r.completedAt ? `${formatDateTime(r.completedAt)}${r.completedBy ? ` · ${userName(r.completedBy)}` : ''}` : '—' }]} />
          </Card>}
          {r.status === 'Requested' && can('rescue.dispatch', 'check') && <Card><CardHeader title="1 · C&C eligibility check" description="Checks the Allow Rescue flag and account standing (Hold / overdue). Not eligible → request is blocked and the client is told." />
            <div className="flex flex-wrap gap-2"><Button icon={<CheckCircle2 className="size-4" />} onClick={() => adv.mutate({ action: 'verify' })} loading={adv.isPending}>Verify eligibility</Button><Button variant="danger" onClick={() => setDlg('not-eligible')}>Mark not eligible</Button></div></Card>}
          {r.status === 'Verified' && can('rescue.dispatch', 'check') && <Card><CardHeader title="2 · Sales confirmation" description="Sales confirms the request with the client by email." />
            <div className="flex flex-wrap gap-2"><Button icon={<CheckCircle2 className="size-4" />} onClick={() => adv.mutate({ action: 'confirm' })} loading={adv.isPending}>Sales confirm</Button><Button variant="danger" onClick={() => setDlg('not-eligible')}>Mark not eligible</Button></div></Card>}
          {r.status === 'Confirmed' && can('rescue.dispatch', 'edit') && (
            <FormSection title="3 · Dispatch" description="Record crew / vendor, rescue vehicle and driver.">
              <FormGrid cols={3}>
                <Select label="Vendor / crew" required value={crew.crew} onChange={(e) => setCrew({ ...crew, crew: e.target.value })} placeholder="Select" options={[{ value: 'In-house crew', label: 'In-house crew' }, ...vendors]} error={fieldError(adv.error, 'crew') || undefined} />
                <Input label="Rescue vehicle" required placeholder="e.g. Wrecker MNL-01 (plate)" value={crew.rescueVehicle} onChange={(e) => setCrew({ ...crew, rescueVehicle: e.target.value })} error={fieldError(adv.error, 'rescueVehicle') || undefined} />
                <Input label="ETA" type="datetime-local" value={crew.eta} onChange={(e) => setCrew({ ...crew, eta: e.target.value })} />
                <Input label="Driver" required placeholder="e.g. Juan Dela Cruz" value={crew.driverName} onChange={(e) => setCrew({ ...crew, driverName: e.target.value })} error={fieldError(adv.error, 'driverName') || undefined} />
                <Input label="Driver mobile" placeholder="e.g. 0917 123 4567" value={crew.driverPhone} onChange={(e) => setCrew({ ...crew, driverPhone: e.target.value })} />
              </FormGrid>
              <Button className="mt-4" disabled={!crew.crew || !crew.rescueVehicle.trim() || !crew.driverName.trim()} loading={adv.isPending} onClick={() => adv.mutate({ action: 'dispatch', data: crew })}>Dispatch</Button>
            </FormSection>
          )}
          {r.status === 'Dispatched' && can('rescue.dispatch', 'edit') && <Card><CardHeader title="4 · On site" description="Crew has arrived — start the on-site work, then enter costs." /><Button onClick={() => adv.mutate({ action: 'start' })} loading={adv.isPending}>Mark in progress</Button></Card>}
          {r.status === 'In Progress' && can('rescue.dispatch', 'edit') && (
            <FormSection title="5 · Cost entry & completion" description={`Charge = (Travel + Tire + Parts + ${pctLabel(svcPct)} service) + ${pctLabel(vatPct)} VAT. Travel = one-way km × 2 × rate per km.`}>
              <Stack>
                <FormGrid cols={3}>
                  <Input label="One-way distance (km)" required type="number" min={0} placeholder="e.g. 25" value={cost.oneWayKm || ''} onChange={(e) => setCost({ ...cost, oneWayKm: Number(e.target.value) })} />
                  <Field label={<span className="flex items-center gap-1.5">Standard rate per km <Badge tone="warning" dot={false}>pending decision</Badge></span>} hint="From system settings">{() => <p className="py-2 text-sm font-medium">{formatPhp(rate)} / km</p>}</Field>
                  <Field label="Travel (km × 2 × rate)">{() => <p className="py-2 text-sm font-medium">{cost.oneWayKm || 0} × 2 × {formatPhp(rate)} = {formatPhp(charge.travel)}</p>}</Field>
                </FormGrid>
                <div>
                  <p className="mb-2 text-sm font-medium text-ink">Tire & part lines <span className="font-normal text-muted">— priced from the standard rescue price list (regional lists pending decision)</span></p>
                  {lines.map((l, i) => (
                    <div key={i} className="mb-2 flex items-end gap-2">
                      <Select wrapperClassName="w-28" aria-label="Type" value={l.kind} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, kind: e.target.value as 'Tire' | 'Part', partCode: '' } : x)))} options={[{ value: 'Tire', label: 'Tire' }, { value: 'Part', label: 'Part' }]} />
                      <Select wrapperClassName="flex-1" aria-label="Item" value={l.partCode} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, partCode: e.target.value } : x)))} placeholder="Select from price list" options={partOpts(l.kind)} />
                      <Input wrapperClassName="w-20" aria-label="Qty" type="number" min={1} placeholder="Qty" value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))} />
                      <span className="w-28 pb-2 text-right text-sm">{l.partCode ? formatPhp(price(l.partCode).unitPrice * l.qty) : '—'}</span>
                      <Button variant="ghost" aria-label="Remove line" icon={<Trash2 className="size-4" />} onClick={() => setLines(lines.filter((_, k) => k !== i))} />
                    </div>
                  ))}
                  <div className="flex gap-2"><Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setLines([...lines, { kind: 'Tire', partCode: '', qty: 1 }])}>Add tire</Button><Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setLines([...lines, { kind: 'Part', partCode: '', qty: 1 }])}>Add part</Button></div>
                </div>
                <Textarea label="On-site assessment" required value={cost.onsiteAssessment} onChange={(e) => setCost({ ...cost, onsiteAssessment: e.target.value })} placeholder="Findings and work done on site" error={fe('onsiteAssessment') || undefined} />
                <FormGrid>
                  <PhotoPicker label="Before photos" required value={cost.beforePhotos} onChange={(beforePhotos) => setCost({ ...cost, beforePhotos })} error={fe('beforePhotos') || undefined} />
                  <PhotoPicker label="After photos" required value={cost.afterPhotos} onChange={(afterPhotos) => setCost({ ...cost, afterPhotos })} error={fe('afterPhotos') || undefined} />
                </FormGrid>
                <Input label="Client acknowledgment — name of client representative" required placeholder="e.g. Juan Dela Cruz" value={cost.clientAckName} onChange={(e) => setCost({ ...cost, clientAckName: e.target.value })} hint="Confirms the work and charge with the client" error={fe('clientAckName') || undefined} />
                <Switch label="Chargeable to client" description="A Debit Memo can be generated after completion and deducted from the e-wallet" checked={cost.chargeable} onChange={(c) => setCost({ ...cost, chargeable: c })} />
                {complete.error && <Banner tone="danger">{errMessage(complete.error)}</Banner>}
                <div><Button variant="success" icon={<CheckCircle2 className="size-4" />} disabled={!cost.oneWayKm || !cost.onsiteAssessment.trim() || !cost.beforePhotos.length || !cost.afterPhotos.length || !cost.clientAckName.trim()} onClick={() => setDone(true)}>Complete rescue</Button></div>
              </Stack>
            </FormSection>
          )}
          {r.status === 'Completed' && <>
            <Card>
              <CardHeader title="Billing evidence" description="Photos, client acknowledgment and itemised lines" />
              <KeyValueGrid cols={2} items={[{ label: 'Before photos', value: <PhotoList items={r.beforePhotos} /> }, { label: 'After photos', value: <PhotoList items={r.afterPhotos} /> },
                { label: 'Client acknowledgment', value: r.clientAckName ? `${r.clientAckName} · ${formatDateTime(r.acknowledgedAt)}` : formatDateTime(r.acknowledgedAt) }, { label: 'On-site assessment', value: r.onsiteAssessment ?? '—' }]} />
              {!!r.costLines?.length && <div className="mt-4"><DataTable data={r.costLines} searchable={false} dense columns={[{ accessorKey: 'kind', header: 'Type' }, { accessorKey: 'partCode', header: 'Code' }, { accessorKey: 'description', header: 'Description' }, { accessorKey: 'qty', header: 'Qty', meta: { align: 'right' } },
                { accessorKey: 'unitPrice', header: 'Unit price', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) }, { id: 'amt', header: 'Amount', meta: { align: 'right' }, cell: (c) => formatPhp(c.row.original.qty * c.row.original.unitPrice) }]} /></div>}
            </Card>
            <Card>
              <CardHeader title="Debit Memo & e-wallet posting" description="The e-wallet may go negative" />
              {!r.chargeable ? <p className="text-sm text-muted">Not chargeable to the client — no Debit Memo.</p>
                : r.debitMemoNo ? <KeyValueGrid cols={3} items={[{ label: 'Debit Memo', value: <Link className="font-mono text-brand-600 hover:underline" to={`/billing/memos?memo=${r.debitMemoNo}`}>{r.debitMemoNo}</Link> }, { label: 'Status', value: <Badge tone="success">{r.debitMemo?.status ?? 'Posted'}</Badge> },
                  { label: 'Amount', value: <MoneyText value={r.debitMemo?.amount ?? r.total} /> }, { label: 'E-wallet deduction', value: <span className="text-danger">−{formatPhp(r.total)}</span> },
                  { label: 'Balance after posting', value: <MoneyText value={r.ewalletBalanceAfter ?? r.ewallet?.balance} /> }, { label: 'Ledger', value: <Link to={`/ewallet/${r.clientCode}`} className="text-brand-600 hover:underline">Open e-wallet ledger →</Link> }]} />
                : <div className="flex flex-wrap items-center gap-3"><p className="text-sm text-ink-2">Total <strong>{formatPhp(r.total)}</strong> is ready to bill.</p>
                  {can('rescue.dispatch', 'edit') && <Button icon={<FileText className="size-4" />} loading={dm.isPending} onClick={() => dm.mutate(undefined)}>Generate Debit Memo</Button>}
                  {dm.error && <Banner tone="danger" className="w-full">{errMessage(dm.error)}</Banner>}</div>}
            </Card>
          </>}
        </Stack>
        <Stack>
          <Card>
            <CardHeader title="Eligibility" description="Allow Rescue flag and account standing" />
            <KeyValueGrid cols={2} items={[{ label: 'Allow Rescue flag', value: el.allowRescue ? <Badge tone="success">Yes</Badge> : <Badge tone="danger">No</Badge> }, { label: 'Account standing', value: <StatusBadge domain="client" value={el.accountStatus} /> },
              { label: 'Outstanding', value: <MoneyText value={el.outstanding} /> }, { label: 'Overdue', value: <MoneyText value={el.overdue} className={el.overdue > 0 ? 'text-danger' : undefined} /> }]} />
            <p className={cn('mt-3 flex items-center gap-1.5 text-sm font-medium', el.gate.allowed ? 'text-success' : 'text-danger')}>{el.gate.allowed ? <><CheckCircle2 className="size-4" /> Eligible for rescue</> : <><AlertTriangle className="size-4" /> Not eligible — {el.gate.reason}</>}</p>
            <Link to={`/credit/status?client=${r.clientCode}`} className="mt-2 block text-sm text-brand-600 hover:underline">Client credit status →</Link>
          </Card>
          <Card>
            <CardHeader title={stored ? 'Charge' : 'Charge preview'} description={stored ? 'As posted at completion' : 'Live preview (same calculator as the server)'} />
            {[['One-way km', null, `${stored ? r.oneWayKm ?? 0 : cost.oneWayKm || 0} km × 2 × ${formatPhp(stored ? r.ratePerKm ?? rate : rate)}`], ['Travel', charge.travel], ['Tire', stored ? r.tireCost ?? 0 : lineTotals.tireCost], ['Parts', stored ? r.partsCost ?? 0 : lineTotals.partsCost], ['Subtotal', charge.subtotal], [`Service charge ${pctLabel(svcPct)}`, charge.service], ['Taxable', charge.taxable], [`VAT ${pctLabel(vatPct)}`, charge.vat]].map(([l, v, txt]) => (
              <div key={l as string} className={cn('flex justify-between py-1 text-sm', (l === 'Subtotal' || l === 'Taxable') && 'border-t border-line pt-2 font-medium')}><span className="text-ink-2">{l}</span>{txt ? <span className="text-muted">{txt as string}</span> : <MoneyText value={v as number} />}</div>
            ))}
            <div className="mt-2 flex justify-between border-t-2 border-line-strong pt-2 text-base font-bold"><span>Total</span><MoneyText value={stored ? r.total ?? charge.total : charge.total} /></div>
          </Card>
          <Card>
            <CardHeader title="Client e-wallet" />
            {r.ewallet ? <><div className="flex flex-wrap items-center gap-2"><p className={cn('text-2xl font-bold', r.ewallet.balance < 0 ? 'text-danger' : r.ewallet.balance < r.ewallet.minimumBalance && 'text-warning')}><MoneyText value={r.ewallet.balance} /></p>
                {r.ewallet.balance < r.ewallet.minimumBalance && <Badge tone={r.ewallet.balance < 0 ? 'danger' : 'warning'}>Below minimum</Badge>}</div>
              <p className="text-xs text-muted">Minimum {formatPhp(r.ewallet.minimumBalance)} · may go negative</p>
              {r.ewallet.balance - charge.total < 0 && r.status === 'In Progress' && <p className="mt-2 flex items-center gap-1 text-xs text-warning"><AlertTriangle className="size-3.5" /> This charge will take the wallet negative.</p>}</> : <p className="text-sm text-muted">No e-wallet.</p>}
            <Link to={`/ewallet/${r.clientCode}`} className="mt-2 block text-sm text-brand-600 hover:underline">Open ledger →</Link>
          </Card>
        </Stack>
      </div>
      <Modal open={done} onClose={() => setDone(false)} title="Complete rescue?" footer={<><Button variant="secondary" onClick={() => setDone(false)}>Back</Button><Button variant="success" loading={complete.isPending} onClick={() => complete.mutate(undefined)}>Complete rescue</Button></>}>
        <p className="text-sm text-ink-2">Total <strong>{formatPhp(charge.total)}</strong> (travel {formatPhp(charge.travel)}, tire {formatPhp(lineTotals.tireCost)}, parts {formatPhp(lineTotals.partsCost)}, service {formatPhp(charge.service)}, VAT {formatPhp(charge.vat)}).
          {cost.chargeable ? ' After completion, generate the Debit Memo to deduct it from the client e-wallet.' : ' Not chargeable to the client.'} The client, Operations, C&C and Accounting are notified.</p>
      </Modal>
      <ConfirmDialog open={dlg === 'cancel'} onClose={() => setDlg('')} requireReason tone="danger" title={`Cancel ${r.rescueNo}?`} confirmLabel="Cancel request" loading={adv.isPending}
        message="The elapsed timer stops and the reason and your name are recorded." onConfirm={(reason) => adv.mutate({ action: 'cancel', data: { reason } })} />
      <ConfirmDialog open={dlg === 'not-eligible'} onClose={() => setDlg('')} requireReason tone="danger" title="Client not eligible for rescue" confirmLabel="Mark not eligible" loading={adv.isPending}
        message="The request is blocked (not dispatched) and the reason is recorded. Use this when the Allow Rescue flag is off or the account is on Hold / overdue." onConfirm={(reason) => adv.mutate({ action: 'not-eligible', data: { reason } })} />
    </>
  );
}

// ── SCR-24 Rescue Dashboard & Monitoring ───────────────────────────────────
export function RescueDashboardPage() {
  const [f, setF] = useState({ from: '', to: '', client: '', branch: '', status: '' });
  const data = useData(['rescues', 'dash', f], () => api.rescue.list({ ...f }));
  const board = useData(['rescues', 'board', f.client, f.branch], () => api.rescue.list({ open: true, client: f.client, branch: f.branch }));
  const { clientOptions, branchOptions } = useRefLookups();
  const sla = useSla();
  const nav = useNavigate();
  const rows = useMemo(() => (data.data ?? []).map(flat), [data.data]);
  const openRows = useMemo(() => (board.data ?? []).map(flat), [board.data]);
  const done = rows.filter((r) => r.status === 'Completed');
  const cancelled = rows.filter((r) => r.status === 'Cancelled').length, blocked = rows.filter((r) => r.status === 'Blocked').length;
  const avg = done.length ? Math.round(done.reduce((a, r) => a + (r.elapsedMin ?? 0), 0) / done.length) : null;
  const charged = done.reduce((a, r) => a + (r.chargeTotal ?? 0), 0);
  const byBranch = useMemo(() => Object.values(rows.reduce<Record<string, { branch: string; Open: number; Completed: number; Cancelled: number; Blocked: number }>>((a, r) => {
    const g = a[r.branchCode] ?? { branch: r.branchCode, Open: 0, Completed: 0, Cancelled: 0, Blocked: 0 }; g[r.isOpen ? 'Open' : (r.status as 'Completed' | 'Cancelled' | 'Blocked')] += 1; a[r.branchCode] = g; return a;
  }, {})), [rows]);
  const range = f.from || f.to ? `${f.from ? formatDate(f.from) : '…'} – ${f.to ? formatDate(f.to) : '…'}` : 'All dates';
  const [period, setPeriod] = useState('');
  const setPeriodValue = (p: string) => { setPeriod(p); if (p !== 'custom') setF({ ...f, ...(p ? monthRange(p) as { from: string; to: string } : { from: '', to: '' }) }); };
  return (
    <>
      <PageHeader title="Rescue dashboard"
        description={`Live board of open rescues, itemised rescue transactions and totals by month and client. Elapsed runs from request to completion; amber at ${sla.amber}h, red at ${sla.red}h.`} />
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Period" value={period} onChange={(e) => setPeriodValue(e.target.value)} options={[{ value: '', label: 'All dates' }, ...monthOptions(), { value: 'custom', label: 'Custom range…' }]} />
          {period === 'custom' && <>
            <Input label="From" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            <Input label="To" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </>}
          <Select label="Client" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} placeholder="All clients" options={clientOptions} />
          <Select label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={branchOptions} />
          <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" options={STATUSES.map((s) => ({ value: s, label: s }))} />
          {(period || f.from || f.to || f.client || f.branch || f.status) && <Button variant="ghost" onClick={() => { setPeriod(''); setF({ from: '', to: '', client: '', branch: '', status: '' }); }}>Clear</Button>}
        </div>
      </Card>
      <p className="mb-2 text-xs text-muted">Open / Urgent open are live (now). All other tiles, the chart and the transaction list cover the selected range: <strong>{range}</strong>.</p>
      <div className="mb-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="Open (live)" value={openRows.length} tone={openRows.length ? 'warning' : 'default'} /><KpiTile label="Urgent open (live)" value={openRows.filter((r) => r.urgent).length} tone="danger" />
        <KpiTile label="Completed" value={done.length} tone="success" /><KpiTile label="Cancelled / blocked" value={`${cancelled} / ${blocked}`} />
        <KpiTile label="Avg. resolution" value={avg == null ? 'No completed rescues' : elapsed(avg)} hint="Request → completion" /><KpiTile label="Total charged" value={formatPhp(charged)} />
      </div>
      {/* Open board and chart sit side by side; each card keeps its own height (the board's legend footer sits right under the last row). */}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <DataTable data={openRows} loading={board.isLoading} onRowClick={(r) => nav(`/rescue/${r.rescueNo}`)} emptyTitle="No open rescues" emptyHint="Open requests appear here with their elapsed time." searchable={false}
            footer={<span className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-normal text-muted"><span className="font-medium text-ink-2">All {plural(openRows.length, 'open rescue')} shown</span><span>Elapsed: normal</span><span className="text-warning">amber ≥ {sla.amber}h</span><span className="font-bold text-danger">red ≥ {sla.red}h</span><span>· click a row to open the rescue</span></span>} columns={[
            { accessorKey: 'rescueNo', header: 'Ref', cell: (c) => <span className="flex items-center gap-1.5 font-mono font-medium text-brand-700 group-hover:underline">{c.getValue<string>()}{c.row.original.urgent && <Badge tone="danger" icon={<Siren className="size-3" />}>Urgent{c.row.original.urgentAckAt ? ' · ack' : ''}</Badge>}</span> },
            { accessorKey: 'clientCode', header: 'Client code', cell: (c) => <span className="font-mono">{c.getValue<string>()}</span> }, { accessorKey: 'clientName', header: 'Client' }, { accessorKey: 'branchCode', header: 'Branch' }, { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge domain="rescue" value={c.getValue<string>()} /> },
            { accessorKey: 'elapsedMin', header: 'Elapsed', meta: { align: 'right' }, cell: (c) => <span className={cn('rounded px-1.5 py-0.5', sla.tone(c.getValue<number | null>(), true))}>{elapsed(c.getValue<number | null>())}</span> }]} />
        </div>
        {/* Bars are drawn without the grow-in animation: a re-layout restarted it and left the plot empty (re-audit S25). */}
        <Card className="min-w-0">
          <CardHeader title="Volume by branch" description={`${range} · by outcome`} />
          {byBranch.length ? <div className="h-56 w-full" data-testid="rescue-volume-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={byBranch} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} maxBarSize={48}><CartesianGrid stroke="#EEF2F6" vertical={false} /><XAxis dataKey="branch" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis width={28} allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip /><Legend verticalAlign="top" align="left" iconSize={10} wrapperStyle={{ fontSize: 12, paddingBottom: 8, lineHeight: '18px' }} />
            <Bar dataKey="Open" stackId="s" fill="#DC6803" isAnimationActive={false} /><Bar dataKey="Completed" stackId="s" fill="#15803D" isAnimationActive={false} /><Bar dataKey="Cancelled" stackId="s" fill="#94A3B8" isAnimationActive={false} /><Bar dataKey="Blocked" stackId="s" fill="#B42318" isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
            : <p className="py-10 text-center text-sm text-muted">No rescues in the selected range.</p>}
        </Card>
      </div>
      <h2 className="mb-3 mt-6 text-base font-semibold text-ink">Rescue transactions</h2>
      <DataTable data={rows} loading={data.isLoading} onRowClick={(r) => nav(`/rescue/${r.rescueNo}`)} exportName="rescue-transactions" emptyTitle="No rescues in the selected range" columns={[
        { accessorKey: 'rescueNo', header: 'Reference', cell: (c) => <span className="whitespace-nowrap font-mono font-medium text-brand-700 group-hover:underline">{c.getValue<string>()}</span> }, { accessorKey: 'requestedAt', header: 'Requested', cell: (c) => <span className="whitespace-nowrap">{formatDateTime(c.getValue<string>())}</span> },
        clientCol(), { accessorKey: 'chassisNo', header: 'Chassis', cell: (c) => <span className="whitespace-nowrap">{c.getValue<string>()}</span> },
        problemCol(), branchCol(),
        statusCol(),
        { accessorKey: 'completedAt', header: 'Completed', cell: (c) => (c.getValue<string>() ? <span className="whitespace-nowrap">{formatDateTime(c.getValue<string>())}</span> : <span className="text-muted">—</span>) },
        { accessorKey: 'rescueVehicle', header: 'Dispatch (vehicle · driver)', cell: (c) => { const r = c.row.original; return r.rescueVehicle || r.driverName ? <span className="flex flex-col whitespace-nowrap text-xs"><span>{r.rescueVehicle ?? '—'}</span><span className="text-muted">{r.driverName ?? '—'}{r.crew ? ` · ${r.crew}` : ''}</span></span> : <span className="text-muted">—</span>; } },
        { accessorKey: 'oneWayKm', header: 'Km (one way)', meta: { align: 'right' }, cell: (c) => (c.getValue() != null ? <span className="whitespace-nowrap" title={`${c.getValue<number>()} km × 2 × ${formatPhp(c.row.original.ratePerKm ?? 0)}/km`}>{c.getValue<number>()} km</span> : '—') },
        ...breakdownCols(), { accessorKey: 'debitMemoNo', header: 'Debit memo', cell: (c) => (c.getValue<string>() ? <span className="whitespace-nowrap font-mono">{c.getValue<string>()}</span> : '—') }]} />
      <p className="mt-2 text-xs text-muted">The table scrolls sideways: after Parts come Service 10%, VAT 12%, Total and Debit memo. Branch = dispatching branch (the chart groups by it); the unit's home branch shows under it when different. Open (live) counts every request not yet Completed, Cancelled or Blocked; the unit itself shows the fleet status Rescue only from dispatch until completion.</p>
      <RescueTotals rows={rows} range={range} />
    </>
  );
}
