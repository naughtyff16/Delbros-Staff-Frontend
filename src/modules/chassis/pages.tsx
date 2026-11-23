import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Archive, BadgeCheck, ChevronRight, CircleCheck, Plus, QrCode, RefreshCw, Trash2, Wrench } from 'lucide-react';
import { api } from '../../lib/api-client';
import { CHASSIS_STATUSES, REG_STATES, todayManila, formatDate, formatDateTime, formatPhp, type Asset, type Chassis, type ChassisStatus } from '../../lib/shared';
import {
  ApprovalTimeline, Badge, Banner, Button, Card, CardHeader, ConfirmDialog, DataTable, Drawer, Field, FormGrid, Input, KeyValueGrid, Modal, PageHeader, Segmented, Select, Stack, StatusBadge, Tabs, Textarea, cn, type ColumnDef,
} from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, fieldError, useAction, useData, useRefLookups } from '../../shared/hooks';
import { Crumb, ScreenTag } from '../../shared/components';

/** Merged-cell export keys: tables fit 1600 px by stacking related values; these keep the CSV export and search complete. */
type Row = Chassis & { registration?: { expiryDate: string }; regState?: string; idPlate?: string; statusAssess?: string; config?: string; regText?: string;
  daysInStatus?: number; location?: string; lastMove?: { gatePassNo: string; direction: 'OUT' | 'IN'; at: string; branchCode: string }; openJoNo?: string; openJoStatus?: string; whereText?: string };
/** Idle measure on the fleet dashboard: an Available unit idle this many days or more is flagged. */
const IDLE_DAYS = 30;
const joinDot = (...xs: (string | number | undefined | null)[]) => xs.filter((x) => x != null && x !== '').join(' · ');

/** Standard classification tags; authorised users may add custom tags. Axle / hub tags are derived from the selects. */
const STD_TAGS = ['Dual Axle', 'Triaxle', 'Spoke Type', '8/10-Hole', 'Flashback', 'East Coast'];
const AXLES = [{ value: '2-axle', label: '2 axle' }, { value: '3-axle', label: '3 axle' }];
const HUBS = [{ value: 'Spoke', label: 'Spoke' }, { value: '8-hole', label: '8-hole' }, { value: '10-hole', label: '10-hole' }];
const STANDARDS = [{ value: 'DW', label: 'DelWater' }, { value: 'Nakamura', label: 'Nakamura' }];
/** Statuses always shown as chips (DCIR order); terminal statuses appear only when units hold them. */
const CORE_STATUSES: ChassisStatus[] = ['New', 'Available', 'Allocated', 'On Hire', 'Breakdown', 'In Repair', 'Rescue', 'Parked'];
const digitCount = (s: string) => (s.match(/\d/g) ?? []).length;
/** Tags that duplicate the Axle configuration / Hub type selects — derived on save, never picked by hand. */
const DERIVED_TAGS = ['Dual Axle', 'Triaxle', 'Spoke Type', '8/10-Hole'];
const derivedTags = (axle?: string, hub?: string) => [axle === '2-axle' && 'Dual Axle', axle === '3-axle' && 'Triaxle', hub === 'Spoke' && 'Spoke Type', (hub === '8-hole' || hub === '10-hole') && '8/10-Hole'].filter(Boolean) as string[];
/** Same pattern as the finance forms: primary disabled until valid, missing fields listed in the footer. */
const CHASSIS_LABELS: Record<string, string> = { chassisNo: 'chassis no.', owner: 'partner code', axleConfig: 'axle configuration', hubType: 'hub type', chassisType: 'type', branchCode: 'branch' };
const ASSET_LABELS: Record<string, string> = { assetId: 'asset ID', category: 'category', description: 'description', qty: 'quantity' };

function RegBadge({ state, expiry }: { state?: string; expiry?: string }) {
  if (!state) return <>—</>;
  if (state === 'Missing') return <Badge tone="danger">Missing</Badge>;
  return <span className="flex items-center gap-1.5 whitespace-nowrap"><StatusBadge domain="registration" value={state} /><span className="text-xs text-muted">{formatDate(expiry)}</span></span>;
}

// ── SCR-12 Chassis / Asset Master — list ───────────────────────────────────
export function ChassisListPage() {
  const [f, setF] = useState({ type: '', branch: '', owner: '', axle: '', hub: '', tag: '', reg: '', standard: '' });
  const [status, setStatus] = useState('');
  const data = useData(['chassis', f], () => api.chassis.list(f));
  const { ref, branchOptions, eqOptions, eqName, clientName, setting } = useRefLookups();
  const { can } = useAuth();
  const nav = useNavigate();
  const [create, setCreate] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const all = data.data ?? [];
  const rows: Row[] = (status ? all.filter((c) => c.status === status) : all).map((c: Row) => ({
    ...c, idPlate: joinDot(c.chassisNo, c.plateNo), statusAssess: joinDot(c.status, c.generalAssessment),
    config: joinDot(c.axleConfig, c.hubType, (c.tags ?? []).join(', ')), regText: joinDot(c.regState, c.registration?.expiryDate?.slice(0, 10)),
    whereText: joinDot(c.location, c.lastMove && `${c.lastMove.direction} ${c.lastMove.at.slice(0, 10)} ${c.lastMove.gatePassNo}`, c.openJoNo),
  }));
  const counts = CHASSIS_STATUSES.map((s) => ({ s, n: all.filter((c) => c.status === s).length })).filter((x) => x.n || CORE_STATUSES.includes(x.s));
  const tagOptions = [...new Set([...STD_TAGS, ...all.flatMap((c) => c.tags ?? [])])].map((t) => ({ value: t, label: t }));
  const cols: ColumnDef<Row>[] = [
    { accessorKey: 'idPlate', header: 'Chassis / plate', cell: (c) => { const r = c.row.original; return <div><Link to={`/chassis/${r.chassisNo}`} onClick={(e) => e.stopPropagation()} className="font-mono font-medium text-brand-600 hover:underline">{r.chassisNo}</Link><p className="text-xs text-muted">{r.plateNo ?? 'No plate'}</p></div>; } },
    { accessorKey: 'chassisType', header: 'Type', cell: (c) => eqName(c.getValue<string>()) },
    { accessorKey: 'branchCode', header: 'Branch' },
    { accessorKey: 'statusAssess', header: 'Status', sortingFn: (a, b) => (a.original.daysInStatus ?? 0) - (b.original.daysInStatus ?? 0), cell: (c) => { const r = c.row.original; const idle = r.status === 'Available' && (r.daysInStatus ?? 0) >= IDLE_DAYS; return <div className="flex flex-col items-start gap-0.5"><StatusBadge domain="chassis" value={r.status} />
      <span className="whitespace-nowrap text-xs">{r.generalAssessment === 'Unroadworthy' ? <span className="font-medium text-danger">Unroadworthy</span> : <span className="text-muted">{r.generalAssessment ?? '—'}</span>}<span className={cn('text-muted', idle && 'font-medium text-warning')} title={idle ? `Idle ${IDLE_DAYS}+ days` : 'Days in current status'}> · {r.daysInStatus ?? 0} d{idle ? ' idle' : ''}</span></span>
      {r.status === 'Allocated' && ['Expired', 'Missing'].includes(r.regState ?? '') && <span title="Registration expired after allocation — Gate Out is blocked until Regulatory renews it"><Badge tone="danger" dot={false}>Gate Out blocked</Badge></span>}</div>; } },
    { accessorKey: 'regText', header: 'Registration', cell: (c) => { const r = c.row.original; if (!r.regState) return '—'; if (r.regState === 'Missing') return <Badge tone="danger">Missing</Badge>; return <div className="flex flex-col items-start gap-0.5"><StatusBadge domain="registration" value={r.regState} /><span className="text-xs text-muted">{formatDate(r.registration?.expiryDate)}</span></div>; } },
    { accessorKey: 'config', header: 'Axle / hub · tags', meta: { nowrap: true }, cell: (c) => { const r = c.row.original; const t = (r.tags ?? []).filter((x) => !DERIVED_TAGS.includes(x)); return <div><p>{r.axleConfig ?? '—'} · {r.hubType ?? '—'}</p><p className="text-xs text-muted" title={(r.tags ?? []).join(', ')}>{t.length ? `${t[0]}${t.length > 1 ? ` +${t.length - 1}` : ''}` : 'No other tags'}</p></div>; } },
    { accessorKey: 'owner', header: 'Owner / standard', cell: (c) => { const r = c.row.original; return <div><p className="flex items-center gap-1.5">{r.owner === 'DELWATER' ? 'Delbros' : <><Badge tone="purple" dot={false}>Partner</Badge><span className="font-mono text-xs">{r.owner}</span></>}</p><p className="text-xs text-muted">{[r.standard === 'DW' ? 'DelWater' : 'Nakamura', r.ownerEquipmentNo].filter(Boolean).join(' · ')}</p></div>; } },
    { accessorKey: 'whereText', header: 'Location / last move', cell: (c) => { const r = c.row.original; return <div className="min-w-36"><p className="text-xs">{r.location ?? '—'}</p>
      {r.lastMove ? <p className="whitespace-nowrap text-xs text-muted" title={r.lastMove.gatePassNo}>Gate {r.lastMove.direction === 'OUT' ? 'Out' : 'In'} {formatDate(r.lastMove.at)}</p> : <p className="text-xs text-muted">No gate movement</p>}
      {r.openJoNo && <Link to={`/repair/jo/${r.openJoNo}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap font-mono text-xs text-brand-600 hover:underline" title={`Open job order · ${r.openJoStatus}`}>{r.openJoNo}</Link>}</div>; } },
    { accessorKey: 'currentClientCode', header: 'Current client / contract', cell: (c) => (c.getValue() ? <div><p>{clientName(c.getValue<string>())}</p><p className="whitespace-nowrap font-mono text-xs text-muted">{c.row.original.currentContractNo ?? c.row.original.allocation?.contractNo}</p></div> : c.row.original.allocation ? <div><p>{clientName(c.row.original.allocation.clientCode)}</p><p className="whitespace-nowrap text-xs text-muted">Allocated · {c.row.original.allocation.contractNo}</p></div> : '—') },
  ];
  const more = [f.standard, f.axle, f.hub, f.tag, f.reg].filter(Boolean).length;
  return (
    <>
      <PageHeader title="Chassis master" meta={<ScreenTag id="SCR-12" />} description="Central registry of every chassis. Status drives availability across Gate Operations and Allocation, and changes only through transactions or a controlled, audited action."
        actions={can('chassis.chassis', 'add') && <Button icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>New chassis</Button>} />
      {ref?.equipmentTypes.some((e) => e.placeholder) && <Banner tone="warning" className="mb-4" title="Equipment type names are placeholders">The seven chassis types (20ft, 40ft, 40ft flatbed, 40ft combo, 40ft super combo, 45ft, cane cage trailer) are loaded from the DelWater Online extract once Delbros confirms the list in Admin → Equipment types.</Banner>}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setStatus('')} className={cn('rounded-full border px-3 py-1 text-xs font-medium', !status ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-2 hover:border-brand-300')}>All <span className="text-muted">{all.length}</span></button>
        {counts.map(({ s, n }) => (
          <button key={s} onClick={() => setStatus(status === s ? '' : s)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', status === s ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-2 hover:border-brand-300')}>{s} <span className="text-muted">{n}</span></button>
        ))}
      </div>
      {data.isError && <Banner tone="danger" className="mb-4" title="Could not load the chassis registry" actions={<Button size="sm" variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => data.refetch()}>Retry</Button>}>{errMessage(data.error)}</Banner>}
      <DataTable data={rows} loading={data.isLoading} columns={cols} onRowClick={(r) => nav(`/chassis/${r.chassisNo}`)} exportName="chassis" emptyTitle="No chassis matching filter" emptyHint="Clear a filter or status chip to see more units."
        toolbar={<>
          <Select aria-label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="All types" options={eqOptions} />
          <Select aria-label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={branchOptions} />
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={CHASSIS_STATUSES.map((s) => ({ value: s, label: s }))} />
          <Select aria-label="Owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} placeholder="All owners" options={[{ value: 'DELWATER', label: 'Delbros-owned' }, { value: 'PARTNER', label: 'Partner-owned' }]} />
          <Button size="sm" variant="secondary" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>{moreOpen ? 'Fewer filters' : 'More filters'}{more > 0 && ` (${more})`}</Button>
          {moreOpen && <>
            <Select aria-label="Standard" value={f.standard} onChange={(e) => setF({ ...f, standard: e.target.value })} placeholder="All standards" options={STANDARDS} />
            <Select aria-label="Axle" value={f.axle} onChange={(e) => setF({ ...f, axle: e.target.value })} placeholder="All axles" options={AXLES} />
            <Select aria-label="Hub type" value={f.hub} onChange={(e) => setF({ ...f, hub: e.target.value })} placeholder="All hub types" options={HUBS} />
            <Select aria-label="Tag" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} placeholder="All tags" options={tagOptions} />
            <Select aria-label="Registration" value={f.reg} onChange={(e) => setF({ ...f, reg: e.target.value })} placeholder="All registration states" options={REG_STATES.map((s) => ({ value: s, label: s }))} />
          </>}
          <span className="ml-auto whitespace-nowrap text-[13px] text-muted">{rows.length} of {all.length} chassis</span>
        </>} />
      <p className="mt-2 text-xs text-muted">Registration: Current · Expiring = expires within {Number(setting('alo.reg_warn_days') ?? 14)} days · Renewal In Progress = renewal lodged with Regulatory · Expired / Missing = Gate Out blocked. The same labels and window are used on the Allocation board.</p>
      <p className="mt-1 text-xs text-muted">“Reserved” is shown as Allocated (unit held for a client before Gate Out). Confirm whether a separate Reserved status is needed so the list matches the DCIR.</p>
      <p className="mt-1 text-xs text-muted">Days (d) = days in the current status; an Available unit idle {IDLE_DAYS}+ days is flagged “idle”. Location = home yard (R&amp;M bay while a job order is open) or “With client” while on hire; the last gate movement and the open job order show under it. “New” is kept for units registered but not yet released to the fleet — the New chassis form currently starts units as Available (pending confirmation).</p>
      {create && <ChassisEditor existing={all.map((c) => c.chassisNo)} partnerCodes={[...new Set(all.map((c) => c.owner).filter((o) => o !== 'DELWATER'))]} knownTags={tagOptions.map((t) => t.value)} onClose={() => setCreate(false)} onCreated={(no) => nav(`/chassis/${no}`)} />}
    </>
  );
}

function ChassisEditor({ chassis, existing = [], partnerCodes = [], knownTags = STD_TAGS, onClose, onCreated }: { chassis?: Chassis; existing?: string[]; partnerCodes?: string[]; knownTags?: string[]; onClose: () => void; onCreated?: (no: string) => void }) {
  const isNew = !chassis;
  const { branchOptions, eqOptions } = useRefLookups();
  const { can } = useAuth();
  const canCustomTag = can('chassis.status', 'approve') || can('admin.settings', 'edit');
  const [v, setV] = useState<Partial<Chassis>>(chassis ?? { chassisNo: '', chassisType: eqOptions[0]?.value ?? 'EQ1', branchCode: 'MNL', owner: 'DELWATER', standard: 'DW', generalAssessment: 'Roadworthy', status: 'Available', tags: [] });
  const [ownType, setOwnType] = useState<'company' | 'partner'>(chassis && chassis.owner !== 'DELWATER' ? 'partner' : 'company');
  const [custom, setCustom] = useState('');
  const save = useAction(() => api.chassis.save({ ...(v as Chassis), tags: [...(v.tags ?? []).filter((t) => !DERIVED_TAGS.includes(t)), ...derivedTags(v.axleConfig, v.hubType)], owner: ownType === 'company' ? 'DELWATER' : (v.owner ?? '').toUpperCase() }, isNew), { success: isNew ? `Chassis ${v.chassisNo} created — status ${v.status}` : 'Chassis saved', onSuccess: () => { onClose(); if (isNew) onCreated?.(v.chassisNo!); } });
  const no = v.chassisNo ?? '';
  const errs: Record<string, string | undefined> = {
    chassisNo: !isNew ? undefined : !no ? 'Required' : !/^[A-Z0-9-]+$/.test(no) ? 'Letters, digits and hyphens only' : no.length < 6 || digitCount(no) < 4 ? 'Use the registry format, e.g. DW-MNL-1001 (at least 4 digits)' : existing.includes(no) ? `Duplicate — ${no} is already in the registry` : undefined,
    owner: ownType === 'partner' && !(v.owner && v.owner !== 'DELWATER') ? 'Partner code required' : undefined,
    axleConfig: v.axleConfig ? undefined : 'Required', hubType: v.hubType ? undefined : 'Required', chassisType: v.chassisType ? undefined : 'Required', branchCode: v.branchCode ? undefined : 'Required',
  };
  const invalid = Object.values(errs).some(Boolean);
  const need = Object.keys(errs).filter((k) => errs[k]).map((k) => CHASSIS_LABELS[k]);
  const show = (k: string) => fieldError(save.error, k) ?? (k === 'chassisNo' && no.length > 0 ? errs[k] : undefined);
  const tags = (v.tags ?? []).filter((t) => !DERIVED_TAGS.includes(t));
  const toggle = (t: string) => setV({ ...v, tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] });
  // Staff review 1.2: unit numbers run in one fleet-wide sequence (1001 …); the next free number is suggested with the selected branch.
  const nextNo = `DW-${v.branchCode ?? 'MNL'}-${Math.max(1000, ...existing.map((x) => Number(x.match(/(\d+)$/)?.[1] ?? 0)).filter((x) => x < 100000)) + 1}`;
  const num = (s: string) => (s === '' ? undefined : Number(s));
  return (
    <Drawer open onClose={onClose} title={isNew ? 'New chassis' : `Edit ${chassis.chassisNo}`} width="max-w-2xl"
      footer={<><span className="mr-auto text-xs text-muted">Required (*): chassis no., type, branch, ownership{ownType === 'partner' ? ', partner code' : ''}, axle configuration, hub type{need.length > 0 && <> — still needed: <span className="font-medium text-ink-2">{need.join(', ')}</span></>}</span><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={invalid} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <Stack>
        {save.error && <Banner tone="danger">{errMessage(save.error)}</Banner>}
        <FormGrid>
          <Input label="Chassis no." required maxLength={20} disabled={!isNew} value={v.chassisNo} placeholder="e.g. DW-MNL-1001" onChange={(e) => setV({ ...v, chassisNo: e.target.value.toUpperCase().trim() })} error={show('chassisNo')} hint={isNew ? <>Format DW-&lt;branch&gt;-&lt;no.&gt;, e.g. DW-MNL-1001. Unique — checked against the registry before save. Next free number: <button type="button" className="font-mono font-medium text-brand-600 hover:underline" onClick={() => setV({ ...v, chassisNo: nextNo })}>{nextNo}</button> (one fleet-wide sequence — numbering rule pending confirmation).</> : undefined} />
          <Select label="Type" required options={eqOptions} value={v.chassisType} onChange={(e) => setV({ ...v, chassisType: e.target.value })} error={show('chassisType')} />
          <Input label="Plate no." value={v.plateNo ?? ''} placeholder="e.g. ABC 1234" onChange={(e) => setV({ ...v, plateNo: e.target.value.toUpperCase() })} hint="Optional — registration details are captured by Regulatory" />
          <Select label="Branch" required options={branchOptions} value={v.branchCode} onChange={(e) => setV({ ...v, branchCode: e.target.value })} error={show('branchCode')} />
          <Field label="Ownership" required hint="Company-owned or partner-owned">{() => <Segmented value={ownType} onChange={(x) => { setOwnType(x); setV({ ...v, owner: x === 'company' ? 'DELWATER' : partnerCodes[0] ?? '' }); }} options={[{ value: 'company', label: 'Company (Delbros)' }, { value: 'partner', label: 'Partner' }]} />}</Field>
          {ownType === 'partner'
            ? <Input label="Partner code" required error={show('owner')} hint="Pick a known partner or type a new code" className="uppercase" suggestions={partnerCodes.map((p) => ({ value: p }))} value={v.owner === 'DELWATER' ? '' : v.owner ?? ''} placeholder="e.g. PARTNER-01" onChange={(e) => setV({ ...v, owner: e.target.value.toUpperCase() })} />
            : <Input label="Owner" readOnly tabIndex={-1} className="bg-surface-alt text-ink-2" value="Delbros (DELWATER)" />}
          <Input label="Owner's equipment #" value={v.ownerEquipmentNo ?? ''} placeholder="e.g. PTN-EQ-4101" onChange={(e) => setV({ ...v, ownerEquipmentNo: e.target.value.toUpperCase() })} hint="Partner's own unit number" />
          <Select label="Standard" value={v.standard} onChange={(e) => setV({ ...v, standard: e.target.value as Chassis['standard'] })} options={STANDARDS} />
          <Select label="Axle configuration" required placeholder="Select…" options={AXLES} value={v.axleConfig ?? ''} onChange={(e) => setV({ ...v, axleConfig: e.target.value as Chassis['axleConfig'] })} error={show('axleConfig')} />
          <Select label="Hub type" required placeholder="Select…" options={HUBS} value={v.hubType ?? ''} onChange={(e) => setV({ ...v, hubType: e.target.value as Chassis['hubType'] })} error={show('hubType')} />
          <Select label="General assessment" value={v.generalAssessment} onChange={(e) => setV({ ...v, generalAssessment: e.target.value as Chassis['generalAssessment'] })} options={[{ value: 'Roadworthy', label: 'Roadworthy' }, { value: 'Unroadworthy', label: 'Unroadworthy' }]} />
          {isNew ? <Input label="Initial status" readOnly tabIndex={-1} className="bg-surface-alt text-ink-2" value={v.status ?? ''} hint="Default for new units" />
            : <Input label="Status" readOnly tabIndex={-1} className="bg-surface-alt text-ink-2" value={chassis.status} hint="Change it from the detail page" />}
          <Input label="Acquisition date" type="date" value={v.acquisitionDate?.slice(0, 10) ?? ''} onChange={(e) => setV({ ...v, acquisitionDate: e.target.value })} />
        </FormGrid>
        <h3 className={SECTION}>Technical &amp; maintenance details <span className="font-normal normal-case">(optional — which fields are needed is pending Delbros confirmation)</span></h3>
        <FormGrid>
          <Input label="Make / manufacturer" value={v.make ?? ''} placeholder="e.g. CIMC" onChange={(e) => setV({ ...v, make: e.target.value })} />
          <Input label="Year built" type="number" min={1980} max={2100} value={v.yearBuilt ?? ''} placeholder="e.g. 2019" onChange={(e) => setV({ ...v, yearBuilt: num(e.target.value) })} />
          <Input label="VIN / serial no." value={v.vinSerial ?? ''} placeholder="e.g. LJRC12345KB000123" onChange={(e) => setV({ ...v, vinSerial: e.target.value.toUpperCase() })} />
          <Input label="GPS device no." value={v.gpsDeviceNo ?? ''} placeholder="e.g. GPS-88213" onChange={(e) => setV({ ...v, gpsDeviceNo: e.target.value.toUpperCase() })} hint="Billed under the GPS bill type when fitted" />
          <Input label="Tire count" type="number" min={0} value={v.tireCount ?? ''} placeholder="e.g. 8" onChange={(e) => setV({ ...v, tireCount: num(e.target.value) })} />
          <Input label="Tire size" value={v.tireSize ?? ''} placeholder="e.g. 11R22.5" onChange={(e) => setV({ ...v, tireSize: e.target.value.toUpperCase() })} />
          <Input label="Last inspection" type="date" value={v.lastInspectionDate ?? ''} onChange={(e) => setV({ ...v, lastInspectionDate: e.target.value })} />
          <Input label="Next maintenance due" type="date" value={v.nextMaintenanceDate ?? ''} onChange={(e) => setV({ ...v, nextMaintenanceDate: e.target.value })} />
          <Input label="Photos" type="file" accept="image/*" multiple wrapperClassName="md:col-span-2" onChange={(e) => setV({ ...v, photos: [...(v.photos ?? []), ...Array.from(e.target.files ?? []).map((f) => f.name)] })} hint={(v.photos ?? []).length ? v.photos!.join(', ') : 'Unit photos (sides, plate, VIN plate)'} />
        </FormGrid>
        <p className="text-xs text-muted">Purchase cost / value and insurance are not on the chassis master yet — pending Delbros decision (the contract uses an indemnity per equipment type).</p>
        <Field label="Classification tags" hint="Select all that apply. Axle and hub tags are added from the selections above.">{() => <>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...knownTags, ...tags])].filter((t) => !DERIVED_TAGS.includes(t)).map((t) => <button key={t} type="button" onClick={() => toggle(t)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', tags.includes(t) ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-2 hover:border-brand-300')}>{t}</button>)}
          </div>
          {canCustomTag && <div className="mt-2 flex gap-2"><Input aria-label="Custom tag" placeholder="Add custom tag" value={custom} onChange={(e) => setCustom(e.target.value)} /><Button size="sm" variant="secondary" disabled={!custom.trim() || tags.includes(custom.trim())} onClick={() => { setV({ ...v, tags: [...tags, custom.trim()] }); setCustom(''); }}>Add tag</Button></div>}
        </>}</Field>
        <Textarea label="Remarks" maxLength={255} value={v.remarks ?? ''} placeholder="Notes about this unit — e.g. repainted 2025, new landing legs" onChange={(e) => setV({ ...v, remarks: e.target.value })} />
        {isNew && <Banner tone="info">OR / CR numbers, plate expiry and registration status are captured by Regulatory in the Registration Master after save. Gate Out stays blocked until registration is on file.</Banner>}
        {!isNew && <p className="text-xs text-muted">Status is not editable here — use “Change status” on the detail page (reason required, audited).</p>}
      </Stack>
    </Drawer>
  );
}

// ── SCR-12 detail ───────────────────────────────────────────────────────────
export function ChassisDetailPage() {
  const { no = '' } = useParams();
  const data = useData(['chassis', no], () => api.chassis.get(no));
  const { eqName, branchName, clientName } = useRefLookups();
  const { can } = useAuth();
  const [tab, setTab] = useState('eir');
  const [edit, setEdit] = useState(false);
  const [status, setStatus] = useState<ChassisStatus | ''>('');
  const [confirmAvail, setConfirmAvail] = useState(false);
  const change = useAction((reason: string) => api.chassis.changeStatus(no, status as ChassisStatus, reason), { success: 'Status changed', onSuccess: () => setStatus('') });
  const avail = useAction(() => api.chassis.markAvailable(no), { success: 'Chassis marked Available', onSuccess: () => setConfirmAvail(false) });
  if (data.isError) return <Banner tone="danger" title="Chassis not available" actions={<Link to="/chassis" className="text-sm font-medium text-brand-700 hover:underline">Back to chassis master</Link>}>{errMessage(data.error)}</Banner>;
  if (!data.data) return <p className="text-muted">Loading…</p>;
  const { chassis: c, registration, availableSignoff: so, regState } = data.data;
  const repairHold = ['Breakdown', 'In Repair'].includes(c.status);
  const branchLabel = (code: string) => branchName(code).replace(/\s*\(demo\)\s*$/i, '');
  return (
    <>
      <PageHeader breadcrumb={<Crumb items={[{ to: '/chassis', label: 'Chassis' }, { label: c.chassisNo }]} />} title={<span className="font-mono">{c.chassisNo}</span>}
        meta={<><StatusBadge domain="chassis" value={c.status} /><StatusBadge domain="assessment" value={c.generalAssessment} /><ScreenTag id="SCR-12" /></>}
        description={`${eqName(c.chassisType)} · ${branchLabel(c.branchCode)} · since ${formatDateTime(c.statusSince)}`}
        actions={<>
          {can('chassis.chassis', 'edit') && <Button variant="secondary" onClick={() => setEdit(true)}>Edit</Button>}
          {can('chassis.status', 'approve') && <Select aria-label="Change status" value={status} onChange={(e) => setStatus(e.target.value as ChassisStatus)} placeholder="Change status…" options={CHASSIS_STATUSES.filter((s) => s !== c.status && !(repairHold && s === 'Available')).map((s) => ({ value: s, label: s }))} />}
        </>} />
      {repairHold && (
        <Banner className="mb-4" tone={so.eligible ? 'success' : 'warning'} title={so.eligible ? 'Ready for Available sign-off' : 'Not yet eligible to return to Available'}
          actions={so.eligible && can('chassis.status', 'approve') && <Button size="sm" variant="success" icon={<CircleCheck className="size-4" />} onClick={() => setConfirmAvail(true)}>Mark Available</Button>}>
          {so.eligible ? 'All job orders are closed and registration is current. An authorised user must sign off manually; the sign-off is written to the status history.' : `${so.openJos} open job order(s)${so.regOk ? '' : ' · registration not current'}. The transition is never automatic and cannot be made through “Change status”.`}
        </Banner>
      )}
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Details" />
          <KeyValueGrid items={[
            { label: 'Chassis no.', value: <span className="font-mono">{c.chassisNo}</span> }, { label: 'Type', value: eqName(c.chassisType) }, { label: 'Plate no.', value: c.plateNo ? <span className="font-mono">{c.plateNo}</span> : undefined }, { label: 'Branch', value: branchLabel(c.branchCode) },
            { label: 'Ownership', value: c.owner === 'DELWATER' ? 'Company (Delbros)' : <span className="flex items-center gap-1.5"><Badge tone="purple" dot={false}>Partner</Badge><span className="font-mono">{c.owner}</span></span> },
            { label: 'Owner', value: c.owner === 'DELWATER' ? 'Delbros Leasing (DELWATER)' : <span>Partner <span className="font-mono">{c.owner}</span> <span className="text-xs text-muted">(partner name and share: pending partner master)</span></span> }, { label: "Owner's equipment #", value: c.ownerEquipmentNo }, { label: 'Standard', value: c.standard === 'DW' ? 'DelWater' : 'Nakamura' },
            { label: 'Axle / hub', value: `${c.axleConfig ?? '—'} · ${c.hubType ?? '—'}` },
            { label: 'Tags', value: (c.tags ?? []).length ? <span className="flex flex-wrap gap-1">{c.tags!.map((t) => <Badge key={t} tone="neutral" dot={false}>{t}</Badge>)}</span> : undefined },
            { label: 'Acquired', value: formatDate(c.acquisitionDate) }, { label: 'Current client', value: c.currentClientCode ? <Link className="text-brand-600 hover:underline" to={`/clients/${c.currentClientCode}`}>{clientName(c.currentClientCode)}</Link> : undefined },
            { label: 'Contract', value: (c.currentContractNo ?? c.allocation?.contractNo) ? <Link className="font-mono text-brand-600 hover:underline" to={`/contracts/${c.currentContractNo ?? c.allocation?.contractNo}`}>{c.currentContractNo ?? c.allocation?.contractNo}</Link> : undefined }, { label: 'Gate pass', value: c.currentGatePassNo ? <span className="font-mono">{c.currentGatePassNo}</span> : undefined },
            { label: 'Days in status', value: <span className={cn(c.status === 'Available' && (data.data.daysInStatus ?? 0) >= IDLE_DAYS && 'font-medium text-warning')}>{data.data.daysInStatus} day{data.data.daysInStatus === 1 ? '' : 's'}{c.status === 'Available' && data.data.daysInStatus >= IDLE_DAYS ? ' (idle)' : ''}</span> },
            { label: 'Current location', value: data.data.location }, { label: 'Last gate movement', value: data.data.lastMove ? <span>Gate {data.data.lastMove.direction === 'OUT' ? 'Out' : 'In'} {formatDateTime(data.data.lastMove.at)} · <span className="font-mono text-xs">{data.data.lastMove.gatePassNo}</span></span> : 'None recorded' },
            { label: 'Open job order', value: data.data.openJoNo ? <Link className="font-mono text-brand-600 hover:underline" to={`/repair/jo/${data.data.openJoNo}`}>{data.data.openJoNo}</Link> : 'None' },
            { label: 'Remarks', value: c.remarks },
          ]} />
        </Card>
        <Card className="self-start">
          <CardHeader title="Registration (OR/CR)" description={<RegBadge state={regState} expiry={registration?.expiryDate} />} actions={<Link to="/regulatory" title="Open registration master" aria-label="Open registration master" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"><BadgeCheck className="size-4" aria-hidden />Registration master</Link>} />
          {registration ? <KeyValueGrid cols={2} items={[{ label: 'OR no.', value: <span className="font-mono">{registration.orNo}</span> }, { label: 'CR no.', value: <span className="font-mono">{registration.crNo}</span> }, { label: 'Expiry', value: <span className={cn(new Date(registration.expiryDate) < new Date() && 'font-semibold text-danger')}>{formatDate(registration.expiryDate)}</span> }, { label: 'Agency', value: registration.agency }]} />
            : <Banner tone="danger">No registration on file — Gate Out is blocked.</Banner>}
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Technical & maintenance" description="Optional details — which ones are required is pending Delbros confirmation. Fill them in with Edit." />
          <KeyValueGrid items={[
            { label: 'Make', value: c.make }, { label: 'Year built', value: c.yearBuilt }, { label: 'VIN / serial no.', value: c.vinSerial ? <span className="font-mono">{c.vinSerial}</span> : undefined }, { label: 'GPS device', value: c.gpsDeviceNo ?? 'None fitted' },
            { label: 'Tires', value: c.tireCount || c.tireSize ? joinDot(c.tireCount && `${c.tireCount} tires`, c.tireSize) : undefined }, { label: 'Last inspection', value: formatDate(c.lastInspectionDate) },
            { label: 'Next maintenance due', value: formatDate(c.nextMaintenanceDate) }, { label: 'Photos', value: (c.photos ?? []).length ? c.photos!.join(', ') : 'None attached' },
          ]} />
        </Card>
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'eir', label: 'EIR history (last 20)', count: data.data.eirHistory.length || undefined }, { id: 'jo', label: 'Job order history', count: data.data.joHistory.length || undefined }, { id: 'status', label: 'Status history & audit', count: data.data.statusHistory.length || undefined }]} />
      {tab === 'eir' && <DataTable data={data.data.eirHistory} searchable={false} emptyTitle="No movements yet" columns={[
        { accessorKey: 'eirNo', header: 'EIR no.', cell: (x) => <Link className="font-mono text-brand-600 hover:underline" to={`/gate/eir?q=${x.getValue<string>()}`}>{x.getValue<string>()}</Link> },
        { accessorKey: 'gatePassOutNo', header: 'Gate pass (out)', cell: (x) => <span className="font-mono">{x.getValue<string>() ?? '—'}</span> }, { accessorKey: 'eirOutDate', header: 'Out', cell: (x) => formatDateTime(x.getValue<string>()) }, { accessorKey: 'eirInDate', header: 'In', cell: (x) => formatDateTime(x.getValue<string>()) },
        { accessorKey: 'daysOnHire', header: 'Days on hire', meta: { align: 'right' }, cell: (x) => `${x.getValue<number>()}${x.row.original.eirInDate ? '' : ' (so far)'}` },
        { id: 'cond', header: 'Condition out / in', cell: (x) => <div className="text-xs"><p>Out: {x.row.original.conditionOut ?? '—'}</p><p className="text-muted">In: {x.row.original.conditionIn ?? (x.row.original.eirInDate ? '—' : 'not returned')}</p></div> },
        { accessorKey: 'clientCode', header: 'Client', cell: (x) => clientName(x.getValue<string>()) }, { id: 'st', header: 'Status', cell: (x) => <StatusBadge domain="chassis" value={x.row.original.gatePassInNo ? 'Returned' : 'On Hire'} /> },
        { accessorKey: 'contractNo', header: 'Contract #', cell: (x) => (x.getValue() ? <Link className="font-mono text-brand-600 hover:underline" to={`/contracts/${x.getValue<string>()}`}>{x.getValue<string>()}</Link> : '—') }, { accessorKey: 'bookingNo', header: 'Booking #', cell: (x) => x.getValue<string>() || '—' }]} />}
      {tab === 'jo' && <DataTable data={data.data.joHistory} searchable={false} emptyTitle="No job orders" columns={[
        { accessorKey: 'joNo', header: 'Reference', cell: (x) => <Link className="font-mono text-brand-600 hover:underline" to={`/repair/jo/${x.getValue<string>()}`}>{x.getValue<string>()}</Link> }, { accessorKey: 'date', header: 'Date', cell: (x) => formatDate(x.getValue<string>()) }, { accessorKey: 'remarks', header: 'Remarks' }, { accessorKey: 'status', header: 'Status', cell: (x) => <StatusBadge domain="jo" value={x.getValue<string>()} /> },
        { accessorKey: 'parts', header: 'Parts cost', meta: { align: 'right' }, cell: (x) => formatPhp(x.getValue<number>()) }, { accessorKey: 'labor', header: 'Labor cost', meta: { align: 'right' }, cell: (x) => formatPhp(x.getValue<number>()) }, { accessorKey: 'total', header: 'Total', meta: { align: 'right' }, cell: (x) => formatPhp(x.getValue<number>()) }]} />}
      {tab === 'status' && <DataTable data={data.data.statusHistory} searchable={false} emptyTitle="No status changes recorded" columns={[
        { accessorKey: 'at', header: 'When', cell: (x) => formatDateTime(x.getValue<string>()) }, { accessorKey: 'action', header: 'Event' }, { id: 'from', header: 'From → to', cell: (x) => `${(x.row.original.before as { status?: string })?.status ?? '—'} → ${(x.row.original.after as { status?: string })?.status ?? '—'}` },
        { accessorKey: 'actor', header: 'By' }, { accessorKey: 'reason', header: 'Reason' }]} />}
      {edit && <ChassisEditor chassis={c} onClose={() => setEdit(false)} />}
      <ConfirmDialog open={!!status} onClose={() => setStatus('')} title={`Change status to ${status}?`} message="Status drives availability across Gate Operations and Allocation. The change and your reason are written to the audit trail." requireReason confirmLabel="Change status" loading={change.isPending} onConfirm={(r) => change.mutate(r)} />
      <ConfirmDialog open={confirmAvail} onClose={() => setConfirmAvail(false)} title="Mark chassis Available?" message="You confirm all repair categories are closed and the unit is roadworthy with current registration. Your sign-off is audited." confirmLabel="Sign off" loading={avail.isPending} onConfirm={() => avail.mutate(undefined)} />
    </>
  );
}

// ── SCR-13 Non-Chassis Equipment Inventory ─────────────────────────────────
type AssetRow = Asset & { pmState: string; pendingDisposal: boolean; disposalRequestedBy?: string; disposalWaitingFor?: string; repair?: NonNullable<Asset['maintenanceLog']>[number]; descCat?: string; branchLoc?: string; serialMake?: string; statusCond?: string; pm?: string };
const CATS: Asset['category'][] = ['Heavy Equipment', 'Forklift', 'Welding Machine', 'Depot Tool', 'Stockroom Tool'];
const ASSET_STATUSES: Asset['status'][] = ['Available', 'In-Use', 'Under Repair', 'Retired', 'Disposed'];
const OPEN_STATUSES = ['Available', 'In-Use', 'Under Repair'] as const;
const DEPARTMENTS = ['Dept: Yard Operations', 'Dept: Repair & Maintenance', 'Dept: Stockroom', 'Dept: Operations', 'Dept: APS'];
const PM_TONE: Record<string, 'danger' | 'warning' | 'neutral' | 'success'> = { Overdue: 'danger', 'Due soon': 'warning', Suspended: 'neutral', Scheduled: 'success' };
/** One wording on the list and the detail (staff review 1.2). */
const PM_LABEL: Record<string, string> = { Overdue: 'PM overdue', 'Due soon': 'PM due', Suspended: 'PM suspended', Scheduled: 'Scheduled' };
const SECTION = 'border-b border-line pb-1 text-xs font-semibold uppercase tracking-wide text-muted';
const addDaysIso =(d: string, n: number) => new Date(new Date(d).getTime() + n * 86_400_000).toISOString().slice(0, 10);

function useAssignOptions() {
  const { ref } = useRefLookups();
  return [...DEPARTMENTS.map((d) => ({ value: d, label: d })), ...(ref?.users ?? []).map((u) => ({ value: u.userId, label: `${u.name} (${u.userId})` }))];
}

export function AssetsPage() {
  const [f, setF] = useState({ category: '', branch: '', pmDue: false, assigned: '' });
  const [status, setStatus] = useState('');
  const data = useData(['assets', f], () => api.chassis.assets(f));
  const { branchOptions, branchName, userName, setting } = useRefLookups();
  const assignOptions = useAssignOptions();
  const { can } = useAuth();
  const [edit, setEdit] = useState<Asset | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const all = data.data ?? [];
  const rows: AssetRow[] = (status ? all.filter((a) => a.status === status) : all).map((a: AssetRow) => ({
    ...a, descCat: joinDot(a.description, a.category, a.acquisitionDate && `acquired ${a.acquisitionDate.slice(0, 10)}`, a.pmIntervalDays && `PM every ${a.pmIntervalDays} d`), branchLoc: joinDot(a.branchCode, a.location), serialMake: joinDot(a.serialNo, a.make, a.model),
    statusCond: joinDot(a.status, a.pendingDisposal ? `${a.disposal?.action} pending` : undefined, a.condition), pm: joinDot(a.nextPmDate && `next ${a.nextPmDate.slice(0, 10)}`, a.lastMaintenanceDate && `last ${a.lastMaintenanceDate.slice(0, 10)}`, PM_TONE[a.pmState] && a.pmState),
  }));
  const soon = Number(setting('ast.pm_due_soon_days') ?? 7);
  const who = (v?: string) => (!v ? '—' : v.startsWith('Dept: ') ? v.slice(6) : userName(v));
  const cols: ColumnDef<AssetRow>[] = [
    { accessorKey: 'assetId', header: 'Asset tag', cell: (c) => <span className="flex items-center gap-1.5 whitespace-nowrap font-mono font-medium text-brand-600">{c.getValue<string>()}{c.row.original.qrCode && <span title={c.row.original.qrCode}><QrCode className="size-3.5 text-muted" /></span>}</span> },
    { accessorKey: 'descCat', header: 'Description', cell: (c) => <div><p>{c.row.original.description}</p><p className="text-xs text-muted">{c.row.original.category}</p><p className="whitespace-nowrap text-xs text-muted">Acquired {c.row.original.acquisitionDate ? formatDate(c.row.original.acquisitionDate) : '—'}</p></div> },
    { accessorKey: 'branchLoc', header: 'Branch / location', cell: (c) => <div title={branchName(c.row.original.branchCode)}><p>{c.row.original.branchCode}</p><p className="text-xs text-muted">{c.row.original.location ?? '—'}</p></div> },
    { accessorKey: 'qty', header: 'Qty', meta: { align: 'right', nowrap: true }, cell: (c) => `${c.getValue<number>() ?? 1} ${c.row.original.uom ?? 'unit'}` },
    { accessorKey: 'serialMake', header: 'Serial / make-model', cell: (c) => <div><p className={cn('text-xs', c.row.original.serialNo && 'font-mono')}>{c.row.original.serialNo ?? '—'}</p><p className="text-xs text-muted">{[c.row.original.make, c.row.original.model].filter(Boolean).join(' ') || '—'}</p></div> },
    { accessorKey: 'statusCond', header: 'Status', cell: (c) => { const r = c.row.original; return <div className="flex flex-col items-start gap-0.5"><span className="flex flex-wrap items-center gap-1"><StatusBadge domain="asset" value={r.status} />{r.pendingDisposal && <Badge tone="warning">{r.disposal?.action} pending</Badge>}</span><span className={cn('text-xs', r.condition === 'Unserviceable' || r.condition === 'Poor' ? 'font-medium text-danger' : 'text-muted')}>Condition: {r.condition ?? '—'}</span>
      {r.pendingDisposal && <span className="max-w-52 text-xs text-muted" title={r.disposal?.reason}>Reason: {r.disposal?.reason} · by {userName(r.disposalRequestedBy)} · awaiting {r.disposalWaitingFor ?? 'approval'}</span>}
      {r.repair && <span className="max-w-52 text-xs text-muted" title={r.repair.notes}>Repair {formatDate(r.repair.date)}: {r.repair.joNo ? <Link className="font-mono text-brand-600 hover:underline" to={`/repair/jo/${r.repair.joNo}`} onClick={(e) => e.stopPropagation()}>{r.repair.joNo}</Link> : r.repair.performedBy ?? 'no job order'}{r.repair.cost ? ` · ${formatPhp(r.repair.cost)}` : ''}</span>}</div>; } },
    { accessorKey: 'assignedTo', header: 'Assigned to', cell: (c) => who(c.getValue<string>()) },
    { accessorKey: 'pm', header: 'Next PM', sortingFn: (a, b) => (a.original.nextPmDate ?? '9999').localeCompare(b.original.nextPmDate ?? '9999'), cell: (c) => { const r = c.row.original; const s = r.pmState; if (!r.nextPmDate && !r.lastMaintenanceDate && !PM_TONE[s]) return '—'; return <div className="whitespace-nowrap"><p className="flex items-center gap-1.5">{r.nextPmDate ? formatDate(r.nextPmDate) : '—'}{['Overdue', 'Due soon', 'Suspended'].includes(s) && <Badge tone={PM_TONE[s]}>{s === 'Due soon' ? 'PM due' : s === 'Suspended' ? 'PM suspended' : 'PM overdue'}</Badge>}</p><p className="text-xs text-muted">Last: {r.lastMaintenanceDate ? formatDate(r.lastMaintenanceDate) : '—'}{r.pmIntervalDays ? ` · every ${r.pmIntervalDays} d` : ''}</p></div>; } },
    { id: 'a', header: '', cell: (c) => <Button size="sm" variant="ghost" className="px-2" aria-label={`View ${c.row.original.assetId}`} title="View details" icon={<ChevronRight className="size-4" />} onClick={(e) => { e.stopPropagation(); setOpen(c.row.original.assetId); }} /> },
  ];
  return (
    <>
      <PageHeader title="Non-chassis equipment" meta={<ScreenTag id="SCR-13" />} description="Heavy equipment, forklifts, welding machines, depot and stockroom tools — same lifecycle as chassis: acquisition → in use → repair → retirement → disposal."
        actions={can('chassis.asset', 'add') && <Button icon={<Plus className="size-4" />} onClick={() => setEdit('new')}>New asset</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setStatus('')} className={cn('rounded-full border px-3 py-1 text-xs font-medium', !status ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-2 hover:border-brand-300')}>All <span className="text-muted">{all.length}</span></button>
        {ASSET_STATUSES.map((s) => <button key={s} onClick={() => setStatus(status === s ? '' : s)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', status === s ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-2 hover:border-brand-300')}>{s} <span className="text-muted">{all.filter((a) => a.status === s).length}</span></button>)}
        <span className="ml-auto text-xs text-muted">PM due flag: within {soon} days of Next PM · Assigned to = custodian (department or person); In-Use = being operated</span>
      </div>
      {data.isError && <Banner tone="danger" className="mb-4" title="Could not load equipment" actions={<Button size="sm" variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => data.refetch()}>Retry</Button>}>{errMessage(data.error)}</Banner>}
      <DataTable data={rows} loading={data.isLoading} columns={cols} onRowClick={(r) => setOpen(r.assetId)} exportName="non-chassis-assets" emptyTitle="No equipment matching filter" emptyHint="Clear a filter or status chip, or register a new asset."
        rowClassName={(r) => (['Retired', 'Disposed'].includes(r.status) ? 'text-muted' : undefined)}
        toolbar={<><Select aria-label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="All categories" options={CATS.map((c) => ({ value: c, label: c }))} />
          <Select aria-label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={branchOptions} />
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={ASSET_STATUSES.map((s) => ({ value: s, label: s }))} />
          <Select aria-label="Assigned to" value={f.assigned} onChange={(e) => setF({ ...f, assigned: e.target.value })} placeholder="Anyone assigned" options={assignOptions} />
          <label className="flex items-center gap-2 text-[13px] text-ink-2"><input type="checkbox" className="accent-brand-600" checked={f.pmDue} onChange={(e) => setF({ ...f, pmDue: e.target.checked })} /> PM due / overdue</label>
          <span className="ml-auto text-[13px] text-muted">{rows.length} of {all.length} assets</span></>} />
      {edit && <AssetEditor asset={edit === 'new' ? undefined : edit} existing={all.map((a) => a.assetId)} onClose={() => setEdit(null)} onSaved={(id) => setOpen(id)} />}
      {open && !edit && <AssetDetail id={open} onClose={() => setOpen(null)} onEdit={(a) => setEdit(a)} />}
    </>
  );
}

function AssetDetail({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (a: Asset) => void }) {
  const data = useData(['asset', id], () => api.chassis.asset(id));
  const { branchName, userName } = useRefLookups();
  const { can } = useAuth();
  const [tab, setTab] = useState('details');
  const [to, setTo] = useState<(typeof OPEN_STATUSES)[number] | ''>('');
  const [disp, setDisp] = useState<'Retire' | 'Dispose' | null>(null);
  const [mnt, setMnt] = useState(false);
  const [m, setM] = useState({ date: todayManila(), type: 'Preventive' as 'Preventive' | 'Corrective' | 'Inspection', notes: '', joNo: '', performedBy: '', cost: '', meterHours: '' });
  const change = useAction((r: string) => api.chassis.changeAssetStatus(id, to as (typeof OPEN_STATUSES)[number], r), { success: 'Status changed', onSuccess: () => setTo('') });
  const dispose = useAction((r: string) => api.chassis.requestDisposal(id, disp!, r), { success: (w) => `${disp} request ${w} sent for APS approval`, onSuccess: () => setDisp(null) });
  const log = useAction(() => api.chassis.logMaintenance(id, { date: m.date, type: m.type, notes: m.notes, joNo: m.joNo || undefined, performedBy: m.performedBy.trim() || undefined, cost: m.cost === '' ? undefined : Number(m.cost), meterHours: m.meterHours === '' ? undefined : Number(m.meterHours) }),
    { success: 'Maintenance logged — Next PM recalculated', onSuccess: () => { setMnt(false); setM({ ...m, notes: '', joNo: '', performedBy: '', cost: '', meterHours: '' }); } });
  const a = data.data?.asset;
  const closed = !!a && ['Retired', 'Disposed'].includes(a.status);
  const pending = a?.disposal?.status === 'Pending Approval';
  const editable = can('chassis.asset', 'edit');
  return (
    <Drawer open onClose={onClose} title={a ? <span className="flex items-center gap-2"><span className="font-mono">{a.assetId}</span><StatusBadge domain="asset" value={a.status} />{a.statusSince && <span className="text-xs font-normal text-muted">since {formatDate(a.statusSince)}</span>}</span> : 'Asset'} width="max-w-3xl"
      footer={a && editable && <>
        {!closed && <Select aria-label="Change status" value={to} onChange={(e) => setTo(e.target.value as typeof to)} placeholder="Change status…" options={OPEN_STATUSES.filter((s) => s !== a.status).map((s) => ({ value: s, label: s }))} />}
        {!closed && <Button variant="secondary" icon={<Wrench className="size-4" />} onClick={() => setMnt(true)}>Log maintenance</Button>}
        {!closed && !pending && <span title="Opens a retirement request — the status changes only after APS / MMG Manager approval"><Button variant="secondary" icon={<Archive className="size-4" />} onClick={() => setDisp('Retire')}>Retire</Button></span>}
        {a.status !== 'Disposed' && !pending && <span title="Opens a disposal request (sale, scrap or write-off) — the status changes only after APS / MMG Manager approval"><Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDisp('Dispose')}>Dispose</Button></span>}
        {!closed && <Button onClick={() => onEdit(a)}>Edit</Button>}
      </>}>
      {data.isError && <Banner tone="danger">{errMessage(data.error)}</Banner>}
      {!a ? <p className="text-muted">Loading…</p> : (
        <Stack>
          {pending && <Banner tone="warning" title={`${a.disposal!.action} request pending APS / MMG Manager approval`}>{a.disposal!.reason} · requested {formatDateTime(a.disposal!.requestedAt)}. Approve or reject it in the Inbox.</Banner>}
          {a.status === 'Retired' && !pending && <Banner tone="info">Retired — out of service but still on the books. Dispose (sell, scrap or write off) through a separate approved request.</Banner>}
          {a.status === 'Disposed' && <Banner tone="info">Disposed — removed from the books after approval. The record is kept for the audit trail.</Banner>}
          <Tabs value={tab} onChange={setTab} items={[{ id: 'details', label: 'Details' }, { id: 'mnt', label: 'Maintenance history', count: a.maintenanceLog?.length ?? 0 }, { id: 'audit', label: 'Audit trail', count: data.data!.audit.length }]} />
          {tab === 'details' && <>
            <KeyValueGrid cols={3} items={[
              { label: 'Description', value: a.description }, { label: 'Category', value: a.category }, { label: 'Branch', value: branchName(a.branchCode) }, { label: 'Location', value: a.location },
              { label: 'Quantity', value: `${a.qty ?? 1} ${a.uom ?? 'unit'}` }, { label: 'Serial no.', value: a.serialNo }, { label: 'Make / model', value: [a.make, a.model].filter(Boolean).join(' ') || undefined }, { label: 'Condition', value: a.condition },
              { label: 'Assigned to', value: a.assignedTo?.startsWith('Dept: ') ? a.assignedTo.slice(6) : userName(a.assignedTo) }, { label: 'Acquired', value: formatDate(a.acquisitionDate) },
              { label: 'Last maintenance', value: formatDate(a.lastMaintenanceDate) }, { label: 'PM interval', value: a.pmIntervalDays ? `Every ${a.pmIntervalDays} days` : undefined },
              { label: 'Next PM', value: <span className="flex items-center gap-1.5">{formatDate(a.nextPmDate)}{PM_TONE[data.data!.pmState] && <Badge tone={PM_TONE[data.data!.pmState]}>{PM_LABEL[data.data!.pmState] ?? data.data!.pmState}</Badge>}</span> },
              { label: 'PM responsible', value: a.pmResponsible ? (a.pmResponsible.startsWith('Dept: ') ? a.pmResponsible.slice(6) : userName(a.pmResponsible)) : undefined },
              { label: 'Meter (operating hours)', value: a.meterHours != null ? `${a.meterHours.toLocaleString('en-PH')} h` : undefined },
              { label: 'Status since', value: formatDate(a.statusSince) }, { label: 'Source PO / RR', value: a.sourceRef },
              { label: 'QR / barcode tag', value: <span className="flex items-center gap-1.5 font-mono"><QrCode className="size-4 text-muted" />{a.qrCode ?? '—'}</span> }, { label: 'Notes', value: a.notes },
            ]} />
            {data.data!.workflow && <Card><CardHeader title={`${a.disposal?.action} approval`} /><ApprovalTimeline workflow={data.data!.workflow} userName={userName} /></Card>}
          </>}
          {tab === 'mnt' && <DataTable data={a.maintenanceLog ?? []} searchable={false} emptyTitle="No maintenance recorded" columns={[
            { accessorKey: 'date', header: 'Date', cell: (x) => formatDate(x.getValue<string>()) }, { accessorKey: 'type', header: 'Type' }, { accessorKey: 'notes', header: 'Work done' },
            { accessorKey: 'joNo', header: 'Repair / JO', cell: (x) => (x.getValue() ? <Link className="font-mono text-brand-600 hover:underline" to={`/repair/jo/${x.getValue<string>()}`}>{x.getValue<string>()}</Link> : '—') },
            { accessorKey: 'performedBy', header: 'Performed by', cell: (x) => x.getValue<string>() ?? '—' }, { accessorKey: 'cost', header: 'Cost', meta: { align: 'right' }, cell: (x) => (x.getValue() != null ? formatPhp(x.getValue<number>()) : '—') },
            { accessorKey: 'meterHours', header: 'Meter (h)', meta: { align: 'right' }, cell: (x) => (x.getValue() != null ? x.getValue<number>().toLocaleString('en-PH') : '—') },
            { accessorKey: 'by', header: 'Logged by', cell: (x) => userName(x.getValue<string>()) }]} />}
          {tab === 'audit' && <DataTable data={data.data!.audit} searchable={false} emptyTitle="No changes recorded since the demo data was loaded" columns={[
            { accessorKey: 'at', header: 'When', cell: (x) => formatDateTime(x.getValue<string>()) }, { accessorKey: 'action', header: 'Event' },
            { id: 'chg', header: 'Change', cell: (x) => { const b = x.row.original.before as { status?: string } | undefined, af = x.row.original.after as { status?: string } | undefined; return b?.status || af?.status ? `${b?.status ?? '—'} → ${af?.status ?? '—'}` : '—'; } },
            { accessorKey: 'actor', header: 'By', cell: (x) => userName(x.getValue<string>()) }, { accessorKey: 'reason', header: 'Reason' }]} />}
        </Stack>
      )}
      <ConfirmDialog open={!!to} onClose={() => setTo('')} title={`Change status to ${to}?`} message="The change and your reason are recorded in the audit trail." requireReason confirmLabel="Change status" loading={change.isPending} onConfirm={(r) => change.mutate(r)} />
      <ConfirmDialog open={!!disp} onClose={() => setDisp(null)} tone={disp === 'Dispose' ? 'danger' : 'primary'} title={`${disp} ${id}?`} message={disp === 'Retire' ? 'Retiring takes the asset out of service. It needs APS / MMG Manager approval before the status changes.' : 'Disposal removes the asset from the books (sale, scrap or write-off). It needs APS / MMG Manager approval before the status changes.'} requireReason confirmLabel={`Request ${disp?.toLowerCase()}`} loading={dispose.isPending} onConfirm={(r) => dispose.mutate(r)} />
      <Modal open={mnt} onClose={() => setMnt(false)} title={`Log maintenance — ${id}`} footer={<><Button variant="secondary" onClick={() => setMnt(false)}>Cancel</Button><Button loading={log.isPending} disabled={!m.date || !m.notes.trim()} onClick={() => log.mutate(undefined)}>Save</Button></>}>
        <Stack>
          <FormGrid>
            <Input label="Date" type="date" required value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} />
            <Select label="Type" value={m.type} onChange={(e) => setM({ ...m, type: e.target.value as typeof m.type })} options={['Preventive', 'Corrective', 'Inspection'].map((x) => ({ value: x, label: x }))} />
            <Input label="Job order no." value={m.joNo} placeholder="e.g. JO-MNL-000123" onChange={(e) => setM({ ...m, joNo: e.target.value.toUpperCase() })} hint="Optional — links the repair record" />
            <Input label="Performed by" value={m.performedBy} placeholder="Technician or service vendor" onChange={(e) => setM({ ...m, performedBy: e.target.value })} />
            <Input label="Cost (₱)" type="number" min={0} value={m.cost} placeholder="e.g. 3500" onChange={(e) => setM({ ...m, cost: e.target.value })} />
            <Input label="Meter reading (hours)" type="number" min={0} value={m.meterHours} placeholder={a?.meterHours != null ? `last ${a.meterHours}` : 'e.g. 4310'} onChange={(e) => setM({ ...m, meterHours: e.target.value })} hint="For forklifts and heavy equipment — whether PM follows hours is pending confirmation" />
          </FormGrid>
          <Textarea label="Work done" required value={m.notes} placeholder="Describe the work — e.g. replaced hydraulic hose, oil change" onChange={(e) => setM({ ...m, notes: e.target.value })} />
          {a?.pmIntervalDays && m.date && <p className="text-xs text-muted">Next PM becomes {formatDate(addDaysIso(m.date, a.pmIntervalDays))} (every {a.pmIntervalDays} days).</p>}
          {log.error && <Banner tone="danger">{errMessage(log.error)}</Banner>}
        </Stack>
      </Modal>
    </Drawer>
  );
}

function AssetEditor({ asset, existing, onClose, onSaved }: { asset?: Asset; existing: string[]; onClose: () => void; onSaved: (id: string) => void }) {
  const { branchOptions, setting } = useRefLookups();
  const { user } = useAuth();
  const assignOptions = useAssignOptions();
  // Staff review 1.2: branch defaults to the signed-in user's branch when it is an operating branch (head-office users fall back to MNL).
  const homeBranch = branchOptions.some((b) => b.value === user?.branchCode) && user?.branchCode !== 'HO' ? user!.branchCode : 'MNL';
  const [v, setV] = useState<Asset>(asset ?? { assetId: '', category: 'Forklift', description: '', branchCode: homeBranch, status: 'Available', qty: 1, uom: 'unit', condition: 'Good' });
  const save = useAction(() => api.chassis.saveAsset(v, !asset), { success: (r) => `Asset ${r.assetId} saved — tag ${r.qrCode}`, onSuccess: (r) => { onClose(); onSaved(r.assetId); } });
  const errs: Record<string, string | undefined> = {
    assetId: !v.assetId ? 'Required' : !/^[A-Z0-9-]{4,20}$/.test(v.assetId) ? '4–20 letters, digits or hyphens (e.g. AST-FL-007)' : !asset && existing.includes(v.assetId) ? `Duplicate — ${v.assetId} already exists` : undefined,
    category: v.category ? undefined : 'Required', description: v.description.trim() ? undefined : 'Required', qty: v.qty != null && v.qty > 0 ? undefined : 'Must be greater than zero',
  };
  const invalid = Object.values(errs).some(Boolean);
  const need = Object.keys(errs).filter((k) => errs[k]).map((k) => ASSET_LABELS[k]);
  const show = (k: string) => fieldError(save.error, k) ?? ((k === 'assetId' && v.assetId) || (k === 'qty' && v.qty != null) ? errs[k] : undefined);
  const nextPm = v.lastMaintenanceDate && v.pmIntervalDays ? addDaysIso(v.lastMaintenanceDate, v.pmIntervalDays) : v.nextPmDate;
  const counted = v.category === 'Depot Tool' || v.category === 'Stockroom Tool';
  return (
    <Drawer open onClose={onClose} title={asset ? `Edit asset ${asset.assetId}` : 'New asset'} width="max-w-2xl" footer={<><span className="mr-auto text-xs text-muted">Required (*): asset ID, category, description, quantity{need.length > 0 && <> — still needed: <span className="font-medium text-ink-2">{need.join(', ')}</span></>}</span><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={invalid} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <Stack>
        {save.error && <Banner tone="danger">{errMessage(save.error)}</Banner>}
        <h3 className={SECTION}>Identification</h3>
        <FormGrid>
          <Input label="Asset ID / tag" required disabled={!!asset} value={v.assetId} placeholder="e.g. AST-FL-007" onChange={(e) => setV({ ...v, assetId: e.target.value.toUpperCase().trim() })} error={show('assetId')} hint="Unique; format AST-<category>-<no.>" />
          <Select label="Category" required value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as Asset['category'], uom: ['Depot Tool', 'Stockroom Tool'].includes(e.target.value) ? 'pc' : 'unit' })} options={CATS.map((c) => ({ value: c, label: c }))} />
          <Input label="Description" required value={v.description} placeholder="e.g. 3-ton diesel forklift" onChange={(e) => setV({ ...v, description: e.target.value })} wrapperClassName="md:col-span-2" error={show('description')} />
          <Input label="Quantity" required type="number" min={1} value={v.qty ?? ''} placeholder="e.g. 1" onChange={(e) => setV({ ...v, qty: e.target.value === '' ? undefined : Number(e.target.value) })} error={show('qty')} hint={counted ? 'Depot / stockroom tools are tracked in counts' : 'Usually 1 for serialised equipment'} />
          <Select label="Unit of measure" value={v.uom ?? 'unit'} onChange={(e) => setV({ ...v, uom: e.target.value })} options={['unit', 'pc', 'set', 'pair', 'box'].map((x) => ({ value: x, label: x }))} />
          <Input label="Serial no." value={v.serialNo ?? ''} onChange={(e) => setV({ ...v, serialNo: e.target.value.toUpperCase() })} placeholder="Manufacturer's serial, e.g. SN-48213" />
          <Input label="Make" value={v.make ?? ''} onChange={(e) => setV({ ...v, make: e.target.value })} placeholder="e.g. Toyota" />
          <Input label="Model" value={v.model ?? ''} onChange={(e) => setV({ ...v, model: e.target.value })} placeholder="e.g. 8FD30" />
          <Select label="Condition" value={v.condition ?? 'Good'} onChange={(e) => setV({ ...v, condition: e.target.value as Asset['condition'] })} options={['Good', 'Fair', 'Poor', 'Unserviceable'].map((x) => ({ value: x, label: x }))} />
          <Input label="Acquisition date" type="date" value={v.acquisitionDate ?? ''} onChange={(e) => setV({ ...v, acquisitionDate: e.target.value })} />
          <Input label="Source PO / receiving report" value={v.sourceRef ?? ''} placeholder="e.g. PO-000149 / RR-000059" onChange={(e) => setV({ ...v, sourceRef: e.target.value.toUpperCase() })} hint="Optional — whether Procurement creates assets automatically is pending confirmation" />
          <Input label="QR / barcode tag" readOnly tabIndex={-1} className="bg-surface-alt text-ink-2" value={v.qrCode ?? (v.assetId ? `QR-${v.assetId}` : '')} placeholder="Generated at save" />
        </FormGrid>
        <h3 className={SECTION}>Location &amp; assignment</h3>
        <FormGrid>
          <Select label="Branch" value={v.branchCode} onChange={(e) => setV({ ...v, branchCode: e.target.value })} options={branchOptions} />
          <Input label="Location (yard / stockroom)" value={v.location ?? ''} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="e.g. Yard B, bay 3" />
          <Select label="Status" value={v.status} disabled={!!asset && ['Retired', 'Disposed'].includes(v.status)} onChange={(e) => setV({ ...v, status: e.target.value as Asset['status'] })} options={(asset && ['Retired', 'Disposed'].includes(v.status) ? ASSET_STATUSES : OPEN_STATUSES).map((s) => ({ value: s, label: s }))} hint="Retired / Disposed only through an approved request" />
          <Select label="Assigned to (user / department)" placeholder="Unassigned" value={v.assignedTo ?? ''} onChange={(e) => setV({ ...v, assignedTo: e.target.value || undefined })} options={assignOptions} />
        </FormGrid>
        <h3 className={SECTION}>Maintenance</h3>
        <FormGrid>
          <Input label="Last maintenance" type="date" value={v.lastMaintenanceDate ?? ''} onChange={(e) => setV({ ...v, lastMaintenanceDate: e.target.value })} />
          <Input label="PM interval (days)" type="number" min={1} value={v.pmIntervalDays ?? ''} placeholder="e.g. 90" onChange={(e) => setV({ ...v, pmIntervalDays: e.target.value === '' ? undefined : Number(e.target.value) })} hint="Set per asset" />
          {v.pmIntervalDays ? <Input label="Next PM date (calculated)" readOnly tabIndex={-1} className="bg-surface-alt text-ink-2" value={nextPm ? formatDate(nextPm) : ''} placeholder="Enter last maintenance date" hint={`Flagged “PM due” ${Number(setting('ast.pm_due_soon_days') ?? 7)} days before`} />
            : <Input label="Next PM date" type="date" value={v.nextPmDate ?? ''} onChange={(e) => setV({ ...v, nextPmDate: e.target.value })} hint="Manual — or set a PM interval to calculate it" />}
          <Select label="PM responsible" placeholder="Not set" value={v.pmResponsible ?? ''} onChange={(e) => setV({ ...v, pmResponsible: e.target.value || undefined })} options={assignOptions} hint="Person or department that arranges the PM (checklist / service vendor pending confirmation)" />
        </FormGrid>
        <Textarea label="Notes" value={v.notes ?? ''} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Anything else worth recording about this asset" />
        <p className="text-xs text-muted">Owner, acquisition cost, supplier, warranty and attachments are not in the confirmed scope for non-chassis assets — pending client decision.</p>
      </Stack>
    </Drawer>
  );
}
