import type { RoleCode } from './types';

// Resource × action model from the legacy user_access table (docs/01 §6, docs/07 §3).
export const ACTIONS = ['view', 'add', 'edit', 'delete', 'check', 'approve', 'cancel', 'export'] as const;
export type Action = (typeof ACTIONS)[number];

export interface Resource { id: string; module: string; description: string }

export const RESOURCES: Resource[] = [
  { id: 'admin.users', module: 'Administration', description: 'User accounts' },
  { id: 'admin.roles', module: 'Administration', description: 'Roles & permission templates' },
  { id: 'admin.settings', module: 'Administration', description: 'System settings' },
  { id: 'admin.audit', module: 'Administration', description: 'Audit log' },
  { id: 'admin.masterdata', module: 'Administration', description: 'Master data' },
  { id: 'clients.client', module: 'Clients & Sales', description: 'Client master' },
  { id: 'clients.accreditation', module: 'Clients & Sales', description: 'Accreditation (BICI)' },
  { id: 'clients.contract', module: 'Clients & Sales', description: 'Contracts' },
  { id: 'clients.cashbond', module: 'Clients & Sales', description: 'Cash bonds' },
  { id: 'clients.sales', module: 'Clients & Sales', description: 'Sales performance' },
  { id: 'chassis.chassis', module: 'Assets', description: 'Chassis master' },
  { id: 'chassis.asset', module: 'Assets', description: 'Non-chassis equipment' },
  { id: 'chassis.status', module: 'Assets', description: 'Chassis status change / Available sign-off' },
  { id: 'gate.ewa', module: 'Gate Operations', description: 'EWA' },
  { id: 'gate.out', module: 'Gate Operations', description: 'Gate Out' },
  { id: 'gate.in', module: 'Gate Operations', description: 'Gate In' },
  { id: 'gate.eir', module: 'Gate Operations', description: 'EIR view / reprint' },
  { id: 'gate.late_encoding', module: 'Gate Operations', description: 'Late encoding' },
  { id: 'gate.force_inbound', module: 'Gate Operations', description: 'Force inbound' },
  { id: 'alloc.board', module: 'Allocation', description: 'Allocation board' },
  { id: 'alloc.dcir', module: 'Allocation', description: 'DCIR' },
  { id: 'alloc.parkfix', module: 'Allocation', description: 'Park & Fix' },
  { id: 'rescue.request', module: 'Rescue', description: 'Rescue requests' },
  { id: 'rescue.dispatch', module: 'Rescue', description: 'Dispatch & cost entry' },
  { id: 'repair.jo', module: 'Repair', description: 'Job orders' },
  { id: 'repair.bom', module: 'Repair', description: 'Bill of materials' },
  { id: 'repair.labor_reports', module: 'Repair', description: 'Laborer / capacity / efficiency' },
  { id: 'inv.txn', module: 'Inventory', description: 'Stock transactions' },
  { id: 'inv.balance', module: 'Inventory', description: 'Inventory summary & audit' },
  { id: 'prc.pr', module: 'Procurement', description: 'Purchase requests' },
  { id: 'prc.po', module: 'Procurement', description: 'Purchase orders' },
  { id: 'prc.rr', module: 'Procurement', description: 'Receiving reports' },
  { id: 'prc.payment', module: 'Procurement', description: 'RFP / Petty cash' },
  { id: 'prc.vendor', module: 'Procurement', description: 'Vendors' },
  { id: 'fin.billing', module: 'Finance', description: 'Billing runs' },
  { id: 'fin.invoice', module: 'Finance', description: 'Invoices' },
  { id: 'fin.receipt', module: 'Finance', description: 'Receipts (OR/PR)' },
  { id: 'fin.memo', module: 'Finance', description: 'Credit / Debit memos' },
  { id: 'cnc.status', module: 'Credit & Collection', description: 'Client status inquiry' },
  { id: 'cnc.aging', module: 'Credit & Collection', description: 'Aging & collection' },
  { id: 'cnc.hold_lift', module: 'Credit & Collection', description: 'Hold-lift requests' },
  { id: 'ewl.ledger', module: 'E-Wallet', description: 'E-wallet ledger' },
  { id: 'ewl.txn', module: 'E-Wallet', description: 'E-wallet transactions' },
  { id: 'reg.registration', module: 'Regulatory', description: 'Registration master' },
  { id: 'reg.compliance', module: 'Regulatory', description: 'Compliance dashboard' },
  { id: 'not.rules', module: 'Notifications', description: 'Notification rules' },
  { id: 'rpt.executive', module: 'Reports', description: 'Executive dashboard' },
  { id: 'rpt.library', module: 'Reports', description: 'Report library' },
];

export type Grants = Record<string, Action[]>;
const ALL: Action[] = [...ACTIONS];
const VIEW: Action[] = ['view'];
const VIEW_EXPORT: Action[] = ['view', 'export'];
const WRITE: Action[] = ['view', 'add', 'edit', 'cancel'];
const grant = (ids: string[], a: Action[]): Grants => Object.fromEntries(ids.map((i) => [i, a]));

const OPS_VIEW = ['alloc.board', 'alloc.dcir', 'gate.eir', 'chassis.chassis', 'rescue.request', 'repair.jo', 'cnc.status', 'reg.compliance'];

// Role templates (docs/00 §6). Users may carry overrides in user_access.
export const ROLE_TEMPLATES: Record<RoleCode, { label: string; grants: Grants }> = {
  SYS_ADMIN: { label: 'System Administrator', grants: { ...grant(RESOURCES.map((r) => r.id), ALL) } },
  BRANCH_GENERALIST: {
    label: 'Branch Generalist',
    grants: {
      ...grant(OPS_VIEW, VIEW),
      ...grant(['gate.ewa', 'gate.out', 'gate.in', 'gate.late_encoding', 'rescue.dispatch', 'repair.bom', 'inv.txn', 'alloc.parkfix'], WRITE),
      'repair.jo': ['view', 'add', 'edit', 'approve'], 'gate.eir': ['view', 'export'], 'inv.balance': VIEW, 'clients.client': VIEW, 'ewl.ledger': VIEW,
    },
  },
  DYM: {
    label: 'Deputy Yard Manager',
    grants: { ...grant(OPS_VIEW, VIEW_EXPORT), ...grant(['gate.ewa', 'gate.out', 'gate.in'], WRITE), 'gate.late_encoding': ['view', 'approve'], 'repair.jo': ['view', 'edit', 'check', 'approve'], 'chassis.status': ['view', 'approve'], 'repair.labor_reports': VIEW_EXPORT, 'alloc.parkfix': [...WRITE, 'check'], 'inv.balance': VIEW, 'alloc.board': [...VIEW_EXPORT, 'add', 'edit'] }, // V1.4 row 21: 'check' = DYM sign-off on Park & Fix receipts
  },
  REGIONAL_MANAGER: { label: 'Regional Manager', grants: { ...grant(OPS_VIEW, VIEW_EXPORT), 'gate.ewa': ['view', 'approve'], 'gate.force_inbound': ['view', 'approve'], 'rpt.executive': VIEW, 'rpt.library': VIEW_EXPORT } },
  OPS_MANAGER: { label: 'Operations Manager', grants: { ...grant(OPS_VIEW, VIEW_EXPORT), 'gate.ewa': ['view', 'approve'], 'gate.force_inbound': ['view', 'approve'], 'chassis.status': ['view', 'approve'], 'repair.labor_reports': VIEW_EXPORT, 'rescue.dispatch': WRITE, 'rpt.executive': VIEW, 'rpt.library': VIEW_EXPORT, 'alloc.parkfix': [...WRITE, 'approve'], 'alloc.board': [...VIEW_EXPORT, 'add', 'edit'] } },
  RESCUE_COORDINATOR: { label: 'Rescue Coordinator', grants: { ...grant(OPS_VIEW, VIEW), 'rescue.request': WRITE, 'rescue.dispatch': [...WRITE, 'approve'] } },
  ACCOUNT_EXECUTIVE: { label: 'Account Executive', grants: { 'clients.client': WRITE, 'clients.accreditation': ['view', 'add'], 'clients.contract': WRITE, 'clients.cashbond': VIEW, 'clients.sales': VIEW, 'gate.ewa': WRITE, 'cnc.status': VIEW, 'rescue.request': ['view', 'add'], 'rescue.dispatch': ['view', 'check'], 'ewl.ledger': VIEW, 'fin.invoice': VIEW, 'alloc.board': VIEW } },
  SALES_DIRECTOR: { label: 'Sales Director', grants: { 'clients.client': [...WRITE, 'approve'], 'clients.accreditation': VIEW, 'clients.contract': [...WRITE, 'approve'], 'clients.sales': VIEW_EXPORT, 'cnc.status': VIEW, 'rpt.library': VIEW_EXPORT, 'alloc.board': VIEW } },
  CNC_OFFICER: { label: 'C&C Officer (Officer 1)', grants: { 'cnc.status': VIEW, 'cnc.aging': [...WRITE, 'export'], 'cnc.hold_lift': ['view', 'add', 'approve'], 'clients.client': ['view', 'edit'], 'clients.accreditation': ['view', 'check'], 'clients.cashbond': ['view', 'add', 'approve'], 'fin.invoice': VIEW, 'ewl.ledger': VIEW, 'rescue.dispatch': ['view', 'check'] } },
  CNC_MANAGER: { label: 'C&C Manager / Director', grants: { 'cnc.status': VIEW, 'cnc.aging': ALL, 'cnc.hold_lift': ALL, 'clients.client': ['view', 'edit', 'approve'], 'clients.accreditation': ['view', 'check'], 'clients.cashbond': ['view', 'approve'], 'fin.invoice': VIEW, 'ewl.ledger': VIEW, 'rpt.library': VIEW_EXPORT } },
  ACCOUNTING: { label: 'Accounting / Billing Specialist', grants: { 'fin.billing': [...WRITE, 'approve'], 'fin.invoice': [...WRITE, 'export'], 'fin.receipt': WRITE, 'fin.memo': WRITE, 'ewl.ledger': VIEW_EXPORT, 'ewl.txn': WRITE, 'clients.cashbond': ['view', 'approve'], 'cnc.status': VIEW, 'cnc.aging': VIEW, 'prc.payment': ['view', 'approve'], 'inv.balance': VIEW, 'reg.compliance': VIEW } },
  TREASURY: { label: 'Treasury', grants: { 'fin.receipt': [...WRITE, 'approve'], 'fin.memo': VIEW,'fin.invoice': VIEW, 'ewl.ledger': VIEW, 'ewl.txn': ['view', 'check'], 'gate.late_encoding': ['view', 'approve'], 'cnc.aging': VIEW } },
  FINANCE_MANAGER: { label: 'Finance Manager', grants: { 'cnc.status': VIEW, 'fin.billing': ['view', 'approve'], 'fin.invoice': VIEW_EXPORT, 'fin.memo': ['view', 'approve'], 'cnc.aging': VIEW_EXPORT, 'cnc.hold_lift': ['view', 'approve'], 'clients.accreditation': ['view', 'approve'], 'clients.cashbond': ['view', 'approve'], 'rpt.executive': VIEW, 'rpt.library': VIEW_EXPORT, 'ewl.ledger': VIEW } },
  EXEC_OFFICER: { label: 'Executive Approver (Officer 2/3)', grants: { 'cnc.status': VIEW, 'cnc.hold_lift': ['view', 'approve'], 'cnc.aging': VIEW, 'rpt.executive': VIEW } },
  APS_OFFICER: { label: 'Asset & Procurement Officer', grants: { 'prc.pr': WRITE, 'prc.po': WRITE, 'prc.rr': WRITE, 'prc.payment': WRITE, 'prc.vendor': WRITE, 'inv.txn': WRITE, 'inv.balance': VIEW_EXPORT, 'chassis.chassis': WRITE, 'chassis.asset': WRITE, 'gate.force_inbound': ['view', 'add', 'approve'], 'alloc.board': VIEW } },
  APS_MANAGER: { label: 'APS / MMG Manager', grants: { 'prc.pr': ['view', 'approve'], 'prc.po': ['view', 'approve'], 'prc.rr': VIEW, 'prc.payment': ['view', 'approve'], 'prc.vendor': WRITE, 'inv.txn': ['view', 'approve'], 'inv.balance': VIEW_EXPORT, 'chassis.chassis': WRITE, 'chassis.asset': WRITE, 'rpt.library': VIEW_EXPORT } },
  DEPT_HEAD: { label: 'Department Head', grants: { 'prc.pr': ['view', 'add', 'approve'], 'prc.payment': ['view', 'approve'] } },
  REGULATORY: { label: 'Regulatory Specialist', grants: { 'reg.registration': ALL, 'reg.compliance': VIEW_EXPORT, 'chassis.chassis': VIEW } },
  VP: { label: 'VP', grants: { 'clients.accreditation': ['view', 'approve'], 'clients.client': VIEW, 'gate.force_inbound': ['view', 'approve'], 'rpt.executive': VIEW } },
  // Staff UI changes V1.4 (row 10): CEO and CHRO are the BR-09 final approvers above the PO threshold — read-only PR access so each
  // can open the request details from My approvals (no PR add / edit / approve).
  CEO: { label: 'CEO', grants: { 'prc.pr': VIEW, 'prc.po': ['view', 'approve'], 'rpt.executive': VIEW, 'rpt.library': VIEW_EXPORT } },
  CHRO: { label: 'CHRO', grants: { 'prc.pr': VIEW, 'prc.po': ['view', 'approve'], 'rpt.executive': VIEW } },
  PRESIDENT: { label: 'President', grants: { 'gate.force_inbound': ['view', 'approve'], 'rpt.executive': VIEW, 'rpt.library': VIEW_EXPORT } },
  EXECUTIVE: { label: 'Executive / Department Head (read)', grants: { 'rpt.executive': VIEW, 'rpt.library': VIEW_EXPORT, ...grant(OPS_VIEW, VIEW) } },
  // V1.4 row 50: tool custody — the Stockroom Custodian issues tools and records their return ('check' on non-chassis equipment; no asset edits). Role pending confirmation.
  WAREHOUSE: { label: 'Warehouse / Stockroom', grants: { 'inv.txn': WRITE, 'inv.balance': VIEW_EXPORT, 'prc.rr': WRITE, 'repair.bom': VIEW, 'chassis.asset': ['view', 'check'] } },
  // Review 1.1 (FRS role table): read-only Auditor (audit trail, inventory audit evidence, financial records) and Repairman / Technician.
  AUDITOR: { label: 'Auditor (read-only)', grants: { ...grant(['admin.audit', 'inv.balance', 'inv.txn', 'fin.invoice', 'fin.receipt', 'fin.memo', 'ewl.ledger', 'cnc.aging', 'repair.jo', 'prc.po', 'prc.rr', 'prc.payment', 'rpt.library'], VIEW_EXPORT), 'clients.client': VIEW, 'clients.contract': VIEW, 'chassis.chassis': VIEW, 'reg.registration': VIEW, 'reg.compliance': VIEW } },
  TECHNICIAN: { label: 'Repairman / Technician', grants: { 'repair.jo': VIEW, 'repair.bom': VIEW, 'chassis.chassis': VIEW, 'rescue.request': VIEW } },
  // Staff review 1.2 (sign-in picker): proposed roles — permission sets are a sensible default, pending Delbros confirmation.
  BRANCH_HEAD: { label: 'Branch Head (proposed)', grants: { ...grant(OPS_VIEW, VIEW_EXPORT), ...grant(['gate.ewa', 'gate.out', 'gate.in'], VIEW), 'gate.ewa': ['view', 'approve'], 'gate.late_encoding': ['view', 'approve'], 'repair.jo': ['view', 'check', 'approve'], 'chassis.status': ['view', 'approve'], 'alloc.board': VIEW_EXPORT, 'alloc.parkfix': ['view', 'approve'], 'inv.balance': VIEW, 'clients.client': VIEW, 'repair.labor_reports': VIEW_EXPORT, 'rpt.library': VIEW_EXPORT } },
  DISPATCHER: { label: 'Rescue Dispatcher (proposed)', grants: { ...grant(OPS_VIEW, VIEW), 'rescue.request': WRITE, 'rescue.dispatch': WRITE, 'clients.client': VIEW } },
  GATE_CLERK: { label: 'Gate Clerk (proposed)', grants: { 'gate.ewa': VIEW, 'gate.out': WRITE, 'gate.in': WRITE, 'gate.eir': VIEW, 'gate.late_encoding': ['view', 'add'], 'chassis.chassis': VIEW, 'alloc.board': VIEW } },
  CLIENT: { label: 'Client (portal)', grants: {} },
  VENDOR: { label: 'Vendor (portal)', grants: {} },
};

/**
 * Staff UI changes V1.4 (rows 2–7): role labels that are not in the FRS role list, kept in one register so the sign-in picker and
 * Users & roles show the same text. Every entry stays "Pending Delbros confirmation" until the approved name, scope and permissions
 * are recorded — the permission sets in ROLE_TEMPLATES for these roles are proposed defaults only.
 */
export interface PendingRole { role: RoleCode; label: string; demoUser: string; frsMapping: string; scope: string; responsibilities: string; status: 'Pending Delbros confirmation' }
export const PENDING_ROLES: PendingRole[] = [
  { role: 'BRANCH_HEAD', label: 'Branch Head', demoUser: 'BH.MNL', frsMapping: 'Not in the FRS role list. Proposed: branch-level approver above the Branch Generalist and DYM. (V1.4 writes the code as BK.MNL; the live code is BH.MNL.)', scope: 'One branch (Manila Yard in the demo)', responsibilities: 'Branch operations oversight; approves EWA, late encoding and job orders for the branch', status: 'Pending Delbros confirmation' },
  { role: 'GATE_CLERK', label: 'Gate Clerk', demoUser: 'GATE.MNL', frsMapping: 'Not in the FRS role list. Proposed: gate encoding split out of the Branch Generalist role.', scope: 'One branch (Manila Yard in the demo)', responsibilities: 'Gate Out / Gate In encoding and release; records late encoding (no approvals)', status: 'Pending Delbros confirmation' },
  { role: 'DISPATCHER', label: 'Rescue Dispatcher', demoUser: 'DISP.MNL', frsMapping: 'The FRS names a Rescue Coordinator (held by OPSMGR). Proposed: the Dispatcher sends the crew; the Rescue Coordinator keeps rescue approvals. Confirm whether they are one role.', scope: 'One branch (Manila Yard in the demo)', responsibilities: 'Logs and dispatches rescues; records crew, vehicle, driver and ETA (no approvals)', status: 'Pending Delbros confirmation' },
  { role: 'WAREHOUSE', label: 'Stockroom Custodian', demoUser: 'WH.MNL', frsMapping: 'Not in the FRS role list. Proposed: stockroom role under APS / MMG.', scope: 'One warehouse (WH-MNL in the demo)', responsibilities: 'Stock transactions and counts, receiving against issued POs, tool custody (no PR approvals)', status: 'Pending Delbros confirmation' },
  { role: 'VP', label: 'Vice President', demoUser: 'VP', frsMapping: 'Not in the FRS role list. Proposed: accreditation final signatory (CLT-003) and force-inbound approver.', scope: 'All branches', responsibilities: 'VP sign-off on accreditation (sets eligibility flags and CWS branches); force-inbound approval', status: 'Pending Delbros confirmation' },
];
/** Row 2: the FRS Rescue Coordinator vs the proposed Rescue Dispatcher. */
export const RESCUE_ROLE_MAPPING = 'The FRS role "Rescue Coordinator" is held by OPSMGR (Operations Manager); DISP.MNL carries the separately named, proposed "Rescue Dispatcher". Proposed split: the Dispatcher logs and dispatches, the Coordinator approves dispatch and costs. Delbros to confirm whether they are the same role, then align the role template, picker label, permissions and dispatch ownership.';
export const pendingRole = (r: RoleCode) => PENDING_ROLES.find((p) => p.role === r);

export function resolveGrants(roles: RoleCode[], overrides?: Grants): Grants {
  const out: Record<string, Set<Action>> = {};
  for (const r of roles) for (const [res, acts] of Object.entries(ROLE_TEMPLATES[r]?.grants ?? {})) {
    out[res] ??= new Set();
    acts.forEach((a) => out[res].add(a));
  }
  for (const [res, acts] of Object.entries(overrides ?? {})) out[res] = new Set(acts);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

export const can = (grants: Grants, resource: string, action: Action = 'view') => grants[resource]?.includes(action) ?? false;
