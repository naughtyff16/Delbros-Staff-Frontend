import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowDownToLine, CheckCircle2, Eye, KeyRound, Paperclip, Plus, Search, ShieldCheck, Skull } from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';
import { formatDate, formatDateTime, formatPhp, lateEncodingPath, REPAIR_CATEGORIES, type Assessment, type RepairCategory } from '../../lib/shared';
import {
  ApprovalTimeline, Badge, Banner, Button, Card, CardHeader, DataTable, DateRangeFilter, Drawer, FormGrid, FormSection, InspectionChecklist, Input, KeyValueGrid, Modal, MoneyInput, PageHeader, Segmented, Select, SignaturePad, Stack, StatusBadge, Textarea, cn,
} from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, fieldError, useAction, useData, useRefLookups } from '../../shared/hooks';
import { ScreenTag } from '../../shared/components';
import { blankChecklist, checklistFor, ClientFlag, DecideDialog, outDateInfo, PhotoInput } from './pages';

// Units currently out on hire — one click starts the Gate In for that gate pass.
function OnHirePicker({ onPick }: { onPick: (gatePassNo: string) => void }) {
  const data = useData(['eirs', 'on-hire'], () => api.gate.eirs({ status: 'On Hire' }));
  const { eqName } = useRefLookups();
  type Row = NonNullable<typeof data.data>[number];
  if (data.error) return null;
  return (
    <div>
      {/* Staff review 1.2: total on hire, equipment type, contract and trucker; the out date follows the late-encoding rule shared with the EIR list. */}
      <h2 className="mb-2 text-sm font-semibold text-ink">Units currently on hire{data.data ? ` (${data.data.length})` : ''} <span className="font-normal text-muted">· newest gate-out first · the driver and truck shown are from the Gate Out; the returning driver and truck are confirmed on Receive</span></h2>
      <DataTable<Row> data={data.data} loading={data.isLoading} pageSize={10} searchPlaceholder="Chassis, client, gate pass…" emptyTitle="No units are out on hire" onRowClick={(r) => onPick(r.gatePassOutNo)} columns={[
        { accessorKey: 'chassisNo', header: 'Chassis / type', cell: (c) => <span className="whitespace-nowrap"><span className="font-mono font-medium">{c.getValue<string>()}</span><span className="block text-xs text-muted">{eqName(c.row.original.chassisType)}</span></span> },
        { accessorKey: 'clientName', header: 'Client / contract', cell: (c) => <span>{c.getValue<string>()}<span className="block whitespace-nowrap font-mono text-xs text-muted">{c.row.original.contractNo}</span></span> },
        { accessorKey: 'gatePassOutNo', header: 'Gate pass out', cell: (c) => <span className="whitespace-nowrap font-mono">{c.getValue<string>()}</span> },
        { accessorKey: 'depotCode', header: 'Origin' },
        { id: 'since', accessorFn: (r) => outDateInfo(r).at, header: 'Out since', cell: (c) => { const od = outDateInfo(c.row.original); return <span className="whitespace-nowrap">{formatDateTime(od.at)}{od.note && <span className={cn('block text-xs', od.pending ? 'text-warning' : 'text-muted')}>{od.note}</span>}</span>; } },
        { id: 'days', accessorFn: (r) => outDateInfo(r).days, header: 'Days on hire', meta: { align: 'right' }, cell: (c) => <span className="tabular">{c.getValue<number>()}</span> },
        { accessorKey: 'driverName', header: 'Driver / truck / trucker', cell: (c) => <span className="whitespace-nowrap">{c.getValue<string>()}<span className="block text-xs text-muted">{c.row.original.out?.truckPlateNo} · {c.row.original.out?.trucker}</span></span> },
        { id: 'a', header: '', cell: (c) => <div className="flex justify-end"><Button size="sm" variant="secondary" icon={<ArrowDownToLine className="size-4" />} onClick={(e) => { e.stopPropagation(); onPick(c.row.original.gatePassOutNo); }}>Receive</Button></div> },
      ]} />
    </div>
  );
}

// ── SCR-16 Gate In Processing (Inbound, GP2 IN Rev.2) ──────────────────────
export function GateInPage() {
  const { user, can } = useAuth();
  const { branchOptions, eqName, userName } = useRefLookups();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Awaited<ReturnType<typeof api.gate.lookupInbound>> | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [returnBranch, setReturnBranch] = useState(user?.branchCode !== 'HO' ? user?.branchCode ?? 'MNL' : 'MNL');
  const blankV = { truckPlateNo: '', trucker: '', truckOrcr: '', driverName: '', driverLicenseNo: '', flatTires: 0, vandalized: false, crossBranchCode: '' };
  const [v, setV] = useState(blankV);
  const [hasFlat, setHasFlat] = useState(false);
  const [assessment, setAssessment] = useState<Assessment>('Roadworthy');
  const [cats, setCats] = useState<RepairCategory[]>([]);
  const [lines, setLines] = useState(blankChecklist);
  const [sig, setSig] = useState<string>();
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [done, setDone] = useState<Awaited<ReturnType<typeof api.gate.gateIn>> | null>(null);
  const [force, setForce] = useState(false);

  const find = () => lookup(q);
  const lookup = async (key: string) => {
    setErr(null); setFound(null);
    try {
      const r = await api.gate.lookupInbound(key); const c = r.inboundCredentials ?? r.out;
      setFound(r); setV((x) => ({ ...x, truckPlateNo: c.truckPlateNo, trucker: c.trucker, truckOrcr: '', driverName: c.driverName, driverLicenseNo: c.driverLicenseNo }));
      setLines(checklistFor(r.chassis.axleConfig)); // 3-axle units add the L3 / R3 tires
    } catch (e) { setErr(e as ApiError); }
  };
  const cross = !!found && returnBranch !== found.out.branchCode;
  const code = useAction(() => api.gate.requestCrossBranchCode(found!.out.chassisNo, returnBranch), { success: (c) => `Approval code issued: ${c}`, onSuccess: (c) => setV((x) => ({ ...x, crossBranchCode: c })) });
  const submit = useAction(() => api.gate.gateIn({ outGatePassNo: found!.out.gatePassNo, returnBranchCode: returnBranch, ...v, flatTires: hasFlat ? v.flatTires : 0, inspection: lines, generalAssessment: assessment, categories: cats, signature: sig, remarks, photos }), { success: 'Inbound recorded', onSuccess: setDone });
  const charge = lines.reduce((a, l) => a + (l.chargeable || 0), 0);
  const missing = [!v.truckPlateNo.trim() && 'truck plate', !v.driverName.trim() && 'driver name', !v.driverLicenseNo.trim() && 'driver licence no.', hasFlat && !(v.flatTires > 0) && 'flat tire count',
    assessment === 'Unroadworthy' && !cats.length && 'repair system', cross && !v.crossBranchCode && 'cross-branch code', !sig && 'driver signature'].filter(Boolean) as string[];
  const reset = () => { setDone(null); setFound(null); setQ(''); setLines(blankChecklist()); setAssessment('Roadworthy'); setCats([]); setSig(undefined); setRemarks(''); setPhotos([]); setHasFlat(false); setV(blankV); };

  if (done) return (
    <div className="max-w-2xl">
      <PageHeader title="Return recorded" meta={<ScreenTag id="SCR-16" />} />
      <Card><Stack>
        <div className="flex items-center gap-3"><CheckCircle2 className="size-10 text-success" /><div><p className="text-lg font-semibold">Inbound gate pass <span className="font-mono">{done.gatePassNo}</span></p><p className="text-sm text-muted">Paired with gate out {done.outGatePassNo} · inbound EIR {done.eirNo}</p></div></div>
        <KeyValueGrid cols={2} items={[
          { label: 'Billing', value: `On-hire billing stopped at ${formatDateTime(done.billingStoppedAt)}` },
          { label: 'Chassis status', value: <StatusBadge domain="chassis" value={done.chassisStatus} /> },
          { label: 'Now held at branch', value: done.branchCode },
          { label: 'Chargeable damages', value: done.chargeable ? `${formatPhp(done.chargeable)} — added to the client's next invoice` : 'None' },
          { label: 'Received by', value: user?.name }, { label: 'Recorded at', value: formatDateTime(new Date().toISOString()) },
        ]} />
        {done.joNos?.length ? <Banner tone="warning" title="Unroadworthy → Breakdown">Draft job order{done.joNos.length > 1 ? 's' : ''} {done.joNos.map((j, i) => <span key={j}>{i > 0 && ', '}<Link className="font-semibold text-brand-700 underline" to={`/repair/jo/${j}`}>{j}</Link></span>)} created (one per repair system). Branch Generalist and DYM notified; approval chain started (BG → DYM).</Banner> : null}
        <div className="flex gap-2"><Link to={`/gate/eir?q=${done.eirNo}`}><Button variant="secondary">View / print EIR</Button></Link><Button onClick={reset}>Next return</Button></div>
      </Stack></Card>
    </div>
  );

  return (
    <div className="max-w-6xl">
      <PageHeader title="Gate In — inbound" meta={<ScreenTag id="SCR-16" />} description="Record a returned unit and its condition. Returns are never blocked by a credit hold."
        actions={can('gate.force_inbound', 'add') && <Button variant="secondary" icon={<Skull className="size-4" />} onClick={() => setForce(true)}>Force inbound…</Button>} />
      <Stack>
        <Card>
          <CardHeader title="Find the unit being returned" description="Scan or type the gate pass or chassis number, or pick a unit from the on-hire list below." />
          <div className="grid gap-3 sm:grid-cols-[18rem_minmax(0,1fr)_auto] sm:items-end">
            <Select label="Returning branch" value={returnBranch} onChange={(e) => setReturnBranch(e.target.value)} options={branchOptions} />
            <Input label="Gate pass # or chassis #" placeholder="e.g. GP-MNL-000900 or DW-MNL-1003" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && q.trim() && find()} autoFocus />
            <Button icon={<Search className="size-4" />} onClick={find} disabled={!q.trim()}>Find open gate-out</Button>
          </div>
          <p className="mt-2 text-xs text-muted">If the returning branch differs from the origin branch, the chassis moves to the returning branch (cross-branch code required).</p>
          {err && <Banner className="mt-3" tone="danger" title={err.code === 'NOT_FOUND' ? 'No open Gate Out found' : err.code}>{`${err.message} Check the number, or use Force Inbound / Late Encoding for exceptions.`}</Banner>}
        </Card>
        {!found && <OnHirePicker onPick={(no) => { setQ(no); void lookup(no); }} />}
        {found && (
          <>
            <Card>
              <CardHeader title={<span className="font-mono">{found.chassis.chassisNo}</span>} description={found.clientName} actions={<StatusBadge domain="chassis" value={found.chassis.status} />} />
              <KeyValueGrid items={[{ label: 'Type', value: eqName(found.chassis.chassisType) }, { label: 'Contract', value: found.out.contractNo }, { label: 'Gate out', value: `${found.out.gatePassNo} · ${formatDateTime(found.out.actualEventAt)}` }, { label: 'Origin branch', value: found.out.branchCode },
                { label: 'EWA', value: found.out.euNo ?? '—' }, { label: 'Inbound gate pass no.', value: <span className="font-mono">GP-{returnBranch}-###### <span className="font-sans text-xs text-muted">(assigned on finalise)</span></span> },
                { label: 'Receiving user', value: userName(user?.userId) }, { label: 'Return time', value: 'Captured automatically on finalise' },
                // Staff review 1.2: the EIR of this cycle (the inbound leg is added to it), days on hire and the client's account status.
                { label: 'EIR no.', value: <span className="font-mono">{found.out.eirNo} <span className="font-sans text-xs text-muted">(inbound leg added on finalise)</span></span> },
                { label: 'Days on hire', value: Math.max(0, Math.floor((Date.now() - new Date(found.out.actualEventAt).getTime()) / 86_400_000)) },
                { label: 'Client account', value: found.clientStatus && found.clientStatus !== 'Active' ? <span>{found.clientStatus}<ClientFlag status={found.clientStatus} /><span className="block text-xs text-muted">Return accepted — a hold never blocks a return (BR-01)</span></span> : 'Active' },
                ...(found.lateEncoding ? [{ label: 'Late-encoded gate out', value: <span>{found.lateEncoding.id} · {found.lateEncoding.daysLate} days<span className="block text-xs text-muted">{found.lateEncoding.path === 'AUTO' ? 'Billing auto-corrected to the actual date' : found.lateEncoding.status === 'Pending Approval' ? `Credit Memo pending — actual ${formatDateTime(found.lateEncoding.correctedDate)}` : `Credit Memo ${found.lateEncoding.status.toLowerCase()}`}</span></span> }] : [])]} />
            </Card>
            {cross && (
              <Banner tone="warning" title="Cross-branch return" actions={<Button size="sm" variant="secondary" icon={<KeyRound className="size-4" />} loading={code.isPending} onClick={() => code.mutate(undefined)}>Request code</Button>}>
                {`Return branch ${returnBranch} differs from origin ${found.out.branchCode}. An IT-issued approval code (BG → Regional/Ops Manager → APS → IT) is required. On finalise the chassis is transferred to ${returnBranch}. `}<span className="text-xs">(Demo issues the code immediately.)</span>
              </Banner>
            )}
            <FormSection title="Truck & condition" description={found.inboundCredentials ? 'Pre-filled from the inbound-leg credentials on the EWA.' : 'Pre-filled from the gate out; update if a different driver returns the unit.'}>
              <FormGrid cols={3}>
                <Input label="Truck plate" required value={v.truckPlateNo} onChange={(e) => setV({ ...v, truckPlateNo: e.target.value })} placeholder="e.g. ABC 1234" />
                <Input label="Trucker" value={v.trucker} onChange={(e) => setV({ ...v, trucker: e.target.value })} placeholder="e.g. XYZ Trucking" />
                <Input label="Truck OR/CR (vehicle registration)" value={v.truckOrcr} onChange={(e) => setV({ ...v, truckOrcr: e.target.value })} placeholder="e.g. OR 4100200 / CR 5200300" hint="Optional at return — whether it is required is pending confirmation." />
                <Input label="Driver name" required value={v.driverName} onChange={(e) => setV({ ...v, driverName: e.target.value })} placeholder="e.g. Juan Dela Cruz" />
                <Input label="Driver licence no." required value={v.driverLicenseNo} onChange={(e) => setV({ ...v, driverLicenseNo: e.target.value })} placeholder="e.g. N01-23-456789" />
                <Select label="Flat tires" value={hasFlat ? 'Y' : 'N'} onChange={(e) => setHasFlat(e.target.value === 'Y')} options={[{ value: 'N', label: 'No' }, { value: 'Y', label: 'Yes' }]} />
                <Input label="Flat tires (count)" type="number" min={0} disabled={!hasFlat} required={hasFlat} value={hasFlat ? v.flatTires : 0} onChange={(e) => setV({ ...v, flatTires: Number(e.target.value) })} placeholder="e.g. 2" />
                <Select label="Vandalized" value={v.vandalized ? 'Y' : 'N'} onChange={(e) => setV({ ...v, vandalized: e.target.value === 'Y' })} options={[{ value: 'N', label: 'No' }, { value: 'Y', label: 'Yes' }]} />
                {cross && <Input label="Cross-branch approval code" required value={v.crossBranchCode} onChange={(e) => setV({ ...v, crossBranchCode: e.target.value.toUpperCase() })} placeholder="6-character code from IT, e.g. K7Q2XM" error={fieldError(submit.error, 'crossBranchCode')} />}
              </FormGrid>
            </FormSection>
            <FormSection title="Parts status" description={`Status per part: OK, Damaged, Missing, Worn or Replaced. A part that is not OK can carry a chargeable amount, added to the client's next invoice; price source (standard parts & tire list) and editability pending confirmation.${found.chassis.axleConfig === '3-axle' ? ' 3-axle unit: L3 / R3 tires included (12 tires).' : ''}`}>
              <InspectionChecklist lines={lines} onChange={setLines} />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Textarea label="Condition notes / remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Flat tires, vandalism, missing parts… printed on the inbound EIR" />
                <PhotoInput value={photos} onChange={setPhotos} />
              </div>
            </FormSection>
            <FormSection title="General assessment" actions={<Segmented value={assessment} onChange={setAssessment} options={[{ value: 'Roadworthy', label: 'Roadworthy' }, { value: 'Unroadworthy', label: 'Unroadworthy' }]} />}>
              {assessment === 'Roadworthy' ? <p className="text-sm text-ink-2">Chassis returns to <StatusBadge domain="chassis" value="Available" />.</p> : (
                <Stack>
                  <p className="text-sm text-ink-2">Chassis moves to <StatusBadge domain="chassis" value="Breakdown" />. Select at least one repair system — a separate Draft job order is created for each; Branch Generalist and DYM are notified.</p>
                  <div className="flex flex-wrap gap-2">{REPAIR_CATEGORIES.map((c) => (
                    <button key={c} type="button" aria-pressed={cats.includes(c)} onClick={() => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])} className={cn('rounded-lg border px-3 py-1.5 text-sm', cats.includes(c) ? 'border-danger bg-danger-bg text-danger' : 'border-line-strong text-ink-2')}>{c}</button>
                  ))}</div>
                  {!cats.length && <p className="text-xs text-danger">Select at least one repair system.</p>}
                </Stack>
              )}
            </FormSection>
            <Card><SignaturePad value={sig} onChange={setSig} /></Card>
            {/* Staff review 1.2: full "On finalise" summary — what will happen, with the numbers that will be used. */}
            <Banner tone="info" title="On finalise">
              <ul className="list-disc space-y-0.5 pl-5">
                <li>Inbound gate pass GP-{returnBranch}-###### is assigned and the inbound leg is added to EIR {found.out.eirNo} (printable from EIR view / reprint).</li>
                <li>On-hire billing for {found.out.contractNo} stops at the actual return time.</li>
                <li>Chassis status becomes {assessment === 'Roadworthy' ? 'Available' : `Breakdown, with ${cats.length || 'one'} Draft job order${cats.length > 1 ? 's' : ''} for R&M (BG → DYM approval)`}{cross ? `, and the unit is transferred to ${returnBranch} (chassis number unchanged)` : ''}.</li>
                <li>{charge > 0 ? `Chargeable damages of ${formatPhp(charge)} are added to the client's next invoice.` : 'No chargeable damages recorded.'}</li>
              </ul>
            </Banner>
            {submit.error && <Banner tone="danger" title={(submit.error as ApiError).code}>{errMessage(submit.error)}</Banner>}
            <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
              {missing.length > 0 && <span className="mr-auto text-xs text-muted">Required: {missing.join(', ')}</span>}
              {charge > 0 && <Badge tone="warning">Chargeable damages {formatPhp(charge)}</Badge>}
              <Button variant="secondary" onClick={reset}>Cancel</Button>
              <Button size="lg" icon={<ArrowDownToLine className="size-4" />} loading={submit.isPending} disabled={missing.length > 0} onClick={() => submit.mutate(undefined)}>Finalise inbound & generate EIR</Button>
            </div>
          </>
        )}
      </Stack>
      {force && <ForceInboundModal onClose={() => setForce(false)} />}
    </div>
  );
}

/** SUP-08 Force Inbound request (UC-12, BR-17, WF-12). */
function ForceInboundModal({ onClose }: { onClose: () => void }) {
  const { eqName } = useRefLookups();
  const [v, setV] = useState({ chassisNo: '', indemnity: 0, ref: '', reason: '', reasonType: 'Loss' as 'Loss' | 'Non-return', lossDate: '', lastLocation: '', settlementType: 'Indemnity' as 'Indemnity' | 'Replacement', replacementChassisNo: '' });
  const [files, setFiles] = useState<string[]>([]);
  // Staff review 1.2: pick from the units on hire; the unit details, contract indemnity value and the client's outstanding balance fill in.
  const onHire = useData(['eirs', 'on-hire'], () => api.gate.eirs({ status: 'On Hire' }));
  const ctx = useData(['force-inbound-ctx', v.chassisNo], () => api.gate.forceInboundContext(v.chassisNo), !!v.chassisNo);
  const u = ctx.data;
  const replacement = v.settlementType === 'Replacement';
  const need = [!v.chassisNo && 'chassis', replacement ? !v.replacementChassisNo.trim() && 'replacement chassis no.' : !(v.indemnity > 0) && 'indemnity amount', !v.ref.trim() && 'settlement reference', !v.reason.trim() && 'reason'].filter(Boolean) as string[];
  const act = useAction(() => api.gate.requestForceInbound(v.chassisNo, replacement ? 0 : v.indemnity, v.ref, v.reason,
    { reasonType: v.reasonType, lossDate: v.lossDate || undefined, lastLocation: v.lastLocation.trim() || undefined, settlementType: v.settlementType, replacementChassisNo: replacement ? v.replacementChassisNo.trim().toUpperCase() : undefined, attachments: files.length ? files : undefined }),
    { success: 'Force inbound submitted — APS → Ops Manager → VP → President', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title="Force inbound request" size="lg" description="For loss / non-return only, after full client indemnity or replacement settlement. On final (President) approval billing stops, the EIR is closed as Force Inbound and the chassis is retired."
      footer={<>{need.length > 0 && <span className="mr-auto text-xs text-muted">Required: {need.join(', ')}</span>}<Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" loading={act.isPending} disabled={need.length > 0 || !u} onClick={() => act.mutate(undefined)}>Submit for approval</Button></>}>
      <Stack>
        <FormGrid>
          <Select label="Chassis no. (on hire)" required value={v.chassisNo} onChange={(e) => setV({ ...v, chassisNo: e.target.value })} placeholder={onHire.isLoading ? 'Loading…' : 'Select a unit on hire'} wrapperClassName="md:col-span-2"
            options={(onHire.data ?? []).map((r) => ({ value: r.chassisNo, label: `${r.chassisNo} · ${eqName(r.chassisType)} · ${r.clientName} · ${r.gatePassOutNo}` }))} hint="Only units currently on hire are listed (e.g. DW-MNL-1004)." />
        </FormGrid>
        {ctx.error && <Banner tone="danger">{errMessage(ctx.error)}</Banner>}
        {u && <div className="rounded-lg border border-line bg-surface-alt/50 px-3 py-2">
          <KeyValueGrid items={[{ label: 'Client', value: <>{u.clientName}<ClientFlag status={u.clientStatus} /></> }, { label: 'Contract', value: u.contractNo ?? '—' }, { label: 'Type', value: eqName(u.chassisType) }, { label: 'Origin branch', value: u.originBranch },
            { label: 'Gate pass out', value: <span className="font-mono">{u.gatePassNo ?? '—'}</span> }, { label: 'Out since', value: formatDateTime(u.outSince) }, { label: 'Days on hire', value: u.daysOnHire },
            { label: 'Unit value (contract indemnity)', value: u.indemnityValue != null ? formatPhp(u.indemnityValue) : '—' }, { label: 'Client outstanding balance', value: formatPhp(u.outstanding) }]} />
        </div>}
        <FormGrid>
          <Segmented value={v.reasonType} onChange={(r) => setV({ ...v, reasonType: r })} options={[{ value: 'Loss', label: 'Loss (lost / stolen / total loss)' }, { value: 'Non-return', label: 'Non-return' }]} />
          <span />
          <Input label={v.reasonType === 'Loss' ? 'Date of loss' : 'Last contact / due date'} type="date" value={v.lossDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setV({ ...v, lossDate: e.target.value })} />
          <Input label="Last known location" value={v.lastLocation} onChange={(e) => setV({ ...v, lastLocation: e.target.value })} placeholder="e.g. SLEX km 32, Sta. Rosa" />
        </FormGrid>
        <FormGrid>
          <Segmented value={v.settlementType} onChange={(s) => setV({ ...v, settlementType: s })} options={[{ value: 'Indemnity', label: 'Cash indemnity' }, { value: 'Replacement', label: 'Replacement unit' }]} />
          <span />
          {replacement
            ? <Input label="Replacement chassis no." required value={v.replacementChassisNo} onChange={(e) => setV({ ...v, replacementChassisNo: e.target.value.toUpperCase() })} placeholder="Unit given by the client, e.g. CL-ABC-0001" />
            : <MoneyInput label="Indemnity settled" required value={v.indemnity || ''} onChange={(e) => setV({ ...v, indemnity: Number(e.target.value) })} hint={u?.indemnityValue != null && v.indemnity > 0 && v.indemnity < u.indemnityValue ? `Below the contract indemnity value of ${formatPhp(u.indemnityValue)}` : undefined} />}
          <Input label="Settlement reference (Official Receipt / deed)" required value={v.ref} onChange={(e) => setV({ ...v, ref: e.target.value })} placeholder={replacement ? 'e.g. deed of transfer no.' : 'e.g. OR-MNL-00000290'} />
        </FormGrid>
        <Textarea label="Reason" required value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="e.g. unit lost in transit — police report no. …; client paid indemnity in full" error={fieldError(act.error, 'reason')} />
        <div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-sm text-muted hover:bg-surface-alt">
            <Paperclip className="size-4" />Attach police report, settlement proof (optional, PDF or photo)
            <input type="file" multiple className="sr-only" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? []).map((f) => f.name)]); e.target.value = ''; }} />
          </label>
          {files.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{files.map((n, i) => <Badge key={i} tone="neutral" dot={false}>{n}<button type="button" aria-label={`Remove ${n}`} className="ml-1" onClick={() => setFiles(files.filter((_, k) => k !== i))}>×</button></Badge>)}</div>}
        </div>
        <div className="rounded-lg border border-line p-3 text-sm">
          <p className="mb-1 font-medium">Approval chain (WF-12)</p>
          <ol className="list-decimal space-y-0.5 pl-5 text-ink-2"><li>Asset & Procurement — indemnity confirmed</li><li>Operations Manager</li><li>VP</li><li>President (final)</li></ol>
          <p className="mt-1 text-xs text-muted">Each approver acts in My approvals (type “Force inbound”); who and when are recorded on each step. On final approval the chassis status becomes Killed (retired).</p>
        </div>
        {act.error && <Banner tone="danger">{errMessage(act.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

// ── SCR-18 Late Encoding Entry ──────────────────────────────────────────────
const LE_TONE: Record<string, 'success' | 'warning' | 'danger'> = { 'Auto-corrected': 'success', 'Pending DYM': 'warning', 'Pending Treasury': 'warning', Approved: 'success', Rejected: 'danger' };

export function LateEncodingPage() {
  const { can } = useAuth();
  const data = useData(['late'], () => api.gate.lateEncodings());
  const passes = useData(['gatepasses'], () => api.gate.gatePasses());
  const { setting, userName } = useRefLookups();
  const auto = Number(setting('gat.late_encoding_auto_days') ?? 7);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [decide, setDecide] = useState<{ wfId: string; title: string; approve: boolean; label: string } | null>(null);
  const blank = { gatePassNo: '', correctedDate: '', reason: '', attachment: '' };
  const [v, setV] = useState(blank);
  const gp = passes.data?.find((g) => g.gatePassNo === v.gatePassNo);
  const corrected = v.correctedDate ? new Date(v.correctedDate) : null;
  const dateErr = !corrected || !gp ? undefined : corrected > new Date() ? 'Cannot be in the future' : corrected >= new Date(gp.encodedAt) ? 'Must be earlier than the encoded date' : undefined;
  // Warning only (rule pending confirmation): an actual gate-out before the EWA was created falls outside its 24-hour validity.
  const beforeEwa = !!(gp && corrected && !dateErr && gp.direction === 'OUT' && gp.ewaCreatedAt && corrected < new Date(gp.ewaCreatedAt));
  const nowLocal = (() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); })(); // datetime-local max in the user's clock
  const preview = gp && corrected && !dateErr ? lateEncodingPath(corrected.toISOString(), gp.encodedAt, auto) : null;
  const leNeed = [!v.gatePassNo && 'transaction', !v.correctedDate && 'corrected date', !v.reason.trim() && 'reason'].filter(Boolean) as string[];
  const prior = data.data?.filter((l) => l.gatePassNo === v.gatePassNo) ?? [];
  const act = useAction(() => api.gate.recordLateEncoding(v.gatePassNo, new Date(v.correctedDate).toISOString(), v.reason, v.attachment || undefined), {
    success: (l) => (l.path === 'AUTO' ? `Auto-corrected (${l.daysLate} days)` : `Credit memo approval started (${l.daysLate} days)`), onSuccess: () => { setOpen(false); setV(blank); },
  });
  const [lf, setLf] = useState({ status: '', from: '', to: '' });
  // Merged columns carry a combined value so sorting and the CSV export keep every part.
  const rows = data.data?.filter((l) => (!lf.status || l.statusLabel === lf.status) && (!lf.from || l.createdAt.slice(0, 10) >= lf.from) && (!lf.to || l.createdAt.slice(0, 10) <= lf.to))
    .map((l) => ({ ...l, refCol: `${l.id} · ${l.gatePassNo} · ${l.direction === 'OUT' ? 'Gate Out' : 'Gate In'}`, unitCol: `${l.chassisNo} · ${l.clientName}`, datesCol: `${l.correctedDate} / ${l.originalDate}`,
      memoCol: l.memoNo ?? (l.heldLines.length ? `CM pending · ${l.heldLines.length} invoice line(s) held` : ''), recordedCol: `${userName(l.createdBy)} · ${l.createdAt}` }));
  type ListRow = NonNullable<typeof rows>[number];
  const sel = data.data?.find((l) => l.id === view);
  return (
    <>
      <PageHeader title="Late encoding" meta={<ScreenTag id="SCR-18" />} description={`≤ ${auto} days late: billing auto-corrects. Over ${auto} days: a Credit Memo needs DYM and Treasury approval.`}
        actions={can('gate.late_encoding', 'add') && <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Record late encoding</Button>} />
      <DataTable<ListRow> data={rows} loading={data.isLoading} emptyTitle="No late encodings" exportName="late-encodings" onRowClick={(r) => setView(r.id)} columns={[
        { accessorKey: 'refCol', header: 'Ref / gate pass', meta: { nowrap: true }, cell: (c) => <span className="whitespace-nowrap font-mono">{c.row.original.id}<span className="block text-xs text-muted">{c.row.original.gatePassNo} · <span className="font-sans">{c.row.original.direction === 'OUT' ? 'Out' : 'In'}</span></span></span> },
        { accessorKey: 'unitCol', header: 'Chassis / client', meta: { wrap: true }, cell: (c) => <span><span className="whitespace-nowrap font-mono">{c.row.original.chassisNo}</span><span className="block text-xs text-muted">{c.row.original.clientName}</span></span> },
        { accessorKey: 'datesCol', header: 'Actual / encoded', meta: { nowrap: true }, cell: (c) => <span className="whitespace-nowrap">{formatDateTime(c.row.original.correctedDate)}<span className="block text-xs text-muted">encoded {formatDateTime(c.row.original.originalDate)}</span></span> },
        { accessorKey: 'branchCode', header: 'Depot' },
        { accessorKey: 'daysLate', header: 'Days late', meta: { align: 'right' } },
        { accessorKey: 'reason', header: 'Reason', cell: (c) => <span><span className="line-clamp-2" title={c.getValue<string>()}>{c.getValue<string>()}</span>{c.row.original.attachment && <span className="flex items-center gap-1 text-xs text-muted" title={c.row.original.attachment}><Paperclip className="size-3" />1 attachment</span>}</span> },
        // Staff review 1.2: one label ("Approval status") on the dialog, list and detail; approver names / dates and overdue flag under it.
        { accessorKey: 'statusLabel', header: 'Approval status', meta: { nowrap: true }, cell: (c) => { const w = c.row.original.workflow; const cur = w?.status === 'Pending' ? w.steps[w.currentStep] : undefined; const late = cur?.dueAt && new Date(cur.dueAt) < new Date();
          return <span className="whitespace-nowrap"><Badge tone={LE_TONE[c.getValue<string>()]}>{c.getValue<string>()}</Badge>
            {w?.steps.filter((s) => s.decidedAt).map((s) => <span key={s.step} className="block text-xs text-muted">{s.label === 'Deputy Yard Manager' ? 'DYM' : s.label}: {s.decision.toLowerCase()} · {userName(s.decidedBy)} · {formatDate(s.decidedAt!)}</span>)}
            {late && <span className="block text-xs font-medium text-danger">Overdue since {formatDateTime(cur!.dueAt!)} — escalated</span>}</span>; } },
        { id: 'impact', accessorFn: (r) => r.billingImpact?.amount ?? 0, header: 'Billing impact', meta: { align: 'right' }, cell: (c) => { const b = c.row.original.billingImpact; return b ? <span className="whitespace-nowrap">{c.row.original.direction === 'OUT' ? '+' : '−'}{b.days} d{b.amount != null && <span className="block text-xs text-muted">{formatPhp(b.amount)} · {b.applied ? 'applied' : 'on approval'}</span>}</span> : '—'; } },
        { accessorKey: 'memoCol', header: 'Credit memo', meta: { nowrap: true }, cell: (c) => { const r = c.row.original; const n = r.heldLines.length; return r.memoNo ? <span className="whitespace-nowrap"><Link className="font-mono text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()} to={`/billing/memos?memo=${r.memoNo}`}>{r.memoNo}</Link>{r.memoAmount != null && <span className="block text-xs text-muted">{formatPhp(r.memoAmount)}</span>}</span> : n ? <span className="whitespace-nowrap text-warning">{r.pendingMemoNo ? <Link className="font-mono text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()} to={`/billing/memos?memo=${r.pendingMemoNo}`}>{r.pendingMemoNo}</Link> : 'CM'} pending{r.memoAmount != null && <span className="text-xs text-muted"> · {formatPhp(r.memoAmount)}</span>}<Link className="block text-xs text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()} to={`/billing/invoices/${r.heldLines[0].invoiceNo}`}>{n} invoice line{n === 1 ? '' : 's'} held</Link></span> : <span className="text-muted">{r.path === 'AUTO' ? 'Not required' : '—'}</span>; } },
        { accessorKey: 'recordedCol', header: 'Correction recorded', meta: { nowrap: true }, cell: (c) => <span className="whitespace-nowrap">{userName(c.row.original.createdBy)}<span className="block text-xs text-muted">{formatDateTime(c.row.original.createdAt)}</span></span> },
        { id: 'a', header: '', cell: (c) => c.row.original.canAct && c.row.original.workflowId
          ? <div className="flex justify-end"><Button size="sm" icon={<ShieldCheck className="size-4" />} title="Review and approve or reject the credit memo" onClick={(e) => { e.stopPropagation(); setView(c.row.original.id); }}>Review</Button></div>
          : <div className="flex justify-end"><Button size="sm" variant="ghost" className="px-2" aria-label={`View ${c.row.original.id}`} title="View details" icon={<Eye className="size-4" />} onClick={(e) => { e.stopPropagation(); setView(c.row.original.id); }} /></div> },
      ]} footer={rows && rows.length <= 25 ? <span className="font-normal text-muted">1–{rows.length} of {rows.length} · {rows.filter((r) => r.path === 'CREDIT_MEMO' && r.status === 'Pending Approval').length} awaiting approval</span> : undefined} toolbar={<>
        <Select aria-label="Approval status" value={lf.status} onChange={(e) => setLf({ ...lf, status: e.target.value })} placeholder="All statuses" options={Object.keys(LE_TONE).map((s) => ({ value: s, label: s }))} />
        <DateRangeFilter label="Recorded" from={lf.from} to={lf.to} onChange={(r) => setLf({ ...lf, ...r })} />
      </>} />
      {sel && (
        <Drawer open onClose={() => setView(null)} title={<span className="flex items-center gap-2">Late encoding <span className="font-mono">{sel.id}</span><Badge tone={LE_TONE[sel.statusLabel]}>{sel.statusLabel}</Badge></span>}
          footer={sel.canAct && sel.workflowId ? <>
            <Button variant="secondary" onClick={() => setDecide({ wfId: sel.workflowId!, approve: false, label: 'Reject', title: `Reject credit memo — ${sel.id}` })}>Reject</Button>
            <Button icon={<ShieldCheck className="size-4" />} onClick={() => setDecide({ wfId: sel.workflowId!, approve: true, label: 'Approve', title: `Approve credit memo — ${sel.id}` })}>Approve</Button>
          </> : undefined}>
          <Stack>
            <KeyValueGrid cols={2} items={[{ label: 'Gate pass', value: `${sel.gatePassNo} · ${sel.direction === 'OUT' ? 'Gate Out' : 'Gate In'}` }, { label: 'Chassis / client', value: `${sel.chassisNo} · ${sel.clientName}` },
              // Staff review 1.2: depot, contract and EWA references; one "Approval status" label as on the dialog and list.
              { label: 'Depot', value: sel.branchCode ?? '—' }, { label: 'Contract / EWA', value: `${sel.contractNo ?? '—'} · ${sel.euNo ?? '—'}` },
              { label: 'Original (encoded)', value: formatDateTime(sel.originalDate) }, { label: 'Corrected (actual)', value: formatDateTime(sel.correctedDate) }, { label: 'Days late', value: sel.daysLate },
              { label: 'Approval status', value: `${sel.statusLabel} — ${sel.path === 'AUTO' ? 'billing auto-corrected, no approval needed' : 'Credit Memo, DYM then Treasury'}` }, { label: 'Reason', value: sel.reason },
              { label: 'Attachment', value: sel.attachment ? <span className="inline-flex items-center gap-1"><Paperclip className="size-3.5" />{sel.attachment}</span> : '—' },
              { label: 'Correction recorded', value: `${userName(sel.createdBy)} · ${formatDateTime(sel.createdAt)}` }, { label: 'Credit memo', value: sel.memoNo ? `${sel.memoNo}${sel.memoAmount != null ? ` · ${formatPhp(sel.memoAmount)}` : ''}` : (sel.pendingMemoNo ? <Link className="font-mono text-brand-700 hover:underline" to={`/billing/memos?memo=${sel.pendingMemoNo}`}>{sel.pendingMemoNo} (pending approval){sel.memoAmount != null ? ` · ${formatPhp(sel.memoAmount)}` : ''}</Link> : sel.path === 'AUTO' ? 'Not required' : 'Created on final approval') }]} />
            {sel.billingImpact && <Card><CardHeader title="Billing impact" description="Days moved × the unit's daily rate on the contract (estimate; the invoice shows the final amount)." />
              <p className="text-sm">{sel.billingImpact.effect} by {sel.daysLate} day{sel.daysLate === 1 ? '' : 's'} — {formatDateTime(sel.originalDate)} → {formatDateTime(sel.correctedDate)}
                {sel.billingImpact.amount != null && <> · {sel.direction === 'OUT' ? '+' : '−'}{sel.daysLate} × {formatPhp(sel.billingImpact.dailyRate ?? 0)} = <span className="font-semibold">{formatPhp(sel.billingImpact.amount)}</span></>} on {sel.contractNo}.</p>
              <p className="mt-1 text-xs text-muted">{sel.billingImpact.applied ? 'Applied: billing now uses the actual date (shown on Gate In and the EIR).' : 'Not applied yet: billing keeps the encoded date until the Credit Memo is approved.'}</p></Card>}
            <Card><CardHeader title="Status history" />
              <ul className="space-y-1 text-sm">
                <li><span className="font-medium">Gate pass encoded</span> · {userName(sel.encodedBy)} · {formatDateTime(sel.originalDate)}</li>
                <li><span className="font-medium">Correction recorded</span> · {userName(sel.createdBy)} · {formatDateTime(sel.createdAt)}</li>
                {sel.path === 'AUTO' ? <li><span className="font-medium">Billing auto-corrected</span> · system · {formatDateTime(sel.createdAt)}</li>
                  : sel.workflow?.steps.map((s) => <li key={s.step}><span className="font-medium">{s.label}</span> · {s.decision}{s.decidedAt ? ` · ${userName(s.decidedBy)} · ${formatDateTime(s.decidedAt)}` : s.dueAt ? ` · due ${formatDateTime(s.dueAt)}${new Date(s.dueAt) < new Date() && sel.workflow?.status === 'Pending' && sel.workflow.steps[sel.workflow.currentStep]?.step === s.step ? ' (overdue — escalated)' : ''}` : ''}</li>)}
              </ul></Card>
            {sel.path === 'CREDIT_MEMO' && <Card><CardHeader title="Held invoice lines" description="Released when the credit memo is approved; stay held for C&C review if rejected (pending confirmation)." />
              {sel.heldLines.length ? <ul className="text-sm">{sel.heldLines.map((l) => <li key={l.lineId} className="flex justify-between"><span>{l.invoiceNo} · {l.description}</span><span className="tabular">{formatPhp(l.amount)}</span></li>)}</ul> : <p className="text-sm text-muted">No invoice lines currently held for this chassis.</p>}</Card>}
            {sel.workflow && <Card><CardHeader title="Approvals" description="DYM then Treasury; escalates after 48 h." /><ApprovalTimeline workflow={sel.workflow} userName={userName} /></Card>}
          </Stack>
        </Drawer>
      )}
      <DecideDialog target={decide} onClose={() => setDecide(null)} />
      <Modal open={open} onClose={() => setOpen(false)} title="Record late encoding" size="lg"
        footer={<>{leNeed.length > 0 && <span className="mr-auto text-xs text-muted">Required: {leNeed.join(', ')}</span>}<Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={act.isPending} disabled={!v.gatePassNo || !v.correctedDate || !!dateErr || !v.reason.trim()} onClick={() => act.mutate(undefined)}>{preview?.path === 'CREDIT_MEMO' ? 'Submit for approval' : 'Post correction'}</Button></>}>
        <Stack>
          <FormGrid>
            <Select label="Transaction (gate pass)" required value={v.gatePassNo} onChange={(e) => setV({ ...v, gatePassNo: e.target.value })} placeholder="Select" wrapperClassName="md:col-span-2" error={fieldError(act.error, 'gatePassNo')}
              options={(passes.data ?? []).filter((g) => !g.isForceInbound).sort((a, b) => b.encodedAt.localeCompare(a.encodedAt)).map((g) => ({ value: g.gatePassNo, label: `${g.gatePassNo} · ${g.direction === 'OUT' ? 'Gate Out' : 'Gate In'} · ${g.branchCode} · ${formatDateTime(g.encodedAt)} · ${g.chassisNo} · ${g.clientName}` }))}
              hint="Newest first. Each option shows the gate pass, direction, branch, encoded time, chassis and client." />
            {gp && <div className="md:col-span-2 rounded-lg border border-line bg-surface-alt/50 px-3 py-2">
              <KeyValueGrid items={[{ label: 'Chassis', value: gp.chassisNo }, { label: 'Client', value: gp.clientName }, { label: 'Direction', value: gp.direction === 'OUT' ? 'Gate Out' : 'Gate In' }, { label: 'Branch', value: gp.branchCode },
                { label: 'EWA', value: gp.euNo ?? '—' }, { label: 'Driver / truck', value: `${gp.driverName} · ${gp.truckPlateNo}` },
                { label: 'Contract', value: gp.contractNo }, { label: 'Encoded by', value: `${userName(gp.encodedBy)} · ${formatDateTime(gp.encodedAt)}` }]} />
            </div>}
            <Input label="Original (encoded) date" readOnly placeholder="Filled from the selected gate pass" value={gp ? formatDateTime(gp.encodedAt) : ''} />
            <Input label="Corrected (actual) date & time" type="datetime-local" required value={v.correctedDate} max={nowLocal} onChange={(e) => setV({ ...v, correctedDate: e.target.value })} error={dateErr ?? fieldError(act.error, 'correctedDate')} hint="Must be earlier than the encoded date and not in the future." />
            <Input label="Days late" readOnly placeholder="Calculated" value={preview?.daysLate ?? ''} />
            <Input label="Approval status" readOnly placeholder="Set from the days late" value={preview ? (preview.path === 'AUTO' ? 'Auto-corrected (no approval)' : 'Pending DYM → Treasury (Credit Memo)') : ''} hint={`≤ ${auto} days: Auto-corrected · over ${auto} days: Pending DYM, then Pending Treasury, then Approved or Rejected`} />
          </FormGrid>
          {prior.length > 0 && <Banner tone="warning" title="This gate pass already has a late encoding">{prior.map((p) => `${p.id} (${p.statusLabel})`).join(', ')}. A new correction is blocked while one is pending; the rule for a second correction is pending decision.</Banner>}
          <Textarea label="Reason for delay" required value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="e.g. connectivity outage at branch" error={fieldError(act.error, 'reason')} />
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-sm text-muted hover:bg-surface-alt">
            <Paperclip className="size-4" />{v.attachment || 'Attach supporting evidence (optional, e.g. outage report)'}
            <input type="file" className="sr-only" onChange={(e) => setV({ ...v, attachment: e.target.files?.[0]?.name ?? '' })} />
          </label>
          {preview && (preview.path === 'AUTO'
            ? <Banner tone="success" title={`${preview.daysLate} day${preview.daysLate === 1 ? '' : 's'} late: billing will be corrected automatically`}>Within {auto} days — on Post correction, billing uses the actual date straight away. No approval is needed.</Banner>
            : <Banner tone="warning" title={`${preview.daysLate} days late: Credit Memo needed, sent to DYM then Treasury`}>Over {auto} days — Submit for approval starts a Credit Memo: the Deputy Yard Manager approves first, then Treasury. The client's invoice lines for this unit are held until it is approved. Both approvers are notified and the request escalates after 48 h.
              <ol className="mt-1 list-decimal pl-5 text-xs"><li>Deputy Yard Manager ({gp?.branchCode}) — approve or reject; name and time recorded</li><li>Treasury — final approval; the Credit Memo number is assigned and the held lines are released</li></ol></Banner>)}
          {/* Staff review 1.2: billing impact before posting, and which date becomes the primary date. */}
          {preview && gp && <div className="rounded-lg border border-line px-3 py-2 text-sm">
            <p className="font-medium">Billing impact (estimate)</p>
            <p className="text-ink-2">{gp.direction === 'OUT' ? 'On-hire start' : 'On-hire end'} moves from {formatDateTime(gp.encodedAt)} to {formatDateTime(corrected!.toISOString())}: {gp.direction === 'OUT' ? '+' : '−'}{preview.daysLate} billable day{preview.daysLate === 1 ? '' : 's'}{gp.dailyRate != null ? ` × ${formatPhp(gp.dailyRate)} contract daily rate = ${formatPhp(preview.daysLate * gp.dailyRate)}` : ''} on {gp.contractNo}.</p>
            <p className="mt-1 text-xs text-muted">{preview.path === 'AUTO' ? 'On posting, the actual date becomes the primary date on Gate In, the EIR and billing; the encoded date stays visible as “encoded …”.' : 'Until the Credit Memo is approved, Gate In, the EIR and billing keep the encoded date (with an “actual … · Credit Memo pending” note); on approval the actual date becomes the primary date.'}</p>
          </div>}
          {beforeEwa && <Banner tone="warning" title="Actual date is before the EWA was created">{`EWA ${gp!.euNo} was created ${formatDateTime(gp!.ewaCreatedAt)}. Check the paper gate pass; how an EWA is validated for a backdated release is pending confirmation.`}</Banner>}
          {act.error && !fieldError(act.error, 'correctedDate') && <Banner tone="danger">{errMessage(act.error)}</Banner>}
        </Stack>
      </Modal>
    </>
  );
}
