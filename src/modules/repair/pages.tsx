import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Camera, Check, Pause, Play, Plus, ShieldCheck, Trash2, Wrench, CircleCheck, X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { formatDate, formatDateTime, formatPhp, manilaDay, todayManila, REPAIR_CATEGORIES, type JobOrder, type LaborShift, type RepairCategory } from '../../lib/shared';
import {
  ApprovalTimeline, Badge, Banner, Button, Card, CardHeader, ConfirmDialog, DataTable, Field, FormGrid, FormSection, Input, KeyValueGrid, Modal, MoneyText, PageHeader, Select, Stack, StatusBadge, Switch, Tabs, Textarea, cn, sentenceCase, type ColumnDef,
} from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, fieldError, useAction, useData, useRefLookups } from '../../shared/hooks';
import { CreditGateBanner, Crumb } from '../../shared/components';

const JO_FLOW = ['Draft', 'Approved', 'Confirmed', 'Ongoing', 'Closed by R&M', 'Closed by EIR Out'];
const SHIFTS: LaborShift[] = ['Morning', 'Afternoon', 'Evening'];
const JO_SOURCES: JobOrder['source'][] = ['Gate In', 'Rescue', 'Spot Repair', 'Scheduled'];
/** Review 1.2: what each source means and what it adds on the form. */
const SOURCE_HELP: Record<JobOrder['source'], { text: string; ref: string }> = {
  'Gate In': { text: 'Damage found at the gate-in inspection of a returned unit. Link the EIR (In) number.', ref: 'EIR number, e.g. EIR-MNL-000200' },
  Rescue: { text: 'Follow-up repair after a roadside rescue. Link the rescue reference.', ref: 'Rescue reference, e.g. RSC-000038' },
  'Spot Repair': { text: 'Quick repair of an on-hire unit at the yard; adds the linked driver details below.', ref: 'Optional — gate pass or reference' },
  Scheduled: { text: 'Planned or preventive work on a unit in the yard.', ref: 'Optional — maintenance plan reference' },
};
/** Review 1.2: how the Gate In inspection parts map to the repair systems (pending Delbros confirmation). */
const PART_MAP = 'Gate In parts → repair systems: brake system → Brakes · lights & wiring → Electrical · landing legs, king pin, twist locks, mud flaps, chassis frame → Mechanical (frame repaint → Painting) · tires → Tires · springs / axles → Suspension.';
/** Small file-name picker for photos and attachments (binary storage comes with the real API). */
function AttachPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((n) => <span key={n} className="flex items-center gap-1 rounded-md border border-line bg-surface-alt px-2 py-1 text-xs"><Camera className="size-3.5 text-muted" />{n}<button type="button" aria-label={`Remove ${n}`} onClick={() => onChange(value.filter((y) => y !== n))}><X className="size-3.5 text-muted hover:text-danger" /></button></span>)}
      <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-sm text-brand-700 hover:border-brand-300">
        <Camera className="size-4" /> Add photo / file
        <input type="file" multiple className="sr-only" onChange={(e) => { const names = [...(e.target.files ?? [])].map((f) => f.name); onChange([...value, ...names.filter((n) => !value.includes(n))]); e.target.value = ''; }} />
      </label>
    </div>
  );
}

export function JobOrderListPage() {
  const [status, setStatus] = useState('');
  const [branch, setBranch] = useState('');
  // Review 1.2: filters for source, repair system, Major / Minor and chargeable.
  const [x, setX] = useState({ source: '', category: '', major: '', chargeable: '' });
  const data = useData(['jos', status, branch, x], () => api.repair.list({ status, branch, ...x }));
  const { branchOptions, userName } = useRefLookups();
  const nav = useNavigate();
  type Row = NonNullable<typeof data.data>[number];
  // Review 1.1: branch, unit / client context, workers, approval trail, closed date and age per JO.
  const cols: ColumnDef<Row>[] = [
    { accessorKey: 'joNo', header: 'JO no.', cell: (c) => <Link className="whitespace-nowrap font-mono font-medium text-brand-600 hover:underline" to={`/repair/jo/${c.getValue<string>()}`} onClick={(e) => e.stopPropagation()}>{c.getValue<string>()}</Link> },
    { accessorKey: 'branchCode', header: 'Branch' },
    { accessorKey: 'chassisNo', header: 'Chassis', cell: (c) => <span className="flex flex-col whitespace-nowrap"><span className="font-mono">{c.getValue<string>()}</span><span className="text-xs text-muted">{c.row.original.chassisStatus ?? ''}</span></span> },
    { accessorKey: 'clientName', header: 'Client / chargeable', cell: (c) => <span className="flex flex-col items-start gap-0.5"><span className="whitespace-nowrap">{c.row.original.clientName ?? '—'}{c.row.original.clientCode && <span className="ml-1 font-mono text-xs text-muted">{c.row.original.clientCode}</span>}</span>{c.row.original.chargeable && <Badge tone="warning" dot={false}>Chargeable</Badge>}</span> },
    { accessorKey: 'source', header: 'Source' },
    { accessorKey: 'categories', header: 'Repair systems', cell: (c) => <div className="flex flex-wrap gap-1">{c.getValue<string[]>().map((x) => <Badge key={x} tone="neutral" dot={false}>{x}</Badge>)}</div> },
    { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge domain="jo" value={c.getValue<string>()} /> },
    { accessorKey: 'isMajor', header: 'Major', cell: (c) => (c.getValue() ? <Badge tone="danger">Major</Badge> : <span className="text-muted">—</span>) },
    { accessorKey: 'workers', header: 'Workers', cell: (c) => <span className="whitespace-nowrap text-xs">{c.getValue<string[]>().join(', ') || '—'}</span> },
    { accessorKey: 'approvedBy', header: 'Approved / confirmed', cell: (c) => { const r = c.row.original; return r.approvedBy || r.confirmedBy ? <span className="flex flex-col whitespace-nowrap text-xs"><span>{r.approvedBy ? userName(r.approvedBy) : '—'}</span><span className="text-muted">{r.confirmedBy ? userName(r.confirmedBy) : 'Awaiting DYM'}</span></span> : <span className="text-xs text-muted">Not yet approved</span>; } },
    { accessorKey: 'partsCost', header: 'Parts', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) },
    { accessorKey: 'laborCost', header: 'Labor', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) },
    { accessorKey: 'totalCost', header: 'Total cost', meta: { align: 'right' }, cell: (c) => <strong className="whitespace-nowrap">{formatPhp(c.getValue<number>())}</strong> },
    { accessorKey: 'createdAt', header: 'Created / closed', cell: (c) => <span className="flex flex-col whitespace-nowrap"><span>{formatDate(c.getValue<string>())}</span><span className="text-xs text-muted">{c.row.original.closedAt ? `Closed ${formatDate(c.row.original.closedAt)}` : 'Open'}</span></span> },
    { accessorKey: 'daysOpen', header: 'Days open', meta: { align: 'right' } },
  ];
  return (
    <>
      <PageHeader title="Job orders" description="Repair & maintenance from Gate In (Unroadworthy), rescue outcomes, spot repairs or scheduled work. A chassis may have several concurrent JOs across different repair systems; closed JOs are never reopened."
        actions={<Link to="/repair/new"><Button icon={<Plus className="size-4" />}>Create job order</Button></Link>} />
      <DataTable data={data.data} loading={data.isLoading} columns={cols} onRowClick={(r) => nav(`/repair/jo/${r.joNo}`)} exportName="job-orders" emptyTitle="No job orders match the filters" emptyHint="Change the status or branch filter."
        toolbar={<>
          <Select aria-label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="All branches" options={branchOptions} />
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={[...JO_FLOW, 'On Hold'].map((s) => ({ value: s, label: s }))} />
          <Select aria-label="Source" value={x.source} onChange={(e) => setX({ ...x, source: e.target.value })} placeholder="All sources" options={JO_SOURCES.map((s) => ({ value: s, label: s }))} />
          <Select aria-label="Repair system" value={x.category} onChange={(e) => setX({ ...x, category: e.target.value })} placeholder="All repair systems" options={REPAIR_CATEGORIES.map((s) => ({ value: s, label: s }))} />
          <Select aria-label="Major / Minor" value={x.major} onChange={(e) => setX({ ...x, major: e.target.value })} placeholder="Major and Minor" options={[{ value: 'yes', label: 'Major only' }, { value: 'no', label: 'Minor only' }]} />
          <Select aria-label="Chargeable" value={x.chargeable} onChange={(e) => setX({ ...x, chargeable: e.target.value })} placeholder="Chargeable or not" options={[{ value: 'yes', label: 'Chargeable to client' }, { value: 'no', label: 'Not chargeable' }]} />
        </>} />
      <p className="mt-2 text-xs text-muted">Every Breakdown / In Repair unit has a job order: an open JO while repairs run, or a JO Closed by R&amp;M while the unit waits for the quality sign-off (TQS) on the Allocation board. Days open = created to Closed by R&amp;M (or today). Closed by R&amp;M becomes Closed by EIR Out when the unit next leaves the gate. Total cost = parts + labor. The JO number carries the chassis home branch (JO-NVL-… for a Navotas unit). The table scrolls sideways; click a row for the detail, where the Close by R&amp;M action is.</p>
    </>
  );
}

// ── SCR-25 Create Job Order ─────────────────────────────────────────────────
export function JobOrderCreatePage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [v, setV] = useState({ chassisNo: sp.get('chassis') ?? '', source: 'Spot Repair' as JobOrder['source'], sourceRef: sp.get('ref') ?? '', categories: [] as RepairCategory[], notes: '', workers: [] as string[], isMajor: false, chargeable: false, driver: { name: '', license: '', truckPlate: '' },
    priority: 'Normal' as NonNullable<JobOrder['priority']>, targetDate: '', estimatedCost: 0, photos: [] as string[], chargeClientCode: '' });
  const [worker, setWorker] = useState('');
  const [tried, setTried] = useState(false);
  const { eqName, clientName, clientOptions } = useRefLookups();
  const ch = useData(['chassis', v.chassisNo], () => api.chassis.get(v.chassisNo), v.chassisNo.length >= 6);
  const open = useData(['jos-open', v.chassisNo], () => api.repair.list({ chassis: v.chassisNo }), v.chassisNo.length >= 6);
  const chassisList = useData(['chassis-pick'], () => api.chassis.list());
  const rescues = useData(['rescues', 'jo-link'], () => api.rescue.list(), v.source === 'Rescue');
  const allJos = useData(['jos', ''], () => api.repair.list());
  const knownWorkers = [...new Set((allJos.data ?? []).flatMap((j) => [...j.workers, ...j.labor.map((l) => l.worker)]))].filter(Boolean).sort();
  const openCats = new Set((open.data ?? []).filter((j) => !j.status.startsWith('Closed')).flatMap((j) => j.categories));
  const chargeTo = v.chargeClientCode || ch.data?.chassis.currentClientCode || '';
  const create = useAction(() => api.repair.create({ chassisNo: v.chassisNo, source: v.source, categories: v.categories, notes: v.notes, workers: v.workers, isMajor: v.isMajor, chargeable: v.chargeable, spotDriver: v.source === 'Spot Repair' ? v.driver : undefined,
    sourceRef: v.sourceRef, priority: v.priority, targetDate: v.targetDate || undefined, estimatedCost: v.estimatedCost || undefined, photos: v.photos, chargeClientCode: v.chargeable ? chargeTo || undefined : undefined }),
    { success: (j) => `${j.joNo} created (Draft)`, onSuccess: (j) => nav(`/repair/jo/${j.joNo}`) });
  const spot = v.source === 'Spot Repair';
  const errs = { chassisNo: !v.chassisNo ? 'Enter the chassis or asset reference' : undefined, categories: !v.categories.length ? 'Select at least one repair system' : undefined, notes: !v.notes.trim() ? 'Describe the work needed' : undefined };
  const submit = () => { setTried(true); if (!errs.chassisNo && !errs.categories && !errs.notes && !(v.chargeable && !chargeTo)) create.mutate(undefined); };
  const addWorker = () => { const w = worker.trim(); if (w && !v.workers.includes(w)) setV({ ...v, workers: [...v.workers, w] }); setWorker(''); };
  return (
    <div className="max-w-4xl">
      <PageHeader breadcrumb={<Crumb items={[{ to: '/repair', label: 'Job orders' }, { label: 'New' }]} />} title="Create job order" description="Saved as Draft → approved by the Branch Generalist lead → confirmed by the Deputy Yard Manager." />
      <Stack>
        <FormSection title="Unit & source">
          <FormGrid>
            <Input label="Chassis / asset reference" required suggestions={(chassisList.data ?? []).map((c) => ({ value: c.chassisNo, hint: sentenceCase(c.status) }))} value={v.chassisNo} onChange={(e) => setV({ ...v, chassisNo: e.target.value.toUpperCase() })} placeholder="Search e.g. DW-NVL-1007" error={ch.error ? (/not found/i.test(errMessage(ch.error) ?? '') ? `Chassis ${v.chassisNo} is not in the chassis master` : errMessage(ch.error)) : tried ? errs.chassisNo : undefined}
              hint={ch.data ? <span>Status <StatusBadge domain="chassis" value={ch.data.chassis.status} /> {ch.data.chassis.currentClientCode && `· on hire to ${ch.data.chassis.currentClientCode}`}</span> : 'Start typing to pick from the chassis master.'} />
            <Select label="Source" required value={v.source} onChange={(e) => setV({ ...v, source: e.target.value as JobOrder['source'] })} options={JO_SOURCES.map((s) => ({ value: s, label: s }))} hint={SOURCE_HELP[v.source].text} />
            {/* Review 1.2: link to the originating record (EIR, rescue, gate pass or plan). */}
            <Input label={<>Originating record <span className="font-normal text-muted">{v.source === 'Gate In' || v.source === 'Rescue' ? '' : '(optional)'}</span></>} placeholder={SOURCE_HELP[v.source].ref} value={v.sourceRef} onChange={(e) => setV({ ...v, sourceRef: e.target.value.toUpperCase() })}
              suggestions={v.source === 'Rescue' ? (rescues.data ?? []).filter((r) => !v.chassisNo || r.chassisNo === v.chassisNo).map((r) => ({ value: r.rescueNo, hint: `${r.chassisNo} · ${r.status}` })) : undefined} />
            <Field label="Branch">{() => <p className="py-2 text-sm">{ch.data ? <><b>{ch.data.chassis.branchCode}</b> <span className="text-muted">— the unit's home branch; the JO is issued as JO-{ch.data.chassis.branchCode}-…</span></> : <span className="text-muted">Set from the chassis home branch</span>}</p>}</Field>
          </FormGrid>
          {/* Review 1.1: unit context after selection — decides whether the spot-repair driver section applies and shows the OR/CR state needed for the BR-07 sign-off. */}
          {ch.data && <div className="mt-3 rounded-lg border border-line bg-surface-alt p-3"><KeyValueGrid cols={3} items={[
            { label: 'Type', value: eqName(ch.data.chassis.chassisType) }, { label: 'Status', value: <StatusBadge domain="chassis" value={ch.data.chassis.status} /> }, { label: 'Branch', value: ch.data.chassis.branchCode },
            { label: 'Current client', value: ch.data.chassis.currentClientCode ? `${clientName(ch.data.chassis.currentClientCode)} (${ch.data.chassis.currentClientCode})` : '—' },
            { label: 'Registration / OR-CR', value: <span>{ch.data.regState}{ch.data.registration?.expiryDate ? ` · exp. ${formatDate(ch.data.registration.expiryDate)}` : ''}</span> },
            { label: 'Open job orders', value: (open.data ?? []).filter((j) => !j.status.startsWith('Closed')).map((j) => `${j.joNo} (${j.categories.join(', ')})`).join('; ') || 'None' },
          ]} /></div>}
          {spot && ch.data && !ch.data.chassis.currentClientCode && <p className="mt-2 text-xs text-warning">Spot repair applies to on-hire units — this unit is {ch.data.chassis.status}. Choose another source (e.g. Gate In or Scheduled).</p>}
          {spot && ch.data?.chassis.currentClientCode && <div className="mt-3"><CreditGateBanner clientCode={ch.data.chassis.currentClientCode} action="JO_CREATE_SPOT" /></div>}
        </FormSection>
        <FormSection title={<>Repair systems <span className="text-danger">*</span></>} description="Select one or more. A system that already has an open job order on this chassis is unavailable.">
          <div className="flex flex-wrap gap-2">
            {REPAIR_CATEGORIES.map((c) => {
              const busy = openCats.has(c);
              const on = v.categories.includes(c);
              return <button key={c} type="button" disabled={busy} aria-pressed={on} onClick={() => setV({ ...v, categories: on ? v.categories.filter((x) => x !== c) : [...v.categories, c] })}
                className={cn('inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium', busy ? 'cursor-not-allowed border-line bg-surface-alt text-disabled line-through' : on ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line-strong text-ink-2 hover:border-brand-300')}
                title={busy ? 'Open JO exists for this system' : undefined}>
                <span className={cn('flex size-4 items-center justify-center rounded border', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong bg-white')}>{on && <Check className="size-3" />}</span>{c}</button>;
            })}
          </div>
          {tried && errs.categories && <p className="mt-2 text-xs text-danger">{errs.categories}</p>}
          <p className="mt-2 text-xs text-muted">{PART_MAP} <Badge tone="warning" dot={false}>pending confirmation</Badge></p>
        </FormSection>
        <FormSection title="Work">
          <Stack>
            <Textarea label="Notes / description" required placeholder="Describe the work needed — e.g. replace left rear brake lining" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} error={tried ? errs.notes : undefined} />
            <div>
              <div className="flex items-end gap-2">
                <Input wrapperClassName="flex-1" label="Worker / laborer assignment" suggestions={knownWorkers.filter((w) => !v.workers.includes(w)).map((w) => ({ value: w }))} value={worker} placeholder="Search or type a laborer name" onChange={(e) => setWorker(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addWorker(); } }} />
                <Button variant="secondary" icon={<Plus className="size-4" />} disabled={!worker.trim()} onClick={addWorker}>Add</Button>
              </div>
              {v.workers.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{v.workers.map((w) => (
                <span key={w} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-alt py-0.5 pl-2.5 pr-1 text-sm">{w}
                  <button type="button" aria-label={`Remove ${w}`} className="rounded-full p-0.5 text-muted hover:bg-line hover:text-ink" onClick={() => setV({ ...v, workers: v.workers.filter((x) => x !== w) })}><X className="size-3.5" /></button></span>))}</div>}
            </div>
            <div className="grid gap-3">
              <Switch label="Major parts / chassis-legal issue" description="Escalates to the Deputy Yard Manager" checked={v.isMajor} onChange={(x) => setV({ ...v, isMajor: x })} />
              <Switch label="Chargeable to client" description="Damage attributable to the client" checked={v.chargeable} onChange={(x) => setV({ ...v, chargeable: x })} />
            </div>
            {/* Review 1.2: who is charged and how (Debit Memo, category Repair cost, linked to this JO). */}
            {v.chargeable && <div className="rounded-lg border border-warning-line bg-warning-bg/40 p-3">
              <FormGrid>
                <Select label="Charge to client" required value={chargeTo} onChange={(e) => setV({ ...v, chargeClientCode: e.target.value })} placeholder="Select" options={clientOptions} hint={ch.data?.chassis.currentClientCode ? 'Defaults to the client the unit is on hire to' : 'Pick the client responsible for the damage (e.g. the client that returned the unit)'} error={tried && !chargeTo ? 'Choose the client to charge' : undefined} />
                <Field label="Charge route">{() => <p className="py-2 text-sm text-ink-2">Debit Memo (category <b>Repair cost</b>) linked to this JO number, raised by Accounting from Billing → Memos when the JO is closed; posted to the client's e-wallet.</p>}</Field>
              </FormGrid>
            </div>}
          </Stack>
        </FormSection>
        <FormSection title="Planning & attachments" description="Optional planning fields used by the capacity report and the Branch Generalist review.">
          <FormGrid cols={3}>
            <Select label="Priority" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value as NonNullable<JobOrder['priority']> })} options={[{ value: 'Normal', label: 'Normal' }, { value: 'Urgent', label: 'Urgent' }]} />
            <Input label="Target completion date" type="date" min={todayManila()} value={v.targetDate} onChange={(e) => setV({ ...v, targetDate: e.target.value })} error={fieldError(create.error, 'targetDate') || undefined} />
            <Input label="Estimated cost (parts + labor, ₱)" type="number" min={0} placeholder="e.g. 12000" value={v.estimatedCost || ''} onChange={(e) => setV({ ...v, estimatedCost: Number(e.target.value) })} hint="Actual parts are issued on the JO detail (Bill of materials)" />
          </FormGrid>
          <div className="mt-3"><Field label="Photos / attachments" hint="Damage photos, inspection sheet or quotation">{() => <AttachPicker value={v.photos} onChange={(photos) => setV({ ...v, photos })} />}</Field></div>
        </FormSection>
        {spot && (
          <FormSection title="Spot repair — linked driver information">
            <FormGrid cols={3}>
              <Input label={<>Driver name <span className="font-normal text-muted">(optional)</span></>} placeholder="e.g. Juan Dela Cruz" value={v.driver.name} onChange={(e) => setV({ ...v, driver: { ...v.driver, name: e.target.value } })} />
              <Input label={<>Licence <span className="font-normal text-muted">(optional)</span></>} placeholder="e.g. N01-23-456789" value={v.driver.license} onChange={(e) => setV({ ...v, driver: { ...v.driver, license: e.target.value } })} />
              <Input label={<>Truck plate <span className="font-normal text-muted">(optional)</span></>} placeholder="e.g. ABC 1234" value={v.driver.truckPlate} onChange={(e) => setV({ ...v, driver: { ...v.driver, truckPlate: e.target.value } })} />
            </FormGrid>
          </FormSection>
        )}
        {create.error && <Banner tone="danger">{errMessage(create.error)}</Banner>}
        <p className="text-xs text-muted">On create: the job order is saved as Draft; the Branch Generalist and the Deputy Yard Manager are notified ({spot ? 'SMS + in-app, repeated until acknowledged' : 'email + in-app'}){v.isMajor ? ', flagged as a major-parts escalation' : ''}. The Branch Generalist lead approves, then the DYM confirms. The JO number is issued on save.</p>
        <div className="flex justify-end gap-2"><Link to="/repair"><Button variant="secondary">Cancel</Button></Link><Button icon={<Wrench className="size-4" />} loading={create.isPending} onClick={submit}>Create (Draft)</Button></div>
      </Stack>
    </div>
  );
}

// ── Job order detail + SCR-26 Bill of Materials ────────────────────────────
export function JobOrderDetailPage() {
  const { no = '' } = useParams();
  const data = useData(['jo', no], () => api.repair.get(no));
  const { ref, userName } = useRefLookups();
  const { user, can } = useAuth();
  const [tab, setTab] = useState('bom');
  const [lines, setLines] = useState<{ partCode: string; qty: number }[]>([{ partCode: '', qty: 1 }]);
  const [whPick, setWh] = useState('');
  const [labor, setLabor] = useState({ worker: '', hours: 1, rate: 95, shift: 'Morning' as LaborShift });
  const [holdOpen, setHoldOpen] = useState(false);
  const tr = useAction((a: { action: 'approve' | 'start' | 'hold' | 'resume' | 'close-rm'; reason?: string }) => api.repair.transition(no, a.action, a.reason), { success: (j) => `Job order is now ${j.status}`, onSuccess: () => setHoldOpen(false) });
  // Review 1.2: issuing stockroom defaults to the JO branch's stockroom, else the user's, else the first one (Navotas has no stockroom of its own).
  const whs = data.data?.warehouses ?? [];
  const wh = whPick || whs.find((w) => w.branchCode === data.data?.jo.branchCode)?.code || (whs.some((w) => w.code === user?.warehouseCode) ? user?.warehouseCode : undefined) || whs[0]?.code || 'WH-MNL';
  const onHand = (partCode: string) => data.data?.stock.find((s) => s.partCode === partCode && s.warehouseCode === wh)?.qtyOnHand ?? 0;
  const addBom = useAction(() => api.repair.addBom(no, lines.filter((l) => l.partCode && l.qty > 0), wh), { success: 'Materials logged — inventory deducted', onSuccess: () => setLines([{ partCode: '', qty: 1 }]) });
  const addLabor = useAction(() => api.repair.addLabor(no, labor), { success: 'Labor logged' });
  if (data.error) return <Banner tone="danger" title="Job order not found">{errMessage(data.error)} <Link className="font-medium underline" to="/repair">Back to job orders</Link></Banner>;
  if (!data.data) return <p className="text-muted">Loading…</p>;
  const { jo, workflow, chassis, history, daysOpen, chargeClient, debitMemos } = data.data;
  const sourceLink = jo.sourceRef && /^RSC-/.test(jo.sourceRef) ? `/rescue/${jo.sourceRef}` : jo.sourceRef && /^EIR-/.test(jo.sourceRef) ? `/gate/eir?q=${jo.sourceRef}` : undefined;
  const parts = jo.bom.reduce((a, b) => a + b.qty * b.unitCost, 0);
  const laborCost = jo.labor.reduce((a, l) => a + l.hours * l.rate, 0);
  const canBom = ['Approved', 'Confirmed', 'Ongoing', 'On Hold'].includes(jo.status);
  const idx = JO_FLOW.indexOf(jo.status);
  const partOpts = (ref?.parts ?? []).map((p) => ({ value: p.partCode, label: `${p.partCode} — ${p.description}` }));
  return (
    <>
      <PageHeader breadcrumb={<Crumb items={[{ to: '/repair', label: 'Job orders' }, { label: jo.joNo }]} />} title={jo.joNo}
        meta={<><StatusBadge domain="jo" value={jo.status} />{jo.isMajor && <Badge tone="danger">Major</Badge>}</>}
        description={`${jo.chassisNo} · ${jo.source}${jo.sourceRef ? ` (${jo.sourceRef})` : ''} · created ${formatDateTime(jo.createdAt)} by ${userName(jo.createdBy)}`}
        actions={<>
          {jo.status === 'Draft' && can('repair.jo', 'approve') && <Button icon={<ShieldCheck className="size-4" />} loading={tr.isPending} onClick={() => tr.mutate({ action: 'approve' })} title="Approved by the Branch Generalist lead">Approve job order</Button>}
          {jo.status === 'Confirmed' && <Button icon={<Play className="size-4" />} onClick={() => tr.mutate({ action: 'start' })}>Start work</Button>}
          {jo.status === 'Ongoing' && <><Button variant="secondary" icon={<Pause className="size-4" />} onClick={() => setHoldOpen(true)}>Put on hold</Button><Button variant="success" icon={<CircleCheck className="size-4" />} onClick={() => tr.mutate({ action: 'close-rm' })}>Close by R&amp;M</Button></>}
          {jo.status === 'On Hold' && <Button icon={<Play className="size-4" />} onClick={() => tr.mutate({ action: 'resume' })}>Resume</Button>}
        </>} />
      <ConfirmDialog open={holdOpen} onClose={() => setHoldOpen(false)} requireReason title={`Put ${jo.joNo} on hold?`} confirmLabel="Put on hold" loading={tr.isPending}
        message="Give the reason (e.g. waiting for parts, waiting for client approval). It shows on the job order and in its status history." onConfirm={(reason) => tr.mutate({ action: 'hold', reason })} />
      {jo.status === 'On Hold' && <Banner tone="warning" className="mb-4" title="On hold">{jo.holdReason ?? 'Reason not recorded.'}</Banner>}
      <ol className="mb-5 flex flex-wrap gap-2">{JO_FLOW.map((s, i) => <li key={s} className={cn('rounded-full border px-3 py-1 text-xs font-medium', i < idx ? 'border-success-line bg-success-bg text-success' : i === idx ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-muted')}>{s}</li>)}</ol>
      {jo.status === 'Approved' && <Banner tone="info" className="mb-4">Waiting for DYM confirmation in My Approvals.</Banner>}
      {jo.status === 'Closed by R&M' && <Banner tone="success" className="mb-4">Repairs verified complete. The JO closes automatically as “Closed by EIR Out” when the chassis next leaves the gate and is billed. Additional work needs a new JO.</Banner>}
      <div className="mb-5 grid items-start gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Job order" />
          {/* Review 1.2: repair category, branch, fleet status, age, planning fields, origin and attachments. */}
          <KeyValueGrid cols={3} items={[{ label: 'Chassis', value: <Link className="font-mono text-brand-600 hover:underline" to={`/chassis/${jo.chassisNo}`}>{jo.chassisNo}</Link> },
            { label: 'Fleet status', value: chassis ? <StatusBadge domain="chassis" value={chassis.status} /> : '—' }, { label: 'Branch', value: jo.branchCode },
            { label: 'Repair category', value: jo.isMajor ? <Badge tone="danger">Major — escalated to the DYM</Badge> : jo.status === 'Closed by R&M' ? 'TQS — repaired, awaiting the quality sign-off' : 'Minor' },
            { label: 'Repair systems', value: jo.categories.join(', ') }, { label: 'Days open', value: `${daysOpen} ${daysOpen === 1 ? 'day' : 'days'}${jo.closedAt ? ` (closed ${formatDate(jo.closedAt)})` : ''}` },
            { label: 'Priority', value: jo.priority ?? 'Normal' }, { label: 'Target completion', value: jo.targetDate ? <span className={cn(!jo.closedAt && jo.targetDate < todayManila() && 'font-medium text-danger')}>{formatDate(jo.targetDate)}{!jo.closedAt && jo.targetDate < todayManila() ? ' · overdue' : ''}</span> : '—' },
            { label: 'Estimated cost', value: jo.estimatedCost ? formatPhp(jo.estimatedCost) : '—' },
            { label: 'Originating record', value: jo.sourceRef ? (sourceLink ? <Link className="font-mono text-brand-600 hover:underline" to={sourceLink}>{jo.sourceRef}</Link> : jo.sourceRef) : '—' },
            { label: 'Workers', value: jo.workers.join(', ') || '—' },
            { label: 'Chargeable', value: jo.chargeable ? <span>Yes{chargeClient ? ` — ${chargeClient.clientName} (${chargeClient.clientCode})` : ''}{debitMemos.length ? <span className="block text-xs">{debitMemos.map((m) => <Link key={m.memoNo} className="mr-2 font-mono text-brand-600 hover:underline" to={`/billing/memos?memo=${m.memoNo}`}>{m.memoNo} ({m.status})</Link>)}</span> : <span className="block text-xs text-muted">Debit Memo (Repair cost) not raised yet</span>}</span> : 'No' },
            { label: 'Approved by', value: userName(jo.approvedBy) }, { label: 'Confirmed by', value: userName(jo.confirmedBy) },
            { label: 'Photos / attachments', value: jo.photos?.length ? <span className="flex flex-wrap gap-1">{jo.photos.map((p) => <Badge key={p} tone="neutral" dot={false} icon={<Camera className="size-3" />}>{p}</Badge>)}</span> : 'None' },
            ...(jo.spotDriver ? [{ label: 'Spot driver', value: `${jo.spotDriver.name} · ${jo.spotDriver.license} · ${jo.spotDriver.truckPlate}` }] : [])]} />
          <div className="mt-4"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Notes / description</p><p className="rounded-lg bg-surface-alt p-3 text-sm">{jo.notes}</p></div>
          <div className="mt-4"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Status history</p>
            <ol className="space-y-1 text-sm">{history.map((h, i) => <li key={i} className="flex flex-wrap gap-x-2"><StatusBadge domain="jo" value={h.status} /><span className="text-ink-2">{h.at ? formatDateTime(h.at) : 'time not recorded'}</span>{h.by && <span className="text-muted">· {userName(h.by)}</span>}{h.note && <span className="text-muted">· {h.note}</span>}</li>)}</ol></div>
        </Card>
        <Card>
          <CardHeader title="Cost" />
          {[['Parts / materials', parts], ['Labor', laborCost]].map(([l, v]) => <div key={l as string} className="flex justify-between py-1 text-sm"><span className="text-ink-2">{l}</span><MoneyText value={v as number} /></div>)}
          <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold"><span>Total</span><MoneyText value={parts + laborCost} /></div>
          {workflow && <div className="mt-4 border-t border-line pt-4"><ApprovalTimeline workflow={workflow} userName={userName} /></div>}
        </Card>
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'bom', label: 'Bill of materials', count: jo.bom.length }, { id: 'labor', label: 'Labor', count: jo.labor.length }]} />
      {tab === 'bom' && (
        <Stack>
          <DataTable data={jo.bom} searchable={false} emptyTitle="No materials recorded" columns={[{ accessorKey: 'partCode', header: 'Part code' }, { accessorKey: 'description', header: 'Description' }, { accessorKey: 'qty', header: 'Qty', meta: { align: 'right' } },
            { accessorKey: 'unitCost', header: 'Unit cost', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) }, { id: 'amt', header: 'Amount', meta: { align: 'right' }, cell: (c) => formatPhp(c.row.original.qty * c.row.original.unitCost) }]} />
          {canBom ? (
            <FormSection title="Add materials" description="Submitting deducts stock from the selected warehouse (feeds Inventory).">
              <Select wrapperClassName="mb-1 w-72" label="Issue from warehouse" value={wh} onChange={(e) => setWh(e.target.value)} options={(whs.length ? whs : [{ code: 'WH-MNL', name: 'Manila stockroom', branchCode: 'MNL' }]).map((w) => ({ value: w.code, label: `${w.code} — ${w.name}${w.branchCode === jo.branchCode ? ' (this branch)' : ''}` }))} />
              {!whs.some((w) => w.branchCode === jo.branchCode) && <p className="mb-3 text-xs text-muted">{jo.branchCode} has no stockroom of its own — materials are issued from another branch's stockroom (rule pending confirmation).</p>}
              {lines.map((l, i) => (
                <div key={i} className="mb-2 flex items-end gap-2">
                  <Select wrapperClassName="flex-1" aria-label="Part" value={l.partCode} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, partCode: e.target.value } : x)))} placeholder="Select part" options={partOpts} />
                  {/* Review 1.2: stock on hand at the chosen warehouse for the selected part. */}
                  <span className={cn('w-36 pb-2 text-right text-xs', l.partCode && onHand(l.partCode) < l.qty ? 'font-medium text-danger' : 'text-muted')}>{l.partCode ? `On hand ${onHand(l.partCode)} at ${wh}` : ''}</span>
                  <Input wrapperClassName="w-24" aria-label="Qty" type="number" min={1} placeholder="Qty" value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))} />
                  <Button variant="ghost" aria-label="Remove" icon={<Trash2 className="size-4" />} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, k) => k !== i))} />
                </div>
              ))}
              <div className="flex gap-2"><Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setLines([...lines, { partCode: '', qty: 1 }])}>Add line</Button><Button size="sm" loading={addBom.isPending} onClick={() => addBom.mutate(undefined)}>Submit materials</Button></div>
              {addBom.error && <Banner className="mt-3" tone="danger">{errMessage(addBom.error)} <Link className="font-medium underline" to="/procurement">Create PR</Link></Banner>}
            </FormSection>
          ) : <Banner tone="info">{jo.status === 'Draft' ? 'Approve the job order before recording materials.' : 'This job order is closed.'}</Banner>}
        </Stack>
      )}
      {tab === 'labor' && (
        <Stack>
          <DataTable data={jo.labor} searchable={false} emptyTitle="No labor logged" columns={[{ accessorKey: 'date', header: 'Date', cell: (c) => formatDate(c.getValue<string>()) }, { accessorKey: 'worker', header: 'Laborer' }, { accessorKey: 'shift', header: 'Shift' },
            { accessorKey: 'hours', header: 'Hours', meta: { align: 'right' } }, { accessorKey: 'rate', header: 'Rate / hour', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) },
            { id: 'amount', header: 'Amount (hours × rate)', meta: { align: 'right' }, cell: (c) => formatPhp(c.row.original.hours * c.row.original.rate) }]}
            footer={jo.labor.length ? <span className="flex gap-5"><span>Total {jo.labor.reduce((a, l) => a + l.hours, 0)} h</span><span>Labor {formatPhp(laborCost)}</span></span> : undefined} />
          {canBom && <FormSection title="Log labor"><FormGrid cols={4}>
            <Input label="Laborer" placeholder="e.g. Juan Dela Cruz" value={labor.worker} onChange={(e) => setLabor({ ...labor, worker: e.target.value })} /><Input label="Hours" type="number" step="0.5" placeholder="e.g. 8" value={labor.hours} onChange={(e) => setLabor({ ...labor, hours: Number(e.target.value) })} />
            <Input label="Rate / hour" type="number" placeholder="e.g. 85" value={labor.rate} onChange={(e) => setLabor({ ...labor, rate: Number(e.target.value) })} /><Select label="Shift" value={labor.shift} onChange={(e) => setLabor({ ...labor, shift: e.target.value as LaborShift })} options={SHIFTS.map((s) => ({ value: s, label: s }))} />
          </FormGrid><Button className="mt-3" size="sm" disabled={!labor.worker} loading={addLabor.isPending} onClick={() => addLabor.mutate(undefined)}>Add labor</Button></FormSection>}
        </Stack>
      )}
    </>
  );
}

// ── SCR-27 Laborer / Capacity / Efficiency Reports ─────────────────────────
export function LaborReportsPage() {
  // Review 1.1: the period defaults to the last 30 days (Manila dates) and is always shown; Clear returns to this default.
  const defFrom = () => manilaDay(new Date(Date.now() - 29 * 86_400_000).toISOString());
  const [f, setF] = useState({ from: defFrom(), to: todayManila(), branch: '', weekStart: todayManila() });
  const periodLabel = f.from || f.to ? `${f.from ? formatDate(f.from) : 'start'} – ${f.to ? formatDate(f.to) : 'today'}` : 'all dates';
  const data = useData(['labor-reports', f], () => api.repair.reports(f));
  const { branchOptions, setting } = useRefLookups();
  const [tab, setTab] = useState('laborer');
  const [week, setWeek] = useState(0);
  const [drill, setDrill] = useState<string>('');
  const d = data.data;
  type Lab = NonNullable<typeof d>['laborers'][number];
  const laborers = (d?.laborers ?? []).map((l) => ({ ...l, morningHrs: l.shifts.Morning ?? 0, afternoonHrs: l.shifts.Afternoon ?? 0, eveningHrs: l.shifts.Evening ?? 0 }));
  const capWeek = (d?.capacity ?? []).filter((c) => c.week === d?.weeks[week]);
  const eff = d?.efficiency ?? [];
  const n = eff.length || 1;
  // Average turnaround is weighted by completed JOs, over branches that completed any (branches with none show "—").
  const doneN = eff.reduce((a, e) => a + e.completedJos, 0);
  const avgTurn = doneN ? eff.reduce((a, e) => a + (e.turnaroundDays ?? 0) * e.completedJos, 0) / doneN : null;
  type Eff = (typeof eff)[number];
  const sumE = (k: keyof Eff) => eff.reduce((a, e) => a + (Number(e[k]) || 0), 0);
  const wAvg = (js: Eff[], cnt: (e: Eff) => number, val: (e: Eff) => number | null) => { const t = js.reduce((a, e) => a + cnt(e), 0); return t ? js.reduce((a, e) => a + (val(e) ?? 0) * cnt(e), 0) / t : null; };
  const allOpen = eff.flatMap((e) => e.openList);
  const avgRow: Eff = { branch: 'Average (JOs summed)', morning: sumE('morning') / n, afternoon: sumE('afternoon') / n, evening: sumE('evening') / n, perShift: sumE('perShift') / n, completedJos: doneN, turnaroundDays: avgTurn,
    laborHours: sumE('laborHours'), josWorked: sumE('josWorked'), hoursPerJo: sumE('josWorked') ? sumE('laborHours') / sumE('josWorked') : null,
    openJos: allOpen.length, avgOpenDays: allOpen.length ? allOpen.reduce((a, o) => a + o.daysOpen, 0) / allOpen.length : null, oldestOpenDays: allOpen.length ? Math.max(...allOpen.map((o) => o.daysOpen)) : null,
    minorCompleted: sumE('minorCompleted'), majorCompleted: sumE('majorCompleted'), turnaroundMinor: wAvg(eff, (e) => e.minorCompleted, (e) => e.turnaroundMinor), turnaroundMajor: wAvg(eff, (e) => e.majorCompleted, (e) => e.turnaroundMajor),
    closedList: eff.flatMap((e) => e.closedList), openList: allOpen };
  const effRows = eff.length ? [...eff, avgRow] : [];
  const [effDrill, setEffDrill] = useState('');
  const [capDrill, setCapDrill] = useState('');
  const effSel = effRows.find((e) => e.branch === effDrill);
  const capSel = capWeek.find((c) => c.branch === capDrill);
  const joCols: ColumnDef<Eff['openList'][number]>[] = [{ accessorKey: 'joNo', header: 'JO no.', cell: (c) => <Link className="font-mono text-brand-600 hover:underline" to={`/repair/jo/${c.getValue<string>()}`}>{c.getValue<string>()}</Link> },
    { accessorKey: 'chassisNo', header: 'Chassis', cell: (c) => <span className="font-mono">{c.getValue<string>()}</span> }, { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge domain="jo" value={c.getValue<string>()} /> },
    { accessorKey: 'categories', header: 'Repair systems', cell: (c) => c.getValue<string[]>().join(', ') }, { accessorKey: 'isMajor', header: 'Category', cell: (c) => (c.getValue() ? <Badge tone="danger">Major</Badge> : 'Minor') },
    { accessorKey: 'daysOpen', header: 'Age (days)', meta: { align: 'right' } }, { accessorKey: 'laborHours', header: 'Labor h so far', meta: { align: 'right' } }];
  const sel = laborers.find((l) => l.worker === drill);
  const num = (k: string, header: string, dp = 1): ColumnDef<(typeof effRows)[number]> => ({ accessorKey: k, header, meta: { align: 'right' }, cell: (c) => (c.getValue<number | null>() == null ? <span className="text-muted" title="No job orders completed in the period">—</span> : c.getValue<number>().toFixed(dp)) });
  const capTot = capWeek.reduce((a, r) => ({ planned: a.planned + r.planned, available: a.available + r.available, req: a.req + r.requiredHeadcount, hc: a.hc + r.availableHeadcount, jos: a.jos + r.backlog, over: a.over + (r.overCapacity ? 1 : 0) }), { planned: 0, available: 0, req: 0, hc: 0, jos: 0, over: 0 });
  const labTot = laborers.reduce((a, l) => ({ hours: a.hours + l.hours, m: a.m + l.morningHrs, af: a.af + l.afternoonHrs, ev: a.ev + l.eveningHrs, earn: a.earn + l.earnings, jos: a.jos + l.completedJos }), { hours: 0, m: 0, af: 0, ev: 0, earn: 0, jos: 0 });
  const signed = (x: number, unit: string) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x)}${unit}`;
  const filters = (
    <Card className="mb-4"><div className="flex flex-wrap items-end gap-3">
      {tab !== 'capacity' && <>
        <Input label={tab === 'laborer' ? 'Pay period from' : 'From'} type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <Input label={tab === 'laborer' ? 'Pay period to' : 'To'} type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
      </>}
      <Select label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={branchOptions} />
      {tab === 'capacity' && <Input label="Week of" type="date" value={f.weekStart} onChange={(e) => { setF({ ...f, weekStart: e.target.value }); setWeek(0); }} />}
      {(f.branch || (tab !== 'capacity' && (f.from !== defFrom() || f.to !== todayManila()))) && <Button variant="ghost" onClick={() => setF({ ...f, from: defFrom(), to: todayManila(), branch: '' })}>Reset</Button>}
      {tab !== 'capacity' && <span className="pb-2 text-xs text-muted">Period in use: <b className="text-ink-2">{periodLabel}</b>{f.branch ? ` · ${f.branch}` : ' · all branches'}</span>}
    </div></Card>
  );
  return (
    <>
      <PageHeader title="Laborer, capacity & efficiency" description="Reporting built on job-order labor and completions. The laborer summary feeds payroll in the HRIS (export format pending confirmation)." />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'laborer', label: 'Laborer job summary' }, { id: 'capacity', label: 'Capacity planning' }, { id: 'eff', label: 'Efficiency' }]} />
      {filters}
      {tab === 'laborer' && <>
        <DataTable data={laborers} loading={data.isLoading} exportName="laborer-summary-payroll" emptyTitle="No labor logged in the pay period" emptyHint="Widen the pay period or choose another branch."
          footer={<span className="flex flex-wrap gap-x-5 gap-y-1"><span>Totals ({laborers.length} laborers{f.branch ? `, ${f.branch}` : ''}, {periodLabel})</span><span title="A job order shared by two laborers counts once in the distinct total">Completed JOs {d?.distinctCompletedJos ?? labTot.jos} distinct ({labTot.jos} laborer–JO pairs)</span><span>Hours {labTot.hours} (morning {labTot.m} · afternoon {labTot.af} · evening {labTot.ev})</span><span>Earnings {formatPhp(labTot.earn)}</span></span>}
          onRowClick={(r) => setDrill(r.worker)} columns={[
          { accessorKey: 'laborerId', header: 'Laborer ID', cell: (c) => <span className="font-mono">{c.getValue<string>()}</span> }, { accessorKey: 'worker', header: 'Laborer' }, { accessorKey: 'branch', header: 'Branch' },
          { accessorKey: 'workerType', header: 'Worker type', cell: (c) => <Badge tone={c.getValue() === 'Regular' ? 'info' : 'purple'} dot={false}>{c.getValue<string>()}</Badge> },
          { accessorKey: 'completedJos', header: 'Completed JOs', meta: { align: 'right' }, cell: (c) => <button className="font-medium text-brand-600 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-600" title="Show job orders" onClick={(e) => { e.stopPropagation(); setDrill(c.row.original.worker); }}>{c.getValue<number>()}</button> },
          { accessorKey: 'hours', header: 'Hours logged', meta: { align: 'right' } }, { accessorKey: 'morningHrs', header: 'Morning h', meta: { align: 'right' } }, { accessorKey: 'afternoonHrs', header: 'Afternoon h', meta: { align: 'right' } }, { accessorKey: 'eveningHrs', header: 'Evening h', meta: { align: 'right' } },
          { accessorKey: 'rate', header: 'Rate / hr', meta: { align: 'right' }, cell: (c) => { const rs = c.row.original.rates; return rs.length > 1
            ? <span className="flex flex-col items-end whitespace-nowrap" title="Blended: earnings ÷ hours. Each JO labor line keeps its own rate — click the laborer to see them."><span>{formatPhp(c.getValue<number>())} <span className="text-xs text-muted">blended</span></span><span className="text-xs text-muted">lines {rs.map((r) => formatPhp(r)).join(' / ')}</span></span>
            : formatPhp(c.getValue<number>()); } }, { accessorKey: 'earnings', header: 'Earnings (hrs × rate)', meta: { align: 'right' }, cell: (c) => <strong>{formatPhp(c.getValue<number>())}</strong> }]} />
        <p className="mt-2 text-xs text-muted">Earnings = hours logged × labor rate on each JO labor line; hours on in-progress JOs count toward the pay period. When a laborer has lines at different rates, Rate / hr is the blended rate (earnings ÷ hours) and the line rates are listed under it. Completed JOs per laborer = closed job orders the laborer logged hours on; the total counts each job order once (same count as the Efficiency tab). Shift windows: {String(setting('rm.shift_hours') ?? 'pending')}. Rate source, worker type master, overtime / premium rates, approval of logged hours before payroll and the HRIS file format are pending confirmation (sample values). Click a laborer to see the job orders and labor lines behind the totals.</p>
      </>}
      {tab === 'capacity' && <Stack>
        <div className="flex flex-wrap items-center gap-2">{(d?.weeks ?? []).map((w, i) => <Button key={w} size="sm" variant={i === week ? 'primary' : 'secondary'} onClick={() => setWeek(i)}>{i === 0 ? 'Week of' : `+${i} wk ·`} {formatDate(w)}</Button>)}
          <span className="text-xs text-muted">Headcount uses {d?.hoursPerLaborerWeek ?? setting('rm.hours_per_laborer_week') ?? 48} h / laborer / week <Badge tone="warning" dot={false}>proposed</Badge></span></div>
        <Card><CardHeader title={`Planned vs available laborer-hours · week of ${d?.weeks[week] ? formatDate(d.weeks[week]) : '—'}`} description="Bars: hours (left axis). Orange: open JO backlog on its own right-hand axis (current week)." />
          {/* Bars are drawn without the mount animation: the animated variant could stay at zero height (empty plot) when the tab mounts the chart. */}
          {capWeek.length ? <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={capWeek} barGap={2}><CartesianGrid stroke="#EEF2F6" vertical={false} /><XAxis dataKey="branch" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis yAxisId="h" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis yAxisId="j" orientation="right" allowDecimals={false} tick={{ fill: '#DC6803', fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip /><Legend formatter={(v) => <span className="text-ink-2">{v}</span>} />
            <Bar yAxisId="h" dataKey="planned" name="Planned hrs" fill="#0058A8" radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar yAxisId="h" dataKey="available" name="Available hrs" fill="#ADCFEE" radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar yAxisId="j" dataKey="backlog" name="Open JOs" fill="#DC6803" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
            : <p className="py-16 text-center text-sm text-muted">{data.isLoading ? 'Loading…' : 'No capacity figures for this week and branch.'}</p>}</Card>
        <DataTable data={capWeek} loading={data.isLoading} searchable={false} toolbar={<h3 className="text-[15px] font-semibold text-ink">Capacity by branch</h3>} exportName={`capacity-${d?.weeks[week] ?? ''}`} rowClassName={(r) => (r.overCapacity ? 'bg-danger-bg' : undefined)} onRowClick={(r) => setCapDrill(r.branch)}
          footer={<span className="flex flex-wrap gap-x-5 gap-y-1"><span>Total ({capWeek.length} branches)</span><span>Planned {capTot.planned} h</span><span>Available {capTot.available} h</span><span className={capTot.available - capTot.planned < 0 ? 'text-danger' : 'text-success'}>Gap {signed(capTot.available - capTot.planned, ' h')}</span><span>Headcount {capTot.req} required / {capTot.hc} available ({signed(capTot.hc - capTot.req, '')})</span><span>Open JOs {capTot.jos}</span><span>{capTot.over} over capacity</span></span>}
          columns={[
          { accessorKey: 'branch', header: 'Branch' }, { accessorKey: 'week', header: 'Week of', cell: (c) => formatDate(c.getValue<string>()) }, { accessorKey: 'planned', header: 'Planned hrs', meta: { align: 'right' } }, { accessorKey: 'available', header: 'Available hrs', meta: { align: 'right' } },
          { accessorKey: 'requiredHeadcount', header: 'Required headcount', meta: { align: 'right' } }, { accessorKey: 'availableHeadcount', header: 'Available headcount', meta: { align: 'right' } },
          { id: 'gap', header: 'Gap (hrs / heads)', meta: { align: 'right' }, cell: (c) => { const r = c.row.original; const g = r.available - r.planned; return <span className={cn('whitespace-nowrap font-medium', g < 0 ? 'text-danger' : 'text-success')} title="Available minus planned (negative = short)">{signed(g, ' h')} / {signed(r.availableHeadcount - r.requiredHeadcount, '')}</span>; } },
          { accessorKey: 'backlog', header: 'Open JOs', meta: { align: 'right' } },
          { accessorKey: 'overCapacity', header: 'Capacity', cell: (c) => (c.getValue() ? <Badge tone="danger">Over capacity</Badge> : <Badge tone="success">OK</Badge>) }]} />
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted"><span className="font-medium text-ink-2">Legend:</span><span className="flex items-center gap-1"><span className="inline-block size-3 rounded-sm border border-line bg-danger-bg" /> red row / <Badge tone="danger">Over capacity</Badge> = planned hours ≥ available hours</span><span className="flex items-center gap-1"><Badge tone="success">OK</Badge> = planned below available</span><span>Click a branch row for its open job orders and laborers.</span></div>
        <p className="text-xs text-muted">Gap = available − planned (negative = hours or laborers short). Open JOs = job orders not yet closed at the branch (Draft, Approved, Confirmed, Ongoing, On Hold); units that wait for the quality sign-off (TQS) have a JO already Closed by R&amp;M and are not counted, so Open JOs is lower than the number of units in Breakdown / In Repair. Planned hours this week = a sample base load + 8 h per open JO (proposed); forward weeks are sample planning figures until the workload source (JO estimates, scheduled work) is confirmed. Available headcount is a sample figure until the HRIS roster is connected.</p>
      </Stack>}
      {tab === 'eff' && <>
        <DataTable data={effRows} loading={data.isLoading} searchable={false} toolbar={<h3 className="text-[15px] font-semibold text-ink">Efficiency by branch and shift</h3>} exportName="efficiency-by-shift" rowClassName={(r) => (r === effRows[effRows.length - 1] && eff.length ? 'bg-surface-alt font-semibold' : undefined)} pageSize={50}
          onRowClick={(r) => setEffDrill(r.branch)} columns={[
          { accessorKey: 'branch', header: 'Branch' }, num('morning', 'Morning JOs / shift'), num('afternoon', 'Afternoon JOs / shift'), num('evening', 'Evening JOs / shift'), num('perShift', 'Avg JOs / shift'),
          { accessorKey: 'completedJos', header: 'JOs completed (range)', meta: { align: 'right' } }, num('turnaroundDays', 'Avg turnaround (days)'),
          // Review 1.2: Minor / Major split, laborer-hours, and open job orders with their age.
          { id: 'cat', header: 'Minor / Major (turnaround d)', meta: { align: 'right' }, cell: (c) => { const r = c.row.original; const t = (v: number | null) => (v == null ? '—' : v.toFixed(1)); return <span className="whitespace-nowrap">{r.minorCompleted} ({t(r.turnaroundMinor)}) / {r.majorCompleted} ({t(r.turnaroundMajor)})</span>; } },
          num('laborHours', 'Labor hours (range)', 0), num('hoursPerJo', 'Hours / JO worked'),
          { accessorKey: 'openJos', header: 'Open JOs', meta: { align: 'right' } }, num('avgOpenDays', 'Avg open age (d)'), num('oldestOpenDays', 'Oldest open (d)', 0)]} />
        <p className="mt-2 text-xs text-muted">Period: <b className="text-ink-2">{periodLabel}</b>. Shift windows: {String(setting('rm.shift_hours') ?? 'pending')} <Badge tone="warning" dot={false}>pending confirmation</Badge>. Average row = average across the branches shown (JOs completed summed; turnaround weighted by completed JOs).</p>
        <p className="mt-1 text-xs text-muted"><b>JOs completed</b> = job orders Closed by R&amp;M (or Closed by EIR Out) in the period. <b>Avg turnaround</b> = days from JO creation to Closed by R&amp;M for those JOs; “—” when none were completed. <b>JOs / shift</b> = average job orders worked per shift per working day at the branch, all laborers together (sample figures until the workload source is confirmed). <b>Hours / JO worked</b> = labor hours logged in the period ÷ job orders those hours were logged on (real labor lines). <b>Open JOs</b> and their age (days since created) are as of today, so slow repairs show even before they close. Minor / Major splits the completed JOs and their turnaround by repair category (TQS is the sign-off stage after Closed by R&amp;M, not a JO category). Targets per branch are not set yet (pending Delbros). Click a branch row for the job orders behind it.</p>
      </>}
      <Modal open={!!sel} onClose={() => setDrill('')} size="lg" title={sel ? `${sel.worker} (${sel.laborerId}) — job orders` : ''} description="Labor logged in the selected period. Open a JO for the audit trail.">
        {sel && <DataTable data={sel.jos as Lab['jos']} searchable={false} dense columns={[{ accessorKey: 'joNo', header: 'JO no.', cell: (c) => <Link className="font-mono text-brand-600 hover:underline" to={`/repair/jo/${c.getValue<string>()}`}>{c.getValue<string>()}</Link> },
          { accessorKey: 'chassisNo', header: 'Chassis', cell: (c) => <span className="font-mono">{c.getValue<string>()}</span> }, { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge domain="jo" value={c.getValue<string>()} /> }, { accessorKey: 'hours', header: 'Hours', meta: { align: 'right' } }, { accessorKey: 'closedAt', header: 'Closed', cell: (c) => (c.getValue() ? formatDate(c.getValue<string>()) : '—') }]} />}
        {/* Review 1.2: the labor lines with their own rate (explains a blended rate). */}
        {sel && <><h4 className="mb-2 mt-4 text-sm font-semibold text-ink">Labor lines</h4><DataTable data={sel.lines} searchable={false} dense columns={[{ accessorKey: 'joNo', header: 'JO no.', cell: (c) => <span className="font-mono">{c.getValue<string>()}</span> }, { accessorKey: 'date', header: 'Date', cell: (c) => formatDate(c.getValue<string>()) }, { accessorKey: 'shift', header: 'Shift' },
          { accessorKey: 'hours', header: 'Hours', meta: { align: 'right' } }, { accessorKey: 'rate', header: 'Line rate', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) }, { accessorKey: 'amount', header: 'Amount', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) }]}
          footer={<span className="flex gap-5"><span>{sel.hours} h</span><span>{formatPhp(sel.earnings)}</span></span>} /></>}
      </Modal>
      {/* Review 1.2: branch drill-downs — open job orders and known laborers (Capacity), closed and open job orders (Efficiency). */}
      <Modal open={!!capSel} onClose={() => setCapDrill('')} size="lg" title={capSel ? `${capSel.branch} — open job orders and laborers` : ''} description="Current-week workload behind the capacity row.">
        {capSel && <Stack>
          <p className="text-sm text-ink-2">Planned {capSel.planned} h = base load {capSel.baseLoad} h (sample, until the workload source is confirmed){capSel.joLoad ? ` + ${capSel.joLoad} h for ${capSel.backlog} open JOs at 8 h each (proposed)` : ''}. Available {capSel.available} h = {capSel.availableHeadcount} laborers × {d?.hoursPerLaborerWeek ?? 48} h.</p>
          <DataTable data={capSel.openJos} searchable={false} dense emptyTitle="No open job orders at this branch" columns={joCols} />
          <p className="text-sm text-ink-2"><b>Laborers seen on this branch's job orders:</b> {capSel.crew.join(', ') || 'none yet'}. <span className="text-muted">Available headcount ({capSel.availableHeadcount}) is a sample figure until the HRIS roster (names, leave, shift) is connected.</span></p>
        </Stack>}
      </Modal>
      <Modal open={!!effSel} onClose={() => setEffDrill('')} size="lg" title={effSel ? `${effSel.branch} — job orders behind the efficiency row` : ''} description={`Period ${periodLabel}`}>
        {effSel && <Stack>
          <h4 className="text-sm font-semibold text-ink">Completed in the period ({effSel.closedList.length})</h4>
          <DataTable data={effSel.closedList} searchable={false} dense emptyTitle="No job orders completed in the period" columns={[{ accessorKey: 'joNo', header: 'JO no.', cell: (c) => <Link className="font-mono text-brand-600 hover:underline" to={`/repair/jo/${c.getValue<string>()}`}>{c.getValue<string>()}</Link> },
            { accessorKey: 'chassisNo', header: 'Chassis', cell: (c) => <span className="font-mono">{c.getValue<string>()}</span> }, { accessorKey: 'isMajor', header: 'Category', cell: (c) => (c.getValue() ? <Badge tone="danger">Major</Badge> : 'Minor') },
            { accessorKey: 'createdAt', header: 'Created', cell: (c) => formatDate(c.getValue<string>()) }, { accessorKey: 'closedAt', header: 'Closed by R&M', cell: (c) => formatDate(c.getValue<string>()) },
            { accessorKey: 'days', header: 'Turnaround (days)', meta: { align: 'right' }, cell: (c) => c.getValue<number>().toFixed(1) }, { accessorKey: 'laborHours', header: 'Labor h', meta: { align: 'right' } }]} />
          <h4 className="text-sm font-semibold text-ink">Still open ({effSel.openList.length})</h4>
          <DataTable data={effSel.openList} searchable={false} dense emptyTitle="No open job orders" columns={joCols} />
        </Stack>}
      </Modal>
    </>
  );
}
