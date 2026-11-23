import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, FileSignature, Gauge, Lock, Paperclip, Plus, ShieldCheck, Truck, Unlock, UserPlus, XCircle } from 'lucide-react';
import { api } from '../../lib/api-client';
import {
  ROLE_TEMPLATES, clientInternalSchema, todayManila, formatDate, formatDateTime, formatPhp, holdLiftTier, toneFor, type Client, type ClientInternalForm, type RoleCode, type SalesActivity, type WorkflowInstance,
} from '../../lib/shared';
import {
  ApprovalTimeline, Badge, Banner, Button, Card, CardHeader, Checkbox, ConfirmDialog, DataTable, Drawer, Field, FormGrid, FormSection, Input, KeyValueGrid, KpiTile, MoneyInput, MoneyText, Modal, PageHeader,
  Select, Stack, StatusBadge, Switch, Tabs, Textarea, cn, stripCodes, type ColumnDef,
} from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, fieldError, useAction, useData, useRefLookups } from '../../shared/hooks';
import { Crumb } from '../../shared/components';

type ClientRow = Awaited<ReturnType<typeof api.clients.list>>[number];
type AccRow = Awaited<ReturnType<typeof api.clients.accreditations>>[number];

// Requirement names for the client status set (DBL-CLT-002). Stored codes stay Hold / Blacklist.
const CLIENT_STATUS_LABEL: Record<string, string> = { Active: 'Active', Draft: 'Draft', Hold: 'On Hold', Blacklist: 'Blacklisted', Inactive: 'Inactive' };
const CLIENT_STATUS_OPTIONS = Object.entries(CLIENT_STATUS_LABEL).map(([value, label]) => ({ value, label }));

/** Client status chip + accreditation sub-state (Pending C&C / Finance / VP, Rejected) + portal self-registration marker. */
export function ClientStatusChip({ status, stage, portalPending }: { status: string; stage?: string; portalPending?: boolean }) {
  const loud = status === 'Hold' || status === 'Blacklist';
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={toneFor('client', status)} className={cn(loud && 'font-semibold')} icon={loud ? <Lock className="size-3" aria-hidden /> : undefined}>{CLIENT_STATUS_LABEL[status] ?? status}</Badge>
      {stage && stage !== 'Approved' && <StatusBadge domain="accreditation" value={stage} />}
      {portalPending && <Badge tone="info" dot={false}>Portal — awaiting AE approval</Badge>}
    </span>
  );
}

/** Review 1.2: whole Manila calendar days from today to a YYYY-MM-DD date (20-Dec seen on 11-Nov = 39 days). */
export const calendarDaysTo = (date: string) => Math.round((Date.parse(date.slice(0, 10)) - Date.parse(todayManila())) / 86_400_000);

/** Display name for a role enum ('CNC_OFFICER' → 'C&C Officer'). */
export const roleName = (r: string) => (ROLE_TEMPLATES[r as RoleCode]?.label ?? r.replaceAll('_', ' ')).replace(/\s*\(.*\)$/, '');
/** Title-case an ALL-CAPS stored value for display (stored value unchanged). */
const titleCase = (s?: string) => (s && s === s.toUpperCase() && /[A-Z]{2}/.test(s) ? s.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase()) : s);

/** Styled file picker — replaces the browser's native "Choose File" control. */
export function FilePick({ label, hint, accept, required, error, fileName, onPick, className }: { label?: string; hint?: string; accept?: string; required?: boolean; error?: string; fileName: string; onPick: (name: string) => void; className?: string }) {
  return (
    <Field label={label} required={required} error={error} hint={hint} className={className}>
      {(id, d) => (
        <label htmlFor={id} className={cn('flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface px-3 text-sm transition-colors hover:border-brand-300 hover:bg-surface-alt', error && 'border-danger')}>
          <Paperclip className="size-4 shrink-0 text-muted" aria-hidden />
          <span className={cn('truncate', fileName ? 'text-ink' : 'text-brand-700')}>{fileName || 'Choose file…'}</span>
          <input id={id} aria-describedby={d} type="file" accept={accept} className="sr-only" onChange={(e) => onPick(e.target.files?.[0]?.name ?? '')} />
        </label>
      )}
    </Field>
  );
}

// ── SCR-06 list view ────────────────────────────────────────────────────────
export function ClientListPage() {
  const [sp] = useSearchParams();
  const [f, setF] = useState({ status: sp.get('status') ?? '', branch: '', ae: '', billing: '' });
  const data = useData(['clients'], () => api.clients.list());
  const { branchName, branchOptions, userName, ref } = useRefLookups();
  const { can } = useAuth();
  const nav = useNavigate();
  const rows = (data.data ?? []).filter((c) => (!f.status || c.status === f.status) && (!f.branch || c.branchCode === f.branch) && (!f.ae || c.aeAssigned === f.ae) && (!f.billing || c.billingCycle === f.billing));
  const aeOptions = (ref?.users ?? []).filter((u) => u.roles.includes('ACCOUNT_EXECUTIVE') || u.roles.includes('SALES_DIRECTOR')).map((u) => ({ value: u.userId, label: u.name }));
  const cols: ColumnDef<ClientRow>[] = [
    { accessorKey: 'clientCode', header: 'Code', meta: { nowrap: true }, cell: (c) => <Link to={`/clients/${c.getValue()}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap font-mono font-medium text-brand-600 hover:underline">{c.getValue<string>()}</Link> },
    { accessorKey: 'clientName', header: 'Name', cell: (c) => <div className="min-w-[190px]"><p className="font-medium">{c.getValue<string>()}</p>{c.row.original.registrationSource === 'Portal' && <p className="text-xs text-muted">Portal registration</p>}</div> },
    // The hold reason wraps inside the Status cell (the column itself is no-wrap) so it never spills over Branch / AE / Billing.
    { accessorKey: 'status', header: 'Status', cell: (c) => <div className="space-y-1"><ClientStatusChip status={c.getValue<string>()} stage={c.row.original.accreditationStage} portalPending={c.row.original.portalPending} />
      {/* Review 1.2: an Active client whose only contract has expired while units are still out gets a tag (handling rule pending Delbros' decision). */}
      {c.getValue() === 'Active' && !c.row.original.activeContracts && c.row.original.onHireUnits > 0 && <Badge tone="warning" dot={false}>Contract expired — {c.row.original.onHireUnits} units out</Badge>}
      {c.row.original.holdReason &&<p className="max-w-[230px] whitespace-normal text-xs leading-snug text-danger">{stripCodes(c.row.original.holdReason)}</p>}</div> },
    { accessorKey: 'branchCode', header: 'Branch', meta: { nowrap: true }, cell: (c) => <span title={branchName(c.getValue<string>())}>{c.getValue<string>()}</span> },
    { accessorKey: 'aeAssigned', header: 'AE', meta: { nowrap: true }, cell: (c) => userName(c.getValue<string>()) },
    // Review 1.2: credit term (from the active contract) under the billing cycle.
    { accessorKey: 'billingCycle', header: 'Billing · term', meta: { nowrap: true }, cell: (c) => <div><p>{c.getValue<string>()}</p>{c.row.original.creditTermDays != null && <p className="text-xs text-muted">{c.row.original.creditTermDays} days</p>}</div> },
    { accessorKey: 'activeContracts', header: 'Contracts · units', meta: { align: 'right' }, cell: (c) => <div title="Active contracts · units on hire"><span>{c.row.original.activeContracts} · {c.row.original.onHireUnits}</span>{c.row.original.contractTypes.length > 0 && <p className="text-xs text-muted">{c.row.original.contractTypes.join(', ')}</p>}{!c.row.original.activeContracts && c.row.original.onHireUnits > 0 && <p className="text-[11px] text-danger">contract expired</p>}</div> },
    // Review 1.2: all eligibility flags, not only Rescue. Rescue also needs Active status and a funded e-wallet.
    { accessorKey: 'rescueEligible', header: 'Eligibility', cell: (c) => { const r = c.row.original; const on = [r.allowLt && 'LT', r.allowSt && 'ST', r.allowOnline && 'Online', r.allowSpecial && 'Special billing'].filter(Boolean) as string[]; return <div className="min-w-[110px]">
      {c.getValue<boolean>() ? <Badge tone="success" dot={false}>Rescue allowed</Badge> : <span title={!r.allowRescue ? 'Allow Rescue flag off' : r.status !== 'Active' ? 'Client not Active' : 'E-wallet missing or not funded'}><Badge tone="neutral" dot={false}>Rescue blocked</Badge></span>}
      <p className="mt-0.5 whitespace-normal text-xs text-muted" title="Eligibility flags set at VP sign-off">{on.length ? on.join(' · ') : 'No flags on'}</p></div>; } },
    // Review 1.1: cash bond on file and the nearest contract expiry (amber within the renewal horizon, red when expired).
    { accessorKey: 'bondHeld', header: 'Cash bond', meta: { align: 'right' }, cell: (c) => (c.row.original.bondCount ? <span title="Held, not refunded"><MoneyText value={c.getValue<number>()} /></span> : c.row.original.activeContracts || c.row.original.onHireUnits ? <span className="text-xs font-medium text-warning">No bond on file</span> : <span className="text-muted">—</span>) },
    // Review 1.2: days counted on Manila calendar dates; an open-ended SPL contract says so instead of "—".
    { id: 'expiry', header: 'Contract expiry', meta: { nowrap: true }, cell: (c) => { const x = c.row.original.nextExpiry; if (!x) return c.row.original.openEnded ? <span title={c.row.original.openEnded} className="text-ink-2">Open-ended · SPL</span> : <span className="text-muted">—</span>; const days = calendarDaysTo(x.expiryDate); return <div title={x.contractNo}><p className={cn(x.status === 'Expired' || days < 0 ? 'text-danger' : days <= 90 ? 'font-medium text-warning' : undefined)}>{formatDate(x.expiryDate)}{x.status === 'Expired' ? ' · expired' : days <= 90 ? ` · ${days}d` : ''}</p><p className="text-xs text-muted">{x.contractType} · {x.contractNo}</p></div>; } },
    // Review 1.2: the overdue part of the balance (what the credit-hold rule looks at) under the outstanding total.
    { accessorKey: 'outstanding', header: 'Outstanding', meta: { align: 'right' }, cell: (c) => <div><MoneyText value={c.getValue<number>()} />{c.row.original.overdue > 0 && <p className="text-xs font-medium text-danger">{formatPhp(c.row.original.overdue)} overdue</p>}</div> },
    { accessorKey: 'ewallet', header: 'E-wallet', meta: { align: 'right' }, cell: (c) => (c.getValue() == null ? '—' : <MoneyText value={c.getValue<number>()} />) },
    { id: 'act', header: '', cell: (c) => (
      <div className="flex flex-col items-end gap-1">
        {c.row.original.status === 'Hold' && can('cnc.hold_lift', 'add') && (
          <Link to={`/credit/status?client=${c.row.original.clientCode}`} onClick={(e) => e.stopPropagation()} aria-label={`Request hold lift for ${c.row.original.clientName}`} title="Request hold lift" className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-brand-600 hover:underline">
            <Unlock className="size-3.5" aria-hidden />Lift hold</Link>
        )}
        {c.row.original.portalPending && can('clients.client', 'edit') && <Link to={`/clients/${c.row.original.clientCode}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-brand-600 hover:underline"><CheckCircle2 className="size-3.5" aria-hidden />Approve / decline</Link>}
        <Link to={`/clients/${c.row.original.clientCode}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap text-[13px] font-medium text-brand-600 hover:underline">View</Link>
      </div>) },
  ];
  return (
    <>
      <PageHeader title="Clients" description="Client master — status, eligibility, contracts, on-hire units and balances."
        actions={can('clients.client', 'add') && <Link to="/clients/new"><Button icon={<UserPlus className="size-4" />}>Register client</Button></Link>} />
      {/* Review 1.2: count by status — click one to filter. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        {CLIENT_STATUS_OPTIONS.map((s) => { const n = (data.data ?? []).filter((c) => c.status === s.value).length; return n || s.value !== 'Inactive' ? (
          <button key={s.value} type="button" onClick={() => setF({ ...f, status: f.status === s.value ? '' : s.value })} className={cn('rounded-full border px-3 py-1', f.status === s.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-2 hover:border-brand-300')}>
            {s.label} <span className="font-semibold tabular">{n}</span></button>) : null; })}
        <span className="text-muted">· {(data.data ?? []).length} clients in total</span>
      </div>
      <DataTable data={rows} loading={data.isLoading} columns={cols} onRowClick={(r) => nav(`/clients/${r.clientCode}`)} exportName="clients" searchPlaceholder="Search code or name…" initialSort={[{ id: 'clientCode', desc: false }]}
        rowClassName={(r) => (r.status === 'Hold' || r.status === 'Blacklist' ? 'bg-danger-bg/40' : undefined)}
        toolbar={<>
          <Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" options={CLIENT_STATUS_OPTIONS} />
          <Select aria-label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={branchOptions} />
          <Select aria-label="AE" value={f.ae} onChange={(e) => setF({ ...f, ae: e.target.value })} placeholder="All AEs" options={aeOptions} />
          <Select aria-label="Billing cycle" value={f.billing} onChange={(e) => setF({ ...f, billing: e.target.value })} placeholder="All billing cycles" options={[{ value: 'Weekly', label: 'Weekly' }, { value: 'Monthly', label: 'Monthly' }]} />
        </>} />
      <p className="mt-2 text-xs text-muted">{rows.length} of {(data.data ?? []).length} clients. Contracts · units = Active contracts · units on hire. Rescue is Allowed only for Active clients with the flag on and a funded e-wallet; the line below lists the other eligibility flags. Contract expiry days count Philippine calendar days. Sorted by code; click a column header to sort; 25 rows per page. Export downloads the filtered list (CSV). Scroll sideways for Outstanding (with the overdue part) and E-wallet.</p>
    </>
  );
}

// ── SCR-04 Client Registration — Internal (AE) ─────────────────────────────
const REG_LABELS: Record<string, string> = { clientCode: 'Company code', branchCode: 'Branch', clientName: 'Company name', billingName: 'Billing name', address1: 'Registered address', city: 'City', zipCode: 'ZIP code', firstName: 'First name', lastName: 'Last name', phone: 'Phone', email: 'Email', aeAssigned: 'AE assigned', ebillingEmail: 'Billing email', expectedUnits: 'Expected units' };
/** Review 1.2: province / region list for the address (regions for Metro Manila; provinces where Delbros has branches first). Pick-lists below are pending confirmation. */
export const PROVINCES = ['Metro Manila (NCR)', 'Bulacan', 'Pampanga', 'Cavite', 'Laguna', 'Batangas', 'Rizal', 'Cebu', 'Misamis Oriental', 'Davao del Sur', 'Other'];
export const INDUSTRIES = ['Trucking', 'Freight forwarding', 'Shipping line', 'Logistics / 3PL', 'Manufacturer / shipper', 'Other'];
export const LEAD_SOURCES = ['AE prospecting', 'Referral', 'Walk-in / inquiry', 'Portal registration', 'Existing client group', 'Other'];
export function ClientRegisterPage() {
  const { user } = useAuth();
  const { branchOptions, ref } = useRefLookups();
  const nav = useNavigate();
  const autoCode = useMemo(() => api.clients.nextClientCode(), []);
  // Review 1.2: the AE's branch is shown with the name.
  const aes = (ref?.users ?? []).filter((u) => u.roles.includes('ACCOUNT_EXECUTIVE') || u.roles.includes('SALES_DIRECTOR')).map((u) => ({ value: u.userId, label: `${u.name}${u.branchCode ? ` (${u.branchCode})` : ''}` }));
  // Default AE = the logged-in user, but only when they are an AE / Sales Director; otherwise the user must pick one.
  const selfIsAe = !!user && aes.some((a) => a.value === user.userId);
  const defaultAe = selfIsAe ? user!.userId : '';
  const f = useForm<ClientInternalForm>({ resolver: zodResolver(clientInternalSchema), defaultValues: { clientCode: autoCode, aeAssigned: defaultAe, branchCode: user?.branchCode !== 'HO' ? user?.branchCode : 'MNL' } });
  const [done, setDone] = useState<{ code: string; dup?: string } | null>(null);
  const [dupOk, setDupOk] = useState(false);
  const act = useAction((v: ClientInternalForm) => api.clients.createInternal(v), { onSuccess: (r) => setDone({ code: r.client.clientCode, dup: r.possibleDuplicate }) });
  const e = f.formState.errors;
  const code = f.watch('clientCode') ?? '';
  const name = f.watch('clientName') ?? '';
  const interest = f.watch('contractInterest') ?? [];
  const codeTaken = !!code && (ref?.clients ?? []).some((c) => c.clientCode === code);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(inc|corp|corporation|co|ltd)$/, '');
  const dupes = name.trim().length > 2 ? (ref?.clients ?? []).filter((c) => norm(c.clientName) === norm(name) || norm(c.clientName).startsWith(norm(name))) : [];
  // AE dropdown: the options arrive after the form mounts, so re-apply the default (logged-in AE) once they exist.
  useEffect(() => { if (aes.length) f.setValue('aeAssigned', aes.some((a) => a.value === f.getValues('aeAssigned')) ? f.getValues('aeAssigned') : defaultAe); }, [aes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Billing name defaults from the company name until the user edits it.
  const billingDirty = !!f.formState.dirtyFields.billingName;
  useEffect(() => { if (!billingDirty) f.setValue('billingName', name); }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = f.handleSubmit((v) => {
    if (codeTaken) { f.setError('clientCode', { message: 'Company code already exists — codes must be unique' }); return; }
    if (dupes.length && !dupOk) return;
    act.mutate(v);
  });
  const errKeys = Object.keys(e);
  if (done) return (
    <div className="max-w-xl">
      <PageHeader title="Client saved as Draft" meta={<StatusBadge domain="client" value="Draft" />} />
      <Card><Stack>
        <Banner tone="success" title={`Client ${done.code} created in Draft`}>Nothing in Draft can transact — no contract, EWA or gate release — until accreditation is approved. The client shows as Draft in the Clients list for the assigned AE, the branch team and the Sales Director.</Banner>
        {done.dup && <Banner tone="warning" title="Possible existing client">A client with the same name exists: {done.dup}. Check before submitting for accreditation.</Banner>}
        <div className="rounded-lg border border-line p-3 text-sm">
          <p className="mb-1 font-medium text-ink">Next step: start accreditation</p>
          <p className="text-ink-2">BI/CI by the C&amp;C Officer → Finance endorsement → VP sign-off. C&amp;C is notified when you submit.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button onClick={() => nav(`/clients/${done.code}?accredit=1`)} icon={<ShieldCheck className="size-4" />}>Start accreditation</Button><Button variant="secondary" onClick={() => nav(`/clients/${done.code}`)}>Open client profile</Button><Button variant="ghost" onClick={() => { setDone(null); f.reset({ clientCode: api.clients.nextClientCode(), aeAssigned: defaultAe, branchCode: f.getValues('branchCode') }); }}>Register another</Button></div>
      </Stack></Card>
    </div>
  );
  return (
    <div className="max-w-6xl">
      <PageHeader breadcrumb={<Crumb items={[{ to: '/clients', label: 'Clients' }, { label: 'Register' }]} />} title="Register client (internal)" description="Account Executives register a prospective client directly. The client is created in Draft and must pass accreditation before it can transact. Eligibility flags (LT, ST, Online, Rescue, Special billing) start off and are set at VP sign-off; TIN, SEC / DTI and documents are captured at the accreditation step." />
      <form onSubmit={submit} noValidate>
        <Stack>
          {errKeys.length > 0 && <Banner tone="danger" title="Fix the highlighted fields">{errKeys.length} field{errKeys.length > 1 ? 's need' : ' needs'} attention: {errKeys.map((k) => REG_LABELS[k] ?? k).join(', ')}.</Banner>}
          {act.error && <Banner tone="danger" title="Client not saved">{errMessage(act.error)}</Banner>}
          <FormSection title="Company">
            <FormGrid>
              <Input label="Company code" required maxLength={14} error={e.clientCode?.message ?? (codeTaken ? 'Company code already exists — codes must be unique' : fieldError(act.error, 'clientCode'))} {...f.register('clientCode', { setValueAs: (v: string) => v.toUpperCase() })} placeholder="e.g. C-00123"
                hint={`Auto-generated next number${code !== autoCode ? ' — edited manually' : ''}. Edit only for a legacy DelWater code.`} />
              <Select label="Branch" required options={branchOptions} error={e.branchCode?.message} {...f.register('branchCode')} />
              <Input label="Company name" required error={e.clientName?.message} {...f.register('clientName')} placeholder="e.g. ABC Logistics Inc." />
              <Input label="Billing name" required error={e.billingName?.message} {...f.register('billingName')} hint="Defaults from the company name — change if invoices go to another legal name." placeholder="Legal name printed on invoices" />
              <Input label="Registered address" required error={e.address1?.message} {...f.register('address1')} placeholder="Unit, building, street, city" />
              <Input label="Address line 2" {...f.register('address2')} placeholder="Barangay, district (optional)" />
              <Input label="City / municipality" error={e.city?.message} {...f.register('city')} placeholder="e.g. Manila" />
              {/* Review 1.2: province / region for Philippine addresses and the invoice address. */}
              <Select label="Province / region" error={e.province?.message} {...f.register('province')} placeholder="Select province or region" options={PROVINCES.map((p) => ({ value: p, label: p }))} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="ZIP code" inputMode="numeric" maxLength={4} error={e.zipCode?.message} {...f.register('zipCode')} placeholder="e.g. 1018" />
                <Input label="Country" value="Philippines" readOnly disabled />
              </div>
              <Input label="Trade name" error={e.tradeName?.message} {...f.register('tradeName')} placeholder="Name used in business, if different (optional)" />
            </FormGrid>
            {dupes.length > 0 && (
              <Banner tone="warning" className="mt-4" title="Possible duplicate client">
                <p>Similar company name already registered: {dupes.map((d) => `${d.clientCode} ${d.clientName} (${CLIENT_STATUS_LABEL[d.status] ?? d.status})`).join('; ')}.</p>
                <Checkbox className="mt-2" label="I checked — this is a different company" checked={dupOk} onChange={(ev) => setDupOk(ev.target.checked)} />
              </Banner>
            )}
          </FormSection>
          <FormSection title="Primary contact" description="More contacts and signatories can be added on the client profile after saving.">
            <FormGrid>
              <Input label="First name" required error={e.firstName?.message} {...f.register('firstName')} placeholder="e.g. Juan" />
              <Input label="Last name" required error={e.lastName?.message} {...f.register('lastName')} placeholder="e.g. Dela Cruz" />
              <Input label="Position / designation" error={e.position?.message} {...f.register('position')} placeholder="e.g. Operations Manager" />
              <Input label="Phone" required type="tel" error={e.phone?.message} {...f.register('phone')} hint="Mobile or landline — e.g. +63 917 123 4567 or (02) 8123 4567" placeholder="e.g. +63 917 123 4567" />
              <Input label="Email" type="email" required error={e.email?.message} {...f.register('email')} placeholder="e.g. name@company.ph" />
              <Input label="Billing email (invoice recipient)" type="email" error={e.ebillingEmail?.message} {...f.register('ebillingEmail')} placeholder="e.g. billing@company.ph" hint="Leave blank to send invoices to the primary contact's email." />
              <Select label="AE assigned" required options={aes} placeholder={aes.length ? 'Select an AE' : 'Loading AEs…'} error={e.aeAssigned?.message} {...f.register('aeAssigned')}
                hint={selfIsAe ? 'Defaults to you. The Sales Director can reassign the client later.' : 'You are not an Account Executive — select the AE who will own this client (branch shown in brackets).'} />
            </FormGrid>
            <Checkbox className="mt-4" label="This contact is also an authorised signatory" description="Can sign lease contracts for the client (more signatories can be added on the profile)." {...f.register('isSignatory')} />
          </FormSection>
          <FormSection title="Sales information (optional)" description="Helps the Sales Director and C&C. Whether these are required at registration or only at accreditation is pending confirmation.">
            <FormGrid>
              <Select label="Client type / industry" {...f.register('industry')} placeholder="Select" options={INDUSTRIES.map((x) => ({ value: x, label: x }))} />
              <Select label="Lead source" {...f.register('leadSource')} placeholder="Select" options={LEAD_SOURCES.map((x) => ({ value: x, label: x }))} />
              <Input label="Expected units" type="number" min={0} error={e.expectedUnits?.message} {...f.register('expectedUnits')} placeholder="e.g. 10" hint="Chassis the client expects to lease" />
              <Field label="Contract types of interest">
                {() => <div className="flex h-9 flex-wrap items-center gap-4">{(['LTL', 'SPL', 'QLP'] as const).map((t) => <Checkbox key={t} label={t} checked={interest.includes(t)} onChange={(ev) => f.setValue('contractInterest', ev.target.checked ? [...interest, t] : interest.filter((x) => x !== t))} />)}</div>}
              </Field>
            </FormGrid>
          </FormSection>
          <div className="flex justify-end gap-2"><Link to="/clients"><Button variant="secondary">Cancel</Button></Link><Button type="submit" loading={act.isPending} disabled={dupes.length > 0 && !dupOk}>Save as Draft</Button></div>
        </Stack>
      </form>
    </div>
  );
}

// ── SCR-06 Client Profile / Master ─────────────────────────────────────────
/** Same e-wallet tone rule as the client portal: amber when within 25% above the minimum. */
const LOW_WALLET_FACTOR = 1.25;
export function ClientProfilePage() {
  const { code = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const data = useData(['client', code], () => api.clients.get(code));
  const { branchName, userName, eqName, setting } = useRefLookups();
  const { can } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState('general');
  const [editing, setEditing] = useState(false);
  const [accOpen, setAccOpen] = useState(sp.get('accredit') === '1');
  const [contactOpen, setContactOpen] = useState(false);
  const [decline, setDecline] = useState(false);
  const approvePortal = useAction((ok: boolean) => api.clients.approvePortal(code, ok), { success: 'Portal registration approved — submit for accreditation next' });
  const declinePortal = useAction((reason: string) => api.clients.approvePortal(code, false, reason), { success: 'Registration declined', onSuccess: () => setDecline(false) });
  if (data.isLoading) return <p className="text-muted">Loading…</p>;
  if (data.error) return <Banner tone="danger">{errMessage(data.error)}</Banner>;
  const d = data.data!;
  const c = d.client;
  const pendingAcc = d.accreditation?.status.startsWith('Pending');
  const tier = holdLiftTier(d.outstanding, Number(setting('cnc.tier1_max') ?? 100000), Number(setting('cnc.tier2_max') ?? 500000));
  const closeAcc = () => { setAccOpen(false); if (sp.get('accredit')) setSp({}); };
  return (
    <>
      <PageHeader breadcrumb={<Crumb items={[{ to: '/clients', label: 'Clients' }, { label: c.clientCode }]} />}
        title={c.clientName} meta={<ClientStatusChip status={c.status} stage={d.accreditationStage} portalPending={d.portalPending} />}
        description={`${c.clientCode} · ${branchName(c.branchCode)} · AE ${userName(c.aeAssigned)} · ${c.registrationSource === 'Portal' ? 'Portal registration' : 'Registered by account executive'}`}
        actions={<>
          {d.portalPending && can('clients.client', 'edit') && <><Button icon={<CheckCircle2 className="size-4" />} loading={approvePortal.isPending} onClick={() => approvePortal.mutate(true)}>Approve registration</Button><Button variant="secondary" icon={<XCircle className="size-4" />} onClick={() => setDecline(true)}>Decline</Button></>}
          {c.status === 'Draft' && !pendingAcc && !d.portalPending && can('clients.accreditation', 'add') && <Button icon={<ShieldCheck className="size-4" />} onClick={() => setAccOpen(true)}>Submit for accreditation</Button>}
          {c.status === 'Hold' && can('cnc.hold_lift', 'add') && <Link to={`/credit/status?client=${c.clientCode}`}><Button icon={<Unlock className="size-4" />} disabled={d.liftPending}>{d.liftPending ? 'Hold lift pending' : 'Request hold lift'}</Button></Link>}
          {c.status === 'Active' && can('clients.contract', 'add') && <Link to={`/contracts/new?client=${c.clientCode}`}><Button icon={<FileSignature className="size-4" />}>New contract</Button></Link>}
          {c.status === 'Active' && can('gate.ewa', 'add') && <Link to={`/gate/ewa?client=${c.clientCode}`}><Button variant="secondary" icon={<Truck className="size-4" />}>New EWA</Button></Link>}
          {can('cnc.status') && <Link to={`/credit/status?client=${c.clientCode}`}><Button variant="ghost" icon={<Gauge className="size-4" />}>Credit status</Button></Link>}
        </>} />
      {c.status === 'Hold' && <Banner tone="danger" className="mb-4" title="Account on HOLD">
        <p>{d.holdReason ? stripCodes(d.holdReason) : 'Credit hold.'}</p>
        <p className="mt-1">Chassis release, gate pass, repair scheduling and new services are blocked until reactivated through tiered approval. Outstanding {formatPhp(d.outstanding)} → {tier.label}.{d.liftPending ? ' A hold-lift request is pending in My Approvals.' : ''}</p>
      </Banner>}
      {c.status === 'Blacklist' && <Banner tone="danger" className="mb-4" title="Blacklisted">This client cannot transact.</Banner>}
      {d.portalPending && <Banner tone="info" className="mb-4" title="Portal self-registration awaiting AE approval">This Draft came from the client portal. Approve the registration to activate the portal login, then submit for accreditation. AE-registered Drafts skip this step.</Banner>}
      {pendingAcc && <Banner tone="info" className="mb-4" title={`Accreditation in progress — ${d.accreditation!.status}`}>Track it under <Link className="font-medium text-brand-700 hover:underline" to="/clients/accreditation">Accreditation</Link> or My Approvals.</Banner>}
      {c.status === 'Draft' && d.accreditation?.status === 'Rejected' && <Banner tone="warning" className="mb-4" title="Last accreditation was rejected">See the Accreditation tab for the reason. The AE can resubmit with the missing evidence.</Banner>}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile label="Outstanding" value={formatPhp(d.outstanding)} tone={d.outstanding > 0 ? 'warning' : 'default'} hint={d.overdue > 0 ? `${formatPhp(d.overdue)} overdue` : undefined} />
        <KpiTile label="E-wallet" value={d.ewallet ? formatPhp(d.ewallet.balance) : 'Not created'} tone={!d.ewallet ? 'default' : d.ewallet.balance < 0 ? 'danger' : d.ewallet.balance < d.ewallet.minimumBalance * LOW_WALLET_FACTOR ? 'warning' : 'success'} hint={d.ewallet ? `Min ${formatPhp(d.ewallet.minimumBalance)}` : undefined} />
        <KpiTile label="On-hire units" value={d.onHire.length} onClick={() => setTab('onhire')} />
        {/* Review 1.2: contract expiry and credit term on the summary, plus the cash bond (BR-14). */}
        <KpiTile label="Active contracts" value={d.contracts.filter((x) => x.status === 'Active').length} onClick={() => setTab('contracts')}
          hint={[d.nextExpiry ? `${d.nextExpiry.status === 'Expired' ? 'Expired' : 'Expires'} ${formatDate(d.nextExpiry.expiryDate)}` : d.openEnded ? 'Open-ended (SPL)' : undefined, d.creditTermDays != null ? `${d.creditTermDays}-day term` : undefined].filter(Boolean).join(' · ') || undefined} />
        <KpiTile label="Cash bond" value={d.bondCount ? formatPhp(d.bondHeld) : 'None'} tone={!d.bondCount && d.contracts.some((x) => x.status === 'Active') ? 'warning' : 'default'} hint={d.bondCount ? `${d.bondCount} held · see Cash bonds` : d.contracts.some((x) => x.status === 'Active') ? 'Not recorded' : undefined} onClick={can('clients.cashbond') ? () => nav(`/cash-bonds`) : undefined} />
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[
        // Zero counts are hidden (same as My Approvals).
        { id: 'general', label: 'General' }, { id: 'eligibility', label: 'Eligibility' }, { id: 'contacts', label: 'Contacts', count: c.contacts.length || undefined },
        { id: 'rates', label: 'Rates' }, { id: 'onhire', label: 'On hire', count: d.onHire.length || undefined }, { id: 'contracts', label: 'Contracts', count: d.contracts.length || undefined },
        { id: 'accreditation', label: 'Accreditation', count: d.accreditations.length || undefined }, { id: 'activities', label: 'Timeline', count: d.activities.length || undefined },
        { id: 'invoices', label: 'Invoices', count: d.invoices.length || undefined }, { id: 'ewas', label: 'EWAs', count: d.ewas.length || undefined }, { id: 'audit', label: 'Audit' }]} />
      {tab === 'general' && (
        <Card>
          <CardHeader title="Company details" actions={can('clients.client', 'edit') && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>} />
          {/* Review 1.2: same labels as the Register form; province, ZIP, trade name, type, TIN / SEC, created and last updated. */}
          <KeyValueGrid items={[
            { label: 'Code', value: <span className="font-mono">{c.clientCode}</span> }, { label: 'Company name', value: c.clientName }, { label: 'Billing name', value: c.billingName }, { label: 'QuickBooks name', value: titleCase(c.qbName) },
            { label: 'Registered address', value: c.address1 }, { label: 'Address line 2', value: c.address2 }, { label: 'City / municipality', value: c.city }, { label: 'Province / region', value: c.province },
            { label: 'ZIP code', value: c.zipCode }, { label: 'Country', value: titleCase(c.country) }, { label: 'Trade name', value: c.tradeName }, { label: 'Client type / industry', value: c.industry },
            { label: 'Company phone', value: c.phone }, { label: 'Fax', value: c.fax }, { label: 'Website', value: c.website }, { label: 'Company email', value: c.email },
            { label: 'E-billing email', value: c.ebillingEmail }, { label: 'Billing cycle', value: c.billingCycle }, { label: 'AE assigned', value: userName(c.aeAssigned) }, { label: 'Branch', value: branchName(c.branchCode) },
            { label: 'TIN', value: c.tin ?? d.accreditation?.bici.tin }, { label: 'SEC / DTI reg.', value: d.accreditation?.bici.secReg }, { label: 'Credit limit', value: c.creditLimit ? formatPhp(c.creditLimit) : c.status === 'Draft' ? 'Set at VP sign-off' : undefined },
            { label: 'Lead source · expected units', value: [c.leadSource, c.expectedUnits ? `${c.expectedUnits} units` : undefined, c.contractInterest?.length ? c.contractInterest.join('/') : undefined].filter(Boolean).join(' · ') || undefined },
            { label: 'Created', value: `${formatDateTime(c.createdAt)}${c.createdBy ? ` · ${userName(c.createdBy)}` : c.registrationSource === 'Portal' ? ' · portal self-registration' : ''}` },
            { label: 'Last updated', value: d.lastUpdated ? `${formatDateTime(d.lastUpdated.at)} · ${userName(d.lastUpdated.by)}` : 'No changes since created' },
          ]} />
          <p className="mt-2 text-xs text-muted">Company phone and email belong to the company; people (primary contact, signatories, billing contact) are on the Contacts tab. TIN and SEC / DTI are captured at accreditation.</p>
          <p className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide text-muted">Notes</p>
          <p className="rounded-lg bg-surface-alt p-3 text-sm text-ink-2">{c.notes || 'No notes yet — add them with Edit.'}</p>
        </Card>
      )}
      {tab === 'eligibility' && <EligibilityCard client={c} />}
      {tab === 'contacts' && (
        <Card padded={false}>
          <div className="flex items-center justify-between px-4 py-3"><p className="text-sm text-muted">Authorised contacts; signatories appear on the contract form.</p>{can('clients.client', 'edit') && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setContactOpen(true)}>Add contact</Button>}</div>
          <DataTable data={c.contacts} searchable={false} columns={[{ id: 'n', header: 'Name', cell: (x) => `${x.row.original.firstName} ${x.row.original.lastName}` }, { accessorKey: 'position', header: 'Position', cell: (x) => x.getValue<string>() ?? '—' }, { accessorKey: 'phone', header: 'Phone' }, { accessorKey: 'email', header: 'Email' }, { id: 'f', header: 'Flags', cell: (x) => <div className="flex gap-1">{x.row.original.isPrimary && <Badge tone="brand" dot={false}>Primary</Badge>}{x.row.original.isSignatory && <Badge tone="neutral" dot={false}>Signatory</Badge>}{(x.row.original.isBilling || (x.row.original.isPrimary && !c.ebillingEmail)) && <Badge tone="info" dot={false}>Billing</Badge>}</div> }]} />
        </Card>
      )}
      {tab === 'rates' && <DataTable data={d.contracts.filter((x) => x.status === 'Active').flatMap((ct) => ct.rates.map((r) => ({ ...r, contractNo: ct.contractNo, cls: ct.class })))} searchable={false} emptyTitle="No active contract rates" columns={[
        { accessorKey: 'contractNo', header: 'Contract' }, { accessorKey: 'cls', header: 'Class' }, { accessorKey: 'equipmentType', header: 'Equipment type', cell: (x) => eqName(x.getValue<string>()) },
        { accessorKey: 'dailyRate', header: 'Daily rate', meta: { align: 'right' }, cell: (x) => formatPhp(x.getValue<number>()) }, { accessorKey: 'indemnity', header: 'Indemnity', meta: { align: 'right' }, cell: (x) => formatPhp(x.getValue<number>()) }]} />}
      {tab === 'onhire' && <DataTable data={d.onHire} searchable={false} emptyTitle="No units on hire" columns={[
        { accessorKey: 'chassisNo', header: 'Chassis', cell: (x) => <Link className="font-mono text-brand-600 hover:underline" to={`/chassis/${x.getValue()}`}>{x.getValue<string>()}</Link> },
        { accessorKey: 'chassisType', header: 'Type', cell: (x) => eqName(x.getValue<string>()) }, { accessorKey: 'currentContractNo', header: 'Contract', cell: (x) => <Link className="font-mono text-brand-600 hover:underline" to={`/contracts/${x.getValue()}`}>{x.getValue<string>()}</Link> },
        { accessorKey: 'gateOut', header: 'Gate out', cell: (x) => formatDateTime(x.getValue<string>()) }, { accessorKey: 'currentGatePassNo', header: 'Gate pass' }]} />}
      {tab === 'contracts' && <DataTable data={d.contracts} searchable={false} emptyTitle="No contracts" columns={[
        { accessorKey: 'contractNo', header: 'Contract', cell: (x) => <Link className="font-mono text-brand-600 hover:underline" to={`/contracts/${x.getValue()}`}>{x.getValue<string>()}</Link> },
        { id: 'v', header: 'Version', cell: (x) => `v${x.row.original.version ?? 1}` }, { accessorKey: 'contractType', header: 'Type' }, { accessorKey: 'class', header: 'Class' }, { accessorKey: 'effectiveDate', header: 'Effective', cell: (x) => formatDate(x.getValue<string>()) },
        { accessorKey: 'expiryDate', header: 'Expiry', cell: (x) => (x.getValue() ? formatDate(x.getValue<string>()) : 'Open-ended') }, { accessorKey: 'unitQty', header: 'Units', meta: { align: 'right' } },
        { accessorKey: 'status', header: 'Status', cell: (x) => <StatusBadge domain="contract" value={x.getValue<string>()} /> }, { accessorKey: 'renewalOf', header: 'Renewal of' }]} />}
      {tab === 'accreditation' && (
        <Stack>
          {!d.accreditations.length && <Card><p className="text-sm text-muted">No accreditation submitted yet.</p></Card>}
          {d.accreditations.map((a) => (
            <Card key={a.id}>
              <CardHeader title={<span className="flex items-center gap-2">Submitted {formatDateTime(a.submittedAt)} <StatusBadge domain="accreditation" value={a.status} /></span>} description={a.bici.result ? `BICI: ${a.bici.result}${a.bici.reasoning ? ` — ${a.bici.reasoning}` : ''}` : undefined}
                actions={<Link to={`/clients/accreditation?open=${a.id}`} className="text-sm font-medium text-brand-700 hover:underline">Open in queue →</Link>} />
              {a.workflow && <ApprovalTimeline workflow={a.workflow} userName={userName} />}
            </Card>
          ))}
        </Stack>
      )}
      {tab === 'activities' && <DataTable data={d.activities} searchable={false} emptyTitle="No sales activities logged for this client" columns={[
        { id: 'at', header: 'Date', cell: (x) => formatDateTime(x.row.original.at ?? x.row.original.date) }, { accessorKey: 'type', header: 'Type' }, { accessorKey: 'aeUserId', header: 'AE', cell: (x) => userName(x.getValue<string>()) },
        { accessorKey: 'location', header: 'Location' }, { accessorKey: 'outcome', header: 'Outcome' }, { accessorKey: 'notes', header: 'Notes' }, { accessorKey: 'nextActionDate', header: 'Next action', cell: (x) => (x.getValue() ? formatDate(x.getValue<string>()) : '—') }]} />}
      {tab === 'invoices' && <DataTable data={d.invoices} searchable={false} emptyTitle="No invoices" columns={[
        { accessorKey: 'invoiceNo', header: 'Invoice', cell: (x) => <Link className="font-mono text-brand-600 hover:underline" to={`/billing/invoices/${x.getValue()}`}>{x.getValue<string>()}</Link> },
        { accessorKey: 'dueDate', header: 'Due', cell: (x) => formatDate(x.getValue<string>()) }, { accessorKey: 'total', header: 'Total', meta: { align: 'right' }, cell: (x) => formatPhp(x.getValue<number>()) },
        { accessorKey: 'balance', header: 'Balance', meta: { align: 'right' }, cell: (x) => <MoneyText value={x.getValue<number>()} /> }, { accessorKey: 'payment', header: 'Status', cell: (x) => <StatusBadge domain="payment" value={x.getValue<string>()} /> }]} />}
      {tab === 'ewas' && <DataTable data={d.ewas} searchable={false} emptyTitle="No EWAs" columns={[
        { accessorKey: 'euNo', header: 'EU no.' }, { accessorKey: 'branchCode', header: 'Branch' }, { accessorKey: 'driverName', header: 'Driver' }, { accessorKey: 'createdAt', header: 'Created', cell: (x) => formatDateTime(x.getValue<string>()) },
        { accessorKey: 'status', header: 'Status', cell: (x) => <StatusBadge domain="ewa" value={x.getValue<string>()} /> }]} />}
      {tab === 'audit' && <DataTable data={d.audit} searchable={false} emptyTitle="No audited changes yet" columns={[
        { accessorKey: 'at', header: 'Time', cell: (x) => formatDateTime(x.getValue<string>()) }, { accessorKey: 'actor', header: 'Actor', cell: (x) => userName(x.getValue<string>()) }, { accessorKey: 'action', header: 'Action' }, { accessorKey: 'reason', header: 'Reason' }]} />}
      {editing && <ClientEditDrawer client={c} onClose={() => setEditing(false)} />}
      {accOpen && <SubmitAccreditationModal code={c.clientCode} onClose={closeAcc} />}
      {contactOpen && <AddContactModal code={c.clientCode} onClose={() => setContactOpen(false)} />}
      <ConfirmDialog open={decline} onClose={() => setDecline(false)} onConfirm={(r) => declinePortal.mutate(r)} title="Decline portal registration" message="The client is set to Inactive and notified by email." requireReason tone="danger" confirmLabel="Decline" loading={declinePortal.isPending} />
    </>
  );
}

/** Add an authorised contact / signatory (used by the profile and the contract form). */
export function AddContactModal({ code, onClose, signatory, onAdded }: { code: string; onClose: () => void; signatory?: boolean; onAdded?: (id: string) => void }) {
  const [v, setV] = useState({ firstName: '', lastName: '', position: '', phone: '', email: '', isSignatory: !!signatory });
  const [tried, setTried] = useState(false);
  const act = useAction(() => api.clients.addContact(code, v), { success: 'Contact added', onSuccess: (r) => { onAdded?.(r.id); onClose(); } });
  const req = (k: 'firstName' | 'lastName' | 'phone' | 'email') => (tried && !v[k].trim() ? 'Required' : undefined);
  return (
    <Modal open onClose={onClose} title={signatory ? 'Add signatory' : 'Add contact'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.isPending} onClick={() => { setTried(true); if (v.firstName.trim() && v.lastName.trim() && v.phone.trim() && v.email.trim()) act.mutate(undefined); }}>Save</Button></>}>
      <FormGrid>
        <Input label="First name" required value={v.firstName} error={req('firstName')} onChange={(e) => setV({ ...v, firstName: e.target.value })} placeholder="e.g. Juan" />
        <Input label="Last name" required value={v.lastName} error={req('lastName')} onChange={(e) => setV({ ...v, lastName: e.target.value })} placeholder="e.g. Dela Cruz" />
        <Input label="Position / designation" value={v.position} onChange={(e) => setV({ ...v, position: e.target.value })} placeholder="e.g. General Manager" />
        <Input label="Phone" required value={v.phone} error={req('phone')} onChange={(e) => setV({ ...v, phone: e.target.value })} type="tel" hint="Format: +63 9XX XXX XXXX" placeholder="e.g. +63 917 123 4567" />
        <Input label="Email" type="email" required value={v.email} error={req('email')} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="e.g. name@company.ph" />
      </FormGrid>
      <Checkbox className="mt-4" label="Authorised signatory" description="Can sign lease contracts for the client" checked={v.isSignatory} onChange={(e) => setV({ ...v, isSignatory: e.target.checked })} />
    </Modal>
  );
}

function EligibilityCard({ client: c }: { client: Client }) {
  const { can } = useAuth();
  const { branchOptions } = useRefLookups();
  const [flags, setFlags] = useState({ allowLt: c.allowLt, allowSt: c.allowSt, allowOnline: c.allowOnline, allowSpecial: c.allowSpecial, allowRescue: c.allowRescue, cwsBranchAccess: c.cwsBranchAccess });
  const save = useAction(() => api.clients.update(c.clientCode, flags), { success: 'Eligibility saved' });
  const editable = can('clients.client', 'approve');
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Status" />
        <KeyValueGrid cols={2} items={[{ label: 'Status', value: <ClientStatusChip status={c.status} /> }, { label: 'Registration source', value: c.registrationSource },
          { label: 'Refer to Legal', value: c.isLegal ? 'Yes' : 'No' }, { label: 'Refer to C.A.', value: c.isCollectionAgency ? 'Yes' : 'No' }, { label: 'Credit limit', value: c.creditLimit ? formatPhp(c.creditLimit) : 'Not set — set at VP sign-off' }]} />
        <p className="mt-4 text-xs text-muted">Status changes only through accreditation, credit hold or hold-lift workflows — never by direct edit. Flags and credit limit are first set on VP sign-off.</p>
      </Card>
      <Card>
        <CardHeader title="Eligibility flags" description={editable ? 'Changing flags requires the approve permission.' : 'Read-only for your role.'} actions={editable && <Button size="sm" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>} />
        <EligibilitySwitches flags={flags} onChange={(x) => setFlags({ ...flags, ...x })} disabled={!editable} branchOptions={branchOptions} />
      </Card>
    </div>
  );
}

type Flags = Pick<Client, 'allowLt' | 'allowSt' | 'allowOnline' | 'allowSpecial' | 'allowRescue' | 'cwsBranchAccess'>;
function EligibilitySwitches({ flags, onChange, disabled, branchOptions }: { flags: Flags; onChange: (f: Partial<Flags>) => void; disabled?: boolean; branchOptions: { value: string; label: string }[] }) {
  return (
    <>
      <div className="divide-y divide-line">
        <Switch label="Allow for LT (long-term lease)" checked={flags.allowLt} disabled={disabled} onChange={(v) => onChange({ allowLt: v })} />
        <Switch label="Allow for ST (short-term lease)" checked={flags.allowSt} disabled={disabled} onChange={(v) => onChange({ allowSt: v })} />
        <Switch label="Allow Online (portal EWA)" checked={flags.allowOnline} disabled={disabled} onChange={(v) => onChange({ allowOnline: v })} />
        <Switch label="Allow Special billing" checked={flags.allowSpecial} disabled={disabled} onChange={(v) => onChange({ allowSpecial: v })} />
        <Switch label="Allow Rescue" checked={flags.allowRescue} disabled={disabled} onChange={(v) => onChange({ allowRescue: v })} />
      </div>
      <p className="mb-2 mt-4 text-[13px] font-medium text-ink-2">CWS branch access</p>
      <div className="flex flex-wrap gap-1.5">
        {branchOptions.map((b) => {
          const on = flags.cwsBranchAccess.includes(b.value);
          return <button key={b.value} type="button" disabled={disabled} onClick={() => onChange({ cwsBranchAccess: on ? flags.cwsBranchAccess.filter((x) => x !== b.value) : [...flags.cwsBranchAccess, b.value] })}
            className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-muted'}`}>{b.value}</button>;
        })}
      </div>
    </>
  );
}

function ClientEditDrawer({ client, onClose }: { client: Client; onClose: () => void }) {
  const [v, setV] = useState({ ...client });
  const save = useAction(() => api.clients.update(client.clientCode, { clientName: v.clientName, billingName: v.billingName, qbName: v.qbName, address1: v.address1, address2: v.address2, city: v.city, province: v.province, zipCode: v.zipCode, country: v.country, tradeName: v.tradeName, industry: v.industry, phone: v.phone, fax: v.fax, website: v.website, email: v.email, ebillingEmail: v.ebillingEmail, billingCycle: v.billingCycle, notes: v.notes }), { success: 'Client saved', onSuccess: onClose });
  const set = (k: keyof Client) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const emailErr = (s?: string) => (s && !/^\S+@\S+\.\S+$/.test(s) ? 'Enter a valid email' : undefined);
  const invalid = !v.clientName.trim() || !v.billingName.trim() || !v.address1.trim() || !!emailErr(v.email) || !!emailErr(v.ebillingEmail);
  return (
    <Drawer open onClose={onClose} title={`Edit ${client.clientCode}`} width="max-w-2xl" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={invalid} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <FormGrid>
        <Input label="Name" required value={v.clientName} error={!v.clientName.trim() ? 'Required' : undefined} onChange={set('clientName')} placeholder="e.g. ABC Logistics Inc." /><Input label="Billing name" required value={v.billingName} error={!v.billingName.trim() ? 'Required' : undefined} onChange={set('billingName')} placeholder="Legal name printed on invoices" />
        <Input label="QuickBooks name" value={v.qbName ?? ''} onChange={set('qbName')} placeholder="Customer name as it appears in QuickBooks" /><Select label="Billing cycle" value={v.billingCycle} onChange={set('billingCycle')} options={[{ value: 'Weekly', label: 'Weekly' }, { value: 'Monthly', label: 'Monthly' }]} />
        <Input label="Registered address" required value={v.address1} onChange={set('address1')} placeholder="Unit, building, street" /><Input label="Address line 2" value={v.address2 ?? ''} onChange={set('address2')} placeholder="Barangay, district (optional)" />
        <Input label="City / municipality" value={v.city ?? ''} onChange={set('city')} placeholder="e.g. Manila" /><Select label="Province / region" value={v.province ?? ''} onChange={set('province')} placeholder="Select" options={PROVINCES.map((p) => ({ value: p, label: p }))} />
        <Input label="ZIP code" value={v.zipCode ?? ''} onChange={set('zipCode')} placeholder="e.g. 1012" /><Input label="Trade name" value={v.tradeName ?? ''} onChange={set('tradeName')} placeholder="Name used in business (optional)" />
        <Select label="Client type / industry" value={v.industry ?? ''} onChange={set('industry')} placeholder="Select" options={INDUSTRIES.map((x) => ({ value: x, label: x }))} />
        <Input label="Country" value={v.country ?? ''} onChange={set('country')} placeholder="e.g. Philippines" /><Input label="Phone" value={v.phone ?? ''} onChange={set('phone')} placeholder="e.g. 0917 123 4567" />
        <Input label="Fax" value={v.fax ?? ''} onChange={set('fax')} placeholder="e.g. (02) 8123 4567" /><Input label="Website" value={v.website ?? ''} onChange={set('website')} placeholder="e.g. www.company.ph" />
        <Input label="Email" value={v.email ?? ''} error={emailErr(v.email)} onChange={set('email')} placeholder="e.g. name@company.ph" /><Input label="E-billing email" value={v.ebillingEmail ?? ''} error={emailErr(v.ebillingEmail)} onChange={set('ebillingEmail')} placeholder="e.g. billing@company.ph" />
      </FormGrid>
      <Textarea className="mt-4" wrapperClassName="mt-4" label="Notes" value={v.notes ?? ''} onChange={set('notes')} placeholder="Internal notes about this client" />
      <p className="mt-3 text-xs text-muted">Eligibility flags and CWS branch access are edited on the Status &amp; eligibility tab (approve permission). Every change is audited.</p>
    </Drawer>
  );
}

function SubmitAccreditationModal({ code, onClose }: { code?: string; onClose: () => void }) {
  const { ref } = useRefLookups();
  const [client, setClient] = useState(code ?? '');
  const [b, setB] = useState({ yearsInOperation: '', secReg: '', tin: '', tradeReferences: '', bankReferences: '', natureOfBusiness: '', owners: '', requestedLimit: 0, requestedTermDays: '', expectedUnits: '', remarks: '' });
  const [types, setTypes] = useState<string[]>([]);
  // Review 1.2: documents can be attached at submission (more can be added in the queue).
  const [docs, setDocs] = useState<{ kind: string; fileName: string }[]>([{ kind: 'SEC / DTI certificate', fileName: '' }, { kind: 'Trade reference letter', fileName: '' }, { kind: 'Bank certificate', fileName: '' }]);
  const num = (s: string) => (s === '' ? undefined : Number(s) || undefined);
  const act = useAction(() => api.clients.submitAccreditation(client, {
    ...b, yearsInOperation: num(b.yearsInOperation), requestedLimit: b.requestedLimit || undefined, requestedTermDays: num(b.requestedTermDays), expectedUnits: num(b.expectedUnits), requestedTypes: types.length ? types : undefined,
    natureOfBusiness: b.natureOfBusiness || undefined, owners: b.owners || undefined, remarks: b.remarks || undefined,
  }, docs.filter((d) => d.fileName)), { success: 'Submitted — C&C has been notified', onSuccess: onClose });
  const { user } = useAuth();
  // Review 1.1: only Drafts not already in accreditation, and portal registrations the AE has approved.
  const list = useData(['clients'], () => api.clients.list(), !code);
  const drafts = (list.data ?? ref?.clients ?? []).filter((c) => c.status === 'Draft').map((c) => {
    const x = c as Partial<ClientRow>;
    const why = x.portalPending ? 'portal registration awaiting AE approval' : x.accreditationStage?.startsWith('Pending') ? `already submitted — ${x.accreditationStage}` : undefined;
    return { value: c.clientCode, label: `${c.clientCode} — ${c.clientName}${why ? ` (${why})` : ''}`, disabled: !!why };
  });
  return (
    <Modal open onClose={onClose} title="Submit for BICI accreditation" description="Workflow: C&C investigation → Finance endorsement → VP sign-off. The client stays in Draft until VP approval." size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.isPending} disabled={!client} onClick={() => act.mutate(undefined)}>Submit</Button></>}>
      <Stack>
        {!code && <Select label="Client (Draft)" required value={client} onChange={(e) => setClient(e.target.value)} placeholder="Select a Draft client" options={drafts} hint={drafts.length && drafts.every((d) => d.disabled) ? 'No Draft client is ready to submit — approve the portal registration or register a client first.' : 'Draft clients not yet submitted. Disabled entries show why.'} />}
        {act.error && <Banner tone="danger">{errMessage(act.error)}</Banner>}
        <p className="text-[13px] text-muted">Known details help the C&amp;C Officer; all BICI fields can be completed during the investigation. Documents can be attached here or later in the queue. Submitted by {user?.name ?? 'you'} today; the date and time are recorded.</p>
        <FormGrid>
          <Input label="Years in operation" type="number" value={b.yearsInOperation} onChange={(e) => setB({ ...b, yearsInOperation: e.target.value })} placeholder="e.g. 5" hint="Entered, not calculated from the SEC date" />
          <Input label="SEC / DTI registration" value={b.secReg} onChange={(e) => setB({ ...b, secReg: e.target.value })} placeholder="e.g. CS201912345" />
          <Input label="TIN" value={b.tin} onChange={(e) => setB({ ...b, tin: e.target.value })} placeholder="e.g. 123-456-789-000" />
          <Input label="Nature of business" value={b.natureOfBusiness} onChange={(e) => setB({ ...b, natureOfBusiness: e.target.value })} placeholder="e.g. Container trucking for forwarders" />
          <Textarea label="Trade references" value={b.tradeReferences} onChange={(e) => setB({ ...b, tradeReferences: e.target.value })} placeholder={'One per line: company — contact person — phone\ne.g. ABC Fuels — Ana Cruz — 0917 123 4567'} hint="One reference per line; the C&C Officer records the result of each check." />
          <Textarea label="Bank references" value={b.bankReferences} onChange={(e) => setB({ ...b, bankReferences: e.target.value })} placeholder={'One per line: bank, branch, account type\ne.g. BDO Ortigas branch, current account'} />
          <Input label="Owners / officers" value={b.owners} onChange={(e) => setB({ ...b, owners: e.target.value })} placeholder="e.g. Juan Dela Cruz (President)" />
        </FormGrid>
        <FormSection title="Request details (for Finance and the VP)" description="Optional; whether these are captured at submission is pending confirmation.">
          <FormGrid>
            <MoneyInput label="Requested credit limit" value={b.requestedLimit || ''} onChange={(e) => setB({ ...b, requestedLimit: Number(e.target.value) || 0 })} placeholder="e.g. 500000" />
            <Input label="Requested credit term (days)" type="number" value={b.requestedTermDays} onChange={(e) => setB({ ...b, requestedTermDays: e.target.value })} placeholder="e.g. 30" />
            <Input label="Expected units" type="number" value={b.expectedUnits} onChange={(e) => setB({ ...b, expectedUnits: e.target.value })} placeholder="e.g. 6" />
            <Field label="Contract types requested">{() => <div className="flex h-9 flex-wrap items-center gap-4">{['LTL', 'SPL', 'QLP'].map((t) => <Checkbox key={t} label={t} checked={types.includes(t)} onChange={(e) => setTypes(e.target.checked ? [...types, t] : types.filter((x) => x !== t))} />)}</div>}</Field>
          </FormGrid>
          <Textarea className="mt-4" wrapperClassName="mt-4" label="Remarks" value={b.remarks} onChange={(e) => setB({ ...b, remarks: e.target.value })} placeholder="Anything C&C, Finance or the VP should know" />
        </FormSection>
        <FormSection title="Attachments (optional)" description="PDF or image. Eligibility flags are not requested here — the VP sets them at sign-off.">
          <div className="grid gap-3 md:grid-cols-3">
            {docs.map((d, i) => <FilePick key={d.kind} label={d.kind} accept=".pdf,image/*" fileName={d.fileName} onPick={(n) => setDocs(docs.map((x, k) => (k === i ? { ...x, fileName: n } : x)))} />)}
          </div>
        </FormSection>
      </Stack>
    </Modal>
  );
}

// ── SCR-07 Client Accreditation Workflow ───────────────────────────────────
const ACC_STAGE_FILTER = ['Pending C&C', 'Pending Finance', 'Pending VP', 'Approved', 'Rejected'];
export function AccreditationPage() {
  const [sp] = useSearchParams();
  const data = useData(['accreditations'], () => api.clients.accreditations());
  const { userName, branchName } = useRefLookups();
  const { can } = useAuth();
  const [stage, setStage] = useState('');
  const [escOnly, setEscOnly] = useState(false);
  const [selId, setSelId] = useState<string | null>(sp.get('open'));
  const [submitOpen, setSubmitOpen] = useState(false);
  const sel = data.data?.find((a) => a.id === selId) ?? null;
  const rows = (data.data ?? []).filter((a) => (!stage || a.status === stage) && (!escOnly || a.escalated)).map((a) => ({ ...a, aeBranch: `${userName(a.aeAssigned)} (${a.branchCode})` }));
  return (
    <>
      <PageHeader title="Client accreditation" description="BI/CI investigation, Finance endorsement and VP sign-off. Stages: Pending C&C → Pending Finance → Pending VP → Approved (client Active) or Rejected. The client stays Draft until VP approval."
        actions={can('clients.accreditation', 'add') && <Button icon={<ShieldCheck className="size-4" />} onClick={() => setSubmitOpen(true)}>Submit for accreditation</Button>} />
      <DataTable data={rows} loading={data.isLoading} onRowClick={(r) => setSelId(r.id)} emptyTitle="No accreditations" exportName="accreditations"
        rowClassName={(r) => (r.escalated ? 'bg-warning-bg/40' : undefined)}
        toolbar={<>
          <Select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} placeholder="All stages (incl. history)" options={ACC_STAGE_FILTER.map((s) => ({ value: s, label: s === 'Approved' ? 'Approved (Active)' : s }))} />
          <Checkbox label="Escalated only" checked={escOnly} onChange={(e) => setEscOnly(e.target.checked)} />
        </>}
        columns={[
          // Review 1.2: attempt number, with a link to the earlier (rejected) attempt.
          { accessorKey: 'clientCode', header: 'Client', cell: (c) => { const r = c.row.original; return <div><button type="button" className="text-left font-medium text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); setSelId(r.id); }}>{r.clientName}</button><p className="whitespace-nowrap font-mono text-xs text-muted">{c.getValue<string>()}</p>
            {r.attempts > 1 && <p className="whitespace-nowrap text-xs text-muted">Attempt {r.attempt} of {r.attempts}{r.previousId && <> · <button type="button" className="text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); setSelId(r.previousId!); }}>earlier attempt</button></>}</p>}</div>; } },
          // AE with the branch as a muted second line (export keeps both as "AE (branch)").
          { accessorKey: 'aeBranch', header: 'AE / branch', meta: { nowrap: true }, cell: (c) => <div><p>{userName(c.row.original.aeAssigned)}</p><p className="text-xs text-muted" title={branchName(c.row.original.branchCode)}>{c.row.original.branchCode}</p></div> },
          // Stage with the current approver beneath.
          { accessorKey: 'status', header: 'Stage', meta: { nowrap: true }, cell: (c) => <div><div className="flex flex-wrap gap-1"><StatusBadge domain="accreditation" value={c.getValue<string>()} />{c.row.original.escalated && <Badge tone="warning">Escalated</Badge>}</div>{c.row.original.currentApprovers.length > 0 && <p className="mt-0.5 text-xs text-muted">Approver: {c.row.original.currentApprovers.map(userName).join(', ')}</p>}
            {c.row.original.escalated && <p className="mt-0.5 max-w-[200px] whitespace-normal text-xs text-warning">Past the {c.row.original.windowHours} h window — reminder sent to the approver</p>}</div> },
          { accessorKey: 'submittedAt', header: 'Submitted', meta: { nowrap: true }, cell: (c) => <div><p>{formatDateTime(c.getValue<string>())}</p>{c.row.original.submittedBy && <p className="text-xs text-muted">by {userName(c.row.original.submittedBy)}</p>}</div> },
          { accessorKey: 'dueAt', header: 'Due', meta: { nowrap: true }, cell: (c) => (c.getValue() ? <span className={cn(c.row.original.escalated && 'font-medium text-danger')}>{formatDateTime(c.getValue<string>())}</span> : '—') },
          { accessorKey: 'daysInStage', header: 'Days', meta: { align: 'right' }, cell: (c) => <span title="Days in the current stage">{c.getValue<number>()}</span> },
          { id: 'score', header: 'Score · limit', meta: { align: 'right', nowrap: true }, cell: (c) => { const b = c.row.original.bici; return b.creditScore == null && !b.recommendedLimit ? '—' : <div title="Credit score · grade, recommended credit limit"><p>{b.creditScore != null ? `${b.creditScore}${b.grade ? ` · ${b.grade}` : ''}` : '—'}</p>{b.recommendedLimit ? <p className="text-xs text-muted">{formatPhp(b.recommendedLimit)}</p> : null}</div>; } },
          { id: 'res', header: 'Result / reason', meta: { wrap: true }, cell: (c) => { const r = c.row.original; const t = r.rejection ? `Rejected at ${r.rejection.step}: ${r.rejection.reason ?? ''}` : r.bici.result ?? '—'; const g = r.activation; return <div className="w-[220px] text-xs text-ink-2"><p>{t}</p>
            {/* Review 1.2: terms granted at VP sign-off. */}
            {r.status === 'Approved' && g && <p className="mt-0.5 text-muted">Granted: {g.creditLimit ? formatPhp(g.creditLimit) : '—'}{g.creditTermDays ? ` · ${g.creditTermDays}-day term` : ''} · {[g.allowLt && 'LT', g.allowSt && 'ST', g.allowOnline && 'Online', g.allowSpecial && 'Special billing', g.allowRescue && 'Rescue'].filter(Boolean).join(', ') || 'no flags'}</p>}</div>; } },
          // Review 1.2: closing decision — who and when.
          { id: 'dec', header: 'Decided', meta: { nowrap: true }, cell: (c) => { const x = c.row.original.decision; return x ? <div><p>{formatDateTime(x.at)}</p><p className="text-xs text-muted">{userName(x.by)} · {x.step}</p></div> : <span className="text-muted">Open</span>; } },
        ]} />
      <p className="mt-2 text-xs text-muted">Days = days in the current stage for open items; for closed items, days the last stage took to decide. Each stage has a {rows[0]?.windowHours ?? 48}-hour window (System settings → escalation hours); past it the row is Escalated and the approvers get a reminder. Score (0–100) and grade are entered by the C&amp;C Officer; the scoring model and grade bands are pending Delbros&apos; decision. Clients active before the system (for example ABC Logistics) were accredited outside it and have no history here.</p>
      {sel && <AccreditationDrawer key={sel.id} row={sel} all={data.data ?? []} onOpen={setSelId} onClose={() => setSelId(null)} />}
      {submitOpen && <SubmitAccreditationModal onClose={() => setSubmitOpen(false)} />}
    </>
  );
}

const BICI_FIELDS: { k: string; l: string; req?: boolean; num?: boolean; wide?: boolean; ph?: string }[] = [
  { k: 'yearsInOperation', l: 'Years in operation', num: true, ph: 'e.g. 5' }, { k: 'secReg', l: 'SEC / DTI reg.', req: true, ph: 'e.g. CS201912345' }, { k: 'tin', l: 'TIN', req: true, ph: 'e.g. 123-456-789-000' },
  { k: 'tradeReferences', l: 'Trade references', req: true, ph: 'Supplier names and contact persons' }, { k: 'bankReferences', l: 'Bank references', req: true, ph: 'e.g. BDO Ortigas branch, current account' }, { k: 'siteVisitNotes', l: 'Site visit notes', ph: 'What you saw at the yard or office' },
  { k: 'creditScore', l: 'Credit score', req: true, num: true, ph: 'e.g. 75' }, { k: 'grade', l: 'Grade', req: true, ph: 'e.g. A' }, { k: 'recommendedTermDays', l: 'Recommended term (days)', num: true, ph: 'e.g. 30' }, { k: 'recommendedLimit', l: 'Recommended limit (₱)', num: true, ph: 'e.g. 500000' },
];
const DOC_KINDS = ['SEC / DTI certificate', 'Financial statements', 'Site-visit photos', 'Trade reference letter', 'Bank certificate', 'Other'];

function AccreditationDrawer({ row: a, all, onOpen, onClose }: { row: AccRow; all: AccRow[]; onOpen: (id: string) => void; onClose: () => void }) {
  const earlier = all.filter((x) => x.clientCode === a.clientCode && x.id !== a.id && x.submittedAt < a.submittedAt).sort((p, q) => q.submittedAt.localeCompare(p.submittedAt));
  const [note, setNote] = useState('');
  const addNote = useAction(() => api.clients.addAccreditationNote(a.id, note), { success: 'Note added', onSuccess: () => setNote('') });
  const [termDays, setTermDays] = useState(String(a.bici.recommendedTermDays ?? a.bici.requestedTermDays ?? 30));
  const { userName, branchName, branchOptions } = useRefLookups();
  const { user, can } = useAuth();
  const client = useData(['client', a.clientCode], () => api.clients.get(a.clientCode));
  const [bici, setBici] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(a.bici).map(([k, v]) => [k, String(v ?? '')])));
  const [comment, setComment] = useState('');
  const [tried, setTried] = useState(false);
  const [signOff, setSignOff] = useState(todayManila());
  const c = client.data?.client;
  const [act, setAct] = useState<Flags & { creditLimit: number } | null>(null);
  useEffect(() => { if (c && !act) setAct({ allowLt: c.allowLt, allowSt: c.allowSt, allowOnline: c.allowOnline, allowSpecial: c.allowSpecial, allowRescue: c.allowRescue, cwsBranchAccess: c.cwsBranchAccess, creditLimit: Number(a.bici.recommendedLimit ?? c.creditLimit ?? 0) }); }, [c]); // eslint-disable-line react-hooks/exhaustive-deps
  const [doc, setDoc] = useState({ kind: DOC_KINDS[0], fileName: '' });
  const wf = a.workflow as WorkflowInstance | undefined;
  const step = wf?.currentStep ?? 0;
  const myTurn = !!wf && wf.status === 'Pending' && !!user && wf.requestedBy !== user.userId && user.roles.some((r) => wf.steps[wf.currentStep]?.roles.includes(r));
  const isCnc = myTurn && step === 0, isFin = myTurn && step === 1, isVp = myTurn && step === 2;
  const nums = () => Object.fromEntries(Object.entries(bici).map(([k, v]) => [k, BICI_FIELDS.find((f) => f.k === k)?.num ? (v === '' ? undefined : Number(v)) : v || undefined]));
  const missing = [...BICI_FIELDS.filter((f) => f.req).map((f) => f.k), 'result', 'reasoning'].filter((k) => !String(bici[k] ?? '').trim());
  const saveBici = useAction(() => api.clients.saveBici(a.id, nums()), { success: 'BICI draft saved' });
  const decide = useAction((v: { d: 'Approved' | 'Rejected'; comment: string }) => api.clients.decideAccreditation(a.id, v.d, v.comment, {
    bici: isCnc ? nums() : undefined, activation: isVp && act ? { ...act, signOffDate: signOff, creditTermDays: Number(termDays) || undefined } : undefined,
  }), { success: (r) => `Recorded — ${r.status}`, onSuccess: () => { setComment(''); setTried(false); } });
  const addDoc = useAction(() => api.clients.addAccreditationDoc(a.id, doc.kind, doc.fileName), { success: 'Document attached', onSuccess: () => setDoc({ ...doc, fileName: '' }) });
  const resubmit = useAction(() => api.clients.submitAccreditation(a.clientCode, { ...a.bici }), { success: 'Resubmitted — C&C has been notified', onSuccess: onClose });
  const submitEval = () => { setTried(true); if (missing.length) return; decide.mutate({ d: bici.result === 'Recommend' ? 'Approved' : 'Rejected', comment: `${bici.result}: ${bici.reasoning}` }); };
  const err = (k: string) => (tried && missing.includes(k) ? 'Required' : fieldError(decide.error, k));
  const stepOwner = wf?.status === 'Pending' ? wf.steps[step] : undefined;
  // Attaching evidence: only the current step owner or the requesting / assigned AE — others see the list read-only.
  const canAttach = wf?.status === 'Pending' && !!user && (myTurn || wf.requestedBy === user.userId || a.aeAssigned === user.userId);
  return (
    <Drawer open onClose={onClose} title={`BICI — ${a.clientName}`} width="max-w-3xl"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        {(isFin || isVp) && <>
          <Button variant="danger" disabled={!comment.trim()} loading={decide.isPending} onClick={() => decide.mutate({ d: 'Rejected', comment })}>Reject</Button>
          <Button variant="success" disabled={!comment.trim() || (isVp && !signOff)} loading={decide.isPending} onClick={() => decide.mutate({ d: 'Approved', comment })}>{isVp ? 'Approve & activate client' : 'Endorse (approve)'}</Button>
        </>}
      </>}>
      <Stack>
        <Card className="bg-surface-alt/40">
          <KeyValueGrid cols={4} items={[
            { label: 'Company code', value: <span className="font-mono">{a.clientCode}</span> }, { label: 'Branch', value: branchName(a.branchCode) }, { label: 'AE', value: userName(a.aeAssigned) },
            { label: 'Client status', value: <ClientStatusChip status={a.clientStatus ?? 'Draft'} stage={a.clientStatus === 'Draft' ? a.status : undefined} /> },
            { label: 'Submitted', value: <>{formatDateTime(a.submittedAt)}{a.submittedBy && <span className="block text-xs text-muted">by {userName(a.submittedBy)}</span>}</> }, { label: 'Stage', value: <StatusBadge domain="accreditation" value={a.status} /> }, { label: 'Days in stage', value: a.daysInStage },
            // Review 1.2: a Draft client has no credit limit yet — it is set at VP sign-off. The requested limit (if any) is labelled as such.
            { label: 'Credit limit', value: a.clientStatus === 'Draft' ? <span className="text-muted">Not set — set at VP sign-off{a.bici.requestedLimit ? <span className="block text-xs">Requested {formatPhp(a.bici.requestedLimit)}</span> : null}</span> : a.creditLimit ? <>{formatPhp(a.creditLimit)}<span className="block text-xs text-muted">Approved limit</span></> : '—' },
            { label: 'Attempt', value: `${a.attempt} of ${a.attempts}` },
          ]} />
        </Card>
        {stepOwner && (
          <Banner tone={a.escalated ? 'warning' : 'info'} title={a.escalated ? `Escalated — ${Math.max(0, (a.elapsedHours ?? 0) - (a.windowHours ?? 0))} h past due` : `Waiting for ${stepOwner.label}`}>
            Owner: {a.currentApprovers.map(userName).join(', ') || stepOwner.roles.map(roleName).join(', ')} ({stepOwner.roles.map(roleName).join(', ')}){a.escalated ? `. Due ${formatDateTime(a.dueAt)} (${a.windowHours} h window); reminder sent to the approver at that time. No higher escalation level is set up (pending decision).` : ` · due ${formatDateTime(a.dueAt)}`}
          </Banner>
        )}
        {earlier.length > 0 && <p className="text-[13px] text-ink-2">Earlier attempt{earlier.length > 1 ? 's' : ''}: {earlier.map((x) => <button key={x.id} type="button" className="mr-2 font-medium text-brand-600 hover:underline" onClick={() => onOpen(x.id)}>Attempt {x.attempt} · {formatDate(x.submittedAt)} · {x.status}</button>)}</p>}
        {a.status === 'Rejected' && a.rejection && (
          <Banner tone="danger" title={`Rejected at ${a.rejection.step}`} actions={a.clientStatus === 'Draft' && can('clients.accreditation', 'add') && <Button size="sm" loading={resubmit.isPending} onClick={() => resubmit.mutate(undefined)}>Resubmit</Button>}>
            {a.rejection.reason} — {userName(a.rejection.by)}, {formatDateTime(a.rejection.at)}. Resulting client status: Draft (unchanged). The AE was notified and may resubmit with the missing evidence.
          </Banner>
        )}
        {a.status === 'Approved' && <Banner tone="success" title="Approved — client Active">Eligibility flags, CWS branch access and credit limit were set on VP sign-off{a.activation?.signOffDate ? ` (${formatDate(a.activation.signOffDate)})` : ''}.
          {a.activation && <span className="mt-1 block">Granted: credit limit {a.activation.creditLimit ? formatPhp(a.activation.creditLimit) : '—'}{a.activation.creditTermDays ? ` · ${a.activation.creditTermDays}-day credit term` : ''} · flags {[a.activation.allowLt && 'LT', a.activation.allowSt && 'ST', a.activation.allowOnline && 'Online', a.activation.allowSpecial && 'Special billing', a.activation.allowRescue && 'Rescue'].filter(Boolean).join(', ') || 'none'} · CWS branches {a.activation.cwsBranchAccess.join(', ')}.</span>}</Banner>}
        {/* Review 1.2: request details captured at submission. */}
        {(a.bici.natureOfBusiness || a.bici.owners || a.bici.requestedLimit || a.bici.requestedTermDays || a.bici.expectedUnits || a.bici.requestedTypes?.length || a.bici.remarks) && (
          <FormSection title="Request details" description="Captured by the AE at submission.">
            <KeyValueGrid cols={3} items={[{ label: 'Nature of business', value: a.bici.natureOfBusiness }, { label: 'Owners / officers', value: a.bici.owners }, { label: 'Requested limit', value: a.bici.requestedLimit ? formatPhp(a.bici.requestedLimit) : undefined },
              { label: 'Requested term', value: a.bici.requestedTermDays ? `${a.bici.requestedTermDays} days` : undefined }, { label: 'Expected units', value: a.bici.expectedUnits }, { label: 'Contract types', value: a.bici.requestedTypes?.join(', ') }, { label: 'Remarks', value: a.bici.remarks }]} />
          </FormSection>
        )}
        {wf && <Card><CardHeader title="Approval steps" description="Actor and timestamp per step" /><ApprovalTimeline workflow={wf} userName={userName} /></Card>}
        {!myTurn && wf?.status === 'Pending' && <p className="text-[13px] text-muted">Read-only — actions appear only for the step owner ({stepOwner?.roles.map(roleName).join(', ')}).</p>}
        <FormSection title="BICI Evaluation Form" description={isCnc ? 'C&C Officer: complete the form, save a draft, then submit the evaluation. * = required to submit. Credit score and grade are entered manually (scoring model pending decision).' : 'Read-only.'}
          actions={isCnc && <><Button size="sm" variant="secondary" loading={saveBici.isPending} onClick={() => saveBici.mutate(undefined)}>Save draft</Button><Button size="sm" loading={decide.isPending} onClick={submitEval}>Submit evaluation</Button></>}>
          {isCnc && tried && missing.length > 0 && <Banner tone="danger" className="mb-3">Complete the required fields: {missing.map((k) => BICI_FIELDS.find((f) => f.k === k)?.l ?? (k === 'result' ? 'BICI result' : 'Reasoning')).join(', ')}.</Banner>}
          {isCnc ? <>
            <FormGrid>
              {BICI_FIELDS.map((f) => (
                <Input key={f.k} label={f.l} required={f.req} type={f.num ? 'number' : 'text'} value={bici[f.k] ?? ''} error={err(f.k)} onChange={(e) => setBici({ ...bici, [f.k]: e.target.value })} placeholder={f.ph} />
              ))}
              <Select label="BICI result" required value={bici.result ?? ''} error={err('result')} onChange={(e) => setBici({ ...bici, result: e.target.value })} placeholder="Select" options={[{ value: 'Recommend', label: 'Recommend' }, { value: 'Do not recommend', label: 'Do not recommend' }]} />
            </FormGrid>
            <Textarea className="mt-4" wrapperClassName="mt-4" label="Reasoning" required value={bici.reasoning ?? ''} error={err('reasoning')} onChange={(e) => setBici({ ...bici, reasoning: e.target.value })} placeholder="Why you recommend or not — e.g. stable payments, 8 years in trucking" hint="“Do not recommend” rejects the accreditation; the client stays in Draft." />
          </> : (
            <KeyValueGrid cols={2} items={[...BICI_FIELDS, { k: 'result', l: 'BICI result' }, { k: 'reasoning', l: 'Reasoning' }].map((f) => ({
              label: f.l, value: String(bici[f.k] ?? '').trim() ? (f.k === 'recommendedLimit' ? formatPhp(Number(bici[f.k])) : bici[f.k]) : <span className="text-muted">Not provided</span>,
            }))} />
          )}
        </FormSection>
        {isVp && act && (
          <FormSection title="Activation on approval" description="Set here, applied when you approve. Recommended limit becomes the client credit limit unless changed.">
            <FormGrid>
              <MoneyInput label="Credit limit" required value={act.creditLimit} onChange={(e) => setAct({ ...act, creditLimit: Number(e.target.value) })} />
              <Input label="Approved credit term (days)" type="number" min={0} value={termDays} onChange={(e) => setTermDays(e.target.value)} hint="Defaults to the recommended term" />
              <Input label="Sign-off date" type="date" required value={signOff} error={!signOff ? 'Required' : undefined} onChange={(e) => setSignOff(e.target.value)} />
            </FormGrid>
            <div className="mt-4"><EligibilitySwitches flags={act} onChange={(x) => setAct({ ...act, ...x })} branchOptions={branchOptions} /></div>
          </FormSection>
        )}
        {(isFin || isVp) && <Textarea label="Comments" required hint={isVp ? 'Required for approve and reject; recorded with your sign-off.' : 'Required for endorse and reject.'} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comments for the approval record" />}
        {decide.error && <Banner tone="danger">{errMessage(decide.error)}</Banner>}
        <FormSection title="Supporting documents" description="SEC / DTI certificate, financial statements, site-visit photos, references.">
          {(a.documents ?? []).length ? (
            <ul className={cn('divide-y divide-line rounded-lg border border-line text-[13px]', canAttach && 'mb-3')}>{a.documents!.map((d) => <li key={d.id} className="flex items-center justify-between px-3 py-2"><span className="flex items-center gap-2"><Paperclip className="size-3.5 text-muted" />{d.fileName}<Badge tone="neutral" dot={false}>{d.kind}</Badge></span><span className="text-xs text-muted">{userName(d.by)} · {formatDateTime(d.at)}</span></li>)}</ul>
          ) : <p className={cn('text-[13px] text-muted', canAttach && 'mb-3')}>No documents attached.</p>}
          {/* Review 1.2: which of the expected documents are still missing. */}
          {(() => { const have = new Set((a.documents ?? []).map((d) => d.kind)); const miss = DOC_KINDS.filter((k) => k !== 'Other' && !have.has(k)); return miss.length > 0 && a.status !== 'Approved' ? <p className={cn('text-xs text-warning', canAttach && 'mb-3')}>Still to attach: {miss.join(', ')}.</p> : null; })()}
          {canAttach && (
            <div className="flex flex-wrap items-end gap-2">
              <Select label="Document" value={doc.kind} onChange={(e) => setDoc({ ...doc, kind: e.target.value })} options={DOC_KINDS.map((k) => ({ value: k, label: k }))} />
              <FilePick label="File" className="min-w-[220px] flex-1" fileName={doc.fileName} onPick={(n) => setDoc({ ...doc, fileName: n })} />
              <Button variant="secondary" disabled={!doc.fileName} loading={addDoc.isPending} onClick={() => addDoc.mutate(undefined)}>Attach</Button>
            </div>
          )}
        </FormSection>
        {/* Review 1.2: notes between approvers, kept in the audit trail. */}
        {wf?.status === 'Pending' && can('clients.accreditation') && (
          <div className="flex items-end gap-2">
            <Input label="Note to the other approvers" wrapperClassName="flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called BPI Pasig — certificate confirmed by phone" />
            <Button variant="secondary" disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate(undefined)}>Add note</Button>
          </div>
        )}
        <FormSection title="Audit trail" description={`Every submission, form save, attachment, note and decision — who and when.${earlier.length ? ' Earlier attempts are listed below this one.' : ''}`}>
          {(() => {
            const rowsOf = (x: AccRow) => [...(x.log ?? []), ...(x.escalated && x.dueAt ? [{ at: x.dueAt, by: 'system', action: `Escalated — reminder sent to ${x.currentApprovers.map(userName).join(', ') || 'the approvers'}` }] : [])].sort((p, q) => q.at.localeCompare(p.at));
            const list = (x: AccRow) => <ul className="space-y-1 text-[13px]">{rowsOf(x).map((l, i) => <li key={i}><span className="text-muted">{formatDateTime(l.at)}</span> · <span className="font-medium">{l.by === 'system' ? 'System' : userName(l.by)}</span> — {l.action}</li>)}</ul>;
            return <>
              {rowsOf(a).length ? list(a) : <p className="text-[13px] text-muted">No entries.</p>}
              {earlier.map((x) => <div key={x.id} className="mt-3 border-t border-line pt-2"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Attempt {x.attempt} — {x.status}{x.rejection ? ` at ${x.rejection.step}` : ''}</p>{list(x)}</div>)}
            </>;
          })()}
        </FormSection>
      </Stack>
    </Drawer>
  );
}

// ── SCR-11 Sales Performance Dashboard ─────────────────────────────────────
const ACTIVITY_TYPES: SalesActivity['type'][] = ['Visit', 'Call', 'Email', 'Meeting', 'Tracker update'];
const OUTCOMES = ['Interested', 'Follow-up needed', 'Quote sent', 'Not interested', 'Accredited'];
const TEAM = '__team';
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleString('en-PH', { month: 'long', year: 'numeric' });

function Progress({ value, target, pct }: { value: number | null; target: number; pct?: boolean }) {
  if (value == null) return <span className="text-muted">—</span>;
  const ratio = target ? Math.min(1, value / target) : 0;
  const tone = ratio >= 1 ? 'bg-success' : ratio >= 0.6 ? 'bg-warning' : 'bg-danger';
  return (
    <div className="min-w-[110px]">
      <p className="text-[13px] tabular"><span className="font-semibold">{value}{pct ? '%' : ''}</span><span className="text-muted"> / {target}{pct ? '%' : ''}</span><span className="ml-1 text-xs text-muted">({target ? Math.round((value / target) * 100) : 0}%)</span></p>
      <div className="mt-1 h-1.5 w-full rounded-full bg-surface-alt"><div className={cn('h-1.5 rounded-full', tone)} style={{ width: `${ratio * 100}%` }} /></div>
    </div>
  );
}

export function SalesPerformancePage() {
  const { ref, setting, userName, clientName } = useRefLookups();
  const { user } = useAuth();
  const nav = useNavigate();
  const [ae, setAe] = useState('');
  const [region, setRegion] = useState('');
  const [month, setMonth] = useState(todayManila().slice(0, 7));
  const data = useData(['sales', ae, region, month], () => api.clients.salesKpis({ ae, region, month }));
  const [log, setLog] = useState(false);
  const d = data.data;
  const regions = [...new Set((ref?.branches ?? []).map((b) => b.region))];
  const T = { acc: Number(setting('sal.target_new_accreditations') ?? 2), calls: Number(setting('sal.target_combined_calls') ?? 40), weekly: Number(setting('sal.target_weekly_visits') ?? 3), tracker: Number(setting('sal.target_tracker_compliance_pct') ?? 90) };
  const ml = monthLabel(month);
  // Review 1.2: team total row (sum of the AEs; targets × number of AEs) and each AE's region.
  type AeRow = NonNullable<typeof d>['byAe'][number];
  const aeCount = d?.byAe.length ?? 0;
  const mult = (r: AeRow) => (r.aeUserId === TEAM ? Math.max(1, aeCount) : 1);
  const sum = (k: 'clients' | 'activities' | 'newClients' | 'accreditations' | 'visits' | 'calls' | 'combinedCalls' | 'renewalsDue' | 'pullOuts' | 'returns') => (d?.byAe ?? []).reduce((s, r) => s + r[k], 0);
  const logged = (d?.byAe ?? []).filter((r) => r.trackerCompliancePct != null);
  const byAeRows: AeRow[] | undefined = d && (d.byAe.length > 1 ? [...d.byAe, {
    aeUserId: TEAM, ae: 'Team total', clients: sum('clients'), activities: sum('activities'), newClients: sum('newClients'), accreditations: sum('accreditations'), visits: sum('visits'), calls: sum('calls'), combinedCalls: sum('combinedCalls'),
    trackerCompliancePct: logged.length ? Math.round(logged.reduce((s, r) => s + (r.trackerCompliancePct ?? 0) * r.activities, 0) / Math.max(1, logged.reduce((s, r) => s + r.activities, 0))) : null,
    weeklyVisits: d.weeks.map((_, i) => d.byAe.reduce((s, r) => s + (r.weeklyVisits[i] ?? 0), 0)), renewalsDue: sum('renewalsDue'), pullOuts: sum('pullOuts'), returns: sum('returns'),
  }] : d.byAe);
  const aeRegion = (id: string) => { const u = ref?.users.find((x) => x.userId === id); return (ref?.branches ?? []).find((b) => b.code === u?.branchCode)?.region ?? u?.branchCode ?? '—'; };
  const [actSel, setActSel] = useState<SalesActivity | null>(null);
  // Week i of the month runs from day 7i+1 for 7 days (capped at month end). A week that has not ended is not a miss yet — shown muted.
  const weekStarted = (i: number) => { const [y, m] = month.split('-').map(Number); return new Date(y, m - 1, 7 * i + 1).getTime() <= Date.now(); };
  const weekOpen = (i: number) => { const [y, m] = month.split('-').map(Number); return Math.min(new Date(y, m - 1, 7 * i + 8).getTime(), new Date(y, m, 1).getTime()) > Date.now(); };
  return (
    <>
      <PageHeader title="Sales performance" description="Sales KPIs and per-AE monthly performance against targets. Visits and calls come from the sales activity log."
        actions={<>
          <Select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} options={Array.from({ length: 24 }, (_, i) => { const t = new Date(); t.setDate(1); t.setMonth(t.getMonth() - i); const v = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; return { value: v, label: monthLabel(v) }; })} />
          <Select aria-label="AE" value={ae} onChange={(e) => setAe(e.target.value)} placeholder="All AEs" options={(ref?.users ?? []).filter((u) => u.roles.includes('ACCOUNT_EXECUTIVE')).map((u) => ({ value: u.userId, label: u.name }))} />
          <Select aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="All regions" options={regions.map((r) => ({ value: r, label: r }))} />
          <Button icon={<Plus className="size-4" />} onClick={() => setLog(true)}>Log activity</Button>
        </>} />
      <p className="mb-3 text-[13px] text-muted">Period: <span className="font-medium text-ink">{ml}</span> unless a tile says otherwise. Click a tile to open the underlying list.</p>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {/* Review 1.2: "New clients" = registered in the month (any source, any status); the names show in the hint. */}
        <KpiTile label="New clients" value={d?.newClients ?? '—'} hint={d ? (d.newClientList.length ? `Registered: ${d.newClientList.map((x) => x.clientName).join(', ')}` : 'Registered this month') : undefined} onClick={() => nav('/clients')} />
        <KpiTile label="Accredited" value={d?.accredited ?? '—'} hint={d ? `This month · ${d.accreditationsInProgress} in progress in the queue` : undefined} onClick={() => nav('/clients/accreditation')} />
        <KpiTile label="Client visits" value={d?.visits ?? '—'} hint="Visits + meetings" onClick={() => document.getElementById('activity-log')?.scrollIntoView({ behavior: 'smooth' })} />
        <KpiTile label="Calls & emails" value={d?.calls ?? '—'} hint="Not incl. visits" onClick={() => document.getElementById('activity-log')?.scrollIntoView({ behavior: 'smooth' })} />
        <KpiTile label={`Renewals · ${d?.renewalHorizonDays ?? 90}d`} value={d?.renewalsDue ?? '—'} tone="warning" hint="Due, active only" onClick={() => nav('/contracts?filter=expiring')} />
        <KpiTile label="Overdue renewals" value={d?.renewalsOverdue ?? '—'} tone={d?.renewalsOverdue ? 'danger' : 'default'} hint="Expired, not renewed" onClick={() => nav('/contracts?status=Expired')} />
        <KpiTile label="Pull-outs" value={d?.pullOuts ?? '—'} hint="Gate-out passes" />
        <KpiTile label="Returns" value={d?.returns ?? '—'} hint="Gate-in passes" />
      </div>
      <Card className="mb-5" padded={false}>
        <div className="p-5 pb-0"><CardHeader title={`By Account Executive — ${ml}`} description={<>Actual vs monthly target. Targets are configured in <Link to="/admin/settings" className="text-brand-700 hover:underline">Settings → Sales targets</Link>. <Badge tone="warning" dot={false}>Proposed targets — pending sign-off</Badge></>} /></div>
        <DataTable data={byAeRows} loading={data.isLoading} searchable={false} emptyTitle="No AEs in scope" rowClassName={(r) => (r.aeUserId === TEAM ? 'bg-surface-alt font-semibold' : undefined)} columns={[
          { accessorKey: 'ae', header: 'AE', cell: (c) => <div><p className="font-medium">{c.getValue<string>()}</p><p className="text-xs text-muted" title="Activities = visits + calls + other types (e.g. tracker updates)">{c.row.original.aeUserId !== TEAM && `${aeRegion(c.row.original.aeUserId)} · `}{c.row.original.clients} clients · {c.row.original.activities} activities{c.row.original.activities > c.row.original.combinedCalls ? ` (${c.row.original.activities - c.row.original.combinedCalls} other)` : ''}</p></div> },
          { accessorKey: 'newClients', header: 'New clients', meta: { align: 'right' }, cell: (c) => <span title="Registered in the month (no target set)">{c.getValue<number>()}</span> },
          { accessorKey: 'accreditations', header: 'Accreditations', cell: (c) => <Progress value={c.getValue<number>()} target={T.acc * mult(c.row.original)} /> },
          // Visits and calls sit under the combined-calls bar (they add up to it).
          { accessorKey: 'combinedCalls', header: 'Combined calls (visits + calls)', cell: (c) => <div><Progress value={c.getValue<number>()} target={T.calls * mult(c.row.original)} /><p className="mt-0.5 text-xs text-muted">{c.row.original.visits} visits · {c.row.original.calls} calls</p></div> },
          { accessorKey: 'trackerCompliancePct', header: 'Tracker compliance', cell: (c) => <span title="Tracker-update compliance"><Progress value={c.getValue<number | null>()} target={T.tracker} pct /></span> },
          { id: 'wk', header: 'Weekly visits (avg)', cell: (c) => { const w = c.row.original.weeklyVisits.filter((_, i) => weekStarted(i)); return <Progress value={w.length ? Math.round((w.reduce((a, b) => a + b, 0) / w.length) * 10) / 10 : 0} target={T.weekly * mult(c.row.original)} />; } },
          { accessorKey: 'renewalsDue', header: 'Renewals due', meta: { align: 'right' } },
          { id: 'po', header: 'Out · in', meta: { align: 'right' }, cell: (c) => <span title="Chassis pull-outs · returns">{c.row.original.pullOuts} · {c.row.original.returns}</span> },
        ]} />
        <p className="px-5 py-3 text-xs text-muted">Tracker-update compliance = share of the AE’s activities logged within {String(setting('sal.tracker_logging_days') ?? 1)} day(s) of the activity date (proposed definition). Combined calls = visits + meetings + calls + emails, against the monthly target; the “Calls &amp; emails” tile counts calls and emails only. The team row adds the AEs up (targets × number of AEs). New clients and renewals have no target in Settings yet (pending decision).</p>
      </Card>
      <div className="mb-5 grid items-start gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Chassis pull-outs vs returns" description={`Six months to ${ml} — same gate-pass data as the tiles${d?.byMonth.length && d.byMonth.every((m) => !m.returns) ? ' · no returns in this period' : ''}`} />
          {/* Animation off: a resize while bars animate (e.g. print / full-page capture) left them stuck at the pre-resize geometry. */}
          <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={d?.byMonth ?? []} barCategoryGap="25%" barGap={4} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}><CartesianGrid stroke="#EEF2F6" vertical={false} /><XAxis dataKey="month" type="category" interval={0} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: '#F1F5F9' }} /><Legend /><Bar dataKey="pullOuts" name="Pull-outs" fill="#0058A8" maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar dataKey="returns" name="Returns" fill="#0E9384" maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
        </Card>
        <Card>
          <CardHeader title={`Weekly client visits — ${ml}`} description={`Target ${T.weekly} per AE per week`} />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted"><th className="py-1.5 pr-2">AE</th>{d?.weeks.map((w) => <th key={w} title={w} className="whitespace-nowrap px-1 py-1.5 text-right">{w.replace(/ \(.*\)/, '')}</th>)}</tr></thead>
              <tbody>{d?.byAe.map((r) => <tr key={r.aeUserId} className="border-t border-line"><td className="py-1.5 pr-2">{r.ae}</td>{r.weeklyVisits.map((v, i) => <td key={i} title={weekOpen(i) && v < T.weekly ? 'Week not over yet' : undefined} className={cn('px-1 py-1.5 text-right tabular', v >= T.weekly ? 'font-semibold text-success' : weekOpen(i) ? 'text-muted' : 'text-danger')}>{v}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="mt-2 flex flex-wrap gap-x-2 text-xs text-muted">{d?.weeks.map((w, i) => <span key={w} className="whitespace-nowrap">{w}{weekOpen(i) ? ' · in progress' : ''}</span>)}</p>
          <p className="mt-1 text-xs text-muted">Weeks still in progress are shown muted and are not counted as a miss. The AE row average uses weeks that have started.</p>
        </Card>
      </div>
      {!!d?.renewalList.length && (
        <Card className="mb-5" padded={false}>
          <div className="p-5 pb-0"><CardHeader title="Renewals" description="Upcoming expiries and overdue (expired, not renewed) — counted separately" /></div>
          <DataTable data={d.renewalList} searchable={false} columns={[
            { accessorKey: 'contractNo', header: 'Contract', cell: (c) => <Link to={`/contracts/${c.getValue()}`} className="font-mono text-brand-600 hover:underline">{c.getValue<string>()}</Link> },
            { accessorKey: 'clientName', header: 'Client' },
            { accessorKey: 'expiryDate', header: 'Expiry', cell: (c) => formatDate(c.getValue<string>()) },
            { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge domain="contract" value={c.getValue() === 'Expired' ? 'Expired' : 'Expiring'} /> },
          ]} />
        </Card>
      )}
      <h2 className="mb-1 text-base font-semibold text-ink">Sales activities — {ml}</h2>
      {/* Review 1.2: pipeline measures from the log (proposed — pending confirmation of the measures). */}
      {d && <p className="mb-3 text-[13px] text-ink-2">Pipeline (proposed): <span className="font-semibold">{d.pipeline.quotes}</span> quotation{d.pipeline.quotes === 1 ? '' : 's'} sent · <span className="font-semibold">{d.pipeline.prospects}</span> prospect{d.pipeline.prospects === 1 ? '' : 's'} contacted · <span className="font-semibold">{d.pipeline.expectedUnits}</span> expected units{d.pipeline.estimatedValue ? <> · est. <span className="font-semibold">{formatPhp(d.pipeline.estimatedValue)}</span> / month</> : null}. Click a row for the full activity.</p>}
      <div id="activity-log">
        <DataTable data={d?.activities} loading={data.isLoading} exportName={`sales-activities-${month}`} emptyTitle={`No activities logged in ${ml}`} searchPlaceholder="Search activities…" onRowClick={(r) => setActSel(r)} columns={[
          { id: 'at', header: 'Date / time', cell: (c) => formatDateTime(c.row.original.at ?? c.row.original.date) },
          { accessorKey: 'type', header: 'Type' },
          { id: 'who', header: 'Client / prospect', cell: (c) => (c.row.original.clientCode ? <Link to={`/clients/${c.row.original.clientCode}`} className="text-brand-600 hover:underline">{clientName(c.row.original.clientCode)}</Link> : <span>{c.row.original.prospectCompany ?? '—'}{c.row.original.prospectContact ? ` · ${c.row.original.prospectContact}` : ''} <Badge tone="info" dot={false}>Prospect</Badge></span>) },
          { accessorKey: 'businessType', header: 'Business type' }, { accessorKey: 'location', header: 'Location' },
          { id: 'region', header: 'Region', meta: { nowrap: true }, cell: (c) => { const b = c.row.original.branchCode ?? ref?.clients.find((x) => x.clientCode === c.row.original.clientCode)?.branchCode; return b ? <span title={b}>{(ref?.branches ?? []).find((x) => x.code === b)?.region ?? b}</span> : '—'; } },
          { accessorKey: 'outcome', header: 'Outcome' }, { accessorKey: 'nextActionDate', header: 'Next action', cell: (c) => <div>{c.getValue() ? formatDate(c.getValue<string>()) : '—'}{c.row.original.nextAction && <p className="max-w-[180px] whitespace-normal text-xs text-muted">{c.row.original.nextAction}</p>}</div> },
          { accessorKey: 'aeUserId', header: 'AE', cell: (c) => userName(c.getValue<string>()) },
          { accessorKey: 'loggedAt', header: 'Logged', cell: (c) => (c.getValue() ? <div><p>{formatDateTime(c.getValue<string>())}</p>{c.row.original.loggedBy && <p className="text-xs text-muted">by {userName(c.row.original.loggedBy)}</p>}</div> : '—') },
        ]} />
      </div>
      {actSel && (
        <Drawer open onClose={() => setActSel(null)} title={`${actSel.type} — ${actSel.clientCode ? clientName(actSel.clientCode) : actSel.prospectCompany ?? 'Prospect'}`} width="max-w-xl" footer={<Button variant="secondary" onClick={() => setActSel(null)}>Close</Button>}>
          <KeyValueGrid cols={2} items={[
            { label: 'Date / time', value: formatDateTime(actSel.at ?? actSel.date) }, { label: 'AE', value: userName(actSel.aeUserId) },
            { label: 'Client / prospect', value: actSel.clientCode ? `${actSel.clientCode} — ${clientName(actSel.clientCode)}` : `${actSel.prospectCompany ?? '—'} (prospect)` }, { label: 'Prospect contact', value: [actSel.prospectContact, actSel.prospectEmail].filter(Boolean).join(' · ') || undefined },
            { label: 'Business type', value: actSel.businessType }, { label: 'Location', value: actSel.location }, { label: 'Branch', value: actSel.branchCode }, { label: 'Lead source', value: actSel.leadSource },
            { label: 'Outcome', value: actSel.outcome }, { label: 'Outcome details', value: actSel.outcomeDetails }, { label: 'Expected units', value: actSel.expectedUnits }, { label: 'Estimated value', value: actSel.estimatedValue ? formatPhp(actSel.estimatedValue) : undefined },
            { label: 'Next action', value: [actSel.nextAction, actSel.nextActionDate ? formatDate(actSel.nextActionDate) : undefined].filter(Boolean).join(' · ') || undefined }, { label: 'Follow-up owner', value: actSel.followUpOwner ? userName(actSel.followUpOwner) : undefined },
            { label: 'Attachment', value: actSel.attachment }, { label: 'Logged', value: actSel.loggedAt ? `${formatDateTime(actSel.loggedAt)}${actSel.loggedBy ? ` · ${userName(actSel.loggedBy)}` : ''}` : undefined },
          ]} />
          <p className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide text-muted">Notes</p>
          <p className="rounded-lg bg-surface-alt p-3 text-sm text-ink-2">{actSel.notes || 'No notes.'}</p>
        </Drawer>
      )}
      {log && <LogActivityModal onClose={() => setLog(false)} isDirector={!!user?.roles.includes('SALES_DIRECTOR')} />}
    </>
  );
}

function LogActivityModal({ onClose, isDirector }: { onClose: () => void; isDirector: boolean }) {
  const { ref } = useRefLookups();
  const { user } = useAuth();
  // Review 1.1: date/time default and checks use Philippine time (not the browser's zone); the value is read back as +08:00.
  const nowLocal = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(' ', 'T');
  const toInstant = (v: string) => new Date(`${v}:00+08:00`);
  // An AE logs for themself; a Sales Director, manager or administrator (not an AE) chooses the AE the activity counts for.
  const selfIsAe = !!user?.roles.includes('ACCOUNT_EXECUTIVE');
  const canPick = isDirector || !selfIsAe;
  const aeOptions = (ref?.users ?? []).filter((u) => u.roles.includes('ACCOUNT_EXECUTIVE') || (isDirector && u.userId === user?.userId)).map((u) => ({ value: u.userId, label: u.name }));
  const [a, setA] = useState({ type: 'Visit' as SalesActivity['type'], aeUserId: selfIsAe || isDirector ? user?.userId ?? '' : '', clientCode: '', prospectCompany: '', prospectContact: '', businessType: '', location: '', at: nowLocal(), outcome: '', outcomeDetails: '', nextActionDate: '', notes: '',
    prospectEmail: '', leadSource: '', expectedUnits: '', estimatedValue: 0, nextAction: '', followUpOwner: '', branchCode: user?.branchCode && user.branchCode !== 'HO' ? user.branchCode : '', attachment: '' });
  const [tried, setTried] = useState(false);
  const { branchOptions } = useRefLookups();
  const save = useAction(() => api.clients.logActivity({ ...a, at: toInstant(a.at).toISOString(), clientCode: a.clientCode || undefined, prospectCompany: a.clientCode ? undefined : a.prospectCompany, prospectContact: a.clientCode ? undefined : a.prospectContact, nextActionDate: a.nextActionDate || undefined, aeUserId: a.aeUserId,
    // Review 1.2: pipeline, follow-up and branch details (optional).
    prospectEmail: a.clientCode ? undefined : a.prospectEmail || undefined, leadSource: a.leadSource || undefined, expectedUnits: Number(a.expectedUnits) || undefined, estimatedValue: a.estimatedValue || undefined,
    nextAction: a.nextAction || undefined, followUpOwner: a.followUpOwner || a.aeUserId || undefined, branchCode: a.branchCode || undefined, attachment: a.attachment || undefined }), { success: 'Activity logged', onSuccess: onClose });
  const future = !!a.at && toInstant(a.at) > new Date();
  const missing = { aeUserId: !a.aeUserId, businessType: !a.businessType.trim(), location: !a.location.trim(), at: !a.at, outcome: !a.outcome, prospectCompany: !a.clientCode && !a.prospectCompany.trim() };
  const err = (k: keyof typeof missing) => (tried && missing[k] ? 'Required' : fieldError(save.error, k));
  const set = (k: keyof typeof a) => (e: { target: { value: string } }) => setA({ ...a, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Log sales activity" description="Feeds the sales dashboard and the client timeline." size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => { setTried(true); if (!Object.values(missing).some(Boolean) && !future) save.mutate(undefined); }}>Save</Button></>}>
      <Stack>
        {tried && (Object.values(missing).some(Boolean) || future) && <Banner tone="danger">Complete the required fields{future ? ' — the activity date cannot be in the future' : ''}.</Banner>}
        <FormGrid>
          <Select label="Type" required value={a.type} onChange={set('type')} options={ACTIVITY_TYPES.map((t) => ({ value: t, label: t === 'Visit' ? 'Client visit' : t === 'Call' ? 'Sales call' : t }))} hint="Activity types are pending confirmation" />
          <Input label="Activity date & time" required type="datetime-local" value={a.at} max={nowLocal()} hint="Philippine time (UTC+8). Logged time is recorded automatically." error={err('at') ?? (future ? 'Cannot be in the future' : undefined)} onChange={set('at')} />
          <Select label="Existing client" value={a.clientCode} onChange={(e) => { const cl = (ref?.clients ?? []).find((x) => x.clientCode === e.target.value); setA({ ...a, clientCode: e.target.value, branchCode: cl?.branchCode ?? a.branchCode }); }} placeholder="None — prospect (not yet a client)" hint={a.clientCode ? undefined : 'Prospect — enter the company below'} options={(ref?.clients ?? []).map((c) => ({ value: c.clientCode, label: `${c.clientCode} — ${c.clientName}` }))} />
          <Select label="Account Executive" required value={a.aeUserId} disabled={!canPick} error={err('aeUserId')} placeholder={canPick ? 'Select the AE' : undefined} onChange={set('aeUserId')} options={aeOptions} hint={!selfIsAe && !isDirector ? 'You are not an Account Executive — select the AE this activity counts for' : isDirector ? 'Sales Director may log for an AE' : 'Defaults to you'} />
          {!a.clientCode && <>
            <Input label="Prospect company" required value={a.prospectCompany} error={err('prospectCompany')} onChange={set('prospectCompany')} placeholder="e.g. ABC Logistics Inc." />
            <Input label="Prospect contact (name / phone)" value={a.prospectContact} onChange={set('prospectContact')} placeholder="e.g. Juan Dela Cruz, 0917 123 4567" />
            <Input label="Prospect contact email" type="email" value={a.prospectEmail} onChange={set('prospectEmail')} placeholder="e.g. juan@company.ph" />
            <Select label="Lead source" value={a.leadSource} onChange={set('leadSource')} placeholder="Select" options={LEAD_SOURCES.map((x) => ({ value: x, label: x }))} />
          </>}
          {/* Review 1.2: fixed business-type list (same as the client register) so the dashboard can group by it; list pending confirmation. */}
          <Select label="Business type" required value={a.businessType} error={err('businessType')} onChange={set('businessType')} placeholder="Select" options={INDUSTRIES.map((x) => ({ value: x, label: x }))} />
          <Input label="Location" required value={a.location} error={err('location')} onChange={set('location')} placeholder="Address or area" />
          <Select label="Branch" value={a.branchCode} onChange={set('branchCode')} placeholder="Select" options={branchOptions} hint="Defaults to the client's branch (or yours)" />
          <Select label="Outcome" required value={a.outcome} error={err('outcome')} onChange={set('outcome')} placeholder="Select" options={OUTCOMES.map((o) => ({ value: o, label: o }))} hint="Outcome list pending confirmation" />
          <Input label="Expected units" type="number" min={0} value={a.expectedUnits} onChange={set('expectedUnits')} placeholder="e.g. 10" hint="Pipeline (optional)" />
          <MoneyInput label="Estimated monthly value" value={a.estimatedValue || ''} onChange={(e) => setA({ ...a, estimatedValue: Number(e.target.value) || 0 })} placeholder="e.g. 250000" hint="Pipeline (optional)" />
          <Input label="Next action" value={a.nextAction} onChange={set('nextAction')} placeholder="e.g. Send quotation for 10 chassis" />
          <Input label="Next action date" type="date" value={a.nextActionDate} onChange={set('nextActionDate')} hint="Follow-up reminder" />
          <Select label="Follow-up owner" value={a.followUpOwner || a.aeUserId} onChange={set('followUpOwner')} placeholder="Select" options={(ref?.users ?? []).filter((u) => u.roles.includes('ACCOUNT_EXECUTIVE') || u.roles.includes('SALES_DIRECTOR')).map((u) => ({ value: u.userId, label: u.name }))} hint="Defaults to the AE" />
          <FilePick label="Attachment (e.g. visit photo)" accept=".pdf,image/*" fileName={a.attachment} onPick={(n) => setA({ ...a, attachment: n })} hint="Optional" />
        </FormGrid>
        <Input label="Outcome details" value={a.outcomeDetails} onChange={set('outcomeDetails')} placeholder="e.g. Asked for a quotation on 10 chassis" />
        <Textarea label="Notes" value={a.notes} onChange={set('notes')} placeholder="Anything else worth remembering about this activity" />
        <p className="text-xs text-muted">Turning a prospect into a client is done with Clients → Register client (linking it from here is pending confirmation).</p>
        {save.error && <Banner tone="danger">{errMessage(save.error)}</Banner>}
      </Stack>
    </Modal>
  );
}
