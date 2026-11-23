import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { AlertTriangle, Banknote, Calculator, ChevronRight, Download, FileCheck2, FileMinus, Info, Mail, Paperclip, Pencil, Plus, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../../lib/api-client';
import {
  CREDIT_MEMO_CATEGORIES, DEBIT_MEMO_CATEGORIES, addDays, amountInWords, debitMemoTotal, manilaDay, todayManila, formatDate, formatDateTime, formatPhp, memoApprovalChain, round2,
  type Client, type InvoiceLine, type MemoBreakdown,
} from '../../lib/shared';
import {
  ApprovalTimeline, Badge, Banner, Button, Card, CardHeader, Checkbox, ConfirmDialog, DataTable, DateRangeFilter, EmptyState, FormGrid, Input, KeyValueGrid, KpiTile, Modal, MoneyInput, MoneyText, PageHeader, Select, Stack, StatusBadge, Textarea, cn, stripCodes, type ColumnDef,
} from '../../lib/ui';
import { errMessage, fieldError, useAction, useData, useRefLookups } from '../../shared/hooks';
import { Crumb, ScreenTag } from '../../shared/components';
import { DocFooter, DocHeader, PrintPreview, SignatureBlock, Watermark } from '../../shared/print';
import { useAuth } from '../../app/auth';

const today = () => todayManila(); // Manila calendar day (was the UTC day — showed yesterday before 08:00 Manila)
const BILL_TYPES = ['Lease', 'Park & Fix', 'Repair', 'GPS', 'Special', 'Rescue (DM)'];
const ADJ_TYPES = ['Late fee', 'Correction', 'Overbilled correction', 'Special billing'];
const COPIES = ['ORIGINAL – CLIENT COPY', 'DUPLICATE – ACCOUNTING COPY', 'TRIPLICATE – FILE COPY'];
const METHODS = ['Check', 'Cash', 'Bank Transfer', 'Online', 'E-Wallet'];
const opts = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x }));
/** Plain "pending decision" marker — the decision code itself is internal and never shown. */
const Pending = (_: { q?: string }) => <Badge tone="warning" dot={false}>pending decision</Badge>;
const outIn = (l: Pick<InvoiceLine, 'from' | 'to'>) => (l.from ? `${formatDate(l.from)} → ${l.to ? formatDate(l.to) : 'on hire'}` : '');
/** Printed invoice: the dates billed within the period (start/end clamped to the period), so no line reads "on hire". */
const billedDates = (l: Pick<InvoiceLine, 'from' | 'to'>, start: string, end: string) => {
  if (!l.from) return '';
  const f = l.from.slice(0, 10) < start.slice(0, 10) ? start : l.from, t = !l.to || l.to.slice(0, 10) > end.slice(0, 10) ? end : l.to;
  return `${formatDate(f)} → ${formatDate(t)}`;
};
const METHOD_LABEL = (m?: string) => METHODS.find((x) => x.toLowerCase() === (m ?? '').toLowerCase()) ?? m ?? '—';
/** Full CSV export for lists whose on-screen columns are merged to fit the page (every field keeps its own CSV column). */
function ExportCsv<T>({ name, rows, cols }: { name: string; rows: T[]; cols: [string, (r: T) => unknown][] }) {
  const run = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.map(([h]) => esc(h)).join(','), ...rows.map((r) => cols.map(([, f]) => esc(f(r))).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return <Button className="ml-auto h-9 shrink-0" variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={run}>Export</Button>;
}
/** Styled file picker — same pattern as the purchase-request form (replaces the native “Choose files” control). */
function FilePicker({ label, hint, files, onAdd, onClear, error, required = true }: { label: string; hint: string; files: string[]; onAdd: (names: string[]) => void; onClear: () => void; error?: string; required?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-[13px] font-medium text-ink-2">{label} {required && <span className="text-danger">*</span>}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-2 hover:border-brand-300 focus-within:ring-3 focus-within:ring-brand-100">
          <Paperclip className="size-4" aria-hidden />Add files
          <input type="file" multiple className="sr-only" onChange={(e) => { onAdd(Array.from(e.target.files ?? []).map((x) => x.name)); e.target.value = ''; }} />
        </label>
        {files.map((n) => <Badge key={n} tone="neutral" dot={false}>{n}</Badge>)}
        {files.length > 0 && <button type="button" className="text-xs text-muted hover:text-danger" onClick={onClear}>Clear attachments</button>}
        {!files.length && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** BR-05 / DBL-FIN-002/004 line markers shared by the billing run, invoice detail and print. */
function LineMarkers({ l }: { l: InvoiceLine }) {
  return (
    <>
      {l.held && <Badge tone="warning" className="ml-2">held — late encoding {l.lateDays ?? '> 7'}d, {l.heldMemoNo ? <Link className="underline" to={`/billing/memos?memo=${l.heldMemoNo}`} onClick={(e) => e.stopPropagation()} title="Open the credit memo — when it is approved the line is released onto the same invoice and the totals are recalculated">{l.heldMemoNo}</Link> : 'CM'} pending</Badge>}
      {l.recalculated && <Badge tone="info" className="ml-2">auto-recalculated{l.lateDays != null ? ` (late ${l.lateDays}d ≤ 7)` : ''}</Badge>}
      {l.originalDays != null && <Badge tone="purple" className="ml-2">corrected — was {l.originalDays}d × {formatPhp(l.originalRate)}</Badge>}
      {(l.reason || l.by) && l.lineType !== 'Lease' && <span className="ml-2 text-xs text-muted">{l.reason}{l.by ? ` · by ${l.by}` : ''}{l.at ? ` ${formatDateTime(l.at)}` : ''}{l.evidence ? ` · evidence ${l.evidence}` : ''}</span>}
      {l.originalDays != null && <span className="ml-2 text-xs text-muted">{l.reason} · {l.by}</span>}
    </>
  );
}

// ── Printable invoice (DBL-FIN-006): one line per chassis, credit-term wording, client TIN / VAT, payment instructions, signatures ──
interface InvoiceDocData {
  invoiceNo: string; invoiceDate: string; dueDate: string; periodStart: string; periodEnd: string; contractNo?: string; creditTermDays: number; billingCycle?: string; batchNo?: string; billType?: string;
  lines: InvoiceLine[]; subtotal: number; vat: number; total: number; clientCode: string; clientRef?: string; remarks?: string;
}
function InvoiceDocument({ inv, client, copy, watermark, reprint, instructions, preparedBy, eqName }: { inv: InvoiceDocData; client?: Partial<Client>; copy: string; watermark?: string; reprint?: number; instructions?: string; preparedBy?: string; eqName: (c?: string) => string }) {
  const lines = inv.lines.filter((l) => !l.held), held = inv.lines.filter((l) => l.held);
  const payee = String(useRefLookups().setting('co.payee_bank') ?? '').trim();
  const addr = [client?.address1, client?.address2, client?.city, client?.zipCode, client?.country].filter(Boolean).join(', ');
  return (
    <div className="relative">
      <Watermark text={watermark} />
      <DocHeader title="INVOICE" no={inv.invoiceNo} date={formatDate(inv.invoiceDate)} extra={<><p>Due {formatDate(inv.dueDate)}</p><p>Period {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}</p>{inv.batchNo && <p>Batch {inv.batchNo}</p>}</>} />
      <div className="mb-3 grid grid-cols-2 gap-4">
        <div><p className="font-semibold">BILL TO</p><p>{client?.billingName ?? client?.clientName} ({inv.clientCode})</p><p>{addr || '—'}</p><p>TIN {client?.tin ?? '—'} · {client?.vatStatus ?? 'VAT status —'}</p><p>{client?.ebillingEmail}</p></div>
        <div><p><strong>Contract</strong> {inv.contractNo ?? '—'}</p><p><strong>Terms</strong> {inv.creditTermDays} days from invoice date</p><p><strong>Billing cycle</strong> {inv.billingCycle ?? '—'}</p><p><strong>Bill type</strong> {inv.billType ?? 'Lease'}</p>{inv.clientRef && <p><strong>Your PO / ref.</strong> {inv.clientRef}</p>}</div>
      </div>
      <table className="w-full border border-black/50"><thead><tr className="bg-black/5">{['#', 'Equipment / description', 'Chassis', 'Billed dates', 'Days', 'Rate', 'Amount'].map((h) => <th key={h} className="border border-black/40 px-1 py-0.5 text-left">{h}</th>)}</tr></thead>
        <tbody>{lines.map((l, k) => <tr key={l.id}>{[k + 1, l.equipmentType ? `${eqName(l.equipmentType)} — ${l.lineType}` : l.description, l.chassisNo ?? '',
          l.from ? <>{billedDates(l, inv.periodStart, inv.periodEnd)}{l.from.slice(0, 10) < inv.periodStart.slice(0, 10) && <span className="block text-[10px]">out {formatDate(l.from)}</span>}</> : '',
          l.days ?? '', l.rate != null ? formatPhp(l.rate) : '', formatPhp(l.amount)].map((v, x) => <td key={x} className={cn('border border-black/30 px-1 py-0.5', x === 3 && 'whitespace-nowrap')}>{v}</td>)}</tr>)}</tbody></table>
      {held.length > 0 && <p className="mt-1 text-[10px]">{held.length} line(s) held pending late-encoding credit memo approval are not billed on this invoice.</p>}
      <div className="ml-auto mt-2 w-64">{[['VATable sales', inv.subtotal], ['VAT-exempt sales', 0], ['Zero-rated sales', 0], ['VAT 12%', inv.vat]].map(([l, v]) => <p key={l as string} className="flex justify-between"><span>{l}</span><span>{formatPhp(v as number)}</span></p>)}<p className="mt-1 flex justify-between border-t border-black pt-1 font-bold"><span>TOTAL AMOUNT DUE</span><span>{formatPhp(inv.total)}</span></p></div>
      <p className="mt-2"><strong>Amount in words:</strong> {amountInWords(inv.total)}</p>
      {inv.remarks && <p className="mt-1"><strong>Remarks:</strong> {inv.remarks}</p>}
      <div className="mt-2 rounded border border-black/40 p-2"><p className="font-semibold">HOW TO PAY</p><p>{instructions ?? '—'}</p>{payee && <p>Payee account: {payee}</p>}<p className="text-[10px]">Please quote the invoice number. A Provisional Receipt is issued on payment; the Official Receipt follows once Treasury confirms the funds cleared.</p></div>
      <p className="mt-2 text-[10px]">Late payment interest per contract penalty schedule. Accounts unpaid 30 days past due are placed on hold.</p>
      <SignatureBlock items={[{ label: 'Prepared by (Billing)', name: preparedBy }, { label: 'Authorised signature' }, { label: 'Received by (client) / date' }]} />
      <DocFooter copy={copy} reprint={reprint} />
    </div>
  );
}

// ── SCR-34 Bill Generation & Adjustment ────────────────────────────────────
type Adj = { type: string; reason: string; amount: number; evidence?: string };
type Corr = { days: number; rate: number; reason: string };
export function BillingRunPage() {
  const nav = useNavigate();
  const { branchOptions, setting, ref, eqName, userName } = useRefLookups();
  const { user } = useAuth();
  // Default period = the last 7 Manila calendar days ending yesterday (was the UTC day, so the period slipped a day before 08:00 Manila).
  const manilaOffset = (d: number) => manilaDay(addDays(`${todayManila()}T12:00:00+08:00`, d));
  const [p, setP] = useState({ cycle: 'Weekly' as 'Weekly' | 'Monthly', periodStart: manilaOffset(-7), periodEnd: manilaOffset(-1), branch: '' });
  const [run, setRun] = useState(false);
  const preview = useData(['bill-preview', p], () => api.billing.preview(p), run);
  const [adj, setAdj] = useState<Record<string, Adj[]>>({});
  const [corr, setCorr] = useState<Record<string, Corr>>({});
  const [skip, setSkip] = useState<Record<string, 'discard' | 'unselect'>>({});
  const [refs, setRefs] = useState<Record<string, { clientRef?: string; remarks?: string }>>({});
  const setRef = (code: string, k: 'clientRef' | 'remarks', v: string) => setRefs({ ...refs, [code]: { ...refs[code], [k]: v } });
  const [adjFor, setAdjFor] = useState<string | null>(null);
  const [adjForm, setAdjForm] = useState<Adj>({ type: 'Late fee', reason: '', amount: 0 });
  const [edit, setEdit] = useState<{ line: InvoiceLine; v: Corr } | null>(null);
  const [printFor, setPrintFor] = useState<string | null>(null);
  const threshold = Number(setting('fin.adjustment_approval_threshold') ?? 5000);
  const vatPct = Number(setting('fin.vat_pct') ?? 0.12);
  const cycles = String(setting('fin.billing_cycles') ?? 'Weekly,Monthly').split(',').map((s) => s.trim()).filter((s) => s === 'Weekly' || s === 'Monthly');
  const drafts = preview.data?.drafts ?? [];
  const periodDays = preview.data?.periodDays ?? 7;
  const reset = (x: Partial<typeof p>) => { setP({ ...p, ...x }); setRun(false); setAdj({}); setCorr({}); setSkip({}); setRefs({}); };
  const selected = drafts.filter((d) => !skip[d.clientCode] && !d.conflictInvoiceNo);
  const finalize = useAction(() => api.billing.finalize({ ...p, clients: selected.map((d) => d.clientCode), adjustments: adj, corrections: corr, refs }), { success: (r) => `${r.invoices.length} invoice(s) finalized in ${r.batchNo} and sent — Billing Completion notices queued`, onSuccess: () => nav('/billing/invoices') });
  const linesOf = (d: (typeof drafts)[number]) => d.lines.map((l) => (corr[l.id] ? { ...l, days: corr[l.id].days, rate: corr[l.id].rate, amount: round2(corr[l.id].days * corr[l.id].rate), originalDays: l.days, originalRate: l.rate, reason: corr[l.id].reason, by: user?.userId } : l));
  const totalsOf = (d: (typeof drafts)[number]) => {
    const sub = round2(linesOf(d).filter((l) => !l.held).reduce((a, l) => a + l.amount, 0) + (adj[d.clientCode] ?? []).reduce((a, x) => a + x.amount, 0));
    const vat = round2(sub * vatPct); return { subtotal: sub, vat, total: round2(sub + vat) };
  };
  const printDraft = drafts.find((d) => d.clientCode === printFor);
  const adjErr = !adjForm.reason.trim() ? 'Reason is required' : !adjForm.amount ? 'Enter a non-zero amount' : undefined;
  const editErr = edit && (!edit.v.reason.trim() ? 'Reason is required' : edit.v.days < 0 || edit.v.days > periodDays ? `Days must be 0–${periodDays} (period length)` : edit.v.rate < 0 ? 'Rate cannot be negative' : undefined);
  return (
    <>
      <PageHeader title="Bill generation" meta={<ScreenTag id="SCR-34" />} description="Generate draft invoices for a billing cycle and period, review and correct the lines, then finalize and send." />
      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Select wrapperClassName="w-40" label="Billing cycle" value={p.cycle} onChange={(e) => reset({ cycle: e.target.value as 'Weekly' | 'Monthly' })} options={opts(cycles.length ? cycles : ['Weekly', 'Monthly'])} />
          <Input wrapperClassName="w-44" label="Period start" required type="date" value={p.periodStart} onChange={(e) => reset({ periodStart: e.target.value })} />
          <Input wrapperClassName="w-44" label="Period end" required type="date" value={p.periodEnd} onChange={(e) => reset({ periodEnd: e.target.value })} error={p.periodEnd < p.periodStart ? 'End is before start' : undefined} />
          <Select wrapperClassName="w-56" label="Branch" value={p.branch} onChange={(e) => reset({ branch: e.target.value })} placeholder="All branches" options={branchOptions} />
          <Button icon={<Calculator className="size-4" />} disabled={!p.periodStart || !p.periodEnd || p.periodEnd < p.periodStart} onClick={() => { setRun(true); preview.refetch(); }}>Generate draft bills</Button>
        </div>
        <details className="mt-3 text-[13px]">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-brand-600 hover:underline"><Info className="size-4" aria-hidden />How billing works</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>Billing cycles: {cycles.join(' / ')}. Rates come from the contract.</li>
            <li>Day rule: {String(setting('fin.billable_day_rule') ?? 'pickup and return day count')}</li>
            <li>Late-encoded lines up to 7 days late are recalculated automatically; later ones are held until the credit memo is approved.</li>
            <li>Invoice date = the day after the period end; due date = invoice date + the contract credit term. Starting the term at the client's acknowledgment instead <Pending /></li>
            <li>Correcting a line's days or rate needs a reason; the original value, reason and user are shown on the line and kept in the audit trail.</li>
            <li>Only users with billing approve permission can Finalize &amp; send. A client without an e-billing email is flagged on its draft.</li>
            <li>Rescue charges are debit memos deducted from the e-wallet; GPS and repair charges are separate invoices.</li>
            <li>Non-chassis charges in this run: Park &amp; Fix storage released in the period and chargeable gate-in damage (EIR) are added as their own lines. Tire and parts used on a job order are billed by a repair-cost debit memo once the job is closed.</li>
            <li>Each line shows the actual gate out → in, the dates billed in this period, and the gate pass and EWA it comes from. A line held for late encoding links to its credit memo; on approval it is released onto the same invoice.</li>
            <li>One billing period per run. Clients whose weekly period starts on another weekday (set per contract) show a billing batch conflict — how each contract's weekly period is anchored <Pending /></li>
          </ul>
        </details>
      </Card>
      {!run && <Card padded={false}><EmptyState icon={<Calculator className="size-5" />} title="No draft bills yet" hint="Choose a billing cycle and period, then select Generate draft bills." /></Card>}
      {run && preview.data && (
        <Stack>
          {preview.data.exceptions.length > 0 && <Banner tone="danger" title="Missing contract rate / terms — cannot finalize">{preview.data.exceptions.map((x) => <p key={x}>{x}</p>)}</Banner>}
          {!drafts.length && <Banner tone="info">No billable activity for {p.cycle.toLowerCase()} clients in this period.</Banner>}
          {drafts.length > 0 && <p className="text-sm text-muted">Billing batch <span className="font-mono">{preview.data.batchNo.replace(/\s*\(proposed\)\s*$/i, '')}</span> <span className="text-xs">(number assigned on finalize)</span> · {drafts.length} draft(s), {selected.length} selected · period {periodDays} day(s) · generated by {preview.data.generatedBy ?? '—'} at {formatDateTime(preview.data.generatedAt)}</p>}
          {drafts.map((d) => {
            const t = totalsOf(d); const off = skip[d.clientCode]; const lines = linesOf(d);
            if (off === 'discard') return <div key={d.clientCode} className="flex items-center justify-between rounded-lg border border-dashed border-line px-4 py-2 text-sm text-muted"><span>Discarded from this run: {d.clientName} ({d.clientCode})</span><Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { const s = { ...skip }; delete s[d.clientCode]; setSkip(s); }}>Restore</Button></div>;
            return (
              <Card key={d.clientCode} padded={false} className={cn(off && 'opacity-60')}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
                  <div className="flex items-start gap-3">
                    <Checkbox label="" aria-label={`Select ${d.clientName}`} checked={!off && !d.conflictInvoiceNo} disabled={!!d.conflictInvoiceNo} onChange={(e) => { const s = { ...skip }; if (e.target.checked) delete s[d.clientCode]; else s[d.clientCode] = 'unselect'; setSkip(s); }} />
                    <div><p className="font-semibold">{d.clientName} {d.clientStatus === 'Hold' && <Badge tone="danger" className="ml-1">credit hold — billed &amp; flagged</Badge>}</p><p className="text-xs text-muted">{d.clientCode} · Draft · {d.branchCode}{!d.conflictInvoiceNo && !off && <> · invoice no. on finalize ≈ <span className="font-mono">{d.invoiceNoPreview}</span></>}</p></div>
                  </div>
                  <div className="text-right"><p className="text-xs text-muted">Total incl. VAT</p><p className="text-lg font-bold tabular">{formatPhp(t.total)}</p></div>
                </div>
                {d.conflictInvoiceNo && <Banner tone="danger" className="m-3" title="Billing batch conflict">{d.clientName} is already billed for an overlapping period on <Link className="font-mono underline" to={`/billing/invoices/${d.conflictInvoiceNo}`}>{d.conflictInvoiceNo}</Link>
                  {d.conflictInvoice && <> — period {formatDate(d.conflictInvoice.periodStart)} – {formatDate(d.conflictInvoice.periodEnd)}, {formatPhp(d.conflictInvoice.total)} ({d.conflictInvoice.payment}, balance {formatPhp(d.conflictInvoice.balance)})</>}.
                  {' '}This draft cannot be finalized — discard it, or {d.conflictInvoice?.cancellable === false ? `correct the earlier invoice with a credit memo — it cannot be cancelled because it has ${d.conflictInvoice.pendingClearance ? `${formatPhp(d.conflictInvoice.pendingClearance)} awaiting clearance` : 'payments or credits'}` : 'cancel the earlier invoice first (Cancel invoice on its invoice page, with a reason)'}.</Banner>}
                <div className="border-b border-line px-5 py-2"><KeyValueGrid cols={3} items={[
                  { label: 'Invoice (transaction) date', value: <>{formatDate(d.invoiceDate)} <span className="text-xs text-muted">(day after period end)</span></> },
                  { label: 'Due date', value: <>{formatDate(d.dueDate)} <span className="text-xs text-muted">(+{d.creditTermDays} days credit term)</span></> }, { label: 'Billing cycle · contract', value: `${d.billingCycle} · ${d.contractNo ?? '—'}` },
                  { label: 'e-Billing email', value: d.ebillingEmail ? d.ebillingEmail : <span className="text-danger">None on file — the invoice is finalized but not emailed; add it on the client profile</span> },
                  { label: 'VAT status', value: <>{d.vatStatus ?? 'VAT-registered'}{d.vatStatus && d.vatStatus !== 'VAT-registered' && <span className="text-xs text-warning"> — VAT treatment <Pending /></span>}</> },
                  { label: 'Withholding tax (EWT)', value: <span className="text-xs font-normal text-muted">Not deducted on the invoice — the client withholds it on payment and sends BIR 2307; it is then credited with a withholding-tax credit memo. Showing an EWT line on the invoice <Pending /></span> },
                ]} />
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <Input label="Client PO / reference" value={refs[d.clientCode]?.clientRef ?? ''} onChange={(e) => setRef(d.clientCode, 'clientRef', e.target.value)} placeholder="e.g. PO-ABC-2026-118 (optional)" hint="Printed on the invoice" />
                    <Input label="Remarks" value={refs[d.clientCode]?.remarks ?? ''} onChange={(e) => setRef(d.clientCode, 'remarks', e.target.value)} placeholder="e.g. per contract amendment no. 2 (optional)" hint="Printed on the invoice" />
                  </div></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[60rem] table-fixed text-[13px]">
                  <colgroup><col /><col className="w-32" /><col className="w-52" /><col className="w-16" /><col className="w-28" /><col className="w-48" /><col className="w-32" /><col className="w-10" /></colgroup>
                  <thead className="bg-surface-alt text-[11px] uppercase text-muted"><tr><th className="px-4 py-2 text-left">Line</th><th className="px-2 py-2 text-left">Chassis</th><th className="px-2 py-2 text-left">Out → In · billed · gate pass / EWA</th><th className="px-2 py-2 text-right">Days</th><th className="px-2 py-2 text-right">Rate</th><th className="px-2 py-2 text-left">Rate type</th><th className="px-4 py-2 text-right">Amount</th><th className="w-8" /></tr></thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} className={cn('border-t border-line', l.held && 'bg-warning-bg/50', l.originalDays != null && 'bg-purple-50/40')}>
                        <td className="px-4 py-1.5">{l.description}<LineMarkers l={l} /></td><td className="px-2 py-1.5 font-mono">{l.chassisNo ?? ''}</td>
                        <td className="px-2 py-1.5">{outIn(l)}{l.from && <p className="text-[11px] text-muted">billed {billedDates(l, p.periodStart, p.periodEnd)}</p>}{(l.gatePassNo || l.ewaNo) && <p className="text-[11px] text-muted">{[l.gatePassNo && `GP ${l.gatePassNo}${l.gatePassInNo ? ` / ${l.gatePassInNo}` : ''}`, l.ewaNo && `EWA ${l.ewaNo}`].filter(Boolean).join(' · ')}</p>}</td><td className="px-2 py-1.5 text-right">{l.days ?? ''}</td>
                        <td className="px-2 py-1.5 text-right tabular">{l.rate != null ? formatPhp(l.rate) : ''}</td><td className="px-2 py-1.5 text-xs text-muted">{l.rateType}</td><td className={cn('px-4 py-1.5 text-right tabular', l.held && 'text-muted line-through')}>{formatPhp(l.amount)}</td>
                        <td className="pr-2">{l.days != null && !l.held && <button onClick={() => setEdit({ line: d.lines.find((x) => x.id === l.id)!, v: corr[l.id] ?? { days: l.days ?? 0, rate: l.rate ?? 0, reason: '' } })} aria-label="Correct days / rate" className="p-1 text-muted hover:text-brand-700"><Pencil className="size-4" /></button>}</td>
                      </tr>
                    ))}
                    {(adj[d.clientCode] ?? []).map((a, i) => (
                      <tr key={`adj-${i}`} className="border-t border-line bg-brand-50/40">
                        <td className="px-4 py-1.5" colSpan={6}><Badge tone="brand" dot={false}>{a.type}</Badge> <span className="ml-1">{a.reason}</span>{a.evidence && <span className="ml-2 text-xs text-muted">evidence {a.evidence}</span>}{Math.abs(a.amount) > threshold && <Badge tone="purple" className="ml-2">needs approval (&gt; {formatPhp(threshold)})</Badge>}</td>
                        <td className="px-4 py-1.5 text-right tabular">{formatPhp(a.amount)}</td>
                        <td className="pr-2"><button onClick={() => setAdj({ ...adj, [d.clientCode]: adj[d.clientCode].filter((_, k) => k !== i) })} aria-label="Remove adjustment" className="p-1 text-muted hover:text-danger"><Trash2 className="size-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-line bg-surface-alt text-[13px]">
                    {[['Subtotal', t.subtotal], [`VAT ${Math.round(vatPct * 100)}%`, t.vat], ['Total incl. VAT', t.total]].map(([k, v]) => <tr key={k as string}><td colSpan={6} className="px-4 py-1 text-right">{k}</td><td className="px-4 py-1 text-right font-medium tabular">{formatPhp(v as number)}</td><td /></tr>)}
                  </tfoot>
                </table></div>
                <div className="flex flex-wrap gap-2 px-5 py-2">
                  <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => { setAdjFor(d.clientCode); setAdjForm({ type: 'Late fee', reason: '', amount: 0 }); }}>Add adjustment (late fee, correction, special billing)</Button>
                  <Button size="sm" variant="ghost" icon={<Printer className="size-4" />} onClick={() => setPrintFor(d.clientCode)}>Preview PDF</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setSkip({ ...skip, [d.clientCode]: 'discard' })}>Discard draft</Button>
                </div>
              </Card>
            );
          })}
          {drafts.length > 0 && (
            <>
              <Banner tone="info" title="What “Finalize & send” does">
                <p>1. Assigns invoice numbers to the {selected.length} selected draft(s) under one billing batch; discarded or unselected drafts are not billed and can be re-run.</p>
                <p>2. Emails each client its invoice copy (PDF) at the e-billing address and sends the Billing Completion notice to Accounting, Credit &amp; Collection and Sales.</p>
                <p>3. The invoices appear in the <Link className="underline" to="/billing/invoices">Invoice list</Link> as Sent; corrections and adjustments are written to the audit trail.</p>
              </Banner>
              {(() => { const tt = selected.map(totalsOf); const s = (k: 'subtotal' | 'vat' | 'total') => round2(tt.reduce((a, x) => a + x[k], 0)); return (
                <Card padded={false}><div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="font-semibold">Batch total — {selected.length} selected draft(s){selected.length ? `: ${selected.map((d) => d.clientName).join(', ')}` : ''}</span>
                  <span className="flex gap-5 tabular"><span><span className="text-muted">Subtotal</span> {formatPhp(s('subtotal'))}</span><span><span className="text-muted">VAT</span> {formatPhp(s('vat'))}</span><span className="font-bold">Total incl. VAT {formatPhp(s('total'))}</span></span>
                </div></Card>); })()}
              <div className="flex items-center justify-end gap-3">
                {finalize.error && <span className="text-sm text-danger">{errMessage(finalize.error)}</span>}
                <Button size="lg" icon={<FileCheck2 className="size-4" />} loading={finalize.isPending} disabled={preview.data.exceptions.length > 0 || !selected.length} onClick={() => finalize.mutate(undefined)}>Finalize &amp; send {selected.length} invoice(s)</Button>
              </div>
            </>
          )}
          {!!preview.data.skipped?.length && (
            <Card padded={false}>
              <details className="px-5 py-3 text-sm">
                <summary className="cursor-pointer font-medium">Not in this run — {preview.data.skipped.length} client(s) with the reason</summary>
                <ul className="mt-2 divide-y divide-line">{preview.data.skipped.map((s) => <li key={s.clientCode} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{s.clientName} <span className="text-xs text-muted">{s.clientCode}</span></span><span className="text-muted">{s.reason}</span></li>)}</ul>
              </details>
            </Card>
          )}
        </Stack>
      )}
      <Modal open={!!adjFor} onClose={() => setAdjFor(null)} title="Add adjustment" description="DBL-FIN-002 / 004 — every adjustment carries a type, reason and amount; the line is audit-logged on finalize."
        footer={<><Button variant="secondary" onClick={() => setAdjFor(null)}>Cancel</Button><Button disabled={!!adjErr} onClick={() => { setAdj({ ...adj, [adjFor!]: [...(adj[adjFor!] ?? []), adjForm] }); setAdjFor(null); }}>Add to draft</Button></>}>
        <FormGrid>
          <Select label="Type" required value={adjForm.type} onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value })} options={opts(ADJ_TYPES)} />
          <MoneyInput label="Amount" required hint="Negative for an overbilled correction" value={adjForm.amount || ''} onChange={(e) => setAdjForm({ ...adjForm, amount: Number(e.target.value) })} error={adjForm.amount === 0 && adjForm.reason ? 'Enter a non-zero amount' : undefined} />
        </FormGrid>
        <Textarea className="mt-3" label="Reason" required value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} wrapperClassName="mt-3" placeholder="Why this adjustment — e.g. 2 days off-hire not captured" />
        <Input wrapperClassName="mt-3" label="Supporting evidence" type="file" onChange={(e) => setAdjForm({ ...adjForm, evidence: e.target.files?.[0]?.name })} hint={adjForm.evidence ?? 'Optional — e.g. client acknowledgment, computation'} />
        {Math.abs(adjForm.amount) > threshold && <Banner tone="warning" className="mt-3">Above {formatPhp(threshold)} — finalizing needs billing approve permission <Pending q="Q-FIN-01" /></Banner>}
      </Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Correct line — ${edit?.line.chassisNo ?? ''}`} description="DBL-FIN-002: correct billed days or rate. Days cannot exceed the period; the original values, reason and user are kept in the audit trail."
        footer={<><Button variant="secondary" onClick={() => { if (edit) { const c = { ...corr }; delete c[edit.line.id]; setCorr(c); } setEdit(null); }}>Revert to original</Button><Button disabled={!!editErr} onClick={() => { setCorr({ ...corr, [edit!.line.id]: edit!.v }); setEdit(null); }}>Apply correction</Button></>}>
        {edit && <Stack>
          <KeyValueGrid cols={3} items={[{ label: 'Original days', value: edit.line.days }, { label: 'Original rate', value: formatPhp(edit.line.rate) }, { label: 'Out → In', value: outIn(edit.line) }]} />
          <FormGrid><Input label="Billed days" required type="number" min={0} max={periodDays} value={edit.v.days} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, days: Number(e.target.value) } })} placeholder="Days" hint={`0–${periodDays}`} /><MoneyInput label="Daily rate" required value={edit.v.rate} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, rate: Number(e.target.value) } })} /></FormGrid>
          <Textarea label="Reason for correction" required value={edit.v.reason} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, reason: e.target.value } })} placeholder="Reason for the change (kept in the audit trail)" error={editErr && edit.v.reason ? editErr : undefined} />
        </Stack>}
      </Modal>
      {printDraft && (
        <PrintPreview open onClose={() => setPrintFor(null)} title={`Draft invoice — ${printDraft.clientName}`}>
          <InvoiceDocument inv={{ ...printDraft, ...totalsOf(printDraft), invoiceNo: '(assigned on finalize)', periodStart: p.periodStart, periodEnd: p.periodEnd, billType: 'Lease', batchNo: preview.data?.batchNo, clientRef: refs[printDraft.clientCode]?.clientRef, remarks: refs[printDraft.clientCode]?.remarks, lines: [...linesOf(printDraft), ...(adj[printDraft.clientCode] ?? []).map((a, i) => ({ id: `a${i}`, lineType: 'Adjustment' as const, description: `${a.type} — ${a.reason}`, amount: a.amount }))] }}
            client={ref?.clients.find((c) => c.clientCode === printDraft.clientCode)} copy="DRAFT – NOT FOR CLIENT" watermark="DRAFT" instructions={String(setting('fin.payment_instructions') ?? '')} preparedBy={userName(user?.userId)} eqName={eqName} />
        </PrintPreview>
      )}
    </>
  );
}

// ── SCR-35 Invoice List ─────────────────────────────────────────────────────
export function InvoiceListPage() {
  const [f, setF] = useState({ status: '', client: '', chassis: '', billType: '', branch: '', from: '', to: '' });
  const data = useData(['invoices', f], () => api.billing.invoices(f));
  const { clientOptions, branchOptions, setting } = useRefLookups();
  const holdDays = Number(setting('cnc.hold_threshold_days') ?? 30);
  const { can } = useAuth();
  const nav = useNavigate();
  type Row = NonNullable<typeof data.data>[number];
  const rows = data.data ?? [];
  const live = rows.filter((r) => r.payment !== 'Cancelled');
  // Fits 1600 px: Status sits next to the invoice no.; Branch is read from the invoice prefix; Due carries the overdue / hold countdown.
  const cols: ColumnDef<Row>[] = [
    // Review 1.2: contract no. and branch under the invoice no.; sent / e-mailed status, held amount with its credit memo, payment method; row actions.
    { accessorKey: 'invoiceNo', header: 'Invoice #', cell: (c) => <><Link to={`/billing/invoices/${c.getValue()}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap font-mono font-medium text-brand-600 hover:underline">{c.getValue<string>()}</Link>
      <p className="whitespace-nowrap text-[11px] leading-tight text-muted">{c.row.original.branchCode}{c.row.original.contractNo ? <> · <Link className="font-mono hover:underline" to={`/contracts/${c.row.original.contractNo}`} onClick={(e) => e.stopPropagation()}>{c.row.original.contractNo}</Link></> : ''}</p></> },
    { accessorKey: 'payment', header: 'Status', cell: (c) => <><span className="inline-flex items-center gap-1.5"><StatusBadge domain="payment" value={c.getValue<string>()} />{c.row.original.hasHeld && <span title="Has held lines awaiting a late-encoding credit memo" className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-warning"><AlertTriangle className="size-3.5" aria-hidden />Held lines</span>}</span>
      {c.row.original.hasHeld && <p className="whitespace-nowrap text-[11px] leading-tight text-muted">held {formatPhp(c.row.original.heldAmount)}{c.row.original.heldMemoNo && <> · <Link className="font-mono text-brand-600 hover:underline" to={`/billing/memos?memo=${c.row.original.heldMemoNo}`} onClick={(e) => e.stopPropagation()}>{c.row.original.heldMemoNo}</Link></>}</p>}
      {c.row.original.payment !== 'Cancelled' && <p className="whitespace-nowrap text-[11px] leading-tight text-muted" title={c.row.original.sentTo ? `Sent to ${c.row.original.sentTo}` : undefined}>{c.row.original.sentAt ? <><Mail className="mr-0.5 inline size-3" aria-hidden />Sent · emailed {formatDate(c.row.original.sentAt)}</> : <span className="text-warning">Not sent</span>}</p>}
      {c.row.original.payment === 'Cancelled' && c.row.original.cancelReason && <p className="max-w-36 whitespace-normal text-[11px] leading-tight text-muted" title={c.row.original.cancelReason}>{c.row.original.cancelReason}</p>}
      {c.row.original.creditMemoNo && <p className="text-[11px] leading-tight"><Link className="font-mono text-brand-600 hover:underline" to={`/billing/memos?memo=${c.row.original.creditMemoNo}`} onClick={(e) => e.stopPropagation()}>{c.row.original.creditMemoNo}</Link></p>}</> },
    { accessorKey: 'invoiceDate', header: 'Invoice date', cell: (c) => formatDate(c.getValue<string>()) },
    { accessorKey: 'clientName', header: 'Client', cell: (c) => <span className="block min-w-44">{c.getValue<string>()}</span> },
    { accessorKey: 'billType', header: 'Bill type' },
    { id: 'period', header: 'Period', meta: { nowrap: true }, cell: (c) => `${formatDate(c.row.original.periodStart)} – ${formatDate(c.row.original.periodEnd)}` },
    { accessorKey: 'total', header: 'Amount', meta: { align: 'right' }, cell: (c) => <>{formatPhp(c.getValue<number>())}<p className="text-[11px] leading-tight text-muted">VAT {formatPhp(c.row.original.vat)}</p></> },
    { accessorKey: 'balance', header: 'Balance', meta: { align: 'right' }, cell: (c) => <>{formatPhp(c.getValue<number>())}{c.row.original.amountPaid > 0 && <p className="text-[11px] leading-tight text-muted">paid {formatPhp(c.row.original.amountPaid)}{c.row.original.lastPayment && <><br /><Link className="font-mono text-brand-600 hover:underline" to={`/billing/receipts?receipt=${c.row.original.lastPayment.receiptNo}`} onClick={(e) => e.stopPropagation()} title={`Official Receipt cleared ${formatDate(c.row.original.lastPayment.date)}`}>{c.row.original.lastPayment.orNo}</Link><br />{METHOD_LABEL(c.row.original.lastPayment.method)} · {formatDate(c.row.original.lastPayment.date)}</>}</p>}{c.row.original.pendingClearance > 0 && <p className="text-[11px] leading-tight text-muted">{formatPhp(c.row.original.pendingClearance)}<br />awaiting clearance</p>}</> },
    { accessorKey: 'dueDate', header: 'Due', cell: (c) => { const r = c.row.original; return <>{formatDate(c.getValue<string>())}{r.payment === 'Overdue' && <p className="text-[11px] leading-tight"><span className="font-semibold text-danger">{r.daysOverdue}d overdue</span><br /><span className="text-muted">{(r.daysToHold ?? 0) > 0 ? `hold in ${r.daysToHold}d` : 'hold threshold passed'}</span></p>}</>; } },
    { id: 'actions', header: '', enableSorting: false, cell: (c) => { const r = c.row.original; const open = r.balance > 0 && r.payment !== 'Cancelled'; const ib = 'rounded p-1 text-muted hover:bg-surface-alt hover:text-brand-700';
      return <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <Link className={ib} to={`/billing/invoices/${r.invoiceNo}?print=1`} title="Invoice PDF" aria-label={`Invoice PDF ${r.invoiceNo}`}><Printer className="size-4" /></Link>
        {can('fin.invoice', 'edit') && r.payment !== 'Cancelled' && <Link className={ib} to={`/billing/invoices/${r.invoiceNo}?resend=1`} title="Resend to client" aria-label={`Resend ${r.invoiceNo}`}><Mail className="size-4" /></Link>}
        {can('fin.memo', 'add') && open && <Link className={ib} to={`/billing/memos?new=1&client=${r.clientCode}&invoice=${r.invoiceNo}`} title="Issue credit / debit memo" aria-label={`Memo for ${r.invoiceNo}`}><FileMinus className="size-4" /></Link>}
        {can('fin.receipt', 'add') && open && <Link className={ib} to={`/billing/receipts?new=1&client=${r.clientCode}&invoice=${r.invoiceNo}`} title="Record payment" aria-label={`Record payment ${r.invoiceNo}`}><Banknote className="size-4" /></Link>}
        <ChevronRight className="size-4 text-muted" aria-hidden /></div>; } },
  ];
  const csvCols: [string, (r: Row) => unknown][] = [['Invoice #', (r) => r.invoiceNo], ['Status', (r) => r.payment], ['Invoice date', (r) => r.invoiceDate], ['Client', (r) => r.clientName], ['Branch', (r) => r.branchCode], ['Contract', (r) => r.contractNo], ['Bill type', (r) => r.billType], ['Last payment method', (r) => r.lastPayment?.method], ['Held amount', (r) => r.heldAmount || ''],
    ['Period start', (r) => r.periodStart], ['Period end', (r) => r.periodEnd], ['Subtotal', (r) => r.subtotal], ['VAT', (r) => r.vat], ['Amount', (r) => r.total], ['Paid', (r) => r.amountPaid], ['Last OR', (r) => r.lastPayment?.orNo], ['Last payment date', (r) => r.lastPayment?.date], ['Credited', (r) => r.credited ?? 0], ['Credit memo', (r) => r.creditMemoNo], ['Balance', (r) => r.balance], ['Awaiting clearance', (r) => r.pendingClearance], ['Due', (r) => r.dueDate], ['Days overdue', (r) => r.daysOverdue], ['Billing batch', (r) => r.batchNo], ['Sent to', (r) => r.sentTo], ['Sent at', (r) => r.sentAt], ['Cancel reason', (r) => r.cancelReason]];
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const [moreOpen, setMoreOpen] = useState(false);
  const more = [f.billType, f.branch, f.chassis].filter(Boolean).length;
  return (
    <>
      <PageHeader title="Invoices" meta={<ScreenTag id="SCR-35" />} description="All invoices with payment status. Due date = invoice date + the contract credit term; overdue invoices feed Credit & Collection alerts and the automatic account hold."
        actions={<><Link to="/billing/run"><Button>Run billing</Button></Link><Link to="/billing/receipts?new=1"><Button variant="secondary">Record payment</Button></Link><Link to="/credit/aging"><Button variant="ghost">Aging &amp; collection →</Button></Link></>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Open balance" value={formatPhp(live.reduce((a, r) => a + r.balance, 0))} />
        <KpiTile label="Overdue" value={formatPhp(live.filter((r) => r.payment === 'Overdue').reduce((a, r) => a + r.balance, 0))} tone="danger" onClick={() => setF({ ...f, status: 'Overdue' })} />
        <KpiTile label="Unpaid invoices" value={live.filter((r) => r.balance > 0).length} /><KpiTile label="Paid" value={live.filter((r) => r.payment === 'Paid').length} tone="success" onClick={() => setF({ ...f, status: 'Paid' })} />
      </div>
      <DataTable data={rows} loading={data.isLoading} columns={cols} onRowClick={(r) => nav(`/billing/invoices/${r.invoiceNo}`)} emptyTitle="No invoices match filter"
        footer={<div className="flex flex-wrap justify-between gap-2 text-[12px]"><span className="text-muted">{rows.length} invoice{rows.length === 1 ? '' : 's'} match the filters{rows.length - live.length ? ` (${rows.length - live.length} cancelled, not in the totals)` : ''}</span>
          <span className="flex flex-wrap gap-4 tabular"><span><span className="text-muted">Amount</span> {formatPhp(live.reduce((a, r) => a + r.total, 0))}</span><span><span className="text-muted">Paid</span> {formatPhp(live.reduce((a, r) => a + r.amountPaid, 0))}</span><span><span className="text-muted">Awaiting clearance</span> {formatPhp(live.reduce((a, r) => a + r.pendingClearance, 0))}</span><span className="font-bold">Balance {formatPhp(live.reduce((a, r) => a + r.balance, 0))}</span></span></div>}
        toolbar={<>
          <Select aria-label="Status" value={f.status} onChange={set('status')} placeholder="All statuses" options={opts(['Unpaid', 'Partially Paid', 'Overdue', 'Paid', 'Credited', 'Cancelled', 'Held'])} />
          <Select aria-label="Client" value={f.client} onChange={set('client')} placeholder="All clients" options={clientOptions} wrapperClassName="w-52" />
          <DateRangeFilter label="Invoice date" from={f.from} to={f.to} onChange={(r) => setF({ ...f, ...r })} />
          <Button size="sm" variant="secondary" className="h-9" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>{moreOpen ? 'Fewer filters' : 'More filters'}{more > 0 && ` (${more})`}</Button>
          <ExportCsv name="invoices" rows={rows} cols={csvCols} />
          {moreOpen && <div className="flex w-full flex-wrap items-center gap-2 [&>[data-field]]:w-52">
            <Select aria-label="Bill type" value={f.billType} onChange={set('billType')} placeholder="All bill types" options={opts(BILL_TYPES)} />
            <Select aria-label="Branch" value={f.branch} onChange={set('branch')} placeholder="All branches" options={branchOptions} />
            <Input aria-label="Chassis no." title="Matches any line on the invoice" placeholder="Chassis no." value={f.chassis} onChange={set('chassis')} />
          </div>}
        </>} />
      <p className="mt-2 text-xs text-muted">Row icons: invoice PDF, resend, issue credit / debit memo, record payment. Open an invoice for payments and receipts, memos, billing batch, e-billing delivery and audit history. Branch, chassis and bill type filters are under More filters. The automatic hold runs when an invoice is more than {holdDays} days past due (day {holdDays + 1}); “hold in Nd” counts down to that day.</p>
      <p className="mt-1 text-xs text-muted">Rescue charges are raised as debit memos and deducted from the client e-wallet — see <Link className="underline" to="/billing/memos">Credit / debit memos</Link>.</p>
    </>
  );
}

export function InvoiceDetailPage() {
  const { no = '' } = useParams();
  const data = useData(['invoice', no], () => api.billing.invoice(no));
  const { setting, eqName, userName } = useRefLookups();
  const { can, user } = useAuth();
  const [print, setPrint] = useState(false);
  const [copy, setCopy] = useState(COPIES[0]);
  const [reprint, setReprint] = useState<number | undefined>();
  const [resend, setResend] = useState(false);
  const logPrint = useAction(() => api.billing.logInvoicePrint(no, copy), { silent: true, onSuccess: (n) => setReprint(n) });
  const send = useAction(() => api.billing.resendInvoice(no), { success: 'Invoice copy re-sent to the client', onSuccess: () => setResend(false) });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const cancel = useAction(() => api.billing.cancelInvoice(no, cancelReason), { success: `${no} cancelled`, onSuccess: () => { setCancelOpen(false); data.refetch(); } });
  // Review 1.2: the invoice list row icons open the PDF preview (?print=1) or the resend dialog (?resend=1) directly.
  const [qs, setQs] = useSearchParams();
  useEffect(() => { if (!data.data) return; if (qs.get('print') === '1') { setReprint(undefined); setPrint(true); setQs({}, { replace: true }); } else if (qs.get('resend') === '1') { setResend(true); setQs({}, { replace: true }); } }, [data.data, qs, setQs]);
  if (data.error) return <Banner tone="danger">{errMessage(data.error)}</Banner>;
  if (!data.data) return <p className="text-muted">Loading…</p>;
  const i = data.data;
  const open = i.balance > 0 && i.payment !== 'Cancelled';
  const lines = i.lines;
  return (
    <>
      <PageHeader breadcrumb={<Crumb items={[{ to: '/billing/invoices', label: 'Invoices' }, { label: i.invoiceNo }]} />} title={i.invoiceNo} meta={<><StatusBadge domain="payment" value={i.payment} /><ScreenTag id="SCR-35" /></>}
        description={`${i.client?.clientName} · ${i.billType} · ${formatDate(i.periodStart)} – ${formatDate(i.periodEnd)}`}
        actions={<>
          <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => { setReprint(undefined); setPrint(true); }}>Invoice PDF</Button>
          {can('fin.invoice', 'edit') && i.payment !== 'Cancelled' && <Button variant="secondary" icon={<Mail className="size-4" />} onClick={() => setResend(true)}>Resend</Button>}
          {can('fin.memo', 'add') && open && <Link to={`/billing/memos?new=1&client=${i.clientCode}&invoice=${i.invoiceNo}`}><Button variant="secondary">Issue credit / debit memo</Button></Link>}
          {can('fin.receipt', 'add') && open && <Link to={`/billing/receipts?new=1&client=${i.clientCode}&invoice=${i.invoiceNo}`}><Button>Record payment</Button></Link>}
          {can('fin.billing', 'approve') && i.payment !== 'Cancelled' && i.amountPaid === 0 && !(i.credited ?? 0) && !i.pendingClearance && <Button variant="danger" onClick={() => { setCancelReason(''); setCancelOpen(true); }}>Cancel invoice</Button>}
        </>} />
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel ${i.invoiceNo}`} description="Only an invoice with no payments or credits can be cancelled; the reason is shown on the invoice list and kept in the audit trail."
        footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep invoice</Button><Button variant="danger" loading={cancel.isPending} disabled={!cancelReason.trim()} onClick={() => cancel.mutate(undefined)}>Cancel invoice</Button></>}>
        <Textarea label="Reason for cancellation" required value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. Duplicate of INV-MNL-00001102 (same client and period)" />
        {cancel.error && <Banner tone="danger" className="mt-3">{errMessage(cancel.error)}</Banner>}
      </Modal>
      {i.payment === 'Cancelled' && <Banner tone="danger" className="mb-4" title="Cancelled">{i.cancelReason}</Banner>}
      {i.heldReason && <Banner tone="warning" className="mb-4" title="Late-encoded lines held">{i.heldReason}. Held lines are not in the totals until the credit memo is approved.</Banner>}
      {i.pendingClearance > 0 && <Banner tone="info" className="mb-4">{formatPhp(i.pendingClearance)} recorded on Provisional Receipt(s) awaiting Treasury clearance — posted to this invoice when the Official Receipt is issued.</Banner>}
      <div className="mb-5 grid gap-4 sm:grid-cols-5"><KpiTile label="Total" value={formatPhp(i.total)} /><KpiTile label="Paid" value={formatPhp(i.amountPaid)} tone="success" /><KpiTile label="Credited" value={formatPhp(i.credited ?? 0)} /><KpiTile label="Balance" value={formatPhp(i.balance)} tone={i.balance > 0 ? 'warning' : 'default'} /><KpiTile label="Due" value={<span className="tracking-normal [font-variant-numeric:normal]">{formatDate(i.dueDate)}</span>}hint={`${formatDate(i.invoiceDate)} + ${i.creditTermDays} days`} /></div>
      <Card className="mb-5"><KeyValueGrid cols={4} items={[
        { label: 'Invoice date', value: formatDate(i.invoiceDate) }, { label: 'Billing cycle', value: i.billingCycle ?? i.client?.billingCycle ?? '—' },
        { label: 'Contract no.', value: i.contractNo ? <Link className="font-mono text-brand-600 hover:underline" to={`/contracts/${i.contractNo}`}>{i.contractNo}</Link> : '—' }, { label: 'Credit term', value: <>{i.creditTermDays} days<p className="text-xs text-muted">Client credit available {i.clientCredit > 0 ? <Link className="text-brand-600 hover:underline" to={`/credit/status?client=${i.clientCode}`}>{formatPhp(i.clientCredit)}</Link> : formatPhp(0)}</p></> },
        { label: 'Branch', value: `${i.branchCode} — ${i.branchName}` }, { label: 'Billing batch', value: <span className="font-mono text-xs">{i.batchNo ?? '—'}</span> },
        { label: 'Client TIN · VAT', value: `${i.client?.tin ?? '—'} · ${i.client?.vatStatus ?? '—'}` }, { label: 'Sent to', value: i.sentAt ? <>{i.sentTo}<p className="text-xs text-muted">{formatDateTime(i.sentAt)}</p></> : 'Not sent' },
        ...(i.clientRef || i.remarks ? [{ label: 'Client PO / reference', value: i.clientRef ?? '—' }, { label: 'Remarks', value: i.remarks ?? '—' }] : []),
      ]} /></Card>
      <Card padded={false}>
        <div className="overflow-x-auto"><table className="w-full text-[13px]">
          <thead className="bg-surface-alt text-[11px] uppercase text-muted"><tr><th className="px-4 py-2 text-left">Type</th><th className="px-2 py-2 text-left">Description</th><th className="px-2 py-2 text-left">Chassis</th><th className="px-2 py-2 text-left">Out → In</th><th className="px-2 py-2 text-right">Days</th><th className="px-2 py-2 text-right">Rate (snapshot)</th><th className="px-2 py-2 text-left">Rate type</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.id} className={cn('border-t border-line', l.held && 'bg-warning-bg/50')}>
              <td className="px-4 py-1.5">{l.lineType}</td><td className="px-2 py-1.5">{l.equipmentType ? eqName(l.equipmentType) : l.description}<LineMarkers l={l} /></td>
              <td className="whitespace-nowrap px-2 py-1.5 font-mono">{l.chassisNo ?? ''}</td><td className="whitespace-nowrap px-2 py-1.5">{outIn(l)}</td><td className="px-2 py-1.5 text-right">{l.days ?? ''}</td>
              <td className="px-2 py-1.5 text-right tabular">{l.rate != null ? formatPhp(l.rate) : ''}</td><td className="px-2 py-1.5 text-xs text-muted">{l.rateType}</td><td className={cn('px-4 py-1.5 text-right tabular', l.held && 'text-muted line-through')}>{formatPhp(l.amount)}</td>
            </tr>))}</tbody>
          <tfoot className="border-t border-line bg-surface-alt">
            {[['Subtotal', i.subtotal], [`VAT ${Math.round(Number(setting('fin.vat_pct') ?? 0.12) * 100)}%`, i.vat], ['Total', i.total]].map(([k, v]) => <tr key={k as string}><td colSpan={7} className={cn('px-4 py-1 text-right', k === 'Total' && 'font-semibold')}>{k}</td><td className={cn('px-4 py-1 text-right tabular', k === 'Total' ? 'font-semibold' : 'font-medium')}>{formatPhp(v as number)}</td></tr>)}
            {lines.some((l) => l.held) && <tr><td colSpan={8} className="px-4 pb-2 text-right text-xs text-muted">Held lines ({formatPhp(lines.filter((l) => l.held).reduce((a, l) => a + l.amount, 0))}) excluded.</td></tr>}
          </tfoot>
        </table></div>
      </Card>
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-3">
        <Card><CardHeader title="Payments applied" description="Provisional receipts become Official Receipts once Treasury confirms clearance" />{i.receipts.length ? i.receipts.map((r) => (
          <p key={r.receiptNo} className="flex items-center justify-between gap-2 py-1 text-sm"><Link className="font-mono text-brand-600 hover:underline" to={`/billing/receipts?receipt=${r.receiptNo}`}>{r.receiptNo}{r.orNo ? ` → ${r.orNo}` : ''}</Link><StatusBadge domain="receipt" value={r.status} /><MoneyText value={r.applications.find((a) => a.invoiceNo === i.invoiceNo)?.amount} /></p>)) : <p className="text-sm text-muted">No payments yet.{can('fin.receipt', 'add') && open && <> <Link className="font-medium text-brand-600 hover:underline" to={`/billing/receipts?new=1&client=${i.clientCode}&invoice=${i.invoiceNo}`}>Record payment</Link></>}</p>}</Card>
        <Card><CardHeader title="Credit / debit memos" description="Credit and debit memos applied to this invoice" />{i.memos.length ? i.memos.map((m) => (
          <p key={m.memoNo} className="flex items-center justify-between gap-2 py-1 text-sm"><Link className="font-mono text-brand-600 hover:underline" to={`/billing/memos?memo=${m.memoNo}`}>{m.memoNo}</Link><span className="text-xs text-muted">{m.category ?? m.type}</span><StatusBadge domain="memo" value={m.status} /><MoneyText value={m.amount} /></p>)) : <p className="text-sm text-muted">No memos on this invoice.{can('fin.memo', 'add') && open && <> <Link className="font-medium text-brand-600 hover:underline" to={`/billing/memos?new=1&client=${i.clientCode}&invoice=${i.invoiceNo}`}>Issue credit / debit memo</Link></>}</p>}</Card>
        <Card><CardHeader title="Status history & audit" />
          <ul className="space-y-1 text-sm">{[...i.history.map((h) => ({ at: h.at, who: h.byName, what: h.action, note: h.note })), ...i.audit.map((a) => ({ at: a.at, who: a.byName, what: a.action, note: a.reason }))].sort((a, b) => b.at.localeCompare(a.at)).map((h, k) => (
            <li key={k}><span className="text-xs text-muted">{formatDateTime(h.at)} · {h.who}</span><p>{h.what}{h.note ? <span className="text-muted"> — {h.note}</span> : null}</p></li>))}</ul>
        </Card>
      </div>
      <PrintPreview open={print} onClose={() => setPrint(false)} title={`Invoice ${i.invoiceNo}`} onPrint={async () => { await logPrint.mutateAsync(undefined); }}
        toolbar={<><Select label="Copy" value={copy} onChange={(e) => setCopy(e.target.value)} options={opts(COPIES)} wrapperClassName="w-64" />
          <span className="pb-2 text-xs text-muted">{!i.printCount ? 'Not printed yet' : i.printCount === 1 ? 'Printed once' : `Printed ${i.printCount} times`} · Print is logged automatically{(i.printCount ?? 0) > 0 ? ' and marks the copy as a reprint' : ''}{reprint ? ` · this copy is REPRINT #${reprint}` : ''}</span></>}>
        <InvoiceDocument inv={i} client={i.client} copy={copy} watermark={i.payment === 'Cancelled' ? 'CANCELLED' : reprint ? `REPRINT #${reprint}` : undefined} reprint={reprint} instructions={String(setting('fin.payment_instructions') ?? '')} preparedBy={userName(i.history[0]?.by ?? user?.userId)} eqName={eqName} />
      </PrintPreview>
      <ConfirmDialog open={resend} onClose={() => setResend(false)} onConfirm={() => send.mutate(undefined)} loading={send.isPending} title="Resend invoice copy"
        message={<>Email the invoice PDF to <strong>{i.client?.ebillingEmail ?? '(no e-billing email on file)'}</strong> and log the delivery. Last sent {i.sentAt ? `${formatDateTime(i.sentAt)} to ${i.sentTo}` : 'never'}.</>} confirmLabel="Resend" />
    </>
  );
}

// ── SCR-36 Official / Provisional Receipt Entry ────────────────────────────
type ReceiptRow = Awaited<ReturnType<typeof api.billing.receipts>>[number];
function ReceiptDocument({ r, reprint }: { r: Awaited<ReturnType<typeof api.billing.receiptDetail>>; reprint?: boolean }) {
  const title = r.status === 'OR Issued' ? (r.type === 'NVAR' ? 'NON-VAT ACKNOWLEDGEMENT RECEIPT' : 'OFFICIAL RECEIPT') : 'PROVISIONAL RECEIPT';
  const addr = [r.client?.address1, r.client?.city, r.client?.country].filter(Boolean).join(', ');
  return (
    <div className="relative">
      <Watermark text={r.status === 'Cancelled' ? 'CANCELLED' : r.status === 'Bounced' ? 'BOUNCED' : r.status === 'Provisional' ? 'PROVISIONAL' : reprint ? 'REPRINT' : undefined} />
      <DocHeader title={title} no={r.status === 'OR Issued' ? r.orNo ?? r.receiptNo : r.receiptNo} date={formatDate(r.status === 'OR Issued' ? r.clearedAt : r.date)} extra={r.orNo ? <p>PR ref {r.receiptNo}</p> : undefined} />
      <table className="mb-3 w-full"><tbody>{[
        ['RECEIVED FROM', `${r.client?.billingName ?? r.clientName} (${r.clientCode})`, 'TIN', r.tin ?? '—'], ['ADDRESS', addr || '—', 'PAYMENT DATE', formatDate(r.date)],
        ['METHOD', r.method, r.method === 'Check' ? 'CHECK' : 'REFERENCE', r.method === 'Check' ? `${r.bank ?? ''} ${r.checkNo ?? ''} · dated ${formatDate(r.checkDate)}${r.pdc ? ' (PDC)' : ''}` : r.reference ?? '—'],
        ['CHECK STATUS', r.depositStatus ?? '—', 'CLEARED', r.clearedAt ? `${formatDate(r.clearedAt)} · ${r.clearedByName ?? ''}` : 'Awaiting Treasury clearance'],
      ].map((x, k) => <tr key={k}><td className="w-32 py-0.5 font-semibold">{x[0]}</td><td className="py-0.5">{x[1]}</td><td className="w-28 py-0.5 font-semibold">{x[2]}</td><td className="py-0.5">{x[3]}</td></tr>)}</tbody></table>
      <p className="mb-2">The sum of <strong>{amountInWords(r.amount)}</strong> ({formatPhp(r.amount)}) in payment of:</p>
      <table className="w-full border border-black/50"><thead><tr className="bg-black/5">{['Invoice', 'Due', 'Amount applied'].map((h) => <th key={h} className="border border-black/40 px-1 py-0.5 text-left">{h}</th>)}</tr></thead>
        <tbody>{r.invoices.map((a) => <tr key={a.invoiceNo}>{[a.invoiceNo, formatDate(a.dueDate), formatPhp(a.amount)].map((v, x) => <td key={x} className="border border-black/30 px-1 py-0.5">{v}</td>)}</tr>)}
          <tr><td colSpan={2} className="border border-black/30 px-1 py-0.5">Unapplied — kept as client credit</td><td className="border border-black/30 px-1 py-0.5">{formatPhp(r.unapplied)}</td></tr></tbody></table>
      {r.notes && <p className="mt-2"><strong>Notes:</strong> {r.notes}</p>}
      <p className="mt-2 text-[10px]">A Provisional Receipt is not proof of settlement until the Official Receipt is issued.</p>
      <SignatureBlock items={[{ label: 'Received by (cashier / Accounting)', name: r.byName }, { label: 'Confirmed by (Treasury)', name: r.clearedByName }]} />
      <DocFooter copy="ORIGINAL – CLIENT COPY" />
    </div>
  );
}

function RecordPaymentModal({ open, onClose, preset }: { open: boolean; onClose: () => void; preset: { client?: string; invoice?: string } }) {
  const { clientOptions, ref, userName } = useRefLookups();
  const { user } = useAuth();
  const blank = { type: 'PR' as 'PR' | 'NVAR', clientCode: preset.client ?? '', amount: 0, method: 'Check', reference: '', checkNo: '', bank: '', checkDate: today(), date: today(), notes: '', attachments: [] as string[] };
  const [v, setV] = useState(blank);
  const clientBranch = ref?.clients.find((c) => c.clientCode === v.clientCode)?.branchCode;
  // Review 1.2: what each method needs (shown under the Method field).
  const methodHint: Record<string, string> = { Check: 'Check no., bank and check date required; a later check date is tracked as a PDC', Cash: 'No reference needed — counted at the cashier', 'Bank Transfer': 'Transfer reference required; bank optional', Online: 'Payment gateway / transaction reference required', 'E-Wallet': 'E-wallet transaction reference required' };
  const [apps, setApps] = useState<Record<string, number>>({});
  const [presetDone, setPresetDone] = useState(false);
  useEffect(() => { if (open) { setV({ ...blank, clientCode: preset.client ?? '' }); setApps({}); setPresetDone(false); } }, [open, preset.client]); // eslint-disable-line react-hooks/exhaustive-deps
  const invs = useData(['invoices', 'client', v.clientCode], () => api.billing.invoices({ client: v.clientCode }), open && !!v.clientCode);
  const openInv = useMemo(() => (invs.data ?? []).map((i) => ({ ...i, open: round2(i.balance - i.pendingClearance) })).filter((i) => i.open > 0 && i.payment !== 'Cancelled').sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [invs.data]);
  useEffect(() => { const x = openInv.find((i) => i.invoiceNo === preset.invoice); if (open && !presetDone && x) { setApps({ [x.invoiceNo]: x.open }); setV((s) => ({ ...s, amount: x.open })); setPresetDone(true); } }, [open, presetDone, openInv, preset.invoice]);
  const applied = round2(Object.values(apps).reduce((a, b) => a + (b || 0), 0));
  const remainder = round2(v.amount - applied);
  const autoApply = () => { let left = v.amount; const out: Record<string, number> = {}; for (const i of openInv) { const x = round2(Math.min(left, i.open)); if (x > 0) { out[i.invoiceNo] = x; left = round2(left - x); } } setApps(out); };
  const over = openInv.find((i) => (apps[i.invoiceNo] ?? 0) > i.open + 0.001);
  const err = !v.clientCode ? 'Select the client' : !v.date ? 'Date is required' : !(v.amount > 0) ? 'Amount must be greater than zero' : remainder < -0.001 ? `Over-applied by ${formatPhp(-remainder)} — reduce the applications` : over ? `Amount exceeds the open balance of ${over.invoiceNo}` : undefined;
  const post = useAction(() => api.billing.receipt({ ...v, checkNo: v.method === 'Check' ? v.checkNo : undefined, bank: ['Check', 'Bank Transfer'].includes(v.method) ? v.bank : undefined, checkDate: v.method === 'Check' ? v.checkDate : undefined, applications: Object.entries(apps).filter(([, a]) => a > 0).map(([invoiceNo, amount]) => ({ invoiceNo, amount })) }),
    { success: (no) => `${no} recorded — awaiting Treasury clearance before the Official Receipt is issued`, onSuccess: () => onClose() });
  const fe = (k: string) => fieldError(post.error, k);
  return (
    <Modal open={open} onClose={onClose} title="Record payment — Provisional Receipt" size="xl" description="The payment is recorded as a Provisional Receipt. Invoices are credited only when Treasury confirms the funds cleared and the Official Receipt is issued (same confirm-before-post gate as portal e-wallet top-ups)."
      footer={<>{err && <span className="mr-auto text-xs text-muted">{err}</span>}<Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={post.isPending} disabled={!!err} onClick={() => post.mutate(undefined)}>Record Provisional Receipt</Button></>}>
      <Stack>
        <FormGrid cols={3}>
          <Select label="Receipt type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as 'PR' | 'NVAR' })} options={[{ value: 'PR', label: 'Provisional Receipt' }, { value: 'NVAR', label: 'Non-VAT acknowledgement' }]} hint={v.type === 'NVAR' ? 'When NVAR applies is pending Finance confirmation' : 'Official Receipt is issued after Treasury clearance'} />
          <Select label="Client" required value={v.clientCode} onChange={(e) => { setV({ ...v, clientCode: e.target.value }); setApps({}); }} placeholder="Select" options={clientOptions} error={fe('clientCode')} />
          <Input label="Date received" required type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} error={fe('date') ?? (!v.date ? 'Required' : undefined)} />
          <MoneyInput label="Amount received" required value={v.amount || ''} onChange={(e) => setV({ ...v, amount: Number(e.target.value) })} error={fe('amount') ?? (v.amount < 0 ? 'Must be greater than zero' : undefined)} />
          <Select label="Method" required value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })} options={opts(METHODS)} hint={methodHint[v.method]} />
          {v.method === 'Check' ? <>
            <Input label="Check no." required value={v.checkNo} onChange={(e) => setV({ ...v, checkNo: e.target.value })} error={fe('checkNo')} placeholder="e.g. CHK-00112" />
            <Input label="Bank" required value={v.bank} onChange={(e) => setV({ ...v, bank: e.target.value })} error={fe('bank')} placeholder="e.g. BDO" />
            <Input label="Check date" required type="date" value={v.checkDate} onChange={(e) => setV({ ...v, checkDate: e.target.value })} error={fe('checkDate')} hint={v.checkDate > v.date ? 'Post-dated check — tracked as PDC until deposited' : undefined} />
          </> : v.method === 'Cash' ? null : <>
            <Input label="Reference (bank / transfer ref.)" required value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} error={fe('reference')} placeholder="e.g. BDO-TRX-0001" />
            {v.method === 'Bank Transfer' && <Input label="Bank" value={v.bank} onChange={(e) => setV({ ...v, bank: e.target.value })} placeholder="e.g. BDO" />}
          </>}
        </FormGrid>
        {v.method === 'E-Wallet' && <Banner tone="info">Client e-wallet top-ups are recorded in E-Wallet; use this only to apply an e-wallet payment to invoices.</Banner>}
        {v.clientCode && (
          <div>
            <div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-medium text-ink-2">Apply to open invoices</p><Button size="sm" variant="secondary" disabled={!v.amount} onClick={autoApply}>Auto-allocate oldest first</Button></div>
            {openInv.length ? <table className="w-full text-[13px]"><thead className="bg-surface-alt text-[11px] uppercase text-muted"><tr><th className="px-2 py-2 text-left">Invoice</th><th className="px-2 py-2 text-left">Bill type</th><th className="px-2 py-2 text-left">Due</th><th className="px-2 py-2 text-right">Balance</th><th className="px-2 py-2 text-right">Awaiting clearance</th><th className="px-2 py-2 text-right">Apply</th></tr></thead>
              <tbody>{openInv.map((i) => <tr key={i.invoiceNo} className={cn('border-t border-line', i.invoiceNo === preset.invoice && 'bg-brand-50/40')}><td className="px-2 py-1.5 font-mono">{i.invoiceNo}</td><td className="px-2 py-1.5 text-xs">{i.billType}</td><td className="px-2 py-1.5">{formatDate(i.dueDate)} <StatusBadge domain="payment" value={i.payment} /></td><td className="px-2 py-1.5 text-right tabular">{formatPhp(i.balance)}</td><td className="px-2 py-1.5 text-right tabular text-muted">{i.pendingClearance ? formatPhp(i.pendingClearance) : '—'}</td>
                <td className="px-2 py-1.5 text-right"><input type="number" min={0} max={i.open} className={cn('h-8 w-32 rounded-md border border-line-strong px-2 text-right', (apps[i.invoiceNo] ?? 0) > i.open + 0.001 && 'border-danger')} value={apps[i.invoiceNo] ?? ''} onChange={(e) => setApps({ ...apps, [i.invoiceNo]: Number(e.target.value) })} placeholder="0.00" aria-label={`Apply to ${i.invoiceNo}`} /></td></tr>)}</tbody></table>
              : <p className="text-sm text-muted">No open invoices — the full amount will be unapplied client credit.</p>}
            <div className="mt-3 flex flex-wrap justify-end gap-6 rounded-lg bg-surface-alt px-4 py-2 text-sm"><span>Received <strong className="tabular">{formatPhp(v.amount)}</strong></span><span>Applied <strong className="tabular">{formatPhp(applied)}</strong></span>
              <span>{remainder < 0 ? 'Over-applied' : 'Unapplied (client credit)'} <strong className={cn('tabular', remainder < 0 && 'text-danger')}>{formatPhp(Math.abs(remainder))}</strong></span></div>
          </div>
        )}
        {!v.clientCode && (
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">Apply to open invoices</p>
            <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted">Choose a client to list its open invoices. You can then apply the amount per invoice (or auto-allocate oldest first); the running Applied / Unapplied totals show here, and anything unapplied is kept as client credit.</p>
          </div>
        )}
        <Textarea label="Notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="e.g. received at cashier, deposit instructions" />
        <FilePicker required={false} label="Receipt scan / attachment" files={v.attachments} onAdd={(names) => setV({ ...v, attachments: [...new Set([...v.attachments, ...names])] })} onClear={() => setV({ ...v, attachments: [] })} hint="Optional — check image, deposit slip or transfer confirmation" />
        <KeyValueGrid cols={3} items={[
          { label: 'Received by', value: <>{userName(user?.userId) ?? '—'} <span className="text-xs font-normal text-muted">(signed-in user, recorded with the time)</span></> },
          { label: 'Branch', value: clientBranch ? <>{clientBranch} <span className="text-xs font-normal text-muted">(client branch — receipt series PR-{clientBranch}-)</span></> : 'Select the client' },
          { label: 'Receipt numbers', value: <span className="text-xs font-normal">PR no. assigned on save. The Official Receipt no. is issued when Treasury confirms clearance on Billing › Receipts (Review → Confirm clearance &amp; issue OR).</span> },
        ]} />
        {err && v.clientCode && v.amount !== 0 && <p className="text-sm text-danger">{err}</p>}
        {post.error && <Banner tone="danger">{errMessage(post.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

function ReceiptDetailModal({ no, onClose }: { no: string; onClose: () => void }) {
  const d = useData(['receipt', no], () => api.billing.receiptDetail(no));
  const { can } = useAuth();
  const [clear, setClear] = useState(false);
  const [cv, setCv] = useState({ clearedAt: today(), clearedAmount: 0, tin: '' });
  const [ask, setAsk] = useState<'bounce' | 'cancel' | null>(null);
  const [print, setPrint] = useState(false);
  const confirm = useAction(() => api.billing.confirmClearance(no, cv), { success: (or) => `Clearance confirmed — ${or} issued and posted to the invoices`, onSuccess: () => setClear(false) });
  const [dep, setDep] = useState<{ depositDate: string; depositSlipNo: string; depositAccount: string } | null>(null);
  const deposit = useAction(() => api.billing.markDeposited(no, dep ?? {}), { success: 'Check marked deposited', onSuccess: () => setDep(null) });
  const applyCredit = useAction(() => api.billing.applyUnapplied(no), { success: (xs) => `Unapplied credit applied to ${xs.map((x) => x.invoiceNo).join(', ')}` });
  const { user } = useAuth();
  const { userName, setting } = useRefLookups();
  const bounce = useAction((reason: string) => api.billing.bounceReceipt(no, reason), { success: (dm) => `Marked bounced — dishonoured-check penalty ${dm} raised for approval`, onSuccess: () => setAsk(null) });
  const cancel = useAction((reason: string) => api.billing.cancelReceipt(no, reason), { success: 'Receipt cancelled and logged', onSuccess: () => setAsk(null) });
  const r = d.data;
  return (
    <>
      <Modal open onClose={onClose} size="xl" title={r ? <span className="flex items-center gap-2"><span className="font-mono">{r.receiptNo}{r.orNo ? ` → ${r.orNo}` : ''}</span><StatusBadge domain="receipt" value={r.status} /></span> : no}
        footer={r && <>
          <Button variant="ghost" icon={<Printer className="size-4" />} onClick={() => setPrint(true)}>Print {r.status === 'OR Issued' ? 'receipt' : 'PR'}</Button>
          {r.status === 'OR Issued' && r.unapplied > 0 && r.purpose !== 'E-wallet funding' && can('fin.receipt', 'edit') && <Button variant="secondary" loading={applyCredit.isPending} onClick={() => applyCredit.mutate(undefined)} title="Applies the unapplied amount to the client's open invoices, oldest due date first">Apply unapplied {formatPhp(r.unapplied)}</Button>}
          {r.status === 'Provisional' && r.method === 'Check' && r.depositStatus === 'Not deposited' && can('fin.receipt', 'edit') && <Button variant="secondary" onClick={() => setDep({ depositDate: r.checkDate && r.checkDate > today() ? r.checkDate : today(), depositSlipNo: '', depositAccount: String(setting('co.payee_bank') ?? '') })}>Mark deposited</Button>}
          {r.status === 'Provisional' && r.method === 'Check' && can('fin.receipt', 'approve') && <Button variant="secondary" onClick={() => setAsk('bounce')}>Mark bounced</Button>}
          {['Provisional', 'OR Issued', 'Cleared'].includes(r.status) && can('fin.receipt', 'edit') && <Button variant="secondary" onClick={() => setAsk('cancel')}>{r.status === 'OR Issued' ? 'Reverse' : 'Cancel'}</Button>}
          {r.status === 'Provisional' && can('fin.receipt', 'approve') && <Button onClick={() => { setCv({ clearedAt: r.checkDate && r.checkDate > today() ? r.checkDate : today(), clearedAmount: r.amount, tin: r.tin ?? '' }); setClear(true); }}>Confirm clearance &amp; issue OR</Button>}
        </>}>
        {!r ? <p className="text-muted">Loading…</p> : <Stack>
          {r.status === 'Provisional' && <Banner tone="warning" title="Awaiting Treasury clearance">Not yet posted to the invoices. Treasury confirms the bank cleared the funds; the Official Receipt is then issued with this PR as reference.{!can('fin.receipt', 'approve') && ' Only Treasury can confirm clearance.'}</Banner>}
          {r.status === 'Bounced' && <Banner tone="danger" title="Bounced / dishonoured">{r.bounceReason ? <>Reason: {r.bounceReason}{r.bouncedByName ? ` · marked by ${r.bouncedByName}` : ''}{r.bouncedAt ? ` · ${formatDateTime(r.bouncedAt)}` : ''}. </> : ''}Invoices stay open — the intended application below was never posted. Penalty {r.penaltyMemoNo ? <Link className="font-mono underline" to={`/billing/memos?memo=${r.penaltyMemoNo}`}>{r.penaltyMemoNo}</Link> : '—'}{r.penalty ? ` ${formatPhp(r.penalty.amount)} (${r.penalty.status})` : ''} — contract dishonoured-check penalty, billed to the invoice once approved.</Banner>}
          {r.status === 'Cancelled' && <Banner tone="warning" title="Cancelled">{r.cancelReason} · {r.cancelledByName}{r.cancelledAt ? ` · ${formatDateTime(r.cancelledAt)}` : ''}</Banner>}
          {r.purpose === 'E-wallet funding' && <Banner tone="info" title="Initial e-wallet funding">This receipt funds the client's e-wallet, so it is not applied to invoices or counted as client credit. Use it on E-wallets › Create e-wallet.</Banner>}
          {r.pdc && r.status === 'Provisional' && r.checkFees && <p className="rounded-lg bg-surface-alt px-3 py-2 text-xs text-muted">Post-dated check. Contract {r.checkFees.contractNo} has a deferred-check fee of {formatPhp(r.checkFees.deferredCheck)} and a dishonoured-check fee of {formatPhp(r.checkFees.dishonoredCheck)} (charged as a debit memo if marked bounced). Whether a PDC by itself triggers the deferred-check fee <Pending /></p>}
          <KeyValueGrid cols={4} items={[
            { label: 'Client', value: r.clientName }, { label: 'TIN', value: r.tin ?? '—' }, { label: 'Date received', value: formatDate(r.date) }, { label: 'Amount', value: formatPhp(r.amount) },
            { label: 'Method', value: r.method }, { label: r.method === 'Check' ? 'Check' : 'Reference', value: r.method === 'Check' ? `${r.bank ?? ''} ${r.checkNo ?? ''}` : r.reference ?? '—' },
            { label: 'Check date', value: r.checkDate ? <>{formatDate(r.checkDate)}{r.pdc && <Badge tone="purple" className="ml-1">PDC</Badge>}</> : '—' }, { label: 'Check / deposit status', value: r.depositStatus ?? '—' },
            { label: 'PR no.', value: <span className="font-mono">{r.receiptNo}</span> }, { label: 'OR no.', value: <span className="font-mono">{r.orNo ?? '—'}</span> },
            { label: 'Clearance date', value: r.clearedAt ? formatDate(r.clearedAt) : '—' }, { label: 'Cleared by (Treasury)', value: r.clearedByName ?? (r.status === 'Provisional' ? 'Set when Treasury confirms' : '—') },
            { label: 'OR issued', value: r.orIssuedAt ? formatDateTime(r.orIssuedAt) : '—' }, { label: 'Recorded by', value: `${r.byName ?? r.by} · ${formatDateTime(r.createdAt)}` },
            { label: 'Branch', value: `${r.branchCode} — ${r.branchName}` },
            { label: 'Deposit', value: r.depositDate ? <>{formatDate(r.depositDate)} · slip {r.depositSlipNo}<p className="text-xs text-muted">{r.depositAccount}{r.depositedByName ? ` · ${r.depositedByName}` : ''}</p></> : r.method === 'Check' ? 'Not deposited yet' : '—' },
            { label: 'Attachments', value: r.attachments?.length ? r.attachments.map((x) => <span key={x} className="flex items-center gap-1 text-xs"><Paperclip className="size-3" />{x}</span>) : <span className="text-xs text-muted">None</span> },
          ]} />
          <table className="w-full text-[13px]"><thead className="bg-surface-alt text-[11px] uppercase text-muted"><tr><th className="px-2 py-2 text-left">Invoice applied</th><th className="px-2 py-2 text-right">Amount applied</th><th className="px-2 py-2 text-right">Invoice balance now</th>{r.status === 'Provisional' && <th className="px-2 py-2 text-right">Balance after clearance</th>}</tr></thead>
            <tbody>{r.invoices.map((a) => <tr key={a.invoiceNo} className="border-t border-line"><td className="px-2 py-1.5"><Link className="font-mono text-brand-600 hover:underline" to={`/billing/invoices/${a.invoiceNo}`}>{a.invoiceNo}</Link>{a.billType && a.billType !== 'Lease' && <span className="ml-1 text-xs text-muted">{a.billType}</span>}{r.status === 'Bounced' && <span className="ml-1 text-xs text-danger">intended — not posted</span>}</td><td className="px-2 py-1.5 text-right tabular">{formatPhp(a.amount)}</td><td className="px-2 py-1.5 text-right tabular">{formatPhp(a.balance)}</td>{r.status === 'Provisional' && <td className="px-2 py-1.5 text-right font-medium tabular">{formatPhp(a.balanceAfter)}</td>}</tr>)}
              <tr className="border-t border-line"><td className="px-2 py-1.5">Unapplied → <Link className="text-brand-600 hover:underline" to={`/credit/status?client=${r.clientCode}`}>client credit</Link> (total available {formatPhp(r.clientCredit)})</td><td className="px-2 py-1.5 text-right tabular">{['Cancelled', 'Bounced'].includes(r.status) ? '—' : formatPhp(r.unapplied)}</td><td />{r.status === 'Provisional' && <td />}</tr></tbody></table>
          {r.notes && <p className="text-sm"><span className="text-muted">Notes:</span> {r.notes}</p>}
          {applyCredit.error && <Banner tone="danger">{errMessage(applyCredit.error)}</Banner>}
          <div><p className="mb-1 text-[13px] font-medium text-ink-2">History &amp; audit</p><ul className="space-y-1 text-sm">{[...r.history.map((h) => ({ at: h.at, who: h.byName, what: h.action, note: h.note })), ...r.audit.map((a) => ({ at: a.at, who: a.byName, what: a.action, note: a.reason }))].sort((a, b) => b.at.localeCompare(a.at)).map((h, k) => <li key={k}><span className="text-xs text-muted">{formatDateTime(h.at)} · {h.who}</span> {h.what}{h.note ? <span className="text-muted"> — {h.note}</span> : null}</li>)}{!r.history.length && !r.audit.length && <li className="text-muted">No entries</li>}</ul></div>
        </Stack>}
      </Modal>
      {r && <Modal open={clear} onClose={() => setClear(false)} title={`Confirm clearance — ${r.receiptNo}`} description="Treasury confirms the bank cleared the funds. This posts the payment to the invoices and issues the Official Receipt."
        footer={<><Button variant="secondary" onClick={() => setClear(false)}>Cancel</Button><Button loading={confirm.isPending} disabled={!cv.clearedAt || !(cv.clearedAmount > 0)} onClick={() => confirm.mutate(undefined)}>Confirm &amp; issue {r.type === 'NVAR' ? 'NVAR' : 'OR'}</Button></>}>
        <Stack>
          <FormGrid cols={3}>
            <Input label="Bank clearance date" required type="date" value={cv.clearedAt} onChange={(e) => setCv({ ...cv, clearedAt: e.target.value })} error={fieldError(confirm.error, 'clearedAt')} />
            <MoneyInput label="Amount cleared by bank" required value={cv.clearedAmount || ''} onChange={(e) => setCv({ ...cv, clearedAmount: Number(e.target.value) })} error={fieldError(confirm.error, 'clearedAmount')} hint={`PR amount ${formatPhp(r.amount)}`} />
            <Input label="Client TIN (printed on OR)" value={cv.tin} onChange={(e) => setCv({ ...cv, tin: e.target.value })} placeholder="e.g. 123-456-789-000" />
          </FormGrid>
          <p className="text-sm"><span className="text-muted">Cleared by (Treasury):</span> {userName(user?.userId)} <span className="text-xs text-muted">— recorded with today's date and time; the Official Receipt no. is issued on confirm</span></p>
          {confirm.error && <Banner tone="danger" title={(confirm.error as { code?: string }).code === 'PR_OR_MISMATCH' ? 'PR / OR mismatch' : undefined}>{errMessage(confirm.error)}</Banner>}
          <p className="text-xs text-muted">GL posting (Cash in Bank / Cash on Hand) follows the Phase 2 General Ledger <Pending q="Q-FIN-11 (DBL-FIN-007)" /></p>
        </Stack>
      </Modal>}
      {r && <Modal open={!!dep} onClose={() => setDep(null)} title={`Mark deposited — ${r.receiptNo}`} description="Record where and when the check was deposited. Treasury then confirms clearance and issues the Official Receipt."
        footer={<><Button variant="secondary" onClick={() => setDep(null)}>Cancel</Button><Button loading={deposit.isPending} disabled={!dep?.depositDate || !dep.depositSlipNo.trim() || !dep.depositAccount.trim()} onClick={() => deposit.mutate(undefined)}>Mark deposited</Button></>}>
        {dep && <Stack>
          <FormGrid cols={3}>
            <Input label="Deposit date" required type="date" min={r.checkDate} max={today()} value={dep.depositDate} onChange={(e) => setDep({ ...dep, depositDate: e.target.value })} error={fieldError(deposit.error, 'depositDate')} hint={r.pdc ? `PDC — not before the check date ${formatDate(r.checkDate)}` : undefined} />
            <Input label="Deposit slip no." required value={dep.depositSlipNo} onChange={(e) => setDep({ ...dep, depositSlipNo: e.target.value })} error={fieldError(deposit.error, 'depositSlipNo')} placeholder="e.g. DS-MNL-061108" />
            <Input label="Bank account deposited to" required value={dep.depositAccount} onChange={(e) => setDep({ ...dep, depositAccount: e.target.value })} error={fieldError(deposit.error, 'depositAccount')} placeholder="e.g. BDO current account ••••3456" />
          </FormGrid>
          {deposit.error && <Banner tone="danger">{errMessage(deposit.error)}</Banner>}
        </Stack>}
      </Modal>}
      <ConfirmDialog open={ask === 'bounce'} onClose={() => setAsk(null)} requireReason tone="danger" loading={bounce.isPending} onConfirm={(reason) => bounce.mutate(reason)} title="Mark check bounced"
        message={`The PR is closed as Bounced, the invoices stay open, and the contract dishonoured-check penalty (${formatPhp(r?.checkFees?.dishonoredCheck ?? 2500)}${r?.checkFees ? ` on ${r.checkFees.contractNo}` : ' default'}) is raised as a Debit Memo for Finance Manager approval. The reason (e.g. DAIF, account closed) is shown on the receipt.`} confirmLabel="Mark bounced" />
      <ConfirmDialog open={ask === 'cancel'} onClose={() => setAsk(null)} requireReason tone="danger" loading={cancel.isPending} onConfirm={(reason) => cancel.mutate(reason)} title={r?.status === 'OR Issued' ? 'Reverse Official Receipt' : 'Cancel Provisional Receipt'}
        message={<>{r?.status === 'OR Issued' ? 'The applied amounts are taken back off the invoices.' : 'Nothing was posted yet.'} The reason and your name are kept in the audit trail. Who may cancel <Pending q="Q-FIN-06" /></>} confirmLabel={r?.status === 'OR Issued' ? 'Reverse' : 'Cancel receipt'} />
      {r && <PrintPreview open={print} onClose={() => setPrint(false)} title={`Receipt ${r.orNo ?? r.receiptNo}`}><ReceiptDocument r={r} /></PrintPreview>}
    </>
  );
}

export function ReceiptPage() {
  const [sp, setSp] = useSearchParams();
  const data = useData(['receipts'], () => api.billing.receipts());
  const { clientOptions } = useRefLookups();
  const { can } = useAuth();
  const [f, setF] = useState({ type: '', client: '', method: '', status: '', from: '', to: '' });
  const newOpen = sp.get('new') === '1' || (!!sp.get('client') && !sp.get('receipt'));
  const detail = sp.get('receipt');
  const rows = (data.data ?? []).filter((r) => (!f.type || r.type === f.type) && (!f.client || r.clientCode === f.client) && (!f.method || r.method === f.method) && (!f.status || r.status === f.status) && (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to));
  const all = data.data ?? [];
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const prov = all.filter((r) => r.status === 'Provisional');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreN = [f.type, f.method].filter(Boolean).length;
  const receiptCsv: [string, (r: ReceiptRow) => unknown][] = [['Receipt #', (r) => r.receiptNo], ['OR #', (r) => r.orNo], ['Type', (r) => r.type], ['Status', (r) => r.status], ['Client', (r) => r.clientName], ['Date', (r) => r.date],
    ['Method', (r) => r.method], ['PDC', (r) => (r.pdc ? 'Yes' : '')], ['Reference / check', (r) => r.reference], ['Check date', (r) => r.checkDate], ['Deposit status', (r) => r.depositStatus], ['Amount', (r) => r.amount],
    ['Applied to', (r) => r.applications.map((a) => `${a.invoiceNo} ${a.amount}`).join('; ')], ['Unapplied', (r) => r.unapplied], ['Cleared', (r) => r.clearedAt], ['Cleared by', (r) => r.clearedByName],
    ['Branch', (r) => r.branchCode], ['Recorded by', (r) => r.byName], ['OR issued', (r) => r.orIssuedAt], ['Deposit date', (r) => r.depositDate], ['Deposit account', (r) => r.depositAccount], ['Bounce / cancel reason', (r) => r.bounceReason ?? r.cancelReason], ['Purpose', (r) => r.purpose]];
  return (
    <>
      <PageHeader title="Receipts (PR → OR)" meta={<ScreenTag id="SCR-36" />} description="Provisional Receipts become Official Receipts and post to invoices once Treasury confirms clearance."
        actions={can('fin.receipt', 'add') && <Button icon={<Plus className="size-4" />} onClick={() => setSp({ new: '1' })}>Record payment</Button>} />
      <Banner tone="warning" className="mb-4">Receipt titles (Official / Provisional / Acknowledgement Receipt) under the EOPT Act are pending Finance confirmation — the invoice is the primary document.</Banner>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Awaiting Treasury clearance" value={`${prov.length} · ${formatPhp(prov.reduce((a, r) => a + r.amount, 0))}`} tone="warning" onClick={() => setF({ ...f, status: 'Provisional' })} />
        <KpiTile label="PDCs not yet deposited" value={all.filter((r) => r.pdc && r.depositStatus === 'Not deposited').length} onClick={() => setF({ ...f, status: 'Provisional', method: 'Check' })} />
        <KpiTile label="Bounced" value={all.filter((r) => r.status === 'Bounced').length} tone="danger" onClick={() => setF({ ...f, status: 'Bounced' })} />
        <KpiTile label="Unapplied client credit" value={formatPhp(all.filter((r) => r.status === 'OR Issued' && r.purpose !== 'E-wallet funding').reduce((a, r) => a + r.unapplied, 0))} tone="success" hint="Official Receipts only (not e-wallet funding) — provisional amounts count once cleared" />
      </div>
      <DataTable<ReceiptRow> data={rows} loading={data.isLoading} onRowClick={(r) => setSp({ receipt: r.receiptNo })} emptyTitle="No receipts match filter"
        footer={<div className="flex flex-wrap justify-between gap-2 text-[12px]"><span className="flex flex-wrap gap-3 text-muted">{(['Provisional', 'OR Issued', 'Bounced', 'Cancelled'] as const).map((s) => { const xs = rows.filter((r) => r.status === s); return xs.length ? <span key={s}>{s} {xs.length} · <span className="tabular">{formatPhp(xs.reduce((a, r) => a + r.amount, 0))}</span></span> : null; })}</span>
          <span className="tabular"><span className="text-muted">{rows.length} receipt{rows.length === 1 ? '' : 's'} · received (excl. bounced / cancelled)</span> <span className="font-bold">{formatPhp(rows.filter((r) => !['Bounced', 'Cancelled'].includes(r.status)).reduce((a, r) => a + r.amount, 0))}</span></span></div>}
        toolbar={<>
          <Select aria-label="Client" value={f.client} onChange={set('client')} placeholder="All clients" options={clientOptions} wrapperClassName="w-52" />
          <Select aria-label="Status" value={f.status} onChange={set('status')} placeholder="All statuses" options={opts(['Provisional', 'Cleared', 'OR Issued', 'Bounced', 'Cancelled'])} />
          <DateRangeFilter label="Date" from={f.from} to={f.to} onChange={(r) => setF({ ...f, ...r })} />
          <Button size="sm" variant="secondary" className="h-9" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>{moreOpen ? 'Fewer filters' : 'More filters'}{moreN > 0 && ` (${moreN})`}</Button>
          <ExportCsv name="receipts" rows={rows} cols={receiptCsv} />
          {moreOpen && <div className="flex w-full flex-wrap items-center gap-2 [&>[data-field]]:w-52">
            <Select aria-label="Type" value={f.type} onChange={set('type')} placeholder="All types" options={[{ value: 'PR', label: 'PR (provisional)' }, { value: 'OR', label: 'OR (official)' }, { value: 'NVAR', label: 'NVAR' }]} />
            <Select aria-label="Method" value={f.method} onChange={set('method')} placeholder="All methods" options={opts(METHODS)} />
          </div>}
        </>}
        columns={[
          // Review 1.2: OR issue date, branch and cashier, deposit date / account, reason and who for bounced / cancelled receipts.
          { accessorKey: 'receiptNo', header: 'Receipt # (PR / OR)', meta: { nowrap: true }, cell: (c) => <><span className="font-mono">{c.getValue<string>()}</span><p className="font-mono text-[11px] text-muted">{c.row.original.type} · {c.row.original.orNo ?? 'OR not yet issued'}</p>{c.row.original.orIssuedAt && <p className="text-[11px] text-muted">OR issued {formatDate(c.row.original.orIssuedAt)}</p>}</> },
          { accessorKey: 'status', header: 'Status', cell: (c) => { const r = c.row.original; return <><StatusBadge domain="receipt" value={c.getValue<string>()} />
            {r.status === 'Bounced' && <p className="max-w-44 whitespace-normal text-[11px] leading-tight text-muted">{r.bounceReason ?? 'Check returned'}{r.bouncedByName ? ` · ${r.bouncedByName}` : ''}{r.penaltyMemoNo && <> · fee <Link className="font-mono text-brand-600 hover:underline" to={`/billing/memos?memo=${r.penaltyMemoNo}`} onClick={(e) => e.stopPropagation()}>{r.penaltyMemoNo}</Link>{r.penaltyAmount ? ` ${formatPhp(r.penaltyAmount)}` : ''}{r.penaltyStatus ? ` (${r.penaltyStatus.toLowerCase()})` : ''}</>}</p>}
            {r.status === 'Cancelled' && <p className="max-w-44 whitespace-normal text-[11px] leading-tight text-muted">{r.cancelReason}{r.cancelledByName ? ` · ${r.cancelledByName}` : ''}</p>}
            {r.purpose === 'E-wallet funding' && <p className="text-[11px] text-muted">e-wallet funding</p>}</>; } },
          { accessorKey: 'clientName', header: 'Client', cell: (c) => <><span className="block min-w-36">{c.getValue<string>()}</span><p className="text-[11px] text-muted">{formatDate(c.row.original.date)} · {c.row.original.branchCode} · by {c.row.original.byName ?? c.row.original.by}</p></> },
          { accessorKey: 'method', header: 'Method / reference', meta: { nowrap: true }, cell: (c) => { const r = c.row.original; return <>{METHOD_LABEL(c.getValue<string>())}{r.pdc && <Badge tone="purple" className="ml-1">PDC</Badge>}{r.reference && <p className="text-[11px] text-muted">{r.reference}</p>}{r.checkDate && <p className="text-[11px] text-muted">dated {formatDate(r.checkDate)} · {r.depositStatus}</p>}{r.depositDate && <p className="text-[11px] text-muted">deposited {formatDate(r.depositDate)} · {r.depositAccount}</p>}</>; } },
          { accessorKey: 'amount', header: 'Amount', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) },
          { id: 'apps', header: 'Applied to', cell: (c) => { const xs = c.row.original.applications; const st = c.row.original.status; return xs.length ? <span title={xs.map((a) => `${a.invoiceNo} · ${formatPhp(a.amount)}`).join('\n')}><span className="font-mono text-xs">{xs[0].invoiceNo}</span>{xs.length > 1 && <span className="ml-1 text-xs text-muted">+{xs.length - 1} more</span>}<p className="text-[11px] text-muted">{formatPhp(xs.reduce((a, x) => a + x.amount, 0))}{st === 'Bounced' || st === 'Cancelled' ? ' · intended, not posted' : st === 'Provisional' ? ' · on clearance' : ''}</p></span> : <span className="text-muted">{c.row.original.purpose === 'E-wallet funding' ? 'E-wallet (not invoices)' : '—'}</span>; } },
          { accessorKey: 'unapplied', header: 'Unapplied', meta: { align: 'right' }, cell: (c) => { const r = c.row.original; return ['Bounced', 'Cancelled'].includes(r.status) ? <span className="text-muted">—</span> : r.purpose === 'E-wallet funding' && r.unapplied > 0 ? <span title="Held for the e-wallet opening — not client credit">{formatPhp(r.unapplied)}<p className="text-[11px] text-muted">for e-wallet</p></span> : c.getValue<number>() > 0 && r.status === 'OR Issued' ? <Link onClick={(e) => e.stopPropagation()} className="text-brand-600 hover:underline" to={`/credit/status?client=${r.clientCode}`}>{formatPhp(c.getValue<number>())}</Link> : formatPhp(c.getValue<number>()); } },
          { accessorKey: 'clearedAt', header: 'Cleared', cell: (c) => (c.getValue() ? <>{formatDate(c.getValue<string>())}<p className="text-[11px] text-muted">{c.row.original.clearedByName}</p></> : '—') },
          { id: 'a', header: '', enableSorting: false, cell: (c) => <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSp({ receipt: c.row.original.receiptNo }); }}>{c.row.original.status === 'Provisional' && can('fin.receipt', 'approve') ? 'Review' : 'View'}</Button> },
        ]} />
      <p className="mt-2 text-xs text-muted">Newest first by date received. Status flow: Provisional → (Treasury confirms clearance) → OR Issued; or Bounced / Cancelled. Receipt numbers come from one counter shared by PR and OR across branches (the branch code is a prefix), so they follow the order recorded. Whether BIR needs a separate series per branch <Pending /></p>
      <RecordPaymentModal open={newOpen} onClose={() => setSp({})} preset={{ client: sp.get('client') ?? undefined, invoice: sp.get('invoice') ?? undefined }} />
      {detail && <ReceiptDetailModal no={detail} onClose={() => setSp({})} />}
    </>
  );
}

// ── SCR-37 Credit / Debit Memo Entry ────────────────────────────────────────
type VatT = 'VAT-exclusive' | 'VAT-inclusive' | 'VAT-exempt';
type Settle = 'Reference invoice' | 'Next invoice' | 'E-wallet';
type MemoForm = { type: 'Credit' | 'Debit'; clientCode: string; referenceInvoiceNo: string; amount: number; reason: string; category: string; evidence: string[]; breakdown: MemoBreakdown; joNo: string; rescueNo: string; memoNo?: string;
  vatTreatment: VatT; whtBase: number; whtRate: number; whtQuarter: string; settlement: Settle | ''; sourceType: string; sourceId: string };
const emptyBreakdown: MemoBreakdown = { labor: 0, parts: 0, travel: 0, service: 0, inputTax: 0 };
const blankMemo = (o: Partial<MemoForm> = {}): MemoForm => ({ type: 'Credit', clientCode: '', referenceInvoiceNo: '', amount: 0, reason: '', category: '', evidence: [], breakdown: { ...emptyBreakdown }, joNo: '', rescueNo: '',
  vatTreatment: 'VAT-inclusive', whtBase: 0, whtRate: 2, whtQuarter: '', settlement: '', sourceType: '', sourceId: '', ...o });
/** Review 1.2: VAT basis labels and what each memo category normally needs. */
const VAT_LABEL: Record<VatT, string> = { 'VAT-inclusive': 'VAT-inclusive (amount includes 12% VAT)', 'VAT-exclusive': 'VAT-exclusive (net — 12% VAT added when billed)', 'VAT-exempt': 'No VAT (e.g. withholding-tax credit, penalty)' };
const vatOf = (amount: number, t?: string) => (t === 'VAT-inclusive' ? round2((amount * 0.12) / 1.12) : t === 'VAT-exclusive' ? round2(amount * 0.12) : t === 'VAT-exempt' ? 0 : undefined);
const CATEGORY_GUIDE: Record<string, string> = {
  'Late-encoding correction': 'Raised automatically from Late encoding (over 7 days). Evidence: outage / incident report. Approvers: Deputy Yard Manager → Treasury.',
  'Withholding-tax adjustment': 'Evidence: BIR Form 2307 for the invoice quarter. Enter the base and rate — the amount is computed. Approver: Finance Manager.',
  'E-wallet offsetting': 'Evidence: e-wallet ledger entry and client instruction. Approver: Finance Manager.',
  'No-rescue service dispute': 'Evidence: client dispute letter and the rescue / service record. Approver: Finance Manager.',
  'Billing correction': 'Evidence: contract rate sheet, gate passes or client acknowledgment showing the error. Approver: Finance Manager.',
  Other: 'Evidence: any document supporting the credit. Approver: Finance Manager.',
  'Rescue billing': 'Raised automatically when a rescue is completed. Evidence: before / after photos and client acknowledgment. Link the rescue.',
  'Repair cost': 'Evidence: JO photos and repair report. Link the Job Order; submit once it is closed with its Accomplishment Report.',
  'Dishonoured check penalty': 'Raised automatically when a check is marked bounced. Evidence: bank return slip. Link the receipt.',
  'Other charges': 'Evidence: computation and supporting document (e.g. Park & Fix receipt). Approver: Finance Manager.',
};
const SOURCE_TYPES = ['Late Encoding', 'Receipt', 'Park & Fix', 'EIR', 'Job Order', 'Rescue'];
type MemoDetail = Awaited<ReturnType<typeof api.billing.memo>>;

function MemoDocument({ m }: { m: MemoDetail }) {
  const b = m.breakdown;
  return (
    <div className="relative">
      <Watermark text={m.status === 'Draft' ? 'DRAFT' : m.status === 'Rejected' ? 'REJECTED' : m.status === 'Pending Approval' ? 'FOR APPROVAL' : undefined} />
      <DocHeader title={m.type === 'Credit' ? 'CREDIT MEMO' : 'DEBIT MEMO'} no={m.memoNo} date={formatDate(m.createdAt)} extra={<p>{m.category}</p>} />
      <p><strong>Client:</strong> {m.client?.billingName ?? m.clientName} ({m.clientCode}) · TIN {m.client?.tin ?? '—'}</p>
      <p><strong>Reference:</strong> {[m.referenceInvoiceNo && `Invoice ${m.referenceInvoiceNo}`, m.joNo && `Job Order ${m.joNo}`, m.rescueNo && `Rescue ${m.rescueNo}`, m.referenceType === 'Receipt' && `Receipt ${m.referenceId}`].filter(Boolean).join(' · ') || '—'}</p>
      <p className="mt-2"><strong>Reason:</strong> {stripCodes(m.reason)}</p>
      {b && <table className="mt-2 w-full border border-black/50"><tbody>{([['Labor', b.labor], ['Parts', b.parts], ['Travel', b.travel], ['Service charge', b.service], ['Input tax', b.inputTax]] as const).map(([k, v]) => <tr key={k}><td className="border border-black/30 px-1 py-0.5">{k}</td><td className="border border-black/30 px-1 py-0.5 text-right">{formatPhp(v)}</td></tr>)}</tbody></table>}
      <p className="mt-2 flex justify-between border-t border-black pt-1 font-bold"><span>{m.type === 'Credit' ? 'TOTAL CREDIT' : 'TOTAL CHARGE'}</span><span>{formatPhp(m.amount)}</span></p>
      <p className="mt-1"><strong>Amount in words:</strong> {amountInWords(m.amount)}</p>
      <p className="mt-1 text-[10px]">Supporting evidence: {(m.evidence ?? []).join(', ') || '—'} · Approval: {(m.approvalChain ?? []).join(' → ')}</p>
      <SignatureBlock items={[{ label: 'Prepared by', name: m.createdByName }, ...(m.workflow?.steps ?? []).map((s) => ({ label: `Approved — ${s.label}`, name: s.decidedBy }))]} />
      <DocFooter copy="ORIGINAL – CLIENT COPY" />
    </div>
  );
}

function MemoFormModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: MemoForm }) {
  const { clientOptions, setting } = useRefLookups();
  const [v, setV] = useState<MemoForm>(initial);
  useEffect(() => { if (open) setV(initial); }, [open, initial]);
  const invs = useData(['invoices', 'client', v.clientCode], () => api.billing.invoices({ client: v.clientCode }), open && !!v.clientCode);
  const links = useData(['memo-links', v.clientCode], () => api.billing.memoLinks(v.clientCode), open && !!v.clientCode && v.type === 'Debit');
  const openInv = (invs.data ?? []).filter((i) => i.payment !== 'Cancelled' && (i.balance > 0 || (v.category === 'Late-encoding correction' && i.hasHeld)));
  const ref = openInv.find((i) => i.invoiceNo === v.referenceInvoiceNo);
  const isDm = v.type === 'Debit';
  const isWht = !isDm && v.category === 'Withholding-tax adjustment';
  const amount = isDm ? debitMemoTotal(v.breakdown) : isWht && v.whtBase > 0 ? round2((v.whtBase * v.whtRate) / 100) : v.amount;
  const { ref: refData, userName } = useRefLookups();
  const { user } = useAuth();
  const clientBranch = refData?.clients.find((c) => c.clientCode === v.clientCode)?.branchCode;
  const chain = memoApprovalChain(v.type, v.category);
  const needsLink = isDm && ['Rescue billing', 'Repair cost'].includes(v.category);
  const errs: Record<string, string | undefined> = {
    clientCode: !v.clientCode ? 'Required' : undefined, category: !v.category ? 'Select a reason category' : undefined, reason: !v.reason.trim() ? 'Required' : undefined,
    amount: !(amount > 0) ? 'Must be greater than zero' : !isDm && ref && v.category !== 'Late-encoding correction' && amount > ref.balance + 0.001 ? `Exceeds invoice balance ${formatPhp(ref.balance)}` : undefined,
    evidence: !v.evidence.length ? 'Attach supporting evidence' : undefined, link: needsLink && !v.joNo && !v.rescueNo ? 'Missing linked Job Order for DM' : undefined,
    settlement: isDm && !v.settlement ? 'Select how the debit memo is settled' : undefined, whtBase: isWht && !(v.whtBase > 0) ? 'Enter the withholding-tax base' : undefined,
  };
  const invalid = Object.values(errs).some(Boolean);
  const [touched, setTouched] = useState(false);
  const save = useAction((draft: boolean) => api.billing.createMemo({ type: v.type, clientCode: v.clientCode, reason: v.reason, category: v.category, evidence: v.evidence, memoNo: v.memoNo, amount, referenceInvoiceNo: v.referenceInvoiceNo || undefined, joNo: v.joNo || undefined, rescueNo: v.rescueNo || undefined, breakdown: isDm ? v.breakdown : undefined, draft,
    vatTreatment: v.vatTreatment, wht: isWht ? { base: v.whtBase, rate: v.whtRate / 100, quarter: v.whtQuarter || undefined } : undefined, settlement: isDm && v.settlement ? v.settlement : undefined, sourceType: v.sourceType || undefined, sourceId: v.sourceId || undefined }),
    { success: (no) => `${no} ${v.memoNo ? 'updated' : 'saved'}`, onSuccess: () => onClose() });
  const e = (k: string) => fieldError(save.error, k) ?? (touched ? errs[k] : undefined);
  const effect = v.category === 'Late-encoding correction' ? 'Releases the held lines to billing at the corrected dates' : v.type === 'Credit' ? (v.referenceInvoiceNo ? 'Reduces that invoice’s balance once applied — on approval, or with Apply to invoice on the memo' : 'Client-level credit — applied later to an invoice (Apply to invoice on the memo)')
    : v.settlement === 'E-wallet' || v.category === 'Rescue billing' ? 'Charge deducted from the client e-wallet' : v.settlement === 'Next invoice' ? 'Billed on the client’s next invoice' : v.referenceInvoiceNo ? 'Increases the invoice balance' : 'Adds a client receivable';
  const bset = (k: keyof MemoBreakdown) => (ev: { target: { value: string } }) => setV({ ...v, breakdown: { ...v.breakdown, [k]: Number(ev.target.value) } });
  return (
    <Modal open={open} onClose={onClose} size="xl" title={v.memoNo ? `Edit draft ${v.memoNo}` : 'New credit / debit memo'} description="Each memo carries a reason category, supporting evidence and an approval route."
      footer={<>{invalid && <span className="mr-auto text-xs text-muted">{!v.clientCode ? 'Choose a client to save a draft; complete the required fields to submit for approval' : 'Complete the required fields to submit for approval'}</span>}<Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="secondary" loading={save.isPending} disabled={!v.clientCode} onClick={() => save.mutate(true)}>Save draft</Button><Button loading={save.isPending} disabled={invalid} onClick={() => { setTouched(true); if (!invalid) save.mutate(false); }}>Submit for approval</Button></>}>
      <Stack>
        <FormGrid cols={3}>
          <Select label="Type" required value={v.type} onChange={(ev) => setV({ ...v, type: ev.target.value as 'Credit' | 'Debit', category: '' })} options={[{ value: 'Credit', label: 'Credit memo' }, { value: 'Debit', label: 'Debit memo' }]} />
          <Select label="Client" required value={v.clientCode} onChange={(ev) => setV({ ...v, clientCode: ev.target.value, referenceInvoiceNo: '', joNo: '', rescueNo: '' })} placeholder="Select" options={clientOptions} error={e('clientCode')} />
          <Select label="Reason category" required value={v.category} onChange={(ev) => setV({ ...v, category: ev.target.value })} placeholder="Select" options={opts(v.type === 'Credit' ? CREDIT_MEMO_CATEGORIES : DEBIT_MEMO_CATEGORIES)} error={e('category')} />
          <Select label="Reference invoice" value={v.referenceInvoiceNo} onChange={(ev) => setV({ ...v, referenceInvoiceNo: ev.target.value })} placeholder={v.clientCode ? 'None — client-level' : 'Select a client first'} disabled={!v.clientCode}
            options={openInv.map((i) => ({ value: i.invoiceNo, label: `${i.invoiceNo} · balance ${formatPhp(i.balance)}` }))} hint="Only this client’s open invoices" error={fieldError(save.error, 'referenceInvoiceNo')} />
          {!isDm && !(isWht && v.whtBase > 0) ? <MoneyInput label="Amount" required value={v.amount || ''} onChange={(ev) => setV({ ...v, amount: Number(ev.target.value) })} error={e('amount')} hint={ref ? `≤ ${formatPhp(ref.balance)}` : undefined} />
            : <Field2 label="Amount (computed)">{formatPhp(amount)}</Field2>}
          <Field2 label="Memo no. · date">Auto on save · {formatDate(new Date().toISOString())}</Field2>
          <Select label="VAT treatment of the amount" required value={v.vatTreatment} onChange={(ev) => setV({ ...v, vatTreatment: ev.target.value as VatT })} options={(Object.keys(VAT_LABEL) as VatT[]).map((k) => ({ value: k, label: VAT_LABEL[k] }))} hint={`VAT in this memo: ${formatPhp(vatOf(amount || 0, v.vatTreatment))} · basis per category pending Finance confirmation`} />
          <Select label="Source record type" value={v.sourceType} onChange={(ev) => setV({ ...v, sourceType: ev.target.value })} placeholder="None" options={opts(SOURCE_TYPES.filter((s) => !isDm || !['Job Order', 'Rescue'].includes(s)))} hint="Late encoding, receipt, Park & Fix, EIR…" />
          <Input label="Source record no." value={v.sourceId} disabled={!v.sourceType} onChange={(ev) => setV({ ...v, sourceId: ev.target.value })} placeholder={v.sourceType === 'Late Encoding' ? 'e.g. LE-00099' : v.sourceType === 'Receipt' ? 'e.g. PR-MNL-00000447' : v.sourceType === 'Park & Fix' ? 'e.g. PF-2' : v.sourceType === 'EIR' ? 'e.g. EIR number' : 'Select a type first'} />
        </FormGrid>
        {v.category && CATEGORY_GUIDE[v.category] && <p className="rounded-lg bg-surface-alt px-3 py-2 text-xs text-muted"><span className="font-medium text-ink-2">{v.category}:</span> {CATEGORY_GUIDE[v.category]}</p>}
        {isWht && <div className="rounded-lg border border-line p-3">
          <p className="mb-2 text-[13px] font-medium text-ink-2">Withholding tax (BIR Form 2307)</p>
          <FormGrid cols={3}>
            <MoneyInput label="Tax base (invoice amount before VAT)" required value={v.whtBase || ''} onChange={(ev) => setV({ ...v, whtBase: Number(ev.target.value) })} hint={ref ? `Invoice ${ref.invoiceNo} subtotal ${formatPhp(ref.subtotal)}` : 'e.g. ₱42,000.00'} />
            <Input label="Rate (%)" type="number" min={0} step={0.5} value={v.whtRate} onChange={(ev) => setV({ ...v, whtRate: Number(ev.target.value) })} hint="2% creditable withholding for leasing (default)" />
            <Input label="2307 quarter" value={v.whtQuarter} onChange={(ev) => setV({ ...v, whtQuarter: ev.target.value })} placeholder="e.g. 2026Q4" hint="Quarter of the invoice date" />
          </FormGrid>
        </div>}
        {isDm && <FormGrid cols={2}>
          <Select label="Settlement" required value={v.settlement} onChange={(ev) => setV({ ...v, settlement: ev.target.value as Settle })} placeholder="Select" options={[{ value: 'Reference invoice', label: 'Add to the reference invoice' }, { value: 'Next invoice', label: 'Bill on the next invoice' }, { value: 'E-wallet', label: 'Deduct from the e-wallet' }]} hint={v.settlement === 'E-wallet' ? 'Deducted from the wallet when posted (rescue, repair, debit memo only)' : v.settlement === 'Reference invoice' ? `Due with the invoice${ref ? ` — ${formatDate(ref.dueDate)}` : ''}` : v.settlement === 'Next invoice' ? 'Due with the next invoice (invoice date + credit term)' : undefined} />
          <Field2 label="Requested by · branch">{userName(user?.userId) ?? '—'} · {clientBranch ?? '—'}</Field2>
        </FormGrid>}
        {!isDm && <p className="text-xs text-muted">Requested by <span className="font-medium text-ink-2">{userName(user?.userId) ?? '—'}</span> (signed-in user) · branch <span className="font-medium text-ink-2">{clientBranch ?? '— (select the client)'}</span></p>}
        {isDm && <div className="rounded-lg border border-line p-3">
          <p className="mb-2 text-[13px] font-medium text-ink-2">Cost breakdown <span className="text-xs text-muted">(VAT / input-tax treatment to be confirmed by Finance)</span></p>
          <FormGrid cols={4}>
            <MoneyInput label="Labor" value={v.breakdown.labor || ''} onChange={bset('labor')} /><MoneyInput label="Parts" value={v.breakdown.parts || ''} onChange={bset('parts')} />
            <MoneyInput label="Travel" value={v.breakdown.travel || ''} onChange={bset('travel')} /><MoneyInput label="Service charge" value={v.breakdown.service || ''} onChange={bset('service')} />
            <MoneyInput label="Input tax" value={v.breakdown.inputTax || ''} onChange={bset('inputTax')} /><Field2 label="Total">{formatPhp(amount)}</Field2>
          </FormGrid>
          <FormGrid cols={2} className="mt-3">
            <Select label="Linked Job Order" required={v.category === 'Repair cost'} value={v.joNo} onChange={(ev) => setV({ ...v, joNo: ev.target.value })} placeholder="None" options={(links.data?.jos ?? []).map((j) => ({ value: j.joNo, label: `${j.joNo} · ${j.chassisNo} · ${j.status}${j.chargeable ? ' · chargeable' : ''}` }))} error={e('link') ?? fieldError(save.error, 'joNo')} />
            <Select label="Linked rescue" required={v.category === 'Rescue billing'} value={v.rescueNo} onChange={(ev) => setV({ ...v, rescueNo: ev.target.value })} placeholder="None" options={(links.data?.rescues ?? []).map((r) => ({ value: r.rescueNo, label: `${r.rescueNo} · ${r.chassisNo}${r.debitMemoNo ? ` · already ${r.debitMemoNo}` : ''}` }))} error={fieldError(save.error, 'rescueNo')} />
          </FormGrid>
        </div>}
        <Textarea label="Reason details" required value={v.reason} onChange={(ev) => setV({ ...v, reason: ev.target.value })} error={e('reason')} placeholder="Explain the memo — e.g. rate overbilled on INV-MNL-00001101" />
        <FilePicker label="Supporting evidence" files={v.evidence} onAdd={(names) => setV({ ...v, evidence: [...new Set([...v.evidence, ...names])] })} onClear={() => setV({ ...v, evidence: [] })} error={e('evidence')}
          hint={isDm ? 'Rescue before/after photos & client acknowledgment, or JO photos / repair report' : 'Scans, BIR 2307, client letter…'} />
        <KeyValueGrid cols={2} items={[
          { label: 'Approval chain', value: <>{chain.map((s) => s.label).join(' → ')} <span className="text-xs text-muted">{v.category === 'Late-encoding correction' ? '(late encoding over 7 days — normally raised automatically from the Late encoding screen)' : '(every manual memo, any amount)'}</span>
            {v.category !== 'Late-encoding correction' && <p className="text-xs text-muted">Amount tiers (e.g. a higher approver above {formatPhp(Number(setting('fin.adjustment_approval_threshold') ?? 5000))}) <Pending /></p>}</> },
          { label: 'Effect', value: effect },
          ...(ref && !isDm ? [{ label: 'Invoice balance', value: <>{formatPhp(ref.balance)} → after this memo {formatPhp(Math.max(0, round2(ref.balance - (amount || 0))))} <span className="text-xs text-muted">(once applied)</span></> }] : []),
          ...(ref && isDm ? [{ label: 'Invoice balance', value: <>{formatPhp(ref.balance)} → after this memo {formatPhp(round2(ref.balance + (amount || 0)))}</> }] : []),
        ]} />
        <p className="text-xs text-muted">Evidence: any file type (PDF, image, scan), required for every category. Withholding-tax credits: attach BIR Form 2307 and enter the base, rate and quarter in the withholding-tax fields.</p>
        {save.error && <Banner tone="danger" title={(save.error as { code?: string }).code === 'MISSING_LINKED_JO' ? 'Missing linked Job Order for DM' : undefined}>{errMessage(save.error)}</Banner>}
      </Stack>
    </Modal>
  );
}
const Field2 = ({ label, children }: { label: string; children: ReactNode }) => <div className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-ink-2">{label}</span><p className="py-2 text-sm font-medium">{children}</p></div>;

function MemoDetailModal({ no, onClose, onEdit }: { no: string; onClose: () => void; onEdit: (m: MemoForm) => void }) {
  const d = useData(['memo', no], () => api.billing.memo(no));
  const { userName } = useRefLookups();
  const { can } = useAuth();
  const [print, setPrint] = useState(false);
  const submit = useAction(() => api.billing.submitMemo(no), { success: `${no} submitted for approval` });
  const discard = useAction(() => api.billing.discardMemo(no), { success: `${no} discarded`, onSuccess: onClose });
  const [applyTo, setApplyTo] = useState<string | null>(null);
  const apply = useAction(() => api.billing.applyMemoToInvoice(no, applyTo ?? undefined), { success: (r) => `${no} applied to ${r.appliedTo} — balance after ${formatPhp(r.balanceAfter)}`, onSuccess: () => setApplyTo(null) });
  const m = d.data; const b = m?.breakdown;
  const target = m?.openInvoices.find((x) => x.invoiceNo === applyTo);
  const src = m ? memoRef(m) : undefined;
  return (
    <>
      <Modal open onClose={onClose} size="xl" title={m ? <span className="flex items-center gap-2"><span className="font-mono">{m.memoNo}</span><StatusBadge domain="memo" value={m.status} /></span> : no}
        footer={m && <>
          <Button variant="ghost" icon={<Printer className="size-4" />} onClick={() => setPrint(true)}>Print memo</Button>
          {m.status === 'Draft' && can('fin.memo', 'add') && <><Button variant="secondary" onClick={() => discard.mutate(undefined)} loading={discard.isPending}>Discard draft</Button>
            <Button variant="secondary" onClick={() => onEdit(blankMemo({ type: m.type, clientCode: m.clientCode, referenceInvoiceNo: m.referenceInvoiceNo ?? '', amount: m.amount, reason: m.reason, category: m.category ?? '', evidence: m.evidence ?? [], breakdown: m.breakdown ?? { ...emptyBreakdown }, joNo: m.joNo ?? '', rescueNo: m.rescueNo ?? '', memoNo: m.memoNo,
              vatTreatment: m.vatTreatment ?? 'VAT-inclusive', whtBase: m.wht?.base ?? 0, whtRate: m.wht ? m.wht.rate * 100 : 2, whtQuarter: m.wht?.quarter ?? '', settlement: m.settlement ?? '', ...(!m.joNo && !m.rescueNo && !['Invoice', 'Other'].includes(m.referenceType) ? { sourceType: m.referenceType, sourceId: m.referenceId ?? '' } : {}) }))}>Edit</Button>
            <Button loading={submit.isPending} onClick={() => submit.mutate(undefined)}>Submit for approval</Button></>}
          {m.status === 'Pending Approval' && <Link to="/approvals"><Button>Open in Inbox</Button></Link>}
          {m.status === 'Approved' && !m.appliedTo && m.category !== 'Late-encoding correction' && can('fin.memo', 'edit') && m.openInvoices.length > 0 && <Button onClick={() => setApplyTo(m.referenceInvoiceNo && m.openInvoices.some((x) => x.invoiceNo === m.referenceInvoiceNo) ? m.referenceInvoiceNo : m.openInvoices[0].invoiceNo)}>Apply to invoice</Button>}
        </>}>
        {!m ? <p className="text-muted">Loading…</p> : <Stack>
          {submit.error && <Banner tone="danger">{errMessage(submit.error)}</Banner>}
          <KeyValueGrid cols={4} items={[
            { label: 'Type · category', value: `${m.type} · ${m.category ?? '—'}` }, { label: 'Client', value: m.clientName }, { label: 'Amount', value: formatPhp(m.amount) }, { label: 'Source', value: <Badge tone={m.source === 'Auto' ? 'info' : 'neutral'} dot={false}>{m.source}</Badge> },
            { label: 'Created', value: `${formatDateTime(m.createdAt)} · ${m.createdByName ?? '—'}` }, { label: 'Reference invoice', value: m.referenceInvoiceNo ? <Link className="font-mono text-brand-600 hover:underline" to={`/billing/invoices/${m.referenceInvoiceNo}`}>{m.referenceInvoiceNo}</Link> : 'None (client-level)' },
            { label: 'Applied to', value: m.appliedTo ? <>{m.appliedTo} · balance after {formatPhp(m.balanceAfter)}{m.appliedByName ? <p className="text-xs text-muted">{m.appliedByName} · {formatDateTime(m.appliedAt)}</p> : null}</> : m.invoice ? <>Not yet — invoice balance {formatPhp(m.invoice.balance)}{m.type === 'Credit' && <p className="text-xs text-muted">after applying {formatPhp(Math.max(0, round2(m.invoice.balance - m.amount)))}</p>}</> : '—' },
            // Review 1.2: one source-record link for every kind (late encoding, receipt, Park & Fix, job order, rescue).
            { label: 'Linked source record', value: src?.id && src.kind !== 'Invoice' ? <><span className="text-xs text-muted">{src.kind} </span>{src.to ? <Link className="font-mono text-brand-600 hover:underline" to={src.to}>{src.id}</Link> : <span className="font-mono">{src.id}</span>}</> : '—' },
            { label: 'Client ledger', value: <Link className="text-brand-600 hover:underline" to={`/credit/soa/${m.clientCode}`}>Statement / ledger →</Link> },
            { label: 'VAT treatment', value: m.vatTreatment ? <>{VAT_LABEL[m.vatTreatment]}<p className="text-xs text-muted">VAT {formatPhp(m.vatAmount)}</p></> : <span className="text-xs text-muted">Not stated</span> },
            { label: 'Submitted for approval', value: m.submittedAt ? formatDateTime(m.submittedAt) : m.status === 'Draft' ? 'Not yet (draft)' : '—' },
            { label: 'Branch', value: m.branchCode ?? '—' },
            ...(m.settlement ? [{ label: 'Settlement', value: m.settlement === 'Reference invoice' ? 'Added to the reference invoice' : m.settlement === 'Next invoice' ? 'Billed on the next invoice' : 'Deducted from the e-wallet' }] : []),
            ...(m.wht ? [{ label: 'Withholding tax', value: <>{formatPhp(m.wht.base)} × {round2(m.wht.rate * 100)}%{m.wht.quarter ? ` · 2307 ${m.wht.quarter}` : ''}</> }] : []),
            ...(m.rejection ? [{ label: 'Rejected', value: <span className="text-danger">{m.rejection.reason ?? '—'}<p className="text-xs text-muted">{m.rejection.byName} · {formatDateTime(m.rejection.at)}</p></span> }] : []),
            ...(m.jo && m.category === 'Repair cost' && m.status === 'Draft' ? [{ label: 'Job order status', value: <>{m.jo.status}{!m.jo.status.startsWith('Closed') && <p className="text-xs text-warning">Submit once the JO is closed with its Accomplishment Report</p>}</> }] : []),
          ]} />
          <p className="text-sm"><span className="text-muted">Reason:</span> {stripCodes(m.reason)}</p>
          {b && <table className="w-full text-[13px]"><thead className="bg-surface-alt text-[11px] uppercase text-muted"><tr>{['Labor', 'Parts', 'Travel', 'Service', 'Input tax', 'Total'].map((h) => <th key={h} className="px-2 py-2 text-right">{h}</th>)}</tr></thead>
            <tbody><tr>{[b.labor, b.parts, b.travel, b.service, b.inputTax, debitMemoTotal(b)].map((x, k) => <td key={k} className="px-2 py-1.5 text-right tabular">{formatPhp(x)}</td>)}</tr></tbody></table>}
          {m.rescue && !b && <p className="text-sm text-muted">Cost breakdown (travel, tire, parts, 10% service, 12% VAT) is on the rescue record <Link className="text-brand-600 hover:underline" to={`/rescue/${m.rescue.rescueNo}`}>{m.rescue.rescueNo}</Link> — total {formatPhp(m.rescue.total)}.</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <div><p className="mb-1 text-[13px] font-medium text-ink-2">Supporting evidence</p>{[...(m.evidence ?? []), ...(m.rescue?.beforePhotos ?? []).map((x) => `before: ${x}`), ...(m.rescue?.afterPhotos ?? []).map((x) => `after: ${x}`)].map((x) => <p key={x} className="flex items-center gap-1.5 text-sm"><Paperclip className="size-3.5 text-muted" />{x}</p>)}
              {m.rescue?.clientAckName && <p className="text-sm">Client acknowledgment: {m.rescue.clientAckName} · {formatDateTime(m.rescue.acknowledgedAt)}</p>}{!m.evidence?.length && !m.rescue && <p className="text-sm text-danger">None attached</p>}</div>
            <div><p className="mb-1 text-[13px] font-medium text-ink-2">Approval chain</p>{m.workflow ? <ApprovalTimeline workflow={m.workflow} userName={(id) => userName(id)} /> : <p className="text-sm text-muted">{(m.approvalChain ?? []).join(' → ')}{m.status === 'Draft' ? ' — starts on submit' : ''}</p>}</div>
          </div>
          <div><p className="mb-1 text-[13px] font-medium text-ink-2">Audit trail</p><ul className="space-y-1 text-sm">{[...m.trail.map((t) => ({ at: t.at, who: t.byName, what: t.action, note: t.note })), ...m.audit.filter((a) => !['memo.submitted', 'memo.draft_saved', 'memo.approved', 'memo.rejected', 'memo.applied'].includes(a.action)).map((a) => ({ at: a.at, who: a.byName, what: a.action, note: a.reason }))].sort((x, y) => y.at.localeCompare(x.at)).map((a, k) => <li key={k}><span className="text-xs text-muted">{formatDateTime(a.at)} · {a.who}</span> {a.what}{a.note ? <span className="text-muted"> — {stripCodes(a.note)}</span> : null}</li>)}</ul></div>
        </Stack>}
      </Modal>
      {m && <Modal open={!!applyTo} onClose={() => setApplyTo(null)} title={`Apply ${m.memoNo} to an invoice`} description={m.type === 'Credit' ? 'The credit reduces the invoice balance and the memo becomes Applied.' : 'The charge is added to the invoice and the memo becomes Applied.'}
        footer={<><Button variant="secondary" onClick={() => setApplyTo(null)}>Cancel</Button><Button loading={apply.isPending} disabled={!target} onClick={() => apply.mutate(undefined)}>Apply {formatPhp(m.amount)}</Button></>}>
        <Stack>
          <Select label="Invoice" required value={applyTo ?? ''} onChange={(e) => setApplyTo(e.target.value)} options={m.openInvoices.map((x) => ({ value: x.invoiceNo, label: `${x.invoiceNo} · balance ${formatPhp(x.balance)} · due ${formatDate(x.dueDate)}${x.invoiceNo === m.referenceInvoiceNo ? ' (reference)' : ''}` }))} />
          {target && <KeyValueGrid cols={3} items={[{ label: 'Balance now', value: formatPhp(target.balance) }, { label: m.type === 'Credit' ? 'Credit' : 'Charge', value: formatPhp(m.amount) }, { label: 'Balance after', value: <strong>{formatPhp(m.type === 'Credit' ? Math.max(0, round2(target.balance - m.amount)) : round2(target.balance + m.amount))}</strong> }]} />}
          {apply.error && <Banner tone="danger">{errMessage(apply.error)}</Banner>}
        </Stack>
      </Modal>}
      {m && <PrintPreview open={print} onClose={() => setPrint(false)} title={`Memo ${m.memoNo}`}><MemoDocument m={m} /></PrintPreview>}
    </>
  );
}

/** One consistent reference (kind label + linked id) for a memo row; receipt-based memos show the receipt, not the invoice. */
function memoRef(m: { rescueNo?: string; joNo?: string; referenceType?: string; referenceId?: string; referenceInvoiceNo?: string }): { kind?: string; id?: string; to?: string } {
  if (m.rescueNo || (m.referenceType === 'Rescue' && m.referenceId)) { const id = m.rescueNo ?? m.referenceId!; return { kind: 'Rescue', id, to: `/rescue/${id}` }; }
  if (m.joNo) return { kind: 'Job order', id: m.joNo, to: `/repair/jo/${m.joNo}` };
  if (m.referenceType === 'Receipt' && m.referenceId) return { kind: 'Receipt', id: m.referenceId, to: `/billing/receipts?receipt=${m.referenceId}` };
  if (m.referenceType === 'Park & Fix' && m.referenceId) return { kind: 'Park & Fix', id: m.referenceId, to: '/allocation/park-fix' };
  if (m.referenceInvoiceNo) return { kind: m.referenceType && m.referenceType !== 'Invoice' ? `${m.referenceType} · invoice` : 'Invoice', id: m.referenceInvoiceNo, to: `/billing/invoices/${m.referenceInvoiceNo}` };
  if (m.referenceId) return { kind: m.referenceType, id: m.referenceId };
  return { kind: m.referenceType };
}

export function MemoPage() {
  const [sp, setSp] = useSearchParams();
  const data = useData(['memos'], () => api.billing.memos());
  const { clientOptions } = useRefLookups();
  const { can } = useAuth();
  const [f, setF] = useState({ type: '', client: '', status: '', source: '', from: '', to: '' });
  const [form, setForm] = useState<MemoForm | null>(null);
  useEffect(() => { if (sp.get('new') === '1') setForm(blankMemo({ clientCode: sp.get('client') ?? '', referenceInvoiceNo: sp.get('invoice') ?? '' })); }, [sp]);
  const detail = sp.get('memo');
  type Row = NonNullable<typeof data.data>[number];
  const rows = (data.data ?? []).filter((m) => (!f.type || m.type === f.type) && (!f.client || m.clientCode === f.client) && (!f.status || m.status === f.status) && (!f.source || m.source === f.source) && (!f.from || m.createdAt.slice(0, 10) >= f.from) && (!f.to || m.createdAt.slice(0, 10) <= f.to));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <PageHeader title="Credit / Debit memos" meta={<ScreenTag id="SCR-37" />} description="Billing corrections. Created automatically for late encoding over 7 days, completed rescues and dishonoured checks; manual memos need Finance Manager approval in the Inbox."
        actions={can('fin.memo', 'add') && <Button icon={<Plus className="size-4" />} onClick={() => setForm(blankMemo())}>New memo</Button>} />
      <DataTable<Row> data={rows} loading={data.isLoading} exportName="memos" onRowClick={(r) => setSp({ memo: r.memoNo })} emptyTitle="No memos match filter"
        toolbar={<>
          <Select aria-label="Type" value={f.type} onChange={set('type')} placeholder="All types" options={[{ value: 'Credit', label: 'Credit' }, { value: 'Debit', label: 'Debit' }]} />
          <Select aria-label="Client" value={f.client} onChange={set('client')} placeholder="All clients" options={clientOptions} wrapperClassName="w-52" />
          <Select aria-label="Status" value={f.status} onChange={set('status')} placeholder="All statuses" options={opts(['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Applied', 'Posted'])} />
          <Select aria-label="Source" value={f.source} onChange={set('source')} placeholder="All sources" options={opts(['Auto', 'Manual'])} wrapperClassName="w-36" />
          <DateRangeFilter label="Created" from={f.from} to={f.to} onChange={(r) => setF({ ...f, ...r })} />
        </>}
        columns={[
          { accessorKey: 'memoNo', header: 'Memo #', meta: { nowrap: true }, cell: (c) => { const n = c.row.original.evidence?.length ?? 0; return <><span className="font-mono">{c.getValue<string>()}</span>
            {(() => { const auto = !n && c.row.original.source === 'Auto'; return <p className={cn('mt-0.5 flex items-center gap-1 text-[11px]', n || auto ? 'text-muted' : 'text-danger')} title={n ? (c.row.original.evidence ?? []).join(', ') : auto ? 'System memo — evidence is on the source record (rescue photos and acknowledgment, Park & Fix receipts)' : 'No supporting evidence attached'}><Paperclip className="size-3" aria-hidden />{n ? `${n} file${n === 1 ? '' : 's'}` : auto ? 'on source record' : 'no evidence'}</p>; })()}</>; } },
          { accessorKey: 'type', header: 'Type / category', cell: (c) => <><Badge tone={c.getValue() === 'Credit' ? 'success' : 'warning'} dot={false}>{c.getValue<string>()}</Badge>{c.row.original.category && <p className="mt-0.5 text-xs text-muted">{c.row.original.category}</p>}</> },
          { accessorKey: 'clientName', header: 'Client', cell: (c) => <>{c.getValue<string>()}<p className="text-[11px] text-muted">{c.row.original.branchCode ?? '—'}</p></> },
          { id: 'ref', header: 'Reference', cell: (c) => { const r = memoRef(c.row.original); const m = c.row.original; return <>
            {r.id ? <p className="text-[11px] text-muted">{r.kind}</p> : null}
            {r.id ? (r.to ? <Link onClick={(e) => e.stopPropagation()} className="whitespace-nowrap font-mono text-brand-600 hover:underline" to={r.to}>{r.id}</Link> : <span className="whitespace-nowrap font-mono">{r.id}</span>) : <span>{r.kind ?? '—'}</span>}
            {m.appliedTo ? <p className="whitespace-nowrap text-[11px] text-muted">applied to <Link onClick={(e) => e.stopPropagation()} className="font-mono text-brand-600 hover:underline" to={`/billing/invoices/${m.appliedTo}`}>{m.appliedTo}</Link> · balance after {formatPhp(m.balanceAfter)}</p> : m.referenceType === 'Rescue' || (m.settlement === 'E-wallet' && m.status === 'Posted') ? <p className="text-[11px] text-muted">applied to e-wallet</p> : m.settlement ? <p className="text-[11px] text-muted">settle: {m.settlement === 'Reference invoice' ? 'on the invoice' : m.settlement === 'Next invoice' ? 'next invoice' : 'e-wallet'}</p> : null}
          </>; } },
          { accessorKey: 'amount', header: 'Amount', meta: { align: 'right' }, cell: (c) => { const m = c.row.original; return <>{formatPhp(c.getValue<number>())}<p className="whitespace-nowrap text-[11px] text-muted" title={m.vatTreatment ? VAT_LABEL[m.vatTreatment] : 'VAT basis not stated'}>{m.vatTreatment === 'VAT-inclusive' ? `incl. VAT ${formatPhp(m.vatAmount)}` : m.vatTreatment === 'VAT-exclusive' ? `net + VAT ${formatPhp(m.vatAmount)}` : m.vatTreatment === 'VAT-exempt' ? 'no VAT' : 'VAT —'}</p></>; } },
          { accessorKey: 'reason', header: 'Reason', cell: (c) => <span className="block min-w-48 max-w-64 whitespace-normal">{stripCodes(c.getValue<string>())}</span> },
          { accessorKey: 'createdAt', header: 'Created', cell: (c) => <><span className="whitespace-nowrap">{formatDateTime(c.getValue<string>())}</span><p className="flex items-center gap-1 text-[11px] text-muted">{c.row.original.createdByName ?? 'system'} · <Badge tone={c.row.original.source === 'Auto' ? 'info' : 'neutral'} dot={false}>{c.row.original.source}</Badge></p></> },
          { accessorKey: 'status', header: 'Status', cell: (c) => { const m = c.row.original; const appr = [m.approvedBy, m.pendingWith && `now with ${m.pendingWith}`].filter(Boolean).join(' · ') || (m.approvalChain ?? []).join(' → '); return <><StatusBadge domain="memo" value={c.getValue<string>()} />{appr && <p className="mt-0.5 min-w-40 max-w-52 whitespace-normal text-[11px] leading-snug text-muted">{appr}</p>}
            {m.pendingDays != null && <p className={cn('text-[11px] leading-snug', m.escalated || m.pendingDays > 7 ? 'font-medium text-danger' : 'text-muted')}>pending {m.pendingDays}d{m.stepDueAt ? ` · step due ${formatDate(m.stepDueAt)}` : ''}{m.escalated ? ' · escalated' : ''}</p>}
            {m.rejection?.reason && <p className="max-w-52 whitespace-normal text-[11px] leading-snug text-danger">Rejected: {m.rejection.reason}</p>}</>; } },
          { id: 'go', header: '', enableSorting: false, cell: () => <ChevronRight className="size-4 text-muted" aria-label="Open memo" /> }]} />
      <p className="mt-2 text-xs text-muted">Amount shows its VAT basis (incl. VAT, net + VAT, or no VAT). “Pending Nd” counts from when the memo was raised and turns red after 7 days; overdue approval steps escalate in My approvals. Open a memo for its evidence files, approval chain and audit trail, and to apply an approved credit to an invoice. Memo numbers are not reused, so a discarded draft leaves a gap in the series (for example CM-000009 and DM-000038 here). Whether the series must be gap-free <Pending /></p>
      {form && <MemoFormModal open onClose={() => { setForm(null); if (sp.get('new')) setSp({}); }} initial={form} />}
      {detail && <MemoDetailModal no={detail} onClose={() => setSp({})} onEdit={(m) => { setSp({}); setForm(m); }} />}
    </>
  );
}
