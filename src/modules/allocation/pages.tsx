import { Fragment, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Camera, CircleCheck, FileText, ParkingSquare, Plus, Printer, Receipt, RefreshCw, Search, X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { FLEET_OTHER_STATUSES, REPAIR_CATEGORIES, regIsNear, regIsValid, formatDate, formatDateTime, formatPhp, manilaDay, todayManila, type InspectionLine, type RepairCategory } from '../../lib/shared';
import {
  Badge, Banner, Button, Card, CardHeader, Checkbox, ConfirmDialog, DataTable, EmptyState, FormGrid, FormSection, InspectionChecklist, Input, KeyValueGrid, KpiTile, Modal, MoneyInput,
  PageHeader, ReadField, Segmented, Select, SignaturePad, Stack, StatusBadge, Tabs, Textarea, cn, type ColumnDef,
} from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, fieldError, useAction, useData, useRefLookups } from '../../shared/hooks';
import { DocFooter, DocHeader, PrintPreview } from '../../shared/print';

const REGIONS = ['Luzon', 'Visayas', 'Mindanao'].map((r) => ({ value: r, label: r }));
const STATUSES = ['Available', 'Allocated', 'On Hire', 'Rescue', 'Breakdown', 'In Repair', 'Parked'];
const OTHER = FLEET_OTHER_STATUSES; // V1.4 row 13: same mapping as the Dashboard "Other" tile
const CATS = ['TQS', 'Roadworthy', 'Minor Repair', 'Major Repair'] as const;
const today = todayManila; // review 1.1: "today" is the Manila day (the UTC date was a day behind before 08:00)
const regTone = (s?: string) => (s === 'Expired' || s === 'Missing' ? 'danger' : regIsNear(s) ? 'warning' : 'success');
const monTone = (s?: string) => (s === 'Cleared' ? 'success' : s === 'Blocked' ? 'danger' : 'warning');

/** Region filter limits the branch list to that island group; blank = nationwide. */
function useRegionBranches(region: string) {
  const { ref, branchOptions } = useRefLookups();
  const ISL: Record<string, string> = { NCR: 'Luzon', 'North Luzon': 'Luzon', 'South Luzon': 'Luzon', Visayas: 'Visayas', Mindanao: 'Mindanao' };
  return region ? branchOptions.filter((o) => ISL[ref?.branches.find((b) => b.code === o.value)?.region ?? ''] === region) : branchOptions;
}

// ── SCR-19 Chassis Allocation Tracking ─────────────────────────────────────
export function AllocationPage() {
  const [sp] = useSearchParams();
  const [tab, setTab] = useState(sp.get('tab') === 'requests' ? 'requests' : 'board');
  const [f, setF] = useState({ region: sp.get('region') ?? '', branch: sp.get('branch') ?? '', type: '' });
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [cat, setCat] = useState(sp.get('cat') ?? '');
  const [ready, setReady] = useState(sp.get('ready') === '1');
  const [regBlocked, setRegBlocked] = useState(sp.get('reg') === 'blocked');
  const [own, setOwn] = useState<'' | 'company' | 'partner'>(''); // staff review 1.2: ownership filter (BR-13)
  const data = useQuery({ queryKey: ['alloc', f], queryFn: () => api.alloc.board(f), refetchInterval: 60_000 });
  const { eqOptions, eqName, branchOptions, setting, userName } = useRefLookups();
  const regionBranches = useRegionBranches(f.region);
  const { can } = useAuth();
  const canAlloc = can('alloc.board', 'add'), canEdit = can('alloc.board', 'edit'), canSign = can('chassis.status', 'approve');
  type Row = NonNullable<typeof data.data>[number];
  const [alloc, setAlloc] = useState<Row | null>(null);
  const [fromReq, setFromReq] = useState<{ reqNo: string; clientCode: string; contractNo: string; targetPickupDate: string } | null>(null);
  const [sign, setSign] = useState<Row | null>(null);
  const [transfer, setTransfer] = useState<Row | null>(null);
  const release = useAction((no: string) => api.alloc.release(no), { success: 'Allocation released' });
  const all = data.data ?? [];
  const isBlocked = (r: Row) => r.status === 'Available' && (r.regState === 'Expired' || r.regState === 'Missing');
  const isCompany = (r: Row) => r.owner === 'DELWATER';
  const rows = all.filter((r) => (!status || (status === 'Other' ? OTHER.includes(r.status) : r.status === status)) && (!ready || r.readyForSignoff) && (!cat || r.yardCategory === cat) && (!regBlocked || isBlocked(r)) && (!own || (own === 'company') === isCompany(r)));
  const companyN = all.filter(isCompany).length, partnerN = all.length - companyN;
  const pct = (n: number) => (all.length ? Math.round((n / all.length) * 100) : 0);
  const count = (s: string) => all.filter((r) => (s === 'Other' ? OTHER.includes(r.status) : r.status === s)).length;
  const releasable = all.filter((r) => r.status === 'Available' && !isBlocked(r)).length;
  const blocked = all.filter(isBlocked).length;
  const filtered = !!(f.region || f.branch || f.type);
  // Board fits the page at 1600 px: related fields share a cell (muted second line). Flat text fields keep the CSV export complete.
  type BRow = Row & { statusCat: string; clientContract: string; allocInfo: string; regInfo: string; ownership: string };
  const boardRows: BRow[] = rows.map((r) => ({ ...r,
    ownership: isCompany(r) ? 'Company-owned' : `Partner-owned · ${r.owner}${r.ownerEquipmentNo ? ` (${r.ownerEquipmentNo})` : ''}`,
    statusCat: [r.status, r.yardCategory, r.pendingTransferTo && `transfer to ${r.pendingTransferTo} pending`].filter(Boolean).join(' · '),
    clientContract: [r.clientName, r.contractNo, r.contractType].filter(Boolean).join(' · '),
    allocInfo: r.allocation ? `Allocated ${formatDate(r.allocation.date)}${r.allocatedBy ? ` by ${userName(r.allocatedBy)}` : ''} · pickup ${formatDate(r.allocation.targetPickupDate)}${r.allocation.expectedReturn ? ` · return ${formatDate(r.allocation.expectedReturn)}` : ''}${r.allocation.requestNo ? ` · ${r.allocation.requestNo}` : ''}${r.requestContact ? ` · contact ${r.requestContact}` : ''}` : '',
    regInfo: `${r.regState ?? ''}${r.registration ? ` · exp. ${formatDate(r.registration.expiryDate)}` : ' · no record'}` }));
  const catTone = (v: string) => (v === 'Roadworthy' ? 'success' : v === 'TQS' ? 'info' : v === 'Major Repair' ? 'danger' : 'warning');
  const cols: ColumnDef<BRow>[] = [
    { accessorKey: 'chassisNo', header: 'Chassis', cell: (c) => <span className="flex flex-col"><Link to={`/chassis/${c.getValue()}`} className="whitespace-nowrap font-mono font-medium text-brand-700 hover:underline">{c.getValue<string>()}</Link><span className="whitespace-nowrap text-xs text-muted">{eqName(c.row.original.chassisType)}</span><span className="whitespace-nowrap text-xs text-muted" title="Owner (BR-13)">{isCompany(c.row.original) ? 'Company-owned' : <>Partner-owned · <b className="font-medium text-ink-2">{c.row.original.owner}</b></>}</span></span> },
    { accessorKey: 'branchCode', header: 'Branch', cell: (c) => <span className="flex flex-col whitespace-nowrap">{c.getValue<string>()}<span className="text-xs text-muted">{c.row.original.region}</span></span> },
    { accessorKey: 'statusCat', header: 'Status / category', meta: { nowrap: true }, cell: (c) => { const r = c.row.original; return <span className="flex flex-col items-start gap-1"><StatusBadge domain="chassis" value={r.status} />{r.yardCategory && <Badge tone={catTone(r.yardCategory)} dot={false}>{r.yardCategory}</Badge>}{r.pendingTransferTo && <Badge tone="info" dot={false}>→ {r.pendingTransferTo} pending</Badge>}</span>; } },
    { accessorKey: 'clientContract', header: 'Client / contract', meta: { wrap: true }, cell: (c) => { const r = c.row.original; return r.clientName || r.contractNo ? <span className="flex flex-col items-start gap-0.5"><span>{r.clientName ?? '—'}</span>{r.contractNo && <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted"><span className="font-mono">{r.contractNo}</span>{r.contractType && <Badge tone="neutral" dot={false}>{r.contractType}</Badge>}</span>}</span> : <span className="text-muted">—</span>; } },
    // Review 1.1: request number first (links the board to the pipeline), then allocation date, target pickup and expected return; registration conflicts are flagged here.
    { accessorKey: 'allocInfo', header: 'Allocation', meta: { nowrap: true }, cell: (c) => { const r = c.row.original; const a = r.allocation; if (!a) return <span className="text-muted">—</span>;
      const exp = r.registration?.expiryDate; const regBad = r.regState === 'Expired' || r.regState === 'Missing'; const returnAfterExp = !regBad && !!exp && !!a.expectedReturn && a.expectedReturn >= manilaDay(exp);
      return <span className="flex flex-col"><span className="font-mono text-xs font-medium">{a.requestNo ?? 'Ad-hoc (no request)'}</span><span>Allocated {formatDate(a.date)}</span><span className="text-xs text-muted">Pickup {formatDate(a.targetPickupDate)}{a.expectedReturn ? ` · return ${formatDate(a.expectedReturn)}` : ''}</span>
        {/* Staff review 1.2: who allocated, and the client's pickup contact from the unit request. */}
        <span className="text-xs text-muted">By {r.allocatedBy ? userName(r.allocatedBy) : '—'}{r.requestedBy ? ` · requested by ${userName(r.requestedBy)}` : ''}</span>
        {r.requestContact && <span className="text-xs text-muted">Contact {r.requestContact}</span>}
        {!r.typeOnContract && <span className="text-xs font-medium text-warning" title="Entitlement rule pending confirmation">Type not rated on {r.contractNo} — check entitlement</span>}
        {regBad &&<span className="text-xs font-medium text-danger">OR/CR expired after allocation — renew before Gate Out</span>}
        {returnAfterExp && <span className="text-xs font-medium text-warning">Return is after OR/CR expiry ({formatDate(exp)})</span>}</span>; } },
    { accessorKey: 'daysInStatus', header: 'Days in status', meta: { align: 'right' }, cell: (c) => <span className={cn(c.row.original.status === 'Available' && c.getValue<number>() > Number(setting('alo.idle_days_threshold') ?? 30) && 'font-semibold text-warning')} title={c.row.original.status === 'Available' && c.getValue<number>() > Number(setting('alo.idle_days_threshold') ?? 30) ? 'Idle ageing — Available longer than the idle threshold' : undefined}>{c.getValue<number>()}</span> },
    { accessorKey: 'regInfo', header: 'Reg. (OR/CR)', meta: { nowrap: true }, cell: (c) => { const r = c.row.original; return <span className="flex flex-col items-start gap-0.5"><Badge tone={regTone(r.regState)} dot={false}>{r.regState === 'Expired' || r.regState === 'Missing' ? `${r.regState} · blocked` : r.regState}</Badge><span className="text-xs text-muted">{r.registration ? `Exp. ${formatDate(r.registration.expiryDate)}` : 'No record'}</span></span>; } },
    { id: 'act', header: 'Actions', meta: { align: 'right' }, cell: (c) => {
      const r = c.row.original;
      if (r.status === 'Available') return <span className="flex justify-end gap-1">
        {canAlloc && <Button size="sm" variant="secondary" disabled={isBlocked(r) || !!r.pendingTransferTo} title={isBlocked(r) ? 'Registration / OR-CR expired or missing — cannot be allocated' : undefined} onClick={() => setAlloc(r)}>Allocate</Button>}
        {canEdit && !r.pendingTransferTo && <Button size="sm" variant="ghost" aria-label={`Transfer ${r.chassisNo} to another branch`} title="Cross-branch transfer" icon={<ArrowRightLeft className="size-4" />} onClick={() => setTransfer(r)}>Transfer</Button>}
      </span>;
      // Staff review 1.2: "Release allocation" (returns the unit to Available) — not the Gate Out "release to driver".
      if (r.status === 'Allocated' && canEdit) return <span className="flex justify-end"><Button size="sm" variant="secondary" loading={release.isPending} title="Cancel this allocation — the unit goes back to Available" onClick={() => release.mutate(r.chassisNo)}>Release allocation</Button></span>;
      if (r.readyForSignoff && canSign) return <span className="flex justify-end"><Button size="sm" variant="success" icon={<CircleCheck className="size-4" />} onClick={() => setSign(r)}>Sign off</Button></span>;
      if (r.readyForSignoff) return <span className="flex justify-end"><Badge tone="success" dot={false}>Awaiting sign-off</Badge></span>;
      return null;
    } },
  ];
  const tile = (s: string) => <KpiTile key={s} label={s} value={count(s)} onClick={() => { setStatus(status === s ? '' : s); setReady(false); }} tone={s === 'Breakdown' ? 'danger' : status === s ? 'success' : undefined} />;
  return (
    <>
      <PageHeader title="Chassis allocation"
        description="Allocation tracking for client unit requests and the live availability view used to decide what can be released. Figures re-read on every transaction and every 60 s."
        actions={<><span className="self-center text-xs text-muted">As of {data.dataUpdatedAt ? formatDateTime(new Date(data.dataUpdatedAt).toISOString()) : '—'}</span><Link to="/allocation/dcir" className="inline-flex items-center gap-1.5 self-center rounded-lg px-2 py-1.5 text-sm font-medium text-brand-700 hover:bg-surface-alt"><FileText className="size-4" />Open DCIR</Link><Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => data.refetch()}>Refresh</Button></>} />
      {!canAlloc && <Banner className="mb-4" tone="info" title="View only">Your role can view availability. Allocation, release and transfer are done by the Deputy Yard Manager / Operations Manager; sign-off by roles with chassis-status approval (role matrix pending confirmation).</Banner>}
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'board', label: 'Availability board' }, { id: 'requests', label: 'Client unit requests (pipeline)' }]} />
      {tab === 'requests' ? <UnitRequestsPanel canAdd={canAlloc} canEdit={canEdit} onFind={(r) => { setF({ region: '', branch: r.branchCode, type: r.equipmentType }); setStatus('Available'); setReady(false); setCat(''); setRegBlocked(false); setFromReq({ reqNo: r.reqNo, clientCode: r.clientCode, contractNo: r.contractNo, targetPickupDate: r.targetPickupDate }); setTab('board'); }} /> : (
        <>
          <p className="mb-2 text-xs text-muted">Tiles count the fleet {filtered ? 'for the selected region / branch / type' : 'nationwide (all branches in your scope)'} — the status filter does not change them. Fleet total {all.length} is the same figure as the Chassis master, DCIR and Executive dashboard.</p>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5 xl:grid-cols-10">
            <KpiTile label="Fleet" value={all.length} onClick={() => { setStatus(''); setReady(false); setCat(''); setRegBlocked(false); setOwn(''); }} />
            {STATUSES.map(tile)}{tile('Other')}
            <KpiTile label="Ready for sign-off" value={all.filter((r) => r.readyForSignoff).length} tone="success" onClick={() => { setReady((x) => !x); setStatus(''); }} />
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Repair category</span>
            {CATS.map((k) => <button key={k} onClick={() => setCat(cat === k ? '' : k)} className={cn('rounded-full border px-3 py-1', cat === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface')}>{k} <b className="tabular">{all.filter((r) => r.yardCategory === k).length}</b></button>)}
            <span className="text-xs text-muted">TQS = repaired, awaiting sign-off</span>
            {/* Staff review 1.2: ownership split (BR-13, about 70/30) — click to filter. */}
            <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-muted">Ownership</span>
            {([['company', 'Company-owned', companyN], ['partner', 'Partner-owned', partnerN]] as const).map(([k, label, n]) => <button key={k} onClick={() => setOwn(own === k ? '' : k)} className={cn('rounded-full border px-3 py-1', own === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface')}>{label} <b className="tabular">{n}</b> <span className="text-xs text-muted">({pct(n)}%)</span></button>)}
            <span className="text-xs text-muted">Target about 70 / 30 (BR-13)</span>
          </div>
          {!data.isLoading && releasable === 0 && <Banner className="mb-4" tone="danger" title="No chassis available for allocation">No Available chassis with current registration {filtered ? 'match the selected region / branch / type' : 'in your scope'}. Try another branch in the same region, request a cross-branch transfer, or check units awaiting sign-off.</Banner>}
          {blocked > 0 && <Banner className="mb-4" tone="warning" title={`${blocked} Available unit(s) blocked by registration / OR-CR`} actions={<Button size="sm" variant="secondary" onClick={() => { setRegBlocked(!regBlocked); setStatus(''); }}>{regBlocked ? 'Show all' : 'Show them'}</Button>}>Expired or missing registration blocks Allocate and Gate Out. Registration expiring within {String(setting('alo.reg_warn_days') ?? 14)} days shows a warning that must be acknowledged (rule pending confirmation).</Banner>}
          {data.error && <Banner className="mb-4" tone="danger" title="Could not load the board">{errMessage(data.error)}</Banner>}
          <DataTable data={boardRows} loading={data.isLoading} columns={cols} exportName="allocation-board" emptyTitle={status === 'Available' ? 'No available chassis match the filters' : 'No chassis matching filter'} emptyHint="Change the region, branch or type filter."
            toolbar={<>
              <Select aria-label="Region" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value, branch: '' })} placeholder="Nationwide (all regions)" options={REGIONS} />
              <Select aria-label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={regionBranches} />
              <Select aria-label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="All types" options={eqOptions} />
              <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={[...STATUSES, 'Other'].map((s) => ({ value: s, label: s === 'Other' ? 'Other (New, Sold, Killed…)' : s }))} />
              {ready && <Badge tone="success">Showing: ready for sign-off</Badge>}
              {cat && <Badge tone="info">Category: {cat}</Badge>}
              {regBlocked && <Badge tone="danger">Registration blocked</Badge>}
              {own && <Badge tone="info">{own === 'company' ? 'Company-owned' : 'Partner-owned'} <button className="ml-1 underline" onClick={() => setOwn('')}>clear</button></Badge>}
              {fromReq && <Badge tone="info">For request {fromReq.reqNo} <button className="ml-1 underline" onClick={() => setFromReq(null)}>clear</button></Badge>}
            </>} />
          {/* Review 1.1: legend for the colours used on the board. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="font-medium text-ink-2">Legend</span>
            <span><b className="text-warning">Orange days</b> = Available for more than {String(setting('alo.idle_days_threshold') ?? 30)} days (idle ageing, listed on the DCIR)</span>
            <span><Badge tone="danger">Breakdown</Badge> red = unroadworthy, needs a job order</span>
            <span>Reg.: <Badge tone="success" dot={false}>Current</Badge> <Badge tone="warning" dot={false}>Expiring / Renewal In Progress</Badge> warning to acknowledge · <Badge tone="danger" dot={false}>Expired · blocked</Badge> cannot be allocated or leave the gate</span>
            <span>Days in status = whole days since the last status change (allocation, actual gate out / in, or repair start) — the same count as Gate In “Days on hire”</span>
            <span><b className="text-ink-2">Release allocation</b> = cancel the reservation (unit back to Available); handing units to the driver is done at Gate Out</span>
            <span>Click a chassis number for its record (condition, history); <Link to="/allocation/dcir" className="text-brand-700 hover:underline">DCIR</Link> for the daily roll-up</span>
          </div>
        </>
      )}
      {alloc && <AllocateDialog row={alloc} preset={fromReq} onClose={() => setAlloc(null)} onDone={() => { setAlloc(null); setFromReq(null); }} />}
      {sign && <SignoffDialog row={sign} onClose={() => setSign(null)} />}
      {transfer && <TransferDialog row={transfer} branchOptions={branchOptions} onClose={() => setTransfer(null)} />}
    </>
  );
}

type BoardRow = Awaited<ReturnType<typeof api.alloc.board>>[number];

function AllocateDialog({ row, preset, onClose, onDone }: { row: BoardRow; preset: { reqNo: string; clientCode: string; contractNo: string; targetPickupDate: string } | null; onClose: () => void; onDone: () => void }) {
  const clients = useData(['alloc-eligible'], () => api.alloc.eligibleClients());
  const reqs = useData(['unit-requests', 'open'], () => api.alloc.unitRequests({}));
  const { eqName } = useRefLookups();
  const [a, setA] = useState({ clientCode: preset?.clientCode ?? '', contractNo: preset?.contractNo ?? '', targetPickupDate: preset?.targetPickupDate ?? today(), expectedReturn: '', requestNo: preset?.reqNo ?? '', acknowledgeRegWarning: false });
  const doAlloc = useAction(() => api.alloc.allocate({ chassisNo: row.chassisNo, ...a, requestNo: a.requestNo || undefined }), { success: `Chassis ${row.chassisNo} allocated`, onSuccess: onDone });
  const cl = clients.data?.find((c) => c.clientCode === a.clientCode);
  const ct = cl?.contracts.find((k) => k.contractNo === a.contractNo);
  const openReqs = (reqs.data ?? []).filter((r) => r.clientCode === a.clientCode && r.equipmentType === row.chassisType && ['Open', 'Partially Allocated'].includes(r.status));
  const near = regIsNear(row.regState);
  const err = (k: string) => fieldError(doAlloc.error, k);
  return (
    <Modal open onClose={onClose} title={`Allocate ${row.chassisNo}`} description={`${eqName(row.chassisType)} · ${row.branchCode} (${row.region})`} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={doAlloc.isPending} disabled={!a.clientCode || !a.contractNo || !a.targetPickupDate || (near && !a.acknowledgeRegWarning)} onClick={() => doAlloc.mutate(undefined)}>Allocate</Button></>}>
      <Stack>
        {near && <Banner tone="warning" title="Registration expires soon">OR/CR expires {formatDate(row.registration?.expiryDate)}. The unit can be allocated, but renewal must be completed before Gate Out.</Banner>}
        {!clients.isLoading && !clients.data?.length && <Banner tone="danger">No eligible clients (accredited, active, no credit hold, with an active contract).</Banner>}
        <FormGrid>
          <Select label="Client" required value={a.clientCode} error={err('clientCode')} onChange={(e) => setA({ ...a, clientCode: e.target.value, contractNo: '', requestNo: '' })} placeholder="Select" hint="Only accredited, active clients without credit hold (same gate as New EWA)"
            options={(clients.data ?? []).map((c) => ({ value: c.clientCode, label: `${c.clientCode} — ${c.clientName}` }))} />
          <Select label="Contract" required value={a.contractNo} error={err('contractNo')} onChange={(e) => setA({ ...a, contractNo: e.target.value })} placeholder={a.clientCode ? 'Select' : 'Select a client first'} options={(cl?.contracts ?? []).map((k) => ({ value: k.contractNo, label: `${k.contractNo} (${k.contractType})` }))} />
          <ReadField label="Contract type">{ct ? <Badge tone="neutral" dot={false}>{ct.contractType}</Badge> : <span className="text-sm text-muted">Select a contract</span>}</ReadField>
          <ReadField label="Monetary requirement">{ct ? <span title={ct.monetary.note}><Badge tone={monTone(ct.monetary.status)}>{ct.monetary.status}</Badge> <span className="text-xs text-muted">{ct.monetary.note}</span></span> : <span className="text-sm text-muted">Select a contract</span>}</ReadField>
          <Select label="Client unit request" value={a.requestNo} error={err('requestNo')} onChange={(e) => setA({ ...a, requestNo: e.target.value, expectedReturn: a.expectedReturn || openReqs.find((r) => r.reqNo === e.target.value)?.expectedReturn || '' })} placeholder={!a.clientCode ? 'Select a client first' : openReqs.length ? 'None (ad-hoc allocation)' : 'No open request for this client / type'} options={openReqs.map((r) => ({ value: r.reqNo, label: `${r.reqNo} · ${r.allocated.length}/${r.qty} · pickup ${formatDate(r.targetPickupDate)}` }))} />
          <Input label="Target pickup date" required type="date" min={today()} value={a.targetPickupDate} error={err('targetPickupDate')} onChange={(e) => setA({ ...a, targetPickupDate: e.target.value })} />
          <Input label="Expected return (optional)" type="date" min={a.targetPickupDate} value={a.expectedReturn} error={err('expectedReturn')} onChange={(e) => setA({ ...a, expectedReturn: e.target.value })} />
        </FormGrid>
        {ct && !ct.equipmentTypes.includes(row.chassisType) && <Banner tone="warning" title="Type not rated on this contract">{eqName(row.chassisType)} has no rate on {ct.contractNo}. Check the client's entitlement before allocating (rule pending confirmation).</Banner>}
        {ct && ct.usage.total + (a.requestNo ? 0 : 1) > ct.usage.contracted &&<Banner tone="warning" title="Over the contracted units">{ct.contractNo}: {ct.usage.onHire} on hire + {ct.usage.allocated} allocated + {ct.usage.requested} still requested, against {ct.usage.contracted} contracted. This allocation goes over (rule pending confirmation).</Banner>}
        {near && <Checkbox label="I acknowledge the registration near-expiry warning" checked={a.acknowledgeRegWarning} onChange={(e) => setA({ ...a, acknowledgeRegWarning: e.target.checked })} />}
        <p className="text-xs text-muted">Allocation reserves the chassis (status Allocated) for this client and contract; Gate Out against the client's EWA releases it.</p>
      </Stack>
    </Modal>
  );
}

function SignoffDialog({ row, onClose }: { row: BoardRow; onClose: () => void }) {
  const [remarks, setRemarks] = useState('');
  const go = useAction(() => api.alloc.signoff(row.chassisNo, remarks), { success: `${row.chassisNo} signed off — now Available`, onSuccess: onClose });
  const regOk = regIsValid(row.regState);
  return (
    <Modal open onClose={onClose} title={`Breakdown → Available sign-off · ${row.chassisNo}`} description="Manual sign-off by an authorised user. Recorded in the chassis status history and audit log."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" loading={go.isPending} disabled={!regOk || !remarks.trim()} onClick={() => go.mutate(undefined)}>Sign off as Available</Button></>}>
      <Stack>
        <KeyValueGrid cols={2} items={[
          { label: 'Current status', value: <StatusBadge domain="chassis" value={row.status} /> }, { label: 'Repair category', value: row.yardCategory ?? '—' },
          { label: 'Open job orders', value: row.openJoNo ? <Badge tone="danger">{row.openJoNo}</Badge> : <Badge tone="success">None — all closed</Badge> },
          { label: 'Registration / OR-CR', value: <Badge tone={regTone(row.regState)}>{row.regState} · {formatDate(row.registration?.expiryDate)}</Badge> },
        ]} />
        {!regOk && <Banner tone="danger">Registration / OR-CR must be current before sign-off. Renew it in Regulatory first.</Banner>}
        <Textarea label="Sign-off remarks" required value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Repairs verified, test run OK" error={fieldError(go.error, 'remarks')} />
      </Stack>
    </Modal>
  );
}

function TransferDialog({ row, branchOptions, onClose }: { row: BoardRow; branchOptions: { value: string; label: string }[]; onClose: () => void }) {
  const [v, setV] = useState({ to: '', reason: '' });
  const go = useAction(() => api.alloc.requestTransfer(row.chassisNo, v.to, v.reason), { success: (r) => `Transfer requested — ${r.workflowId} sent to the Operations Manager`, onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Cross-branch transfer · ${row.chassisNo}`} description={`From ${row.branchCode}. The Operations Manager approves in the Inbox; the chassis moves branch on approval.`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={go.isPending} disabled={!v.to || !v.reason.trim()} onClick={() => go.mutate(undefined)}>Request transfer</Button></>}>
      <Stack>
        <Select label="Destination branch" required value={v.to} error={fieldError(go.error, 'toBranch')} onChange={(e) => setV({ ...v, to: e.target.value })} placeholder="Select" options={branchOptions.filter((o) => o.value !== row.branchCode)} />
        <Textarea label="Reason" required value={v.reason} error={fieldError(go.error, 'reason')} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="e.g. Fill request UR-000030 at CEB" />
      </Stack>
    </Modal>
  );
}

type ReqRow = Awaited<ReturnType<typeof api.alloc.unitRequests>>[number];

function UnitRequestsPanel({ canAdd, canEdit, onFind }: { canAdd: boolean; canEdit: boolean; onFind: (r: ReqRow) => void }) {
  const [f, setF] = useState({ status: '', region: '' });
  const data = useData(['unit-requests', f], () => api.alloc.unitRequests(f));
  const { eqName, userName } = useRefLookups();
  const branchOpts = useRegionBranches('');
  const clients = useData(['alloc-eligible'], () => api.alloc.eligibleClients(), canAdd);
  const [open, setOpen] = useState(false);
  const [cancel, setCancel] = useState<ReqRow | null>(null);
  const [detail, setDetail] = useState<string | null>(null); // staff review 1.2: request detail view
  const { user } = useAuth();
  const blank = () => ({ clientCode: '', contractNo: '', branchCode: '', equipmentType: '', qty: 1, targetPickupDate: today(), expectedReturn: '', contactName: '', contactPhone: '', requiredParts: '', notes: '' });
  const [v, setV] = useState(blank);
  // Review 1.1: the form resets (and "today" is re-read in Manila time) each time it opens — no stale past date.
  useEffect(() => { if (open) setV(blank()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = useAction(() => api.alloc.createUnitRequest(v), { success: (r) => `Unit request ${r.reqNo} created — status Open, now in the pipeline`, onSuccess: () => { setOpen(false); setV(blank()); } });
  const doCancel = useAction((reason: string) => api.alloc.cancelUnitRequest(cancel!.reqNo, reason), { success: 'Unit request cancelled', onSuccess: () => setCancel(null) });
  const cl = clients.data?.find((c) => c.clientCode === v.clientCode);
  const ct = cl?.contracts.find((k) => k.contractNo === v.contractNo);
  const board = useData(['alloc', 'request-preview'], () => api.alloc.board({}), open);
  const brRegion = (board.data ?? []).find((r) => r.branchCode === v.branchCode)?.region;
  const okUnit = (r: BoardRow) => r.status === 'Available' && r.chassisType === v.equipmentType && r.regState !== 'Expired' && r.regState !== 'Missing';
  const branchAvail = (board.data ?? []).filter((r) => r.branchCode === v.branchCode && r.status === 'Available' && r.regState !== 'Expired' && r.regState !== 'Missing').length;
  const returnBeforePickup = !!v.expectedReturn && !!v.targetPickupDate && v.expectedReturn < v.targetPickupDate;
  const overUnits = !!ct && ct.usage.total + (v.qty || 0) > ct.usage.contracted;
  const { setting: unitSetting } = useRefLookups();
  const blockOver = unitSetting('alo.contract_unit_limit') === 'block'; // V1.4 row 51 (proposed setting)
  const rate = ct?.rates?.find((r) => r.equipmentType === v.equipmentType); // V1.4 row 20 (ALO-001)
  const detailRow = detail ? (data.data ?? []).find((r) => r.reqNo === detail) : undefined;
  const hereN = (board.data ?? []).filter((r) => okUnit(r) && r.branchCode === v.branchCode).length;
  const elsewhereN = (board.data ?? []).filter((r) => okUnit(r) && r.branchCode !== v.branchCode && r.region === brRegion).length;
  const repairN = (board.data ?? []).filter((r) => r.chassisType === v.equipmentType && r.branchCode === v.branchCode && (r.status === 'Breakdown' || r.status === 'In Repair')).length;
  const afterExpiry = !!ct?.expiryDate && !!v.targetPickupDate && v.targetPickupDate > ct.expiryDate;
  const pastDate = !!v.targetPickupDate && v.targetPickupDate < today();
  const need = [!v.clientCode && 'client', !v.contractNo && 'contract', !v.branchCode && 'pickup branch', !v.equipmentType && 'chassis type', !(v.qty >= 1) && 'quantity (at least 1)', !v.targetPickupDate && 'target pickup date'].filter(Boolean) as string[];
  const err = (k: string) => fieldError(create.error, k);
  return (
    <>
      <p className="mb-3 text-sm text-muted">Full pipeline of client unit requests (not a fixed weekly cycle): target pickup date, monetary requirement, required parts and matching availability. Use <b>Find chassis</b> to allocate against a request.</p>
      <p className="mb-3 text-xs text-muted">Available now = Available units of the requested type with current or near-expiry OR/CR (expired registration and units awaiting sign-off excluded). Target pickup in <b className="text-warning">orange</b> = due today or tomorrow and not yet fulfilled. Monetary requirement: <b>Cleared</b> = cash bond held · <b>Pending</b> = cash bond / deposit not yet received · <b>Blocked</b> = client credit hold (allocation stopped). Fulfilled requests stay listed with their allocated chassis.</p>
      {/* Staff review 1.2: columns combined so the table fits the page (no hidden right side): status + actions come first after the request,
          type carries the required parts, availability carries the units in repair, target pickup carries the expected return. Click a request for its detail. */}
      <DataTable<ReqRow> data={data.data} loading={data.isLoading} exportName="unit-requests" emptyTitle="No unit requests" emptyHint="Create a request when a client asks for units." columns={[
        { accessorKey: 'reqNo', header: 'Request', cell: (c) => { const r = c.row.original; return <span className="flex flex-col items-start gap-1"><button className="font-mono font-medium text-brand-700 hover:underline" onClick={() => setDetail(r.reqNo)}>{r.reqNo}</button><Badge tone={r.status === 'Allocated' ? 'success' : r.status === 'Cancelled' ? 'neutral' : 'info'}>{r.status === 'Allocated' ? 'Fulfilled' : r.status}</Badge></span>; } },
        { accessorKey: 'clientName', header: 'Client / contract', meta: { wrap: true }, cell: (c) => { const r = c.row.original; const held = !!r.contractStatus && r.contractStatus !== 'Active' && ['Open', 'Partially Allocated'].includes(r.status); const u = r.contractUsage;
          return <span className="flex min-w-40 flex-col items-start gap-0.5"><span>{r.clientName}</span><span className="whitespace-nowrap text-xs text-muted"><span className="font-mono">{r.contractNo}</span> <Badge tone="neutral" dot={false}>{r.contractType ?? '—'}</Badge></span>
            {held && <Badge tone="danger" dot={false}>Contract {r.contractStatus?.toLowerCase()} — on hold pending renewal</Badge>}
            {!r.typeOnContract && <Badge tone="warning" dot={false}>Type not rated on contract</Badge>}
            {u.total > u.contracted && <span className="text-xs font-medium text-warning" title={`${u.onHire} on hire + ${u.allocated} allocated + ${u.requested} still requested`}>Units {u.total} / {u.contracted} contracted</span>}</span>; } },
        { id: 'br', header: 'Branch', cell: (c) => <span className="flex flex-col whitespace-nowrap">{c.row.original.branchCode}<span className="text-xs text-muted">{c.row.original.region}</span></span> },
        { accessorKey: 'equipmentType', header: 'Type / parts', cell: (c) => <span className="flex max-w-40 flex-col"><span className="whitespace-nowrap">{eqName(c.getValue<string>())}</span>{c.row.original.requiredParts && <span className="text-xs text-muted">Parts: {c.row.original.requiredParts}</span>}</span> },
        { id: 'qty', header: 'Alloc. / qty', meta: { align: 'right' }, cell: (c) => { const r = c.row.original; return <span className="flex flex-col items-end">{`${r.allocated.length} / ${r.qty}`}{r.allocated.map((no) => <Link key={no} to={`/chassis/${no}`} className="whitespace-nowrap font-mono text-xs text-brand-700 hover:underline">{no}</Link>)}</span>; } },
        { accessorKey: 'targetPickupDate', header: 'Pickup / return', cell: (c) => <span className="flex flex-col whitespace-nowrap"><span className={cn(c.row.original.daysToPickup <= 1 && c.row.original.status !== 'Allocated' && c.row.original.status !== 'Cancelled' && 'font-semibold text-warning')}>{formatDate(c.getValue<string>())}</span><span className="text-xs text-muted">{c.row.original.expectedReturn ? `return ${formatDate(c.row.original.expectedReturn)}` : 'return not set'}</span></span> },
        { id: 'mon', header: 'Monetary req.', cell: (c) => <span className="flex max-w-44 flex-col items-start gap-0.5"><Badge tone={monTone(c.row.original.monetary.status)}>{c.row.original.monetary.status}</Badge><span className="text-xs text-muted">{c.row.original.monetary.note}</span></span> },
        { id: 'match', header: 'Available now', cell: (c) => { const r = c.row.original; return <span className="flex flex-col whitespace-nowrap"><span>{r.matches} here</span>{r.matchesElsewhere ? <span className="text-xs text-muted">{r.matchesElsewhere} elsewhere in {r.region}</span> : null}{r.inRepairHere.length ? <span className="text-xs text-muted" title={r.inRepairHere.map((x) => `${x.chassisNo} ${x.status}${x.category ? ` · ${x.category}` : ''}`).join('\n')}>{r.inRepairHere.length} in repair here</span> : null}</span>; } },
        { accessorKey: 'createdAt', header: 'Requested', cell: (c) => <span className="flex flex-col whitespace-nowrap"><span>{formatDate(c.getValue<string>())}</span><span className="text-xs text-muted">{userName(c.row.original.createdBy)} · {c.row.original.source}</span></span> },
        { id: 'a', header: () => <span className="sr-only">Actions</span>, cell: (c) => { const r = c.row.original; return ['Open', 'Partially Allocated'].includes(r.status) ? <span className="flex justify-end gap-1">
          <Button size="sm" variant="secondary" icon={<Search className="size-4" />} disabled={r.monetary.status === 'Blocked' || (!!r.contractStatus && r.contractStatus !== 'Active')} title={r.contractStatus && r.contractStatus !== 'Active' ? `Contract ${r.contractNo} is ${r.contractStatus} — the request is on hold until the contract is renewed.` : r.monetary.status === 'Blocked' ? `Monetary requirement blocked — ${r.monetary.note}. Allocation resumes when the block is lifted.` : undefined} onClick={() => onFind(r)}>Find chassis</Button>
          {canEdit && !r.allocated.length && <Button size="sm" variant="ghost" onClick={() => setCancel(r)}>Cancel</Button>}</span> : <Button size="sm" variant="ghost" onClick={() => setDetail(r.reqNo)}>View</Button>; } },
      ]} toolbar={<>
        <Select aria-label="Region" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} placeholder="Nationwide (all regions)" options={REGIONS} />
        <Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" options={['Open', 'Partially Allocated', 'Allocated', 'Cancelled'].map((s) => ({ value: s, label: s === 'Allocated' ? 'Fulfilled (all allocated)' : s }))} />
        {canAdd && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New unit request</Button>}
      </>} />
      <Modal open={open} onClose={() => setOpen(false)} title="New client unit request" size="lg"
        footer={<>{/* Staff review 1.2: the footer lists only what is still missing; every field with * is required. */}<span className="mr-auto text-xs text-muted">{need.length > 0 ? <>Still missing: {need.join(', ')}</> : 'All required (*) fields filled'}</span><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.isPending} disabled={need.length > 0 || pastDate || afterExpiry || returnBeforePickup} onClick={() => create.mutate(undefined)}>Create request</Button></>}>
        {!clients.isLoading && !clients.data?.length && <Banner className="mb-3" tone="danger" title="No eligible clients">Only accredited, active clients without a credit hold and with an active contract can request units.</Banner>}
        <FormGrid>
          <Select label="Client" required value={v.clientCode} error={err('clientCode')} onChange={(e) => setV({ ...v, clientCode: e.target.value, contractNo: '', equipmentType: '' })} placeholder="Select" hint="Eligible = accredited, active, no credit hold, with an active contract (same check as New EWA)" options={(clients.data ?? []).map((c) => ({ value: c.clientCode, label: `${c.clientCode} — ${c.clientName}` }))} />
          <Select label="Contract" required value={v.contractNo} error={err('contractNo')} disabled={!v.clientCode} onChange={(e) => setV({ ...v, contractNo: e.target.value, equipmentType: '' })} placeholder={v.clientCode ? 'Select an active contract' : 'Select a client first'} options={(cl?.contracts ?? []).map((k) => ({ value: k.contractNo, label: `${k.contractNo} (${k.contractType})` }))} />
          <Select label="Pickup branch" required value={v.branchCode} error={err('branchCode')} onChange={(e) => setV({ ...v, branchCode: e.target.value })} placeholder="Select" hint={brRegion ? `Region: ${brRegion}` : undefined} options={branchOpts} />
          <Select label="Chassis type" required value={v.equipmentType} error={err('equipmentType')} disabled={!ct} onChange={(e) => setV({ ...v, equipmentType: e.target.value })} placeholder={ct ? 'Select a type on this contract' : 'Select a contract first'} options={(ct?.equipmentTypes ?? []).map((t) => ({ value: t, label: eqName(t) }))} />
          <Input label="Quantity" required type="number" min={1} value={v.qty} error={err('qty') ?? (v.qty < 1 ? 'At least 1' : undefined)} placeholder="e.g. 5" onChange={(e) => setV({ ...v, qty: Number(e.target.value) })} />
          <Input label="Target pickup date" required type="date" min={today()} max={ct?.expiryDate} value={v.targetPickupDate} error={err('targetPickupDate') ?? (pastDate ? 'Must be today or later' : afterExpiry ? `After the contract expiry (${formatDate(ct?.expiryDate)})` : undefined)} onChange={(e) => setV({ ...v, targetPickupDate: e.target.value })} />
          {/* Staff review 1.2: expected return (shown on the board and used as the allocation's return date) and the client's pickup contact. */}
          <Input label="Expected return date" type="date" min={v.targetPickupDate || today()} value={v.expectedReturn} error={err('expectedReturn') ?? (returnBeforePickup ? 'Must be on or after the target pickup date' : undefined)} hint="Optional — copied to each allocated unit" onChange={(e) => setV({ ...v, expectedReturn: e.target.value })} />
          <ReadField label="Requested by / source"><span className="text-sm">{user?.name ?? '—'} · <Badge tone="neutral" dot={false}>Internal (staff)</Badge></span></ReadField>
          <Input label="Client contact for pickup" value={v.contactName} onChange={(e) => setV({ ...v, contactName: e.target.value })} placeholder="e.g. Juan Dela Cruz" />
          <Input label="Contact phone" value={v.contactPhone} onChange={(e) => setV({ ...v, contactPhone: e.target.value })} placeholder="e.g. +63 917 222 3344" />
          <Input label="Required parts / specification" value={v.requiredParts} onChange={(e) => setV({ ...v, requiredParts: e.target.value })} placeholder="e.g. Twist locks ×4" />
          <Input label="Notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Anything the branch should know, e.g. pickup after 2 PM" />
        </FormGrid>
        {/* Review 1.1 / 1.2: what the user will get, before submitting — live availability shows as soon as a branch is picked. */}
        <div className="mt-4 rounded-lg border border-line bg-surface-alt p-3">
          <KeyValueGrid cols={4} items={[
            { label: 'Contract type / term', value: ct ? <span><Badge tone="neutral" dot={false}>{ct.contractType}</Badge> <span className="text-xs text-muted">{formatDate(ct.effectiveDate)} – {ct.expiryDate ? formatDate(ct.expiryDate) : 'open-ended'}</span></span> : <span className="text-sm text-muted">Select a contract</span> },
            { label: 'Monetary requirement', value: ct ? <span className="flex flex-col items-start gap-0.5"><Badge tone={monTone(ct.monetary.status)}>{ct.monetary.status}</Badge><span className="text-xs text-muted">{ct.monetary.note}</span></span> : <span className="text-sm text-muted">Select a contract</span> },
            { label: 'Live availability', value: !v.branchCode ? <span className="text-sm text-muted">Select a pickup branch</span> : board.isLoading ? 'Checking…' : v.equipmentType
              ? <span>{hereN} {eqName(v.equipmentType)} available at {v.branchCode}{brRegion ? `, ${elsewhereN} elsewhere in ${brRegion}` : ''}{repairN ? <span className="block text-xs text-muted">{repairN} of this type in repair at {v.branchCode}</span> : null}</span>
              : <span>{branchAvail} available at {v.branchCode} (all types)<span className="block text-xs text-muted">Pick a chassis type for the matching count</span></span> },
            // Staff UI changes V1.4 (row 20, ALO-001): the effective rate for the chosen type, its unit of charge and where it comes from.
            { label: 'Effective rate', value: !ct ? <span className="text-sm text-muted">Select a contract</span> : !v.equipmentType ? <span className="text-sm text-muted">Select a chassis type</span> : rate
              ? <span className="flex flex-col items-start gap-0.5"><span className="font-semibold tabular">{formatPhp(rate.dailyRate)} <span className="font-normal text-muted">per unit per day</span></span>
                <span className="text-xs text-muted">Source: contract {ct.contractNo} rate snapshot ({ct.contractType}{ct.contractClass ? ` · ${ct.contractClass}` : ''})</span>
                {rate.templateRate != null && rate.templateRate !== rate.dailyRate
                  ? <Badge tone="purple" dot={false}>Custom rate · template {formatPhp(rate.templateRate)}</Badge>
                  : <Badge tone="neutral" dot={false}>{rate.templateRate != null ? 'Same as the rate-card template' : 'Contract rate'}</Badge>}</span>
              : <span className="text-sm text-warning">Not rated on this contract</span> },
          ]} />
          {ct && <p className="mt-2 text-xs text-muted">Contract units: {ct.usage.onHire} on hire + {ct.usage.allocated} allocated + {ct.usage.requested} still requested = {ct.usage.total} of {ct.usage.contracted} contracted.</p>}
          {rate && <p className="mt-1 text-xs text-muted">The rate is fixed by the signed contract; a request cannot change it. Overriding a custom rate needs a contract amendment (new version) approved by the Sales Director — who may approve the override is pending Delbros confirmation.</p>}
          {overUnits && <p className={cn('mt-1 text-xs font-medium', blockOver ? 'text-danger' : 'text-warning')}>{blockOver ? 'This request takes the contract over its contracted units — blocked by the contracted-unit limit setting. Amend the contract or reduce the quantity.' : 'This request takes the contract over its contracted units — warning only; confirm with the Account Executive. Whether to block or allow a controlled override is pending Sales / Operations approval (Admin → Settings → Allocation).'}</p>}
          {v.branchCode && v.equipmentType && !board.isLoading && hereN + elsewhereN < v.qty && <p className="mt-2 text-xs text-warning">Fewer roadworthy units with current OR/CR than requested — the request can still be logged; allocation waits for repairs, sign-off or a transfer.</p>}
          <p className="mt-2 text-xs text-muted">Availability counts Available units with current or near-expiry OR/CR only (expired registration and units awaiting sign-off are excluded). One chassis type per request; a quantity above 1 is one request that collects several allocated units. Status: <b>Open</b> → <b>Partially allocated</b> → <b>Fulfilled</b> (all units allocated) → released at <b>Gate Out</b> (unit On hire). The new UR number is shown on save.</p>
        </div>
        {create.error && !fieldError(create.error, 'clientCode') && <Banner className="mt-3" tone="danger">{errMessage(create.error)}</Banner>}
      </Modal>
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} onConfirm={(r) => doCancel.mutate(r)} title={`Cancel ${cancel?.reqNo}?`} requireReason tone="danger" confirmLabel="Cancel request" loading={doCancel.isPending} />
      {/* Staff review 1.2: request detail view. */}
      <Modal open={!!detailRow} onClose={() => setDetail(null)} title={`Client unit request ${detailRow?.reqNo ?? ''}`} description={detailRow ? `${detailRow.clientName} · ${detailRow.contractNo}` : undefined} size="lg"
        footer={detailRow && <>{['Open', 'Partially Allocated'].includes(detailRow.status) && canEdit && !detailRow.allocated.length && <Button variant="ghost" onClick={() => { setCancel(detailRow); setDetail(null); }}>Cancel request</Button>}
          {['Open', 'Partially Allocated'].includes(detailRow.status) && <Button variant="secondary" icon={<Search className="size-4" />} disabled={detailRow.monetary.status === 'Blocked' || (!!detailRow.contractStatus && detailRow.contractStatus !== 'Active')} onClick={() => { setDetail(null); onFind(detailRow); }}>Find chassis</Button>}
          <Button onClick={() => setDetail(null)}>Close</Button></>}>
        {detailRow && <Stack>
          {detailRow.contractStatus && detailRow.contractStatus !== 'Active' && ['Open', 'Partially Allocated'].includes(detailRow.status) && <Banner tone="danger" title="On hold">Contract {detailRow.contractNo} is {detailRow.contractStatus.toLowerCase()} — no allocation until it is renewed.</Banner>}
          <KeyValueGrid cols={3} items={[
            { label: 'Status', value: <Badge tone={detailRow.status === 'Allocated' ? 'success' : detailRow.status === 'Cancelled' ? 'neutral' : 'info'}>{detailRow.status === 'Allocated' ? 'Fulfilled' : detailRow.status}</Badge> },
            { label: 'Client', value: detailRow.clientName }, { label: 'Contract', value: <span>{detailRow.contractNo} <Badge tone="neutral" dot={false}>{detailRow.contractType ?? '—'}</Badge></span> },
            { label: 'Pickup branch', value: `${detailRow.branchCode} · ${detailRow.region}` }, { label: 'Chassis type', value: eqName(detailRow.equipmentType) }, { label: 'Allocated / requested', value: `${detailRow.allocated.length} / ${detailRow.qty}` },
            { label: 'Target pickup', value: formatDate(detailRow.targetPickupDate) }, { label: 'Expected return', value: detailRow.expectedReturn ? formatDate(detailRow.expectedReturn) : '—' },
            { label: 'Monetary requirement', value: <span className="flex flex-col items-start gap-0.5"><Badge tone={monTone(detailRow.monetary.status)}>{detailRow.monetary.status}</Badge><span className="text-xs text-muted">{detailRow.monetary.note}</span></span> },
            { label: 'Required parts / spec', value: detailRow.requiredParts || '—' }, { label: 'Client contact', value: detailRow.contactName ? `${detailRow.contactName}${detailRow.contactPhone ? ` · ${detailRow.contactPhone}` : ''}` : '—' },
            { label: 'Requested', value: `${formatDateTime(detailRow.createdAt)} · ${userName(detailRow.createdBy)} (${detailRow.source})` },
            { label: 'Notes', value: detailRow.notes || '—' },
            { label: 'Allocated chassis', value: detailRow.allocated.length ? <span className="flex flex-wrap gap-2">{detailRow.allocated.map((no) => <Link key={no} to={`/chassis/${no}`} className="font-mono text-brand-700 hover:underline">{no}</Link>)}</span> : '—' },
            { label: 'Available now', value: `${detailRow.matches} at ${detailRow.branchCode}, ${detailRow.matchesElsewhere} elsewhere in ${detailRow.region}` },
            ...(detailRow.status === 'Cancelled' ? [{ label: 'Cancelled', value: `${detailRow.cancelledAt ? formatDateTime(detailRow.cancelledAt) : '—'}${detailRow.cancelledBy ? ` · ${userName(detailRow.cancelledBy)}` : ''}${detailRow.cancelReason ? ` — ${detailRow.cancelReason}` : ''}` }] : []),
          ]} />
          <div className="rounded-lg border border-line bg-surface-alt p-3 text-sm">
            <p className="font-medium">Contract entitlement (check — rule pending confirmation)</p>
            <p className="text-xs text-muted">Rated types: {detailRow.contractUsage.types.map((t) => eqName(t)).join(', ') || '—'} {detailRow.typeOnContract ? '' : <b className="text-warning">· {eqName(detailRow.equipmentType)} is not rated on this contract</b>}</p>
            <p className="text-xs text-muted">Units: {detailRow.contractUsage.onHire} on hire + {detailRow.contractUsage.allocated} allocated + {detailRow.contractUsage.requested} still requested = <b className={cn(detailRow.contractUsage.total > detailRow.contractUsage.contracted && 'text-warning')}>{detailRow.contractUsage.total}</b> of {detailRow.contractUsage.contracted} contracted</p>
          </div>
          {detailRow.inRepairHere.length > 0 && <p className="text-xs text-muted">Same type in repair at {detailRow.branchCode}: {detailRow.inRepairHere.map((x) => `${x.chassisNo} (${x.status}${x.category ? ` · ${x.category}` : ''})`).join(', ')}</p>}
        </Stack>}
      </Modal>
    </>
  );
}

// ── SCR-20 Daily Chassis Inventory Report ──────────────────────────────────
export function DcirPage() {
  const [branch, setBranch] = useState('');
  const [region, setRegion] = useState('');
  const [date, setDate] = useState(today());
  const [grouped, setGrouped] = useState(false);
  const data = useQuery({ queryKey: ['dcir', branch, region, date], queryFn: () => api.alloc.dcir({ branches: branch ? [branch] : undefined, region: region || undefined, date }), refetchInterval: date === today() ? 60_000 : false });
  const { setting } = useRefLookups();
  const regionBranches = useRegionBranches(region);
  const { can, user } = useAuth();
  const [print, setPrint] = useState(false);
  const d = data.data;
  const retention = Number(setting('alo.dcir_snapshot_days') ?? 90);
  const minDate = manilaDay(new Date(Date.now() - retention * 86400000).toISOString());
  const keys = d ? [...d.cols, 'total', ...d.cats, 'regBlocked', 'releasable', 'regExpiredAll', 'signoff', 'idle', 'parkFix', 'company', 'partner'] : [];
  const sum = (rs: Record<string, number | string>[]) => Object.fromEntries(keys.map((k) => [k, rs.reduce((a, r) => a + Number(r[k] ?? 0), 0)]));
  const totals = d ? sum(d.rows) : {};
  const live = !!d && !d.isSnapshot;
  const drill = (b: string | undefined, q: string) => `/allocation?${b ? `branch=${b}&` : ''}${q}`;
  // One colour rule: drillable counts use the link style, zeros are muted grey, amber only for exceptions (reg. blocked / idle).
  const Cell = ({ v, to, strong, warn }: { v: unknown; to?: string; strong?: boolean; warn?: boolean }) => {
    const n = Number(v);
    return <td className={cn('px-1.5 py-2 text-right tabular', strong && 'font-semibold', n === 0 && 'text-muted', warn && n > 0 && 'font-semibold text-warning')}>{to && live && n > 0 ? <Link to={to} className={cn('underline decoration-transparent underline-offset-2 hover:decoration-current', warn ? 'text-warning' : 'text-brand-700')}>{String(v)}</Link> : String(v)}</td>;
  };
  const branchLabel = (s: string) => s.replace(/\s*\(demo\)\s*$/i, '');
  const Line = ({ r, label, b, cls }: { r: Record<string, number | string>; label: string; b?: string; cls?: string }) => (
    <tr className={cn('border-t border-line', cls)}>
      <td className="whitespace-nowrap px-3 py-2 font-medium" title={b}>{branchLabel(label)}</td>
      {d!.cols.map((c) => <Cell key={c} v={r[c]} to={drill(b, `status=${encodeURIComponent(c)}`)} />)}
      <Cell v={r.total} strong to={b ? drill(b, '') : undefined} />
      {d!.cats.map((c) => <Cell key={c} v={r[c]} to={drill(b, `cat=${encodeURIComponent(c)}`)} />)}
      <Cell v={r.regBlocked} warn to={drill(b, 'reg=blocked')} /><Cell v={r.releasable} strong /><Cell v={r.regExpiredAll} warn to="/regulatory/compliance" /><Cell v={r.signoff} to={drill(b, 'ready=1')} /><Cell v={r.idle} warn /><Cell v={r.parkFix} to={live ? '/allocation/park-fix' : undefined} />
    </tr>
  );
  // Matrix fits the page at 1600 px: single-line sentence-case headers (full name in the tooltip), tight numeric padding.
  const th = 'whitespace-nowrap px-1.5 py-2 text-right align-bottom font-semibold';
  const band = 'border-b border-l border-line px-1.5 py-1 text-center whitespace-nowrap uppercase tracking-wide';
  const colLabel = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();
  const Table = () => (
    <table className="w-full text-[13px]">
      <thead className="bg-surface-alt text-[11px] text-muted">
        <tr><th /><th colSpan={d!.cols.length + 1} className={band}>Fleet status</th><th colSpan={d!.cats.length} className={band}>Repair category</th><th colSpan={3} className={band}>Registration</th><th colSpan={2} className={band}>Attention</th><th className={band}>Client units</th></tr>
        <tr><th className="whitespace-nowrap px-3 py-2 text-left align-bottom font-semibold">Branch</th>{d!.cols.map((c) => <th key={c} className={th} title={c === 'Other' ? 'New, Unaccounted, Legal, Converted, Sold, Killed' : c}>{colLabel(c)}</th>)}<th className={th}>Total</th>{d!.cats.map((c) => <th key={c} className={cn(th, c === d!.cats[0] && 'border-l border-line')} title={c}>{c.replace(/ Repair$/, '')}</th>)}<th className={cn(th, 'border-l border-line')} title="Reg. blocked — Available units with expired / missing registration, excluded from releasable">Blocked</th><th className={th} title="Available minus units with expired / missing registration">Releasable</th><th className={th} title="Every fleet unit (any status) with an expired / missing OR/CR — the same units the Allocation board marks 'Expired · blocked' and the Compliance dashboard lists">Expired (all)</th><th className={cn(th, 'border-l border-line')} title="Repairs done, awaiting sign-off to Available">Sign-off</th><th className={th} title={`Available for more than ${d!.idleThreshold} days`}>Idle {d!.idleThreshold}d+</th><th className={cn(th, 'border-l border-line')} title="Client-owned trailers stored for a fee — not Delbros fleet">Park &amp; Fix</th></tr>
      </thead>
      <tbody>
        {grouped ? ['Luzon', 'Visayas', 'Mindanao'].map((rg) => { const rs = d!.rows.filter((r) => r.region === rg); return rs.length ? <Fragment key={rg}>{rs.map((r) => <Line key={String(r.branch)} r={r} b={String(r.branch)} label={String(r.branchName)} />)}<Line r={sum(rs)} label={`${rg} subtotal`} cls="bg-brand-50/50 font-semibold" /></Fragment> : null; })
          : d!.rows.map((r) => <Line key={String(r.branch)} r={r} b={String(r.branch)} label={String(r.branchName)} />)}
        <Line r={totals} label={branch || region ? 'Total (selection)' : 'Total (nationwide)'} cls="border-t-2 border-line-strong bg-surface-alt font-semibold" />
      </tbody>
    </table>
  );
  const TypeTable = () => (
    <table className="w-full text-[13px]">
      <thead className="bg-surface-alt text-[11px] text-muted"><tr><th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Equipment type</th>{d!.cols.map((c) => <th key={c} className={th}>{colLabel(c)}</th>)}<th className={th}>Total</th><th className={cn(th, 'border-l border-line')}>Company-owned</th><th className={th}>Partner-owned</th></tr></thead>
      <tbody>
        {d!.byType.map((r) => <tr key={String(r.type)} className="border-t border-line"><td className="whitespace-nowrap px-3 py-2 font-medium">{String(r.typeName)}</td>{d!.cols.map((c) => <Cell key={c} v={r[c]} />)}<Cell v={r.total} strong /><Cell v={r.company} /><Cell v={r.partner} /></tr>)}
        <tr className="border-t-2 border-line-strong bg-surface-alt font-semibold"><td className="px-3 py-2">Total</td>{d!.cols.map((c) => <Cell key={c} v={d!.byType.reduce((a, r) => a + Number(r[c] ?? 0), 0)} />)}<Cell v={d!.byType.reduce((a, r) => a + Number(r.total), 0)} strong /><Cell v={d!.byType.reduce((a, r) => a + Number(r.company), 0)} /><Cell v={d!.byType.reduce((a, r) => a + Number(r.partner), 0)} /></tr>
      </tbody>
    </table>
  );
  return (
    <>
      <PageHeader title="Daily Chassis Inventory Report"
        description="Per-branch and nationwide roll-up by status, repair category and registration. Today is live; earlier dates are read-only nightly snapshots."
        actions={<>
          <Select aria-label="Region" value={region} onChange={(e) => { setRegion(e.target.value); setBranch(''); }} placeholder="Nationwide (all regions)" options={REGIONS} />
          <Select aria-label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="All branches" options={regionBranches} />
          <Input aria-label="Report date" title={`Today is live; earlier dates are nightly snapshots kept for ${retention} days`} type="date" value={date} min={minDate} max={today()} onChange={(e) => setDate(e.target.value || today())} />
          <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => data.refetch()}>Refresh</Button>
          <Button variant="secondary" icon={<Printer className="size-4" />} disabled={!can('alloc.dcir', 'export') || !d} title={can('alloc.dcir', 'export') ? undefined : 'Your role can view but not print / export the DCIR'} onClick={() => setPrint(true)}>Print / export</Button>
        </>} />
      {d && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          {d.isSnapshot ? <><Badge tone="warning">Snapshot · {formatDate(d.date)} · taken {d.snapshotAt ? formatDateTime(d.snapshotAt) : 'end of day'} (nightly, read-only)</Badge><Button size="sm" variant="ghost" onClick={() => setDate(today())}>Back to today (live)</Button></> : <Badge tone="success">Live · as of {formatDateTime(new Date(data.dataUpdatedAt).toISOString())}</Badge>}
          <Badge tone="neutral" dot={false}>Scope: {d.scope}</Badge>
          <span className="text-xs text-muted">Report DCIR-{d.date} · generated by {user?.name ?? '—'}</span>
          <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> Group by region (Luzon / Visayas / Mindanao)</label>
        </div>
      )}
      {data.error && <Banner className="mb-4" tone="danger" title="Could not load the DCIR">{errMessage(data.error)}</Banner>}
      <Card padded={false} className="mb-3 overflow-x-auto">{d ? (d.rows.length ? <Table /> : <div className="p-5"><EmptyState title="No branches in this selection" hint="Change the region or branch filter." /></div>) : !data.error && <p className="p-5 text-muted">Loading…</p>}</Card>
      <p className="mb-2 text-xs text-muted">{live ? 'Click a linked count to open the matching chassis list.' : 'Drill-down is available on the live (today) view only.'}</p>
      <details className="mb-5 text-xs text-muted">
        <summary className="cursor-pointer font-medium text-ink-2">How to read this report</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Total</b> = every Delbros fleet unit at the branch (Other = New, Unaccounted, Legal, Converted, Sold, Killed), so each row reconciles to the fleet count{d ? ` (${d.fleetTotal} in this selection)` : ''}.</li>
          <li><b>Parked</b> = Delbros fleet units parked in the yard (inside Total).</li>
          <li><b>Park &amp; Fix</b> = client-owned trailers stored for a fee — not Delbros fleet, not in Total or Available. So “Parked 0” and “Park &amp; Fix 1” count different things.</li>
          <li><b>Repair category</b> covers yard units (TQS = repair done, awaiting sign-off; On Hire / Rescue / Other are not categorised).</li>
          <li><b>Releasable</b> = Available minus units with expired / missing registration.</li>
          <li><b>Blocked</b> counts <i>Available</i> units only (the units that could otherwise be released). <b>Expired (all)</b> counts every fleet unit with an expired / missing OR/CR whatever its status (allocated, on hire, in repair…) — the same units the Allocation board marks “Expired · blocked” and the Compliance dashboard lists.</li>
          <li><b>Rescue</b> = fleet units whose status is Rescue (set when a rescue crew is dispatched; back to On hire when it is completed). A rescue that is only requested or confirmed leaves the unit On hire.</li>
          <li><b>By equipment type</b> (below) splits the same units by type and by owner: company-owned vs partner-owned (BR-13, target about 70 / 30).</li>
          <li><b>Sign-off</b> = TQS units. Click the count to open them on the Allocation board, where <b>Sign off</b> checks that every job order is closed and the OR/CR is current before the unit becomes Available.</li>
          <li>The date picker defaults to today (live). Picking an earlier date shows that night’s read-only snapshot.</li>
        </ul>
      </details>
      {/* Staff review 1.2: equipment-type breakdown with the company vs partner ownership split (BR-13). */}
      {d && d.byType.length > 0 && <Card padded={false} className="mb-5 overflow-x-auto">
        <div className="px-4 pt-4"><CardHeader title="By equipment type and ownership" description={<>Same units as the matrix above ({d.fleetTotal} in this selection). Ownership: company-owned {Number(totals.company ?? 0)} ({d.fleetTotal ? Math.round((Number(totals.company ?? 0) / d.fleetTotal) * 100) : 0}%) · partner-owned {Number(totals.partner ?? 0)} ({d.fleetTotal ? Math.round((Number(totals.partner ?? 0) / d.fleetTotal) * 100) : 0}%) — target about 70 / 30.</>} /></div>
        <TypeTable />
      </Card>}
      <Card>
        <CardHeader title="Aging idle units" description={<>Available for more than {d?.idleThreshold ?? '—'} days — flagged for yard planning / escalation.</>} />
        {d?.idleUnits.length ? <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{d.idleUnits.map((u) => <li key={u.chassisNo} className="flex justify-between rounded-lg border border-warning-line bg-warning-bg/50 px-3 py-2 text-sm"><Link to={`/chassis/${u.chassisNo}`} className="font-mono text-brand-700 hover:underline">{u.chassisNo}</Link><span className="text-muted">{u.branchCode} · {u.days}d</span></li>)}</ul> : <p className="text-sm text-muted">No idle units above the threshold.</p>}
      </Card>
      {d && <PrintPreview open={print} onClose={() => setPrint(false)} title="DCIR" landscape><DocHeader title="DAILY CHASSIS INVENTORY REPORT" no={`DCIR-${d.date}`} date={formatDateTime(d.asOf)} extra={<p>{d.isSnapshot ? 'Nightly snapshot' : 'Live'} · {branch || region || 'All branches'} · generated by {user?.name ?? '—'}</p>} />
        {/* Print copy: compact cells and wrapping headers so all 22 columns fit the landscape sheet. */}
        <div className="[&_table]:text-[10.5px] [&_thead]:text-[9px] [&_th]:whitespace-normal [&_th]:px-1 [&_td]:px-1 [&_td]:py-1.5 [&_td:first-child]:whitespace-normal [&_th]:tracking-normal"><Table /><p className="mb-1 mt-3 font-semibold">BY EQUIPMENT TYPE AND OWNERSHIP</p><TypeTable /></div><DocFooter copy="DAILY CHASSIS INVENTORY REPORT" /></PrintPreview>}
    </>
  );
}

// ── SCR-21 Park & Fix Dashboard ────────────────────────────────────────────
// Staff review 1.2: the 8 tire positions of the Gate In / EIR checklist (was one "Tires" row) — layout for client trailers pending confirmation.
const PF_PARTS = ['Tire L1 outer', 'Tire L1 inner', 'Tire R1 outer', 'Tire R1 inner', 'Tire L2 outer', 'Tire L2 inner', 'Tire R2 outer', 'Tire R2 inner', 'Brake system', 'Landing legs', 'King pin', 'Twist locks', 'Lights & wiring', 'Mud flaps', 'Chassis frame'];
const pfChecklist = (): InspectionLine[] => PF_PARTS.map((part) => ({ part, statusCode: 'OK', qty: 1, chargeable: 0 }));
type PfRow = Awaited<ReturnType<typeof api.alloc.parkFix>>[number];
type GateForm = { trucker: string; truckPlateNo: string; truckOrcr: string; driverName: string; driverLicenseNo: string; inspection: InspectionLine[]; signature?: string; remarks?: string; photos: string[] };
const blankGate = (): GateForm => ({ trucker: '', truckPlateNo: '', truckOrcr: '', driverName: '', driverLicenseNo: '', inspection: pfChecklist(), signature: undefined, remarks: '', photos: [] });

/** Damage photos (same control as Gate In). Demo keeps file names; production uploads to the document store. */
function ParkPhotos({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">Damage photos</span>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-sm text-muted hover:bg-surface-alt">
        <Camera className="size-4" />Add photos (camera or file)
        <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => { onChange([...value, ...Array.from(e.target.files ?? []).map((f) => f.name)]); e.target.value = ''; }} />
      </label>
      {value.length > 0 && <div className="flex flex-wrap gap-1.5">{value.map((n, i) => <Badge key={i} tone="neutral" dot={false}>{n}<button type="button" aria-label={`Remove ${n}`} className="ml-1" onClick={() => onChange(value.filter((_, k) => k !== i))}><X className="size-3" /></button></Badge>)}</div>}
      <p className="text-xs text-muted">Optional. Kept with the Park &amp; Fix record and listed on the receipt.</p>
    </div>
  );
}

function GateFields({ g, setG, error }: { g: GateForm; setG: (g: GateForm) => void; error: unknown }) {
  return (
    <>
      <FormSection title="Trucker & driver">
        <FormGrid cols={3}>
          <Input label="Trucker" required value={g.trucker} placeholder="e.g. ABC Trucking Services" error={fieldError(error, 'trucker')} onChange={(e) => setG({ ...g, trucker: e.target.value })} />
          <Input label="Truck plate no." required value={g.truckPlateNo} placeholder="e.g. ABC 1234" error={fieldError(error, 'truckPlateNo')} onChange={(e) => setG({ ...g, truckPlateNo: e.target.value.toUpperCase() })} />
          <Input label="Truck OR/CR" required value={g.truckOrcr} placeholder="Official receipt / certificate of registration no." hint="Verify the vehicle registration in person (as on the Gate Out EIR)." error={fieldError(error, 'truckOrcr')} onChange={(e) => setG({ ...g, truckOrcr: e.target.value })} />
          <Input label="Driver name" required value={g.driverName} placeholder="e.g. Juan Dela Cruz" error={fieldError(error, 'driverName')} onChange={(e) => setG({ ...g, driverName: e.target.value })} />
          <Input label="Driver licence no." required value={g.driverLicenseNo} placeholder="e.g. N01-23-456789" error={fieldError(error, 'driverLicenseNo')} onChange={(e) => setG({ ...g, driverLicenseNo: e.target.value.toUpperCase() })} />
        </FormGrid>
      </FormSection>
      <FormSection title="Inspection & sign-off">
        <Stack>
          <InspectionChecklist lines={g.inspection} onChange={(l) => setG({ ...g, inspection: l })} showCharges={false} />
          <div className="grid items-start gap-4 md:grid-cols-2">
            <Stack><Textarea label="Condition remarks" rows={3} value={g.remarks ?? ''} placeholder="Noted damage or missing items — e.g. cracked left tail light" onChange={(e) => setG({ ...g, remarks: e.target.value })} /><ParkPhotos value={g.photos} onChange={(p) => setG({ ...g, photos: p })} /></Stack>
            <div><SignaturePad value={g.signature} onChange={(s) => setG({ ...g, signature: s })} />{fieldError(error, 'signature') && <p className="mt-1 text-xs text-danger">{fieldError(error, 'signature')}</p>}</div>
          </div>
        </Stack>
      </FormSection>
    </>
  );
}

/** Staff UI changes V1.4 (rows 23, 25, 54): itemized Park & Fix charges — Handling, Repair, Park charge, VAT, Total (same numbers as the Debit Memo). */
function ParkCharges({ r, print }: { r: PfRow; print?: boolean }) {
  const c = r.charges;
  const rows: [string, string, number][] = [
    ['Handling-in', r.handlingTiming === 'park_in' ? `Billed at park-in${r.handlingDmNo ? ` on ${r.handlingDmNo}` : ''} (${formatPhp(r.handlingIn ?? 0)})` : r.handlingIn ? 'Per trailer (configured, proposed amount)' : 'Not charged on this record', c.handling],
    ['Repair', r.service === 'Park only' || !r.service ? 'Park only — no repair' : c.repairSource ?? '—', c.repair],
    ['Park charge', r.service === 'Fix only' ? 'Fix only — no parking fee' : `${r.days} day(s) × ${formatPhp(r.dailyRate)} (per started day)`, c.park],
  ];
  const cell = print ? 'border border-black/30 px-1 py-0.5' : 'px-3 py-1.5';
  return (
    <table className={cn('w-full', print ? 'border border-black/50' : 'overflow-hidden rounded-lg border border-line text-sm')}>
      <tbody>
        {rows.map(([k, note, v]) => <tr key={k} className={print ? '' : 'border-b border-line'}><td className={cn(cell, 'font-medium')}>{k}</td><td className={cn(cell, print ? '' : 'text-xs text-muted')}>{note}</td><td className={cn(cell, 'text-right tabular')}>{formatPhp(v)}</td></tr>)}
        <tr className={print ? '' : 'border-b border-line'}><td className={cn(cell, 'font-medium')}>VAT (12%)</td><td className={cn(cell, print ? '' : 'text-xs text-muted')}>{c.vatBasis === 'inclusive' ? `Included in the amounts above (net ${formatPhp(c.net)})` : 'Added on top of the amounts above'} · VAT basis pending Finance approval</td><td className={cn(cell, 'text-right tabular')}>{formatPhp(c.vat)}</td></tr>
        {c.interimBilled > 0 && <tr className={print ? '' : 'border-b border-line'}><td className={cn(cell, 'font-medium')}>Less interim bills</td><td className={cell}>Long-stay interim Debit Memos already billed</td><td className={cn(cell, 'text-right tabular')}>−{formatPhp(c.interimBilled)}</td></tr>}
        <tr className={print ? 'bg-black/5' : 'bg-surface-alt'}><td className={cn(cell, 'font-semibold')}>Total</td><td className={cn(cell, print ? '' : 'text-xs text-muted')}>{r.status === 'Released' ? `Billed on ${r.debitMemoNo ?? '—'}` : 'Estimate to date — final on park-out'}</td><td className={cn(cell, 'text-right font-semibold tabular')}>{formatPhp(c.due)}</td></tr>
      </tbody>
    </table>
  );
}

function ParkReceipt({ r, which, eqName, userName }: { r: PfRow; which: 'in' | 'out'; eqName: (c?: string) => string; userName: (id?: string) => string }) {
  const g = which === 'in' ? r.parkIn : r.parkOut;
  const reprint = r.reprintCount ?? 0;
  return (
    <div className="relative">
      {reprint ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center rotate-[-20deg] text-6xl font-bold text-black/5">REPRINT #{reprint}</div> : null}
      <DocHeader title={`PARK & FIX RECEIPT — ${which === 'in' ? 'PARK-IN' : 'PARK-OUT'}`} no={(which === 'in' ? r.inReceiptNo : r.outReceiptNo) ?? r.id} date={formatDateTime(which === 'in' ? r.parkInAt : r.parkOutAt)} extra={<p>Record {r.id}</p>} />
      <table className="mb-3 w-full"><tbody>
        {[
          ['CLIENT', `${r.clientCode} ${r.clientName}`, 'DEPOT', r.branchCode],
          ['TRAILER', `${r.chassisNo} · ${eqName(r.chassisType)}${r.clientOwned ? ' (client-owned)' : ''}`, 'PLATE', r.plateNo ?? '—'],
          ['SERVICE', `${r.service ?? 'Park only'}${r.joNo ? ` · JO ${r.joNo}` : ''}${r.repairScope ? ` · ${r.repairScope}` : ''}`, 'REASON', r.reason],
          ['TRUCKER', `${g?.trucker ?? ''} · Plate ${g?.truckPlateNo ?? ''}${g?.truckOrcr ? ` · OR/CR ${g.truckOrcr}` : ''}`, 'DRIVER / LICENCE', `${g?.driverName ?? ''} · ${g?.driverLicenseNo ?? ''}`],
          ...(r.agreementRef ? [['AGREEMENT', r.agreementRef, 'RATE BASIS', 'Per started day · VAT basis pending confirmation']] : []),
          ['PARK-IN', formatDateTime(r.parkInAt), which === 'out' ? 'PARK-OUT' : 'EXPECTED PARK-OUT', which === 'out' ? formatDateTime(r.parkOutAt) : formatDate(r.expectedParkOut)],
          ['DAILY RATE', `${formatPhp(r.dailyRate)}${r.rateOverrideReason ? ' (override)' : ''}${r.service === 'Fix only' ? ' · not charged (Fix only)' : ''}`, which === 'out' ? 'DAYS × RATE' : 'BILLING', which === 'out' ? `${r.days} × ${formatPhp(r.dailyRate)} = ${formatPhp(r.charges.park)}` : 'Charged on park-out (Debit Memo)'],
          ['HANDLING-IN', `${formatPhp(r.handlingIn ?? 0)}${r.handlingTiming === 'park_in' ? ` · billed at park-in${r.handlingDmNo ? ` (${r.handlingDmNo})` : ''}` : ' · billed at park-out'}`, 'VAT BASIS', `${r.charges.vatBasis === 'inclusive' ? 'VAT-inclusive' : 'VAT-exclusive'} (pending Finance approval)`],
          ...(which === 'out' ? [['DEBIT MEMO', r.debitMemoNo ?? '—', 'BILLING STATUS', r.billingStatus]] : []),
        ].map((x, i) => <tr key={i}><td className="w-28 py-0.5 font-semibold">{x[0]}</td><td className="py-0.5">{x[1]}</td><td className="w-36 py-0.5 font-semibold">{x[2]}</td><td className="py-0.5">{x[3]}</td></tr>)}
      </tbody></table>
      <p className="mb-1 font-semibold">CONDITION CHECKLIST ({which === 'in' ? 'ON ENTRY' : 'ON EXIT'})</p>
      <table className="w-full border border-black/50">
        <thead><tr className="bg-black/5">{['Part', 'Status', 'Qty'].map((h) => <th key={h} className="border border-black/40 px-1 py-0.5 text-left">{h}</th>)}</tr></thead>
        <tbody>{(g?.inspection ?? []).map((l) => <tr key={l.part}>{[l.part, l.statusCode, l.qty].map((v, i) => <td key={i} className="border border-black/30 px-1 py-0.5">{v}</td>)}</tr>)}</tbody>
      </table>
      {g?.remarks && <p className="mt-1">Remarks: {g.remarks}</p>}
      {g?.photos?.length ? <p className="mt-1">Photos: {g.photos.join(', ')}</p> : null}
      {which === 'out' && <><p className="mb-1 mt-3 font-semibold">CHARGES</p><ParkCharges r={r} print /></>}
      <div className="mt-6 grid grid-cols-3 gap-8">
        <div><p className="font-semibold">Received / released by (depot)</p><p className="mt-8 border-t border-black/60">{userName(g?.by)}</p></div>
        {/* V1.4 row 21: Deputy Yard Manager sign-off, as on the legacy receipt. */}
        <div><p className="font-semibold">Noted by (Deputy Yard Manager)</p><p className="mt-8 border-t border-black/60">{r.dymSignoff ? `${userName(r.dymSignoff.by)} · ${formatDateTime(r.dymSignoff.at)}` : ' '}</p></div>
        <div><p className="font-semibold">Driver</p>{g?.signature ? <img src={g.signature} alt="Driver signature" className="h-12" /> : <div className="h-12" />}<p className="border-t border-black/60">{g?.driverName}</p></div>
      </div>
      <p className="mt-3 text-[10px]">The client's trailer is stored at the depot for a duration-based fee. It is not part of the Delbros fleet.</p>
      <DocFooter copy="ORIGINAL – CLIENT/TRUCKER COPY" reprint={reprint} />
    </div>
  );
}

export function ParkFixPage() {
  const [f, setF] = useState({ status: '', branch: '', client: '' });
  const data = useData(['parkfix', f], () => api.alloc.parkFix(f));
  const { clientOptions, branchOptions, eqOptions, eqName, setting, userName } = useRefLookups();
  const { can, user } = useAuth();
  const rate = Number(setting('alo.parkfix_daily_rate') ?? 350);
  const canOverride = can('alloc.parkfix', 'approve');
  const [open, setOpen] = useState(false);
  const handlingIn = Number(setting('alo.parkfix_handling_in') ?? 0), handlingAtIn = setting('alo.parkfix_handling_timing') === 'park_in'; // V1.4 row 22 (proposed)
  const vatBasis = String(setting('alo.parkfix_vat_basis') ?? 'inclusive'), longStay = String(setting('alo.parkfix_long_stay') ?? 'park_out_only'); // V1.4 rows 25–26 (proposed)
  const [dym, setDym] = useState<PfRow | null>(null);
  const dymSign = useAction(() => api.alloc.parkFixDymSignoff(dym!.id), { success: 'Deputy Yard Manager sign-off recorded — printed on both receipts', onSuccess: () => setDym(null) });
  const blank = { chassisNo: '', plateNo: '', chassisType: '', clientCode: '', branchCode: 'MNL', reason: 'Idle' as 'Idle' | 'Awaiting Repair' | 'Client Request', service: 'Park only' as 'Park only' | 'Park & Repair' | 'Fix only', repairCategories: [] as RepairCategory[], expectedParkOut: '', dailyRate: rate, rateOverrideReason: '', repairScope: '', repairEstimate: 0, agreementRef: '' };
  const [view, setView] = useState<string | null>(null); // staff review 1.2: detail view
  const [v, setV] = useState(blank);
  const [g, setG] = useState<GateForm>(blankGate());
  const [rateFocus, setRateFocus] = useState(false);
  useEffect(() => { if (open) { setV({ ...blank, dailyRate: rate }); setG(blankGate()); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [receipt, setReceipt] = useState<{ id: string; which: 'in' | 'out' } | null>(null);
  const [out, setOut] = useState<PfRow | null>(null);
  const [og, setOg] = useState<GateForm>(blankGate());
  const parkIn = useAction(() => api.alloc.parkIn({ ...v, gate: g }), { success: (r) => `Parked — receipt ${r.inReceiptNo}${r.joNo ? ` · job order ${r.joNo}` : ''}`, onSuccess: (r) => { setOpen(false); setReceipt({ id: r.id, which: 'in' }); } });
  const parkOut = useAction(() => api.alloc.parkOut(out!.id, og), { success: (r) => `Parked out — ${r.days} day(s), ${formatPhp(r.amount)} billed on ${r.debitMemoNo}`, onSuccess: (r) => { setOut(null); setReceipt({ id: r.id, which: 'out' }); } });
  const reprint = useAction((x: { id: string; which: 'in' | 'out' }) => api.alloc.reprintParkReceipt(x.id, x.which), { silent: true, onSuccess: () => undefined });
  const rows = data.data ?? [];
  const rec = receipt ? rows.find((r) => r.id === receipt.id) : undefined;
  const overdue = (r: PfRow) => r.status === 'Parked' && !!r.expectedParkOut && r.expectedParkOut < today();
  const outDays = out ? Math.max(1, Math.ceil((Date.now() - new Date(out.parkInAt).getTime()) / 86400000)) : 0;
  const vr = view ? rows.find((r) => r.id === view) : undefined;
  const gateItems = (x?: PfRow['parkIn']) => (x ? [
    { label: 'Trucker', value: x.trucker }, { label: 'Truck plate', value: x.truckPlateNo }, { label: 'Truck OR/CR', value: x.truckOrcr ?? '—' },
    { label: 'Driver / licence', value: `${x.driverName} · ${x.driverLicenseNo}` }, { label: 'Depot staff', value: x.by ? userName(x.by) : '—' },
    { label: 'Condition', value: (() => { const bad = x.inspection.filter((l) => l.statusCode !== 'OK'); return bad.length ? bad.map((l) => `${l.part} ${l.statusCode}`).join(', ') : `All OK (${x.inspection.length} parts)`; })() },
    { label: 'Remarks', value: x.remarks || '—' }, { label: 'Photos', value: x.photos?.length ? x.photos.join(', ') : '—' },
  ] : []);
  return (
    <>
      <PageHeader title="Park & Fix" description="Value-added service: Delbros stores a client's own trailer at a depot for a duration-based fee, optionally with repairs (Job Order). Park-in / park-out use the gate-receipt pattern; the fee is billed by Debit Memo on park-out."
        actions={can('alloc.parkfix', 'add') && <Button icon={<ParkingSquare className="size-4" />} onClick={() => setOpen(true)}>Park in</Button>} />
      {/* V1.4 row 52: "Parked" (fleet status) vs Park & Fix (this service) — proposed meaning, pending Delbros confirmation. */}
      <Banner className="mb-4" tone="info" title="Park & Fix is not the fleet status “Parked”">Park &amp; Fix holds <b>client-owned</b> trailers for a fee (ALO-005, Could) — they are never in the Delbros fleet, Available, allocation or DCIR totals. The Dashboard / Allocation status <b>Parked</b> is a <b>Delbros fleet unit</b> set aside, not for hire. This split is the proposed reading of the legacy flow; Delbros to confirm, including the allowed entry / exit transitions of a fleet unit into Parked.</Banner>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Parked now" value={rows.filter((r) => r.status === 'Parked').length} onClick={() => setF({ ...f, status: 'Parked' })} />
        <KpiTile label="Unbilled amount to date" value={formatPhp(rows.filter((r) => r.billingStatus === 'Unbilled').reduce((a, r) => a + r.amountToDate, 0))} tone="warning" />
        <KpiTile label="Billed (Debit Memos)" value={formatPhp(rows.filter((r) => r.billingStatus === 'Billed').reduce((a, r) => a + (r.billedAmount ?? 0), 0))} tone="success" onClick={() => setF({ ...f, status: 'Billed' })} />
        <KpiTile label="Past expected park-out" value={rows.filter(overdue).length} tone="danger" />
      </div>
      <DataTable<PfRow> data={data.data} loading={data.isLoading} exportName="park-and-fix" emptyTitle="No parked units" emptyHint="Use Park in to receive a client's trailer." columns={[
        { accessorKey: 'chassisNo', header: 'Trailer', cell: (c) => <span className="flex flex-col items-start gap-1"><button className="whitespace-nowrap font-mono font-medium text-brand-700 hover:underline" title="Open the Park & Fix detail" onClick={() => setView(c.row.original.id)}>{c.getValue<string>()}</button><span className="whitespace-nowrap text-xs text-muted">{c.row.original.plateNo ?? '—'} · {eqName(c.row.original.chassisType)}</span>{c.row.original.clientOwned && <Badge tone="neutral" dot={false}>Client-owned</Badge>}</span> },
        // V1.4 row 53: client = the trailer owner / current customer; "Last client" = the client on the trailer's previous Park & Fix visit (proposed mapping of the legacy log field).
        { accessorKey: 'clientName', header: 'Client / last client', cell: (c) => { const r = c.row.original; return <span className="block min-w-36">{c.getValue<string>()}<span className="block text-xs text-muted" title="Client on this trailer's previous Park & Fix visit (proposed meaning of the legacy “last client” field — pending confirmation)">Last: {r.lastClient ? `${r.lastClient.clientName} (${r.lastClient.id})` : 'first visit'}</span></span>; } },
        { accessorKey: 'branchCode', header: 'Depot' },
        { id: 'svc', header: 'Service / reason', cell: (c) => <span className="flex flex-col items-start gap-0.5"><span className="whitespace-nowrap">{c.row.original.service ?? 'Park only'}</span>{c.row.original.joNo && <Link to={`/repair/jo/${c.row.original.joNo}`} className="whitespace-nowrap text-xs text-brand-700 hover:underline">{c.row.original.joNo} · {c.row.original.joStatus ?? '—'}</Link>}<span className="whitespace-nowrap text-xs text-muted">{c.row.original.reason}</span></span> },
        { accessorKey: 'parkInAt', header: 'Period', cell: (c) => { const r = c.row.original; return <span className="flex flex-col whitespace-nowrap"><span>In {formatDateTime(r.parkInAt)}</span>
          <span className="font-mono text-xs text-muted" title="Receipt numbers">{r.inReceiptNo ?? '—'}{r.outReceiptNo ? ` · ${r.outReceiptNo}` : ''}</span>
          {r.parkOutAt ? <span className="text-xs text-muted">Out {formatDateTime(r.parkOutAt)}</span> : <span className={cn('text-xs', overdue(r) ? 'font-semibold text-danger' : 'text-muted')}>Expected out {formatDate(r.expectedParkOut)}</span>}</span>; } },
        { accessorKey: 'amountToDate', header: 'Amount to date', meta: { align: 'right' }, cell: (c) => { const r = c.row.original; return <span className="flex flex-col items-end whitespace-nowrap"><span className="font-medium">{formatPhp(c.getValue<number>())}</span>
          <span className="inline-flex items-center gap-1 text-xs text-muted" title={r.rateOverrideReason}>{r.service === 'Fix only' ? 'Fix only · no parking fee' : `${r.days} d × ${formatPhp(r.dailyRate)}`}{r.rateOverrideReason && <Badge tone="warning" dot={false}>override</Badge>}</span>
          <span className="text-xs text-muted" title={`Handling ${formatPhp(r.charges.handling)} · Repair ${formatPhp(r.charges.repair)} · Park ${formatPhp(r.charges.park)} · VAT ${formatPhp(r.charges.vat)} (${r.charges.vatBasis})`}>H {formatPhp(r.charges.handling)} · R {formatPhp(r.charges.repair)} · VAT {formatPhp(r.charges.vat)}</span></span>; } },
        // Status = park state; billing (Unbilled / Billed + Debit Memo) is the second line — no duplicate "Billed" chip.
        { accessorKey: 'displayStatus', header: 'Status / billing', meta: { nowrap: true }, cell: (c) => { const r = c.row.original; return <span className="flex flex-col items-start gap-1"><StatusBadge domain="generic" value={r.status === 'Released' ? 'Parked out' : 'Parked'} />
          {r.debitMemoNo ? <Link to={`/billing/memos?q=${r.debitMemoNo}`} className="text-xs text-brand-700 hover:underline">Billed {r.debitMemoNo} · {formatPhp(r.billedAmount)}</Link> : <span className="text-xs text-muted">{r.billingStatus}</span>}</span>; } },
        { id: 'a', header: () => <span className="sr-only">Actions</span>, cell: (c) => { const r = c.row.original; return <span className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" aria-label="Park-in receipt" title="Park-in receipt" icon={<Receipt className="size-4" />} onClick={() => { reprint.mutate({ id: r.id, which: 'in' }); setReceipt({ id: r.id, which: 'in' }); }}>In receipt</Button>
          {r.status === 'Released' && <Button size="sm" variant="ghost" aria-label="Park-out receipt" title="Park-out receipt" icon={<Receipt className="size-4" />} onClick={() => { reprint.mutate({ id: r.id, which: 'out' }); setReceipt({ id: r.id, which: 'out' }); }}>Out receipt</Button>}
          {r.status === 'Parked' && can('alloc.parkfix', 'edit') && <Button size="sm" variant="secondary" onClick={() => { setOg({ ...blankGate(), trucker: r.parkIn?.trucker ?? '' }); setOut(r); }}>Park out</Button>}</span>; } },
      ]} toolbar={<>
        {/* Staff review 1.2: park state and billing state filtered separately (every parked-out unit is billed on park-out). */}
        <Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" options={[{ value: 'Parked', label: 'Parked (in the depot)' }, { value: 'Parked out', label: 'Parked out' }, { value: 'Unbilled', label: 'Unbilled' }, { value: 'Billed', label: 'Billed (Debit Memo)' }]} />
        <Select aria-label="Depot" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All depots" options={branchOptions} />
        <Select aria-label="Client" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} placeholder="All clients" options={clientOptions} />
      </>} />
      <p className="mt-2 text-xs text-muted">Daily rate {formatPhp(rate)}/day and handling-in {formatPhp(handlingIn)} per trailer ({handlingAtIn ? 'billed at park-in' : 'billed at park-out'}) from configuration (System settings → Allocation). Amounts are VAT-{vatBasis}; repair charges come from the job order (actual parts + labor once it is closed). Long stays: {longStay === 'monthly_interim' ? 'interim Debit Memo every 30 days, the park-out bill deducts what was already billed' : 'billed once at park-out'}. The VAT basis, handling-in amount / timing and long-stay rule are proposed values pending Finance approval. Park &amp; Repair and Fix only rows show their job order under Service; an overridden rate shows an “override” tag. Click a trailer number for the full record and the itemized charges.</p>
      <Modal open={open} onClose={() => setOpen(false)} title="Park-in" size="xl" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={parkIn.isPending} disabled={!v.chassisNo || !v.clientCode} onClick={() => parkIn.mutate(undefined)}>Park in &amp; print receipt</Button></>}>
        <Stack>
          {parkIn.error && <Banner tone="danger">{errMessage(parkIn.error)}</Banner>}
          <FormSection title="Client-owned trailer" description="Client trailers are not in the Delbros fleet: they never appear in Available, allocation or DCIR fleet totals.">
            <FormGrid cols={3}>
              <Input label="Trailer / chassis no." required value={v.chassisNo} placeholder="Client's own trailer no., e.g. TRL-0042" error={fieldError(parkIn.error, 'chassisNo')} onChange={(e) => setV({ ...v, chassisNo: e.target.value.toUpperCase() })} />
              <Input label="Plate no." required value={v.plateNo} placeholder="e.g. ABC 1234" error={fieldError(parkIn.error, 'plateNo')} onChange={(e) => setV({ ...v, plateNo: e.target.value.toUpperCase() })} />
              <Select label="Type" required value={v.chassisType} error={fieldError(parkIn.error, 'chassisType')} onChange={(e) => setV({ ...v, chassisType: e.target.value })} placeholder="Select" options={eqOptions} />
              <Select label="Client" required value={v.clientCode} error={fieldError(parkIn.error, 'clientCode')} onChange={(e) => setV({ ...v, clientCode: e.target.value })} placeholder="Select" options={clientOptions} />
              <Select label="Depot / branch" required value={v.branchCode} onChange={(e) => setV({ ...v, branchCode: e.target.value })} options={branchOptions} />
              <Input label="Expected park-out" type="date" min={today()} value={v.expectedParkOut} error={fieldError(parkIn.error, 'expectedParkOut')} onChange={(e) => setV({ ...v, expectedParkOut: e.target.value })} />
              <Input label="Parking agreement / reference" value={v.agreementRef} placeholder="Client's agreement or PO no., if any" hint="Optional — printed on the receipt" onChange={(e) => setV({ ...v, agreementRef: e.target.value })} />
              <ReadField label="Park-in time · received by · receipt"><span className="text-sm text-muted">Set on save: now · {user?.name ?? 'you'} · next PFR-IN no.</span></ReadField>
            </FormGrid>
          </FormSection>
          <FormSection title="Service & rate" actions={<Segmented value={v.service} onChange={(s) => setV({ ...v, service: s })} options={[{ value: 'Park only', label: 'Park only' }, { value: 'Park & Repair', label: 'Park & Repair' }, { value: 'Fix only', label: 'Fix only (proposed)' }]} />}>
            <Stack>
              {v.service === 'Fix only' && <Banner tone="info" title="Fix only — repair with no parking fee (proposed)">The legacy “Fix only” transaction: a chargeable Draft Job Order is created and no parking charge is generated; the park-out bill carries the handling-in and repair charges only. Whether Fix only stays in scope (or is a standalone chargeable Job Order) is pending Delbros confirmation.</Banner>}
              {v.service !== 'Park only' ? <div className="flex flex-wrap gap-3">{REPAIR_CATEGORIES.map((k) => <Checkbox key={k} label={k} checked={v.repairCategories.includes(k)} onChange={(e) => setV({ ...v, repairCategories: e.target.checked ? [...v.repairCategories, k] : v.repairCategories.filter((x) => x !== k) })} />)}<p className="w-full text-xs text-muted">A chargeable Draft Job Order is created and linked (its JO number shows in the success message, on the list and on the receipt); it follows the normal JO approval chain.</p>
                {/* Staff review 1.2: what Park & Repair adds — repair description and an estimate for the client. */}
                <div className="grid w-full gap-4 md:grid-cols-3"><div className="md:col-span-2"><Textarea label="Repair requested" required rows={2} value={v.repairScope} placeholder="e.g. Replace left tail light, check brake lining" error={fieldError(parkIn.error, 'repairScope')} onChange={(e) => setV({ ...v, repairScope: e.target.value })} /></div>
                  <MoneyInput label="Estimated repair cost" value={v.repairEstimate || ''} hint="Optional — firm cost comes from the job order" error={fieldError(parkIn.error, 'repairEstimate')} onChange={(e) => setV({ ...v, repairEstimate: Number(e.target.value) || 0 })} /></div></div> : null}
              <FormGrid cols={3}>
                {/* V1.4 row 22: handling-in charge (configured, proposed) — shown at park-in and carried to the receipt and the bill. */}
                <ReadField label="Handling-in charge"><span className="text-sm"><b className="tabular">{formatPhp(handlingIn)}</b> per trailer · {handlingAtIn ? 'billed now, on its own Debit Memo' : 'billed with the park-out Debit Memo'}<span className="block text-xs text-muted">Configured (System settings → Allocation); amount and timing pending Finance approval. VAT-{vatBasis}.</span></span></ReadField>
                {v.service === 'Park only' && <Select label="Reason" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value as typeof v.reason })} options={['Idle', 'Awaiting Repair', 'Client Request'].map((x) => ({ value: x, label: x }))} />}
                <MoneyInput label="Daily rate" type="text" value={rateFocus ? String(v.dailyRate || '') : v.dailyRate.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} onFocus={() => setRateFocus(true)} onBlur={() => setRateFocus(false)} disabled={!canOverride} error={fieldError(parkIn.error, 'dailyRate')} hint={`${canOverride ? `Configured ${formatPhp(rate)} — overriding needs a reason` : `From configuration (${formatPhp(rate)})`}. Per started day; VAT basis pending confirmation.`} onChange={(e) => { const n = Number(e.target.value.replace(/[^\d.]/g, '')); setV({ ...v, dailyRate: Number.isFinite(n) ? n : 0 }); }} />
                {v.dailyRate !== rate && <Input label="Override reason" required value={v.rateOverrideReason} placeholder="Why the rate differs (kept in the audit trail)" error={fieldError(parkIn.error, 'rateOverrideReason')} onChange={(e) => setV({ ...v, rateOverrideReason: e.target.value })} />}
              </FormGrid>
            </Stack>
          </FormSection>
          <GateFields g={g} setG={setG} error={parkIn.error} />
        </Stack>
      </Modal>
      <Modal open={!!out} onClose={() => setOut(null)} title={`Park-out · ${out?.chassisNo}`} size="xl" footer={<><Button variant="secondary" onClick={() => setOut(null)}>Cancel</Button><Button loading={parkOut.isPending} onClick={() => parkOut.mutate(undefined)}>Park out, bill &amp; print receipt</Button></>}>
        {out && <Stack>
          {parkOut.error && <Banner tone="danger">{errMessage(parkOut.error)}</Banner>}
          <KeyValueGrid items={[{ label: 'Client', value: out.clientName }, { label: 'Park-in', value: formatDateTime(out.parkInAt) }, { label: 'Park-out (now)', value: formatDateTime(new Date().toISOString()) }, { label: 'Final days × rate', value: <b>{out.service === 'Fix only' ? 'Fix only — no parking fee' : `${outDays} × ${formatPhp(out.dailyRate)} = ${formatPhp(outDays * out.dailyRate)}`}</b> }]} />
          {out.joNo && out.joStatus && !out.joStatus.startsWith('Closed') && <Banner tone="warning">Job order {out.joNo} is still {out.joStatus}. Confirm the client accepts release before repairs are closed — the repair line below is not final until the job order is closed.</Banner>}
          {/* V1.4 rows 23 / 54: the itemized bill the Debit Memo will carry. */}
          <ParkCharges r={{ ...out, days: outDays, charges: { ...out.charges, park: out.service === 'Fix only' ? 0 : outDays * out.dailyRate } }} />
          <p className="text-xs text-muted">On park-out the charges are recalculated at this moment (days, closed job order cost), stored on the record and posted to billing as one Debit Memo with this breakdown; the park-out receipt is generated.</p>
          <GateFields g={og} setG={setOg} error={parkOut.error} />
        </Stack>}
      </Modal>
      {/* Staff review 1.2: Park & Fix detail — trailer, service, billing, and both gate receipts (trucker, OR/CR, driver, condition). */}
      <Modal open={!!vr} onClose={() => setView(null)} title={`Park & Fix ${vr?.id ?? ''} · ${vr?.chassisNo ?? ''}`} description={vr ? `${vr.clientName} · ${vr.branchCode}` : undefined} size="xl"
        footer={vr && <><Button variant="ghost" icon={<Receipt className="size-4" />} onClick={() => { reprint.mutate({ id: vr.id, which: 'in' }); setReceipt({ id: vr.id, which: 'in' }); setView(null); }}>In receipt</Button>
          {vr.status === 'Released' && <Button variant="ghost" icon={<Receipt className="size-4" />} onClick={() => { reprint.mutate({ id: vr.id, which: 'out' }); setReceipt({ id: vr.id, which: 'out' }); setView(null); }}>Out receipt</Button>}
          {vr.status === 'Parked' && can('alloc.parkfix', 'edit') && <Button variant="secondary" onClick={() => { setOg({ ...blankGate(), trucker: vr.parkIn?.trucker ?? '' }); setOut(vr); setView(null); }}>Park out</Button>}
          {!vr.dymSignoff && can('alloc.parkfix', 'check') && <Button variant="secondary" onClick={() => setDym(vr)}>DYM sign-off</Button>}
          <Button onClick={() => setView(null)}>Close</Button></>}>
        {vr && <Stack>
          <KeyValueGrid cols={3} items={[
            { label: 'Trailer', value: `${vr.chassisNo} · ${vr.plateNo ?? '—'} · ${eqName(vr.chassisType)}${vr.clientOwned ? ' (client-owned)' : ''}` },
            { label: 'Client / depot', value: `${vr.clientName} · ${vr.branchCode}` }, { label: 'Agreement / reference', value: vr.agreementRef ?? '—' },
            { label: 'Service / reason', value: `${vr.service ?? 'Park only'} · ${vr.reason}` },
            { label: 'Job order', value: vr.joNo ? <Link to={`/repair/jo/${vr.joNo}`} className="text-brand-700 hover:underline">{vr.joNo} · {vr.joStatus ?? '—'}</Link> : '—' },
            { label: 'Repair requested / estimate', value: vr.repairScope ? `${vr.repairScope}${vr.repairEstimate ? ` · est. ${formatPhp(vr.repairEstimate)}` : ''}` : '—' },
            { label: 'Park-in', value: `${formatDateTime(vr.parkInAt)} · ${vr.inReceiptNo ?? '—'}` },
            { label: vr.parkOutAt ? 'Park-out' : 'Expected park-out', value: vr.parkOutAt ? `${formatDateTime(vr.parkOutAt)} · ${vr.outReceiptNo ?? '—'}` : formatDate(vr.expectedParkOut) },
            { label: 'Daily rate', value: <span>{formatPhp(vr.dailyRate)}{vr.rateOverrideReason ? <> <Badge tone="warning" dot={false}>override</Badge> <span className="text-xs text-muted">{vr.rateOverrideReason}</span></> : <span className="text-xs text-muted"> (configured)</span>}</span> },
            { label: 'Park charge', value: vr.service === 'Fix only' ? 'None — Fix only' : `${vr.days} d × ${formatPhp(vr.dailyRate)} = ${formatPhp(vr.charges.park)}` },
            { label: vr.status === 'Released' ? 'Total billed' : 'Estimated total to date', value: `${formatPhp(vr.status === 'Released' ? vr.billedAmount ?? vr.amountToDate : vr.amountToDate)} (handling + repair + park, VAT-${vr.charges.vatBasis} — see Charges)` },
            { label: 'Billing', value: vr.debitMemoNo ? <Link to={`/billing/memos?q=${vr.debitMemoNo}`} className="text-brand-700 hover:underline">{vr.debitMemoNo} · {formatPhp(vr.billedAmount)}</Link> : vr.billingStatus },
            { label: 'Receipt reprints', value: String(vr.reprintCount ?? 0) },
            { label: 'Last client (previous visit)', value: vr.lastClient ? `${vr.lastClient.clientName} · ${vr.lastClient.id}${vr.lastClient.parkOutAt ? ` · out ${formatDate(vr.lastClient.parkOutAt)}` : ''}` : 'First visit (proposed meaning — pending confirmation)' },
            // V1.4 row 21: Deputy Yard Manager sign-off (legacy receipt).
            { label: 'Deputy Yard Manager sign-off', value: vr.dymSignoff ? `${userName(vr.dymSignoff.by)} · ${formatDateTime(vr.dymSignoff.at)}` : <span className="text-warning">Not signed yet</span> },
          ]} />
          <FormSection title="Charges" description="Handling, Repair, Park charge, VAT and Total — the same figures as the receipt and the Debit Memo."><ParkCharges r={vr} /></FormSection>
          <FormSection title={`Park-in receipt ${vr.inReceiptNo ?? ''}`}><KeyValueGrid cols={4} items={gateItems(vr.parkIn)} /></FormSection>
          {vr.parkOut && <FormSection title={`Park-out receipt ${vr.outReceiptNo ?? ''}`}><KeyValueGrid cols={4} items={gateItems(vr.parkOut)} /></FormSection>}
        </Stack>}
      </Modal>
      <PrintPreview open={!!rec} onClose={() => setReceipt(null)} title="Park & Fix receipt">{rec && receipt && <ParkReceipt r={rec} which={receipt.which} eqName={eqName} userName={userName} />}</PrintPreview>
      <ConfirmDialog open={!!dym} onClose={() => setDym(null)} loading={dymSign.isPending} confirmLabel="Sign off" title={`Deputy Yard Manager sign-off — ${dym?.chassisNo ?? ''}`} onConfirm={() => dymSign.mutate(undefined)}
        message="Records your sign-off (name, date and time) on this Park & Fix record; it prints in the “Noted by (Deputy Yard Manager)” box of the park-in and park-out receipts, as on the legacy receipt. Recorded in the audit log." />
    </>
  );
}
