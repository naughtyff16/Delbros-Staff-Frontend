import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Eye, Plus, Wallet } from 'lucide-react';
import { api } from '../../lib/api-client';
import { todayManila, formatDate, formatDateTime, formatPhp, type EwalletCategory, type EwalletTxnType } from '../../lib/shared';
import {
  Badge, Banner, Button, Card, CardHeader, Checkbox, ConfirmDialog, DataTable, DateRangeFilter, EmptyState, FormGrid, Input, KeyValueGrid, KpiTile, Modal, MoneyInput, MoneyText, PageHeader, Segmented, Select, Stack, StatusBadge, Tabs, Textarea, cn,
} from '../../lib/ui';
import { useAuth } from '../../app/auth';
import { errMessage, useAction, useData, useRefLookups } from '../../shared/hooks';
import { Crumb, ScreenTag } from '../../shared/components';

type WalletState = 'All' | 'OK' | 'Below minimum' | 'Negative';
const stateBadge = (s: string) => (s === 'Negative' ? <Badge tone="danger">Negative</Badge> : s === 'Below minimum' ? <Badge tone="warning">Below minimum</Badge> : <Badge tone="success">OK</Badge>);
const DEDUCTION_SCOPE: EwalletCategory[] = ['Rescue', 'Repair', 'Debit Memo', 'Contract-termination lease']; // DBL-EWL-003
const lnk = 'font-mono text-brand-600 hover:underline';

// ── SCR-40 / 41 E-wallets list, portal top-up queue, Create e-wallet (DBL-EWL-001/002) ──
export function EwalletListPage() {
  const data = useData(['wallets'], () => api.ewallet.list());
  const topups = useData(['topups'], () => api.ewallet.topups());
  const elig = useData(['wallet-eligible'], () => api.ewallet.eligibleClients());
  const nav = useNavigate();
  const { ref, userName, setting } = useRefLookups();
  const { can } = useAuth();
  const min = Number(setting('ewl.min_balance') ?? 10000);
  const blank = { clientCode: '', receiptNo: '', clearedDate: '', ref: '', treasuryBy: '', amount: min, allowRescue: true, notes: '', attachment: '' };
  const [create, setCreate] = useState(false);
  const [amtFocus, setAmtFocus] = useState(false);
  const [c, setC] = useState(blank);
  const [state, setState] = useState<WalletState>('All');
  const [allTopups, setAllTopups] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; bankRef: string; receiptNo: string } | null>(null);
  const [reject, setReject] = useState<string | null>(null);
  const [proof, setProof] = useState<string | null>(null);
  const mk = useAction(() => api.ewallet.create(c.clientCode, c.ref, c.amount, { receiptNo: c.receiptNo, clearedDate: c.clearedDate, treasuryConfirmedBy: c.treasuryBy, allowRescue: c.allowRescue, notes: c.notes, attachment: c.attachment }), { success: 'E-wallet created', onSuccess: () => { setCreate(false); setC(blank); } });
  const remind = useAction((code: string) => api.ewallet.sendReminder(code), { success: 'Replenishment reminder sent to the client and AE' });
  const proc = useAction((a: { id: string; action: 'confirm' | 'post' | 'reject'; ref?: string; receiptNo?: string; reason?: string }) => api.ewallet.processTopup(a.id, a.action, a.ref, { receiptNo: a.receiptNo, reason: a.reason }), { success: (t) => `Top-up ${t.status}`, onSuccess: () => { setConfirm(null); setReject(null); } });
  const rows = data.data ?? [];
  type Row = (typeof rows)[number];
  type Top = NonNullable<typeof topups.data>[number];
  const pending = (topups.data ?? []).filter((t) => t.status !== 'Posted' && t.status !== 'Rejected');
  const shownTopups = allTopups ? topups.data ?? [] : pending;
  const noWallet = elig.data ?? [];
  const eligible = noWallet.filter((x) => x.eligible);
  const sel = noWallet.find((x) => x.clientCode === c.clientCode);
  const rcpt = sel?.receipts.find((r) => r.receiptNo === c.receiptNo);
  const treasurers = (ref?.users ?? []).filter((u) => u.roles.includes('TREASURY'));
  const amountErr = c.amount <= 0 ? 'Must be greater than zero' : c.amount < min ? `At least the minimum balance ${formatPhp(min)}` : rcpt && c.amount > rcpt.amount ? `Exceeds receipt amount ${formatPhp(rcpt.amount)}` : undefined;
  const openCreate = (code = '') => { setC({ ...blank, clientCode: code }); setCreate(true); };
  const filtered = state === 'All' ? rows : rows.filter((w) => w.state === state);
  return (
    <>
      <PageHeader title="E-wallets" meta={<ScreenTag id="SCR-40 / 41" />} description={`Prepaid client balances used for rescue, repair and debit-memo charges (DBL-EWL-003). Minimum ${formatPhp(min)} (configurable); no maximum; may go negative (BR-04).`}
        actions={can('ewl.txn', 'add') && <Button icon={<Plus className="size-4" />} onClick={() => openCreate()}>Create e-wallet</Button>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile label="Total balance" value={formatPhp(rows.reduce((a, w) => a + w.balance, 0))} />
        <KpiTile label="Below minimum" value={rows.filter((w) => w.state === 'Below minimum').length} tone="warning" hint="₱0 up to the minimum — negatives counted separately" onClick={() => setState('Below minimum')} />
        <KpiTile label="Negative" value={rows.filter((w) => w.state === 'Negative').length} tone="danger" hint="Balance below ₱0 — replenishment signal" onClick={() => setState('Negative')} />
        <KpiTile label="Top-ups pending" value={pending.length} />
        <KpiTile label="Active clients without wallet" value={eligible.length} tone={eligible.length ? 'warning' : 'default'} />
      </div>
      <Card className="mb-5" padded={false}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3">
          <div><h2 className="font-semibold">Portal top-up requests</h2><p className="text-[13px] text-muted">Submitted by client → <strong>Treasury confirms</strong> funds (bank ref, PR/OR) → <strong>Accounting posts</strong> the ledger credit. Reject needs a reason; the client sees the status and reason in the portal.</p></div>
          <Checkbox label="Show posted / rejected" checked={allTopups} onChange={(e) => setAllTopups(e.target.checked)} />
        </div>
        <DataTable<Top> data={shownTopups} loading={topups.isLoading} searchable={false} emptyTitle="No top-up requests waiting" columns={[{ accessorKey: 'clientName', header: 'Client' }, { accessorKey: 'amount', header: 'Amount', meta: { align: 'right' }, cell: (x) => formatPhp(x.getValue<number>()) },
          { accessorKey: 'proofFileName', header: 'Proof', cell: (x) => (x.getValue() ? <Button size="sm" variant="ghost" icon={<Eye className="size-4" />} onClick={() => setProof(x.getValue<string>())}>{x.getValue<string>()}</Button> : '—') },
          { accessorKey: 'submittedAt', header: 'Submitted', cell: (x) => formatDateTime(x.getValue<string>()) },
          { id: 'tr', header: 'Treasury confirmed', cell: (x) => (x.row.original.confirmedAt ? <div className="text-xs"><p>{userName(x.row.original.confirmedBy)} · {formatDateTime(x.row.original.confirmedAt)}</p><p className="text-muted">Bank {x.row.original.bankRef}{x.row.original.receiptNo ? ` · ${x.row.original.receiptNo}` : ''}</p></div> : x.row.original.bankRef ? <span className="text-xs">Bank {x.row.original.bankRef}</span> : <span className="text-muted">—</span>) },
          { id: 'po', header: 'Posted by Accounting', cell: (x) => (x.row.original.postedAt ? <div className="text-xs"><p>{userName(x.row.original.postedBy)} · {formatDateTime(x.row.original.postedAt)}</p>{x.row.original.txnId && <Link className={lnk} to={`/ewallet/${x.row.original.clientCode}`}>{x.row.original.txnId}</Link>}</div> : <span className="text-muted">—</span>) },
          { accessorKey: 'status', header: 'Status', cell: (x) => <div><StatusBadge domain="topup" value={x.getValue<string>()} />{x.row.original.rejectReason && <p className="mt-0.5 text-xs text-danger">{x.row.original.rejectReason} · {userName(x.row.original.rejectedBy)}</p>}</div> },
          { id: 'a', header: '', cell: (x) => { const t = x.row.original; const open = t.status !== 'Posted' && t.status !== 'Rejected'; return <div className="flex gap-1">
            {t.status === 'Submitted' && can('ewl.txn', 'check') && <Button size="sm" variant="secondary" onClick={() => setConfirm({ id: t.id, bankRef: '', receiptNo: '' })}>Treasury confirm</Button>}
            {t.status === 'Confirmed by Treasury' && can('ewl.txn', 'add') && <Button size="sm" loading={proc.isPending} onClick={() => proc.mutate({ id: t.id, action: 'post' })}>Post top-up</Button>}
            {open && (can('ewl.txn', 'check') || can('ewl.txn', 'add')) && <Button size="sm" variant="secondary" className="border-danger-line! text-danger! hover:bg-danger-bg!" onClick={() => setReject(t.id)}>Reject</Button>}</div>; } }]} />
      </Card>
      <DataTable<Row> data={filtered} loading={data.isLoading} onRowClick={(r) => nav(`/ewallet/${r.clientCode}`)} exportName="ewallets"
        toolbar={<Segmented<WalletState> value={state} onChange={setState} options={(['All', 'OK', 'Below minimum', 'Negative'] as const).map((s) => ({ value: s, label: s }))} />}
        emptyTitle={state === 'All' ? 'No e-wallets yet' : `No wallets in state “${state}”`} columns={[
          { accessorKey: 'clientName', header: 'Client', cell: (x) => <><Link className="font-medium text-brand-700 hover:underline" to={`/clients/${x.row.original.clientCode}`} onClick={(e) => e.stopPropagation()} title="Client profile">{x.getValue<string>()}</Link>
            <p className="text-[11px] text-muted">{x.row.original.branchCode ?? '—'} · AE {userName(x.row.original.aeAssigned)}{x.row.original.clientStatus && x.row.original.clientStatus !== 'Active' ? ` · ${x.row.original.clientStatus === 'Hold' ? 'On Hold' : x.row.original.clientStatus}` : ''}</p></> }, { accessorKey: 'clientCode', header: 'Code' },
          // Review 1.2: wallet number and created date.
          { accessorKey: 'walletNo', header: 'Wallet no.', cell: (x) => <><span className="whitespace-nowrap font-mono text-xs">{x.getValue<string>()}</span><p className="text-[11px] text-muted">created {formatDate(x.row.original.createdAt)}</p></> },
          { accessorKey: 'balance', header: 'Balance', meta: { align: 'right' }, cell: (x) => <MoneyText value={x.getValue<number>()} strong /> },
          { accessorKey: 'minimumBalance', header: 'Minimum', meta: { align: 'right' }, cell: (x) => formatPhp(x.getValue<number>()) },
          { accessorKey: 'state', header: 'State', cell: (x) => { const r = x.row.original; return <>{stateBadge(x.getValue<string>())}{r.state !== 'OK' && <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted">{r.lastReminderAt ? `reminder ${formatDate(r.lastReminderAt)}${r.lastReminderByName ? ` · ${r.lastReminderByName}` : ''}` : 'no reminder sent'}</p>}</>; } },
          // Review 1.1: the "funded" rule is shown — rescue is allowed while the balance is above ₱0 (below-minimum wallets still allowed, flagged);
          // a client On Hold is blocked by the credit gate whatever the balance.
          { accessorKey: 'allowRescue', header: 'Allow Rescue', cell: (x) => { const r = x.row.original; const why = [r.balance <= 0 && (r.balance < 0 ? 'negative balance' : 'zero balance'), r.clientStatus === 'Hold' && 'client on hold'].filter(Boolean).join(', ');
            return !x.getValue() ? <Badge tone="neutral" dot={false}>No</Badge> : why ? <Badge tone="warning" dot={false}>Blocked — {why}</Badge> : r.balance < r.minimumBalance ? <span title="Funded (above ₱0) but below the minimum — replenishment requested"><Badge tone="warning" dot={false}>Yes — below minimum</Badge></span> : <Badge tone="success" dot={false}>Yes</Badge>; } },
          { accessorKey: 'lastTopupAt', header: 'Last top-up', cell: (x) => (x.getValue() ? <>{formatDate(x.getValue<string>())}{x.row.original.lastTopupAmount != null && <p className="text-[11px] text-muted">{formatPhp(x.row.original.lastTopupAmount)}</p>}</> : '—') },
          { accessorKey: 'lastTxnAt', header: 'Last transaction', cell: (x) => (x.getValue() ? formatDate(x.getValue<string>()) : '—') },
          { id: 'a', header: '', cell: (x) => <div className="flex gap-1"><Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); nav(`/ewallet/${x.row.original.clientCode}`); }}>Ledger</Button>
            {can('ewl.txn', 'add') && <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); nav(`/ewallet/${x.row.original.clientCode}?action=replenish`); }}>Replenish</Button>}
            {can('ewl.txn', 'add') && x.row.original.state !== 'OK' && <Button size="sm" variant="ghost" loading={remind.isPending && remind.variables === x.row.original.clientCode} onClick={(e) => { e.stopPropagation(); remind.mutate(x.row.original.clientCode); }} title="Email / SMS the client and AE to top up">Remind</Button>}</div> }]} />
      <p className="mt-2 text-xs text-muted">Allow Rescue: a wallet counts as funded while its balance is above ₱0, and the client must not be On Hold; a wallet below the minimum stays allowed but is flagged for replenishment. Whether “funded” should mean at or above the minimum instead <Badge tone="warning" dot={false}>pending decision</Badge>. The minimum is the global Settings value (no per-client minimum). Deductions are limited to rescue, repair, debit memos and contract-termination lease; open a wallet's Ledger for top-ups, deductions by category, running balance and reversals with reason.</p>
      <Card className="mt-5">
        <CardHeader title="Clients without an e-wallet" description="One wallet per client. Only accredited, Active clients can get one; Allow for Rescue needs a funded wallet." />
        {noWallet.length ? <ul className="divide-y divide-line">{noWallet.map((x) => (
          <li key={x.clientCode} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span><span className="font-medium">{x.clientName}</span> <span className="text-muted">{x.clientCode}</span> {x.status === 'Blacklist' ? <Badge tone="danger">Blacklist</Badge> : <StatusBadge domain="client" value={x.status} />} {x.eligible && !x.receipts.length && <span className="ml-1 text-xs text-warning">no Treasury-cleared receipt yet</span>}</span>
            {x.eligible ? can('ewl.txn', 'add') && <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => openCreate(x.clientCode)}>Create e-wallet</Button> : <span className="text-xs text-muted">Not eligible — {x.status}</span>}
          </li>))}</ul> : <p className="text-sm text-muted">Every client has an e-wallet.</p>}
      </Card>

      <Modal open={create} onClose={() => setCreate(false)} title="Create e-wallet" size="lg" description="Created by Accounting only after Treasury confirms the client's initial payment has cleared."
        footer={<><Button variant="secondary" onClick={() => setCreate(false)}>Cancel</Button><Button loading={mk.isPending} disabled={!c.clientCode || !c.receiptNo || !c.ref.trim() || !c.treasuryBy || !c.clearedDate || !!amountErr} onClick={() => mk.mutate(undefined)}>Create e-wallet</Button></>}>
        <Stack>
          <Select label="Client" required value={c.clientCode} onChange={(e) => setC({ ...c, clientCode: e.target.value, receiptNo: '', clearedDate: '' })} placeholder="Select" hint="Only accredited, Active clients without an e-wallet are listed." options={eligible.map((x) => ({ value: x.clientCode, label: `${x.clientCode} — ${x.clientName}` }))} />
          {!eligible.length && <Banner tone="info">All Active clients already have an e-wallet.</Banner>}
          {sel && !sel.receipts.length && <Banner tone="warning" title="No Treasury-cleared receipt">Record the initial payment as a PR first in <Link className="font-medium underline" to="/billing/receipts">Billing › Receipts</Link>; once Treasury confirms clearance and the Official Receipt is issued, the wallet can be created against it.{sel.pendingReceipts.length ? ` Awaiting clearance: ${sel.pendingReceipts.join(', ')}.` : ''}</Banner>}
          {sel && <p className="text-xs text-muted">Wallet no. <span className="font-mono font-medium text-ink-2">{sel.walletNoPreview}</span> (assigned on save) · branch <span className="font-medium text-ink-2">{sel.branchCode}</span> (from the client)</p>}
          <FormGrid>
            <Select label="Official Receipt (initial payment)" required value={c.receiptNo} disabled={!sel?.receipts.length} onChange={(e) => { const r = sel?.receipts.find((y) => y.receiptNo === e.target.value); setC({ ...c, receiptNo: e.target.value, clearedDate: r ? String(r.clearedAt ?? r.date).slice(0, 10) : '', amount: r ? r.amount : c.amount }); }} placeholder={!sel ? 'Select a client first' : sel.receipts.length ? 'Select' : 'No cleared receipt'}
              hint="Only receipts Treasury has cleared (OR issued) with an unapplied amount"
              options={(sel?.receipts ?? []).map((r) => ({ value: r.receiptNo, label: `${r.orNo ?? r.receiptNo} (${r.receiptNo}) · cleared ${formatDate(r.clearedAt ?? r.date)} · ${formatPhp(r.amount)}${r.purpose === 'E-wallet funding' ? ' · e-wallet funding' : ''}` }))} />
            <Input label="Date funds cleared" type="date" required value={c.clearedDate} max={todayManila()} onChange={(e) => setC({ ...c, clearedDate: e.target.value })} />
            <Input label="Payment method" readOnly tabIndex={-1} className="bg-surface-alt text-ink-2" value={rcpt?.method ?? ''} placeholder="—" />
            <Input label="Bank / check reference" readOnly tabIndex={-1} className="bg-surface-alt text-ink-2" value={rcpt?.reference ?? ''} placeholder="—" />
            <Input label="Treasury confirmation ref." required value={c.ref} onChange={(e) => setC({ ...c, ref: e.target.value })} placeholder="e.g. TRS-2026-0201" />
            <Select label="Confirmed by (Treasury)" required value={c.treasuryBy} onChange={(e) => setC({ ...c, treasuryBy: e.target.value })} placeholder="Select" hint="Recorded with today's date/time" options={treasurers.map((u) => ({ value: u.userId, label: u.name }))} />
            <MoneyInput label="Initial amount" required type="text" value={amtFocus ? String(c.amount || '') : c.amount ? c.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''} onFocus={() => setAmtFocus(true)} onBlur={() => setAmtFocus(false)} onChange={(e) => { const n = Number(e.target.value.replace(/[^\d.]/g, '')); setC({ ...c, amount: Number.isFinite(n) ? n : 0 }); }} error={c.clientCode ? amountErr : undefined} hint={rcpt ? (c.amount < rcpt.amount - 0.005 ? `Less than the receipt's unapplied ${formatPhp(rcpt.amount)} — the remaining ${formatPhp(rcpt.amount - c.amount)} stays on the receipt as client credit` : `Equals the cleared receipt amount; minimum ${formatPhp(min)}, no maximum`) : `Minimum balance ${formatPhp(min)}; no maximum. Defaults to the cleared receipt amount.`} />
          </FormGrid>
          <Textarea label="Notes" value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} placeholder="e.g. opening balance per client letter dated …" />
          <Input label="Treasury confirmation attachment" type="file" onChange={(e) => setC({ ...c, attachment: e.target.files?.[0]?.name ?? '' })} hint={c.attachment || 'Optional — bank credit advice or Treasury confirmation'} />
          <Checkbox label="Allow rescue charges to this wallet" description={sel && sel.allowRescue ? 'Already enabled on the client.' : 'Rescue is dispatched only while the wallet is funded (above ₱0) and the client is not On Hold. Can also be changed on the client profile › eligibility flags.'} checked={c.allowRescue} onChange={(e) => setC({ ...c, allowRescue: e.target.checked })} />
          <p className="text-xs text-muted">Creation posts the opening ledger credit and notifies the client, AE, Operations and C&amp;C. “Confirmed by” lists users with the Treasury role. Low-balance alert: the wallet is flagged “Below minimum” under {formatPhp(min)}; a separate alert level <Badge tone="warning" dot={false}>pending decision</Badge></p>
          {mk.error && <Banner tone="danger">{errMessage(mk.error)}</Banner>}
        </Stack>
      </Modal>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Treasury confirmation" description="Confirm the funds reached the bank. Accounting then posts the top-up."
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button><Button loading={proc.isPending} disabled={!confirm?.bankRef.trim()} onClick={() => confirm && proc.mutate({ id: confirm.id, action: 'confirm', ref: confirm.bankRef, receiptNo: confirm.receiptNo })}>Confirm funds</Button></>}>
        {confirm && <Stack><Input label="Bank reference" required value={confirm.bankRef} onChange={(e) => setConfirm({ ...confirm, bankRef: e.target.value })} placeholder="e.g. BDO-TRX-0001" /><Input label="PR / OR no." value={confirm.receiptNo} onChange={(e) => setConfirm({ ...confirm, receiptNo: e.target.value })} placeholder="e.g. OR7000000" hint="Receipt issued for the top-up, if already issued" />
          {proc.error && <Banner tone="danger">{errMessage(proc.error)}</Banner>}</Stack>}
      </Modal>
      <ConfirmDialog open={!!reject} onClose={() => setReject(null)} title="Reject top-up request?" message="The client sees the status and your reason in the portal." tone="danger" requireReason confirmLabel="Reject" loading={proc.isPending} onConfirm={(r) => reject && proc.mutate({ id: reject, action: 'reject', reason: r })} />
      <Modal open={!!proof} onClose={() => setProof(null)} title="Proof of payment" description={proof ?? ''}>
        <EmptyState title={proof ?? ''} hint="Uploaded by the client in the portal. The file viewer opens the stored document when the document service is live." icon={<Eye className="size-6" />} />
      </Modal>
    </>
  );
}

// ── SCR-40 Ledger + SCR-41 Replenishment & Special Transaction Entry (DBL-EWL-005/006/007) ──
export function EwalletLedgerPage() {
  const { code = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const data = useData(['ledger', code], () => api.ewallet.ledger(code));
  const { can } = useAuth();
  const { userName } = useRefLookups();
  const [fund, setFund] = useState('ewallet');
  const [view, setView] = useState<'all' | 'loads'>('all');
  const [f, setF] = useState({ from: '', to: '', type: '', category: '' });
  const [open, setOpen] = useState(sp.get('action') === 'replenish');
  const [v, setV] = useState({ type: 'Replenishment' as EwalletTxnType, amount: 0, referenceType: 'Top-up', referenceId: '', reason: '', treasuryRef: '', reversesId: '', receiptNo: '', category: 'Rescue' as EwalletCategory });
  const close = () => { setOpen(false); if (sp.get('action')) setSp({}); };
  const post = useAction(() => api.ewallet.post({ clientCode: code, ...v }), { success: (r) => (r.posted ? 'Posted to ledger' : 'Submitted for approval (special transaction)'), onSuccess: close });
  const txns = data.data?.txns ?? [];
  type Row = (typeof txns)[number];
  const shown = useMemo(() => txns.filter((t) => (view === 'all' || t.type === 'Replenishment') && (!f.from || t.at.slice(0, 10) >= f.from) && (!f.to || t.at.slice(0, 10) <= f.to) && (!f.type || t.type === f.type) && (!f.category || t.category === f.category)), [txns, view, f]);
  if (data.error) return <Banner tone="danger" title="Ledger could not be loaded">{errMessage(data.error)}</Banner>;
  if (!data.data) return <p className="text-muted">Loading…</p>;
  const { wallet, clientName, bond, notifications } = data.data;
  const state = !wallet ? '' : wallet.balance < 0 ? 'Negative' : wallet.balance < wallet.minimumBalance ? 'Below minimum' : 'OK';
  const reversible = txns.filter((t) => t.type !== 'Reversal' && !t.reversedById);
  const after = wallet ? wallet.balance + (v.type === 'Replenishment' || v.type === 'Adjustment' ? v.amount : v.type === 'Deduction' ? -v.amount : -(txns.find((t) => t.id === v.reversesId)?.amount ?? 0)) : 0;
  const invalid = v.type === 'Reversal' ? !v.reversesId || !v.reason.trim() : v.amount <= 0 || (v.type === 'Replenishment' ? !v.treasuryRef.trim() : !v.reason.trim() || (v.type === 'Deduction' && !v.referenceId.trim()));
  const RefCell = ({ t }: { t: Row }) => {
    const id = t.referenceId;
    const main = t.type === 'Reversal' ? <span>Reverses <span className="font-mono">{t.reversesId ?? id}</span></span>
      : t.referenceType === 'Rescue' && id ? <Link className={lnk} to={`/rescue/${id}`}>Rescue {id}</Link>
      : t.referenceType === 'Repair' && id ? <Link className={lnk} to={`/repair/jo/${id}`}>JO {id}</Link>
      : t.referenceType === 'Invoice' && id ? <Link className={lnk} to={`/billing/invoices/${id}`}>{id}</Link>
      : t.referenceType === 'Debit Memo' && id ? <Link className={lnk} to="/billing/memos">{id}</Link>
      : t.type === 'Replenishment' ? <span>{t.receiptNo ? <Link className={lnk} to="/billing/receipts">{t.receiptNo}</Link> : <span className="text-muted">{t.referenceType}{id ? ` ${id}` : ''}</span>}</span>
      : <span>{[t.referenceType, id].filter(Boolean).join(' ')}</span>;
    return <div className="text-xs">{main}{t.debitMemoNo && t.referenceType === 'Rescue' && <p><Link className={lnk} to="/billing/memos">{t.debitMemoNo}</Link></p>}{t.treasuryRef && <p className="text-muted">Treasury {t.treasuryRef}</p>}</div>;
  };
  return (
    <>
      <PageHeader breadcrumb={<Crumb items={[{ to: '/ewallet', label: 'E-wallets' }, { label: clientName }]} />} title={<span className="flex items-center gap-2">E-wallet — {clientName} {state && stateBadge(state)}</span>} meta={<ScreenTag id="SCR-40" />}
        description="One ledger, two fund types: E-Wallet (prepaid charges) and Cash Bond (security deposit), with separate balances."
        actions={can('ewl.txn', 'add') && wallet && <Button icon={<Wallet className="size-4" />} onClick={() => setOpen(true)}>Replenish / special transaction</Button>} />
      <Tabs className="mb-5" value={fund} onChange={setFund} items={[{ id: 'ewallet', label: 'E-Wallet', count: txns.length }, { id: 'bond', label: 'Cash Bond', count: bond.entries.length }]} />
      {fund === 'bond' ? (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-3"><KpiTile label="Cash bond held" value={formatPhp(bond.held)} /><KpiTile label="Bond entries" value={bond.entries.length} /><KpiTile label="E-wallet balance (separate)" value={wallet ? <MoneyText value={wallet.balance} /> : '—'} /></div>
          <DataTable data={bond.entries} searchable={false} exportName={`cash-bond-${code}`} emptyTitle="No cash bond on record" emptyHint="Cash bonds are recorded in Clients › Cash bonds." columns={[
            { accessorKey: 'at', header: 'Date', cell: (x) => formatDate(x.getValue<string>()) }, { accessorKey: 'entry', header: 'Entry', cell: (x) => <Badge tone={x.getValue() === 'Bond received' ? 'success' : x.getValue() === 'Withdrawal requested' ? 'neutral' : 'warning'} dot={false}>{x.getValue<string>()}</Badge> },
            { accessorKey: 'contractNo', header: 'Contract', cell: (x) => (x.getValue() ? <Link className={lnk} to={`/contracts/${x.getValue()}`}>{x.getValue<string>()}</Link> : '—') },
            { accessorKey: 'amount', header: 'Amount', meta: { align: 'right' }, cell: (x) => <MoneyText value={x.getValue<number>()} /> }, { accessorKey: 'balanceAfter', header: 'Bond balance', meta: { align: 'right' }, cell: (x) => <MoneyText value={x.getValue<number>()} /> },
            { accessorKey: 'reference', header: 'Reference', cell: (x) => <Link className={lnk} to="/cash-bonds">{x.getValue<string>()}</Link> }, { accessorKey: 'status', header: 'Status' }]} />
        </>
      ) : !wallet ? <Banner tone="info" title="This client has no e-wallet yet">Create it from <Link className="font-medium underline" to="/ewallet">E-wallets</Link> once Treasury confirms the initial payment.</Banner> : (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <KpiTile label="Current balance" value={<MoneyText value={wallet.balance} />} tone={wallet.balance < 0 ? 'danger' : wallet.balance < wallet.minimumBalance ? 'warning' : 'success'} hint={`Last aging sync ${data.data.lastAgingSync ? formatDateTime(data.data.lastAgingSync) : '—'}`} />
            <KpiTile label="Minimum balance" value={formatPhp(wallet.minimumBalance)} /><KpiTile label="Pending top-ups" value={data.data.topups.filter((t) => t.status !== 'Posted' && t.status !== 'Rejected').length} />
          </div>
          {wallet.balance < wallet.minimumBalance && <Banner className="mb-4" tone={wallet.balance < 0 ? 'danger' : 'warning'} title={wallet.balance < 0 ? 'Negative balance' : 'Below minimum balance'}>Client, AE, Operations and C&amp;C are notified on every movement while below the minimum — see notification history below.</Banner>}
          {wallet.receiptNo && <Card className="mb-5"><CardHeader title="Initial funding" /><KeyValueGrid items={[{ label: 'Receipt', value: <Link className={lnk} to="/billing/receipts">{wallet.receiptNo}</Link> }, { label: 'Funds cleared', value: formatDate(wallet.clearedDate) }, { label: 'Method / bank ref', value: `${wallet.paymentMethod ?? '—'} · ${wallet.bankRef ?? '—'}` }, { label: 'Treasury ref', value: wallet.treasuryRef ?? '—' }, { label: 'Treasury confirmed', value: `${userName(wallet.treasuryConfirmedBy)} · ${formatDateTime(wallet.treasuryConfirmedAt)}` }, { label: 'Created by', value: `${userName(wallet.createdBy)} · ${formatDateTime(wallet.createdAt)}` }, { label: 'Allow for Rescue', value: data.data.allowRescue ? 'Enabled' : 'Off' }]} /></Card>}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Segmented<'all' | 'loads'> value={view} onChange={setView} options={[{ value: 'all', label: 'All transactions' }, { value: 'loads', label: 'Load / replenishment history' }]} />
            {view === 'loads' && <p className="text-sm">Total loaded in view <strong>{formatPhp(shown.reduce((a, t) => a + t.amount, 0))}</strong></p>}
          </div>
          <DataTable<Row> data={shown} exportName={view === 'loads' ? `ewallet-load-history-${code}` : `ewallet-${code}`} searchPlaceholder="Search txn, reference, reason…" emptyTitle="No transactions for the selected filters"
            toolbar={<div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter label="Date" from={f.from} to={f.to} onChange={(r) => setF({ ...f, ...r })} />
              <Select aria-label="Type" wrapperClassName="w-36" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="All types" options={['Replenishment', 'Deduction', 'Adjustment', 'Reversal'].map((x) => ({ value: x, label: x }))} />
              <Select aria-label="Category" wrapperClassName="w-44" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="All categories" options={['Top-up', ...DEDUCTION_SCOPE, 'Reversal', 'Adjustment'].map((x) => ({ value: x, label: x }))} /></div>}
            columns={[
              { accessorKey: 'at', header: 'Date', cell: (x) => formatDateTime(x.getValue<string>()) }, { accessorKey: 'id', header: 'Txn', cell: (x) => <span className="font-mono text-xs">{x.getValue<string>()}</span> },
              { accessorKey: 'type', header: 'Type', cell: (x) => <Badge tone={x.getValue() === 'Replenishment' ? 'success' : x.getValue() === 'Deduction' ? 'warning' : 'purple'} dot={false}>{x.getValue<string>()}</Badge> },
              { accessorKey: 'category', header: 'Category' },
              { accessorKey: 'amount', header: 'Amount', meta: { align: 'right' }, cell: (x) => <span className={cn('tabular', x.getValue<number>() < 0 ? 'text-danger' : 'text-success')}>{x.getValue<number>() > 0 ? '+' : '−'}{formatPhp(Math.abs(x.getValue<number>()))}</span> },
              { accessorKey: 'balanceAfter', header: 'Running balance', meta: { align: 'right' }, cell: (x) => <MoneyText value={x.getValue<number>()} /> },
              { accessorKey: 'referenceId', header: 'Reference', cell: (x) => <RefCell t={x.row.original} /> },
              { accessorKey: 'reason', header: 'Reason', cell: (x) => <div className="text-xs">{x.getValue<string>() ?? ''}{x.row.original.reversedById && <p><Badge tone="purple" dot={false}>Reversed by {x.row.original.reversedById}</Badge></p>}</div> },
              { accessorKey: 'by', header: 'By', cell: (x) => userName(x.getValue<string>()) },
              { accessorKey: 'agingSyncedAt', header: 'Aging sync', cell: (x) => (x.getValue() ? <Badge tone="success" dot={false}>Synced</Badge> : <span className="text-xs text-muted">n/a</span>) }]} />
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
            <Card><CardHeader title="Notification history" description="Client, AE, Operations and C&C on deduction, replenishment and below-minimum" />
              {notifications.length ? <ul className="divide-y divide-line">{notifications.map((n) => <li key={n.at + n.title} className="py-2 text-sm"><p className="font-medium">{n.title}</p><p className="text-xs text-muted">{formatDateTime(n.at)} · {n.body} · to {n.recipients.join(', ')}</p></li>)}</ul> : <p className="text-sm text-muted">No notifications sent yet.</p>}</Card>
            <Card><CardHeader title="Rules on this ledger" />
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
                <li>Deductions only for Rescue, Repair, Debit Memo — leasing charges only on contract termination.</li>
                <li>Rescue/repair debit-memo deductions post without approval; manual deductions, adjustments and reversals need a reason and Accounting-supervisor approval.</li>
                <li>A reversal is its own row linked to the original; the original is marked “Reversed by”.</li>
                <li>E-wallet-paid amounts synchronise to Aging Receivables automatically.</li>
                <li>Client portal view shows date, type, amount, running balance and reference — not the posting user or internal reasons.</li>
              </ul></Card>
          </div>
        </>
      )}
      <Modal open={open} onClose={close} title="Replenishment & special transaction" description="Deductions, adjustments and reversals need a documented reason and approval; replenishments need the Treasury confirmation." size="lg"
        footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={post.isPending} disabled={invalid} onClick={() => post.mutate(undefined)}>{v.type === 'Replenishment' ? 'Post replenishment' : 'Submit for approval'}</Button></>}>
        <Stack>
          <FormGrid>
            <Select label="Transaction type" required value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as EwalletTxnType, referenceType: e.target.value === 'Replenishment' ? 'Top-up' : e.target.value === 'Deduction' ? 'Rescue' : 'Manual' })} options={['Replenishment', 'Deduction', 'Adjustment', 'Reversal'].map((x) => ({ value: x, label: x }))} />
            {v.type === 'Reversal' ? <Select label="Transaction to reverse" required value={v.reversesId} onChange={(e) => setV({ ...v, reversesId: e.target.value })} placeholder="Select" options={reversible.map((t) => ({ value: t.id, label: `${t.id} · ${t.type} · ${formatPhp(t.amount)} · ${formatDate(t.at)}` }))} />
              : <MoneyInput label="Amount" required value={v.amount || ''} onChange={(e) => setV({ ...v, amount: Number(e.target.value) })} />}
            {v.type === 'Deduction' && <Select label="Category" required value={v.category} onChange={(e) => { const cat = e.target.value as EwalletCategory; setV({ ...v, category: cat, referenceType: cat === 'Repair' ? 'Repair' : cat === 'Contract-termination lease' ? 'Invoice' : cat }); }} options={DEDUCTION_SCOPE.map((x) => ({ value: x, label: x }))} hint={v.category === 'Contract-termination lease' ? 'Only for a contract-termination case — reference the final invoice.' : undefined} />}
            {v.type !== 'Reversal' && v.type !== 'Deduction' && <Select label="Reference type" value={v.referenceType} onChange={(e) => setV({ ...v, referenceType: e.target.value })} options={(v.type === 'Replenishment' ? ['Top-up', 'Manual'] : ['Rescue', 'Repair', 'Debit Memo', 'Invoice', 'Manual']).map((x) => ({ value: x, label: x }))} />}
            {v.type !== 'Reversal' && <Input label={v.type === 'Deduction' ? 'Source document no.' : 'Reference no.'} required={v.type === 'Deduction'} value={v.referenceId} onChange={(e) => setV({ ...v, referenceId: e.target.value })} placeholder={v.type === 'Deduction' ? 'RSC-…, JO-…, DM-… or INV-…' : ''} />}
            {v.type === 'Replenishment' && <><Input label="Treasury confirmation ref." required value={v.treasuryRef} onChange={(e) => setV({ ...v, treasuryRef: e.target.value })} placeholder="e.g. BDO-TRX-0001" /><Input label="PR / OR no." value={v.receiptNo} onChange={(e) => setV({ ...v, receiptNo: e.target.value })} placeholder="e.g. OR7000000" /></>}
          </FormGrid>
          {v.type !== 'Replenishment' && <Textarea label="Reason" required value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="e.g. applied to wrong rescue transaction / duplicate payment" />}
          {wallet && <div className="flex justify-between rounded-lg bg-surface-alt px-4 py-2 text-sm"><span>Resulting balance</span><MoneyText value={after} strong /></div>}
          {wallet && after < wallet.minimumBalance && <Banner tone={after < 0 ? 'danger' : 'warning'}>{after < 0 ? 'This takes the wallet negative — allowed, but manual entries require approval.' : 'Result is below the minimum balance.'}</Banner>}
          <p className="text-xs text-muted">Approved entries reach this ledger and Aging Receivables together; every entry is audited (who, when, reason).</p>
          {post.error && <Banner tone="danger">{errMessage(post.error)}</Banner>}
        </Stack>
      </Modal>
    </>
  );
}
