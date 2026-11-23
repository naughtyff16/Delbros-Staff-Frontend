import { createBrowserRouter, Navigate, useRouteError, type RouteObject } from 'react-router';
import { Banner, Button } from '../lib/ui';
import { AppShell } from './AppShell';
import { RequireAuth, RequirePermission, RoleLanding } from './guards';
import { LoginPage } from '../modules/admin/LoginPage';

type Loader = () => Promise<object>;
/** Lazy module route with a permission guard (docs/02 §4). */
const page = (path: string, perm: string, load: Loader, name: string): RouteObject => ({
  path,
  lazy: async () => {
    const m = (await load()) as Record<string, React.ComponentType>;
    const C = m[name];
    return { Component: () => <RequirePermission perm={perm}><C /></RequirePermission> };
  },
});

function RouteError() {
  const err = useRouteError() as Error;
  return (
    <div className="mx-auto max-w-xl p-8">
      <Banner tone="danger" title="This screen failed to load">{err?.message ?? 'Unexpected error'}</Banner>
      <Button className="mt-4" variant="secondary" onClick={() => window.location.reload()}>Reload</Button>
    </div>
  );
}

const admin = () => import('../modules/admin/pages');
const clients = () => import('../modules/clients/pages');
const contracts = () => import('../modules/clients/contracts');
const chassis = () => import('../modules/chassis/pages');
const gate = () => import('../modules/gate/pages');
const gateIn = () => import('../modules/gate/inbound');
const alloc = () => import('../modules/allocation/pages');
const rescue = () => import('../modules/rescue/pages');
const repair = () => import('../modules/repair/pages');
const inventory = () => import('../modules/inventory/pages');
const procurement = () => import('../modules/procurement/pages');
const billing = () => import('../modules/billing/pages');
const credit = () => import('../modules/credit/pages');
const ewallet = () => import('../modules/ewallet/pages');
const regulatory = () => import('../modules/regulatory/pages');
const reports = () => import('../modules/reports/pages');
const inbox = () => import('../modules/inbox/pages');

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <RequireAuth><AppShell /></RequireAuth>,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <RoleLanding /> },
      page('dashboard', '*', reports, 'OperationsDashboard'),
      page('approvals', '*', inbox, 'ApprovalsPage'),
      page('notifications', '*', inbox, 'NotificationsPage'),
      page('account/password', '*', admin, 'ChangePasswordPage'),
      page('account/profile', '*', inbox, 'ProfilePage'), // staff review 1.2: My profile (user menu)
      // M01 Admin
      page('admin/users', 'admin.users', admin, 'UsersPage'),
      page('admin/audit', 'admin.audit', admin, 'AuditPage'),
      page('admin/settings', 'admin.settings', admin, 'SettingsPage'),
      page('admin/master', 'admin.masterdata', admin, 'MasterDataPage'),
      page('admin/notifications', 'not.rules', inbox, 'NotificationRulesPage'),
      // M02 Clients
      page('clients', 'clients.client', clients, 'ClientListPage'),
      page('clients/new', 'clients.client', clients, 'ClientRegisterPage'),
      page('clients/accreditation', 'clients.accreditation', clients, 'AccreditationPage'),
      page('clients/:code', 'clients.client', clients, 'ClientProfilePage'),
      page('contracts', 'clients.contract', contracts, 'ContractListPage'),
      page('contracts/new', 'clients.contract', contracts, 'ContractCreatePage'),
      page('contracts/:no', 'clients.contract', contracts, 'ContractDetailPage'),
      page('cash-bonds', 'clients.cashbond', contracts, 'CashBondPage'),
      page('sales', 'clients.sales', clients, 'SalesPerformancePage'),
      // M03 Chassis & assets
      page('chassis', 'chassis.chassis', chassis, 'ChassisListPage'),
      page('chassis/:no', 'chassis.chassis', chassis, 'ChassisDetailPage'),
      page('assets', 'chassis.asset', chassis, 'AssetsPage'),
      // M04 Gate
      page('gate/ewa', 'gate.ewa', gate, 'EwaPage'),
      page('gate/out', 'gate.out', gate, 'GateOutPage'),
      page('gate/in', 'gate.in', gateIn, 'GateInPage'),
      page('gate/eir', 'gate.eir', gate, 'EirPage'),
      page('gate/late', 'gate.late_encoding', gateIn, 'LateEncodingPage'),
      // M05 Allocation
      page('allocation', 'alloc.board', alloc, 'AllocationPage'),
      page('allocation/dcir', 'alloc.dcir', alloc, 'DcirPage'),
      page('allocation/park-fix', 'alloc.parkfix', alloc, 'ParkFixPage'),
      // M06 Rescue
      page('rescue', 'rescue.request', rescue, 'RescueListPage'),
      page('rescue/dashboard', 'rescue.request', rescue, 'RescueDashboardPage'),
      page('rescue/:no', 'rescue.request', rescue, 'RescueDetailPage'),
      // M07 Repair
      page('repair', 'repair.jo', repair, 'JobOrderListPage'),
      page('repair/new', 'repair.jo', repair, 'JobOrderCreatePage'),
      page('repair/reports', 'repair.labor_reports', repair, 'LaborReportsPage'),
      page('repair/jo/:no', 'repair.jo', repair, 'JobOrderDetailPage'),
      // M08 Inventory
      page('inventory', 'inv.balance', inventory, 'InventorySummaryPage'),
      page('inventory/transactions', 'inv.txn', inventory, 'StockTransactionPage'),
      // M09 Procurement
      page('procurement', 'prc.pr', procurement, 'ProcurementPage'),
      // M10 Billing
      page('billing/run', 'fin.billing', billing, 'BillingRunPage'),
      page('billing/invoices', 'fin.invoice', billing, 'InvoiceListPage'),
      page('billing/invoices/:no', 'fin.invoice', billing, 'InvoiceDetailPage'),
      page('billing/receipts', 'fin.receipt', billing, 'ReceiptPage'),
      page('billing/memos', 'fin.memo', billing, 'MemoPage'),
      // M11 Credit
      page('credit/status', 'cnc.status', credit, 'ClientStatusPage'),
      page('credit/aging', 'cnc.aging', credit, 'AgingPage'),
      page('credit/soa/:code', 'cnc.aging', credit, 'SoaPage'),
      // M12 E-wallet
      page('ewallet', 'ewl.ledger', ewallet, 'EwalletListPage'),
      page('ewallet/:code', 'ewl.ledger', ewallet, 'EwalletLedgerPage'),
      // M13 Regulatory
      page('regulatory', 'reg.registration', regulatory, 'RegistrationPage'),
      page('regulatory/compliance', 'reg.compliance', regulatory, 'CompliancePage'),
      // M15 Reports
      page('reports/executive', 'rpt.executive', reports, 'ExecutiveDashboardPage'),
      page('reports', 'rpt.library', reports, 'ReportLibraryPage'),
      page('reports/view/:code', '*', reports, 'ReportViewerPage'), // per-report permission + unauthorised state checked in the viewer
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
