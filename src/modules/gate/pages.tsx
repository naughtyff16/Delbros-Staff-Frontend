import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, Camera, CheckCircle2, ChevronRight, Clock, Eye, Pencil, Plus, Printer, RotateCcw, ScanLine, ShieldCheck, Trash2, Truck, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';
import { ewaSchema, formatDate, formatDateTime, formatPhp, type Assessment, type EwaForm, type GatePass, type InspectionLine } from '../../lib/shared';
import {
  ApprovalTimeline, Badge, Banner, Button, Card, CardHeader, Checkbox, ConfirmDialog, DataTable, DateRangeFilter, Drawer, FormGrid, FormSection, InspectionChecklist, Input, KeyValueGrid, Modal, PageHeader, Segmented,
  Select, SignaturePad, Stack, StatusBadge, Tabs, Textarea, cn, sentenceCase, type ColumnDef,
} from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, fieldError, useAction, useData, useRefLookups } from '../../shared/hooks';
import { CreditGateBanner, ScreenTag, useGate } from '../../shared/components';
import { EirDocument, PrintPreview } from '../../shared/print';

// GP2 Rev.2 checklist incl. L2/R2 inner tires. Part list per chassis type (20ft / 40ft / tri-axle) is pending client confirmation.
export const INSPECTION_PARTS = ['Tire L1 outer', 'Tire L1 inner', 'Tire R1 outer', 'Tire R1 inner', 'Tire L2 outer', 'Tire L2 inner', 'Tire R2 outer', 'Tire R2 inner', 'Brake system', 'Landing legs', 'King pin', 'Twist locks', 'Lights & wiring', 'Mud flaps', 'Chassis frame'];
export const blankChecklist = (): InspectionLine[] => INSPECTION_PARTS.map((part) => ({ part, statusCode: 'OK', qty: 1, chargeable: 0 }));
/** Staff review 1.2: a 3-axle unit (chassis master "Axle configuration") also lists the third-axle tires L3 / R3 — 12 tires instead of 8 (layout pending confirmation). */
export const checklistFor = (axle?: string): InspectionLine[] => {
  const b = blankChecklist(); if (axle !== '3-axle') return b;
  const extra = ['Tire L3 outer', 'Tire L3 inner', 'Tire R3 outer', 'Tire R3 inner'].map((part) => ({ part, statusCode: 'OK', qty: 1, chargeable: 0 }));
  return [...b.slice(0, 8), ...extra, ...b.slice(8)];
};
/** Staff review 1.2: client hold / accreditation flag next to the client name (BR-01). */
export function ClientFlag({ status }: { status?: string }) {
  if (!status || status === 'Active') return null;
  return <span className="ml-1 inline-block align-middle" title={EWA_BLOCK[status] ?? status}><StatusBadge domain="client" value={status} /></span>;
}

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return <span className="text-danger">expired</span>;
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return <span className={cn('tabular', h < 3 && 'font-semibold text-warning')}>{h}h {m}m left</span>;
}

/** Damage / evidence photos (DBL-GAT-005/006). Demo keeps file names; production uploads to the document store. */
export function PhotoInput({ value, onChange, label = 'Damage photos' }: { value: string[]; onChange: (v: string[]) => void; label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-sm text-muted hover:bg-surface-alt">
        <Camera className="size-4" />Add photos (camera or file)
        <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => { onChange([...value, ...Array.from(e.target.files ?? []).map((f) => f.name)]); e.target.value = ''; }} />
      </label>
      {value.length > 0 && <div className="flex flex-wrap gap-1.5">{value.map((n, i) => <Badge key={i} tone="neutral" dot={false}>{n}<button type="button" aria-label={`Remove ${n}`} className="ml-1" onClick={() => onChange(value.filter((_, k) => k !== i))}><X className="size-3" /></button></Badge>)}</div>}
      <p className="text-xs text-muted">Optional. Stored with the gate pass and referenced on the EIR.</p>
    </div>
  );
}

/** Approve / reject a workflow step from the record itself (same engine as the Inbox). Who/when is recorded on the step. */
export function DecideDialog({ target, onClose }: { target: { wfId: string; title: string; approve: boolean; label: string } | null; onClose: () => void }) {
  const act = useAction((c: string) => api.inbox.decide(target!.wfId, target!.approve ? 'Approved' : 'Rejected', c), { success: () => `${target?.label} recorded`, onSuccess: onClose });
  return (
    <ConfirmDialog open={!!target} onClose={onClose} title={target?.title} tone={target?.approve ? 'primary' : 'danger'} requireReason={!target?.approve} confirmLabel={target?.label} loading={act.isPending}
      message={target?.approve ? 'Your name, role and the time are recorded on this approval step and in the audit trail.' : 'A reason is required and is sent to the requester.'} onConfirm={(r) => act.mutate(r)} />
  );
}

const EWA_BLOCK: Record<string, string> = { Hold: 'On credit hold — contact Credit & Collection', Blacklist: 'Blacklisted — contact Credit & Collection', Draft: 'Not yet accredited (Draft) — complete accreditation first', Inactive: 'Inactive — reactivate the client first' };
const ewaBlockReason = (status: string) => (status === 'Active' ? undefined : EWA_BLOCK[status] ?? `${status} — not eligible for an EWA`);

/** Type-ahead client search. Only accredited Active clients are selectable (DBL-GAT-001); others are greyed with the reason. */
function ClientPicker({ value, onChange, error }: { value: string; onChange: (code: string) => void; error?: string }) {
  const { ref } = useRefLookups();
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false);
  const sel = ref?.clients.find((c) => c.clientCode === value);
  const list = (ref?.clients ?? []).filter((c) => !q || `${c.clientCode} ${c.clientName}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(a.status !== 'Active') - Number(b.status !== 'Active') || a.clientName.localeCompare(b.clientName));
  return (
    <div className="relative">
      <Input label="Client" required role="combobox" aria-expanded={open} autoComplete="off" placeholder="Type client name or code…" error={error}
        value={open ? q : sel ? `${sel.clientName} (${sel.clientCode})` : ''} onFocus={() => { setOpen(true); setQ(''); }} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg">
          {list.length ? list.map((c) => {
            const why = ewaBlockReason(c.status);
            return (
              <li key={c.clientCode} role="option" aria-selected={c.clientCode === value} aria-disabled={!!why}>
                <button type="button" disabled={!!why} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(c.clientCode); setOpen(false); }}
                  className={cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm', why ? 'cursor-not-allowed opacity-60' : 'hover:bg-brand-50', c.clientCode === value && 'bg-brand-50')}>
                  <span className="min-w-0"><span className="font-medium">{c.clientName}</span> <span className="font-mono text-xs text-muted">{c.clientCode}</span>{why && <span className="block text-xs text-danger">{why}</span>}</span>
                  <StatusBadge domain="client" value={c.status} />
                </button>
              </li>
            );
          }) : <li className="px-3 py-2 text-sm text-muted">No client matches “{q}”.</li>}
        </ul>
      )}
    </div>
  );
}

// ── SCR-14 EWA Creation ─────────────────────────────────────────────────────
export function EwaPage() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { ref, branchOptions, eqName } = useRefLookups();
  const [f, setF] = useState({ status: '', client: '', branch: '', from: '', to: '' });
  const data = useData(['ewas', f], () => api.gate.ewas(f));
  const [open, setOpen] = useState(!!sp.get('client'));
  const [ext, setExt] = useState<string | null>(null);
  const [cancel, setCancel] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(sp.get('eu'));
  const [decide, setDecide] = useState<{ wfId: string; title: string; approve: boolean; label: string } | null>(null);
  const [created, setCreated] = useState<{ euNo: string; validUntil: string; branchCode: string } | null>(null);
  const extend = useAction((reason: string) => api.gate.requestExtension(ext!, reason), { success: 'Extension requested — Manager → IT revalidation', onSuccess: () => setExt(null) });
  const cancelAct = useAction((reason: string) => api.gate.cancelEwa(cancel!, reason), { success: () => `EWA ${cancel} cancelled`, onSuccess: () => setCancel(null) });
  // Merged columns carry a combined value so sorting and the CSV export keep both parts.
  // Staff review 1.2: region filter (branch master Region → island group) next to the branch filter; the branch list narrows to the region.
  const [region, setRegion] = useState('');
  const opsBranches = (ref?.branches ?? []).filter((b) => !b.isHeadOffice);
  const regionOf = (code: string) => opsBranches.find((b) => b.code === code)?.region;
  const ISLAND: Record<string, string> = { NCR: 'Luzon', 'North Luzon': 'Luzon', 'South Luzon': 'Luzon', Visayas: 'Visayas', Mindanao: 'Mindanao' };
  const regionOptions = [...new Set(opsBranches.map((b) => b.region))].map((r) => ({ value: r, label: ISLAND[r] && ISLAND[r] !== r ? `${r} (${ISLAND[r]})` : r }));
  const rows = useMemo(() => data.data?.filter((r) => !region || regionOf(r.branchCode) === region).map((r) => ({ ...r, clientCol: `${r.clientName} · ${r.contractNo}${r.clientStatus && r.clientStatus !== 'Active' ? ` · ${r.clientStatus}` : ''}`, driverCol: `${r.driverName} · ${r.driverLicenseNo} · ${r.truckPlateNo} · ${r.trucker}`, createdCol: `${r.createdAt} · ${r.createdByName} · ${r.createdVia}` })), [data.data, region, ref]); // eslint-disable-line react-hooks/exhaustive-deps
  type Row = NonNullable<typeof rows>[number];
  // Compact row actions: icon buttons with tooltips (one text button only for the approver's decision), then a chevron to the detail.
  const actions = (r: Row) => (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {['Active', 'Partially Used'].includes(r.status) && can('gate.out', 'add') && <Button size="sm" variant="secondary" className="px-2" aria-label={`Release units on ${r.euNo}`} title="Open Gate Out with this EU number" icon={<Truck className="size-4" />} onClick={() => navigate(`/gate/out?eu=${r.euNo}`)}>Release</Button>}
      {r.status === 'Expired' && can('gate.ewa', 'add') && <Button size="sm" variant="secondary" className="px-2" aria-label={`Request extension for ${r.euNo}`} title="Request extension (manager approval, then IT revalidation)" icon={<Clock className="size-4" />} onClick={() => setExt(r.euNo)}>Extend</Button>}
      {r.status === 'Extension Pending' && r.extension && (r.extension.canAct ? (
        <>
          <Button size="sm" icon={<ShieldCheck className="size-4" />} onClick={() => setDecide({ wfId: r.extension!.workflowId, approve: true, title: `${r.extension!.step === 0 ? 'Approve extension' : 'Revalidate EWA'} ${r.euNo}`, label: r.extension!.step === 0 ? 'Approve' : 'Revalidate' })}>{r.extension.step === 0 ? 'Approve' : 'Revalidate'}</Button>
          <Button size="sm" variant="secondary" className="px-2" aria-label={`Reject extension ${r.euNo}`} title="Reject extension" icon={<X className="size-4" />} onClick={() => setDecide({ wfId: r.extension!.workflowId, approve: false, title: `Reject extension ${r.euNo}`, label: 'Reject' })} />
        </>
      ) : null)}
      {['Active', 'Partially Used', 'Expired'].includes(r.status) && can('gate.ewa', 'cancel') && <Button size="sm" variant="secondary" className="px-2 text-danger" aria-label={`Cancel EWA ${r.euNo}`} title="Cancel EWA (reason required)" icon={<Ban className="size-4" />} onClick={() => setCancel(r.euNo)}>Cancel</Button>}
      <Button size="sm" variant="ghost" className="px-1.5 text-muted" aria-label={`Open EWA ${r.euNo}`} title="Open details" icon={<ChevronRight className="size-4" />} onClick={() => setView(r.euNo)} />
    </div>
  );
  const cols: ColumnDef<Row>[] = [
    { accessorKey: 'euNo', header: 'EU no.', cell: (c) => <span className="whitespace-nowrap font-mono font-medium text-brand-700">{c.getValue<string>()}</span> },
    { accessorKey: 'clientCol', header: 'Client / contract', meta: { wrap: true }, cell: (c) => <span>{c.row.original.clientName}<ClientFlag status={c.row.original.clientStatus} /><span className="block whitespace-nowrap font-mono text-xs text-muted">{c.row.original.contractNo}</span></span> },
    { accessorKey: 'branchCode', header: 'Branch' },
    // Review 1.1: equipment type next to the released / requested count, and the gate pass(es) released under the EWA.
    { id: 'units', header: 'Units (released / requested)', cell: (c) => <span className="block min-w-36">{c.row.original.units.map((u, i) => <span key={i} className="block whitespace-nowrap">{u.usedChassis.length}/{u.qty} <span className="text-xs text-muted">{eqName(u.equipmentType)}</span></span>)}
      {c.row.original.gatePasses?.map((g) => <Link key={g.gatePassNo} onClick={(e) => e.stopPropagation()} to={`/gate/eir?q=${g.gatePassNo}`} className="block whitespace-nowrap font-mono text-xs text-brand-700 hover:underline" title={`Released ${formatDateTime(g.at)} · ${g.chassisNo}${g.truckOrcr ? ` · truck OR/CR ${g.truckOrcr}` : ''}`}>{g.gatePassNo}</Link>)}</span> },
    // Staff review 1.2: driver licence no. under the driver (DBL-GAT-001).
    { accessorKey: 'driverCol', header: 'Driver / truck / trucker', meta: { nowrap: true }, cell: (c) => <span className="whitespace-nowrap">{c.row.original.driverName}<span className="block font-mono text-xs text-muted">Lic. {c.row.original.driverLicenseNo}</span><span className="block text-xs text-muted">{c.row.original.truckPlateNo} · {c.row.original.trucker}</span></span> },
    { accessorKey: 'createdCol', header: 'Created', cell: (c) => <span className="whitespace-nowrap">{formatDateTime(c.row.original.createdAt)}<span className="block text-xs text-muted">{c.row.original.createdByName} · {c.row.original.createdVia === 'Portal' ? 'via Portal' : 'Internal'}</span></span> },
    { accessorKey: 'validUntil', header: 'Validity', cell: (c) => { const s = c.row.original.status; return ['Active', 'Partially Used'].includes(s) ? <span className="whitespace-nowrap"><Countdown until={c.getValue<string>()} /><span className="block text-xs text-muted">until {formatDateTime(c.getValue<string>())}</span></span> : <span className="whitespace-nowrap"><span className="block text-xs text-muted">{s === 'Expired' || s === 'Extension Pending' ? 'Expired' : 'Valid until'}</span>{formatDateTime(c.getValue<string>())}</span>; } },
    { accessorKey: 'status', header: 'Status', cell: (c) => { const x = c.row.original.extension; return <span className="whitespace-nowrap"><StatusBadge domain="ewa" value={c.getValue<string>()} />{c.getValue() === 'Extension Pending' && x && <span className="block text-xs text-muted">{x.canAct ? 'Waiting for you' : 'Awaiting'}: {x.stepLabel}</span>}{c.row.original.extensionCount > 0 && <span className="block text-xs text-muted">Extended ×{c.row.original.extensionCount}</span>}
      {c.getValue() === 'Cancelled' && c.row.original.cancelledAt && <span className="block max-w-56 truncate text-xs text-muted" title={`${c.row.original.cancelledByName} · ${formatDateTime(c.row.original.cancelledAt)} — ${c.row.original.cancelReason ?? ''}`}>by {c.row.original.cancelledByName} · {c.row.original.cancelReason}</span>}</span>; } },
    { id: 'a', header: '', cell: (c) => actions(c.row.original) },
  ];
  return (
    <>
      <PageHeader title="Electronic Withdrawal Authorizations" meta={<ScreenTag id="SCR-14" />} description="Valid 24 hours; an extension needs manager approval and IT revalidation. Partially Used = some units released at Gate Out; Used = all released."
        actions={can('gate.ewa', 'add') && <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New EWA</Button>} />
      {created && <Banner tone="success" className="mb-4" title={`EWA ${created.euNo} created`} actions={<span className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setView(created.euNo)}>View EWA</Button><Button size="sm" variant="secondary" onClick={() => setCreated(null)}>Dismiss</Button></span>}>Valid until {formatDateTime(created.validUntil)} (24 hours) for pickup at {created.branchCode}. Notifications sent to the client and internal recipients. The driver presents the EU number at the gate.</Banner>}
      <DataTable data={rows} loading={data.isLoading} columns={cols} exportName="ewas" onRowClick={(r) => setView(r.euNo)} emptyTitle="No EWAs match the filters"
        toolbar={<>
          <Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" options={['Active', 'Partially Used', 'Used', 'Expired', 'Extension Pending', 'Cancelled'].map((s) => ({ value: s, label: s }))} />
          <Select aria-label="Client" wrapperClassName="w-48" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} placeholder="All clients" options={(ref?.clients ?? []).map((c) => ({ value: c.clientCode, label: c.clientName }))} />
          <Select aria-label="Region" value={region} onChange={(e) => { setRegion(e.target.value); if (e.target.value && f.branch && regionOf(f.branch) !== e.target.value) setF({ ...f, branch: '' }); }} placeholder="All regions" options={regionOptions} />
          <Select aria-label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={branchOptions.filter((o) => !region || regionOf(o.value) === region)} />
          <DateRangeFilter label="Created" from={f.from} to={f.to} onChange={(v) => setF({ ...f, ...v })} />
        </>} />
      {open && <EwaCreateModal initialClient={sp.get('client') ?? ''} onClose={() => setOpen(false)} onCreated={(e) => { setOpen(false); setCreated(e); }} onView={(e) => { setOpen(false); setCreated(e); setView(e.euNo); }} />}
      {view && <EwaDetailDrawer euNo={view} onClose={() => setView(null)} onCancel={() => setCancel(view)} onExtend={() => setExt(view)} />}
      <ConfirmDialog open={!!ext} onClose={() => setExt(null)} title={`Request extension for ${ext}`} message="Step 1 Manager approval → step 2 IT/authorised revalidation. Each step records who acted and when. On approval the EWA is valid for another 24 hours." requireReason confirmLabel="Request" loading={extend.isPending} onConfirm={(r) => extend.mutate(r)} />
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} title={`Cancel EWA ${cancel}`} tone="danger" message="The driver can no longer use this EU number at the gate. Units already released stay on hire." requireReason confirmLabel="Cancel EWA" loading={cancelAct.isPending} onConfirm={(r) => cancelAct.mutate(r)} />
      <DecideDialog target={decide} onClose={() => setDecide(null)} />
    </>
  );
}

/** EWA detail (DBL-GAT-001/003): full record, linked Gate Out, extension history and audit trail. */
function EwaDetailDrawer({ euNo, onClose, onCancel, onExtend }: { euNo: string; onClose: () => void; onCancel: () => void; onExtend: () => void }) {
  const d = useData(['ewa', euNo], () => api.gate.ewaDetail(euNo));
  const { can } = useAuth();
  const { ref, eqName, userName } = useRefLookups();
  const [tab, setTab] = useState('details');
  const [edit, setEdit] = useState(false);
  const [print, setPrint] = useState(false);
  const [copied, setCopied] = useState(false);
  const e = d.data?.ewa;
  const clientStatus = ref?.clients.find((c) => c.clientCode === e?.clientCode)?.status;
  // Staff review 1.2: share = copy a direct link to this EWA; print = an EWA slip for the driver (from the stored record).
  const share = () => { const url = `${window.location.origin}${window.location.pathname}?eu=${euNo}`; void navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => undefined); };
  return (
    <Drawer open onClose={onClose} title={<span className="flex items-center gap-2">EWA <span className="font-mono">{euNo}</span>{e && <StatusBadge domain="ewa" value={e.status} />}</span>} width="max-w-2xl"
      footer={e && <>
        <Button variant="ghost" className="mr-auto" icon={<Printer className="size-4" />} onClick={() => setPrint(true)}>Print</Button>
        <Button variant="ghost" onClick={share}>{copied ? 'Link copied' : 'Copy link'}</Button>
        {e.status === 'Expired' && can('gate.ewa', 'add') && <Button variant="secondary" icon={<Clock className="size-4" />} onClick={onExtend}>Request extension</Button>}
        {['Active', 'Partially Used', 'Expired'].includes(e.status) && can('gate.ewa', 'cancel') && <Button variant="secondary" icon={<Ban className="size-4" />} onClick={onCancel}>Cancel EWA</Button>}
        {e.status !== 'Cancelled' && can('gate.ewa', 'edit') && <Button icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Edit driver / truck</Button>}
      </>}>
      {d.error && <Banner tone="danger">{errMessage(d.error)}</Banner>}
      {e && d.data && (
        <Stack>
          <Tabs value={tab} onChange={setTab} items={[{ id: 'details', label: 'Details' }, { id: 'gate', label: 'Gate passes', count: d.data.gatePasses.length }, { id: 'ext', label: 'Extensions', count: d.data.extensions.length }, { id: 'audit', label: 'Audit trail', count: d.data.audit.length }]} />
          {tab === 'details' && <>
            <KeyValueGrid cols={2} items={[
              { label: 'Client', value: <>{e.clientName} ({e.clientCode})<ClientFlag status={clientStatus} /></> },
              { label: 'Contract', value: d.data.contract ? `${d.data.contract.contractNo} · ${d.data.contract.contractType} · ${formatDate(d.data.contract.effectiveDate)} – ${d.data.contract.expiryDate ? formatDate(d.data.contract.expiryDate) : 'open-ended'}` : e.contractNo },
              { label: 'Pickup branch', value: e.branchCode }, { label: 'Trucker', value: e.trucker },
              { label: 'Driver name', value: e.driverName }, { label: 'Driver licence no.', value: e.driverLicenseNo }, { label: 'Truck plate no.', value: e.truckPlateNo },
              { label: 'Inbound leg (return)', value: e.inbound ? `${e.inbound.driverName} · ${e.inbound.driverLicenseNo} · ${e.inbound.truckPlateNo}` : 'Same as outbound' },
              { label: 'Created', value: `${formatDateTime(e.createdAt)} · ${userName(e.createdBy)} · ${e.createdVia}` },
              { label: 'Valid until', value: <>{formatDateTime(e.validUntil)}{['Active', 'Partially Used'].includes(e.status) && <> · <Countdown until={e.validUntil} /></>}</> },
              { label: 'Extensions granted', value: e.extensionCount },
              ...(e.updatedAt ? [{ label: 'Last credential update', value: `${formatDateTime(e.updatedAt)} · ${userName(e.updatedBy)}` }] : []),
              ...(e.cancelledAt ? [{ label: 'Cancelled', value: `${formatDateTime(e.cancelledAt)} · ${userName(e.cancelledBy)} — ${e.cancelReason}` }] : []),
            ]} />
            <Card><CardHeader title="Requested units" description="One unit per Gate Out; the EWA is Partially Used until all are released." />
              <ul className="space-y-1 text-sm">{e.units.map((u, i) => <li key={i} className="flex justify-between"><span>{u.qty} × {eqName(u.equipmentType)}</span><span className="text-muted">{u.usedChassis.length ? `Released: ${u.usedChassis.join(', ')}` : 'None released yet'}</span></li>)}</ul>
            </Card>
          </>}
          {tab === 'gate' && (d.data.gatePasses.length ? <ul className="divide-y divide-line rounded-lg border border-line text-sm">{d.data.gatePasses.map((g) => (
            <li key={g.gatePassNo} className="flex items-center justify-between gap-2 px-3 py-2"><span><Badge tone={g.direction === 'OUT' ? 'info' : 'success'} dot={false}>{g.direction}</Badge> <span className="font-mono">{g.gatePassNo}</span> · {g.chassisNo} · {formatDateTime(g.actualEventAt)}{g.truckOrcr && <span className="block text-xs text-muted">Truck {g.truckPlateNo} · OR/CR {g.truckOrcr}</span>}</span><Link className="text-brand-700 hover:underline" to={`/gate/eir?q=${g.gatePassNo}`}>EIR {g.eirNo}</Link></li>
          ))}</ul> : <p className="text-sm text-muted">No Gate Out recorded against this EWA yet.</p>)}
          {tab === 'ext' && (d.data.extensions.length ? d.data.extensions.map((w) => (
            <Card key={w.id}><CardHeader title={`${w.id} · requested ${formatDateTime(w.requestedAt)} by ${userName(w.requestedBy)}`} description={d.data!.audit.find((a) => a.action === 'ewa.extension_requested' && Math.abs(new Date(a.at).getTime() - new Date(w.requestedAt).getTime()) < 60_000)?.reason} actions={<StatusBadge domain="approval" value={w.status} />} />
              <ApprovalTimeline workflow={w} userName={userName} />
              {w.status === 'Approved' && (() => { const last = [...w.steps].reverse().find((s) => s.decidedAt); return last?.decidedAt ? <p className="mt-2 text-xs text-muted">New validity: 24 hours from revalidation — until {formatDateTime(new Date(new Date(last.decidedAt).getTime() + 24 * 3_600_000).toISOString())}</p> : null; })()}</Card>
          )) : <p className="text-sm text-muted">No extension requested.</p>)}
          {tab === 'audit' && (d.data.audit.length ? <ul className="divide-y divide-line rounded-lg border border-line text-sm">{d.data.audit.map((a) => (
            <li key={a.id} className="px-3 py-2"><p><span className="font-medium">{a.action}</span> · {userName(a.actor)}</p><p className="text-xs text-muted">{formatDateTime(a.at)}{a.reason ? ` — ${a.reason}` : ''}</p></li>
          ))}</ul> : <p className="text-sm text-muted">No audit events.</p>)}
        </Stack>
      )}
      {edit && e && <EwaEditModal ewa={e} onClose={() => setEdit(false)} />}
      {print && e && (
        <PrintPreview open onClose={() => setPrint(false)} title={`EWA ${e.euNo}`}>
          <div className="space-y-3 text-[13px]">
            <div className="flex items-start justify-between border-b-2 border-brand-600 pb-2"><div><p className="text-lg font-bold">ELECTRONIC WITHDRAWAL AUTHORIZATION</p><p className="text-muted">Present this EU number at the Gate Out of the pickup branch.</p></div><p className="font-mono text-lg font-bold">{e.euNo}</p></div>
            <KeyValueGrid cols={2} items={[{ label: 'Client', value: `${e.clientName} (${e.clientCode})` }, { label: 'Contract', value: e.contractNo }, { label: 'Pickup branch', value: e.branchCode }, { label: 'Status', value: e.status },
              { label: 'Trucker', value: e.trucker }, { label: 'Driver', value: `${e.driverName} · licence ${e.driverLicenseNo}` }, { label: 'Truck plate', value: e.truckPlateNo }, { label: 'Units', value: e.units.map((u) => `${u.qty} × ${eqName(u.equipmentType)}`).join(', ') },
              { label: 'Created', value: `${formatDateTime(e.createdAt)} · ${userName(e.createdBy)} · ${e.createdVia}` }, { label: 'Valid until', value: formatDateTime(e.validUntil) }]} />
            <p className="text-xs text-muted">Valid 24 hours from creation. Printed {formatDateTime(new Date().toISOString())}.</p>
          </div>
        </PrintPreview>
      )}
    </Drawer>
  );
}

/** DBL-GAT-003: Branch Generalist updates driver, licence and truck for the outbound or inbound leg. */
function EwaEditModal({ ewa, onClose }: { ewa: { euNo: string; status: string; trucker: string; driverName: string; driverLicenseNo: string; truckPlateNo: string; inbound?: { trucker: string; driverName: string; driverLicenseNo: string; truckPlateNo: string } }; onClose: () => void }) {
  const pick = (leg: 'OUT' | 'IN') => { const s = leg === 'IN' && ewa.inbound ? ewa.inbound : ewa; return { trucker: s.trucker, driverName: s.driverName, driverLicenseNo: s.driverLicenseNo, truckPlateNo: s.truckPlateNo }; };
  const [leg, setLeg] = useState<'OUT' | 'IN'>(ewa.status === 'Used' ? 'IN' : 'OUT');
  const [v, setV] = useState(pick(leg));
  const [reason, setReason] = useState('');
  const save = useAction(() => api.gate.updateEwaCredentials(ewa.euNo, leg, v, reason), { success: 'EWA credentials updated', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Edit driver / truck — ${ewa.euNo}`} description="Changes are audited (before → after, who, when, reason)." size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!reason.trim() || !v.driverName.trim() || !v.driverLicenseNo.trim() || !v.truckPlateNo.trim()} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <Stack>
        <Segmented value={leg} onChange={(l) => { setLeg(l); setV(pick(l)); }} options={[{ value: 'OUT', label: 'Outbound leg (pickup)' }, { value: 'IN', label: 'Inbound leg (return)' }]} />
        {leg === 'OUT' && ewa.status === 'Used' && <Banner tone="warning">All units have gone out — only the inbound leg can be changed.</Banner>}
        <FormGrid>
          <Input label="Trucker" required value={v.trucker} onChange={(e) => setV({ ...v, trucker: e.target.value })} placeholder="e.g. ABC Trucking Services" />
          <Input label="Driver name" required value={v.driverName} onChange={(e) => setV({ ...v, driverName: e.target.value })} placeholder="e.g. Juan Dela Cruz" />
          <Input label="Driver licence no." required value={v.driverLicenseNo} onChange={(e) => setV({ ...v, driverLicenseNo: e.target.value })} placeholder="e.g. N01-23-456789" />
          <Input label="Truck plate no." required value={v.truckPlateNo} onChange={(e) => setV({ ...v, truckPlateNo: e.target.value })} placeholder="e.g. ABC 1234" />
        </FormGrid>
        <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. replacement driver assigned by the trucker" error={fieldError(save.error, 'reason')} />
        {save.error && <Banner tone="danger">{errMessage(save.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

type CreatedEwa = Awaited<ReturnType<typeof api.gate.createEwa>>;
function EwaCreateModal({ initialClient, onClose, onCreated, onView }: { initialClient: string; onClose: () => void; onCreated: (e: CreatedEwa) => void; onView: (e: CreatedEwa) => void }) {
  const { user } = useAuth();
  const { ref, branchOptions, eqName, userName } = useRefLookups();
  const [done, setDone] = useState<CreatedEwa | null>(null);
  const scoped = user?.branchAccess === 'ALL' ? branchOptions : branchOptions.filter((o) => (Array.isArray(user?.branchAccess) && user.branchAccess.includes(o.value)) || o.value === user?.branchCode);
  const defBranch = user?.branchCode && user.branchCode !== 'HO' ? user.branchCode : 'MNL';
  const f = useForm<EwaForm>({ resolver: zodResolver(ewaSchema), defaultValues: { clientCode: initialClient, contractNo: '', branchCode: defBranch, units: [{ equipmentType: '', qty: 1 }] } });
  const units = useFieldArray({ control: f.control, name: 'units' });
  const clientCode = f.watch('clientCode'); const contractNo = f.watch('contractNo'); const branchCode = f.watch('branchCode');
  const client = useData(['client', clientCode], () => api.clients.get(clientCode), !!clientCode);
  const avail = useData(['ewa-avail', branchCode], () => api.gate.availability(branchCode), !!branchCode);
  const gate = useGate(clientCode, 'EWA_CREATE');
  const contracts = (client.data?.contracts ?? []).filter((c) => c.status === 'Active');
  const contract = contracts.find((c) => c.contractNo === contractNo);
  useEffect(() => { f.setValue('contractNo', contracts.length === 1 ? contracts[0].contractNo : ''); }, [clientCode, contracts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Equipment types the client is entitled to under the selected contract, with live availability at the pickup branch.
  const entitled = (ref?.equipmentTypes ?? []).filter((t) => !contract || contract.rates.some((r) => r.equipmentType === t.code));
  const eqOpts = entitled.map((t) => { const n = avail.data?.[t.code] ?? 0; return { value: t.code, label: `${t.name} · ${n} available at ${branchCode}`, disabled: n === 0 }; });
  const create = useAction((v: EwaForm) => api.gate.createEwa(v), { success: (e) => `EWA ${e.euNo} created`, onSuccess: (e) => setDone(e) });
  const e = f.formState.errors;
  const blocked = ref?.clients.find((c) => c.clientCode === clientCode);
  const lines = f.watch('units') ?? [];
  const [trucker, driverName, driverLicenseNo, truckPlateNo] = f.watch(['trucker', 'driverName', 'driverLicenseNo', 'truckPlateNo']);
  // Review 1.1: per-line checks — more than available at the pickup branch, or the same type on two lines.
  const lineIssue = (i: number) => { const l = lines[i]; if (!l?.equipmentType) return undefined; const n = avail.data?.[l.equipmentType];
    if (lines.findIndex((x) => x.equipmentType === l.equipmentType) !== i) return 'Already on another line — change the quantity there';
    return n != null && Number(l.qty) > n ? `Only ${n} available at ${branchCode}` : undefined; };
  const lineErrors = lines.map((_, i) => lineIssue(i));
  const need = [!clientCode && 'client', !contractNo && 'contract', !branchCode && 'pickup branch', !trucker?.trim() && 'trucker', !driverName?.trim() && 'driver name', !driverLicenseNo?.trim() && 'driver licence no.', !truckPlateNo?.trim() && 'truck plate',
    !lines.some((l) => l.equipmentType) && 'equipment type', lines.some((l) => !(Number(l.qty) >= 1)) && 'quantity (1 or more)'].filter(Boolean) as string[];
  // Staff review 1.2 (GAT-002): confirmation step with the generated EU number, the full details and who was notified.
  if (done) {
    const cl = client.data?.client as unknown as { clientName?: string; aeAssigned?: string; contacts?: { firstName: string; lastName: string }[] } | undefined;
    return (
      <Modal open onClose={() => onCreated(done)} title={`EWA ${done.euNo} created`} description="Give the EU number to the driver. It is checked at Gate Out." size="lg"
        footer={<><Button variant="secondary" onClick={() => onCreated(done)}>Close</Button><Button onClick={() => onView(done)}>View EWA</Button></>}>
        <Stack>
          <div className="flex items-center gap-3"><CheckCircle2 className="size-10 text-success" /><div><p className="font-mono text-xl font-semibold">{done.euNo}</p><p className="text-sm text-muted">Valid until {formatDateTime(done.validUntil)} (24 hours) · pickup at {done.branchCode}</p></div></div>
          <KeyValueGrid cols={2} items={[
            { label: 'Client', value: `${cl?.clientName ?? done.clientCode} (${done.clientCode})` }, { label: 'Contract', value: done.contractNo },
            { label: 'Pickup branch', value: done.branchCode }, { label: 'Trucker', value: done.trucker },
            { label: 'Driver', value: `${done.driverName} · licence ${done.driverLicenseNo}` }, { label: 'Truck plate', value: done.truckPlateNo },
            { label: 'Requested units', value: done.units.map((u) => `${u.qty} × ${eqName(u.equipmentType)}`).join(', ') }, { label: 'Created', value: `${formatDateTime(done.createdAt)} · ${user?.name ?? ''} · Internal` },
          ]} />
          <Banner tone="success" title="Notifications sent">Email and in-app notice to the client{cl?.contacts?.[0] ? ` (${[cl.contacts[0].firstName, cl.contacts[0].lastName].filter(Boolean).join(' ')})` : ''}, the account executive{cl?.aeAssigned ? ` (${userName(cl.aeAssigned)})` : ''} and the {done.branchCode} branch team, with the EU number, valid-until time, driver and truck.</Banner>
        </Stack>
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} title="New EWA" description="Created on behalf of the client. Clients can also self-serve in the portal." size="lg"
      footer={<>{need.length > 0 && <span className="mr-auto text-xs text-muted">Required: {need.join(', ')}</span>}<Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={create.isPending} disabled={!gate.allowed || !contracts.length || lineErrors.some(Boolean)} onClick={f.handleSubmit((v) => create.mutate(v))}>Create EWA</Button></>}>
      <Stack>
        <FormGrid>
          <ClientPicker value={clientCode} onChange={(c) => f.setValue('clientCode', c, { shouldValidate: true })} error={e.clientCode?.message} />
          <Select label="Contract" required {...f.register('contractNo')} placeholder={!clientCode ? 'Select a client first' : contracts.length ? 'Select contract' : 'No active contract'} disabled={!contracts.length}
            options={contracts.map((c) => ({ value: c.contractNo, label: `${c.contractNo} · ${c.contractType} · valid ${formatDate(c.effectiveDate)} – ${c.expiryDate ? formatDate(c.expiryDate) : 'open-ended'}` }))} error={e.contractNo?.message}
            hint={clientCode && client.data ? (contracts.length > 1 ? `${contracts.length} active contracts — choose the one this pickup is billed under.` : contracts.length ? 'Only active contracts are listed.' : 'This client has no active contract — an EWA cannot be created.') : undefined} />
        </FormGrid>
        {blocked && blocked.status !== 'Active' && <Banner tone="danger" title="Client not eligible for an EWA">{ewaBlockReason(blocked.status)}.</Banner>}
        {blocked?.status === 'Active' && <p className="-mt-2 flex items-center gap-2 text-xs text-muted">Client status <StatusBadge domain="client" value="Active" /> accredited, no credit hold — eligible for an EWA. A client on Hold, Draft (not yet accredited), Inactive or Blacklisted cannot be selected.</p>}
        <CreditGateBanner clientCode={clientCode} action="EWA_CREATE" />
        <FormGrid>
          <Select label="Pickup branch" required {...f.register('branchCode')} options={scoped} error={e.branchCode?.message}
            hint={<>Defaults to your branch; branch-scoped users see only their branches. Head Office is not offered as a pickup depot.</>} />
          <Input label="Trucker" required {...f.register('trucker')} placeholder="e.g. ABC Trucking Services" error={e.trucker?.message} />
          <Input label="Driver name" required {...f.register('driverName')} placeholder="e.g. Juan Dela Cruz" error={e.driverName?.message} />
          <Input label="Driver licence no." required {...f.register('driverLicenseNo')} placeholder="e.g. N01-23-456789" error={e.driverLicenseNo?.message} />
          <Input label="Truck plate no." required {...f.register('truckPlateNo')} placeholder="e.g. ABC 1234" error={e.truckPlateNo?.message} />
        </FormGrid>
        <div>
          <p className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink-2"><span>Requested units <span className="text-danger" aria-hidden>*</span></span><span className="text-xs font-normal text-muted">{contract ? `Types covered by ${contract.contractNo}` : 'Select a contract to list entitled types'}</span></p>
          {units.fields.map((u, i) => (<div key={u.id}>
            <div className="mb-2 flex items-end gap-2">
              <Select wrapperClassName="flex-1" aria-label="Equipment type" placeholder="Select equipment type" disabled={!contract} options={eqOpts} {...f.register(`units.${i}.equipmentType`)} error={e.units?.[i]?.equipmentType?.message} />
              <Input wrapperClassName="w-24" aria-label="Qty" type="number" min={1} placeholder="e.g. 1" {...f.register(`units.${i}.qty`)} />
              {units.fields.length > 1 && <Button variant="ghost" aria-label="Remove line" title="Remove line" onClick={() => units.remove(i)} icon={<Trash2 className="size-4" />} />}
            </div>
            {lineErrors[i] ? <p className="-mt-1 mb-2 text-xs text-danger">{lineErrors[i]}</p>
              : lines[i]?.equipmentType && avail.data ? <p className="-mt-1 mb-2 text-xs text-muted">{avail.data[lines[i].equipmentType] ?? 0} available now at {branchCode}</p> : null}
          </div>))}
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => units.append({ equipmentType: '', qty: 1 })}>Add line</Button>
          {!!f.watch('units')?.some((l) => l.equipmentType) && <p className="mt-1 text-xs text-muted">{f.watch('units').filter((l) => l.equipmentType).map((l) => `${l.qty} × ${eqName(l.equipmentType)}`).join(', ')}</p>}
        </div>
        <Banner tone="info">Validity: 24 hours from creation. Availability is checked live at the pickup branch.</Banner>
        {create.error && <Banner tone="danger">{errMessage(create.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

// ── SCR-15 Gate Out Processing (Outbound, GP2 Out Rev.2) ───────────────────
const CRED: { key: 'driverName' | 'driverLicenseNo' | 'truckPlateNo'; label: string }[] = [{ key: 'driverName', label: 'Driver name' }, { key: 'driverLicenseNo', label: 'Driver licence no.' }, { key: 'truckPlateNo', label: 'Truck plate' }];
const norm = (s?: string) => (s ?? '').replace(/[\s-]/g, '').toUpperCase();

// EWAs ready for release (Active / Partially Used) — one click validates that EU number.
function ReleasablePicker({ onPick }: { onPick: (euNo: string) => void }) {
  const data = useData(['ewas', 'releasable'], () => api.gate.ewas());
  const { user } = useAuth();
  const { eqName } = useRefLookups();
  type Row = NonNullable<typeof data.data>[number];
  if (data.error) return null;
  const rows = data.data?.filter((e) => e.status === 'Active' || e.status === 'Partially Used');
  const scope = user?.branchAccess === 'ALL' ? 'all branches' : Array.isArray(user?.branchAccess) && user.branchAccess.length ? user.branchAccess.join(', ') : user?.branchCode;
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-ink">EWAs ready for release{rows ? ` (${rows.length})` : ''} <span className="font-normal text-muted">· {scope} · Active and Partially Used (stays listed until every unit is released) · the chassis, truck OR/CR, inspection, signature and gate pass are captured after Release</span></h2>
      <DataTable<Row> data={rows} loading={data.isLoading} pageSize={10} searchPlaceholder="Filter by EU no., client or driver…" emptyTitle="No active EWAs" onRowClick={(r) => onPick(r.euNo)} columns={[
        { accessorKey: 'euNo', header: 'EU no.', cell: (c) => <span className="whitespace-nowrap font-mono font-medium">{c.getValue<string>()}</span> },
        // Staff review 1.2: client hold flag (release is blocked for a client on Hold, BR-01), status, trucker and driver licence.
        { accessorKey: 'clientName', header: 'Client', cell: (c) => <span>{c.getValue<string>()}<ClientFlag status={c.row.original.clientStatus} /><span className="block font-mono text-xs text-muted">{c.row.original.clientCode}</span></span> },
        { accessorKey: 'branchCode', header: 'Branch' },
        { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge domain="ewa" value={c.getValue<string>()} /> },
        { id: 'units', header: 'Released', cell: (c) => c.row.original.units.map((u, i) => <span key={i} className="block whitespace-nowrap">{u.usedChassis.length}/{u.qty} <span className="text-xs text-muted">{eqName(u.equipmentType)}</span></span>) },
        { accessorKey: 'driverName', header: 'Driver / truck / trucker', meta: { nowrap: true }, cell: (c) => <span className="whitespace-nowrap">{c.getValue<string>()}<span className="block font-mono text-xs text-muted">Lic. {c.row.original.driverLicenseNo}</span><span className="block text-xs text-muted">{c.row.original.truckPlateNo} · {c.row.original.trucker}</span></span> },
        { accessorKey: 'validUntil', header: 'Validity', cell: (c) => <span className="whitespace-nowrap"><Countdown until={c.getValue<string>()} /><span className="block text-xs text-muted">until {formatDateTime(c.getValue<string>())}</span></span> },
        { id: 'a', header: '', cell: (c) => <div className="flex justify-end"><Button size="sm" variant="secondary" icon={<Truck className="size-4" />} onClick={(e) => { e.stopPropagation(); onPick(c.row.original.euNo); }}>Release</Button></div> },
      ]} />
    </div>
  );
}

export function GateOutPage() {
  const { user } = useAuth();
  const { eqName, clientName } = useRefLookups();
  const [eu, setEu] = useState('');
  const [lookup, setLookup] = useState<Awaited<ReturnType<typeof api.gate.lookupEwa>> | null>(null);
  const [lookErr, setLookErr] = useState<ApiError | null>(null);
  const [chassisNo, setChassisNo] = useState('');
  const [truck, setTruck] = useState({ trucker: '', truckPlateNo: '', truckOrcr: '', driverName: '', driverLicenseNo: '' });
  const [assessment, setAssessment] = useState<Assessment>('Roadworthy');
  const [lines, setLines] = useState(blankChecklist);
  const [sig, setSig] = useState<string>();
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [done, setDone] = useState<{ gatePassNo: string; eirNo: string; remaining: number } | null>(null);
  const [print, setPrint] = useState(false);
  const eirs = useData(['eirs', done?.eirNo], () => api.gate.eirs({ q: done!.eirNo }), !!done);
  // Staff review 1.2: "Release" on the EWA list opens Gate Out with ?eu= and validates it straight away.
  const [sp] = useSearchParams();
  useEffect(() => { const q = sp.get('eu'); if (q) { setEu(q); void find(q); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const find = async (key = eu) => {
    if (!key.trim()) return;
    setLookErr(null); setLookup(null);
    try {
      const r = await api.gate.lookupEwa(key);
      setLookup(r); setChassisNo(''); setAck(false);
      setTruck({ trucker: r.ewa.trucker, truckPlateNo: r.ewa.truckPlateNo, truckOrcr: '', driverName: r.ewa.driverName, driverLicenseNo: r.ewa.driverLicenseNo });
    } catch (e) { setLookErr(e as ApiError); }
  };
  const mismatch = lookup ? CRED.filter((c) => norm(truck[c.key]) !== norm(lookup.ewa[c.key])) : [];
  const remaining = lookup ? lookup.ewa.units.reduce((a, u) => a + u.qty - u.usedChassis.length, 0) : 0;
  const submit = useAction(() => api.gate.gateOut({ euNo: lookup!.ewa.euNo, chassisNo, ...truck, generalAssessment: assessment, inspection: lines, signature: sig, remarks, photos, credentialMismatch: mismatch.map((m) => m.label) }), {
    success: (r) => `Released — ${r.gatePassNo}`, onSuccess: (r) => setDone({ ...r, remaining: remaining - 1 }),
  });
  const reset = () => { setDone(null); setLookup(null); setEu(''); setLines(blankChecklist()); setSig(undefined); setAssessment('Roadworthy'); setRemarks(''); setPhotos([]); setAck(false); };
  const selected = useMemo(() => lookup?.candidates.find((c) => c.chassisNo === chassisNo), [lookup, chassisNo]);
  const missing = [!chassisNo && 'equipment #', !truck.trucker.trim() && 'trucker', !truck.truckPlateNo.trim() && 'truck plate', !truck.truckOrcr.trim() && 'truck OR/CR', !truck.driverName.trim() && 'driver name', !truck.driverLicenseNo.trim() && 'driver licence no.', !sig && 'driver signature', mismatch.length > 0 && !ack && 'EWA credential confirmation'].filter(Boolean) as string[];

  if (done) {
    const e = eirs.data?.[0];
    return (
      <div className="max-w-2xl">
        <PageHeader title="Unit released" meta={<ScreenTag id="SCR-15" />} />
        <Card><Stack>
          <div className="flex items-center gap-3"><CheckCircle2 className="size-10 text-success" /><div><p className="text-lg font-semibold">Gate pass <span className="font-mono">{done.gatePassNo}</span></p><p className="text-sm text-muted">EIR {done.eirNo} · chassis is now on hire · billing clock started</p></div></div>
          <p className="text-sm text-ink-2">{done.remaining > 0 ? `EWA is now Partially Used — ${done.remaining} unit(s) still to release on the same EU number.` : 'All requested units released — EWA is now Used.'}</p>
          <div className="flex gap-2"><Button icon={<Printer className="size-4" />} onClick={() => setPrint(true)} disabled={!e}>Print EIR</Button><Button variant="secondary" onClick={reset}>Next release</Button></div>
        </Stack></Card>
        {e && <PrintPreview open={print} onClose={() => setPrint(false)} title={`EIR ${e.eirNo}`}><EirDocument eir={e} out={e.out} clientName={clientName(e.clientCode)} eqName={eqName} copy="OUT" userName={() => user?.name ?? ''} /></PrintPreview>}
      </div>
    );
  }
  return (
    <div className="max-w-6xl">
      <PageHeader title="Gate Out — outbound" meta={<ScreenTag id="SCR-15" />} description="Validate the EWA, verify the driver and truck, inspect the unit, capture the driver's signature and generate the gate pass and EIR in one step. Tablet-friendly." />
      <Stack>
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <Input wrapperClassName="w-72" label="EWA / EU number" placeholder="Scan or type, e.g. EU-000781" value={eu} onChange={(e) => setEu(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} autoFocus />
            <Button size="lg" icon={<ScanLine className="size-4" />} onClick={() => find()}>Validate EWA</Button>
          </div>
          {lookErr && <Banner className="mt-3" tone="danger" title={lookErr.code === 'EWA_EXPIRED' ? 'EWA expired — release blocked' : lookErr.status === 404 ? 'EWA not found' : 'EWA not valid for release'}
            actions={lookErr.code === 'EWA_EXPIRED' ? <Link to={`/gate/ewa?eu=${eu.trim().toUpperCase()}`} className="text-sm font-medium text-brand-700 hover:underline">Request extension →</Link> : lookErr.status === 404 ? <Link to="/gate/ewa" className="text-sm font-medium text-brand-700 hover:underline">Find the EWA →</Link> : undefined}>{lookErr.message}{lookErr.status === 404 && <span className="mt-1 block text-xs">Check the EU number on the driver's slip, or pick the EWA from the list below.</span>}</Banner>}
        </Card>
        {!lookup && <ReleasablePicker onPick={(no) => { setEu(no); void find(no); }} />}
        {lookup && (
          <>
            {!lookup.gate.allowed && <Banner tone="danger" title="Release blocked — client account on Hold" actions={<Link to={`/credit/status?client=${lookup.ewa.clientCode}`} className="text-sm font-medium text-brand-700 hover:underline">Client status →</Link>}>{`${lookup.gate.reason ?? ''} Override path: settle the balance and lift the hold via Credit & Collection tiered approval; the EWA stays valid until it expires.`}</Banner>}
            <Card>
              <CardHeader title={`EWA ${lookup.ewa.euNo}`} description={lookup.ewa.clientName} actions={<><StatusBadge domain="ewa" value={lookup.ewa.status} /><Countdown until={lookup.ewa.validUntil} /></>} />
              <KeyValueGrid items={[{ label: 'Client code', value: lookup.ewa.clientCode }, { label: 'Contract', value: lookup.ewa.contractNo }, { label: 'Branch', value: lookup.ewa.branchCode },
                { label: 'Still to release', value: lookup.ewa.units.map((u) => `${u.qty - u.usedChassis.length} × ${eqName(u.equipmentType)}`).join(', ') },
                { label: 'Gate pass no.', value: <span className="font-mono">GP-{lookup.ewa.branchCode}-###### <span className="font-sans text-xs text-muted">(assigned on release)</span></span> },
                { label: 'Releasing user', value: user?.name }, { label: 'Release time', value: 'Captured automatically on release' }, { label: 'Depot', value: lookup.ewa.branchCode }]} />
            </Card>
            <FormSection title="Equipment & truck" description="One unit per Gate Out. Only available units of the requested type at the EWA branch are listed.">
              <FormGrid>
                {/* Staff review 1.2: units allocated to this client are listed first with their unit request (UR); a 3-axle unit adds the L3 / R3 tires to the checklist. */}
                <Select label="Equipment # (chassis)" required value={chassisNo} onChange={(e) => { const no = e.target.value; setChassisNo(no); setLines(checklistFor(lookup.candidates.find((c) => c.chassisNo === no)?.axleConfig)); }} placeholder={lookup.candidates.length ? 'Select an available unit' : 'No matching available units'}
                  hint={lookup.candidates.some((c) => c.allocation?.clientCode === lookup.ewa.clientCode) ? 'Units allocated to this client are listed first.' : undefined}
                  options={[...lookup.candidates].sort((a, b) => Number(b.allocation?.clientCode === lookup.ewa.clientCode) - Number(a.allocation?.clientCode === lookup.ewa.clientCode)).map((c) => ({ value: c.chassisNo, label: `${c.chassisNo} · ${eqName(c.chassisType)} · ${c.status}${c.allocation ? ` to ${c.allocation.clientCode === lookup.ewa.clientCode ? 'this client' : c.allocation.clientCode}${c.allocation.requestNo ? ` (${c.allocation.requestNo})` : ''}` : ''}${c.axleConfig === '3-axle' ? ' · 3-axle' : ''}${c.registration && new Date(c.registration.expiryDate) < new Date() ? ' · REG EXPIRED' : ''}` }))} />
                <Input label="Trucker" required value={truck.trucker} placeholder="e.g. ABC Trucking Services" onChange={(e) => setTruck({ ...truck, trucker: e.target.value })} />
                <Input label="Truck plate" required value={truck.truckPlateNo} placeholder="e.g. ABC 1234" onChange={(e) => setTruck({ ...truck, truckPlateNo: e.target.value })} hint={mismatch.some((m) => m.key === 'truckPlateNo') ? `EWA: ${lookup.ewa.truckPlateNo}` : undefined} />
                <Input label="Truck OR/CR (vehicle registration)" required value={truck.truckOrcr} placeholder="e.g. OR 4100200 / CR 5200300 (LTO, not a payment receipt)" onChange={(e) => setTruck({ ...truck, truckOrcr: e.target.value })} error={fieldError(submit.error, 'truckOrcr')} hint="Verify the vehicle registration in person." />
                <Input label="Driver name" required value={truck.driverName} placeholder="e.g. Juan Dela Cruz" onChange={(e) => setTruck({ ...truck, driverName: e.target.value })} hint={mismatch.some((m) => m.key === 'driverName') ? `EWA: ${lookup.ewa.driverName}` : undefined} />
                <Input label="Driver licence no." required value={truck.driverLicenseNo} placeholder="e.g. N01-23-456789" onChange={(e) => setTruck({ ...truck, driverLicenseNo: e.target.value })} hint={mismatch.some((m) => m.key === 'driverLicenseNo') ? `EWA: ${lookup.ewa.driverLicenseNo}` : undefined} />
              </FormGrid>
              {mismatch.length ? (
                <Banner className="mt-3" tone="warning" title={`Differs from the EWA: ${mismatch.map((m) => m.label).join(', ')}`}>
                  <p>The driver or truck at the gate does not match EWA {lookup.ewa.euNo}. Check the licence and registration in person; the Branch Generalist may correct the credentials. The change is audited.</p>
                  <Checkbox className="mt-2" checked={ack} onChange={(e) => setAck(e.target.checked)} label="I verified the driver's licence and truck registration and confirm the updated details." />
                </Banner>
              ) : <p className="mt-3 flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="size-4" />Driver name, driver licence no. and truck plate match the EWA.</p>}
              {selected?.registration && new Date(selected.registration.expiryDate) < new Date() && <Banner className="mt-3" tone="danger">Registration expired — this unit cannot be released.</Banner>}
            </FormSection>
            <FormSection title="Inspection" description="Qty = pieces of the part present on the unit." actions={<Segmented value={assessment} onChange={setAssessment} options={[{ value: 'Roadworthy', label: 'Roadworthy' }, { value: 'Unroadworthy', label: 'Unroadworthy' }]} />}>
              <InspectionChecklist lines={lines} onChange={setLines} showCharges={false} />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Textarea label="Remarks — noted damage / missing items" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Printed on the EIR" />
                <PhotoInput value={photos} onChange={setPhotos} />
              </div>
            </FormSection>
            <Card><SignaturePad value={sig} onChange={setSig} /></Card>
            {assessment === 'Unroadworthy' && <Banner tone="danger" title="Unroadworthy — release blocked">Unroadworthy units cannot be released. Choose another unit and tag this one for repair (behaviour pending client confirmation).</Banner>}
            {submit.error && <Banner tone="danger">{errMessage(submit.error)}</Banner>}
            <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
              {missing.length > 0 && <span className="mr-auto text-xs text-muted">Required: {missing.join(', ')}</span>}
              <Button variant="secondary" onClick={() => setLookup(null)}>Cancel</Button>
              <Button size="lg" icon={<Truck className="size-4" />} loading={submit.isPending} disabled={!lookup.gate.allowed || missing.length > 0 || assessment === 'Unroadworthy'} onClick={() => submit.mutate(undefined)}>Release unit & generate EIR</Button>
            </div>
          </>
        )}
      </Stack>
    </div>
  );
}

// ── SCR-17 EIR View / Reprint ───────────────────────────────────────────────
type EirRow = Awaited<ReturnType<typeof api.gate.eirs>>[number];
const EIR_STATUS_TONE: Record<string, 'info' | 'success' | 'danger'> = { 'On Hire': 'info', Returned: 'success', 'Force Inbound': 'danger' };

/** Staff review 1.2: one rule for the gate-out date on Gate In, the EIR list and the EIR detail (BR-05). The actual date is used once the
 *  late-encoding correction is in effect (auto-corrected, or Credit Memo approved); while the Credit Memo is pending the encoded date stays. */
export function outDateInfo(r: { eirOutDate: string; eirInDate?: string; gatePassOutNo: string; out?: GatePass; lateInfo?: { status: string; correctedDate: string; gatePassNo?: string; daysLate: number } }) {
  const at = r.out?.actualEventAt ?? r.eirOutDate;
  const li = r.lateInfo && (!r.lateInfo.gatePassNo || r.lateInfo.gatePassNo === r.gatePassOutNo) ? r.lateInfo : undefined;
  const note = at !== r.eirOutDate ? `encoded ${formatDateTime(r.eirOutDate)}`
    : li?.status === 'Pending Approval' ? `actual ${formatDateTime(li.correctedDate)} · Credit Memo pending`
    : li?.status === 'Rejected' ? `actual ${formatDateTime(li.correctedDate)} · correction rejected` : undefined;
  const days = Math.max(0, Math.floor(((r.eirInDate ? new Date(r.eirInDate).getTime() : Date.now()) - new Date(at).getTime()) / 86_400_000));
  return { at, note, pending: li?.status === 'Pending Approval', days };
}

export function EirPage() {
  const [sp] = useSearchParams();
  const { user } = useAuth();
  const { ref, branchOptions, eqName, userName } = useRefLookups();
  const [f, setF] = useState({ q: sp.get('q') ?? '', from: '', to: '', client: '', depot: '', status: '' });
  const data = useData(['eirs', f], () => api.gate.eirs(f));
  const [sel, setSel] = useState<{ row: EirRow; tab: string } | null>(null);
  const [rp, setRp] = useState<EirRow | null>(null);
  const [printed, setPrinted] = useState<{ row: EirRow; copy: 'OUT' | 'IN'; no: number; reason: string; at: string } | null>(null);
  // Merged columns carry a combined value so sorting and the CSV export keep both parts.
  // Staff review 1.2: contract, truck / trucker, condition (assessment + chargeable damages), returning branch and last reprint added; the
  // out date follows the same late-encoding rule as Gate In (outDateInfo).
  const rows = useMemo(() => data.data?.map((r) => { const leg = r.in ?? r.out; const od = outDateInfo(r); const dmg = (r.in?.inspection ?? []).reduce((a, l) => a + (l.chargeable || 0), 0);
    return { ...r, od, dmg, chassisCol: `${r.chassisNo} · ${eqName(r.chassisType)}`, clientCol: `${r.clientName} · ${r.contractNo}`, driverCol: `${r.driverName} · ${r.driverLicenseNo}`, truckCol: `${leg?.truckPlateNo ?? ''} · ${leg?.trucker ?? ''}`, gpCol: `${r.gatePassOutNo} / ${r.gatePassInNo ?? '—'}`, datesCol: `${od.at} / ${r.eirInDate ?? ''}`,
      depotCol: `${r.depotCode}${r.in && r.in.branchCode !== r.depotCode ? ` → ${r.in.branchCode}` : ''}`, condCol: `${r.out?.generalAssessment ?? ''}${r.in ? ` / ${r.in.generalAssessment}` : ''}${dmg ? ` · ${dmg}` : ''}`,
      statusCol: [r.eirStatus, r.lateEncoded && 'Late-encoded', r.reprintCount && `Reprinted ×${r.reprintCount}`].filter(Boolean).join(' · ') }; }), [data.data, eqName]);
  type ListRow = NonNullable<typeof rows>[number];
  const cols: ColumnDef<ListRow>[] = [
    { accessorKey: 'eirNo', header: 'EIR no.', cell: (c) => <span className="whitespace-nowrap font-mono font-medium">{c.getValue<string>()}</span> },
    { accessorKey: 'clientCol', header: 'Client / contract', meta: { wrap: true }, cell: (c) => <span className="block min-w-40">{c.row.original.clientName}<span className="block whitespace-nowrap font-mono text-xs text-muted">{c.row.original.contractNo}</span></span> },
    { accessorKey: 'chassisCol', header: 'Chassis / type', meta: { nowrap: true }, cell: (c) => <span className="whitespace-nowrap"><span className="font-mono">{c.row.original.chassisNo}</span><span className="block text-xs text-muted">{eqName(c.row.original.chassisType)}</span></span> },
    { accessorKey: 'driverCol', header: 'Driver / licence no.', meta: { nowrap: true }, cell: (c) => <span className="whitespace-nowrap">{c.row.original.driverName}<span className="block font-mono text-xs text-muted">{c.row.original.driverLicenseNo}</span></span> },
    { accessorKey: 'truckCol', header: 'Truck / trucker', meta: { nowrap: true }, cell: (c) => { const leg = c.row.original.in ?? c.row.original.out; return <span className="whitespace-nowrap">{leg?.truckPlateNo ?? '—'}<span className="block text-xs text-muted">{leg?.trucker ?? ''}</span></span>; } },
    { accessorKey: 'gpCol', header: 'Gate pass out / in', meta: { nowrap: true }, cell: (c) => <span className="whitespace-nowrap font-mono">{c.row.original.gatePassOutNo}<span className={cn('block text-xs text-muted', !c.row.original.gatePassInNo && 'font-sans')}>{c.row.original.gatePassInNo ?? '—'}</span></span> },
    { accessorKey: 'datesCol', header: 'EIR out / in', meta: { nowrap: true }, cell: (c) => { const od = c.row.original.od; return <span className="whitespace-nowrap">{formatDateTime(od.at)}{od.note && <span className={cn('block text-xs', od.pending ? 'text-warning' : 'text-muted')}>{od.note}</span>}<span className="block text-xs text-muted">{c.row.original.eirInDate ? `in ${formatDateTime(c.row.original.eirInDate)}` : `${od.days} days on hire`}</span></span>; } },
    { accessorKey: 'depotCol', header: 'Depot', cell: (c) => { const r = c.row.original; return <span className="whitespace-nowrap">{r.depotCode}{r.in && r.in.branchCode !== r.depotCode && <span className="block text-xs text-muted" title="Cross-branch return — the chassis moved to the returning branch">returned to {r.in.branchCode}</span>}</span>; } },
    { accessorKey: 'condCol', header: 'Condition', cell: (c) => { const r = c.row.original; return <span className="whitespace-nowrap text-xs">Out: {r.out?.generalAssessment ?? '—'}{r.in && <span className="block">In: {r.in.generalAssessment}{r.dmg ? <span className="text-warning"> · {formatPhp(r.dmg)} damages</span> : ''}</span>}</span>; } },
    { accessorKey: 'statusCol', header: 'Status', cell: (c) => { const n = c.row.original.reprintCount; const st = c.row.original.eirStatus; return (
      <span className="flex flex-col items-start gap-1"><span className="flex flex-col items-start gap-1 whitespace-nowrap"><Badge tone={EIR_STATUS_TONE[st]}>{sentenceCase(st)}</Badge>{c.row.original.lateEncoded && (() => { const li = c.row.original.lateInfo; return <span title={li ? `${li.id} · actual ${formatDateTime(li.correctedDate)}` : undefined}><Badge tone="warning" dot={false}>Late-encoded{li ? ` · ${li.daysLate} d` : ''}</Badge>{li && <span className="block text-xs text-muted">{li.path === 'AUTO' ? 'Billing auto-corrected' : li.status === 'Pending Approval' ? 'Credit Memo · pending DYM / Treasury' : `Credit Memo · ${li.status.toLowerCase()}`}</span>}</span>; })()}</span>
        {n ? <button className="whitespace-nowrap text-left text-xs text-brand-700 hover:underline" onClick={(e) => { e.stopPropagation(); setSel({ row: c.row.original, tab: 'reprints' }); }}>Reprinted ×{n}{c.row.original.reprints?.[0] && <span className="block text-muted">last {userName(c.row.original.reprints[0].by)} · {formatDateTime(c.row.original.reprints[0].at)}</span>}</button> : null}</span>); } },
    { id: 'a', header: '', cell: (c) => <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" className="px-2" aria-label={`View EIR ${c.row.original.eirNo}`} title="View EIR" icon={<Eye className="size-4" />} onClick={(e) => { e.stopPropagation(); setSel({ row: c.row.original, tab: 'eir' }); }}>View</Button><Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={(e) => { e.stopPropagation(); setRp(c.row.original); }}>Reprint</Button></div> },
  ];
  const anyFilter = Object.values(f).some(Boolean);
  return (
    <>
      <PageHeader title="EIR view / reprint" meta={<ScreenTag id="SCR-17" />} description="One row per Gate Out / Gate In cycle. Reprints use the stored gate-pass data, need a reason and are audited." />
      <DataTable data={rows} loading={data.isLoading} columns={cols} onRowClick={(r) => setSel({ row: r, tab: 'eir' })} searchable={false} exportName="eir-register"
        footer={rows && rows.length <= 25 ? <span className="font-normal text-muted">1–{rows.length} of {rows.length}</span> : undefined}
        emptyTitle="No matching EIR found" emptyHint={anyFilter ? 'Check the chassis / gate pass number or widen the date range and filters.' : undefined}
        toolbar={<>
          <div data-wide className="w-full sm:w-72"><Input aria-label="Search" placeholder="Chassis, client, EIR, gate pass…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
          <DateRangeFilter label="EIR date" from={f.from} to={f.to} onChange={(v) => setF({ ...f, ...v })} />
          <Select aria-label="Client" wrapperClassName="w-44" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} placeholder="All clients" options={(ref?.clients ?? []).map((c) => ({ value: c.clientCode, label: c.clientName }))} />
          <Select aria-label="Depot" value={f.depot} onChange={(e) => setF({ ...f, depot: e.target.value })} placeholder="All depots" options={branchOptions} />
          <Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" options={['On Hire', 'Returned', 'Force Inbound', 'Late-encoded'].map((s) => ({ value: s, label: sentenceCase(s) }))} />
          {anyFilter && <Button size="sm" variant="ghost" onClick={() => setF({ q: '', from: '', to: '', client: '', depot: '', status: '' })}>Clear</Button>}
        </>} />
      {sel && <EirDetailDrawer row={(data.data ?? []).find((r) => r.eirNo === sel.row.eirNo) ?? sel.row} initialTab={sel.tab} onClose={() => setSel(null)} onReprint={(r) => setRp(r)} />}
      {rp && <ReprintDialog row={rp} onClose={() => setRp(null)} onDone={(p) => { setRp(null); setPrinted(p); }} />}
      {printed && (
        <PrintPreview open onClose={() => setPrinted(null)} title={`EIR ${printed.row.eirNo} — reprint #${printed.no}`}>
          <EirDocument eir={printed.row} out={printed.row.out} inn={printed.row.in} copy={printed.copy} clientName={printed.row.clientName} eqName={eqName} userName={userName}
            reprint={printed.no} reprintInfo={{ no: printed.no, by: user?.name ?? '', at: printed.at, reason: printed.reason }} />
        </PrintPreview>
      )}
    </>
  );
}

/** Reprint control: reason required; logged before the watermarked copy is shown/printed (DBL-GAT-006). */
function ReprintDialog({ row, onClose, onDone }: { row: EirRow; onClose: () => void; onDone: (p: { row: EirRow; copy: 'OUT' | 'IN'; no: number; reason: string; at: string }) => void }) {
  const [copy, setCopy] = useState<'OUT' | 'IN'>(row.in ? 'IN' : 'OUT');
  const [kind, setKind] = useState(''); const [other, setOther] = useState('');
  const reason = kind === 'Other' ? other.trim() : kind;
  const act = useAction(() => api.gate.reprint(row.eirNo, reason, copy), { success: (n) => `Reprint #${n} logged`, onSuccess: (n) => onDone({ row, copy, no: n, reason, at: new Date().toISOString() }) });
  return (
    <Modal open onClose={onClose} title={`Reprint EIR ${row.eirNo}`} description="The copy is regenerated from the stored gate-pass data and carries a REPRINT watermark with the reprint number, user and time." size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={<Printer className="size-4" />} loading={act.isPending} disabled={!reason.trim()} onClick={() => act.mutate(undefined)}>Log reprint & preview</Button></>}>
      <Stack>
        {row.in ? <Segmented value={copy} onChange={setCopy} options={[{ value: 'OUT', label: 'Outbound EIR' }, { value: 'IN', label: 'Inbound EIR' }]} />
          : <p className="text-sm"><span className="font-medium">Outbound EIR</span> <span className="text-muted">— inbound not yet recorded</span></p>}
        <Select label="Reason" required value={kind} placeholder="Select reason" onChange={(e) => setKind(e.target.value)} options={['For client signature', 'For billing', 'Lost / damaged copy', 'Other'].map((r) => ({ value: r, label: r === 'Other' ? 'Other (specify)' : r }))} />
        {kind === 'Other' && <Input label="Other reason" required value={other} onChange={(e) => setOther(e.target.value)} placeholder="Why is this copy being reprinted?" />}
        {act.error && <Banner tone="danger">{errMessage(act.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

function GatePassBlock({ g, title }: { g: GatePass; title: string }) {
  const { userName } = useRefLookups();
  return (
    <Card>
      <CardHeader title={<span>{title} · <span className="font-mono">{g.gatePassNo}</span></span>} description={`${formatDateTime(g.actualEventAt)} · ${g.branchCode} · by ${userName(g.encodedBy)}${g.isForceInbound ? ' · Force Inbound' : ''}`} actions={<StatusBadge domain="assessment" value={g.generalAssessment} />} />
      <Stack>
        <KeyValueGrid items={[{ label: 'Trucker', value: g.trucker }, { label: 'Truck plate', value: g.truckPlateNo }, { label: 'Truck OR/CR (vehicle reg.)', value: g.truckOrcr ?? '—' }, { label: 'EWA / EU no.', value: g.euNo ?? '—' },
          { label: 'Driver', value: g.driverName }, { label: 'Driver licence no.', value: g.driverLicenseNo },
          ...(g.direction === 'IN' ? [{ label: 'Flat tires / vandalized', value: `${g.flatTires ?? 0} / ${g.vandalized ? 'Y' : 'N'}` }, { label: 'Origin branch', value: g.originBranchCode ?? g.branchCode }] : []),
          ...(g.credentialMismatch?.length ? [{ label: 'Differed from EWA', value: g.credentialMismatch.join(', ') }] : [])]} />
        {g.inspection.length > 0 && <InspectionChecklist lines={g.inspection} readOnly showCharges={g.direction === 'IN'} />}
        <KeyValueGrid cols={2} items={[{ label: 'Remarks / damage notes', value: g.remarks ?? '—' }, { label: 'Photos', value: g.photos?.join(', ') ?? '—' }]} />
        <div><p className="text-xs font-medium uppercase tracking-wide text-muted">Driver signature</p>{g.signature ? <img src={g.signature} alt="Driver signature" className="mt-1 h-14 rounded border border-line bg-white" /> : <p className="text-sm text-muted">Not captured (record predates signature capture)</p>}</div>
      </Stack>
    </Card>
  );
}

/** EIR detail: both legs, chassis movement history and reprint log (DBL-GAT-006/012). */
function EirDetailDrawer({ row, initialTab, onClose, onReprint }: { row: EirRow; initialTab: string; onClose: () => void; onReprint: (r: EirRow) => void }) {
  const [tab, setTab] = useState(initialTab);
  const { eqName, userName } = useRefLookups();
  const moves = useData(['chassis-moves', row.chassisNo], () => api.gate.chassisMovements(row.chassisNo));
  const od = outDateInfo(row);
  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title={<span className="flex items-center gap-2">EIR <span className="font-mono">{row.eirNo}</span><Badge tone={EIR_STATUS_TONE[row.eirStatus]}>{sentenceCase(row.eirStatus)}</Badge></span>}
      footer={<><span className="mr-auto text-xs text-muted">Reprint opens a print preview (print or save as PDF); the reason is logged.</span><Button icon={<RotateCcw className="size-4" />} onClick={() => onReprint(row)}>Reprint…</Button></>}>
      <Stack>
        <KeyValueGrid items={[{ label: 'Client', value: `${row.clientName} (${row.clientCode})` }, { label: 'Contract', value: row.contractNo }, { label: 'Chassis', value: `${row.chassisNo} · ${eqName(row.chassisType)}` }, { label: 'Depot', value: row.in && row.in.branchCode !== row.depotCode ? `${row.depotCode} → returned to ${row.in.branchCode}` : row.depotCode },
          // Staff review 1.2: days on hire and the late-encoding note (same date rule as Gate In and the EIR list).
          { label: 'EWA / EU no.', value: row.euNo ?? '—' }, { label: 'Out (billing from)', value: <>{formatDateTime(od.at)}{od.note && <span className={cn('block text-xs', od.pending ? 'text-warning' : 'text-muted')}>{od.note}</span>}</> },
          { label: row.in ? 'Days on hire (closed)' : 'Days on hire', value: od.days },
          { label: 'Late encoding', value: row.lateInfo ? `${row.lateInfo.id} · ${row.lateInfo.daysLate} days · ${row.lateInfo.path === 'AUTO' ? 'billing auto-corrected' : row.lateInfo.status === 'Pending Approval' ? 'Credit Memo pending DYM / Treasury' : `Credit Memo ${row.lateInfo.status.toLowerCase()}`}` : 'None' }]} />
        <Tabs value={tab} onChange={setTab} items={[{ id: 'eir', label: 'EIR' }, { id: 'history', label: 'Chassis movement history', count: moves.data?.length }, { id: 'reprints', label: 'Reprint log', count: row.reprintCount }]} />
        {tab === 'eir' && <>
          {row.out && <GatePassBlock g={row.out} title="Gate Out" />}
          {row.in ? <GatePassBlock g={row.in} title="Gate In" /> : <Banner tone="info">Unit is still on hire — the inbound leg is recorded at Gate In.</Banner>}
        </>}
        {tab === 'history' && <DataTable dense searchable={false} data={moves.data} loading={moves.isLoading} emptyTitle="No movements" exportName={`movements-${row.chassisNo}`} columns={[
          { accessorKey: 'actualEventAt', header: 'Date', cell: (c) => <span className="whitespace-nowrap">{formatDateTime(c.getValue<string>())}</span> }, { accessorKey: 'direction', header: 'Dir' }, { accessorKey: 'gatePassNo', header: 'Gate pass', cell: (c) => <span className="whitespace-nowrap font-mono">{c.getValue<string>()}</span> },
          { accessorKey: 'clientName', header: 'Client' }, { accessorKey: 'driverName', header: 'Driver', cell: (c) => <span className="whitespace-nowrap">{c.getValue<string>()}</span> }, { accessorKey: 'driverLicenseNo', header: 'Licence', cell: (c) => <span className="whitespace-nowrap">{c.getValue<string>()}</span> }, { accessorKey: 'truckPlateNo', header: 'Truck', cell: (c) => <span className="whitespace-nowrap">{c.getValue<string>()}</span> },
          { accessorKey: 'branchCode', header: 'Branch' }, { accessorKey: 'generalAssessment', header: 'Assessment' }, { accessorKey: 'eirNo', header: 'EIR', cell: (c) => <span className="whitespace-nowrap font-mono">{c.getValue<string>()}</span> },
        ] as ColumnDef<GatePass & { clientName: string }>[]} />}
        {tab === 'reprints' && (row.reprints?.length ? <ul className="divide-y divide-line rounded-lg border border-line text-sm">{row.reprints.map((r) => (
          <li key={r.no} className="flex justify-between gap-2 px-3 py-2"><span><span className="font-medium">Reprint #{r.no}</span> · {r.copy === 'IN' ? 'Inbound' : 'Outbound'} copy — {r.reason}</span><span className="text-muted">{userName(r.by)} · {formatDateTime(r.at)}</span></li>
        ))}</ul> : <p className="text-sm text-muted">{row.reprintCount ? `${row.reprintCount} reprint(s) logged before reason capture — see the audit log.` : 'Not reprinted yet.'}</p>)}
      </Stack>
    </Drawer>
  );
}
