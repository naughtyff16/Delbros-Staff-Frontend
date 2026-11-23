import { useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, ClipboardCheck, FileText, Info, Plus, RefreshCw, ShoppingCart } from 'lucide-react';
import { api } from '../../lib/api-client';
import { formatDate, formatDateTime, formatNumber, formatPhp, type StockTxnType } from '../../lib/shared';
import {
  ApprovalTimeline, Badge, Banner, Button, Card, CardHeader, ConfirmDialog, DataTable, DateRangeFilter, Drawer, FormGrid, Input, KeyValueGrid, KpiTile, Modal, PageHeader, ReadField, Segmented, Select, Stack, Textarea, cn, type ColumnDef,
} from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, fieldError, useAction, useData, useRefLookups } from '../../shared/hooks';
import { ScreenTag } from '../../shared/components';

const ENTITIES = [{ value: 'DBL', label: 'Delbros Leasing' }, { value: 'NAK', label: 'Nakamura' }, { value: 'KNEX', label: 'KNEX' }];
const entityName = (c?: string) => ENTITIES.find((e) => e.value === c)?.label ?? c ?? '—';
const REGIONS = ['Luzon', 'Visayas', 'Mindanao'] as const;
/** Requirement labels. Adjustment and Return are kept but not named in the requirements — pending client confirmation. */
const TYPE_LABEL: Record<StockTxnType, string> = { Request: 'Request', Issue: 'Issuance', Transfer: 'Transfer', Receive: 'Receiving', Adjustment: 'Adjustment', Return: 'Return' };
const TYPE_TONE: Record<string, 'warning' | 'purple' | 'info' | 'neutral' | 'success'> = { Issue: 'warning', Transfer: 'info', Adjustment: 'purple', Receive: 'success', Request: 'neutral', Return: 'info' };
const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { Posted: 'success', 'Pending Approval': 'warning', Rejected: 'danger', Open: 'info', Fulfilled: 'success', Cancelled: 'neutral' };
const useWarehouses = () => {
  const w = useData(['warehouses'], () => api.inventory.warehouses());
  return (w.data ?? []).map((x) => ({ value: x.code, label: `${x.code} · ${x.branchName}` }));
};

// ── SCR-29 Inventory Summary & Audit ───────────────────────────────────────
export function InventorySummaryPage() {
  const [f, setF] = useState({ warehouse: '', lowOnly: false, region: '', branch: '', category: '', entity: '', varianceOnly: false, pendingPoOnly: false, countDueOnly: false });
  const data = useData(['inv', f], () => api.inventory.balances(f));
  const nation = useData(['inv', 'all'], () => api.inventory.balances());
  const { ref, setting } = useRefLookups();
  const { can } = useAuth();
  const whOptions = useWarehouses();
  /** Merged-cell export keys keep the CSV export and table search complete now that related values share a cell. */
  type Row = NonNullable<typeof data.data>[number] & { partDesc?: string; reqPo?: string };
  const [count, setCount] = useState<Row | null>(null);
  const [pr, setPr] = useState<Row | null>(null);
  const rows: Row[] = (data.data ?? []).map((r) => ({ ...r, partDesc: `${r.partCode} — ${r.description} · ${r.category}`, reqPo: `${r.requestedQty || 0}${r.pendingPo ? ` · pending ${r.pendingPo}` : ''}` }));
  const all = nation.data ?? [];
  const cycle = Number(setting('inv.count_cycle_days') ?? 30), recount = Number(setting('inv.recount_variance_qty') ?? 5);
  const roll = (rs: Row[]) => ({ lines: rs.length, units: rs.reduce((a, r) => a + r.qtyOnHand, 0), value: rs.reduce((a, r) => a + r.value, 0), low: rs.filter((r) => r.low).length, variance: rs.filter((r) => r.variance).length, due: rs.filter((r) => r.countDue).length, pending: rs.filter((r) => r.pendingCount).length });
  const regions = [...REGIONS.map((g) => ({ region: g as string, ...roll(all.filter((r) => r.region === g)) })), { region: 'Nationwide', ...roll(all) }];
  const branchOpts = [...new Map(all.map((r) => [r.branchCode, r.branchName])).entries()].map(([value, label]) => ({ value, label: `${value} — ${label}` }));
  const cats = [...new Set((ref?.parts ?? []).map((p) => p.category))].map((c) => ({ value: c, label: c }));
  const tot = roll(rows);
  const cols: ColumnDef<Row>[] = [
    { accessorKey: 'partDesc', header: 'Part', meta: { wrap: true }, cell: (c) => { const r = c.row.original; return <div className="min-w-52"><p className="font-mono text-xs font-medium">{r.partCode}</p><p>{r.description}</p><p className="text-xs text-muted">{r.category} · {r.weightKg != null ? `${r.weightKg} kg` : '— kg'} · {r.movementClass ?? '—'}</p></div>; } },
    { accessorKey: 'flag', header: 'Stock / audit', cell: (c) => { const r = c.row.original; return <div className="flex flex-col items-start gap-1">{r.flag === 'Recount' ? <Badge tone="danger" icon={undefined}>Needs recount</Badge> : r.flag === 'Low' ? <Badge tone="danger">Low (≤ {r.threshold})</Badge> : <Badge tone="success">OK</Badge>}<Badge tone={r.auditStatus === 'Pending approval' ? 'warning' : r.auditStatus === 'Count due' ? 'danger' : 'neutral'}>{r.auditStatus}</Badge></div>; } },
    { accessorKey: 'warehouseCode', header: 'Warehouse / entity', cell: (c) => <div className="whitespace-nowrap"><p><span className="font-mono text-xs">{c.getValue<string>()}</span> <span className="text-xs text-muted">{c.row.original.region}</span></p><p className="text-xs text-muted">{entityName(c.row.original.entityCode)}</p></div> },
    { accessorKey: 'qtyOnHand', header: 'System qty', meta: { align: 'right' }, cell: (c) => { const r = c.row.original; return <div className="whitespace-nowrap"><p className={cn(r.low && 'font-semibold text-danger')}>{c.getValue<number>()} {r.uom}</p><p className="text-xs text-muted" title="Reorder level (low-stock threshold) and reorder quantity for this part">Reorder ≤ {r.threshold}{r.reorderQty ? ` · qty ${r.reorderQty}` : ''}</p>{r.bin && <p className="text-xs text-muted">Bin {r.bin}</p>}</div>; } },
    { accessorKey: 'reqPo', header: 'Requested / on order', meta: { align: 'right' }, sortingFn: (a, b) => (a.original.requestedQty || 0) - (b.original.requestedQty || 0), cell: (c) => { const r = c.row.original; return <div className="whitespace-nowrap">{r.requestedQty ? <p title="Open inter-branch requests against this stockroom">{r.requestedQty} requested</p> : <p>—</p>}{r.pendingPo && <p className="text-xs text-muted"><Link className="font-mono text-brand-600 hover:underline" to="/procurement?tab=po" title="Pending purchase order">{r.pendingPo}</Link>{r.pendingPoInfo && <> · {r.pendingPoInfo.qty} due {formatDate(r.pendingPoInfo.deliveryDate)}</>}</p>}{r.pendingPoInfo && <p className="text-xs text-muted">{r.pendingPoInfo.status}</p>}</div>; } },
    { accessorKey: 'available', header: 'Available', meta: { align: 'right' } },
    { accessorKey: 'value', header: 'Value', meta: { align: 'right' }, cell: (c) => <div className="whitespace-nowrap"><p>{formatPhp(c.getValue<number>())}</p><p className="text-xs text-muted">@ {formatPhp(c.row.original.unitCost)}</p>{c.row.original.supplierName && <p className="text-xs text-muted">{c.row.original.supplierName}</p>}</div> },
    { accessorKey: 'lastPhysicalCount', header: 'Last count', meta: { align: 'right' }, cell: (c) => (c.getValue() == null ? '—' : <span className="whitespace-nowrap">{c.getValue<number>()} <span className="text-xs text-muted">· {formatDate(c.row.original.lastCountDate)}</span></span>) },
    { accessorKey: 'variance', header: 'Variance', meta: { align: 'right' }, cell: (c) => { const v = c.getValue<number | null>(); const r = c.row.original; return <div className="whitespace-nowrap">{v == null ? '—' : <span className={cn(v !== 0 && 'font-semibold', r.needsRecount ? 'text-danger' : v !== 0 && 'text-warning')}>{v > 0 ? `+${v}` : v}</span>}
      {r.pendingCount && <p className="max-w-48 whitespace-normal text-xs text-muted" title={r.pendingCount.reason}>Recount {r.pendingCount.counted} pending approval · by {r.countBy}{r.pendingCount.reason ? ` · ${r.pendingCount.reason}` : ''}</p>}
      {r.pendingAdj && <p className="text-xs text-muted">Adjustment <Link className="font-mono text-brand-600 hover:underline" to="/inventory/transactions">{r.pendingAdj}</Link> pending</p>}
      {v != null && v !== 0 && !r.pendingCount && !r.pendingAdj && <p className="text-xs text-muted">No adjustment submitted</p>}</div>; } },
    { id: 'a', header: '', cell: (c) => { const r = c.row.original; return <span className="flex flex-col items-end gap-0.5">
      {r.low && !r.pendingPo && can('prc.pr', 'add') && <Button size="sm" variant="ghost" className="whitespace-nowrap px-2" aria-label={`Create PR for ${r.partCode}`} title="Create purchase request" icon={<ShoppingCart className="size-4" />} onClick={() => setPr(r)}>Create PR</Button>}
      {can('inv.txn', 'edit') && (r.pendingCount
        ? <span className="inline-flex h-8 items-center gap-1 whitespace-nowrap px-2 text-xs text-muted" title="Count awaiting approval"><ClipboardCheck className="size-4 opacity-50" />Count pending</span>
        : <Button size="sm" variant="ghost" className="whitespace-nowrap px-2" aria-label={`Record physical count for ${r.partCode}`} title="Record physical count" icon={<ClipboardCheck className="size-4" />} onClick={() => setCount(r)}>Count</Button>)}
    </span>; } },
  ];
  return (
    <>
      <PageHeader title="Inventory summary & audit" meta={<ScreenTag id="SCR-29" />} description="Stock by part, warehouse and region; physical-count variance, low-stock flags, requested stock and pending replenishment."
        actions={<><Link to="/inventory/transactions"><Button variant="secondary" icon={<FileText className="size-4" />}>Stock transactions (ledger)</Button></Link>{can('prc.pr', 'add') && <Link to="/procurement"><Button>Create PR</Button></Link>}</>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <KpiTile label="Stock value" value={formatPhp(tot.value)} /><KpiTile label="Low-stock lines" value={tot.low} tone="danger" onClick={() => setF({ ...f, lowOnly: !f.lowOnly })} />
        <KpiTile label="Lines with variance" value={tot.variance} tone="warning" onClick={() => setF({ ...f, varianceOnly: !f.varianceOnly })} /><KpiTile label="Needs recount" value={rows.filter((r) => r.needsRecount).length} tone="danger" hint={`Lines where counted vs system differs by ${recount}+ units`} />
        <KpiTile label="Count due" value={tot.due} tone="warning" hint={`> ${cycle} days since count`} onClick={() => setF({ ...f, countDueOnly: !f.countDueOnly })} /><KpiTile label="Pending POs" value={new Set(rows.map((r) => r.pendingPo).filter(Boolean)).size} onClick={() => setF({ ...f, pendingPoOnly: !f.pendingPoOnly })} />
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <div className="px-5 pt-4"><CardHeader title="Regional roll-up" description="Click a region to filter the stock lines." /></div>
          <table className="w-full text-[13px]">
            <thead className="bg-surface-alt text-[11px] uppercase tracking-wide text-muted"><tr>{['Region', 'Lines', 'Units', 'Value', 'Low', 'Variance', 'Count due', 'Awaiting approval'].map((h, i) => <th key={h} className={cn('px-3 py-2 text-left font-semibold', i > 0 && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>{regions.map((g) => (
              <tr key={g.region} onClick={() => setF({ ...f, region: g.region === 'Nationwide' || f.region === g.region ? '' : g.region, branch: '', warehouse: '' })} className={cn('cursor-pointer border-t border-line hover:bg-brand-50/50', g.region === 'Nationwide' && 'font-semibold', f.region === g.region && 'bg-brand-50')}>
                <td className="px-3 py-2">{g.region}</td><td className="px-3 py-2 text-right tabular">{g.lines}</td><td className="px-3 py-2 text-right tabular">{formatNumber(g.units)}</td><td className="px-3 py-2 text-right tabular">{formatPhp(g.value)}</td>
                <td className="px-3 py-2 text-right tabular">{g.low}</td><td className="px-3 py-2 text-right tabular">{g.variance}</td><td className="px-3 py-2 text-right tabular">{g.due}</td><td className="px-3 py-2 text-right tabular">{g.pending}</td>
              </tr>))}</tbody>
          </table>
          {regions.some((g) => g.region !== 'Nationwide' && !g.lines) && <p className="px-5 py-2 text-xs text-muted">Regions with no stockroom in the demo data show 0.</p>}
        </Card>
        <Card>
          <CardHeader title="Count & audit cycle" />
          <ul className="space-y-2 text-[13px] text-ink-2">
            <li><strong>Monthly cycle count</strong> — every line is due {cycle} days after its last count.</li>
            <li><strong>Annual audit</strong> — full count at year-end, recorded with the same dialog (audit type “Annual audit”).</li>
            <li><strong>Pre-audit submission</strong> — a count with variance is submitted with a reason and bin-card photo.</li>
            <li><strong>Approval</strong> — APS / MMG Manager approves in the Inbox; only then is the variance posted to the ledger as an adjustment.</li>
          </ul>
          <Link to="/approvals" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">{all.filter((r) => r.pendingCount).length} count(s) awaiting approval →</Link>
        </Card>
      </div>
      {data.isError && <Banner tone="danger" className="mb-4" title="Could not load stock balances" actions={<Button size="sm" variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => data.refetch()}>Retry</Button>}>{errMessage(data.error)}</Banner>}
      <DataTable data={rows} loading={data.isLoading} columns={cols} exportName="inventory" emptyTitle="No stock lines match the filters" emptyHint="Clear a filter or pick another region / warehouse."
        footer={rows.length > 0 && <div className="flex flex-wrap justify-end gap-6 text-[13px]"><span>Total lines <strong className="tabular">{tot.lines}</strong></span><span>Units on hand <strong className="tabular">{formatNumber(tot.units)}</strong></span><span>Requested <strong className="tabular">{rows.reduce((a, r) => a + r.requestedQty, 0)}</strong></span><span>Stock value <strong className="tabular">{formatPhp(tot.value)}</strong></span></div>}
        rowClassName={(r) => (r.needsRecount ? 'bg-danger-bg/40' : r.low ? 'bg-danger-bg/20' : undefined)}
        toolbar={<>
          <Select aria-label="Region" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} placeholder="Nationwide" options={REGIONS.map((r) => ({ value: r, label: r }))} />
          <Select aria-label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={branchOpts} />
          <Select aria-label="Warehouse" value={f.warehouse} onChange={(e) => setF({ ...f, warehouse: e.target.value })} placeholder="All warehouses" options={whOptions} />
          <Select aria-label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="All categories" options={cats} />
          <Select aria-label="Entity" value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })} placeholder="All entities" options={ENTITIES} />
          <span className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick filters">
            {([['lowOnly', 'Low stock'], ['varianceOnly', 'Variance only'], ['pendingPoOnly', 'Pending PO'], ['countDueOnly', 'Count due']] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={f[k]} onClick={() => setF({ ...f, [k]: !f[k] })} className={cn('whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium', f[k] ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-2 hover:border-brand-300')}>{l}</button>))}
          </span>
        </>} />
      <p className="mt-2 text-xs text-muted">Low stock = the lower of system and last counted quantity is at or below the part's own reorder level (shown as “Reorder ≤ n” and “Low (≤ n)”; set per part in Admin → Parts, default {Number(setting('inv.low_stock_default') ?? 5)} for new parts). Needs recount = counted and system quantity differ by {recount} or more units. Variance is posted only after the count or adjustment is approved. Available = system qty minus quantities reserved by open inter-branch requests (Requested); it equals system qty when nothing is requested. Recount threshold ±{recount} units; count cycle {cycle} days.</p>
      {count && <CountDialog row={count} onClose={() => setCount(null)} />}
      {pr && <CreatePrDialog row={pr} onClose={() => setPr(null)} />}
    </>
  );
}

type BalRow = Awaited<ReturnType<typeof api.inventory.balances>>[number];

function CountDialog({ row, onClose }: { row: BalRow; onClose: () => void }) {
  const [v, setV] = useState({ counted: row.qtyOnHand, auditType: 'Monthly cycle count' as 'Monthly cycle count' | 'Annual audit', reason: '', photoName: '' });
  const variance = v.counted - row.qtyOnHand;
  const post = useAction(() => api.inventory.submitCount({ partCode: row.partCode, warehouseCode: row.warehouseCode, ...v, photoName: v.photoName || undefined }), {
    success: (r) => (r.pendingApproval ? `Count submitted — variance ${r.variance > 0 ? '+' : ''}${r.variance} awaits APS approval before posting` : 'Count recorded — no variance'), onSuccess: onClose,
  });
  const missing = variance !== 0 && (!v.reason.trim() || !v.photoName);
  return (
    <Modal open onClose={onClose} title={`Physical count — ${row.partCode} @ ${row.warehouseCode}`} description={`${row.description} · last counted ${formatDate(row.lastCountDate)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={post.isPending} disabled={!(v.counted >= 0) || missing} onClick={() => post.mutate(undefined)}>{variance === 0 ? 'Record count' : 'Submit for approval'}</Button></>}>
      <Stack>
        <FormGrid>
          <Select label="Audit type" value={v.auditType} onChange={(e) => setV({ ...v, auditType: e.target.value as typeof v.auditType })} options={[{ value: 'Monthly cycle count', label: 'Monthly cycle count' }, { value: 'Annual audit', label: 'Annual audit' }]} />
          <ReadField label="System quantity">{row.qtyOnHand} {row.uom}</ReadField>
          <Input label="Counted quantity" required type="number" min={0} placeholder="e.g. 12" value={v.counted} onChange={(e) => setV({ ...v, counted: Number(e.target.value) })} error={fieldError(post.error, 'counted')} />
          <ReadField label="Variance"><span className={cn('font-semibold tabular', variance !== 0 && 'text-warning')}>{variance > 0 ? `+${variance}` : variance}</span></ReadField>
        </FormGrid>
        <Input label="Bin-card photo" required={variance !== 0} type="file" accept="image/*" onChange={(e) => setV({ ...v, photoName: e.target.files?.[0]?.name ?? '' })} error={fieldError(post.error, 'photo')} hint={v.photoName || 'Photo of the bin card as count evidence'} />
        <Textarea label="Reason for variance" required={variance !== 0} placeholder="Explain the difference — e.g. 2 units issued but not posted" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} error={fieldError(post.error, 'reason')} />
        {variance !== 0 && <Banner tone="warning">This count goes to the APS / MMG Manager as a pre-audit submission. The system balance is adjusted by {variance > 0 ? `+${variance}` : variance} only after approval.</Banner>}
        {post.error && <Banner tone="danger">{errMessage(post.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

function CreatePrDialog({ row, onClose }: { row: BalRow; onClose: () => void }) {
  const { ref } = useRefLookups();
  const part = ref?.parts.find((p) => p.partCode === row.partCode);
  const [qty, setQty] = useState(Math.max(1, part?.reorderQty ?? row.threshold * 3 - row.effectiveQty));
  const [just, setJust] = useState(`Low stock at ${row.warehouseCode}: ${row.effectiveQty} ${row.uom} (threshold ${row.threshold}).`);
  const create = useAction(() => api.procurement.createPr({ department: 'Stockroom', justification: just, entityCode: row.entityCode, lines: [{ partCode: row.partCode, description: row.description, qty, estUnitCost: row.unitCost }] }), { success: (no) => `${no} created and routed for approval`, onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Create PR — ${row.partCode}`} description={row.description}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={create.isPending} disabled={!(qty > 0) || !just.trim()} onClick={() => create.mutate(undefined)}>Create PR</Button></>}>
      <Stack>
        <FormGrid>
          <Input label="Quantity" required type="number" min={1} placeholder="e.g. 5" value={qty} onChange={(e) => setQty(Number(e.target.value))} hint={`Unit cost ${formatPhp(row.unitCost)} · est. ${formatPhp(qty * row.unitCost)}`} />
          <ReadField label="Entity">{entityName(row.entityCode)}</ReadField>
        </FormGrid>
        <Textarea label="Justification" required placeholder="Why this is needed — e.g. stock for open job orders" value={just} onChange={(e) => setJust(e.target.value)} />
        {create.error && <Banner tone="danger">{errMessage(create.error)}</Banner>}
      </Stack>
    </Modal>
  );
}

// ── SCR-28 Stock Transaction Entry & ledger ────────────────────────────────
type TxnRow = Awaited<ReturnType<typeof api.inventory.txns>>[number];
type LedgerRow = TxnRow & { txnText: string; typeText: string; partText: string; whText: string; refText: string };
const EMPTY = { type: 'Receive' as StockTxnType, partCode: '', qty: 1, fromWarehouse: 'WH-MNL', toWarehouse: '', referenceType: '', referenceId: '', reason: '', entityCode: 'DBL', joNo: '', equipmentRef: '', approvalRef: '', poNo: '', department: '', requestedBy: '', damagedQty: 0, remarks: '',
  deliveryRef: '', bin: '', receivedBy: '', attachment: '', neededBy: '', priority: 'Normal' as 'Normal' | 'Urgent' };

/** Entity meaning depends on the direction of the movement (BR-13). */
const ENTITY_HINT: Record<StockTxnType, string> = {
  Receive: 'Company that owns the stock received (defaults from the PO)', Issue: 'Company whose stock is issued (deducted)', Transfer: 'Company that owns the stock being moved',
  Request: 'Company that owns the requested stock', Adjustment: 'Company whose stock balance is adjusted', Return: 'Company that owns the returned stock',
};
const POSTING_RULES ='Request · Issuance · Transfer · Receiving. Stock never goes negative. Transfers and adjustments post only after APS / MMG Manager approval. PO receipts and job-order issues post automatically. A request moves no stock: it is fulfilled as a transfer from the supplying warehouse, or cancelled. Value = quantity × unit cost (PO price for receipts, standard cost otherwise).';

function RefLink({ t }: { t: TxnRow }) {
  const id = t.referenceId;
  if (!id) return <>—</>;
  const to = t.referenceType === 'JO' ? `/repair/jo/${id}` : ['RR', 'PO'].includes(t.referenceType ?? '') ? '/procurement' : t.referenceType === 'Count' ? '/approvals' : undefined;
  // The type label is dropped when the ID already carries it (JO-…, RR-…, PO-…).
  return <span className="whitespace-nowrap">{!id.startsWith(`${t.referenceType}-`) && `${t.referenceType} `}{to ? <Link className="font-mono text-brand-600 hover:underline" to={to} onClick={(e) => e.stopPropagation()}>{id}</Link> : <span className="font-mono">{id}</span>}</span>;
}

export function StockTransactionPage() {
  const [f, setF] = useState({ type: '', warehouse: '', entity: '', from: '', to: '', partCode: '', status: '' });
  const [view, setView] = useState<'all' | 'pending'>('all');
  const data = useData(['txns', f, view], () => api.inventory.txns({ ...f, status: view === 'pending' ? 'Pending Approval' : f.status }));
  const pendingN = useData(['txns', 'pending-count'], () => api.inventory.txns({ status: 'Pending Approval' }));
  const { ref, userName } = useRefLookups();
  const { can } = useAuth();
  const whOptions = useWarehouses();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<TxnRow | null>(null);
  const partOptions = (ref?.parts ?? []).map((p) => ({ value: p.partCode, label: `${p.partCode} — ${p.description}` }));
  const route = (r: TxnRow) => (r.type === 'Request' ? `${r.toWarehouse} → ${r.fromWarehouse}` : r.toWarehouse ? `${r.fromWarehouse} → ${r.toWarehouse}` : r.fromWarehouse);
  // Related values share a cell so the ledger fits the page; the *Text keys keep CSV export and search complete.
  const rows: LedgerRow[] | undefined = data.data?.map((r) => ({
    ...r, txnText: `${r.txnNo} · ${r.at} · ${userName(r.by)}`, typeText: `${TYPE_LABEL[r.type]} · ${r.status}`, partText: `${r.partCode} — ${r.description ?? ''}`,
    whText: `${route(r)} · ${entityName(r.entityCode)}`, refText: [r.referenceType, r.referenceId, r.source].filter(Boolean).join(' · '),
  }));
  const cols: ColumnDef<LedgerRow>[] = [
    { accessorKey: 'at', header: 'Date / time', cell: (c) => <div className="whitespace-nowrap"><p>{formatDateTime(c.getValue<string>())}</p><p className="text-xs text-muted">{userName(c.row.original.by)}</p></div> },
    { accessorKey: 'txnText', header: 'Txn', cell: (c) => <span className="font-mono">{c.row.original.txnNo}</span> },
    { accessorKey: 'typeText', header: 'Type / status', cell: (c) => { const r = c.row.original; return <div className="flex flex-col items-start gap-1"><Badge tone={TYPE_TONE[r.type]} dot={false}>{TYPE_LABEL[r.type]}</Badge><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
      {r.waitingFor && <span className="whitespace-nowrap text-xs text-muted">Waiting: {r.waitingFor === 'APS approval' ? 'APS / MMG Manager' : r.waitingFor}</span>}
      {!r.waitingFor && r.decidedBy && <span className="whitespace-nowrap text-xs text-muted">{r.decision} by {userName(r.decidedBy)} · {formatDate(r.decidedAt)}</span>}
      {r.type === 'Request' && r.fulfilledBy && <span className="whitespace-nowrap text-xs text-muted">→ {r.fulfilledBy}</span>}</div>; } },
    { accessorKey: 'partText', header: 'Part', meta: { nowrap: true }, cell: (c) => <div className="min-w-44"><p className="whitespace-nowrap font-mono text-xs font-medium">{c.row.original.partCode}</p><p className="max-w-64 whitespace-normal text-xs text-muted">{c.row.original.description}</p></div> },
    { accessorKey: 'qty', header: 'Qty', meta: { align: 'right' }, cell: (c) => { const r = c.row.original; const u = r.uom ? <span className="text-xs text-muted"> {r.uom}</span> : null; return r.type === 'Request' ? <Badge tone="neutral" dot={false}>{r.qty} {r.uom} requested</Badge> : <span className="whitespace-nowrap">{r.qty > 0 ? <span className="text-success" title="Stock in">+{r.qty}</span> : r.qty < 0 ? <span className="text-danger" title="Stock out">{r.qty}</span> : '0'}{u}</span>; } },
    { accessorKey: 'whText', header: 'From → to', cell: (c) => { const r = c.row.original; return <div className="whitespace-nowrap"><p className="font-mono text-xs">{route(r)}</p><p className="text-xs text-muted">{entityName(r.entityCode)}</p></div>; } },
    { accessorKey: 'balanceAfter', header: 'Balance after', meta: { align: 'right' }, cell: (c) => { const r = c.row.original;
      // Pending rows have not moved stock yet: show the projected balance, clearly labelled. Requests never move stock.
      if (r.status === 'Pending Approval') return <div className="whitespace-nowrap" title={`Stock now ${r.balanceAfter}; this balance applies only if approved`}><p className="italic text-muted">{r.toWarehouse ? `${r.fromWarehouse}: ` : ''}{r.balanceAfter + r.qty}</p><p className="text-xs text-muted">projected</p>{r.type === 'Transfer' && r.toWarehouse && <p className="text-xs text-muted" title="Destination balance now; rises by the transfer quantity on approval">{r.toWarehouse}: {r.toOnHand} → {(r.toOnHand ?? 0) - r.qty}</p>}</div>;
      if (r.type === 'Request') return <div className="whitespace-nowrap" title="Requests do not move stock"><p>{r.toWarehouse}: {r.toOnHand}</p><p className="text-xs text-muted">{r.fromWarehouse}: {r.fromOnHand} · unchanged</p></div>;
      if (r.type === 'Transfer' && r.toWarehouse) return <div className="whitespace-nowrap"><p>{r.fromWarehouse}: {r.balanceAfter}</p><p className="text-xs text-muted" title="Destination warehouse balance now">{r.toWarehouse}: {r.toOnHand}</p></div>;
      return r.balanceAfter; } },
    { accessorKey: 'value', header: 'Value', meta: { align: 'right' }, cell: (c) => <div className="whitespace-nowrap"><p>{formatPhp(c.getValue<number>())}</p><p className="text-xs text-muted">@ {formatPhp(c.row.original.unitCost)}</p></div> },
    { accessorKey: 'refText', header: 'Reference / source', meta: { nowrap: true }, cell: (c) => { const r = c.row.original; return <div className="flex flex-col items-start gap-1"><RefLink t={r} />
      {r.type === 'Issue' && r.equipmentRef && <span className="text-xs text-muted">Chassis <Link className="font-mono text-brand-600 hover:underline" to={`/chassis/${r.equipmentRef}`} onClick={(e) => e.stopPropagation()}>{r.equipmentRef}</Link></span>}
      {r.referenceType === 'Count' && r.countDate && <span className="text-xs text-muted">Counted {formatDate(r.countDate)} · submitted {formatDate(r.at)}</span>}
      {r.deliveryRef && <span className="text-xs text-muted">DR / invoice <span className="font-mono">{r.deliveryRef}</span></span>}
      {(r.reason || r.remarks) && <span className="max-w-56 truncate text-xs text-muted" title={[r.reason, r.remarks].filter(Boolean).join(' · ')}>{r.reason ?? r.remarks}</span>}
      {r.source.startsWith('Auto') ? <Badge tone="info" dot={false}>{r.source === 'Auto — PO' && r.poNo ? `Auto — ${r.poNo}` : r.source}</Badge> : <span className="text-xs text-muted">Manual entry</span>}</div>; } },
  ];
  return (
    <>
      <PageHeader title="Stock transactions" meta={<><ScreenTag id="SCR-28" /><span tabIndex={0} aria-label={POSTING_RULES} title={POSTING_RULES} className="inline-flex cursor-help items-center gap-1 text-xs text-muted"><Info className="size-4" aria-hidden />Posting rules</span></>} description="Stock ledger — every inbound and outbound movement with its source reference."
        actions={can('inv.txn', 'add') && <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New transaction</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={view} onChange={setView} options={[{ value: 'all', label: 'All movements' }, { value: 'pending', label: `Pending approval (${pendingN.data?.length ?? 0})` }]} />
        {view === 'pending' && <span className="text-xs text-muted">Transfers and adjustments wait here until the APS / MMG Manager decides in the <Link to="/approvals" className="text-brand-600 hover:underline">Inbox</Link>.</span>}
        {/* Date range and count sit on this row so the table toolbar fits on one line. */}
        <span className="ml-auto flex flex-wrap items-center gap-3"><DateRangeFilter label="Date" from={f.from} to={f.to} onChange={(d) => setF({ ...f, ...d })} /><span className="whitespace-nowrap text-[13px] text-muted">{data.data?.length ?? 0} movements · newest first</span></span>
      </div>
      {data.isError && <Banner tone="danger" className="mb-4" title="Could not load the stock ledger" actions={<Button size="sm" variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => data.refetch()}>Retry</Button>}>{errMessage(data.error)}</Banner>}
      <DataTable<LedgerRow> data={rows} initialSort={[{ id: 'at', desc: true }]} loading={data.isLoading} exportName="stock-ledger" columns={cols} onRowClick={setSel}
        emptyTitle={view === 'pending' ? 'Nothing waiting for approval' : 'No stock movements match the filters'} emptyHint={view === 'pending' ? undefined : 'Clear a filter or widen the date range.'}
        rowClassName={(r) => (r.status === 'Pending Approval' ? 'bg-warning-bg/30' : r.status === 'Rejected' ? 'text-muted line-through' : undefined)}
        toolbar={<>
          <Select aria-label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="All types" options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          <Select aria-label="Warehouse" value={f.warehouse} onChange={(e) => setF({ ...f, warehouse: e.target.value })} placeholder="All warehouses" options={whOptions} />
          <Select aria-label="Entity" value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })} placeholder="All entities" options={ENTITIES} />
          <Select aria-label="Part" value={f.partCode} onChange={(e) => setF({ ...f, partCode: e.target.value })} placeholder="All parts" options={partOptions} />
          {view === 'all' && <Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All statuses" options={['Posted', 'Pending Approval', 'Open', 'Fulfilled', 'Cancelled', 'Rejected'].map((s) => ({ value: s, label: s }))} />}
        </>} />
      {open && <NewTxnModal onClose={() => setOpen(false)} />}
      {sel && <TxnDetail t={data.data?.find((x) => x.txnNo === sel.txnNo) ?? sel} onClose={() => setSel(null)} />}
    </>
  );
}

function TxnDetail({ t, onClose }: { t: TxnRow; onClose: () => void }) {
  const { userName } = useRefLookups();
  const { can } = useAuth();
  const queue = useData(['approvals'], () => api.inbox.approvals());
  const canDecide = !!t.workflowId && t.status === 'Pending Approval' && !!queue.data?.pending.some((w) => w.id === t.workflowId);
  const left = Math.abs(t.qty) - (t.fulfilledQty ?? 0);
  const [fq, setFq] = useState<number | null>(null);
  const [cancel, setCancel] = useState(false);
  const [dec, setDec] = useState<'Approved' | 'Rejected' | null>(null);
  const fulfil = useAction((q: number) => api.inventory.fulfilRequest(t.txnNo, q), { success: (r) => `${r.txnNo} transfer created from ${t.toWarehouse} — awaiting APS / MMG Manager approval`, onSuccess: () => setFq(null) });
  const cancelReq = useAction((r: string) => api.inventory.cancelRequest(t.txnNo, r), { success: `${t.txnNo} cancelled`, onSuccess: () => setCancel(false) });
  const decide = useAction((c: string) => api.inbox.decide(t.workflowId!, dec!, c), { success: () => `${t.txnNo} ${dec?.toLowerCase()}`, onSuccess: () => setDec(null) });
  const isReq = t.type === 'Request';
  const openReq = isReq && t.status === 'Open';
  return (
    <Drawer open onClose={onClose} title={<span className="flex items-center gap-2"><span className="font-mono">{t.txnNo}</span><Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge></span>} width="max-w-2xl"
      footer={(openReq && can('inv.txn', 'add')) || canDecide ? <>
        {openReq && can('inv.txn', 'add') && <><Button variant="secondary" onClick={() => setCancel(true)}>Cancel request</Button><Button onClick={() => setFq(left)}>Fulfil as transfer…</Button></>}
        {canDecide && <><Button variant="danger" onClick={() => setDec('Rejected')}>Reject</Button><Button variant="success" onClick={() => setDec('Approved')}>Approve</Button></>}
      </> : undefined}>
      <Stack>
        <KeyValueGrid cols={3} items={[
          { label: 'Type', value: TYPE_LABEL[t.type] }, { label: 'Date / time', value: formatDateTime(t.at) }, { label: 'User', value: userName(t.by) },
          { label: 'Part', value: <span><span className="font-mono">{t.partCode}</span> — {t.description}</span> },
          { label: 'Quantity', value: isReq ? `${Math.abs(t.qty)} ${t.uom ?? ''} requested` : `${t.qty > 0 ? '+' : ''}${t.qty} ${t.uom ?? ''}` },
          isReq ? { label: 'Stock on hand now', value: <span>{t.toWarehouse} (supplying): <strong>{t.toOnHand}</strong><br />{t.fromWarehouse} (requesting): <strong>{t.fromOnHand}</strong></span> }
            : t.status === 'Pending Approval' ? { label: `Balance after at ${t.fromWarehouse} (projected)`, value: `${t.balanceAfter + t.qty} — stock now ${t.balanceAfter}` } : { label: `Balance after at ${t.fromWarehouse}`, value: t.balanceAfter },
          { label: isReq ? 'Requesting warehouse' : 'Warehouse (from)', value: t.fromWarehouse }, { label: isReq ? 'Supplying warehouse' : 'To warehouse', value: t.toWarehouse ? `${t.toWarehouse}${t.type === 'Transfer' ? ` · now ${t.toOnHand}` : ''}` : undefined }, { label: 'Entity', value: entityName(t.entityCode) },
          { label: 'Unit cost / value', value: `${formatPhp(t.unitCost)} · ${formatPhp(t.value)}` },
          { label: 'Reference', value: <span><RefLink t={t} />{t.countDate && <span className="text-xs text-muted"> · counted {formatDate(t.countDate)}, submitted {formatDate(t.at)}</span>}</span> }, { label: 'Source', value: t.source },
          { label: 'Approval', value: t.waitingFor ? `Waiting for ${t.waitingFor === 'APS approval' ? 'APS / MMG Manager' : t.waitingFor}` : t.decidedBy ? `${t.decision} by ${userName(t.decidedBy)} · ${formatDateTime(t.decidedAt)}` : t.approvalRef ?? (isReq ? 'Not needed — the transfer that fulfils it is approved' : undefined) },
          { label: 'Approval ref.', value: t.approvalRef ?? t.workflowId },
          { label: 'Job order', value: t.joNo || (t.referenceType === 'JO' ? t.referenceId : undefined) }, { label: 'Chassis / equipment', value: t.equipmentRef ? <Link className="font-mono text-brand-600 hover:underline" to={`/chassis/${t.equipmentRef}`}>{t.equipmentRef}</Link> : undefined },
          { label: 'Damaged parts returned', value: t.damagedQty || undefined }, { label: 'PO / ordered qty', value: t.poNo ? `${t.poNo}${t.orderedQty != null ? ` · ordered ${t.orderedQty}` : ''}` : undefined },
          ...(t.type === 'Receive' ? [{ label: 'DR / supplier invoice', value: t.deliveryRef }, { label: 'Received by', value: t.receivedBy ? userName(t.receivedBy) : undefined }, { label: 'Bin', value: t.bin }, { label: 'Attachment', value: t.attachment }] : []),
          ...(isReq ? [{ label: 'Needed by', value: formatDate(t.neededBy) }, { label: 'Priority', value: t.priority ?? 'Normal' }, { label: 'Fulfilled', value: `${t.fulfilledQty ?? 0} of ${Math.abs(t.qty)}${t.fulfilledBy ? ` · transfer ${t.fulfilledBy}${t.linkedStatus ? ` (${t.linkedStatus})` : ''}` : ''}` }] : []),
          ...(t.requestRef ? [{ label: 'Fulfils request', value: <span className="font-mono">{t.requestRef}</span> }] : []),
          { label: 'Requested by', value: t.requestedBy ? `${userName(t.requestedBy)} · ${t.department ?? ''}` : undefined }, { label: 'Reason', value: t.reason ?? t.cancelReason }, { label: 'Remarks', value: t.remarks },
        ]} />
        {t.workflow && <Card><CardHeader title="Approval" actions={<Link to="/approvals" className="text-sm font-medium text-brand-600 hover:underline">Open Inbox →</Link>} /><ApprovalTimeline workflow={t.workflow} userName={userName} /></Card>}
        {t.status === 'Pending Approval' && <Banner tone="warning">Stock is not moved until this {TYPE_LABEL[t.type].toLowerCase()} is approved.</Banner>}
        {openReq && <Banner tone="info">A request moves no stock. Fulfil it as a transfer from {t.toWarehouse} (the transfer goes to the APS / MMG Manager for approval) or cancel it with a reason. Who may fulfil and whether requests need their own approval is pending Delbros confirmation.</Banner>}
        <div>
          <h3 className="mb-1 text-[13px] font-semibold text-ink-2">History</h3>
          <ul className="space-y-1 text-[13px]">
            <li>{formatDateTime(t.at)} · {isReq ? 'Requested' : 'Created'} by {userName(t.by)}</li>
            {t.history.filter((h) => !['stock.posted', 'stock.requested', 'stock.submitted'].includes(h.action)).map((h, i) => <li key={i}>{formatDateTime(h.at)} · {h.action.replace(/^stock\./, '').replace(/_/g, ' ')} by {userName(h.actor)}{h.reason ? ` — ${h.reason}` : ''}</li>)}
            {t.decidedBy && <li>{formatDateTime(t.decidedAt)} · {t.decision} by {userName(t.decidedBy)}</li>}
          </ul>
        </div>
      </Stack>
      <Modal open={fq != null} onClose={() => setFq(null)} title={`Fulfil ${t.txnNo} as a transfer`} footer={<><Button variant="secondary" onClick={() => setFq(null)}>Cancel</Button><Button loading={fulfil.isPending} disabled={!(fq != null && fq > 0 && fq <= left && fq <= (t.toOnHand ?? 0))} onClick={() => fulfil.mutate(fq!)}>Create transfer</Button></>}>
        <Stack>
          <p className="text-sm">Transfer {t.partCode} from <strong>{t.toWarehouse}</strong> (on hand {t.toOnHand}) to <strong>{t.fromWarehouse}</strong>. Outstanding on the request: {left} {t.uom}.</p>
          <Input label="Quantity to transfer" type="number" min={1} max={left} value={fq ?? ''} onChange={(e) => setFq(Number(e.target.value))} error={fq != null && fq > (t.toOnHand ?? 0) ? `Only ${t.toOnHand} on hand at ${t.toWarehouse}` : undefined} />
          {fulfil.error && <Banner tone="danger">{errMessage(fulfil.error)}</Banner>}
        </Stack>
      </Modal>
      <ConfirmDialog open={cancel} onClose={() => setCancel(false)} tone="danger" title={`Cancel request ${t.txnNo}?`} message="The request is closed and its quantity is no longer reserved at the supplying warehouse." requireReason confirmLabel="Cancel request" loading={cancelReq.isPending} onConfirm={(r) => cancelReq.mutate(r)} />
      <ConfirmDialog open={!!dec} onClose={() => setDec(null)} tone={dec === 'Rejected' ? 'danger' : 'primary'} title={`${dec === 'Rejected' ? 'Reject' : 'Approve'} ${t.txnNo}?`} message={dec === 'Rejected' ? 'Stock is not moved. Your reason goes to the requester and the audit trail.' : 'Stock moves as soon as you approve. Your decision is recorded in the audit trail.'} requireReason={dec === 'Rejected'} confirmLabel={dec === 'Rejected' ? 'Reject' : 'Approve'} loading={decide.isPending} onConfirm={(c) => decide.mutate(c ?? '')} />
    </Drawer>
  );
}

function NewTxnModal({ onClose }: { onClose: () => void }) {
  const bal = useData(['inv', 'all'], () => api.inventory.balances());
  const lk = useData(['inv-lookups'], () => api.inventory.lookups());
  const { ref, userName } = useRefLookups();
  const { user } = useAuth();
  const whOptions = useWarehouses();
  const [v, setV] = useState(EMPTY);
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<{ txnNo: string; pendingApproval: boolean; balanceAfter: number; rrNo?: string } | null>(null);
  const part = ref?.parts.find((p) => p.partCode === v.partCode);
  const line = bal.data?.find((b) => b.partCode === v.partCode && b.warehouseCode === v.fromWarehouse);
  const onHand = line?.qtyOnHand ?? 0;
  const out = ['Issue', 'Transfer'].includes(v.type);
  const after = ['Request', 'Adjustment', 'Transfer'].includes(v.type) ? onHand : out ? onHand - v.qty : onHand + v.qty;
  const insufficient = out && v.qty > onHand;
  const po = lk.data?.pos.find((p) => p.poNo === v.poNo);
  const poLine = po?.lines.find((l) => l.partCode === v.partCode);
  const errs: Record<string, string | undefined> = {
    partCode: v.partCode ? undefined : 'Required', fromWarehouse: v.fromWarehouse ? undefined : 'Required',
    qty: v.type === 'Adjustment' ? (v.qty === 0 ? 'Cannot be zero' : undefined) : !(v.qty > 0) ? 'Must be greater than zero' : insufficient ? `Insufficient stock — ${onHand} on hand` : v.type === 'Receive' && poLine && v.qty > poLine.qty - poLine.qtyReceived ? `Exceeds PO balance (${poLine.qty - poLine.qtyReceived})` : undefined,
    joNo: v.type === 'Issue' && !v.joNo ? 'Required for issuance' : undefined,
    damagedQty: v.type === 'Issue' && (v.damagedQty < 0 || v.damagedQty > v.qty) ? '0 to issued qty' : undefined,
    toWarehouse: ['Transfer', 'Request'].includes(v.type) && (!v.toWarehouse || v.toWarehouse === v.fromWarehouse) ? 'Required, different warehouse' : undefined,
    poNo: v.type === 'Receive' && !v.poNo ? 'Required for receiving' : v.type === 'Receive' && po && !poLine ? 'Part is not on this PO' : undefined,
    department: v.type === 'Request' && !v.department.trim() ? 'Required' : undefined, requestedBy: v.type === 'Request' && !v.requestedBy ? 'Required' : undefined,
    reason: v.type === 'Adjustment' && !v.reason.trim() ? 'Required' : undefined,
  };
  const invalid = Object.values(errs).some(Boolean);
  // Same rule as the other forms: primary stays enabled, errors show inline on submit (qty checks show as soon as a part is picked).
  const err = (k: string) => fieldError(post.error, k) || (tried || (k === 'qty' && v.partCode) ? errs[k] : undefined);
  const post = useAction(() => api.inventory.post({
    type: v.type, partCode: v.partCode, qty: v.qty, fromWarehouse: v.fromWarehouse, entityCode: v.entityCode, remarks: v.remarks || undefined,
    toWarehouse: ['Transfer', 'Request'].includes(v.type) ? v.toWarehouse : undefined, reason: v.reason || undefined,
    referenceType: v.type === 'Adjustment' || v.type === 'Return' ? v.referenceType || 'Manual' : undefined, referenceId: v.referenceId || undefined,
    ...(v.type === 'Issue' ? { joNo: v.joNo, equipmentRef: v.equipmentRef || undefined, damagedQty: v.damagedQty || undefined } : {}),
    ...(v.type === 'Transfer' ? { approvalRef: v.approvalRef || undefined } : {}),
    ...(v.type === 'Receive' ? { poNo: v.poNo, deliveryRef: v.deliveryRef.trim() || undefined, bin: v.bin.trim() || undefined, receivedBy: v.receivedBy || user?.userId, attachment: v.attachment || undefined } : {}),
    ...(v.type === 'Request' ? { department: v.department, requestedBy: v.requestedBy, requestingBranch: v.fromWarehouse.replace('WH-', ''), neededBy: v.neededBy || undefined, priority: v.priority } : {}),
  }), { success: (r) => (r.pendingApproval ? `${r.txnNo} submitted for APS approval` : `${r.txnNo} posted — stock ledger updated`), onSuccess: (r) => setDone(r) });
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });
  if (done) return (
    <Modal open onClose={onClose} title="Stock ledger updated" footer={<><Button variant="secondary" onClick={() => { setDone(null); setV(EMPTY); setTried(false); post.reset(); }}>New transaction</Button><Button onClick={onClose}>View in ledger</Button></>}>
      <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-6 text-success" /><div className="text-sm">
        <p className="font-medium text-ink"><span className="font-mono">{done.txnNo}</span> — {TYPE_LABEL[v.type]} of {Math.abs(v.qty)} {part?.uom} {v.partCode}</p>
        <p className="mt-1 text-muted">{done.pendingApproval ? `Submitted for APS / MMG Manager approval. Stock at ${v.fromWarehouse} stays at ${done.balanceAfter} until approved.` : v.type === 'Request' ? `Request is open against ${v.toWarehouse}; it shows as requested stock on the inventory summary.` : `New balance at ${v.fromWarehouse}: ${done.balanceAfter} ${part?.uom}.`}{done.rrNo && ` Receiving report ${done.rrNo} created against ${v.poNo}; the PO's received quantity is updated.`}</p>
        <p className="mt-1 text-xs text-muted">Stamped {formatDateTime(new Date().toISOString())} by {userName(user?.userId)}.</p>
      </div></div>
    </Modal>
  );
  return (
    <Modal open onClose={onClose} title="New stock transaction" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={post.isPending} onClick={() => { setTried(true); if (invalid) setTimeout(() => document.querySelector<HTMLElement>('[role="dialog"] [aria-invalid="true"]')?.focus(), 0); else post.mutate(undefined); }}>{['Transfer', 'Adjustment'].includes(v.type) ? 'Submit for approval' : 'Post'}</Button></>}>
      <Stack>
        <FormGrid>
          <Select label="Transaction type" required value={v.type} onChange={(e) => set({ type: e.target.value as StockTxnType, referenceType: '', referenceId: '' })} options={(['Request', 'Issue', 'Transfer', 'Receive', 'Adjustment', 'Return'] as StockTxnType[]).map((x) => ({ value: x, label: ['Adjustment', 'Return'].includes(x) ? `${TYPE_LABEL[x]} (pending client confirmation)` : TYPE_LABEL[x] }))} />
          <Select label="Part / material" required value={v.partCode} onChange={(e) => set({ partCode: e.target.value })} placeholder="Select part" options={(ref?.parts ?? []).map((p) => ({ value: p.partCode, label: `${p.partCode} — ${p.description}` }))} error={err('partCode')} hint={part ? `${part.partCode} · ${part.uom} · ${onHand} on hand at ${v.fromWarehouse}` : 'Code, unit and on-hand balance show here once a part is selected'} />
          <Input label={v.type === 'Adjustment' ? 'Adjustment qty (+/−)' : 'Quantity'} required type="number" min={v.type === 'Adjustment' ? undefined : 1} placeholder={v.type === 'Adjustment' ? 'e.g. -2 or 3' : 'e.g. 5'} value={v.qty} onChange={(e) => set({ qty: Number(e.target.value) })} error={err('qty')} hint={part ? `Unit of measure: ${part.uom}` : undefined} />
          <Select label={v.type === 'Request' ? 'Requesting warehouse' : v.type === 'Transfer' ? 'Source warehouse' : 'Warehouse'} required value={v.fromWarehouse} onChange={(e) => set({ fromWarehouse: e.target.value })} options={whOptions} error={err('fromWarehouse')} />
          {['Transfer', 'Request'].includes(v.type) && <Select label={v.type === 'Request' ? 'Supplying warehouse (other branch)' : 'Destination warehouse'} required placeholder="Select…" value={v.toWarehouse} onChange={(e) => set({ toWarehouse: e.target.value })} options={whOptions.filter((w) => w.value !== v.fromWarehouse)} error={err('toWarehouse') ?? (v.toWarehouse === v.fromWarehouse && v.toWarehouse ? errs.toWarehouse : undefined)} />}
          {v.type === 'Issue' && <>
            <Select label="Job order" required placeholder="Select open JO" value={v.joNo} onChange={(e) => { const j = lk.data?.jos.find((x) => x.joNo === e.target.value); set({ joNo: e.target.value, equipmentRef: j?.chassisNo ?? '' }); }} options={(lk.data?.jos ?? []).map((j) => ({ value: j.joNo, label: `${j.joNo} — ${j.chassisNo} (${j.status})` }))} error={err('joNo')} hint="Parts are issued against a job order" />
            <Input label="Chassis / equipment repaired" placeholder="e.g. DW-MNL-1001" value={v.equipmentRef} onChange={(e) => set({ equipmentRef: e.target.value.toUpperCase() })} hint="Defaults to the JO's chassis" />
            <Input label="Damaged parts returned (qty)" type="number" min={0} placeholder="e.g. 1" value={v.damagedQty} onChange={(e) => set({ damagedQty: Number(e.target.value) })} error={err('damagedQty') ?? (v.damagedQty ? errs.damagedQty : undefined)} hint="Replaced parts accounted for" />
          </>}
          {v.type === 'Transfer' && <Input label="Approval memo ref." placeholder="Memo or approval number" value={v.approvalRef} onChange={(e) => set({ approvalRef: e.target.value })} hint="Optional — the Inbox approval number is added automatically" />}
          {v.type === 'Receive' && <>
            <Select label="Purchase order" required placeholder="Select open PO" value={v.poNo} onChange={(e) => set({ poNo: e.target.value, entityCode: lk.data?.pos.find((p) => p.poNo === e.target.value)?.entityCode ?? v.entityCode })} options={(lk.data?.pos ?? []).map((p) => ({ value: p.poNo, label: `${p.poNo} — ${p.lines.map((l) => l.partCode).join(', ')}` }))} error={err('poNo') ?? (v.poNo ? errs.poNo : undefined)} />
            <Input label="Ordered vs received" readOnly tabIndex={-1} className="bg-surface-alt text-ink-2" value={poLine ? `${poLine.qty} ordered · ${poLine.qtyReceived} received · ${poLine.qty - poLine.qtyReceived} outstanding` : ''} placeholder="—" />
            <Input label="Delivery receipt / supplier invoice no." value={v.deliveryRef} placeholder="e.g. DR-ABP-55821" onChange={(e) => set({ deliveryRef: e.target.value.toUpperCase() })} />
            <Input label="Unit cost / value of receipt" readOnly tabIndex={-1} className="bg-surface-alt text-ink-2" value={poLine ? `${formatPhp(poLine.unitPrice)} (PO price) · ${formatPhp(poLine.unitPrice * (v.qty || 0))}` : ''} placeholder="From the PO price" />
            <Input label="Bin / location" value={v.bin} placeholder={line?.bin ? `current ${line.bin}` : 'e.g. A-01'} onChange={(e) => set({ bin: e.target.value.toUpperCase() })} />
            <Select label="Received by" value={v.receivedBy || user?.userId || ''} onChange={(e) => set({ receivedBy: e.target.value })} options={(ref?.users ?? []).map((u) => ({ value: u.userId, label: `${u.name} (${u.branchCode})` }))} hint="Defaults to you; the posting user is stamped separately" />
            <Input label="Delivery receipt photo" type="file" accept="image/*,application/pdf" onChange={(e) => set({ attachment: e.target.files?.[0]?.name ?? '' })} hint={v.attachment || 'Optional — DR or invoice scan'} />
          </>}
          {v.type === 'Request' && <>
            <Input label="Needed by" type="date" value={v.neededBy} onChange={(e) => set({ neededBy: e.target.value })} />
            <Select label="Priority" value={v.priority} onChange={(e) => set({ priority: e.target.value as 'Normal' | 'Urgent' })} options={['Normal', 'Urgent'].map((x) => ({ value: x, label: x }))} />
          </>}
          {v.type === 'Request' && <>
            <Input label="Requesting department" required value={v.department} onChange={(e) => set({ department: e.target.value })} placeholder="e.g. Repair & Maintenance" error={err('department')} />
            <Select label="Requested by" required placeholder="Select user" value={v.requestedBy} onChange={(e) => set({ requestedBy: e.target.value })} error={err('requestedBy')} options={(ref?.users ?? []).map((u) => ({ value: u.userId, label: `${u.name} (${u.branchCode})` }))} />
          </>}
          {(v.type === 'Adjustment' || v.type === 'Return') && <>
            <Select label="Reference type" value={v.referenceType || 'Manual'} onChange={(e) => set({ referenceType: e.target.value })} options={['Manual', 'Count', 'JO', 'Transfer', 'Request'].map((x) => ({ value: x, label: x }))} />
            <Input label="Reference no." placeholder="Count, JO or transfer number" value={v.referenceId} onChange={(e) => set({ referenceId: e.target.value })} />
          </>}
          <Select label="Entity" required value={v.entityCode} onChange={(e) => set({ entityCode: e.target.value })} options={ENTITIES} hint={ENTITY_HINT[v.type]} />
          <Input label="Date / user" readOnly tabIndex={-1} className="truncate bg-surface-alt text-ink-2" title={`Stamped at posting · ${userName(user?.userId)}`} value={`Stamped at posting · ${userName(user?.userId)}`} />
        </FormGrid>
        {v.type === 'Adjustment' && <Textarea label="Reason" required placeholder="Reason for the adjustment (kept in the audit trail)" value={v.reason} onChange={(e) => set({ reason: e.target.value })} error={err('reason')} />}
        {tried && invalid && <Banner tone="danger">Complete the highlighted fields before posting.</Banner>}
        <Textarea label="Remarks" placeholder="Optional notes for this transaction" value={v.remarks} onChange={(e) => set({ remarks: e.target.value })} />
        {part && <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-surface-alt px-4 py-3 text-sm sm:grid-cols-3">
          <span>Code <strong className="font-mono">{part.partCode}</strong></span><span>UoM <strong>{part.uom}</strong></span><span>Weight <strong>{part.weightKg != null ? `${part.weightKg} kg` : '—'}</strong></span>
          <span>On hand <strong className="tabular">{onHand}</strong></span><span>Available <strong className="tabular">{line?.available ?? onHand}</strong>{line?.requestedQty ? <span className="text-muted"> ({line.requestedQty} requested)</span> : null}</span>
          <span>Balance after <strong className={cn('tabular', after < 0 && 'text-danger')}>{after}</strong>{['Adjustment', 'Transfer'].includes(v.type) && <span className="text-muted"> (after approval)</span>}</span>
        </div>}
        {insufficient && <Banner tone="danger" title="Insufficient stock">Only {onHand} {part?.uom} on hand at {v.fromWarehouse}. Stock can never go negative.</Banner>}
        {post.error && <Banner tone="danger">{errMessage(post.error)}</Banner>}
      </Stack>
    </Modal>
  );
}
