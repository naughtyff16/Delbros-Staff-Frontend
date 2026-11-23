import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, CheckCircle2, FilePlus2, Info, ListChecks, PackageCheck, Paperclip, Plus, Save, Trash2, Wallet } from 'lucide-react';
import { api } from '../../lib/api-client';
import { addDays, formatDate, formatDateTime, formatPhp, manilaDay, paymentRequestType, poApprovalTier, todayManila } from '../../lib/shared';
import {
  ApprovalTimeline, Badge, Banner, Button, Card, CardHeader, DataTable, DateRangeFilter, Drawer, FormGrid, Input, KeyValueGrid, Modal, MoneyInput, MoneyText, PageHeader, ReadField, Select, Stack, StatusBadge, Tabs, Textarea, cn,
} from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, fieldError, useAction, useData, useRefLookups } from '../../shared/hooks';

type Overview = Awaited<ReturnType<typeof api.procurement.overview>>;
type PrRow = Overview['prs'][number];
type PoRow = Overview['pos'][number];

// Multi-entity. Entity master list to be confirmed with Finance (codes for Nakamura / KNEX are proposed).
// Staff review 1.2: Nakamura uses the same code as the stock ledger and Admin master list (NAK, was NKM here).
const ENTITIES = [{ value: 'DBL', label: 'Delbros Leasing' }, { value: 'NAK', label: 'Nakamura' }, { value: 'KNEX', label: 'KNEX' }];
const entityName = (c?: string) => ENTITIES.find((e) => e.value === c)?.label ?? c ?? '—';
const DEPTS = ['Operations', 'Repair & Maintenance', 'Admin', 'Finance', 'Sales'].map((x) => ({ value: x, label: x }));
// Staff review 1.2: the three stockrooms on the stock ledger (WH-DVO was missing).
const WAREHOUSES = [{ value: 'WH-MNL', label: 'WH-MNL — Manila Yard' }, { value: 'WH-CEB', label: 'WH-CEB — Cebu Depot' }, { value: 'WH-DVO', label: 'WH-DVO — Davao Depot' }];
/** Routing gates in order (prc.pr_routing default) with the role that acts on each. */
const PR_GATES: { label: string; role: string }[] = [{ label: 'Dept Head', role: 'DEPT_HEAD' }, { label: 'Admin', role: 'APS_MANAGER' }, { label: 'APS', role: 'APS_OFFICER' }];
// Expense categories are a proposed list until Accounting supplies the chart of accounts (Q-PRC-COA).
const EXPENSE_CATEGORIES = ['Repairs & maintenance supplies', 'Spare parts (inventory)', 'Fuel & oil', 'Transportation', 'Office supplies', 'Utilities', 'Representation', 'Miscellaneous'].map((x) => ({ value: x, label: x }));
const MATCH_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { Matched: 'success', 'Awaiting RR': 'warning', 'Awaiting invoice': 'warning', 'No RR yet': 'warning', Variance: 'danger', 'No PO': 'danger' };
const fileNames = (l: FileList | null) => (l ? Array.from(l).map((f) => f.name) : []);
/** Enabled primary + inline validation on submit: move focus to the first invalid field. */
const focusFirstError = () => setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);

/** Styled file picker (replaces the native “Choose files” control). */
function FilePicker({ label, hint, files, onAdd, onRemove }: { label: string; hint: string; files: string[]; onAdd: (names: string[]) => void; onRemove: (name: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-[13px] font-medium text-ink-2">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-2 hover:border-brand-300 focus-within:ring-3 focus-within:ring-brand-100">
          <Paperclip className="size-4" aria-hidden />Add files
          <input type="file" multiple className="sr-only" onChange={(e) => { onAdd(fileNames(e.target.files)); e.target.value = ''; }} />
        </label>
        {files.map((n) => <Badge key={n} tone="neutral" dot={false}>{n}<button type="button" aria-label={`Remove ${n}`} className="ml-1 text-muted hover:text-danger" onClick={() => onRemove(n)}>×</button></Badge>)}
        {!files.length && <span className="text-xs text-muted">{hint}</span>}
      </div>
    </div>
  );
}

/** Current approval step, pending approver and escalation flag. */
function StepCell({ r }: { r: { status: string; currentStep?: string; pendingApprovers: string[]; escalated: boolean; stepNo?: number; stepCount?: number; waitingSince?: string } }) {
  const waited = r.waitingSince ? Math.max(0, Math.floor((Date.now() - new Date(r.waitingSince).getTime()) / 86_400_000)) : undefined;
  return (
    <div className="min-w-40"><StatusBadge domain="po" value={r.status} />
      {r.currentStep && <p className="mt-0.5 text-xs text-muted">{r.stepNo && r.stepCount ? `Step ${r.stepNo} of ${r.stepCount} · ` : ''}At: {r.currentStep}{r.pendingApprovers.length ? ` · ${r.pendingApprovers.join(', ')}` : ''}</p>}
      {r.currentStep && waited != null && <p className="text-xs text-muted">Waiting {waited === 0 ? 'less than a day' : `${waited} day${waited === 1 ? '' : 's'}`}</p>}
      {r.escalated && <Badge tone="danger" className="mt-0.5" icon={<AlertTriangle className="size-3" />}>Escalated — no action in time</Badge>}</div>
  );
}

// ── SCR-30 PR/PO · SCR-31 Receiving Report · SCR-32 RFP/PCV · vendor invoices (from SCR-33 portal) ───
export function ProcurementPage() {
  const data = useData(['procurement'], () => api.procurement.overview());
  const { userName, setting } = useRefLookups();
  const { can } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') ?? 'pr');
  const [newPr, setNewPr] = useState<PrRow | true | null>(null);
  const [prDetail, setPrDetail] = useState<string | null>(params.get('pr'));
  const [convert, setConvert] = useState<string | null>(null);
  const [receive, setReceive] = useState<string | null>(null);
  const [pay, setPay] = useState<{ po?: string; payee?: string; amount?: number } | null>(null);
  const [poDetail, setPoDetail] = useState<string | null>(null);
  const [wf, setWf] = useState<string | null>(null);
  const [f, setF] = useState({ status: '', department: '', entity: '', from: '', to: '', approver: '' });
  const markPaid = useAction((no: string) => api.procurement.markPaid(no), { success: 'Marked paid' });
  const invStatus = useAction((a: { id: string; s: 'Under Review' | 'Approved' | 'Rejected' | 'Paid' }) => api.procurement.setInvoiceStatus(a.id, a.s), { success: 'Vendor invoice updated' });
  const d = data.data;
  const threshold = Number(setting('prc.po_tier_threshold') ?? 250000);
  const pcvMax = Number(setting('fin.pcv_max') ?? 4000);
  const prs = useMemo(() => (d?.prs ?? []).filter((p) => (!f.status || p.status === f.status) && (!f.department || p.department === f.department) && (!f.entity || p.entityCode === f.entity)
    && (!f.from || p.createdAt.slice(0, 10) >= f.from) && (!f.to || p.createdAt.slice(0, 10) <= f.to) && (!f.approver || p.pendingApprovers.includes(f.approver)))
    // Related values share a cell so each table fits the page; these text keys keep the CSV export and search complete.
    .map((p) => ({ ...p, prText: [p.prNo, p.createdAt.slice(0, 10), p.poNo].filter(Boolean).join(' · '), deptText: [p.department, userName(p.requestedBy), entityName(p.entityCode)].filter(Boolean).join(' · ') })), [d, f, userName]);
  const pos = useMemo(() => d?.pos.map((p) => ({ ...p, poText: `${p.poNo} · ${p.prNo}`, vendorText: `${p.vendorName ?? '—'} · ${entityName(p.entityCode)}`, deliveryText: `${p.deliveryDate?.slice(0, 10) ?? '—'} · ${p.terms ?? '—'}` })), [d]);
  const rrs = useMemo(() => d?.rrs.map((r) => ({ ...r, receivedText: `${r.receivedDate?.slice(0, 10) ?? '—'} · ${userName(r.receivedBy)}` })), [d, userName]);
  const [moreOpen, setMoreOpen] = useState(false);
  const approvers = [...new Set((d?.prs ?? []).flatMap((p) => p.pendingApprovers))].map((x) => ({ value: x, label: x }));
  const openPo = (no: string) => { setTab('po'); setPoDetail(no); };
  const myQueue = useData(['approvals'], () => api.inbox.approvals());
  const mine = (wfId?: string) => !!wfId && !!myQueue.data?.pending.some((w) => w.id === wfId);
  const rules = `PR → Dept Head → Admin → APS → final approval (up to ${formatPhp(threshold)}: APS/MMG Manager; above: CEO + CHRO). Receiving is three-way matched (PO · RR · invoice); payment is held until the match passes. Payments above ${formatPhp(pcvMax)} use RFP, otherwise Petty Cash Voucher.`;
  return (
    <>
      <PageHeader title="Procurement" meta={<span tabIndex={0} aria-label={rules} title={rules} className="inline-flex cursor-help items-center gap-1 text-xs text-muted"><Info className="size-4" aria-hidden />Approval rules</span>} description="Purchase requests, purchase orders, receiving reports and payment requests in one place."
        actions={<>{can('prc.pr', 'add') && <Button icon={<FilePlus2 className="size-4" />} onClick={() => setNewPr(true)}>New purchase request</Button>}{can('prc.payment', 'add') && <Button variant="secondary" icon={<Wallet className="size-4" />} onClick={() => setPay({})}>New RFP / PCV</Button>}</>} />
      {data.isError && <Banner className="mb-4" tone="danger" title="Procurement data could not be loaded">{errMessage(data.error)}</Banner>}
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'pr', label: 'Purchase requests', count: d?.prs.length }, { id: 'po', label: 'Purchase orders', count: d?.pos.length }, { id: 'rr', label: 'Receiving reports', count: d?.rrs.length }, { id: 'pay', label: 'RFP / PCV', count: d?.payments.length }, { id: 'vi', label: 'Vendor invoices', count: d?.vendorInvoices.length }]} />
      <p className="-mt-2 mb-3 text-xs text-muted">Tab counts include every record, open and closed.</p>
      {tab === 'pr' && <DataTable data={prs} loading={data.isLoading} exportName="purchase-requests" emptyTitle="No purchase requests" emptyHint="Adjust the filters or create a new purchase request." onRowClick={(r) => setPrDetail(r.prNo)}
        toolbar={<><Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" options={['Draft', 'For Approval', 'Approved', 'Converted', 'Rejected'].map((x) => ({ value: x, label: x }))} />
          <Select aria-label="Department" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} placeholder="All departments" options={DEPTS} />
          <DateRangeFilter label="Requested" from={f.from} to={f.to} onChange={(r) => setF({ ...f, ...r })} />
          <Button size="sm" variant="secondary" className="h-9" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>{moreOpen ? 'Fewer filters' : 'More filters'}{[f.entity, f.approver].filter(Boolean).length > 0 && ` (${[f.entity, f.approver].filter(Boolean).length})`}</Button>
          {moreOpen && <>
            <Select aria-label="Entity" value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })} placeholder="All entities" options={ENTITIES} />
            <Select aria-label="Pending approver" value={f.approver} onChange={(e) => setF({ ...f, approver: e.target.value })} placeholder="Any approver" options={approvers} />
          </>}</>}
        columns={[
          { accessorKey: 'prText', header: 'PR no. / date', cell: (c) => { const r = c.row.original; return <div className="whitespace-nowrap"><p className="font-mono font-medium">{r.prNo}</p><p className="text-xs text-muted">{formatDate(r.createdAt)}</p>{r.poNo && <p className="text-xs text-muted">PO <button className="font-mono text-brand-700 hover:underline" onClick={(e) => { e.stopPropagation(); openPo(r.poNo!); }}>{r.poNo}</button></p>}</div>; } },
          { accessorKey: 'status', header: 'Status / current step', cell: (c) => <StepCell r={c.row.original} /> },
          { accessorKey: 'deptText', header: 'Department / requester', cell: (c) => { const r = c.row.original; return <div><p>{r.department}</p><p className="text-xs text-muted">{userName(r.requestedBy)} · {entityName(r.entityCode)}</p></div>; } },
          { accessorKey: 'justification', header: 'Justification', cell: (c) => <span className="line-clamp-2 block min-w-48 max-w-xs" title={c.getValue<string>()}>{c.getValue<string>()}</span> },
          { accessorKey: 'supplierName', header: 'Supplier', cell: (c) => c.getValue<string>() ?? <span className="text-muted">At PO stage</span> }, { accessorKey: 'itemCount', header: 'Items', meta: { align: 'right' } },
          { accessorKey: 'total', header: 'Est. total', meta: { align: 'right' }, cell: (c) => <div className="flex flex-col items-end gap-0.5 whitespace-nowrap"><span>{formatPhp(c.getValue<number>())}</span><span title="Final approver for this amount"><Badge tone={c.row.original.total > threshold ? 'purple' : 'neutral'} dot={false}>Final: {poApprovalTier(c.row.original.total, threshold).tier}</Badge></span></div> },
          { id: 'a', header: '', cell: (c) => { const r = c.row.original; return <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {r.workflowId && mine(r.workflowId) && <Button size="sm" onClick={() => setPrDetail(r.prNo)}>Approve / reject</Button>}
            {r.status === 'Draft' && can('prc.pr', 'add') && <Button size="sm" variant="secondary" onClick={() => setNewPr(r)}>Continue draft</Button>}
            {r.status === 'Approved' && can('prc.po', 'add') && <Button size="sm" onClick={() => setConvert(r.prNo)}>Convert to PO</Button>}
            {r.workflowId && !mine(r.workflowId) && <Button size="sm" variant="secondary" aria-label={`View ${r.prNo}`} title="View details and approvals" onClick={() => setPrDetail(r.prNo)}>View</Button>}
          </div>; } }]} />}
      {tab === 'po' && <DataTable data={pos} loading={data.isLoading} exportName="purchase-orders" emptyTitle="No purchase orders" emptyHint="POs are created by converting an approved PR." onRowClick={(r) => setPoDetail(r.poNo)} columns={[
        { accessorKey: 'poText', header: 'PO no. / PR', cell: (c) => <div className="whitespace-nowrap"><p className="font-mono font-medium">{c.row.original.poNo}</p><p className="font-mono text-xs text-muted">{c.row.original.prNo}</p></div> },
        { accessorKey: 'vendorText', header: 'Vendor / entity', cell: (c) => <div><p>{c.row.original.vendorName ?? '—'}</p><p className="text-xs text-muted">{entityName(c.row.original.entityCode)}</p></div> },
        { accessorKey: 'deliveryText', header: 'Delivery / terms', cell: (c) => <div className="whitespace-nowrap"><p>{formatDate(c.row.original.deliveryDate)}</p><p className="text-xs text-muted">{c.row.original.terms ?? '—'}</p></div> },
        { id: 'tally', header: 'Delivered / ordered', cell: (c) => { const r = c.row.original; return <div className="whitespace-nowrap"><p className={cn('tabular', r.qtyDelivered > 0 && r.qtyDelivered < r.qtyOrdered && 'font-medium text-warning')}>{r.qtyDelivered} / {r.qtyOrdered}{r.qtyDelivered > 0 && r.qtyDelivered < r.qtyOrdered ? ' · partial' : ''}</p><p className="text-xs text-muted">{r.lines.length} line{r.lines.length === 1 ? '' : 's'}</p></div>; } },
        { accessorKey: 'total', header: 'PO value', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) }, { accessorKey: 'invoiced', header: 'Invoiced', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) },
        { accessorKey: 'matchStatus', header: '3-way match', cell: (c) => <Badge tone={MATCH_TONE[c.getValue<string>()] ?? 'neutral'}>{c.getValue<string>()}</Badge> },
        { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge domain="po" value={c.getValue<string>()} /> },
        { id: 'a', header: '', cell: (c) => <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>{['Issued', 'Partially Received', 'On Hold'].includes(c.row.original.status) && can('prc.rr', 'add') && <Button size="sm" icon={<PackageCheck className="size-4" />} onClick={() => setReceive(c.row.original.poNo)}>Receive</Button>}<Button size="sm" variant="ghost" className="px-2" aria-label={`Lines and tally for ${c.row.original.poNo}`} title="Lines & tally" icon={<ListChecks className="size-4" />} onClick={() => setPoDetail(c.row.original.poNo)} /></div> }]} />}
      {tab === 'rr' && <DataTable data={rrs} loading={data.isLoading} exportName="receiving-reports" emptyTitle="No receiving reports" emptyHint="Use Receive on an issued PO to record a delivery." columns={[
        { accessorKey: 'rrNo', header: 'RR no.', cell: (c) => <span className="font-mono font-medium">{c.getValue<string>()}</span> }, { accessorKey: 'poNo', header: 'PO ref.', cell: (c) => <button className="font-mono text-brand-700 hover:underline" onClick={(e) => { e.stopPropagation(); openPo(c.getValue<string>()); }}>{c.getValue<string>()}</button> },
        { accessorKey: 'receivedText', header: 'Received / by', cell: (c) => <div className="whitespace-nowrap"><p>{formatDate(c.row.original.receivedDate)}</p><p className="text-xs text-muted">{userName(c.row.original.receivedBy)}</p></div> }, { accessorKey: 'warehouseCode', header: 'Warehouse' },
        { accessorKey: 'itemsReceived', header: 'Items', meta: { align: 'right' } }, { accessorKey: 'qtyReceived', header: 'Qty received', meta: { align: 'right' } }, { accessorKey: 'qtyRejected', header: 'Qty rejected', meta: { align: 'right' } },
        { accessorKey: 'qtyVariance', header: 'Variance vs PO', meta: { align: 'right' }, cell: (c) => <span className={cn('tabular', c.getValue<number>() !== 0 && 'font-semibold text-danger')}>{c.getValue<number>()}</span> },
        { accessorKey: 'discrepancy', header: 'Discrepancy', cell: (c) => (c.getValue() ? <Badge tone="danger">Variance</Badge> : <Badge tone="success">Matched qty</Badge>) }, { accessorKey: 'conditionNotes', header: 'Notes' }]} />}
      {tab === 'pay' && <DataTable data={d?.payments} loading={data.isLoading} exportName="payment-requests" emptyTitle="No payment requests" columns={[
        { accessorKey: 'docNo', header: 'Doc no.', cell: (c) => <span className="font-mono">{c.getValue<string>()}</span> }, { accessorKey: 'type', header: 'Type', cell: (c) => <Badge tone={c.getValue() === 'RFP' ? 'brand' : 'neutral'} dot={false}>{c.getValue<string>()}</Badge> },
        { accessorKey: 'fundingSource', header: 'Funding source' }, { id: 'ref', header: 'Reference', cell: (c) => c.row.original.referenceType === 'Justification' ? <span className="text-muted">Non-PO</span> : `${c.row.original.referenceType} ${c.row.original.referenceId}` },
        { accessorKey: 'payee', header: 'Payee' }, { accessorKey: 'department', header: 'Department', cell: (c) => c.getValue<string>() ?? '—' }, { accessorKey: 'entityCode', header: 'Entity', cell: (c) => entityName(c.getValue<string>()) },
        { accessorKey: 'amount', header: 'Amount', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) },
        { accessorKey: 'dueDate', header: 'Due', cell: (c) => { const v = c.getValue<string>(); if (!v) return '—'; const soon = new Date(v).getTime() - Date.now() < 14 * 86400000; return <span className={cn(soon && c.row.original.status !== 'Paid' && 'font-medium text-warning')}>{formatDate(v)}</span>; } },
        { accessorKey: 'status', header: 'Approval status', cell: (c) => <StepCell r={c.row.original} /> },
        { id: 'a', header: '', cell: (c) => <div className="flex gap-1">{c.row.original.workflowId && (mine(c.row.original.workflowId) ? <Button size="sm" onClick={() => setWf(c.row.original.workflowId!)}>Approve / reject</Button> : <Button size="sm" variant="secondary" onClick={() => setWf(c.row.original.workflowId!)}>View</Button>)}{['Approved', 'For Approval'].includes(c.row.original.status) && can('prc.payment', 'edit') && <Button size="sm" variant="success" onClick={() => markPaid.mutate(c.row.original.docNo)}>Mark paid</Button>}</div> }]} />}
      {tab === 'vi' && <DataTable data={d?.vendorInvoices} loading={data.isLoading} exportName="vendor-invoices" emptyTitle="No vendor invoices" columns={[
        { accessorKey: 'invoiceNo', header: 'Invoice no.' }, { accessorKey: 'vendorId', header: 'Vendor', cell: (c) => d?.vendors.find((v) => v.vendorId === c.getValue())?.name }, { accessorKey: 'poNo', header: 'PO', cell: (c) => <button className="font-mono text-brand-700 hover:underline" onClick={() => openPo(c.getValue<string>())}>{c.getValue<string>()}</button> },
        { accessorKey: 'invoiceDate', header: 'Date', cell: (c) => formatDate(c.getValue<string>()) }, { accessorKey: 'amount', header: 'Amount', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) },
        { accessorKey: 'fileName', header: 'File', cell: (c) => c.getValue() ? <span className="flex items-center gap-1 text-xs"><Paperclip className="size-3" />{c.getValue<string>()}</span> : '—' },
        { accessorKey: 'submittedVia', header: 'Via', cell: (c) => <Badge tone={c.getValue() === 'Portal' ? 'purple' : 'neutral'} dot={false}>{c.getValue<string>()}</Badge> },
        { accessorKey: 'matchStatus', header: '3-way match', cell: (c) => <Badge tone={MATCH_TONE[c.getValue<string>()] ?? 'neutral'}>{c.getValue<string>()}</Badge> },
        { accessorKey: 'paymentHeld', header: 'Payment', cell: (c) => (c.getValue() ? <Badge tone="danger">Held until match passes</Badge> : c.row.original.status === 'Rejected' ? '—' : <Badge tone="success">Released for RFP</Badge>) },
        { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge domain="po" value={c.getValue<string>()} /> },
        { id: 'a', header: '', cell: (c) => ['Submitted', 'Under Review'].includes(c.row.original.status) && can('prc.payment', 'edit') ? <div className="flex gap-1"><Button size="sm" variant="secondary" disabled={c.row.original.paymentHeld} title={c.row.original.paymentHeld ? 'Held: PO · RR · invoice do not match yet' : undefined} onClick={() => invStatus.mutate({ id: c.row.original.id, s: 'Approved' })}>Approve</Button><Button size="sm" variant="secondary" className="text-danger" onClick={() => invStatus.mutate({ id: c.row.original.id, s: 'Rejected' })}>Reject</Button></div> : null }]} />}
      {tab === 'vi' && <p className="mt-3 text-xs text-muted">An invoice received before its receiving report (advance or unmatched invoice) stays “Held” — approval and RFP are blocked until PO, RR and invoice agree. Whether advance invoices are allowed at all is pending client confirmation.</p>}

      {newPr && <NewPrModal draft={newPr === true ? undefined : newPr} onClose={() => setNewPr(null)} />}
      {prDetail && <PrDrawer prNo={prDetail} onClose={() => setPrDetail(null)} onOpenPo={(no) => { setPrDetail(null); openPo(no); }} onConvert={(no) => { setPrDetail(null); setConvert(no); }} />}
      {convert && <ConvertModal prNo={convert} onClose={() => setConvert(null)} />}
      {receive && <ReceiveModal poNo={receive} onClose={() => setReceive(null)} />}
      {pay && <PaymentModal init={pay} onClose={() => setPay(null)} />}
      {poDetail && <PoDrawer poNo={poDetail} onClose={() => setPoDetail(null)} onPay={(po, payee, amount) => { setPoDetail(null); setPay({ po, payee, amount }); }} />}
      {wf && <WorkflowDrawer wfId={wf} onClose={() => setWf(null)} />}
    </>
  );
}

/** Approve / reject with comment from the record itself (same engine as the Inbox — segregation of duties applies). */
function ApprovalPanel({ wfId, onDone }: { wfId: string; onDone?: () => void }) {
  const { userName, setting } = useRefLookups();
  const wf = useData(['wf', wfId], () => api.inbox.workflow(wfId));
  const ap = useData(['approvals'], () => api.inbox.approvals());
  const [comment, setComment] = useState('');
  const canAct = !!ap.data?.pending.some((w) => w.id === wfId);
  const decide = useAction((dec: 'Approved' | 'Rejected') => api.inbox.decide(wfId, dec, comment), { success: (w) => `${w.title}: ${w.status === 'Pending' ? 'step approved — routed to next approver' : w.status.toLowerCase()}`, onSuccess: () => { setComment(''); onDone?.(); } });
  if (!wf.data) return null;
  const step = wf.data.steps[wf.data.currentStep];
  return (
    <Card className="bg-surface-alt/40"><CardHeader title="Approval routing" description={wf.data.status === 'Pending' && step ? <>At <strong>{step.label}</strong>{step.dueAt && <> · escalates {formatDateTime(step.dueAt)} if no action ({Number(setting('wf.escalation_hours') ?? 48)} h)</>}</> : `Workflow ${wf.data.status.toLowerCase()}`} />
      <ApprovalTimeline workflow={wf.data} userName={userName} />
      {canAct && <div className="mt-3 space-y-2"><Textarea label="Comment" hint="Required when rejecting. Recorded in the audit trail." placeholder="Comment for the requester (kept in the audit trail)" value={comment} onChange={(e) => setComment(e.target.value)} />
        <div className="flex justify-end gap-2"><Button variant="danger" loading={decide.isPending} disabled={!comment.trim()} onClick={() => decide.mutate('Rejected')}>Reject</Button><Button variant="success" loading={decide.isPending} onClick={() => decide.mutate('Approved')}>Approve</Button></div></div>}
      {!canAct && wf.data.status === 'Pending' && <p className="mt-3 text-xs text-muted">Only the assigned approver for the current step can act (the requester cannot approve their own request).</p>}
    </Card>
  );
}

function WorkflowDrawer({ wfId, onClose }: { wfId: string; onClose: () => void }) {
  const wf = useData(['wf', wfId], () => api.inbox.workflow(wfId));
  return <Drawer open onClose={onClose} title={wf.data?.title ?? 'Approvals'}><ApprovalPanel wfId={wfId} onDone={onClose} /></Drawer>;
}

function PrDrawer({ prNo, onClose, onOpenPo, onConvert }: { prNo: string; onClose: () => void; onOpenPo: (po: string) => void; onConvert: (pr: string) => void }) {
  const d = useData(['procurement'], () => api.procurement.overview());
  const { userName, ref } = useRefLookups();
  const { can } = useAuth();
  const pr = d.data?.prs.find((p) => p.prNo === prNo);
  const vendor = (id?: string) => ref?.vendors.find((v) => v.vendorId === id)?.name;
  return (
    <Drawer open onClose={onClose} title={`Purchase request ${prNo}`} width="max-w-2xl" footer={pr && <>{pr.poNo && <Button variant="secondary" onClick={() => onOpenPo(pr.poNo!)}>Open {pr.poNo}</Button>}{pr.status === 'Approved' && can('prc.po', 'add') && <Button onClick={() => onConvert(pr.prNo)}>Convert to PO</Button>}</>}>
      {!pr ? <p className="text-sm text-muted">{d.isLoading ? 'Loading…' : 'Purchase request not found.'}</p> : <Stack>
        <div className="flex flex-wrap items-center gap-2"><StepCell r={pr} />{pr.poNo && <Badge tone="info">Converted to PO {pr.poNo}</Badge>}</div>
        <KeyValueGrid cols={3} items={[{ label: 'Requester', value: userName(pr.requestedBy) }, { label: 'Request date', value: formatDate(pr.createdAt) }, { label: 'Department', value: pr.department }, { label: 'Entity', value: entityName(pr.entityCode) },
          { label: 'Priority', value: pr.priority ?? 'Normal' }, { label: 'Needed by', value: formatDate(pr.neededBy) }, { label: 'Deliver to', value: pr.deliveryWarehouse ?? '—' }, { label: 'Preferred supplier', value: vendor(pr.supplierId) ?? '—' },
          { label: 'Source job order', value: pr.sourceJo ?? '—' }, { label: 'Stock request / low-stock line', value: pr.stockRef ?? '—' }, { label: 'Attachments', value: pr.attachments?.length ? pr.attachments.join(', ') : '—' },
          { label: 'For chassis / asset', value: pr.forEquipment ?? '—' }, { label: 'Expense category', value: pr.expenseCategory ?? '—' }, { label: 'Cost centre / budget', value: pr.costCenter ?? '—' }, { label: 'Delivery contact', value: pr.deliveryContact ?? '—' }]} />
        <ReadField label="Justification">{pr.justification}</ReadField>
        <table className="w-full text-[13px]"><thead className="bg-surface-alt text-[11px] uppercase text-muted"><tr><th className="px-2 py-2 text-left">Part code · item</th><th className="px-2 py-2">UoM</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Unit price</th><th className="px-2 py-2 text-right">Line total</th><th className="px-2 py-2 text-left">Supplier</th></tr></thead>
          <tbody>{pr.lines.map((l) => <tr key={l.partCode} className="border-t border-line"><td className="px-2 py-1.5"><span className="font-mono">{l.partCode}</span> — {l.description}{l.spec && <p className="text-xs text-muted">{l.spec}</p>}</td><td className="px-2 py-1.5 text-center">{l.uom ?? '—'}</td><td className="px-2 py-1.5 text-right tabular">{l.qty}</td>
            <td className="px-2 py-1.5 text-right tabular">{formatPhp(l.estUnitCost)}{l.priceOverride && <Badge tone="warning" className="ml-1">override</Badge>}</td><td className="px-2 py-1.5 text-right tabular">{formatPhp(l.qty * l.estUnitCost)}</td><td className="px-2 py-1.5">{vendor(l.supplierId) ?? '—'}</td></tr>)}
            <tr className="border-t border-line font-semibold"><td className="px-2 py-1.5" colSpan={4}>Estimated total</td><td className="px-2 py-1.5 text-right tabular">{formatPhp(pr.total)}</td><td /></tr></tbody></table>
        {pr.workflowId ? <ApprovalPanel wfId={pr.workflowId} /> : <Banner tone="info">Draft — not yet routed for approval.</Banner>}
      </Stack>}
    </Drawer>
  );
}

type PrLine = { partCode: string; description: string; uom: string; qty: number; estUnitCost: number; standardCost: number; supplierId: string; spec: string };
const blankLine = (): PrLine => ({ partCode: '', description: '', uom: '', qty: 1, estUnitCost: 0, standardCost: 0, supplierId: '', spec: '' });

function NewPrModal({ onClose, draft }: { onClose: () => void; draft?: PrRow }) {
  const { ref, setting, userName } = useRefLookups();
  const { user } = useAuth();
  const ov = useData(['procurement'], () => api.procurement.overview());
  const [v, setV] = useState({ department: draft?.department ?? 'Operations', justification: draft?.justification ?? '', entityCode: draft?.entityCode ?? 'DBL', sourceJo: draft?.sourceJo ?? '', supplierId: draft?.supplierId ?? '', neededBy: draft?.neededBy ?? '', priority: draft?.priority ?? 'Normal' as 'Normal' | 'Urgent' | 'Critical', deliveryWarehouse: draft?.deliveryWarehouse ?? 'WH-MNL', stockRef: draft?.stockRef ?? '',
    expenseCategory: draft?.expenseCategory ?? '', costCenter: draft?.costCenter ?? '', deliveryContact: draft?.deliveryContact ?? '', forEquipment: draft?.forEquipment ?? '' });
  const [files, setFiles] = useState<string[]>(draft?.attachments ?? []);
  const [lines, setLines] = useState<PrLine[]>(draft?.lines.map((l) => ({ partCode: l.partCode, description: l.description, uom: l.uom ?? '', qty: l.qty, estUnitCost: l.estUnitCost, standardCost: l.standardCost ?? l.estUnitCost, supplierId: l.supplierId ?? '', spec: l.spec ?? '' })) ?? [blankLine()]);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const threshold = Number(setting('prc.po_tier_threshold') ?? 250000);
  const total = lines.reduce((a, l) => a + l.qty * l.estUnitCost, 0);
  const tier = poApprovalTier(total, threshold);
  const lineErr = (l: PrLine) => (!l.partCode ? 'Select an item' : !(l.qty > 0) ? 'Quantity must be greater than 0' : undefined);
  const valid = !!v.entityCode && !!v.justification.trim() && lines.length > 0 && lines.every((l) => !lineErr(l));
  const payload = (draftFlag: boolean) => ({ ...v, sourceJo: v.sourceJo || undefined, supplierId: v.supplierId || undefined, neededBy: v.neededBy || undefined, stockRef: v.stockRef || undefined, attachments: files, prNo: draft?.prNo, draft: draftFlag,
    expenseCategory: v.expenseCategory || undefined, costCenter: v.costCenter.trim() || undefined, deliveryContact: v.deliveryContact.trim() || undefined, forEquipment: v.forEquipment.trim() || undefined,
    lines: lines.filter((l) => l.partCode).map((l) => ({ partCode: l.partCode, description: l.description, uom: l.uom, qty: l.qty, estUnitCost: l.estUnitCost, standardCost: l.standardCost, priceOverride: l.estUnitCost !== l.standardCost, supplierId: l.supplierId || undefined, spec: l.spec.trim() || undefined })) });
  const names = (role: string) => (ref?.users ?? []).filter((u) => u.roles.includes(role as never)).map((u) => u.name);
  const pcvMax = Number(setting('fin.pcv_max') ?? 4000);
  const submit = useAction(() => api.procurement.createPr(payload(false)), { success: (no) => `${no} submitted for approval`, onSuccess: (no) => setDone(no) });
  const save = useAction(() => api.procurement.createPr(payload(true)), { success: (no) => `${no} saved as draft`, onSuccess: onClose });
  const setLine = (i: number, p: Partial<PrLine>) => setLines(lines.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const vendorOpts = (ref?.vendors ?? []).map((x) => ({ value: x.vendorId, label: x.name }));
  const prDone = done ? ov.data?.prs.find((p) => p.prNo === done) : undefined;
  if (done) return (
    <Modal open onClose={onClose} title={`${done} submitted`} size="lg" footer={<Button onClick={onClose}>Done</Button>}>
      <Stack>
        <Banner tone="success" title="Routed for approval">PR number {done} · requester {user?.name} · {formatPhp(total)} · final approval {tier.tier}.</Banner>
        {prDone?.currentStep && <p className="text-sm">Notified now: <strong>{prDone.pendingApprovers.join(', ') || '—'}</strong> ({prDone.currentStep}) by in-app notification and email. If no action by <strong>{formatDateTime(prDone.dueAt)}</strong> the step escalates ({Number(setting('wf.escalation_hours') ?? 48)} h).</p>}
        {prDone?.workflow && <ApprovalTimeline workflow={prDone.workflow} userName={userName} />}
      </Stack>
    </Modal>
  );
  return (
    <Modal open onClose={onClose} title={draft ? `Purchase request ${draft.prNo} (draft)` : 'New purchase request'} size="xl" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="secondary" icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save as draft</Button><Button loading={submit.isPending} onClick={() => { setTouched(true); if (valid) submit.mutate(undefined); else focusFirstError(); }}>Submit for approval</Button></>}>
      <Stack>
        <div className="grid grid-cols-3 gap-4 rounded-lg bg-surface-alt px-4 py-3"><ReadField label="PR no.">{draft?.prNo ?? 'Auto-assigned on save (PR-######)'}</ReadField><ReadField label="Requester">{draft ? userName(draft.requestedBy) : user?.name}</ReadField><ReadField label="Request date">{formatDate(draft?.createdAt ?? new Date().toISOString())}</ReadField></div>
        <FormGrid cols={3}>
          <Select label="Requesting department" required value={v.department} onChange={(e) => setV({ ...v, department: e.target.value })} options={DEPTS} />
          <Select label="Entity" required value={v.entityCode} onChange={(e) => setV({ ...v, entityCode: e.target.value })} options={ENTITIES} error={touched && !v.entityCode ? 'Entity is required' : undefined} hint="Entity that owns this purchase — received stock is added to its inventory" />
          <Select label="Priority" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value as typeof v.priority })} options={['Normal', 'Urgent', 'Critical'].map((x) => ({ value: x, label: x }))} />
          <Input label="Needed-by date" type="date" value={v.neededBy} min={todayManila()} onChange={(e) => setV({ ...v, neededBy: e.target.value })} />
          <Select label="Delivery warehouse / branch" value={v.deliveryWarehouse} onChange={(e) => setV({ ...v, deliveryWarehouse: e.target.value })} options={WAREHOUSES} />
          <Select label={<>Preferred supplier <span className="font-normal text-muted">(optional)</span></>} value={v.supplierId} onChange={(e) => setV({ ...v, supplierId: e.target.value })} placeholder="Choose at PO stage" options={vendorOpts} />
          <Select label="Source job order (optional)" value={v.sourceJo} onChange={(e) => setV({ ...v, sourceJo: e.target.value })} placeholder="None" options={(ov.data?.openJos ?? []).map((j) => ({ value: j.joNo, label: `${j.joNo} · ${j.chassisNo} · ${j.status}` }))} />
          <Select wrapperClassName="lg:col-span-2" label="Linked stock request / low-stock line" value={v.stockRef} onChange={(e) => { const s = e.target.value; setV({ ...v, stockRef: s }); const low = ov.data?.lowStock.find((x) => x.ref === s); const p = low && ref?.parts.find((x) => x.partCode === low.partCode); if (p && !lines.some((l) => l.partCode === p.partCode)) setLines([...lines.filter((l) => l.partCode), { ...blankLine(), partCode: p.partCode, description: p.description, uom: p.uom, estUnitCost: p.standardCost, standardCost: p.standardCost, qty: Math.max(1, p.lowStockThreshold * 2 - low.qtyOnHand) }]); }}
            placeholder="None (direct purchase)" options={[...(ov.data?.stockRequests ?? []).map((s) => ({ value: `Stock request ${s.txnNo} · ${s.partCode}`, label: `Stock request ${s.txnNo} · ${s.partCode} × ${s.qty}` })), ...(ov.data?.lowStock ?? []).map((s) => ({ value: s.ref, label: `${s.ref} (on hand ${s.qtyOnHand})` }))]} hint="Where the stock request cannot be filled from inventory, the PR is raised from it." />
          <Input label="For chassis / asset (optional)" value={v.forEquipment} placeholder="e.g. DW-NVL-1011 or AST-FL-001" onChange={(e) => setV({ ...v, forEquipment: e.target.value.toUpperCase() })} suggestions={(ov.data?.equipment ?? []).map((x) => ({ value: x.id, hint: x.label.replace(`${x.id} · `, '') }))} hint="The unit the items are for, if any" />
          <Select label="Expense category" value={v.expenseCategory} onChange={(e) => setV({ ...v, expenseCategory: e.target.value })} placeholder="Select (optional)" options={EXPENSE_CATEGORIES} hint="Proposed list until Accounting confirms the chart of accounts" />
          <Input label="Cost centre / budget" value={v.costCenter} placeholder={`e.g. ${v.department} — ${v.deliveryWarehouse.replace('WH-', '')}`} onChange={(e) => setV({ ...v, costCenter: e.target.value })} hint="Optional — whether a budget check is needed is pending confirmation" />
          <Input label="Delivery contact" value={v.deliveryContact} placeholder="Name and mobile at the receiving warehouse" onChange={(e) => setV({ ...v, deliveryContact: e.target.value })} hint="Payment terms are set on the PO (Convert to PO)" />
        </FormGrid>
        <Textarea label="Justification" required placeholder="Why this is needed — e.g. low stock for open job orders" value={v.justification} onChange={(e) => setV({ ...v, justification: e.target.value })} error={touched && !v.justification.trim() ? 'Justification is required' : undefined} />
        <div>
          <div className="mb-1 hidden grid-cols-[1fr_60px_80px_140px_170px_110px_auto] gap-2 text-[13px] font-medium text-ink-2 lg:grid"><span>Item (part code)<span className="ml-0.5 text-danger" aria-hidden>*</span></span><span>UoM</span><span>Qty<span className="ml-0.5 text-danger" aria-hidden>*</span></span><span>Unit price</span><span>Supplier (line)</span><span className="text-right">Line total</span><span className="w-11" aria-hidden /></div>
          {lines.map((l, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_60px_80px_140px_170px_110px_auto] items-start gap-2">
              <Select aria-label="Item" required value={l.partCode} error={touched ? (l.partCode ? undefined : 'Select an item') : undefined} onChange={(e) => { const p = ref?.parts.find((x) => x.partCode === e.target.value); setLine(i, { partCode: e.target.value, description: p?.description ?? '', uom: p?.uom ?? '', estUnitCost: p?.standardCost ?? 0, standardCost: p?.standardCost ?? 0 }); }} placeholder="Select item" options={(ref?.parts ?? []).map((p) => ({ value: p.partCode, label: `${p.partCode} — ${p.description}` }))} />
              <Input aria-label="Unit of measure" readOnly tabIndex={-1} className="bg-surface-alt text-ink-2" placeholder="auto" value={l.uom} />
              <Input aria-label="Qty" type="number" min={1} required placeholder="Qty" value={l.qty} error={touched && l.partCode && !(l.qty > 0) ? '> 0' : undefined} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
              <div><MoneyInput aria-label="Unit price" value={l.estUnitCost} onChange={(e) => setLine(i, { estUnitCost: Number(e.target.value) })} />
                <p className="mt-0.5 text-[11px] text-muted">{l.partCode ? (l.estUnitCost !== l.standardCost ? <span className="font-medium text-warning">Override · list {formatPhp(l.standardCost)}</span> : 'From standard price list') : ''}</p></div>
              <Select aria-label="Line supplier" value={l.supplierId} onChange={(e) => setLine(i, { supplierId: e.target.value })} placeholder="—" options={vendorOpts} />
              <span className="pt-2 text-right text-sm tabular">{formatPhp(l.qty * l.estUnitCost)}</span>
              <Button variant="ghost" aria-label="Remove" icon={<Trash2 className="size-4" />} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, k) => k !== i))} />
              {l.partCode && <Input wrapperClassName="col-span-6 -mt-1" aria-label="Specification" value={l.spec} placeholder={`Specification for ${l.description || l.partCode} — e.g. brand, size, standard (optional)`} onChange={(e) => setLine(i, { spec: e.target.value })} />}
            </div>
          ))}
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setLines([...lines, blankLine()])}>Add item</Button>
          <p className="mt-1.5 text-xs text-muted">Unit price fills from the standard price list. A changed price is flagged for approvers.</p>
        </div>
        <FilePicker label="Attachments (quotes, specifications)" hint="PDF / image; stored with the PR" files={files} onAdd={(n) => setFiles([...files, ...n.filter((x) => !files.includes(x))])} onRemove={(n) => setFiles(files.filter((x) => x !== n))} />
        <div className={cn('rounded-lg px-4 py-3 text-sm', total > threshold ? 'border border-purple-200 bg-purple-50' : 'bg-surface-alt')}>
          <div className="flex items-center justify-between"><span>Routing: Dept Head → Admin → APS → <strong>{tier.tier}</strong></span><span>Estimated total <strong className="tabular">{formatPhp(total)}</strong></span></div>
          <p className="mt-1 text-xs text-muted">{total > threshold ? <>Above the {formatPhp(threshold)} gate — final approval switches to <strong>CEO + CHRO</strong>.</> : <>Up to {formatPhp(threshold)}: APS/MMG Manager approves. Above it, routing switches to CEO + CHRO.</>} A PO priced above the gate its PR was approved for is refused with “Amount exceeds approver’s gate”.</p>
          <p className="mt-1 text-xs text-muted">Approvers notified at each step: {[...PR_GATES.map((g) => `${g.label}: ${names(g.role).join(', ') || '—'}`), `Final: ${tier.roles.flatMap((r) => names(r)).join(', ') || '—'}`].join(' · ')}. Each step’s decision and time show on the PR after submission.</p>
          {total > 0 && total <= pcvMax && <p className="mt-1 text-xs font-medium text-warning">At or below {formatPhp(pcvMax)}: under BR-10 a small purchase can be paid by Petty Cash Voucher (New RFP / PCV) without a PR. Whether a PR is still required is pending Delbros confirmation.</p>}
        </div>
        {touched && !valid && <Banner tone="danger">Complete the required fields: entity, justification, and an item with a quantity greater than 0 on every line.</Banner>}
        {(submit.error || save.error) && <Banner tone="danger">{errMessage(submit.error ?? save.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

function ConvertModal({ prNo, onClose }: { prNo: string; onClose: () => void }) {
  const { ref, setting } = useRefLookups();
  const d = useData(['procurement'], () => api.procurement.overview());
  const pr = d.data?.prs.find((p) => p.prNo === prNo);
  const [v, setV] = useState({ vendorId: '', terms: '30 days', deliveryDate: manilaDay(addDays(new Date().toISOString(), 7)) }); // Manila calendar day (was the UTC day)
  const [prices, setPrices] = useState<Record<string, number>>({});
  const vendorId = v.vendorId || pr?.supplierId || '';
  const threshold = Number(setting('prc.po_tier_threshold') ?? 250000);
  const poTotal = (pr?.lines ?? []).reduce((a, l) => a + l.qty * (prices[l.partCode] ?? l.estUnitCost), 0);
  const overGate = !!pr && pr.total <= threshold && poTotal > threshold;
  const act = useAction(() => api.procurement.convertToPo(prNo, vendorId, v.terms, v.deliveryDate, prices), { success: (po) => `${po} issued to supplier`, onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Convert ${prNo} to purchase order`} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.isPending} disabled={!vendorId || overGate} onClick={() => act.mutate(undefined)}>Issue PO</Button></>}>
      <Stack>
        <FormGrid cols={3}>
          <Select label="Vendor" required value={vendorId} onChange={(e) => setV({ ...v, vendorId: e.target.value })} placeholder="Select" options={(ref?.vendors ?? []).map((x) => ({ value: x.vendorId, label: x.name }))} />
          <Input label="Terms" placeholder="e.g. 30 days" value={v.terms} onChange={(e) => setV({ ...v, terms: e.target.value })} />
          <Input label="Delivery date" type="date" value={v.deliveryDate} onChange={(e) => setV({ ...v, deliveryDate: e.target.value })} />
        </FormGrid>
        <table className="w-full text-[13px]"><thead className="bg-surface-alt text-[11px] uppercase text-muted"><tr><th className="px-2 py-2 text-left">Item</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2">UoM</th><th className="px-2 py-2 text-right">PO unit price</th><th className="px-2 py-2 text-right">Line total</th></tr></thead>
          <tbody>{(pr?.lines ?? []).map((l) => <tr key={l.partCode} className="border-t border-line"><td className="px-2 py-1.5"><span className="font-mono">{l.partCode}</span> — {l.description}</td><td className="px-2 py-1.5 text-right">{l.qty}</td><td className="px-2 py-1.5 text-center">{l.uom ?? '—'}</td>
            <td className="w-40 px-2 py-1.5"><MoneyInput aria-label="PO unit price" value={prices[l.partCode] ?? l.estUnitCost} onChange={(e) => setPrices({ ...prices, [l.partCode]: Number(e.target.value) })} /></td><td className="px-2 py-1.5 text-right tabular">{formatPhp(l.qty * (prices[l.partCode] ?? l.estUnitCost))}</td></tr>)}
            <tr className="border-t border-line font-semibold"><td className="px-2 py-1.5" colSpan={4}>PO total (PR approved at {formatPhp(pr?.total)})</td><td className="px-2 py-1.5 text-right tabular">{formatPhp(poTotal)}</td></tr></tbody></table>
        <p className="text-xs text-muted">The PO is itemised line by line so vendor invoices and receiving reports reconcile against each line.</p>
        {overGate && <Banner tone="danger" title="Amount exceeds approver’s gate">PO total {formatPhp(poTotal)} is above the {formatPhp(threshold)} gate of the APS/MMG Manager who approved this PR. Re-route the PR to CEO + CHRO or keep the price within the gate.</Banner>}
        {act.error && <Banner tone="danger">{errMessage(act.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

function ReceiveModal({ poNo, onClose }: { poNo: string; onClose: () => void }) {
  const t = api.procurement.tally(poNo);
  const [wh, setWh] = useState('WH-MNL');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState(t.lines.map((l) => ({ partCode: l.partCode, desc: l.description, outstanding: l.qty - l.qtyReceived, qtyReceived: l.qty - l.qtyReceived, qtyRejected: 0, condition: 'Good' })));
  const act = useAction(() => api.procurement.receive(poNo, lines.map(({ partCode, qtyReceived, qtyRejected, condition }) => ({ partCode, qtyReceived, qtyRejected, condition })), wh, notes), {
    success: (r) => `${r.rrNo} recorded${r.discrepancy ? ' — discrepancy flagged' : ''} · PO ${r.poStatus}`, onSuccess: onClose,
  });
  const disc = lines.some((l) => l.qtyRejected > 0 || l.qtyReceived !== l.outstanding);
  const bad = lines.some((l) => l.qtyReceived < 0 || l.qtyRejected < 0) || lines.every((l) => l.qtyReceived === 0 && l.qtyRejected === 0);
  return (
    <Modal open onClose={onClose} title={`Receiving report — ${poNo}`} description="Cross-check against the PO lines. Received quantities post to inventory; partial deliveries keep the PO open." size="xl" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.isPending} disabled={bad} onClick={() => act.mutate(undefined)}>Save receiving report</Button></>}>
      <Stack>
        <Select wrapperClassName="w-60" label="Receiving warehouse" value={wh} onChange={(e) => setWh(e.target.value)} options={WAREHOUSES} />
        <table className="w-full text-[13px]"><thead className="bg-surface-alt text-[11px] uppercase text-muted"><tr><th className="px-2 py-2 text-left">Item</th><th className="px-2 py-2 text-right">Outstanding</th><th className="px-2 py-2">Received</th><th className="px-2 py-2">Rejected</th><th className="px-2 py-2">Condition</th></tr></thead>
          <tbody>{lines.map((l, i) => <tr key={l.partCode} className="border-t border-line"><td className="px-2 py-1.5">{l.partCode} — {l.desc}</td><td className="px-2 py-1.5 text-right tabular">{l.outstanding}</td>
            <td className="px-2 py-1.5"><input type="number" min={0} className="h-8 w-24 rounded-md border border-line-strong px-2 text-right" placeholder="0" value={l.qtyReceived} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qtyReceived: Number(e.target.value) } : x)))} aria-label="Received" /></td>
            <td className="px-2 py-1.5"><input type="number" min={0} className="h-8 w-24 rounded-md border border-line-strong px-2 text-right" placeholder="0" value={l.qtyRejected} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qtyRejected: Number(e.target.value) } : x)))} aria-label="Rejected" /></td>
            <td className="px-2 py-1.5"><select className="h-8 rounded-md border border-line-strong px-2" value={l.condition} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, condition: e.target.value } : x)))} aria-label="Condition"><option>Good</option><option>Damaged</option><option>Wrong item</option></select></td></tr>)}</tbody></table>
        <Textarea label="Condition notes" placeholder="Condition on arrival — e.g. 2 boxes damaged, rest good" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {disc && <Banner tone="warning" title="Discrepancy">Quantity or condition differs from the PO. The PO will be held pending supplier resolution.</Banner>}
        {bad && <Banner tone="danger">Enter a received or rejected quantity (no negative values).</Banner>}
      </Stack>
    </Modal>
  );
}

/** Itemised PO lines, PO tally (ordered vs delivered), RRs and invoices, and the three-way match. */
function PoDrawer({ poNo, onClose, onPay }: { poNo: string; onClose: () => void; onPay: (po: string, payee: string, amount: number) => void }) {
  const d = useData(['procurement'], () => api.procurement.overview());
  const po = d.data?.pos.find((p) => p.poNo === poNo) as PoRow | undefined;
  if (!po) return <Drawer open onClose={onClose} title={poNo}><p className="text-sm text-muted">{d.isLoading ? 'Loading…' : 'PO not found.'}</p></Drawer>;
  const t = api.procurement.tally(poNo);
  const rrs = d.data?.rrs.filter((r) => r.poNo === poNo) ?? [];
  return (
    <Drawer open onClose={onClose} title={`Purchase order ${poNo}`} width="max-w-3xl" footer={t.matched ? <Button onClick={() => onPay(poNo, po.vendorName ?? '', t.invoiced)}>Create RFP</Button> : undefined}>
      <Stack>
        <KeyValueGrid cols={4} items={[{ label: 'Vendor', value: po.vendorName }, { label: 'PR', value: po.prNo }, { label: 'Entity', value: entityName(po.entityCode) }, { label: 'Status', value: <StatusBadge domain="po" value={po.status} /> }, { label: 'Terms', value: po.terms }, { label: 'Delivery', value: formatDate(po.deliveryDate) }, { label: 'Issued', value: formatDate(po.createdAt) }, { label: 'Delivered / ordered', value: `${po.qtyDelivered} / ${po.qtyOrdered}` }]} />
        <table className="w-full text-[13px]"><thead className="bg-surface-alt text-[11px] uppercase text-muted"><tr><th className="px-2 py-2 text-left">Part code · item</th><th className="px-2 py-2 text-right">Ordered</th><th className="px-2 py-2 text-right">Unit price</th><th className="px-2 py-2 text-right">Line total</th><th className="px-2 py-2 text-right">Delivered</th><th className="px-2 py-2 text-right">Outstanding</th><th className="px-2 py-2 text-right">Received value</th></tr></thead>
          <tbody>{t.lines.map((l) => <tr key={l.partCode} className="border-t border-line"><td className="px-2 py-1.5"><span className="font-mono">{l.partCode}</span> — {l.description}</td><td className="px-2 py-1.5 text-right">{l.qty}</td><td className="px-2 py-1.5 text-right tabular">{formatPhp(l.unitPrice)}</td><td className="px-2 py-1.5 text-right tabular">{formatPhp(l.qty * l.unitPrice)}</td>
            <td className="px-2 py-1.5 text-right">{l.qtyReceived}</td><td className={cn('px-2 py-1.5 text-right', l.qtyReceived !== l.qty && 'font-semibold text-danger')}>{l.qty - l.qtyReceived}</td><td className="px-2 py-1.5 text-right tabular">{formatPhp(l.qtyReceived * l.unitPrice)}</td></tr>)}</tbody></table>
        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardHeader title="Three-way match" description="PO · receiving report · vendor invoice" />
            {[['PO value', t.ordered], ['Received value', t.received], ['Vendor invoice(s)', t.invoiced]].map(([l, v]) => <div key={l as string} className="flex justify-between py-1 text-sm"><span>{l}</span><MoneyText value={v as number} /></div>)}
            <div className="mt-2">{t.matched ? <Badge tone="success" icon={<CheckCircle2 className="size-3" />}>Matched — ready for payment</Badge> : <Badge tone="danger">Not matched — payment held</Badge>}</div>
          </Card>
          <Card><CardHeader title="Receiving reports & invoices" />
            <ul className="space-y-1 text-sm">{rrs.map((r) => <li key={r.rrNo} className="flex justify-between"><span className="font-mono">{r.rrNo}</span><span>{formatDate(r.receivedDate)} · {r.qtyReceived} received{r.discrepancy && <Badge tone="danger" className="ml-1">variance</Badge>}</span></li>)}
              {po.invoices.map((i) => <li key={i.id} className="flex justify-between"><span>{i.invoiceNo}</span><span>{formatPhp(i.amount)} · <StatusBadge domain="po" value={i.status} /></span></li>)}
              {!rrs.length && !po.invoices.length && <li className="text-muted">No deliveries or invoices yet.</li>}</ul>
          </Card>
        </div>
      </Stack>
    </Drawer>
  );
}

type PayLine = { description: string; category: string; amount: number; poNo: string; partCode: string };

function PaymentModal({ init, onClose }: { init: { po?: string; payee?: string; amount?: number }; onClose: () => void }) {
  const { setting } = useRefLookups();
  const { user } = useAuth();
  const ov = useData(['procurement'], () => api.procurement.overview());
  const [v, setV] = useState({ referenceType: (init.po ? 'PO' : 'Justification') as 'PO' | 'Justification', payee: init.payee ?? '', dueDate: '', entityCode: 'DBL', justification: '', department: 'Operations' });
  const [lines, setLines] = useState<PayLine[]>([{ description: init.po ? `Payment for ${init.po}` : '', category: init.po ? 'Spare parts (inventory)' : '', amount: init.amount ?? 0, poNo: init.po ?? '', partCode: '' }]);
  const [files, setFiles] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<{ docNo: string; type: string } | null>(null);
  const pcvMax = Number(setting('fin.pcv_max') ?? 4000);
  const esc = Number(setting('wf.escalation_hours') ?? 48);
  const amount = lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const type = paymentRequestType(amount, pcvMax);
  const fund = api.procurement.pettyCash(v.entityCode);
  const pos = ov.data?.pos ?? [];
  const selPos = [...new Set(lines.map((l) => l.poNo).filter(Boolean))];
  const unmatched = selPos.filter((p) => pos.find((x) => x.poNo === p)?.matchStatus !== 'Matched');
  const errs = {
    payee: !v.payee.trim() ? 'Payee is required' : undefined,
    justification: v.referenceType === 'Justification' && !v.justification.trim() ? 'Justification is required for a non-PO payment' : undefined,
    lines: lines.some((l) => !l.description.trim() || !l.category || !(l.amount > 0)) ? 'Each particular needs a description, an expense category and an amount above zero' : v.referenceType === 'PO' && lines.some((l) => !l.poNo) ? 'Allocate every line to a PO' : undefined,
    fund: type === 'PCV' && amount > fund.available ? `Insufficient petty cash fund: ${formatPhp(fund.available)} available` : undefined,
    match: type === 'RFP' && v.referenceType === 'PO' && unmatched.length ? `PO not matched: ${unmatched.join(', ')} — resolve the PO tally first` : undefined,
  };
  const valid = Object.values(errs).every((x) => !x);
  const act = useAction(() => api.procurement.createPayment({ referenceType: v.referenceType, referenceId: v.referenceType === 'PO' ? selPos.join(', ') : '-', payee: v.payee, amount, dueDate: v.dueDate, entityCode: v.entityCode, justification: v.justification || undefined, department: v.department, attachments: files,
    lines: lines.map((l) => ({ description: l.description, category: l.category, amount: Number(l.amount), poNo: v.referenceType === 'PO' ? l.poNo || undefined : undefined, partCode: v.referenceType === 'PO' ? l.partCode || undefined : undefined })) }), { success: (r) => `${r.docNo} (${r.type}) submitted`, onSuccess: (r) => setDone(r) });
  const setLine = (i: number, p: Partial<PayLine>) => setLines(lines.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const route = type === 'RFP' ? 'Department Head → Accounting' : 'Department Head';
  if (done) return (
    <Modal open onClose={onClose} title={`${done.docNo} submitted`} footer={<Button onClick={onClose}>Done</Button>}>
      <Banner tone="success" title={`${done.type} routed for approval`}>{done.docNo} · {formatPhp(amount)} · funding source {done.type === 'PCV' ? 'Petty Cash Fund' : 'Disbursement (check / bank transfer)'}. Approval route: {route}. The Department Head is notified now (in-app + email); the step escalates after {esc} h without action.</Banner>
    </Modal>
  );
  return (
    <Modal open onClose={onClose} title={`Request for payment / petty cash — ${type === 'RFP' ? 'RFP' : 'PCV'}`} size="xl" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={act.isPending} onClick={() => { setTouched(true); if (valid) act.mutate(undefined); else focusFirstError(); }}>Submit {type}</Button></>}>
      <Stack>
        <Banner tone={type === 'RFP' ? 'warning' : 'info'} title={`Type: ${type === 'RFP' ? 'Request for Payment (RFP)' : 'Petty Cash Voucher (PCV)'}`}>Chosen automatically from the amount — above {formatPhp(pcvMax)} uses RFP. Funding source: <strong>{type === 'PCV' ? 'Petty Cash Fund' : 'Disbursement (check / bank transfer)'}</strong>. Approval route: <strong>{route}</strong>; escalates after {esc} h with no approver action. RFPs against a PO require a matched PO tally.</Banner>
        <div className="grid grid-cols-3 gap-4 rounded-lg bg-surface-alt px-4 py-3"><ReadField label="Request no.">{`Auto-assigned on save (${type}-######)`}</ReadField><ReadField label="Requester">{user?.name ?? '—'}</ReadField><ReadField label="Request date">{formatDate(new Date().toISOString())}</ReadField></div>
        <FormGrid cols={3}>
          <Select label="Requesting department" required value={v.department} onChange={(e) => setV({ ...v, department: e.target.value })} options={DEPTS} />
          <Select label="Entity" required value={v.entityCode} onChange={(e) => setV({ ...v, entityCode: e.target.value })} options={ENTITIES} hint="Company that pays this request" />
          <Input label="Payee" required placeholder="Supplier or employee, e.g. Tire Pro Supply" hint="A supplier or an employee — not a client" value={v.payee} onChange={(e) => setV({ ...v, payee: e.target.value })} error={touched ? errs.payee : undefined} />
          <Select label="Reference type" value={v.referenceType} onChange={(e) => setV({ ...v, referenceType: e.target.value as typeof v.referenceType })} options={[{ value: 'PO', label: 'PO / Receiving report' }, { value: 'Justification', label: 'Justification (non-PO)' }]} />
          <Input label="Due date" type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} hint="Optional. APS and Accounting are notified 2 weeks before." />
        </FormGrid>
        {v.referenceType === 'Justification' && <Textarea label="Justification" required placeholder="Why this payment is needed without a PO" value={v.justification} onChange={(e) => setV({ ...v, justification: e.target.value })} error={touched ? errs.justification : undefined} />}
        <div>
          <p className="mb-1 text-[13px] font-medium text-ink-2">Particulars<span className="ml-0.5 text-danger">*</span> {v.referenceType === 'PO' && <span className="font-normal text-muted">— allocate each line to a PO line (one RFP may cover several POs; a PO may be paid by several RFPs)</span>}</p>
          <div className={cn('mb-1 grid gap-2 text-xs text-muted', v.referenceType === 'PO' ? 'grid-cols-[1fr_190px_150px_170px_130px_auto]' : 'grid-cols-[1fr_220px_150px_auto]')}><span>Description</span><span>Expense category</span><span>Amount</span>{v.referenceType === 'PO' && <><span>PO</span><span>PO line</span></>}<span className="w-11" aria-hidden /></div>
          {lines.map((l, i) => { const po = pos.find((p) => p.poNo === l.poNo); return (
            <div key={i} className={cn('mb-2 grid items-start gap-2', v.referenceType === 'PO' ? 'grid-cols-[1fr_190px_150px_170px_130px_auto]' : 'grid-cols-[1fr_220px_150px_auto]')}>
              <Input aria-label="Description" placeholder="What is being paid for" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
              <Select aria-label="Expense category" value={l.category} onChange={(e) => setLine(i, { category: e.target.value })} placeholder="Expense category" options={EXPENSE_CATEGORIES} />
              <MoneyInput aria-label="Amount" value={l.amount || ''} onChange={(e) => setLine(i, { amount: Number(e.target.value) })} />
              {v.referenceType === 'PO' && <Select aria-label="PO" value={l.poNo} onChange={(e) => setLine(i, { poNo: e.target.value, partCode: '' })} placeholder="PO lookup…" options={pos.map((p) => ({ value: p.poNo, label: `${p.poNo} · ${p.vendorName} · ${p.matchStatus}` }))} />}
              {v.referenceType === 'PO' && <Select aria-label="PO line" value={l.partCode} onChange={(e) => setLine(i, { partCode: e.target.value })} placeholder="Whole PO" options={(po?.lines ?? []).map((x) => ({ value: x.partCode, label: `${x.partCode} (${x.qtyReceived}/${x.qty})` }))} />}
              <Button variant="ghost" aria-label="Remove" icon={<Trash2 className="size-4" />} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, k) => k !== i))} />
            </div>); })}
          <div className={cn('grid items-center gap-2', v.referenceType === 'PO' ? 'grid-cols-[1fr_190px_150px_170px_130px_auto]' : 'grid-cols-[1fr_220px_150px_auto]')}>
            <span><Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setLines([...lines, { description: '', category: lines[0]?.category ?? '', amount: 0, poNo: '', partCode: '' }])}>Add particular</Button></span>
            <span className="text-right text-sm text-muted">Total amount</span>
            <strong className="px-3 text-right text-sm tabular">{formatPhp(amount)}</strong>
          </div>
          {touched && errs.lines && <p className="mt-1 text-xs text-danger">{errs.lines}</p>}
          <p className="mt-1 text-xs text-muted">Expense categories are a proposed list until the chart of accounts is supplied.</p>
        </div>
        {v.referenceType === 'PO' && selPos.length > 0 && <Card className="bg-surface-alt/40"><CardHeader title="PO tally status" />
          <ul className="space-y-1 text-sm">{selPos.map((p) => { const x = pos.find((y) => y.poNo === p); return <li key={p} className="flex justify-between"><span className="font-mono">{p}</span><span>{x ? `${x.qtyDelivered}/${x.qtyOrdered} delivered · invoiced ${formatPhp(x.invoiced)} · ` : ''}<Badge tone={MATCH_TONE[x?.matchStatus ?? 'No PO'] ?? 'neutral'}>{x?.matchStatus ?? 'Unknown PO'}</Badge></span></li>; })}</ul></Card>}
        {type === 'PCV' && <div className={cn('flex items-center justify-between rounded-lg px-4 py-2 text-sm', errs.fund ? 'bg-danger-bg text-danger' : 'bg-surface-alt')}><span>Petty cash fund ({entityName(v.entityCode)}): available <strong className="tabular">{formatPhp(fund.available)}</strong> of {formatPhp(fund.float)} float</span></div>}
        <FilePicker label="Attachments (receipt, invoice, voucher)" hint="PDF / image" files={files} onAdd={(n) => setFiles([...files, ...n.filter((x) => !files.includes(x))])} onRemove={(n) => setFiles(files.filter((x) => x !== n))} />
        {touched && (errs.fund || errs.match) && <Banner tone="danger" title={errs.fund ? 'Insufficient petty cash fund' : 'PO not matched'}>{errs.fund ?? errs.match}</Banner>}
        {act.error && <Banner tone="danger">{errMessage(act.error)}{fieldError(act.error, 'amount') ? ` (${fieldError(act.error, 'amount')})` : ''}</Banner>}
      </Stack>
    </Modal>
  );
}
