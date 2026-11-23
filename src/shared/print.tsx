import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { amountInWords, formatDateTime, formatPhp, type Eir, type GatePass } from '../lib/shared';
import { Banner, Button, Modal } from '../lib/ui';
import { useRefLookups } from './hooks';
import logo from '../assets/delbros-logo.png';

/** On-screen preview of the server-rendered PDF layouts in docs/12. Browser print uses the .print-root rules in index.css. */
/** `onPrint` (optional) runs before the browser print dialog, e.g. to log the print and apply a reprint watermark; a rejected promise cancels printing. */
/** `landscape` for wide matrices (e.g. DCIR): wider sheet on screen and a landscape page when printed. */
export function PrintPreview({ open, onClose, title, children, toolbar, onPrint, landscape }: { open: boolean; onClose: () => void; title: string; children: ReactNode; toolbar?: ReactNode; onPrint?: () => Promise<void> | void; landscape?: boolean }) {
  const [busy, setBusy] = useState(false);
  const co = useCompany();
  const missing = [!co.address && 'Registered address', !co.tin && 'TIN', !co.permit && 'BIR permit details'].filter(Boolean) as string[];
  const print = async () => {
    if (onPrint) { setBusy(true); try { await onPrint(); } catch { return; } finally { setBusy(false); } }
    setTimeout(() => window.print(), 50); // let the watermark re-render first
  };
  return (
    <Modal open={open} onClose={onClose} title={title} size="doc" description="Print preview — check the document before printing."
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button icon={<Printer className="size-4" />} loading={busy} onClick={print}>Print</Button></>}>
      {missing.length > 0 && <Banner tone="warning" className="mb-3" title="Company details not set">{missing.join(', ')} will not print until entered in Admin → System settings → Company.</Banner>}
      {toolbar && <div className="mb-3 flex flex-wrap items-end gap-3">{toolbar}</div>}
      {landscape && <style>{'@media print { @page { size: letter landscape; } }'}</style>}
      <div className={`print-area mx-auto ${landscape ? 'max-w-[11in]' : 'max-w-[8.5in]'} bg-white p-6 text-[12px] leading-snug text-black shadow-inner ring-1 ring-line`}>{children}</div>
      {/* Print copy outside the modal, in normal page flow (see index.css): multi-page documents paginate instead of overlapping. */}
      {open && createPortal(<div className="print-root">{children}</div>, document.body)}
    </Modal>
  );
}

/** Company details from Admin → System settings → Company; a line is left out until Finance enters it. */
function useCompany() {
  const { setting } = useRefLookups();
  const v = (k: string) => String(setting(k) ?? '').trim();
  return { address: v('co.registered_address'), tin: v('co.tin'), permit: v('co.bir_permit') };
}

export function DocHeader({ title, no, date, extra }: { title: string; no: string; date: string; extra?: ReactNode }) {
  const co = useCompany();
  return (
    <div className="mb-3 flex break-inside-avoid items-start justify-between border-b-2 border-brand-600 pb-3">
      <div className="flex items-start gap-3">
        <img src={logo} alt="" className="h-12" />
        <div>
          <p className="text-[15px] font-bold tracking-wide">DELBROS LEASING</p>
          {co.address && <p>{co.address}</p>}
          {co.tin && <p>VAT Reg. TIN {co.tin}</p>}
        </div>
      </div>
      <div className="min-w-[200px] rounded border border-black/60 p-2 text-right">
        <p className="text-[13px] font-bold">{title}</p>
        <p>No. <span className="font-mono font-semibold">{no}</span></p>
        <p>Date {date}</p>
        {extra}
      </div>
    </div>
  );
}

export function DocFooter({ copy, reprint }: { copy: string; reprint?: number }) {
  const co = useCompany();
  return (
    <div className="mt-4 flex break-inside-avoid items-end justify-between border-t border-black/40 pt-2 text-[10px]">
      <div>{co.permit && <p>{co.permit}</p>}<p>Printed {formatDateTime(new Date().toISOString())}{reprint ? ` · REPRINT #${reprint}` : ''}</p></div>
      <p className="font-semibold">{copy}</p>
      <div className="flex size-14 items-center justify-center border border-black/50 text-[8px]">QR verify</div>
    </div>
  );
}

/** Diagonal watermark (REPRINT #n / DRAFT / CANCELLED) for invoices, receipts and memos (SCR-35..37); parent must be `relative`. */
export function Watermark({ text }: { text?: string }) {
  return text ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-bold text-black/5 rotate-[-20deg]">{text}</div> : null;
}

/** Prepared-by / authorised-signature area for finance documents (DBL-FIN-006; final template pending Finance). */
export function SignatureBlock({ items }: { items: { label: string; name?: string }[] }) {
  return (
    <div className="mt-6 grid break-inside-avoid gap-10" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((s) => <div key={s.label}><p className="font-semibold">{s.label}</p><p className="mt-8 border-t border-black/60">{s.name ?? ''}</p></div>)}
    </div>
  );
}

const EIR_STATUS: Record<string, string> = { OK: 'OK', DMG: 'Damaged', MSG: 'Missing', WRN: 'Worn', RPL: 'Replaced' };

/** EIR (DBL-GAT-006/007): `copy` picks the outbound or inbound template; reprints show number, user, time and reason plus a visible watermark. */
export function EirDocument({ eir, out, inn, clientName, eqName, reprint, copy, userName, reprintInfo }: {
  eir: Eir; out?: GatePass; inn?: GatePass; clientName: string; eqName: (c: string) => string; reprint?: number;
  copy?: 'OUT' | 'IN'; userName?: (id?: string) => string; reprintInfo?: { no: number; by: string; at: string; reason: string };
}) {
  const inbound = copy ? copy === 'IN' && !!inn : !!inn;
  const gp = inbound ? inn : out;
  const lines = gp?.inspection ?? [];
  const charge = lines.reduce((a, l) => a + l.chargeable, 0);
  const noted = lines.filter((l) => l.statusCode !== 'OK').map((l) => `${l.part}: ${EIR_STATUS[l.statusCode] ?? l.statusCode}`).join('; ');
  return (
    <div className="relative">
      {reprint ? <div className="pointer-events-none absolute inset-x-0 bottom-[22%] top-[35%] flex items-center justify-center text-7xl font-bold text-black/[0.18] rotate-[-20deg]">REPRINT #{reprint}</div> : null}
      {reprintInfo && <p className="mb-2 border border-black/60 px-2 py-1 text-center font-semibold">REPRINT #{reprintInfo.no} · by {reprintInfo.by} · {formatDateTime(reprintInfo.at)} · reason: {reprintInfo.reason}</p>}
      <DocHeader title={`EQUIPMENT INTERCHANGE RECEIPT — ${inbound ? 'INBOUND' : 'OUTBOUND'}`} no={eir.eirNo} date={formatDateTime(gp?.actualEventAt ?? eir.eirOutDate)}
        extra={<><p>Gate pass out <span className="font-mono">{out?.gatePassNo ?? eir.gatePassOutNo}</span></p><p>Gate pass in {inn?.gatePassNo ?? eir.gatePassInNo ? <span className="font-mono">{inn?.gatePassNo ?? eir.gatePassInNo}</span> : '—'}</p></>} />
      <table className="mb-3 w-full"><tbody>
        {[
          ['CLIENT', `${eir.clientCode} ${clientName}`, 'CONTRACT', eir.contractNo],
          ['EWA / EU No.', out?.euNo ?? inn?.euNo ?? '—', 'BOOKING No.', eir.bookingNo || '—'],
          ['EQUIPMENT', `${eir.chassisNo} · ${eqName(eir.chassisType)}`, 'DEPOT', eir.depotCode],
          ['TRUCKER', `${gp?.trucker ?? ''} · Plate ${gp?.truckPlateNo ?? ''}`, 'TRUCK OR/CR', gp?.truckOrcr ?? '—'],
          ['DRIVER', `${gp?.driverName ?? ''}`, 'DRIVER LICENCE No.', gp?.driverLicenseNo ?? ''],
          ...(inbound && inn ? [['GATE OUT', `${out?.gatePassNo ?? eir.gatePassOutNo} · ${formatDateTime(eir.eirOutDate)}`, 'FLAT TIRES / VANDALIZED', `${inn.flatTires ?? 0} / ${inn.vandalized ? 'Y' : 'N'}`]] : []),
        ].map((r, i) => <tr key={i}><td className="w-28 py-0.5 font-semibold">{r[0]}</td><td className="py-0.5">{r[1]}</td><td className="w-36 py-0.5 font-semibold">{r[2]}</td><td className="py-0.5">{r[3]}</td></tr>)}
      </tbody></table>
      <p className="mb-1 flex justify-between font-semibold"><span>CONDITION CHECKLIST</span><span>GENERAL ASSESSMENT: {gp?.generalAssessment?.toUpperCase()}</span></p>
      <table className="w-full border border-black/50">
        <thead><tr className="bg-black/5">{['Part', 'Branding', 'Tread depth', 'Status', 'Qty', 'Chargeable ₱'].map((h) => <th key={h} className="border border-black/40 px-1 py-0.5 text-left">{h}</th>)}</tr></thead>
        <tbody>{lines.length ? lines.map((l) => <tr key={l.part}>{[l.part, l.branding || '—', l.threadDepth || '—', EIR_STATUS[l.statusCode] ?? l.statusCode, l.qty, formatPhp(l.chargeable)].map((v, i) => <td key={i} className={`border border-black/30 px-1 py-0.5${i >= 4 ? ' text-right' : ''}`}>{v}</td>)}</tr>) : <tr><td colSpan={6} className="px-1 py-2 text-center">Checklist not recorded for this movement.</td></tr>}</tbody>
      </table>
      <p className="mt-1 text-right font-semibold">Total chargeable damages {formatPhp(charge)}</p>
      <div className="mt-2 min-h-12 border border-black/50 p-1.5"><p className="font-semibold">REMARKS / NOTED DAMAGE OR MISSING ITEMS</p><p>{[gp?.remarks, noted].filter(Boolean).join(' — ') || 'None noted.'}</p>{gp?.photos?.length ? <p className="text-[10px]">Photos on file: {gp.photos.length} ({gp.photos.join(', ')})</p> : null}</div>
      <div className="mt-6 grid grid-cols-2 gap-10">
        <div><p className="font-semibold">{inbound ? 'Received' : 'Released'} by (Branch Generalist)</p><div className="h-12" /><p className="border-t border-black/60">{userName ? userName(gp?.encodedBy) : gp?.encodedBy}</p></div>
        <div><p className="font-semibold">Driver</p>{gp?.signature ? <img src={gp.signature} alt="Driver signature" className="h-12" /> : <div className="h-12" />}<p className="border-t border-black/60">{gp?.driverName}</p></div>
      </div>
      <p className="mt-3 text-[10px]">Terms: the trucker/client acknowledges the equipment in the condition stated above and is responsible for it until returned, per contract {eir.contractNo}.</p>
      <DocFooter copy="ORIGINAL – CLIENT/TRUCKER COPY" reprint={reprint} />
    </div>
  );
}

export { amountInWords };
