import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { CheckCircle2, FilePen, FilePlus2, History, Paperclip, Printer, RefreshCw, Send, Stamp, Upload, UserPlus, XCircle } from 'lucide-react';
import { api } from '../../lib/api-client';
import {
  CONTRACT_LIFECYCLE, CONTRACT_TYPES, daysToExpiry, formatDate, formatDateTime, formatPhp, lifecycleIndex, rateVariancePct, round2, todayManila, validateContractDuration,
  type ContractRate, type ContractStatus, type ContractType,
} from '../../lib/shared';
import {
  ApprovalTimeline, Badge, Banner, Button, Card, CardHeader, Checkbox, DataTable, Drawer, Field, FormGrid, FormSection, Input, KeyValueGrid, Modal, MoneyText, PageHeader, ReadField, Select, Stack, StatusBadge, Textarea, cn, type ColumnDef,
} from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, fieldError, useAction, useData, useRefLookups } from '../../shared/hooks';
import { CreditGateBanner, Crumb } from '../../shared/components';
import { DocFooter, DocHeader, PrintPreview } from '../../shared/print';
import { AddContactModal, ClientStatusChip, FilePick } from './pages';

const STATUS_FILTER: ContractStatus[] = ['Draft', 'Sent to Client', 'Signed', 'For Notarisation', 'Notarized', 'Active', 'Expired', 'Renewed', 'Terminated'];
/** Display wording for lifecycle states (stored codes unchanged): sentence case, US spelling. */
const stateLabel = (s: string) => ({ 'Sent to Client': 'Sent to client', 'For Notarisation': 'For notarization' } as Record<string, string>)[s] ?? s;

/** Amount box with an adjacent ₱ (or a suffix such as %), thousands separators when not editing. Empty → 0. */
function AmountBox({ value, onChange, suffix, invalid, disabled, className, id, describedBy, ariaLabel }: { value: number; onChange: (v: number) => void; suffix?: string; invalid?: boolean; disabled?: boolean; className?: string; id?: string; describedBy?: string; ariaLabel?: string }) {
  const [raw, setRaw] = useState<string | null>(null);
  const n = Number.isFinite(value) ? value : 0;
  const shown = raw ?? (suffix ? String(n) : n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  return (
    <div className={cn('relative', className)}>
      {!suffix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">₱</span>}
      <input id={id} aria-describedby={describedBy} aria-label={ariaLabel} aria-invalid={invalid} inputMode="decimal" disabled={disabled} value={shown} placeholder={suffix ? '0' : '0.00'}
        onFocus={() => setRaw(n ? String(n) : '')} onBlur={() => setRaw(null)}
        onChange={(e) => { const s = e.target.value.replace(/[^0-9.]/g, ''); setRaw(s); onChange(Number(s) || 0); }}
        className={cn('h-9 w-full rounded-lg border bg-surface text-right text-sm tabular text-ink transition-colors focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-100 disabled:bg-surface-alt disabled:text-muted',
          suffix ? 'pl-3 pr-8' : 'pl-7 pr-3', invalid ? 'border-danger' : 'border-line-strong')} />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">{suffix}</span>}
    </div>
  );
}
function AmountField({ label, required, error, hint, wrapperClassName, ...box }: { label: string; required?: boolean; error?: string; hint?: string; wrapperClassName?: string } & Omit<Parameters<typeof AmountBox>[0], 'id' | 'describedBy' | 'invalid'>) {
  return <Field label={label} required={required} error={error} hint={hint} className={wrapperClassName}>{(id, d) => <AmountBox {...box} id={id} describedBy={d} invalid={!!error} />}</Field>;
}
const typeLabel = (c: { contractType: ContractType; class: string; customType?: { name: string } }) => `${c.customType ? `Custom “${c.customType.name}” · ` : ''}${c.contractType} · Class ${c.class}`;

// ── SCR-08 Contracts list ──────────────────────────────────────────────────
export function ContractListPage() {
  const [sp] = useSearchParams();
  const data = useData(['contracts'], () => api.contracts.list());
  const nav = useNavigate();
  const { can } = useAuth();
  const { branchName, userName, setting } = useRefLookups();
  const horizon = Number(setting('clt.renewal_amber_days') ?? 90);
  const [f, setF] = useState({ status: sp.get('status') ?? '', type: '', expiring: sp.get('filter') === 'expiring' });
  type Row = NonNullable<typeof data.data>[number];
  const rows = (data.data ?? []).filter((c) => { const dte = daysToExpiry(c.expiryDate); return (!f.status || c.status === f.status) && (!f.type || c.contractType === f.type) && (!f.expiring || (c.status === 'Active' && dte != null && dte >= 0 && dte <= horizon)); });
  const cols: ColumnDef<Row>[] = [
    { accessorKey: 'contractNo', header: 'Contract', meta: { nowrap: true }, cell: (c) => <div className="whitespace-nowrap"><span className="font-mono font-medium">{c.getValue<string>()}</span> <span className="text-xs text-muted">v{c.row.original.version}</span>{c.row.original.renewalOf && <p className="text-xs text-muted">renews {c.row.original.renewalOf}</p>}</div> },
    { accessorKey: 'clientName', header: 'Client', cell: (c) => <div><p>{c.getValue<string>()}</p>{c.row.original.clientStatus && c.row.original.clientStatus !== 'Active' && <ClientStatusChip status={c.row.original.clientStatus} />}</div> },
    { accessorKey: 'contractType', header: 'Type', meta: { nowrap: true }, cell: (c) => typeLabel(c.row.original) },
    { accessorKey: 'branchCode', header: 'Branch', meta: { nowrap: true }, cell: (c) => <span title={branchName(c.getValue<string>())}>{c.getValue<string>()}</span> },
    { accessorKey: 'aeUserId', header: 'AE', meta: { nowrap: true }, cell: (c) => userName(c.getValue<string>()) },
    { accessorKey: 'billingCycle', header: 'Billing' },
    { accessorKey: 'effectiveDate', header: 'Effective', meta: { nowrap: true }, cell: (c) => formatDate(c.getValue<string>()) },
    { accessorKey: 'expiryDate', header: 'Expiry', meta: { nowrap: true }, cell: (c) => { const v = c.getValue<string>(); if (!v) return 'Open-ended'; const days = daysToExpiry(v)!; const soon = c.row.original.status === 'Active' && days >= 0 && days <= horizon; return <span className={cn(soon && 'font-medium text-warning', days < 0 && 'text-danger')}>{formatDate(v)}{soon ? ` · ${days}d` : days < 0 ? ' · past' : ''}</span>; } },
    { accessorKey: 'unitQty', header: 'Contracted units', meta: { align: 'right' } },
    { accessorKey: 'onHireUnits', header: 'On hire', meta: { align: 'right' } },
    { accessorKey: 'status', header: 'Status', cell: (c) => <div><div className="flex flex-wrap gap-1"><StatusBadge domain="contract" value={c.getValue<string>()} />{c.row.original.approval?.status === 'Pending' && <StatusBadge domain="contract" value="Pending Approval" />}{c.row.original.termination?.status === 'Pending' && <Badge tone="warning" dot={false}>Termination pending</Badge>}</div>
      {/* Review 1.1: an expired contract with units still out is flagged (handling after expiry is pending the client's decision). */}
      {['Expired', 'Terminated'].includes(c.row.original.status) && c.row.original.onHireUnits > 0 && <p className="mt-1 max-w-[200px] whitespace-normal text-xs font-medium leading-snug text-danger">{c.row.original.onHireUnits} unit{c.row.original.onHireUnits > 1 ? 's' : ''} still on hire after expiry — renew or recall</p>}
      {c.row.original.status === 'Active' && c.row.original.onHireUnits > c.row.original.unitQty && <p className="mt-1 text-xs font-medium text-warning">On hire exceeds contracted units</p>}</div> },
  ];
  return (
    <>
      <PageHeader title="Contracts" description={`Lease contracts by type, lifecycle state and expiry. Amber = expiring within ${horizon} days.`}
        actions={can('clients.contract', 'add') && <Link to="/contracts/new"><Button icon={<FilePlus2 className="size-4" />}>New contract</Button></Link>} />
      <DataTable data={rows} loading={data.isLoading} columns={cols} onRowClick={(r) => nav(`/contracts/${r.contractNo}`)} exportName="contracts"
        rowClassName={(r) => (r.clientStatus === 'Hold' ? 'bg-danger-bg/30' : undefined)}
        toolbar={<>
          <Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" options={STATUS_FILTER.map((s) => ({ value: s, label: stateLabel(s) }))} />
          <Select aria-label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="All types" options={(Object.keys(CONTRACT_TYPES) as ContractType[]).map((t) => ({ value: t, label: `${t} · Class ${CONTRACT_TYPES[t].class}` }))} />
          <Checkbox label={`Expiring within ${horizon} days`} checked={f.expiring} onChange={(e) => setF({ ...f, expiring: e.target.checked })} />
        </>} />
      <p className="mt-2 text-xs text-muted">Contracted units = units agreed on the contract; On hire = chassis currently out under it. A client On Hold keeps its contracts, but EWAs, gate release and new services are blocked by the credit gate.</p>
    </>
  );
}

// ── SCR-08 Contract Creation ────────────────────────────────────────────────
export function ContractCreatePage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { ref, eqName, setting, branchOptions } = useRefLookups();
  const { can } = useAuth();
  const [clientCode, setClientCode] = useState(sp.get('client') ?? '');
  const [type, setType] = useState<ContractType>('LTL');
  const [custom, setCustom] = useState<{ on: boolean; name: string; rateStructure: string }>({ on: false, name: '', rateStructure: 'Daily rate per equipment type' });
  const today = todayManila();
  const [v, setV] = useState({ effectiveDate: today, expiryDate: '', region: 'NCR', signatoryId: '', paymentMethod: 'Check', billingCycle: 'Weekly' as 'Weekly' | 'Monthly', creditTermDays: Number(setting('clt.default_credit_term_days') ?? 30), cashDeposit: Number(setting('clt.cash_bond_default') ?? 20000), lockInMonths: Number(setting('clt.default_lock_in_months') ?? 12) });
  // Staff review 1.2: penalty defaults come from System settings → Client & Contract (editable per contract).
  const [pen, setPen] = useState({ nonReturn: Number(setting('clt.penalty_non_return') ?? 5000), deferredCheck: Number(setting('clt.penalty_deferred_check') ?? 1000), lateInterestPct: Number(setting('clt.penalty_late_interest_pct') ?? 2), dishonoredCheck: Number(setting('clt.penalty_dishonored_check') ?? 2500) });
  const [rates, setRates] = useState<ContractRate[]>([]);
  // Review 1.2: Delbros signatory, pick-up branch, renewal option, special terms and supporting documents.
  const lessorOptions = (ref?.users ?? []).filter((x) => x.roles.some((r) => ['SALES_DIRECTOR', 'VP', 'CEO', 'PRESIDENT'].includes(r))).map((x) => ({ value: x.userId, label: `${x.name} — ${x.roles.includes('SALES_DIRECTOR') ? 'Sales Director' : x.roles.includes('VP') ? 'Vice President' : x.roles[0]}` }));
  const [extra, setExtra] = useState({ lessorSignatoryId: '', pickupBranch: '', autoRenew: false, specialTerms: '' });
  const [docs, setDocs] = useState<string[]>([]);
  const [docPick, setDocPick] = useState('');
  useEffect(() => { if (!extra.lessorSignatoryId && lessorOptions.length) setExtra((x) => ({ ...x, lessorSignatoryId: lessorOptions[0].value })); }, [lessorOptions.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [overrideReason, setOverrideReason] = useState('');
  const [tried, setTried] = useState(false);
  const [addSig, setAddSig] = useState(false);
  const tol = Number(setting('clt.rate_variance_tolerance_pct') ?? 10);
  const template = useMemo(() => api.contracts.rateTemplate(type), [type, ref?.equipmentTypes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextNo = useMemo(() => api.contracts.peekNo(type), [type]);
  useEffect(() => { setRates(template.map((t, i) => ({ ...t, qty: i === 0 ? 1 : 0 }))); setV((x) => ({ ...x, lockInMonths: type === 'LTL' ? Number(setting('clt.default_lock_in_months') ?? 12) : 0 })); }, [template, type]); // eslint-disable-line react-hooks/exhaustive-deps
  const client = useData(['client', clientCode], () => api.clients.get(clientCode), !!clientCode);
  // Review 1.1: billing cycle and region default from the client record (billing runs on the client's cycle; region = the client branch's region).
  const clientBranchRegion = (ref?.branches ?? []).find((b) => b.code === client.data?.client.branchCode)?.region;
  useEffect(() => { const cl = client.data?.client; if (cl) { setV((x) => ({ ...x, billingCycle: cl.billingCycle, region: clientBranchRegion ?? x.region })); setExtra((x) => ({ ...x, pickupBranch: cl.branchCode })); } }, [client.data?.client.clientCode, clientBranchRegion]); // eslint-disable-line react-hooks/exhaustive-deps
  const durationErr = validateContractDuration(type, v.effectiveDate, v.expiryDate || undefined);
  const variance = (r: ContractRate, i: number) => rateVariancePct(r.dailyRate, template[i]?.dailyRate);
  const overridden = rates.some((r, i) => r.dailyRate !== template[i]?.dailyRate);
  const above = rates.filter((r, i) => Math.abs(variance(r, i)) > tol);
  const needsApproval = custom.on || above.length > 0;
  const totalUnits = rates.reduce((a, r) => a + (r.qty ?? 0), 0);
  const contacts = client.data?.client.contacts ?? [];
  const sigOptions = [...contacts].sort((a, b) => Number(!!b.isSignatory) - Number(!!a.isSignatory)).map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}${c.isSignatory ? ' — signatory' : ''}` }));
  const errors: Record<string, string> = {};
  if (!clientCode) errors.client = 'Select an Active client';
  if (!v.signatoryId) errors.signatoryId = 'Signatory is required';
  if (!v.effectiveDate) errors.effectiveDate = 'Effective date is required';
  else if (v.effectiveDate < today) errors.effectiveDate = 'Effective date cannot be in the past';
  if (durationErr && (type !== 'SPL' || v.expiryDate)) errors.expiryDate = durationErr;
  if (totalUnits < 1) errors.unitQty = 'Enter the quantity for at least one equipment type';
  if (custom.on && !custom.name.trim()) errors.customName = 'Name the custom contract type';
  if ((overridden || custom.on) && !overrideReason.trim()) errors.varianceReason = 'Reason is required';
  if (!(v.cashDeposit >= 0)) errors.cashDeposit = 'Enter the cash deposit';
  const show = (k: string) => (tried ? errors[k] : undefined) ?? fieldError(create.error, k);
  const create = useAction(() => api.contracts.create({ clientCode, contractType: type, ...v, unitQty: totalUnits, lessorSignatoryId: extra.lessorSignatoryId || undefined, pickupBranch: extra.pickupBranch || undefined, autoRenew: extra.autoRenew || undefined, specialTerms: extra.specialTerms.trim() || undefined, supportingDocs: docs, expiryDate: type === 'SPL' && !v.expiryDate ? undefined : v.expiryDate, rates, penalties: pen, customType: custom.on ? { name: custom.name, rateStructure: custom.rateStructure } : undefined, varianceReason: overrideReason }),
    { success: (c) => `Contract ${c.contractNo} v1 saved as Draft`, onSuccess: (c) => nav(`/contracts/${c.contractNo}?created=1`) });
  const clientOptions = (ref?.clients ?? []).map((c) => ({ value: c.clientCode, label: `${c.clientCode} — ${c.clientName}${c.status !== 'Active' ? ` (${c.status === 'Hold' ? 'On Hold' : c.status === 'Blacklist' ? 'Blacklisted' : c.status} — not selectable)` : ''}`, disabled: c.status !== 'Active' }));
  const regions = [...new Set((ref?.branches ?? []).map((b) => b.region))];
  const save = () => { setTried(true); if (!Object.keys(errors).length) create.mutate(undefined); };
  return (
    <div className="max-w-6xl">
      <PageHeader breadcrumb={<Crumb items={[{ to: '/contracts', label: 'Contracts' }, { label: 'New' }]} />} title="Create lease contract"
        description="Select the contract type — the class is assigned automatically and only that class's rates and indemnity schedule load." />
      <Stack>
        {tried && Object.keys(errors).length > 0 && <Banner tone="danger" title="Contract not saved">Fix {Object.keys(errors).length} field{Object.keys(errors).length > 1 ? 's' : ''}: {Object.values(errors).map((m) => String(m).replace(/\.$/, '')).join(' · ')}.</Banner>}
        {create.error && <Banner tone="danger">{errMessage(create.error)}</Banner>}
        <FormSection title="Client & contract type">
          <FormGrid cols={4}>
            {/* Contract no. and version stack in the first column, beside Client / Signatory (no blank area). */}
            <div className="flex flex-col gap-4 lg:row-span-2">
              <div className="flex flex-col gap-1"><ReadField label="Contract no."><span className="font-mono">{nextNo}</span></ReadField><p className="text-xs text-muted">Auto-assigned on save</p></div>
              <div className="flex flex-col gap-1"><ReadField label="Version">v1</ReadField><p className="text-xs text-muted">Amendments create v2, v3…</p></div>
            </div>
            <Select label="Client" required wrapperClassName="lg:col-span-3" value={clientCode} error={show('client')} onChange={(e) => { setClientCode(e.target.value); setV({ ...v, signatoryId: '' }); }} placeholder="Select an Active, accredited client" options={clientOptions} hint="Only Active clients can be selected (Draft, On Hold and Blacklisted are listed but disabled)." />
            {/* Signatory sits under Client in the same column. */}
            <div className="flex items-end gap-2 lg:col-span-3 lg:col-start-2">
              <Select label="Client signatory" required wrapperClassName="min-w-0 flex-1" value={v.signatoryId} error={show('signatoryId')} onChange={(e) => setV({ ...v, signatoryId: e.target.value })} placeholder={clientCode ? 'Select authorised contact' : 'Select a client first'} options={sigOptions} />
              {clientCode && can('clients.client', 'edit') && <Button variant="secondary" icon={<UserPlus className="size-4" />} onClick={() => setAddSig(true)}>Add signatory</Button>}
            </div>
          </FormGrid>
          {clientCode && <div className="mt-3"><CreditGateBanner clientCode={clientCode} action="CONTRACT_ACTIVATE" /></div>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(CONTRACT_TYPES) as ContractType[]).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} className={cn('rounded-xl border p-4 text-left transition-colors', type === t ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-line hover:border-brand-300')}>
                <p className="flex items-center justify-between font-semibold text-ink">{t}<span className="rounded-md border border-brand-200 bg-surface px-2 py-0.5 text-xs font-bold text-brand-700">Class {CONTRACT_TYPES[t].class}</span></p>
                <p className="text-sm text-ink-2">{CONTRACT_TYPES[t].name}</p><p className="mt-1 text-xs text-muted">{CONTRACT_TYPES[t].rule}</p>
              </button>
            ))}
            <button type="button" onClick={() => setCustom({ ...custom, on: !custom.on })} className={cn('rounded-xl border border-dashed p-4 text-left transition-colors', custom.on ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-line-strong hover:border-brand-300')}>
              <p className="flex items-center justify-between font-semibold text-ink">Custom<Badge tone="warning" dot={false}>Needs approval</Badge></p>
              <p className="text-sm text-ink-2">Custom type & rate structure</p><p className="mt-1 text-xs text-muted">Built on the selected base type ({type})</p>
            </button>
          </div>
          {custom.on && (
            <FormGrid className="mt-4">
              <Input label="Custom contract type name" required value={custom.name} error={show('customName')} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="e.g. LTL — Port shuttle 6-month" hint={`Class, term rules and rate card come from the base type ${type}.`} />
              <Select label="Rate structure" value={custom.rateStructure} onChange={(e) => setCustom({ ...custom, rateStructure: e.target.value })} options={['Daily rate per equipment type', 'Other — describe in the reason'].map((x) => ({ value: x, label: x }))} />
              <Banner tone="info" className="md:col-span-2">Custom types go to Sales Director → Finance Manager for approval and are audited; the contract cannot be sent to the client until approved. Who may create custom types is pending decision.</Banner>
            </FormGrid>
          )}
        </FormSection>
        <FormSection title="Term">
          <FormGrid cols={4}>
            <Input label="Effective date" type="date" required min={today} value={v.effectiveDate} error={show('effectiveDate') ?? (v.effectiveDate && v.effectiveDate < today ? 'Effective date cannot be in the past' : undefined)} onChange={(e) => setV({ ...v, effectiveDate: e.target.value })} hint="Today or later (Philippine date)" />
            <Input label={type === 'SPL' ? 'Expiry date (optional)' : 'Expiry date'} type="date" required={type !== 'SPL'} value={v.expiryDate} onChange={(e) => setV({ ...v, expiryDate: e.target.value })} error={show('expiryDate') ?? (v.expiryDate && durationErr ? durationErr : undefined)} hint={type === 'LTL' ? 'At least 1 year after the effective date' : type === 'QLP' ? '10 days to 6 months after the effective date' : 'SPL is open-ended'} />
            <Input label="Lock-in (months)" type="number" min={0} value={v.lockInMonths} onChange={(e) => setV({ ...v, lockInMonths: Number(e.target.value) })} placeholder="e.g. 12" hint={<>Pre-termination fee basis. {type !== 'LTL' && <Badge tone="warning" dot={false}>SPL/QLP lock-in — pending decision</Badge>}</>} />
            <Select label="Region" value={v.region} onChange={(e) => setV({ ...v, region: e.target.value })} options={regions.map((r) => ({ value: r, label: r }))} hint={`Region list from the branch master (NCR, North Luzon, South Luzon, Visayas, Mindanao)${clientBranchRegion ? `; defaults to the client branch's region (${clientBranchRegion})` : ''}. Allocation groups these by island (Luzon, Visayas, Mindanao).`} />
            <Select label="Pick-up branch" value={extra.pickupBranch} onChange={(e) => setExtra({ ...extra, pickupBranch: e.target.value })} placeholder={clientCode ? 'Select branch' : 'Select a client first'} options={branchOptions} hint="Where the client collects the units; defaults to the client's branch. Units per branch: pending confirmation." />
            <Field label="Renewal" hint="Today a renewal is a new linked contract (Renew on the contract). Auto-renew is pending Delbros' decision.">
              {() => <div className="flex h-9 items-center"><Checkbox label="Auto-renew unless either party gives notice" checked={extra.autoRenew} onChange={(e) => setExtra({ ...extra, autoRenew: e.target.checked })} /></div>}
            </Field>
            <Select label="Delbros signatory" value={extra.lessorSignatoryId} onChange={(e) => setExtra({ ...extra, lessorSignatoryId: e.target.value })} placeholder="Select" options={lessorOptions} hint="Signs for Delbros (lessor). Who may sign — pending confirmation." />
          </FormGrid>
          <Textarea className="mt-4" wrapperClassName="mt-4" label="Special terms / notes" value={extra.specialTerms} onChange={(e) => setExtra({ ...extra, specialTerms: e.target.value })} placeholder="e.g. Units to be delivered to the client's Pasig yard; 15-day grace on the first invoice" hint="Printed on the contract under the class terms." />
        </FormSection>
        <FormSection title={`Daily rates, quantity & indemnity — Class ${CONTRACT_TYPES[type].class}`} description={`Auto-populated from the class rate card. Rates are snapshotted on the contract and never change when the rate card changes. Changes from the template are flagged; more than ${tol}% needs approval.`}>
          <Banner tone="warning" className="mb-3">Equipment type names are placeholders until the list is confirmed from DelWater Online.</Banner>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-alt text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-3 py-2 text-left">Equipment type</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Template rate</th><th className="px-3 py-2 text-right">Daily rate</th><th className="px-3 py-2 text-right">Variance</th><th className="px-3 py-2 text-right">Indemnity / loss</th></tr></thead>
              <tbody>{rates.map((r, i) => {
                const vr = variance(r, i); const big = Math.abs(vr) > tol;
                return (
                  <tr key={r.equipmentType} className="border-t border-line">
                    <td className="px-3 py-1.5">{eqName(r.equipmentType)}</td>
                    <td className="px-3 py-1.5"><input type="number" min={0} className="ml-auto block h-8 w-20 rounded-md border border-line-strong px-2 text-right tabular" value={r.qty ?? 0} onChange={(e) => setRates(rates.map((x, k) => (k === i ? { ...x, qty: Math.max(0, Number(e.target.value)) } : x)))} aria-label={`${eqName(r.equipmentType)} quantity`} /></td>
                    <td className="px-3 py-1.5 text-right text-muted tabular">{formatPhp(template[i]?.dailyRate)}</td>
                    <td className={cn('px-3 py-1.5', big ? '[&_input]:border-danger [&_input]:bg-danger-bg' : vr ? '[&_input]:border-warning [&_input]:bg-warning-bg' : '')}><AmountBox className="ml-auto w-36" value={r.dailyRate} onChange={(n) => setRates(rates.map((x, k) => (k === i ? { ...x, dailyRate: n } : x)))} ariaLabel={`${eqName(r.equipmentType)} daily rate`} /></td>
                    <td className={cn('px-3 py-1.5 text-right tabular', big ? 'font-semibold text-danger' : vr ? 'text-warning' : 'text-muted')}>{vr ? `${vr > 0 ? '+' : ''}${vr}%` : '—'}{big && <span className="ml-1 text-[11px]">approval</span>}</td>
                    <td className="px-3 py-1.5"><AmountBox className="ml-auto w-40" value={r.indemnity} onChange={(n) => setRates(rates.map((x, k) => (k === i ? { ...x, indemnity: n } : x)))} ariaLabel={`${eqName(r.equipmentType)} indemnity`} /></td>
                  </tr>
                );
              })}</tbody>
              <tfoot><tr className="border-t border-line bg-surface-alt"><td className="px-3 py-2 text-xs font-semibold uppercase text-muted">Total contracted units</td><td className={cn('px-3 py-2 text-right font-semibold tabular', show('unitQty') && 'text-danger')}>{totalUnits}</td><td colSpan={4} className="px-3 py-2 text-xs text-danger">{show('unitQty')}</td></tr></tfoot>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Quantity per equipment type feeds Allocation and the EWA unit list. Indemnity values are editable pending confirmation.</p>
          {(overridden || custom.on) && <Textarea className="mt-3" wrapperClassName="mt-3" label="Reason for custom type / rate override" required value={overrideReason} error={show('varianceReason')} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Why the rates differ from the template — e.g. volume deal" hint="Recorded in the audit trail with the template and new rates." />}
          {needsApproval && <Banner tone="warning" className="mt-3" title="Approval required before the contract is sent">{custom.on && 'Custom contract type. '}{above.length > 0 && `${above.length} rate(s) differ from the template by more than ${tol}%. `}Sales Director → Finance Manager (proposed matrix).</Banner>}
        </FormSection>
        <div className="grid gap-5 lg:grid-cols-2">
          <FormSection title="Commercial terms">
            <FormGrid>
              <Select label="Payment method" value={v.paymentMethod} onChange={(e) => setV({ ...v, paymentMethod: e.target.value })} options={['Check', 'Bank Transfer', 'Cash', 'Online'].map((x) => ({ value: x, label: x }))} />
              <Select label="Billing cycle" value={v.billingCycle} onChange={(e) => setV({ ...v, billingCycle: e.target.value as 'Weekly' | 'Monthly' })} options={[{ value: 'Weekly', label: 'Weekly' }, { value: 'Monthly', label: 'Monthly' }]}
                hint={client.data && v.billingCycle !== client.data.client.billingCycle ? `Differs from the client's ${client.data.client.billingCycle} cycle — billing runs on the client's cycle` : 'Defaults from the client record'} />
              <Input label="Credit term (days)" type="number" value={v.creditTermDays} onChange={(e) => setV({ ...v, creditTermDays: Number(e.target.value) })} placeholder="e.g. 30" />
              <AmountField label="Cash deposit (cash bond)" required value={v.cashDeposit} error={show('cashDeposit')} onChange={(n) => setV({ ...v, cashDeposit: n })} hint="Baseline from Settings; the receipt is recorded in Cash Bonds against this contract." />
            </FormGrid>
          </FormSection>
          <FormSection title="Penalty schedule">
            <FormGrid>
              <AmountField label="Non-return" value={pen.nonReturn} onChange={(n) => setPen({ ...pen, nonReturn: n })} />
              <AmountField label="Deferred check" value={pen.deferredCheck} onChange={(n) => setPen({ ...pen, deferredCheck: n })} />
              <AmountField label="Late payment interest (per month)" suffix="%" value={pen.lateInterestPct} onChange={(n) => setPen({ ...pen, lateInterestPct: n })} />
              <AmountField label="Dishonored check" value={pen.dishonoredCheck} onChange={(n) => setPen({ ...pen, dishonoredCheck: n })} />
            </FormGrid>
          </FormSection>
        </div>
        <FormSection title="Supporting documents (optional)" description="For example the client's quotation acceptance or board resolution. The signed and notarized copies are uploaded later, at those lifecycle steps. Rescue, tire, parts, service-fee and Park & Fix rates are not set here — they come from Master data (rate cards) and System settings.">
          <div className="flex flex-wrap items-end gap-2">
            <FilePick label="File" className="min-w-[240px] flex-1" accept=".pdf,image/*" fileName={docPick} onPick={setDocPick} />
            <Button variant="secondary" icon={<Paperclip className="size-4" />} disabled={!docPick} onClick={() => { setDocs([...docs, docPick]); setDocPick(''); }}>Add</Button>
          </div>
          {docs.length > 0 && <ul className="mt-3 space-y-1 text-[13px]">{docs.map((d, i) => <li key={i} className="flex items-center gap-2"><Paperclip className="size-3.5 text-muted" />{d}<button type="button" className="text-xs text-danger hover:underline" onClick={() => setDocs(docs.filter((_, k) => k !== i))}>Remove</button></li>)}</ul>}
        </FormSection>
        <div className="flex justify-end gap-2">
          <Link to="/contracts"><Button variant="secondary">Cancel</Button></Link>
          <Button loading={create.isPending} onClick={save}>{needsApproval ? 'Save as Draft & request approval' : 'Save as Draft'}</Button>
        </div>
      </Stack>
      {addSig && <AddContactModal code={clientCode} signatory onClose={() => setAddSig(false)} onAdded={(id) => setV((x) => ({ ...x, signatoryId: id }))} />}
    </div>
  );
}

// ── SCR-08 Contract detail & lifecycle (DBL-CLT-010) ────────────────────────
const STEP_ACTIONS: Record<string, { next: ContractStatus; label: string; icon: React.ReactNode; upload?: string; hint: string }> = {
  Draft: { next: 'Sent to Client', label: 'Send to client', icon: <Send className="size-4" />, hint: 'Records the dispatch date (print the contract first).' },
  Printed: { next: 'Signed', label: 'Mark signed', icon: <Upload className="size-4" />, upload: 'Signed copy', hint: 'Upload the client-signed copy.' },
  'Sent to Client': { next: 'Signed', label: 'Mark signed', icon: <Upload className="size-4" />, upload: 'Signed copy', hint: 'Upload the client-signed copy (return date).' },
  Signed: { next: 'For Notarisation', label: 'For notarization', icon: <Stamp className="size-4" />, hint: 'Hands the signed contract to Legal (handoff date).' },
  'For Notarisation': { next: 'Notarized', label: 'Log notarized', icon: <Upload className="size-4" />, upload: 'Notarized copy', hint: 'Upload the notarized copy.' },
  Notarized: { next: 'Active', label: 'Activate', icon: <CheckCircle2 className="size-4" />, hint: 'Credit gate is checked; renewal notices start from the expiry date.' },
};

export function ContractDetailPage() {
  const { no = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const data = useData(['contract', no], () => api.contracts.get(no));
  const { eqName, userName, branchName, setting } = useRefLookups();
  const { can } = useAuth();
  const [stepOpen, setStepOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  if (data.error) return <Banner tone="danger">{errMessage(data.error)}</Banner>;
  if (!data.data) return <p className="text-muted">Loading…</p>;
  const c = data.data;
  const step = STEP_ACTIONS[c.status];
  const idx = lifecycleIndex(c.status);
  const terminal = ['Expired', 'Renewed', 'Terminated'].includes(c.status);
  const canEdit = can('clients.contract', 'edit');
  const lastEvent = (s: string) => [...(c.history ?? [])].reverse().find((h) => h.status === s || (s === 'Sent to Client' && h.status === 'Printed'));
  const blockedByApproval = c.status === 'Draft' && c.approval && c.approval.status !== 'Approved';
  const horizon = Number(setting('clt.renewal_amber_days') ?? 90);
  const dte = daysToExpiry(c.expiryDate);
  const sigName = c.signatoryName ?? '—';
  return (
    <>
      <PageHeader breadcrumb={<Crumb items={[{ to: '/contracts', label: 'Contracts' }, { label: c.contractNo }]} />} title={`${c.contractNo} · v${c.version}`} meta={<StatusBadge domain="contract" value={c.status} />}
        description={`${c.clientName} · ${typeLabel(c)} — ${CONTRACT_TYPES[c.contractType].name}`}
        actions={<>
          <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => setPrintOpen(true)}>Print contract</Button>
          {step && canEdit && <Button icon={step.icon} disabled={!!blockedByApproval} onClick={() => setStepOpen(true)}>{step.label}</Button>}
          {['Active', 'Expired'].includes(c.status) && !c.renewedTo && can('clients.contract', 'add') && <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => setRenewOpen(true)}>Renew</Button>}
          {['Active', 'Draft', 'Sent to Client'].includes(c.status) && canEdit && <Button variant="secondary" icon={<FilePen className="size-4" />} onClick={() => setAmendOpen(true)}>Amend / new version</Button>}
          {c.status === 'Active' && canEdit && c.termination?.status !== 'Pending' && <Button variant="secondary" className="border-danger/40 text-danger hover:bg-danger-bg" icon={<XCircle className="size-4" />} onClick={() => setTermOpen(true)}>Terminate</Button>}
        </>} />
      {sp.get('created') && <Banner tone="success" className="mb-4" title={`Contract ${c.contractNo} v${c.version} saved as Draft`} actions={<Button size="sm" variant="ghost" onClick={() => setSp({})}>Dismiss</Button>}>
        {c.approval?.status === 'Pending' ? `Waiting for ${c.approval.kind.toLowerCase()} approval (Sales Director → Finance Manager) before it can be sent to the client.` : 'Next: print the contract and send it to the client for signature.'}
      </Banner>}
      {/* State names only; dates and users are in the Lifecycle history card (shown as a tooltip here). */}
      <ol className="mb-4 flex flex-wrap gap-2">
        {CONTRACT_LIFECYCLE.map((s, i) => { const ev = lastEvent(s); return (
          <li key={s} title={ev ? `${formatDate(ev.at)} · ${userName(ev.by)}` : undefined} className={cn('rounded-lg border px-3 py-1.5 text-[13px] font-medium', i < idx ? 'border-success-line bg-success-bg text-success' : i === idx && !terminal ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-muted')}>
            {i + 1}. {stateLabel(s)}
          </li>
        ); })}
        {terminal && (() => { const ev = lastEvent(c.status); return <li title={ev ? `${formatDate(ev.at)} · ${userName(ev.by)}` : undefined} className="rounded-lg border border-purple-line bg-purple-bg px-3 py-1.5 text-[13px] font-medium text-purple">{c.status}</li>; })()}
      </ol>
      <Stack>
        {blockedByApproval && <Banner tone={c.approval!.status === 'Rejected' ? 'danger' : 'warning'} title={`${c.approval!.kind} approval ${c.approval!.status.toLowerCase()}`}>{c.approval!.status === 'Rejected' ? 'Amend the terms (new version) to resubmit.' : 'The contract cannot be sent to the client until approved.'} Reason given: {c.approval!.reason}</Banner>}
        {c.approvalWf && <Card><CardHeader title={`Terms approval — ${c.approval?.kind}`} /><ApprovalTimeline workflow={c.approvalWf} userName={userName} /></Card>}
        {c.terminationWf && <Card><CardHeader title="Termination approval" description={`${c.termination?.reason} · effective ${formatDate(c.termination?.effectiveDate)}`} /><ApprovalTimeline workflow={c.terminationWf} userName={userName} /></Card>}
        {c.status === 'Expired' && <Banner tone="danger" title="Contract expired">Expired on {formatDate(c.expiryDate)}. New EWAs and allocations need an Active contract — renew it to continue leasing.{c.units.length > 0 && ` ${c.units.length} unit(s) are still on hire after expiry; the hold-over rate / extension rule is pending the client's decision.`}</Banner>}
        {c.status === 'Active' && dte != null && dte <= horizon && <Banner tone="warning" title={`Expires in ${dte} days`}>Renewal notices go to the AE and Sales Director at 3, 2 and 1 months.</Banner>}
        {c.clientStatus === 'Hold' && <Banner tone="danger" title="Client On Hold">The contract stays as is, but EWAs, gate release and new services are blocked until the hold is lifted.</Banner>}
        {c.status === 'Notarized' && <CreditGateBanner clientCode={c.clientCode} action="CONTRACT_ACTIVATE" />}
        {/* Rates and units on hire stack in the wide column so the taller Terms card does not leave a blank area beside them. */}
        <div className="grid items-start gap-5 lg:grid-cols-3">
          <Stack className="min-w-0 lg:col-span-2">
          <Card>
            <CardHeader title="Rates, quantity & indemnity (snapshot)" description="Snapshotted at creation; changed only through an amendment (new version)." />
            <DataTable data={c.rates} searchable={false} columns={[{ accessorKey: 'equipmentType', header: 'Equipment type', cell: (x) => eqName(x.getValue<string>()) }, { accessorKey: 'qty', header: 'Qty', meta: { align: 'right' }, cell: (x) => x.getValue<number>() ?? '—' },
              { accessorKey: 'dailyRate', header: 'Daily rate', meta: { align: 'right' }, cell: (x) => formatPhp(x.getValue<number>()) },
              { id: 'var', header: 'vs template', meta: { align: 'right' }, cell: (x) => { const t = x.row.original.templateRate; const vr = rateVariancePct(x.row.original.dailyRate, t); return t ? (vr ? <span className="text-warning">{vr > 0 ? '+' : ''}{vr}%</span> : '—') : '—'; } },
              { accessorKey: 'indemnity', header: 'Indemnity', meta: { align: 'right' }, cell: (x) => formatPhp(x.getValue<number>()) }]} />
          </Card>
          <Card padded={false}>
            <div className="p-5 pb-0"><CardHeader title="Units on hire under this contract" description="Chassis currently out" /></div>
            <DataTable data={c.units} searchable={false} emptyTitle="No units on hire" columns={[
              { accessorKey: 'chassisNo', header: 'Chassis', cell: (x) => <Link className="font-mono text-brand-600 hover:underline" to={`/chassis/${x.getValue()}`}>{x.getValue<string>()}</Link> },
              { accessorKey: 'chassisType', header: 'Type', cell: (x) => eqName(x.getValue<string>()) }, { accessorKey: 'branchCode', header: 'Branch' },
              { accessorKey: 'gateOut', header: 'Gate out', cell: (x) => formatDateTime(x.getValue<string>()) }, { accessorKey: 'currentGatePassNo', header: 'Gate pass' }]} />
          </Card>
          </Stack>
          <Card>
            <CardHeader title="Terms" />
            <KeyValueGrid cols={2} items={[
              { label: 'Version', value: `v${c.version}` }, { label: 'Signatory', value: sigName }, { label: 'Effective', value: formatDate(c.effectiveDate) }, { label: 'Expiry', value: c.expiryDate ? formatDate(c.expiryDate) : 'Open-ended' },
              { label: 'Contracted units', value: c.unitQty }, { label: 'Region', value: c.region }, { label: 'Payment', value: c.paymentMethod }, { label: 'Billing', value: c.billingCycle },
              { label: 'Credit term', value: `${c.creditTermDays} days` }, { label: 'Cash deposit', value: formatPhp(c.cashDeposit) }, { label: 'Lock-in', value: `${c.lockInMonths} months` }, { label: 'Late interest', value: `${c.penalties.lateInterestPct}% / month` },
              { label: 'Non-return', value: formatPhp(c.penalties.nonReturn) }, { label: 'Deferred check', value: formatPhp(c.penalties.deferredCheck) }, { label: 'Dishonored check', value: formatPhp(c.penalties.dishonoredCheck) }, { label: 'AE', value: userName(c.aeUserId) },
              { label: 'Delbros signatory', value: c.lessorSignatoryId ? userName(c.lessorSignatoryId) : '—' }, { label: 'Pick-up branch', value: c.pickupBranch ? branchName(c.pickupBranch) : '—' },
              { label: 'Renewal', value: c.autoRenew ? 'Auto-renew (pending confirmation)' : 'New contract on renewal' }, ...(c.specialTerms ? [{ label: 'Special terms', value: c.specialTerms }] : []),
              { label: 'Branch', value: branchName(c.branchCode) }, { label: 'Created', value:`${formatDateTime(c.createdAt)}${c.createdBy ? ` · ${userName(c.createdBy)}` : ''}` },
              { label: 'Cash bond', value: c.cashBonds.length ? c.cashBonds.map((b) => <Link key={b.id} to={`/cash-bonds?bond=${b.id}`} className="block text-brand-600 hover:underline">{formatPhp(b.amount)} · {b.status}</Link>) : <Link to={`/cash-bonds?record=${c.clientCode}&contract=${c.contractNo}`} className="text-brand-600 hover:underline">Not recorded — record</Link> },
              { label: 'Renewal', value: c.renewalOf ? <>Renews <Link className="text-brand-600 hover:underline" to={`/contracts/${c.renewalOf}`}>{c.renewalOf}</Link></> : c.renewedTo ? <>Renewed by <Link className="text-brand-600 hover:underline" to={`/contracts/${c.renewedTo}`}>{c.renewedTo}</Link></> : '—' },
            ]} />
          </Card>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><History className="size-4" />Lifecycle history</span>} description="Date and user per step — dispatch, return (signed), legal handoff, notarization, activation" />
            <ul className="space-y-1.5 text-[13px]">{[...(c.history ?? [])].reverse().map((h, i) => <li key={i} className="flex flex-wrap gap-x-2"><span className="text-muted">{formatDateTime(h.at)}</span><span className="font-medium">{stateLabel(h.status)}</span><span>· {userName(h.by)}</span>{h.note && <span className="text-ink-2">— {h.note}</span>}{h.fileName && <span className="inline-flex items-center gap-1 text-brand-700"><Paperclip className="size-3" />{h.fileName}</span>}</li>)}</ul>
          </Card>
          <Card>
            <CardHeader title="Documents & versions" />
            <ul className="mb-4 space-y-1 text-[13px]">{(c.documents ?? []).length ? c.documents!.map((d, i) => <li key={i} className="flex items-center gap-2"><Paperclip className="size-3.5 text-muted" /><span className="font-medium">{d.fileName}</span><Badge tone="neutral" dot={false}>{d.kind}</Badge><span className="text-muted">{formatDate(d.at)} · {userName(d.by)}</span></li>) : <li className="text-muted">No signed or notarized copies uploaded yet.</li>}</ul>
            <ul className="space-y-1 text-[13px]">{(c.versions ?? [{ version: 1, at: c.createdAt, by: c.createdBy ?? '—', reason: 'Created' }]).map((x) => <li key={x.version}><span className="font-medium">v{x.version}</span> · {formatDate(x.at)} · {userName(x.by)} — {x.reason}</li>)}</ul>
          </Card>
        </div>
      </Stack>
      {stepOpen && step && <StepModal no={no} step={step} onClose={() => setStepOpen(false)} />}
      {printOpen && <ContractPrint c={c} onClose={() => setPrintOpen(false)} />}
      {renewOpen && <RenewModal no={no} type={c.contractType} expiry={c.expiryDate} onClose={() => setRenewOpen(false)} onDone={(n) => nav(`/contracts/${n}?created=1`)} />}
      {amendOpen && <AmendModal c={c} onClose={() => setAmendOpen(false)} />}
      {termOpen && <TerminateModal c={c} onClose={() => setTermOpen(false)} />}
    </>
  );
}

function StepModal({ no, step, onClose }: { no: string; step: (typeof STEP_ACTIONS)[string]; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [fileName, setFileName] = useState('');
  const adv = useAction(() => api.contracts.advance(no, step.next, { note: note || undefined, fileName: fileName || undefined }), { success: (c) => `Contract is now ${c.status}`, onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={step.label} description={step.hint}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={step.icon} loading={adv.isPending} disabled={!!step.upload && !fileName} onClick={() => adv.mutate(undefined)}>{step.label}</Button></>}>
      <Stack>
        {step.upload && <FilePick label={`${step.upload} (PDF or image)`} required accept=".pdf,image/*" fileName={fileName} onPick={setFileName} error={fieldError(adv.error, 'fileName')} hint="Stored in contract documents." />}
        <Textarea label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. courier reference, Legal recipient" />
        {adv.error && <Banner tone="danger">{errMessage(adv.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

function RenewModal({ no, type, expiry, onClose, onDone }: { no: string; type: ContractType; expiry?: string; onClose: () => void; onDone: (no: string) => void }) {
  const start = expiry && expiry >= todayManila() ? new Date(new Date(expiry).getTime() + 86400000).toISOString().slice(0, 10) : todayManila();
  const [d, setD] = useState({ effectiveDate: start, expiryDate: '' });
  const err = validateContractDuration(type, d.effectiveDate, d.expiryDate || undefined);
  const act = useAction(() => api.contracts.renew(no, { effectiveDate: d.effectiveDate, expiryDate: d.expiryDate || undefined }), { success: (c) => `Renewal ${c.contractNo} created as Draft`, onSuccess: (c) => onDone(c.contractNo) });
  return (
    <Modal open onClose={onClose} title={`Renew ${no}`} description="Creates a linked Draft contract with the current terms and rates; this contract becomes Renewed when the renewal is activated."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={<RefreshCw className="size-4" />} loading={act.isPending} disabled={type !== 'SPL' && !!err} onClick={() => act.mutate(undefined)}>Create renewal</Button></>}>
      <FormGrid>
        <Input label="Effective date" type="date" required value={d.effectiveDate} onChange={(e) => setD({ ...d, effectiveDate: e.target.value })} />
        <Input label={type === 'SPL' ? 'Expiry date (optional)' : 'Expiry date'} type="date" required={type !== 'SPL'} value={d.expiryDate} error={(type !== 'SPL' || d.expiryDate) ? err ?? undefined : undefined} onChange={(e) => setD({ ...d, expiryDate: e.target.value })} />
      </FormGrid>
      {act.error && <Banner tone="danger" className="mt-3">{errMessage(act.error)}</Banner>}
    </Modal>
  );
}

type Detail = Awaited<ReturnType<typeof api.contracts.get>>;
function AmendModal({ c, onClose }: { c: Detail; onClose: () => void }) {
  const { eqName } = useRefLookups();
  const [p, setP] = useState({ reason: '', creditTermDays: c.creditTermDays, paymentMethod: c.paymentMethod, billingCycle: c.billingCycle, expiryDate: c.expiryDate ?? '', fileName: '' });
  const [rates, setRates] = useState(c.rates);
  const act = useAction(() => api.contracts.amend(c.contractNo, { ...p, rates, fileName: p.fileName || undefined }), { success: (r) => `Amended — now v${r.version}`, onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Amend ${c.contractNo} — new version v${(c.version ?? 1) + 1}`} description="Every amendment is a new version with a reason; rate changes above tolerance go for approval." size="xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.isPending} disabled={!p.reason.trim()} onClick={() => act.mutate(undefined)}>Save v{(c.version ?? 1) + 1}</Button></>}>
      <Stack>
        <FormGrid cols={4}>
          <Input label="Credit term (days)" type="number" value={p.creditTermDays} onChange={(e) => setP({ ...p, creditTermDays: Number(e.target.value) })} placeholder="e.g. 30" />
          <Select label="Payment method" value={p.paymentMethod} onChange={(e) => setP({ ...p, paymentMethod: e.target.value })} options={['Check', 'Bank Transfer', 'Cash', 'Online'].map((x) => ({ value: x, label: x }))} />
          <Select label="Billing cycle" value={p.billingCycle} onChange={(e) => setP({ ...p, billingCycle: e.target.value as 'Weekly' | 'Monthly' })} options={[{ value: 'Weekly', label: 'Weekly' }, { value: 'Monthly', label: 'Monthly' }]} />
          <Input label="Expiry date" type="date" value={p.expiryDate} onChange={(e) => setP({ ...p, expiryDate: e.target.value })} />
        </FormGrid>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-[13px]"><thead className="bg-surface-alt text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-3 py-2 text-left">Equipment type</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Daily rate</th></tr></thead>
            <tbody>{rates.map((r, i) => <tr key={r.equipmentType} className="border-t border-line"><td className="px-3 py-1.5">{eqName(r.equipmentType)}</td>
              <td className="px-3 py-1.5"><input type="number" min={0} className="ml-auto block h-8 w-20 rounded-md border border-line-strong px-2 text-right" value={r.qty ?? 0} onChange={(e) => setRates(rates.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))} aria-label={`${eqName(r.equipmentType)} qty`} /></td>
              <td className="px-3 py-1.5"><input type="number" className="ml-auto block h-8 w-32 rounded-md border border-line-strong px-2 text-right" value={r.dailyRate} onChange={(e) => setRates(rates.map((x, k) => (k === i ? { ...x, dailyRate: Number(e.target.value) } : x)))} aria-label={`${eqName(r.equipmentType)} rate`} /></td></tr>)}</tbody></table>
        </div>
        <Textarea label="Reason for amendment" required value={p.reason} onChange={(e) => setP({ ...p, reason: e.target.value })} placeholder="What changes and why — e.g. client added 5 chassis" />
        <FilePick label="Signed amendment (optional)" accept=".pdf,image/*" fileName={p.fileName} onPick={(n) => setP({ ...p, fileName: n })} />
        {act.error && <Banner tone="danger">{errMessage(act.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

function TerminateModal({ c, onClose }: { c: Detail; onClose: () => void }) {
  const [t, setT] = useState({ reason: '', effectiveDate: todayManila() });
  const lockEnd = new Date(c.effectiveDate); lockEnd.setMonth(lockEnd.getMonth() + c.lockInMonths);
  const inLock = c.lockInMonths > 0 && new Date(t.effectiveDate) < lockEnd;
  const act = useAction(() => api.contracts.terminate(c.contractNo, t.reason, t.effectiveDate), { success: 'Termination request sent for approval', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Terminate ${c.contractNo}`} description="Sales Director → Finance Manager approve in My Approvals; the contract becomes Terminated on final approval."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" loading={act.isPending} disabled={!t.reason.trim() || !t.effectiveDate} onClick={() => act.mutate(undefined)}>Request termination</Button></>}>
      <Stack>
        {inLock && <Banner tone="warning" title="Inside the lock-in period">Lock-in runs to {formatDate(lockEnd.toISOString())}; a pre-termination fee applies.</Banner>}
        {c.units.length > 0 && <Banner tone="info">{c.units.length} unit(s) still on hire must be returned (gate in) before closure.</Banner>}
        <Input label="Termination effective date" type="date" required value={t.effectiveDate} onChange={(e) => setT({ ...t, effectiveDate: e.target.value })} />
        <Textarea label="Reason" required value={t.reason} onChange={(e) => setT({ ...t, reason: e.target.value })} placeholder="Why the contract is ending — e.g. client closing its Manila operations" />
        {act.error && <Banner tone="danger">{errMessage(act.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

// DBL-CLT-012: printable contract carries the class-specific terms. Clause wording is a placeholder until Legal supplies the templates.
const CLASS_CLAUSES: Record<string, string[]> = {
  A: ['Long-Term Lease (Class A): minimum term of one (1) year from the effective date.', 'Lock-in period as stated; early termination within the lock-in incurs the pre-termination fee.', 'Class A daily rates apply per equipment type for the whole term.'],
  Z: ['Spot List (Class Z): open-ended; either party may end the lease on written notice.', 'Class Z daily rates apply per equipment type while units are on hire.'],
  Q: ['Quick Lease Program (Class Q): term of ten (10) days to six (6) months.', 'Class Q daily rates apply per equipment type; extensions beyond six months require a new contract.'],
};
function ContractPrint({ c, onClose }: { c: Detail; onClose: () => void }) {
  const { eqName, userName } = useRefLookups();
  return (
    <PrintPreview open onClose={onClose} title={`Lease contract ${c.contractNo}`}>
      <DocHeader title={`LEASE CONTRACT — CLASS ${c.class}`} no={`${c.contractNo} v${c.version}`} date={formatDate(c.createdAt)} extra={<p>{c.contractType} · {CONTRACT_TYPES[c.contractType].name}{c.customType ? ` · ${c.customType.name}` : ''}</p>} />
      <table className="mb-3 w-full"><tbody>
        {[['LESSEE', `${c.clientCode} ${c.clientName}`, 'SIGNATORY', c.signatoryName ?? '________'], ['ADDRESS', c.clientAddress || '—', 'REGION', c.region],
          ['TERM', `${formatDate(c.effectiveDate)} – ${c.expiryDate ? formatDate(c.expiryDate) : 'open-ended'}`, 'UNITS', String(c.unitQty)],
          ['PAYMENT', `${c.paymentMethod} · ${c.billingCycle} billing · ${c.creditTermDays} days`, 'CASH DEPOSIT', formatPhp(c.cashDeposit)]].map((r, i) => (
          <tr key={i}><td className="w-24 py-0.5 font-semibold">{r[0]}</td><td className="py-0.5">{r[1]}</td><td className="w-28 py-0.5 font-semibold">{r[2]}</td><td className="py-0.5">{r[3]}</td></tr>))}
      </tbody></table>
      <p className="mb-1 font-semibold">SCHEDULE A — CLASS {c.class} DAILY RATES AND INDEMNITY</p>
      <table className="mb-3 w-full border border-black/50"><thead><tr className="bg-black/5">{['Equipment type', 'Qty', 'Daily rate', 'Indemnity / loss'].map((h) => <th key={h} className="border border-black/40 px-1 py-0.5 text-left">{h}</th>)}</tr></thead>
        <tbody>{c.rates.map((r) => <tr key={r.equipmentType}>{[eqName(r.equipmentType), r.qty ?? '—', formatPhp(r.dailyRate), formatPhp(r.indemnity)].map((v, i) => <td key={i} className="border border-black/30 px-1 py-0.5">{v}</td>)}</tr>)}</tbody></table>
      <p className="mb-1 font-semibold">SCHEDULE B — PENALTIES</p>
      <p className="mb-3">Non-return {formatPhp(c.penalties.nonReturn)} · Deferred check {formatPhp(c.penalties.deferredCheck)} · Late payment interest {c.penalties.lateInterestPct}% per month · Dishonored check {formatPhp(c.penalties.dishonoredCheck)} · Lock-in {c.lockInMonths} months</p>
      <p className="mb-1 font-semibold">CLASS {c.class} TERMS</p>
      <ol className="mb-3 list-decimal pl-5">{(CLASS_CLAUSES[c.class] ?? []).map((t) => <li key={t}>{t}</li>)}<li>Rates are fixed for this contract version and change only by a signed amendment.</li>{c.specialTerms && <li>Special terms: {c.specialTerms}</li>}</ol>
      <p className="text-[10px] italic">Clause wording is placeholder text pending Legal’s class templates.</p>
      <div className="mt-8 grid grid-cols-2 gap-10">
        <div><p className="font-semibold">For DELBROS LEASING</p><p className="mt-10 border-t border-black/60">{c.lessorSignatoryId ? userName(c.lessorSignatoryId) : 'Authorised signatory'}</p></div>
        <div><p className="font-semibold">For {c.clientName}</p><p className="mt-10 border-t border-black/60">{c.signatoryName ?? 'Authorised signatory'}</p></div>
      </div>
      <DocFooter copy="ORIGINAL — FOR SIGNATURE" />
    </PrintPreview>
  );
}

// ── SCR-09 Cash Bond Management ─────────────────────────────────────────────
type BondRow = Awaited<ReturnType<typeof api.contracts.cashBonds>>[number];
const BOND_TONE = (s: string) => (s === 'Held' ? 'info' : s.startsWith('Pending') || s.startsWith('Approved') || s === 'Withdrawal Pending' ? 'warning' : s === 'Refunded' ? 'neutral' : s.includes('rejected') ? 'danger' : 'neutral') as 'info' | 'warning' | 'neutral' | 'danger';
export function CashBondPage() {
  const [sp, setSp] = useSearchParams();
  const data = useData(['cashbonds'], () => api.contracts.cashBonds());
  const { can } = useAuth();
  const [wId, setWId] = useState<string | null>(null);
  const [ledgerId, setLedgerId] = useState<string | null>(sp.get('bond'));
  const [rec, setRec] = useState(!!sp.get('record'));
  const withdrawRow = data.data?.find((b) => b.id === wId) ?? null;
  const ledgerRow = data.data?.find((b) => b.id === ledgerId) ?? null;
  // Review 1.1: status / client / branch filters, total held, and the reason a Withdraw button is disabled.
  const [f, setF] = useState({ status: '', client: '', branch: '' });
  const { branchOptions, branchName, userName } = useRefLookups();
  const all = data.data ?? [];
  const rows = all.filter((b) => (!f.status || (f.status === 'Held' ? b.stage === 'Held' || b.stage.startsWith('Held') : f.status === 'Refunded' ? b.status === 'Refunded' : b.status !== 'Refunded' && !b.stage.startsWith('Held'))) && (!f.client || b.clientCode === f.client) && (!f.branch || b.branchCode === f.branch));
  const held = rows.filter((b) => b.status !== 'Refunded');
  const totalHeld = held.reduce((a, b) => a + b.balance, 0);
  const clientOpts = [...new Map(all.map((b) => [b.clientCode, b.clientName])).entries()].map(([value, label]) => ({ value, label }));
  const whyDisabled = (b: BondRow) => {
    if (b.status === 'Refunded') return 'Already refunded';
    if (b.status !== 'Held') return 'A withdrawal is already in progress';
    if (b.balance <= 0) return 'No balance left';
    const p = api.contracts.refundPreview(b.id);
    if (p.refundable <= 0) return 'Nothing refundable — unpaid balances exceed the bond';
    return undefined;
  };
  return (
    <>
      <PageHeader title="Cash bonds" description="Baseline ₱20,000 (configurable) held as untouched security, separate from the e-wallet. Refundable at contract end less unpaid balances. Withdrawals go through C&C → Finance → Accounting → Admin, then Accounting records the refund."
        actions={can('clients.cashbond', 'add') && <Button onClick={() => setRec(true)}>Record cash bond</Button>} />
      <p className="mb-3 text-[13px] text-ink-2">Total held: <span className="font-semibold text-ink tabular">{formatPhp(totalHeld)}</span> across {held.length} bond{held.length === 1 ? '' : 's'}{f.status || f.client || f.branch ? ' (filtered)' : ''}. Every contract carries a bond; the contract detail shows “Not recorded” when none is on file.</p>
      <DataTable data={rows} loading={data.isLoading} onRowClick={(r) => setLedgerId(r.id)} exportName="cash-bonds"
        toolbar={<>
          <Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" options={[{ value: 'Held', label: 'Held' }, { value: 'Withdrawal', label: 'Withdrawal in progress' }, { value: 'Refunded', label: 'Refunded' }]} />
          <Select aria-label="Client" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} placeholder="All clients" options={clientOpts} />
          <Select aria-label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={branchOptions} />
        </>}
        columns={[
        { accessorKey: 'clientName', header: 'Client' },
        // Review 1.2: branch column (same as the filter).
        { accessorKey: 'branchCode', header: 'Branch', meta: { nowrap: true }, cell: (c) => <span title={branchName(c.getValue<string>())}>{c.getValue<string>() ?? '—'}</span> },
        { accessorKey: 'contractNo', header: 'Contract', cell: (c) => (c.getValue() ? <div><Link to={`/contracts/${c.getValue()}`} onClick={(e) => e.stopPropagation()} className="font-mono text-brand-600 hover:underline">{c.getValue<string>()}</Link>{c.row.original.contractStatus && <div><StatusBadge domain="contract" value={c.row.original.contractStatus} /></div>}</div> : '—') },
        // Balance only; the original bond amount shows beneath it when the two differ.
        { accessorKey: 'balance', header: 'Balance', meta: { align: 'right' }, cell: (c) => <div><MoneyText value={c.getValue<number>()} strong />{c.row.original.amount !== c.getValue<number>() && <p className="text-xs text-muted">of {formatPhp(c.row.original.amount)} bond</p>}</div> },
        { accessorKey: 'dateReceived', header: 'Received', cell: (c) => formatDate(c.getValue<string>()) }, { accessorKey: 'receiptRef', header: 'Receipt' },
        // Review 1.2: method on every row, with the check / transfer reference beneath.
        { accessorKey: 'paymentMethod', header: 'Method', cell: (c) => { const b = c.row.original; return b.paymentMethod ? <div><p>{b.paymentMethod}</p>{(b.checkNo || b.bankRef) && <p className="whitespace-nowrap text-xs text-muted">{b.checkNo ? `${b.checkBank ?? ''} ${b.checkNo}` : b.bankRef}</p>}</div> : <span className="text-xs text-muted">Not recorded</span>; } },
        // Status with the open withdrawal beneath: requested amount = bond less unpaid balances (BR-14); "Refundable" once the contract has ended.
        { accessorKey: 'stage', header: 'Status', cell: (c) => { const b = c.row.original; const open = b.withdrawals.find((w) => !['Rejected', 'Refunded'].includes(w.status)); const ended = ['Expired', 'Terminated', 'Renewed'].includes(b.contractStatus ?? ''); return <div>
          <Badge tone={BOND_TONE(c.getValue<string>())}>{c.getValue<string>()}</Badge>
          {open && <p className="mt-1 whitespace-normal text-xs text-ink-2">Requested {formatPhp(open.amount)}{b.balance - open.refundable > 0 ? ` = ${formatPhp(b.balance)} − ${formatPhp(round2(b.balance - open.refundable))} unpaid` : ''}{open.earlyException ? ' · early exception' : ''}</p>}
          {/* Review 1.2: who asked, when, steps already cleared and who holds it now. */}
          {open && b.openInfo && <p className="mt-0.5 max-w-[320px] whitespace-normal text-xs text-muted">
            By {userName(b.openInfo.requestedBy)} on {formatDate(b.openInfo.requestedAt)}{b.openInfo.cleared.map((s) => ` · ${s.label} cleared by ${userName(s.by)} ${formatDate(s.at)}`).join('')}{b.openInfo.stepLabel ? ` · now with ${b.openInfo.stepLabel}${b.openInfo.stepOwners.length ? ` (${b.openInfo.stepOwners.map(userName).join(', ')})` : ''}` : ''}</p>}
          {!open && b.status === 'Held' && ended && (api.contracts.refundPreview(b.id).refundable > 0
            ? <p className="mt-1 text-xs font-medium text-success">Refundable — contract {b.contractStatus?.toLowerCase()}</p>
            : <p className="mt-1 whitespace-normal text-xs font-medium text-warning">Contract {b.contractStatus?.toLowerCase()} — refundable once unpaid balances are settled</p>)}
        </div>; } },
        { id: 'act', header: 'Actions', cell: (c) => { const why = whyDisabled(c.row.original); return <div onClick={(e) => e.stopPropagation()}><div className="flex gap-1">
          <span title={why}><Button size="sm" variant="secondary" disabled={!!why} onClick={() => setWId(c.row.original.id)}>Withdraw</Button></span>
          <Button size="sm" variant="secondary" onClick={() => setLedgerId(c.row.original.id)}>Ledger</Button></div>{why && <p className="mt-1 max-w-[180px] whitespace-normal text-[11px] leading-snug text-muted">Withdraw: {why.toLowerCase()}</p>}</div>; } },
      ] as ColumnDef<BondRow>[]} />
      {withdrawRow && <WithdrawModal bond={withdrawRow} onClose={() => setWId(null)} />}
      <p className="mt-2 text-xs text-muted">Status runs Held → Pending Credit &amp; Collection → Pending Finance → Pending Accounting → Pending Admin → Approved — awaiting refund → Refunded (partly refunded bonds go back to Held with the lower balance). No bond in the sample has been refunded yet. The bond is per contract; per-client bonds are pending Delbros&apos; decision.</p>
      {ledgerRow && <BondLedger bond={ledgerRow} whyNoWithdraw={whyDisabled(ledgerRow)} onWithdraw={() => setWId(ledgerRow.id)} onClose={() => { setLedgerId(null); if (sp.get('bond')) setSp({}); }} />}
      {rec && <RecordBondModal initialClient={sp.get('record') ?? ''} initialContract={sp.get('contract') ?? ''} onClose={() => { setRec(false); if (sp.get('record')) setSp({}); }} />}
    </>
  );
}

function WithdrawModal({ bond, onClose }: { bond: BondRow; onClose: () => void }) {
  const preview = useMemo(() => api.contracts.refundPreview(bond.id), [bond.id]);
  const [w, setW] = useState({ amount: Math.max(0, preview.refundable), reason: '', early: false });
  const withdraw = useAction(() => api.contracts.requestWithdrawal(bond.id, w.amount, w.reason, { earlyException: w.early }), { success: 'Withdrawal submitted: C&C → Finance → Accounting → Admin', onSuccess: onClose });
  const nothing = preview.refundable <= 0;
  const amtErr = w.amount > preview.refundable ? `Cannot exceed the refundable ${formatPhp(preview.refundable)}` : !(w.amount > 0) ? 'Enter an amount greater than zero' : fieldError(withdraw.error, 'amount');
  const blocked = nothing || !!amtErr || !w.reason.trim() || (!preview.contractEnded && !w.early);
  return (
    <Modal open onClose={onClose} title={`Withdrawal / refund — ${bond.clientName}`} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={withdraw.isPending} disabled={blocked} onClick={() => withdraw.mutate(undefined)}>Submit withdrawal</Button></>}>
      <Stack>
        {/* One primary alert; the other details sit in the breakdown. */}
        {nothing && <Banner tone="danger" title={preview.shortfall > 0 ? `Nothing refundable — unpaid balances exceed the bond by ${formatPhp(preview.shortfall)}` : 'Nothing refundable'}>Settle the balances first; a withdrawal cannot be submitted.</Banner>}
        <div className="rounded-lg border border-line">
          {preview.contractNo && <div className="flex justify-between border-b border-line px-4 py-2 text-sm"><span className="text-ink-2">Contract</span><span>{preview.contractNo} · {preview.contractStatus}{preview.contractExpiry && !preview.contractEnded ? ` until ${formatDate(preview.contractExpiry)}` : ''}</span></div>}
          {[['Cash bond balance', preview.bond], ['Less: unpaid invoices', -preview.unpaid || 0], ['Less: negative e-wallet', -preview.negativeWallet || 0], ['Less: open debit memos', -preview.openDm || 0]].map(([l, v]) => (
            <div key={l as string} className="flex justify-between border-b border-line px-4 py-2 text-sm"><span className="text-ink-2">{l}</span><MoneyText value={v as number} /></div>
          ))}
          {preview.shortfall > 0 && <div className="flex justify-between border-b border-line px-4 py-2 text-sm"><span className="text-ink-2">Shortfall (stays as receivable)</span><span className="tabular">{formatPhp(preview.shortfall)}</span></div>}
          <div className="flex justify-between bg-surface-alt px-4 py-2 text-sm font-semibold"><span>Refundable</span><MoneyText value={preview.refundable || 0} strong /></div>
        </div>
        {!nothing && !preview.contractEnded && (
          <Banner tone="warning" title="Contract has not ended">
            <p>The bond is refundable at contract end. An earlier withdrawal goes as a flagged exception through the same approval chain (exception policy pending decision).</p>
            <Checkbox className="mt-2" label="Request early-withdrawal exception" checked={w.early} onChange={(e) => setW({ ...w, early: e.target.checked })} />
          </Banner>
        )}
        <FormGrid>
          <AmountField label="Withdrawal amount" required value={w.amount} disabled={nothing} onChange={(n) => setW({ ...w, amount: n })} error={nothing ? undefined : amtErr} hint="Defaults to the full refundable amount; partial withdrawals allowed." />
          <Input label="Reason" required value={w.reason} disabled={nothing} onChange={(e) => setW({ ...w, reason: e.target.value })} placeholder="e.g. contract ended, bond refund to client" error={fieldError(withdraw.error, 'reason')} />
        </FormGrid>
        {withdraw.error && <Banner tone="danger">{errMessage(withdraw.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

function BondLedger({ bond, whyNoWithdraw, onWithdraw, onClose }: { bond: BondRow; whyNoWithdraw?: string; onWithdraw: () => void; onClose: () => void }) {
  const { userName, branchName } = useRefLookups();
  const { can } = useAuth();
  const [r, setR] = useState({ method: 'Check', date: todayManila(), reference: '' });
  const awaiting = bond.withdrawals.find((w) => w.status === 'Approved — awaiting refund');
  const refund = useAction(() => api.contracts.recordRefund(bond.id, awaiting!.id, r), { success: 'Refund recorded' });
  let bal = bond.amount;
  // Review 1.2: who recorded each entry and when (receipt → received by; request → requester; refund → Accounting).
  const ledger: { at: string; entry: string; amount: number; balance: number; by?: string; recordedAt?: string }[] = [{ at: bond.dateReceived, entry: `Received · ${bond.receiptRef}`, amount: bond.amount, balance: bond.amount, by: bond.receivedBy, recordedAt: bond.recordedAt }];
  [...bond.withdrawals].reverse().forEach((w) => {
    const wf = bond.workflows.find((x) => x?.id === w.workflowId);
    ledger.push({ at: w.requestedAt, entry: `Withdrawal requested${w.earlyException ? ' (early exception)' : ''} — ${w.reason} · ${w.status}${w.refundable < bal ? ` · refundable ${formatPhp(w.refundable)} after ${formatPhp(round2(bal - w.refundable))} unpaid balances` : ''}`, amount: 0, balance: bal, by: wf?.requestedBy, recordedAt: w.requestedAt });
    if (w.refund) { bal -= w.amount; ledger.push({ at: w.refund.date, entry: `Refunded by ${w.refund.method} · ref ${w.refund.reference}`, amount: -w.amount, balance: bal, by: w.refund.by }); }
  });
  const method = bond.checkNo ? `${bond.paymentMethod} · ${bond.checkBank ?? ''} ${bond.checkNo}${bond.checkDate ? ` · ${formatDate(bond.checkDate)}` : ''}` : bond.bankRef ? `${bond.paymentMethod} · ref ${bond.bankRef}` : bond.paymentMethod;
  return (
    <Drawer open onClose={onClose} title={`Cash bond — ${bond.clientName}`} width="max-w-2xl"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><span title={whyNoWithdraw}><Button disabled={!!whyNoWithdraw} onClick={onWithdraw}>Withdraw</Button></span></>}>
      <Stack>
        <KeyValueGrid cols={3} items={[
          { label: 'Contract', value: bond.contractNo ? <Link className="text-brand-600 hover:underline" to={`/contracts/${bond.contractNo}`}>{bond.contractNo}</Link> : '—' }, { label: 'Contract status', value: bond.contractStatus ?? '—' }, { label: 'Status', value: <Badge tone={BOND_TONE(bond.stage)}>{bond.stage}</Badge> },
          { label: 'Bond', value: formatPhp(bond.amount) }, { label: 'Balance', value: formatPhp(bond.balance) }, { label: 'Received', value: formatDate(bond.dateReceived) },
          { label: 'Receipt', value: bond.receiptRef }, { label: 'Payment method', value: method ?? <span className="text-muted">Not recorded (older entry)</span> }, { label: 'Received by', value: bond.receivedBy ? userName(bond.receivedBy) : <span className="text-muted">Not recorded (older entry)</span> },
          { label: 'Branch', value: bond.branchCode ? branchName(bond.branchCode) : '—' }, { label: 'Bond type', value: bond.bondType ?? 'New' }, { label: 'Recorded', value: bond.recordedAt ? formatDateTime(bond.recordedAt) : '—' },
        ]} />
        {/* Review 1.2: receipt scan and notes always have a place on this view. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line p-3 text-sm"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Receipt scan</p>{bond.receiptFile ? <span className="inline-flex items-center gap-1 text-brand-700"><Paperclip className="size-3.5" />{bond.receiptFile}</span> : <span className="text-muted">No scan attached</span>}</div>
          <div className="rounded-lg border border-line p-3 text-sm"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Notes</p><span className={bond.notes ? 'text-ink-2' : 'text-muted'}>{bond.notes || 'No notes'}</span></div>
        </div>
        {whyNoWithdraw && <p className="text-xs text-muted">Withdraw: {whyNoWithdraw.toLowerCase()}.</p>}
        <Card padded={false}>
          <div className="p-4 pb-0"><CardHeader title="Bond ledger" description="Received, withdrawn, refunded and balance — the bond is untouched security until refunded." /></div>
          <table className="w-full text-[13px]"><thead className="bg-surface-alt text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Entry</th><th className="px-3 py-2 text-left">By</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
            <tbody>{ledger.map((l, i) => <tr key={i} className="border-t border-line"><td className="px-3 py-1.5 whitespace-nowrap">{formatDate(l.at)}</td><td className="px-3 py-1.5">{l.entry}</td><td className="px-3 py-1.5 text-xs text-ink-2">{l.by ? userName(l.by) : '—'}{l.recordedAt && <span className="block text-muted">{formatDateTime(l.recordedAt)}</span>}</td><td className="px-3 py-1.5 text-right">{l.amount ? <MoneyText value={l.amount} /> : '—'}</td><td className="px-3 py-1.5 text-right"><MoneyText value={l.balance} /></td></tr>)}</tbody></table>
        </Card>
        {bond.withdrawals.map((w) => { const wf = bond.workflows.find((x) => x?.id === w.workflowId); return (
          <Card key={w.id}>
            <CardHeader title={`Withdrawal ${formatPhp(w.amount)} · ${w.status}`} description={`${formatDateTime(w.requestedAt)} · refundable at request ${formatPhp(w.refundable)}${w.earlyException ? ' · EARLY — exception' : ''}`} />
            {wf && <ApprovalTimeline workflow={wf} userName={userName} />}
            {w.refund && <p className="mt-3 text-[13px]">Refund: {w.refund.method} on {formatDate(w.refund.date)} · Accounting ref {w.refund.reference} · {userName(w.refund.by)}</p>}
          </Card>
        ); })}
        {awaiting && can('clients.cashbond', 'approve') && (
          <FormSection title="Record refund" description="After the Admin approval, Accounting records how the refund was paid.">
            <FormGrid cols={3}>
              <Select label="Refund method" required value={r.method} onChange={(e) => setR({ ...r, method: e.target.value })} options={['Check', 'Bank transfer', 'Cash'].map((x) => ({ value: x, label: x }))} />
              <Input label="Date refunded" type="date" required value={r.date} max={todayManila()} onChange={(e) => setR({ ...r, date: e.target.value })} />
              <Input label="Accounting reference" required value={r.reference} onChange={(e) => setR({ ...r, reference: e.target.value })} placeholder="e.g. BDO-TRX-0001 or check no." />
            </FormGrid>
            <div className="mt-3 flex justify-end"><Button loading={refund.isPending} disabled={!r.reference.trim() || !r.date} onClick={() => refund.mutate(undefined)}>Record refund {formatPhp(awaiting.amount)}</Button></div>
          </FormSection>
        )}
      </Stack>
    </Drawer>
  );
}

function RecordBondModal({ initialClient, initialContract, onClose }: { initialClient: string; initialContract: string; onClose: () => void }) {
  const { clientOptions, setting, userName, ref, branchName } = useRefLookups();
  const { user } = useAuth();
  const today = todayManila();
  const [nb, setNb] = useState({ clientCode: initialClient, contractNo: initialContract, amount: Number(setting('clt.cash_bond_default') ?? 20000), dateReceived: today, receiptRef: '', paymentMethod: 'Cash', notes: '', receiptFile: '', checkNo: '', checkBank: '', checkDate: '', bankRef: '', bondType: 'New' as 'New' | 'Top-up' | 'Replacement' });
  const clientBranch = ref?.clients.find((c) => c.clientCode === nb.clientCode)?.branchCode;
  const [tried, setTried] = useState(false);
  const contracts = useData(['contracts', nb.clientCode], () => api.contracts.list({ client: nb.clientCode }), !!nb.clientCode);
  const bonds = useData(['cashbonds'], () => api.contracts.cashBonds());
  const existing = (bonds.data ?? []).find((b) => b.clientCode === nb.clientCode && b.status !== 'Refunded' && (!nb.contractNo || b.contractNo === nb.contractNo));
  const record = useAction(() => api.contracts.recordCashBond({ ...nb, contractNo: nb.contractNo || undefined, receiptFile: nb.receiptFile || undefined, notes: nb.notes || undefined, ...(nb.paymentMethod === 'Check' ? {} : { checkNo: undefined, checkBank: undefined, checkDate: undefined }), bankRef: nb.paymentMethod === 'Bank transfer' ? nb.bankRef : undefined }), { success: 'Cash bond recorded', onSuccess: onClose });
  const errs: Record<string, string> = {};
  if (!nb.clientCode) errs.clientCode = 'Client is required';
  if (!(nb.amount > 0)) errs.amount = 'Amount must be greater than zero';
  if (!nb.dateReceived) errs.dateReceived = 'Date received is required'; else if (nb.dateReceived > today) errs.dateReceived = 'Date cannot be in the future';
  if (!nb.receiptRef.trim()) errs.receiptRef = 'Receipt reference is required';
  if (nb.paymentMethod === 'Check') { if (!nb.checkNo.trim()) errs.checkNo = 'Check number is required'; if (!nb.checkBank.trim()) errs.checkBank = 'Bank is required'; if (!nb.checkDate) errs.checkDate = 'Check date is required'; }
  if (nb.paymentMethod === 'Bank transfer' && !nb.bankRef.trim()) errs.bankRef = 'Bank reference is required';
  const e =(k: string) => (tried ? errs[k] : undefined) ?? fieldError(record.error, k);
  return (
    <Modal open onClose={onClose} title="Record cash bond" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={record.isPending} onClick={() => { setTried(true); if (!Object.keys(errs).length) record.mutate(undefined); }}>Save</Button></>}>
      <Stack>
        {tried && Object.keys(errs).length > 0 && <Banner tone="danger">Fix: {Object.values(errs).join(' · ')}.</Banner>}
        <FormGrid>
          <Select label="Client" required value={nb.clientCode} error={e('clientCode')} onChange={(ev) => setNb({ ...nb, clientCode: ev.target.value, contractNo: '' })} placeholder="Select" options={clientOptions} />
          <Select label="Contract" value={nb.contractNo} error={e('contractNo')} onChange={(ev) => setNb({ ...nb, contractNo: ev.target.value })} placeholder={nb.clientCode ? 'Client-level (no contract)' : 'Select a client first'} options={(contracts.data ?? []).map((c) => ({ value: c.contractNo, label: `${c.contractNo} · ${c.status}` }))} hint="The Cash bonds list and contract form treat the bond as per contract; per-client bonds are pending the client's decision." />
          <AmountField label="Amount" required value={nb.amount} error={e('amount')} onChange={(n) => setNb({ ...nb, amount: n })} hint={`Baseline ${formatPhp(Number(setting('clt.cash_bond_default') ?? 20000))}`} />
          <Input label="Date received" type="date" required max={today} value={nb.dateReceived} error={e('dateReceived')} onChange={(ev) => setNb({ ...nb, dateReceived: ev.target.value })} />
          <Select label="Payment method" required value={nb.paymentMethod} onChange={(ev) => setNb({ ...nb, paymentMethod: ev.target.value })} options={['Cash', 'Check', 'Bank transfer'].map((x) => ({ value: x, label: x }))} />
          {nb.paymentMethod === 'Check' && <>
            <Input label="Check number" required value={nb.checkNo} error={e('checkNo')} onChange={(ev) => setNb({ ...nb, checkNo: ev.target.value })} placeholder="e.g. 004512" />
            <Input label="Bank" required value={nb.checkBank} error={e('checkBank')} onChange={(ev) => setNb({ ...nb, checkBank: ev.target.value })} placeholder="e.g. BDO" />
            <Input label="Check date" type="date" required value={nb.checkDate} error={e('checkDate')} onChange={(ev) => setNb({ ...nb, checkDate: ev.target.value })} hint="Clearing is confirmed by Treasury" />
          </>}
          {/* Review 1.2: bank-transfer reference (bank and transaction number). */}
          {nb.paymentMethod === 'Bank transfer' && <Input label="Bank / transfer reference" required value={nb.bankRef} error={e('bankRef')} onChange={(ev) => setNb({ ...nb, bankRef: ev.target.value })} placeholder="e.g. BDO-TRX-000123" hint="The transfer date is the date received" />}
          <Select label="Bond type" value={nb.bondType} onChange={(ev) => setNb({ ...nb, bondType: ev.target.value as typeof nb.bondType })} options={['New', 'Top-up', 'Replacement'].map((x) => ({ value: x, label: x }))} hint="Top-up / replacement when a bond is already on file (rule pending confirmation)" />
          <ReadField label="Branch">{clientBranch ? `${branchName(clientBranch)} (from the client)` : 'From the client'}</ReadField>
          <Input label="Receipt reference (OR / PR no.)" required value={nb.receiptRef} error={e('receiptRef')} onChange={(ev) => setNb({ ...nb, receiptRef: ev.target.value })} placeholder="OR-MNL-00000000" />
          <FilePick label="Receipt scan" accept=".pdf,image/*" fileName={nb.receiptFile} onPick={(n) => setNb({ ...nb, receiptFile: n })} hint="Optional — PDF or image" />
          <ReadField label="Received by">{userName(user?.userId)} <span className="text-xs text-muted">(you — signed in)</span></ReadField>
        </FormGrid>
        <Textarea label="Notes" value={nb.notes} onChange={(ev) => setNb({ ...nb, notes: ev.target.value })} placeholder="Anything worth noting about this cash bond" />
        {existing && <Banner tone="warning" title="A bond is already on file">{existing.contractNo ? `${existing.contractNo}` : 'This client'} already has a {existing.status} bond of {formatPhp(existing.amount)} ({existing.receiptRef}). Record another only for a top-up or a separate contract.</Banner>}
        <p className="text-xs text-muted">Saved with status Held: untouched security, kept separate from the e-wallet and not usable for charges until a withdrawal is approved.</p>
        {record.error && !fieldError(record.error, 'amount') && <Banner tone="danger">{errMessage(record.error)}</Banner>}
      </Stack>
    </Modal>
  );
}
