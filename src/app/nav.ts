import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Truck, ArrowUpFromLine, ArrowDownToLine, FileText, Clock, Grid3x3, ClipboardList, ParkingSquare, LifeBuoy,
  Activity, Wrench, BarChart3, Users, ShieldCheck, FileSignature, Wallet, TrendingUp, Receipt, FileMinus, Banknote,
  Gauge, Scale, Container, Forklift, Boxes, ArrowLeftRight, ShoppingCart, BadgeCheck, CalendarClock, Settings, Database,
  ScrollText, BellRing, LineChart, Library, UserCog, CircleDollarSign,
} from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon; perm: string; screen?: string }
export interface NavGroup { label: string; items: NavItem[] }

// Grouped for "minimal navigation" (NFR-005, docs/02 §4). Items render only when the user holds the view permission.
export const NAV: NavGroup[] = [
  { label: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: '*' }] },
  {
    label: 'Operations', items: [
      { to: '/gate/ewa', label: 'EWA', icon: Truck, perm: 'gate.ewa', screen: 'SCR-14' },
      { to: '/gate/out', label: 'Gate Out', icon: ArrowUpFromLine, perm: 'gate.out', screen: 'SCR-15' },
      { to: '/gate/in', label: 'Gate In', icon: ArrowDownToLine, perm: 'gate.in', screen: 'SCR-16' },
      { to: '/gate/eir', label: 'EIR', icon: FileText, perm: 'gate.eir', screen: 'SCR-17' },
      { to: '/gate/late', label: 'Late Encoding', icon: Clock, perm: 'gate.late_encoding', screen: 'SCR-18' },
      { to: '/allocation', label: 'Allocation', icon: Grid3x3, perm: 'alloc.board', screen: 'SCR-19' },
      { to: '/allocation/dcir', label: 'DCIR', icon: ClipboardList, perm: 'alloc.dcir', screen: 'SCR-20' },
      { to: '/allocation/park-fix', label: 'Park & Fix', icon: ParkingSquare, perm: 'alloc.parkfix', screen: 'SCR-21' },
    ],
  },
  {
    label: 'Rescue & Repair', items: [
      { to: '/rescue', label: 'Rescue Requests', icon: LifeBuoy, perm: 'rescue.request', screen: 'SCR-22/23' },
      { to: '/rescue/dashboard', label: 'Rescue Dashboard', icon: Activity, perm: 'rescue.request', screen: 'SCR-24' },
      { to: '/repair', label: 'Job Orders', icon: Wrench, perm: 'repair.jo', screen: 'SCR-25/26' },
      { to: '/repair/reports', label: 'Labor Reports', icon: BarChart3, perm: 'repair.labor_reports', screen: 'SCR-27' },
    ],
  },
  {
    label: 'Clients & Sales', items: [
      { to: '/clients', label: 'Clients', icon: Users, perm: 'clients.client', screen: 'SCR-04/06' },
      { to: '/clients/accreditation', label: 'Accreditation', icon: ShieldCheck, perm: 'clients.accreditation', screen: 'SCR-07' },
      { to: '/contracts', label: 'Contracts', icon: FileSignature, perm: 'clients.contract', screen: 'SCR-08' },
      { to: '/cash-bonds', label: 'Cash Bonds', icon: CircleDollarSign, perm: 'clients.cashbond', screen: 'SCR-09' },
      { to: '/sales', label: 'Sales Performance', icon: TrendingUp, perm: 'clients.sales', screen: 'SCR-11' },
    ],
  },
  {
    label: 'Finance', items: [
      { to: '/billing/run', label: 'Billing Run', icon: Receipt, perm: 'fin.billing', screen: 'SCR-34' },
      { to: '/billing/invoices', label: 'Invoices', icon: FileText, perm: 'fin.invoice', screen: 'SCR-35' },
      { to: '/billing/receipts', label: 'Receipts', icon: Banknote, perm: 'fin.receipt', screen: 'SCR-36' },
      { to: '/billing/memos', label: 'CM / DM', icon: FileMinus, perm: 'fin.memo', screen: 'SCR-37' },
      { to: '/ewallet', label: 'E-Wallet', icon: Wallet, perm: 'ewl.ledger', screen: 'SCR-40/41' },
    ],
  },
  {
    label: 'Credit', items: [
      { to: '/credit/status', label: 'Client Status', icon: Gauge, perm: 'cnc.status', screen: 'SCR-38' },
      { to: '/credit/aging', label: 'Aging & Collection', icon: Scale, perm: 'cnc.aging', screen: 'SCR-39' },
    ],
  },
  {
    label: 'Assets', items: [
      { to: '/chassis', label: 'Chassis', icon: Container, perm: 'chassis.chassis', screen: 'SCR-12' },
      { to: '/assets', label: 'Non-Chassis Equipment', icon: Forklift, perm: 'chassis.asset', screen: 'SCR-13' },
      { to: '/inventory', label: 'Inventory', icon: Boxes, perm: 'inv.balance', screen: 'SCR-29' },
      { to: '/inventory/transactions', label: 'Stock Transactions', icon: ArrowLeftRight, perm: 'inv.txn', screen: 'SCR-28' },
    ],
  },
  { label: 'Procurement', items: [{ to: '/procurement', label: 'PR / PO / RR / RFP', icon: ShoppingCart, perm: 'prc.pr|prc.po|prc.rr', screen: 'SCR-30–32' }] },
  {
    label: 'Compliance', items: [
      { to: '/regulatory', label: 'Registrations', icon: BadgeCheck, perm: 'reg.registration', screen: 'SCR-42' },
      { to: '/regulatory/compliance', label: 'Compliance Dashboard', icon: CalendarClock, perm: 'reg.compliance', screen: 'SCR-43' },
    ],
  },
  {
    label: 'Reports', items: [
      { to: '/reports/executive', label: 'Executive', icon: LineChart, perm: 'rpt.executive', screen: 'SCR-45' },
      { to: '/reports', label: 'Report Library', icon: Library, perm: 'rpt.library', screen: 'SCR-46' },
    ],
  },
  {
    label: 'Admin', items: [
      { to: '/admin/users', label: 'Users & Roles', icon: UserCog, perm: 'admin.users', screen: 'SCR-03' },
      { to: '/admin/notifications', label: 'Notification Rules', icon: BellRing, perm: 'not.rules', screen: 'SCR-44' },
      { to: '/admin/settings', label: 'Settings', icon: Settings, perm: 'admin.settings', screen: 'SUP-05' },
      { to: '/admin/master', label: 'Master Data', icon: Database, perm: 'admin.masterdata', screen: 'SUP-06' },
      { to: '/admin/audit', label: 'Audit Log', icon: ScrollText, perm: 'admin.audit', screen: 'SUP-04' },
    ],
  },
];
