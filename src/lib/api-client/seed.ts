// DEMO DATA ONLY. Branch names, equipment types, clients, vendors and amounts below are placeholders for
// development and UI review — they are NOT Delbros master data. Equipment types in particular are not named
// in the BRD or design brief (Q-CLT-01) and must be replaced from the DelWater Online extract.
import {
  DEFAULT_SETTINGS, addDays, addHours, manilaDay,
  type Branch, type Chassis, type Client, type Contract, type EquipmentType, type Invoice, type NotificationRule,
  type Registration, type RoleCode, type User, type WorkflowInstance, type ChassisStatus, type Part,
} from '../shared';
import type { InspectionLine, JobOrder, RepairCategory } from '../shared';
import type { Db } from './db';

const now = () => new Date().toISOString();
const ago = (d: number) => addDays(now(), -d);
const ahead = (d: number) => addDays(now(), d);

export function buildSeed(): Db {
  const branches: Branch[] = [
    { code: 'HO', name: 'Head Office', region: 'NCR', gatePassPrefix: 'GP-HO-', isHeadOffice: true },
    ...[
      ['MNL', 'Manila Yard', 'NCR'], ['NVL', 'Navotas Depot', 'NCR'], ['CAV', 'Cavite Depot', 'South Luzon'], ['LAG', 'Laguna Depot', 'South Luzon'],
      ['BTG', 'Batangas Depot', 'South Luzon'], ['SUB', 'Subic Depot', 'North Luzon'], ['CLK', 'Clark Depot', 'North Luzon'],
      ['CEB', 'Cebu Depot', 'Visayas'], ['CDO', 'Cagayan de Oro Depot', 'Mindanao'], ['DVO', 'Davao Depot', 'Mindanao'],
    ].map(([code, name, region]) => ({ code, name: `${name}`, region, gatePassPrefix: `GP-${code}-`, isHeadOffice: false })),
  ];
  const opsBranches = branches.filter((b) => !b.isHeadOffice).map((b) => b.code);

  // Q-CLT-01: the seven chassis types of DBL-CHS-001 plus 20ft flatbed (20FBED) from the legacy master database (28-May-2026).
  // Codes stay EQ1–EQ8 so existing records keep their references; Admin → Equipment types can rename or add more.
  const equipmentTypes: EquipmentType[] = [
    '20ft chassis', '40ft chassis', '40ft flatbed', '40ft combo', '40ft super combo', '45ft chassis', 'Cane cage trailer', '20ft flatbed',
  ].map((name, i) => ({ code: `EQ${i + 1}`, name, sort: i + 1 }));

  const mk = (userId: string, name: string, designation: string, roles: RoleCode[], branchCode = 'HO', extra: Partial<User> = {}) => ({
    userId, name, designation, roles, branchCode, status: 'Active' as const, realm: 'INTERNAL' as const,
    branchAccess: (branchCode === 'HO' ? 'ALL' : [branchCode]) as string[] | 'ALL', email: `${userId.toLowerCase()}@demo.delbros.local`,
    mobile: '+63 917 000 0000', password: 'Demo@2026', failed: 0, ...extra,
  });
  const users: Db['users'] = [
    mk('ADMIN', 'System Administrator', 'IT Administrator', ['SYS_ADMIN']),
    mk('BG.MNL', 'Rocky Santos', 'Branch Generalist', ['BRANCH_GENERALIST'], 'MNL', { warehouseCode: 'WH-MNL' }),
    mk('BG.CEB', 'Ana Villanueva', 'Branch Generalist', ['BRANCH_GENERALIST'], 'CEB', { warehouseCode: 'WH-CEB' }),
    mk('DYM.MNL', 'Carlos Mendoza', 'Deputy Yard Manager', ['DYM'], 'MNL'),
    // Staff review 1.2: the NCR regional manager is scoped to the NCR region (set here so the sign-in picker shows it before anyone signs in).
    mk('RM.NCR', 'Liza Gomez', 'Regional Manager', ['REGIONAL_MANAGER'], 'HO', { branchAccess: branches.filter((b) => b.region === 'NCR').map((b) => b.code), regionScope: 'NCR' } as Partial<User>),
    mk('OPSMGR', 'Paolo Reyes', 'Operations Manager', ['OPS_MANAGER', 'RESCUE_COORDINATOR']),
    mk('AE.JREYES', 'Jasmine Reyes', 'Account Executive', ['ACCOUNT_EXECUTIVE']),
    // Review 1.1: a second AE (Visayas / South Luzon accounts) so the AE filters and per-AE comparisons can be shown.
    mk('AE.KONG', 'Kevin Ong', 'Account Executive', ['ACCOUNT_EXECUTIVE']),
    mk('SALESDIR', 'Mark Tan', 'Sales Director', ['SALES_DIRECTOR']),
    mk('CNC.OFF1', 'Grace Lim', 'C&C Officer (Officer 1)', ['CNC_OFFICER']),
    // Review 1.1: per-user override that explains the C&C Manager's audit-log export (monthly control review).
    { ...mk('CNC.MGR', 'Ramon Cruz', 'C&C Manager', ['CNC_MANAGER']), overrides: { 'admin.audit': ['view', 'export'] } },
    mk('ACCTG', 'Joy Bautista', 'Billing Specialist', ['ACCOUNTING']),
    mk('TREAS', 'Ben Aquino', 'Treasury Officer', ['TREASURY']),
    mk('FINMGR', 'Carmen Dizon', 'Finance Manager', ['FINANCE_MANAGER']),
    mk('EXEC.OFF2', 'Victor Ramos', 'Executive Approver (Officer 2)', ['EXEC_OFFICER']),
    mk('EXEC.OFF3', 'Helen Yu', 'Executive Approver (Officer 3)', ['EXEC_OFFICER']),
    mk('APS', 'Ross Ann Plaza', 'Asset & Procurement Head', ['APS_OFFICER', 'APS_MANAGER']),
    mk('APS.OFF', 'Dennis Co', 'APS Officer', ['APS_OFFICER']),
    mk('DEPTHEAD', 'Nora Castillo', 'Department Head', ['DEPT_HEAD']),
    mk('REG', 'Miguel Torres', 'Regulatory Specialist', ['REGULATORY']),
    mk('VP', 'Antonio Lopez', 'Vice President', ['VP']),
    mk('CEO', 'Chief Executive', 'CEO', ['CEO', 'EXECUTIVE']),
    mk('CHRO', 'Chief HR Officer', 'CHRO', ['CHRO']),
    mk('PRES', 'President', 'President', ['PRESIDENT', 'EXECUTIVE']),
    mk('WH.MNL', 'Eddie Garcia', 'Stockroom Custodian', ['WAREHOUSE'], 'MNL', { warehouseCode: 'WH-MNL' }),
    // Review 1.1: FRS roles that had no user — read-only Auditor and a Repairman / Technician.
    mk('AUDITOR', 'Elena Ramos', 'Internal Auditor', ['AUDITOR']),
    mk('TECH.MNL', 'Rodel Bautista', 'Repairman / Technician', ['TECHNICIAN'], 'MNL'),
    // Staff review 1.2: Branch Head, rescue Dispatcher and Gate Clerk (proposed roles, pending Delbros confirmation). ID = role code + branch.
    mk('BH.MNL', 'Teresa Navarro', 'Branch Head — Manila Yard', ['BRANCH_HEAD'], 'MNL', { department: 'OPS' }),
    mk('DISP.MNL', 'Arnel Pascual', 'Rescue Dispatcher', ['DISPATCHER'], 'MNL', { department: 'OPS' }),
    mk('GATE.MNL', 'Jun Villareal', 'Gate Clerk — Manila Yard', ['GATE_CLERK'], 'MNL', { department: 'OPS' }),
    { ...mk('client@abclogistics.ph', 'Maria Santos', 'Client — ABC Logistics', ['CLIENT']), realm: 'CLIENT_PORTAL', clientCode: 'C-00123', branchAccess: [] },
    { ...mk('client@pacificmovers.ph', 'Leo Navarro', 'Client — Pacific Movers', ['CLIENT']), realm: 'CLIENT_PORTAL', clientCode: 'C-00188', branchAccess: [] },
    { ...mk('tess@islandlink.ph', 'Tess Uy', 'Client — Islandlink Cargo', ['CLIENT']), realm: 'CLIENT_PORTAL', clientCode: 'C-00251', branchAccess: [], status: 'Inactive' as const }, // portal self-registration awaiting AE approval (DBL-CLT-019)
    { ...mk('vendor@tirepro.ph', 'Tire Pro Supply', 'Vendor', ['VENDOR']), realm: 'VENDOR_PORTAL', vendorId: 'V-001', branchAccess: [] },
  ];
  // Review 1.1: department scope (DBL-ADM-001; codes from Master data → Department) and a last sign-in for the users whose
  // transactions appear on other screens (stock ledger, approvals, rescues, collections). Times vary; days are relative to today.
  const DEPT: Record<string, string> = { ADMIN: 'IT', 'BG.MNL': 'OPS', 'BG.CEB': 'OPS', 'DYM.MNL': 'OPS', 'RM.NCR': 'OPS', OPSMGR: 'OPS', 'WH.MNL': 'OPS', 'TECH.MNL': 'OPS', DEPTHEAD: 'OPS',
    'AE.JREYES': 'SLS', 'AE.KONG': 'SLS', SALESDIR: 'SLS', 'CNC.OFF1': 'CNC', 'CNC.MGR': 'CNC', ACCTG: 'ACC', FINMGR: 'ACC', TREAS: 'TRS', APS: 'APS', 'APS.OFF': 'APS', REG: 'REG',
    'EXEC.OFF2': 'EXE', 'EXEC.OFF3': 'EXE', VP: 'EXE', CEO: 'EXE', CHRO: 'EXE', PRES: 'EXE', AUDITOR: 'AUD' };
  const LAST_LOGIN: Record<string, [number, number]> = { 'BG.MNL': [0, 7.25], 'BG.CEB': [1, 8.6], 'WH.MNL': [0, 6.9], 'DYM.MNL': [1, 9.1], OPSMGR: [0, 8.4], 'AE.JREYES': [0, 9.75], 'CNC.OFF1': [1, 10.2], 'CNC.MGR': [2, 14.5],
    ACCTG: [0, 8.05], TREAS: [3, 11.3], FINMGR: [2, 16.2], APS: [1, 13.4], DEPTHEAD: [2, 9.6], REG: [0, 7.8], 'client@abclogistics.ph': [0, 5.5] };
  users.forEach((u) => {
    u.department ??= DEPT[u.userId];
    const l = LAST_LOGIN[u.userId];
    if (l && !u.lastLogin) { const t = new Date(`${manilaDay(ago(l[0]))}T${String(Math.floor(l[1])).padStart(2, '0')}:${String(Math.round((l[1] % 1) * 60)).padStart(2, '0')}:00+08:00`).toISOString(); u.lastLogin = t > now() ? addDays(t, -1) : t; }
  });

  const contact = (id: string, f: string, l: string, position = 'Operations Manager') => ({ id, firstName: f, lastName: l, phone: '+63 917 555 0101', email: `${f.toLowerCase()}@example.ph`, isPrimary: true, isSignatory: true, position,
    // V1.4 row 42: the signatory's identification and specimen signature (proposed field set).
    signatoryEvidence: { idType: "Driver's license", idNumber: `N0${id.slice(-3, -2)}-${id.slice(4, 6)}-${id.replace(/\D/g, '').padEnd(6, '0').slice(0, 6)}`, idExpiry: '2029-06-30', idFile: `${id}-id.pdf`, specimenFile: `${id}-specimen.pdf`, verifiedBy: 'AE.JREYES', verifiedAt: '2026-04-20T02:00:00.000Z' } });
  // Review 1.2: ZIP and province on every address; Draft clients have no credit limit until VP sign-off; internal records show who created them (the AE).
  const client = (c: Partial<Client> & Pick<Client, 'clientCode' | 'clientName' | 'status'>): Client => ({
    billingName: c.clientName, address1: 'Port Area', city: 'Manila', zipCode: '1018', province: 'Metro Manila (NCR)', country: 'PHILIPPINES', billingCycle: 'Weekly', aeAssigned: 'AE.JREYES',
    branchCode: 'MNL', allowLt: true, allowSt: true, allowOnline: true, allowSpecial: false, allowRescue: true, cwsBranchAccess: ['MNL', 'NVL', 'CAV'],
    isLegal: false, isCollectionAgency: false, registrationSource: 'Internal', contacts: [contact(c.clientCode + '-1', 'Maria', 'Santos')], industry: 'Trucking',
    email: 'accounts@example.ph', ebillingEmail: 'billing@example.ph', phone: '(02) 8123 4567', creditLimit: c.status === 'Draft' ? undefined : 1500000, createdAt: ago(400),
    createdBy: c.registrationSource === 'Portal' ? undefined : c.aeAssigned ?? 'AE.JREYES', ...c,
  });
  const clients: Client[] = [
    client({ clientCode: 'C-00123', clientName: 'ABC Logistics Inc.', status: 'Active', qbName: 'ABC LOGISTICS' }),
    client({ clientCode: 'C-00188', clientName: 'Pacific Movers Corp.', status: 'Hold', billingCycle: 'Monthly', contacts: [contact('C-00188-1', 'Leo', 'Navarro')] }),
    client({ clientCode: 'C-00201', clientName: 'Visayas Freight Services', status: 'Active', branchCode: 'CEB', cwsBranchAccess: ['CEB'], aeAssigned: 'AE.KONG', contacts: [contact('C-00201-1', 'Ana', 'Lopez')],
      address1: 'Pier 4, North Reclamation Area', city: 'Cebu City', zipCode: '6000', province: 'Cebu', industry: 'Freight forwarding' }),
    client({ clientCode: 'C-00215', clientName: 'Southern Haulers Co.', status: 'Active', branchCode: 'BTG', allowRescue: false, billingCycle: 'Monthly', aeAssigned: 'AE.KONG',
      address1: 'Diversion Road, Brgy. Bolbok', city: 'Batangas City', zipCode: '4200', province: 'Batangas' }),
    client({ clientCode: 'C-00230', clientName: 'Metro Container Lines', status: 'Active', allowSpecial: true }),
    client({ clientCode: 'C-00244', clientName: 'Northstar Trucking', status: 'Draft', createdAt: ago(16), contacts: [contact('C-00244-1', 'Rico', 'Dela Paz')] }),
    client({ clientCode: 'C-00251', clientName: 'Islandlink Cargo', status: 'Draft', registrationSource: 'Portal', createdAt: ago(1), contacts: [contact('C-00251-1', 'Tess', 'Uy')] }),
    client({ clientCode: 'C-00099', clientName: 'Defunct Transport Ltd.', status: 'Blacklist', isLegal: true }),
  ];

  const rates = (base: number) => equipmentTypes.map((e, i) => ({ equipmentType: e.code, dailyRate: base + i * 50, indemnity: 350000 + i * 25000 }));
  // Review 1.1: billing cycle, AE and region follow the client record (billing uses the client's cycle; region = the client branch's region in the branch master).
  // Review 1.2: `start` = days ago the contract became effective (default 200). Metro's LTL starts earlier so its term is at least 1 year (BR-12).
  const contract = (no: string, clientCode: string, type: Contract['contractType'], cls: Contract['class'], months: number | undefined, base: number, status: Contract['status'] = 'Active', start = 200): Contract => {
    const cl = clients.find((x) => x.clientCode === clientCode);
    const ae = cl?.aeAssigned ?? 'AE.JREYES';
    const sh = start - 200;
    return {
    contractNo: no, clientCode, contractType: type, class: cls, effectiveDate: manilaDay(ago(start)), expiryDate: months ? manilaDay(addDays(ago(start), months * 30)) : undefined,
    unitQty: 10, region: branches.find((b) => b.code === cl?.branchCode)?.region ?? 'NCR', paymentMethod: 'Check', billingCycle: cl?.billingCycle ?? 'Weekly', creditTermDays: 30, cashDeposit: 20000, lockInMonths: type === 'LTL' ? 12 : 0,
    penalties: { nonReturn: 5000, deferredCheck: 1000, lateInterestPct: 2, dishonoredCheck: 2500 }, status, createdAt: ago(210 + sh),
    // SCR-08 lifecycle trail (DBL-CLT-010) — date + user per step.
    signatoryId: `${clientCode}-1`, version: 1, createdBy: ae, aeUserId: ae, lessorSignatoryId: 'SALESDIR', pickupBranch: cl?.branchCode,
    history: ([['Draft', 210], ['Sent to Client', 208], ['Signed', 205], ['For Notarisation', 204], ['Notarized', 202], ['Active', 200]] as const)
      .map(([s, d]) => ({ status: s, at: ago(d + sh), by: ae, fileName: s === 'Signed' ? `${no}-signed.pdf` : s === 'Notarized' ? `${no}-notarized.pdf` : undefined })),
    documents: [{ kind: 'Signed copy', fileName: `${no}-signed.pdf`, at: ago(205 + sh), by: ae }, { kind: 'Notarized copy', fileName: `${no}-notarized.pdf`, at: ago(202 + sh), by: ae }],
    rates: rates(base).map((r, i) => ({ ...r, qty: i < 2 ? 5 : 0, templateRate: r.dailyRate })),
    };
  };
  const contracts: Contract[] = [
    contract('LTL-2026-0045', 'C-00123', 'LTL', 'A', 13, 900),
    contract('SPL-2026-0012', 'C-00188', 'SPL', 'Z', undefined, 1100),
    contract('LTL-2026-0051', 'C-00201', 'LTL', 'A', 24, 850),
    contract('QLP-2026-0007', 'C-00215', 'QLP', 'Q', 5, 1200),
    contract('LTL-2026-0060', 'C-00230', 'LTL', 'A', 13, 950, 'Active', 305),
    // Staff UI changes V1.4 (rows 44–46): ended contracts that carry the cash-bond examples. ABC's two match the Client Portal data
    // (QLP-2025-0019 bond refunded RF-2026-0041; SPL-2025-0007 bond applied to its final bill); Visayas' two hold the Pending Admin and
    // Approved — awaiting refund withdrawals.
    contract('QLP-2025-0019', 'C-00123', 'QLP', 'Q', 6, 1200, 'Expired', 420),
    contract('SPL-2025-0007', 'C-00123', 'SPL', 'Z', undefined, 1100, 'Terminated', 560),
    contract('LTL-2025-0031', 'C-00201', 'LTL', 'A', 12, 850, 'Expired', 430),
    contract('QLP-2025-0022', 'C-00201', 'QLP', 'Q', 6, 1200, 'Expired', 300),
  ];
  {
    const set = (no: string, o: Partial<Contract>, note: string, endAgo: number) => { const k = contracts.find((c) => c.contractNo === no)!; Object.assign(k, o); k.history?.push({ status: k.status, at: ago(endAgo), by: k.status === 'Terminated' ? 'SALESDIR' : 'system', note }); };
    set('QLP-2025-0019', { unitQty: 4, cashDeposit: 15000 }, 'End date reached', 240);
    set('SPL-2025-0007', { unitQty: 3, cashDeposit: 10000, lockInMonths: 0, termination: { workflowId: 'WF-CTT-1', reason: 'Moved all units to the long-term lease LTL-2026-0045', status: 'Approved', effectiveDate: manilaDay(ago(201)) } as Contract['termination'] }, 'Terminated early by agreement — no lock-in, no pre-termination fee', 201);
    set('LTL-2025-0031', { unitQty: 4, cashDeposit: 10000 }, 'End date reached', 70);
    set('QLP-2025-0022', { unitQty: 3, cashDeposit: 10000 }, 'End date reached', 120);
  }
  // Staff review 1.2 (audit log): a contract whose expiry date passed before the demo data starts is already Expired, stamped by the
  // nightly job on the day after its expiry (not on the day the demo is first opened). seedAdmin writes the matching audit event.
  for (const ct of contracts) if (ct.status === 'Active' && ct.expiryDate && ct.expiryDate < manilaDay(now())) {
    ct.status = 'Expired'; ct.history?.push({ status: 'Expired', at: new Date(`${manilaDay(addDays(`${ct.expiryDate}T12:00:00+08:00`, 1))}T00:05:00+08:00`).toISOString(), by: 'system', note: `Expiry date ${ct.expiryDate} reached` });
  }

  // Chassis fleet — ~70/30 company vs partner ownership (BR-13).
  const statuses: ChassisStatus[] = ['Available', 'Available', 'On Hire', 'On Hire', 'On Hire', 'Allocated', 'Breakdown', 'In Repair', 'Available', 'On Hire'];
  const chassis: Chassis[] = [];
  let n = 1000;
  opsBranches.forEach((b, bi) => {
    for (let i = 0; i < 6; i++) {
      const eq = equipmentTypes[(bi + i) % 8];
      const st = statuses[(bi * 3 + i) % statuses.length];
      chassis.push({
        chassisNo: `DW-${b}-${++n}`, chassisType: eq.code, plateNo: `${b.slice(0, 2)}${String.fromCharCode(65 + i)} ${1000 + n}`, branchCode: b, status: st,
        owner: (bi + i) % 10 < 7 ? 'DELWATER' : 'PARTNER-01', generalAssessment: st === 'Breakdown' ? 'Unroadworthy' : 'Roadworthy', standard: i % 3 ? 'DW' : 'Nakamura',
        statusSince: ago(3 + ((bi + i) * 7) % 45), acquisitionDate: ago(900 + i * 30).slice(0, 10),
      });
    }
  });
  // Attach on-hire units to clients.
  const onHire = chassis.filter((c) => c.status === 'On Hire');
  const hireClients = ['C-00123', 'C-00188', 'C-00201', 'C-00230', 'C-00215'];
  const hireContracts: Record<string, string> = { 'C-00123': 'LTL-2026-0045', 'C-00188': 'SPL-2026-0012', 'C-00201': 'LTL-2026-0051', 'C-00230': 'LTL-2026-0060', 'C-00215': 'QLP-2026-0007' };
  // Demo driver signature (as captured on the gate tablet) so printed EIRs show the signature image.
  const DEMO_SIGNATURE = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="60" viewBox="0 0 220 60"><path d="M8 42c14-26 22-30 26-18s-4 22 6 10 16-28 22-14-6 20 8 8 14-18 24-8 4 12 16 4 18-16 30-6 10 10 22 2 16-8 30-4" fill="none" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round"/></svg>')}`;
  const gatePasses: Db['gatePasses'] = [];
  const eirs: Db['eirs'] = [];
  const histEwas: Db['ewas'] = []; // gate (SCR-15/17 review): every seeded release carries the EWA it left under
  // Review 1.1: different drivers per release (not one driver on every row).
  const DRIVERS = [['Juan Dela Cruz', 'N01-23-456789'], ['Mario Reyes', 'N02-15-334455'], ['Ramil Santos', 'N04-18-998877'], ['Arnel Bautista', 'N03-20-112233']] as const;
  // Staff review 1.2 (BR-01): Pacific Movers went on credit hold 14 days ago (holdEvents HE-1), so none of its units may have left
  // after that date. A Pacific release dated after the hold swaps clients with the next older non-ABC release (counts per client unchanged).
  const hireOf = onHire.map((_, i) => hireClients[i % hireClients.length]);
  hireOf.forEach((cl, i) => {
    if (cl !== 'C-00188' || onHire[i].statusSince < ago(14)) return;
    const ok = (x: string, k: number) => k > 2 && x !== 'C-00123' && x !== 'C-00188' && onHire[k].statusSince < ago(15);
    let j = hireOf.findIndex((x, k) => k > i && ok(x, k)); if (j < 0) j = hireOf.findIndex(ok);
    if (j >= 0) { hireOf[i] = hireOf[j]; hireOf[j] = 'C-00188'; }
  });
  onHire.forEach((c, i) => {
    const cl = hireOf[i];
    const gp = `GP-${c.branchCode}-${String(900 + i).padStart(6, '0')}`;
    const eir = `EIR-${c.branchCode}-${String(200 + i).padStart(6, '0')}`;
    const euNo = `EU-TMP-${i}`; // renumbered by creation date below
    const [driverName, driverLicenseNo] = DRIVERS[i % DRIVERS.length];
    c.currentClientCode = cl; c.currentContractNo = hireContracts[cl]; c.currentGatePassNo = gp;
    // Review 1.1: releases 1 and 2 were paper gate passes encoded late (LE-00098: 3 days, LE-00099: 9 days). Their EWA was created
    // 2 h before the actual (paper) gate-out, so the real release falls inside the EWA's 24-hour validity.
    const actualOut = i === 1 ? addDays(c.statusSince, -3) : i === 2 ? addDays(c.statusSince, -9) : c.statusSince;
    histEwas.push({ euNo, clientCode: cl, contractNo: hireContracts[cl], branchCode: c.branchCode, driverName, driverLicenseNo, truckPlateNo: `NAB ${5600 + i}`, trucker: 'XYZ Trucking',
      units: [{ equipmentType: c.chassisType, qty: 1, usedChassis: [c.chassisNo] }], createdAt: addHours(actualOut, -2), validUntil: addHours(actualOut, 22), createdVia: 'Internal', status: 'Used', extensionCount: 0, createdBy: 'AE.JREYES' });
    gatePasses.push({
      gatePassNo: gp, direction: 'OUT', chassisNo: c.chassisNo, clientCode: cl, contractNo: hireContracts[cl], trucker: 'XYZ Trucking', truckPlateNo: `NAB ${5600 + i}`, truckOrcr: `OR ${4100200 + i} / CR ${5200300 + i}`, euNo,
      // The auto-corrected one (≤ 7 days) already bills from the actual date; the Credit Memo one keeps the encoded date until approved.
      driverName, driverLicenseNo, generalAssessment: 'Roadworthy', actualEventAt: i === 1 ? actualOut : c.statusSince, encodedAt: c.statusSince, signature: DEMO_SIGNATURE,
      // Seeded releases carry the standard GP2 checklist (all OK) so EIR reprints show the recorded condition.
      inspection: ['Tire L1 outer', 'Tire L1 inner', 'Tire R1 outer', 'Tire R1 inner', 'Tire L2 outer', 'Tire L2 inner', 'Tire R2 outer', 'Tire R2 inner', 'Brake system', 'Landing legs', 'King pin', 'Twist locks', 'Lights & wiring', 'Mud flaps', 'Chassis frame'].map((part) => ({ part, statusCode: 'OK', qty: 1, chargeable: 0 })),
      branchCode: c.branchCode, eirNo: eir, encodedBy: 'BG.MNL',
    });
    eirs.push({ eirNo: eir, gatePassOutNo: gp, clientCode: cl, chassisNo: c.chassisNo, chassisType: c.chassisType, eirOutDate: c.statusSince, depotCode: c.branchCode, contractNo: hireContracts[cl], reprintCount: 0 });
  });
  // Staff review 1.2: the auto-corrected late encoding (release 1, 3 days late) counts "days in status" from the actual gate-out,
  // the same date the live Gate Out uses and the Gate In list shows. (Release 2 keeps the encoded date until its Credit Memo is approved.)
  if (onHire[1]) onHire[1].statusSince = addDays(onHire[1].statusSince, -3);
  // Review 1.1 (DBL-CLT-017 equipment return history): one ABC unit hired out and returned (Gate Out → Gate In), now Available again.
  {
    const ret = chassis.find((c) => c.branchCode === 'MNL' && c.status === 'Available');
    if (ret) {
      // Staff review 1.2: returned when its current Available period started, so the board's "days in status" agrees with the return date.
      const outAt = ago(75), inAt = ret.statusSince, base ={ chassisNo: ret.chassisNo, clientCode: 'C-00123', contractNo: 'LTL-2026-0045', trucker: 'XYZ Trucking', truckPlateNo: 'NAB 5590', driverName: 'Mario Reyes', driverLicenseNo: 'N02-15-334455',
        generalAssessment: 'Roadworthy' as const, signature: DEMO_SIGNATURE, branchCode: 'MNL', encodedBy: 'BG.MNL', inspection: [] as InspectionLine[] };
      // Staff UI changes V1.4 (rows 16–17): the stored EIR keeps the itemized inspection of both legs (GAT-004 Gate Out checklist with
      // tire branding / tread depth; GAT-005 Gate In parts status with a missing part and its charge), shown in the EIR detail and reprint.
      const tires = ['Tire L1 outer', 'Tire L1 inner', 'Tire R1 outer', 'Tire R1 inner', 'Tire L2 outer', 'Tire L2 inner', 'Tire R2 outer', 'Tire R2 inner'];
      const frame = ['Brake system', 'Landing legs', 'King pin', 'Twist locks', 'Lights & wiring', 'Mud flaps', 'Chassis frame'];
      const outInspection: InspectionLine[] = [...tires.map((part, k) => ({ part, branding: k % 2 ? 'Bridgestone' : 'Yokohama', threadDepth: `${12 - (k % 3)} mm`, statusCode: 'OK', qty: 1, chargeable: 0 })), ...frame.map((part) => ({ part, statusCode: 'OK', qty: part === 'Twist locks' ? 4 : 1, chargeable: 0 }))];
      const inInspection: InspectionLine[] = outInspection.map((l) => (l.part === 'Tire R2 outer' ? { ...l, threadDepth: '7 mm', statusCode: 'WRN' } : l.part === 'Mud flaps' ? { ...l, statusCode: 'MSG', chargeable: 850 } : l.part === 'Lights & wiring' ? { ...l, statusCode: 'DMG', chargeable: 0 } : l.part.startsWith('Tire') ? { ...l, threadDepth: `${Number.parseInt(l.threadDepth ?? '12', 10) - 2} mm` } : l));
      histEwas.push({ euNo: 'EU-TMP-R', clientCode: 'C-00123', contractNo: 'LTL-2026-0045', branchCode: 'MNL', driverName: 'Mario Reyes', driverLicenseNo: 'N02-15-334455', truckPlateNo: 'NAB 5590', trucker: 'XYZ Trucking',
        units: [{ equipmentType: ret.chassisType, qty: 1, usedChassis: [ret.chassisNo] }], createdAt: addHours(outAt, -2), validUntil: addHours(outAt, 22), createdVia: 'Portal', status: 'Used', extensionCount: 0, createdBy: 'client@abclogistics.ph' });
      gatePasses.push({ ...base, gatePassNo: 'GP-MNL-000880', direction: 'OUT', euNo: 'EU-TMP-R', truckOrcr: 'OR 4100190 / CR 5200290', actualEventAt: outAt, encodedAt: outAt, eirNo: 'EIR-MNL-000180', pairedGatePassNo: 'GP-MNL-000881', inspection: outInspection },
        { ...base, gatePassNo: 'GP-MNL-000881', direction: 'IN', actualEventAt: inAt, encodedAt: inAt, eirNo: 'EIR-MNL-000181', pairedGatePassNo: 'GP-MNL-000880', inspection: inInspection, flatTires: 0, vandalized: false,
          remarks: 'Returned roadworthy — one mud flap missing (charged ₱850); left tail-light lens cracked (wear, not charged); R2 outer tire tread 7 mm' });
      // Staff review 1.1: the completed Out → In cycle also needs its EIR row, so the EIR list shows a returned example (both gate passes and dates).
      eirs.push({ eirNo: 'EIR-MNL-000180', gatePassOutNo: 'GP-MNL-000880', gatePassInNo: 'GP-MNL-000881', clientCode: 'C-00123', chassisNo: ret.chassisNo, chassisType: ret.chassisType, eirOutDate: outAt, eirInDate: inAt, depotCode: 'MNL', contractNo: 'LTL-2026-0045', reprintCount: 0 });
    }
  }
  // Review 1.1: EU numbers follow creation dates (oldest = EU-000600). The fixed recent EWAs (EU-000765 … EU-000781) are all newer.
  {
    const renum: Record<string, string> = {};
    [...histEwas].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((e, k) => { renum[e.euNo] = `EU-${String(600 + k).padStart(6, '0')}`; });
    histEwas.forEach((e) => { e.euNo = renum[e.euNo]; });
    gatePasses.forEach((g) => { if (g.euNo) g.euNo = renum[g.euNo] ?? g.euNo; });
  }
  // Review 1.1: every allocated unit belongs to a fulfilled client unit request (UR shown on the board, chassis listed on the pipeline),
  // carries a target pickup date, and counts "days in status" from its allocation date. A unit whose OR/CR expired after it was
  // allocated keeps the earlier allocation date (allocation is blocked once the registration has expired).
  const allocReqs: NonNullable<Db['unitRequests']> = [];
  chassis.filter((c) => c.status === 'Allocated').forEach((c, k) => {
    const regOffset = [400, 200, 85, 25, 12, -5, 300, 150][chassis.indexOf(c) % 8];
    const date = regOffset < 0 ? ago(8) : ago(1 + (k % 3));
    const reqNo = `UR-${String(20 + k).padStart(6, '0')}`;
    const targetPickupDate = manilaDay(ahead(2 + (k % 4)));
    c.statusSince = date;
    // Staff review 1.2: allocated by the Deputy Yard Manager; the expected return comes from the request; pickup contact recorded on the request.
    c.allocation = { clientCode: 'C-00123', contractNo: 'LTL-2026-0045', date, targetPickupDate, expectedReturn: manilaDay(ahead(30)), requestNo: reqNo, by: 'DYM.MNL' };
    allocReqs.push({ reqNo, clientCode: 'C-00123', contractNo: 'LTL-2026-0045', branchCode: c.branchCode, equipmentType: c.chassisType, qty: 1, targetPickupDate, expectedReturn: manilaDay(ahead(30)), allocated: [c.chassisNo], status: 'Allocated', createdAt: ago(14 - k), createdBy: 'AE.JREYES',
      source: 'Internal', contactName: 'Juan Dela Cruz', contactPhone: '+63 917 222 3344' });
  });
  // DCIR repair categories (DBL-ALO-003): units without an override derive Minor/Major from the open JO, or TQS when repair is done (awaiting BR-07 sign-off).
  (['Breakdown', 'In Repair'] as const).forEach((s) => chassis.filter((c) => c.status === s).forEach((c, i) => { const cat = ([undefined, 'Major Repair', 'Minor Repair', 'Major Repair'] as const)[i]; if (cat) c.yardCategory = cat; }));
  // Chassis master attributes (SCR-12 review, DBL-CHS-001/002) — optional fields only; fleet size and statuses are untouched.
  chassis.forEach((c, i) => {
    c.axleConfig ??= i % 4 === 3 ? '3-axle' : '2-axle';
    c.hubType ??= (['10-hole', '8-hole', 'Spoke', '10-hole', '8-hole'] as const)[i % 5];
    c.tags ??= [c.axleConfig === '3-axle' ? 'Triaxle' : 'Dual Axle', c.hubType === 'Spoke' ? 'Spoke Type' : '8/10-Hole', ...(i % 7 === 2 ? ['Flashback'] : []), ...(i % 9 === 4 ? ['East Coast'] : [])];
    if (c.owner !== 'DELWATER' && !c.ownerEquipmentNo) c.ownerEquipmentNo = `PTN-EQ-${4100 + i}`;
  });

  // Review 1.1: registration dates are Manila calendar days. Notices go out at 07:00 Manila exactly 90 / 30 / 14 days before the expiry day
  // (was 1–2 days late because expiry used the UTC day); expired units are escalated the day after expiry.
  const todayDay = manilaDay(now());
  const dayAt = (day: string, hh = 7) => new Date(`${day}T${String(hh).padStart(2, '0')}:00:00+08:00`).toISOString();
  const plusDays = (day: string, d: number) => manilaDay(addDays(dayAt(day, 12), d));
  const daysTo = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${todayDay}T00:00:00Z`)) / 86_400_000);
  // DBL-REG-002: the expiry month follows the LTO plate-ending month (1 → Jan … 9 → Sep, 0 → Oct). Current units (> 90 days) renew in their
  // plate month; near-expiry / expired units carry a plate ending that matches their expiry month. Nov / Dec have no plate ending, so units
  // expiring then are flagged "Off schedule" on the Registration master.
  const alignReg = (plate: string, offset: number, k: number): [string, string] => {
    if (offset > 90) {
      const dd = String(5 + (k % 20)).padStart(2, '0');
      const next = (dg: number) => { const m = String(dg || 10).padStart(2, '0'); let y = Number(todayDay.slice(0, 4)); while (daysTo(`${y}-${m}-${dd}`) < 100) y++; return `${y}-${m}-${dd}`; };
      const d0 = Number(plate.replace(/\D/g, '').slice(-1)); let dg = d0, exp = next(dg);
      // Staff review 1.2: a registration runs one year, so a current unit must expire within 365 days — otherwise its issue date
      // (expiry − 1 year) would fall after today. When the plate month is too close, the plate ending moves to the next month that fits.
      for (let s = 1; s < 10 && daysTo(exp) > 365; s++) { dg = (d0 + s) % 10; exp = next(dg); }
      return [exp, dg === d0 || !plate ? plate : `${plate.slice(0, -1)}${dg}`];
    }
    const exp = plusDays(todayDay, offset); const m = Number(exp.slice(5, 7));
    return [exp, m <= 10 && plate ? `${plate.slice(0, -1)}${m % 10}` : plate];
  };
  // Notice history follows the DBL-REG-003 cadence: every stage already passed was sent; expired units were escalated.
  const regNotices = (exp: string) => {
    const offset = daysTo(exp);
    const n: NonNullable<Registration['notices']> = [];
    ([[90, '90', 'Regulatory + Accounting'], [30, '30', 'Regulatory + Accounting'], [14, '14', 'Operations + Sales']] as const).forEach(([d, stage, recipients]) => { if (offset <= d) n.push({ at: dayAt(plusDays(exp, -d)), stage, recipients }); });
    if (offset < 0) n.push({ at: dayAt(plusDays(exp, 1)), stage: 'expired', recipients: 'Regulatory + Operations Manager + Accounting (escalation)' });
    return { notices: n, lastNotifiedStage: (offset <= 14 ? '14' : offset <= 30 ? '30' : offset <= 90 ? '90' : undefined) as Registration['lastNotifiedStage'], escalatedAt: offset < 0 ? dayAt(plusDays(exp, 1)) : undefined, escalatedTo: offset < 0 ? 'Regulatory + Operations Manager + Accounting' : undefined };
  };
  const otherUnits: [Registration['subjectType'], string, string, string, number | null][] = [
    ['Trailer', 'TRL-MNL-01', 'MNL', 'Flatbed trailer 40ft', 60], ['Trailer', 'TRL-CEB-02', 'CEB', 'Flatbed trailer 20ft', 210],
    ['Vehicle', 'VEH-HO-01', 'HO', 'Service pickup', 18], ['Vehicle', 'VEH-HO-02', 'HO', 'Admin van', 320], ['Vehicle', 'VEH-HO-03', 'HO', 'Service pickup (new unit)', null],
    ['Motorcycle', 'MC-MNL-01', 'MNL', 'Yard checker motorcycle', 45], ['Motorcycle', 'MC-DVO-02', 'DVO', 'Yard checker motorcycle', 100],
    ['Prime Mover', 'PM-MNL-01', 'MNL', 'Prime mover 6x4', 9], ['Prime Mover', 'PM-BTG-02', 'BTG', 'Prime mover 6x4', 250], ['Prime Mover', 'PM-CAV-03', 'CAV', 'Prime mover 6x4 (new unit)', null],
  ];
  const registrations: Registration[] = [...chassis.map((c, i): Registration => {
    const offset = [400, 200, 85, 25, 12, -5, 300, 150][i % 8];
    const [exp, plate] = alignReg(c.plateNo ?? '', offset, i);
    c.plateNo = plate; // chassis master and registration carry the same plate
    return {
      ...regNotices(exp), responsible: 'REG', followUp: offset < 0 ? 'Escalated — renewal overdue' : offset <= 30 ? 'LTO appointment to book' : undefined, followUpDate: offset <= 30 ? plusDays(todayDay, Math.max(1, Math.min(offset, 7))) : undefined,
      id: `REG-${i + 1}`, subjectType: 'Chassis', subjectId: c.chassisNo, plateNo: plate, orNo: `OR${7000000 + i}`, crNo: `CR${8000000 + i}`,
      issueDate: plusDays(exp, -365), expiryDate: exp, agency: 'LTO', region: branches.find((b) => b.code === c.branchCode)?.region ?? 'NCR',
      renewalInProgress: offset < 30 && offset > 0 && i % 2 === 0, documents: [],
    };
  }), ...otherUnits.map(([subjectType, subjectId, branchCode, description, offset], i): Registration => {
    const region = branches.find((b) => b.code === branchCode)?.region ?? 'NCR';
    if (offset == null) return { id: `REG-X${i + 1}`, subjectType, subjectId, branchCode, description, pending: true, plateNo: '', orNo: '', crNo: '', issueDate: '', expiryDate: '', agency: 'LTO', region, renewalInProgress: false, documents: [], responsible: 'REG', followUp: 'Awaiting LTO first registration', followUpDate: plusDays(todayDay, 5),
      // Staff review 1.2: acquisition date, reason and expected registration date so the follow-up of a new unit can be measured.
      acquiredOn: plusDays(todayDay, subjectType === 'Vehicle' ? -21 : -12), pendingReason: subjectType === 'Vehicle' ? 'Waiting for the dealer to release the CSR and sales invoice' : 'Stencil and emission test booked; documents with LTO', expectedRegDate: plusDays(todayDay, subjectType === 'Vehicle' ? 9 : 6) };
    const [exp, plate] = alignReg(`N${String.fromCharCode(66 + i)}X ${4520 + i * 7}`, offset, i);
    return {
      ...regNotices(exp), id: `REG-X${i + 1}`, subjectType, subjectId, branchCode, description, plateNo: plate, orNo: `OR${7100000 + i}`, crNo: `CR${8100000 + i}`,
      issueDate: plusDays(exp, -365), expiryDate: exp, agency: 'LTO', region, renewalInProgress: false, documents: [`OR-CR-${subjectId}.pdf`], responsible: 'REG',
      followUp: offset <= 30 ? 'LTO appointment to book' : undefined, followUpDate: offset <= 30 ? plusDays(todayDay, 3) : undefined,
    };
  })];
  // Staff review 1.2: each current registration carries the renewal that produced it (date, who, LTO receipt, actual cost, OR/CR copy),
  // so the detail shows "last renewed" and the Compliance dashboard can compare actual spend with the forecast. Renewals in progress
  // show who is processing, the LTO reference and the expected date. Six chassis have no scanned copy yet (flagged on the list).
  registrations.forEach((r, i) => {
    if (r.pending || !r.issueDate) return;
    const at = dayAt(r.issueDate, 10);
    if (at < now()) r.renewals ??= [{ at, by: 'REG', orNo: r.orNo, crNo: r.crNo, issueDate: r.issueDate, expiryDate: r.expiryDate, cost: [1800, 1650, 1950, 1800, 2100][i % 5], receiptNo: `LTO-RCPT-${String(530100 + i * 7)}`, documents: [`OR-CR-${r.subjectId}-${r.issueDate.slice(0, 4)}.pdf`] }];
    if (r.subjectType === 'Chassis' && i % 10 !== 7 && !r.documents.length) r.documents = [`OR-CR-${r.subjectId}-${r.issueDate.slice(0, 4)}.pdf`];
    if (r.renewalInProgress) r.renewal ??= { startedAt: dayAt(plusDays(todayDay, -6), 9), startedBy: 'REG', processedBy: 'REG', reference: `LTO appointment ${String(88010 + i)}`, expectedDate: r.followUpDate ?? plusDays(todayDay, 3) };
  });

  // SCR-35 correction pass: one line per chassis (equipment, Out → In, days, contract-snapshot rate), billing cycle matching the client
  // master (weekly = 7-day period, monthly = 30-day period), invoice date = day after period end, due = invoice date + credit term.
  clients.forEach((c, i) => { c.tin ??= `00${i + 1}-${String(234 + i * 111).padStart(3, '0')}-${String(567 + i * 7).padStart(3, '0')}-000`; c.vatStatus ??= 'VAT-registered'; });
  const pick: Record<string, number> = {};
  const unitOf = (eqIdx: number, branchCode: string) => {
    const code = equipmentTypes[eqIdx].code; const pool = chassis.filter((c) => c.chassisType === code && c.branchCode === branchCode);
    const list = pool.length ? pool : chassis.filter((c) => c.chassisType === code); const k = (pick[code + branchCode] = (pick[code + branchCode] ?? -1) + 1);
    return list[k % list.length];
  };
  const inv = (no: string, clientCode: string, contractNo: string, daysAgoIssued: number, units: [eqIdx: number, days: number][], paid: number, branchCode = 'MNL', o: Partial<Invoice> = {}): Invoice => {
    const cl = clients.find((c) => c.clientCode === clientCode)!; const ct = contracts.find((c) => c.contractNo === contractNo)!;
    for (const k in pick) delete pick[k]; // same units on each weekly invoice of a client
    const len = cl.billingCycle === 'Monthly' ? 30 : 7; const ps = ago(daysAgoIssued + len), pe = ago(daysAgoIssued + 1);
    const lines: Invoice['lines'] = units.map(([eq, days], k) => {
      const u = unitOf(eq, branchCode); const rate = ct.rates[eq].dailyRate;
      return { id: `${no}-${k + 1}`, lineType: 'Lease', description: `Chassis lease — ${equipmentTypes[eq].name}`, equipmentType: equipmentTypes[eq].code, chassisNo: u.chassisNo, from: addDays(ps, -20 - k * 3), to: days < len ? addDays(ps, days - 1) : undefined, days, rate, rateType: 'Daily — contract snapshot', amount: days * rate };
    });
    const subtotal = lines.reduce((a, l) => a + l.amount, 0), vat = Math.round(subtotal * 0.12 * 100) / 100;
    const issuedAt = ago(daysAgoIssued);
    return {
      // Date-only fields use the Manila calendar day (portal review 1.1: due date = invoice date + credit term, no off-by-one before 08:00).
      invoiceNo: no, clientCode, contractNo, periodStart: manilaDay(ps), periodEnd: manilaDay(pe), billType: 'Lease', lines,
      subtotal, vat, total: Math.round((subtotal + vat) * 100) / 100, amountPaid: paid, dueDate: manilaDay(addDays(issuedAt, ct.creditTermDays)), status: 'Sent', issuedAt, branchCode,
      batchNo: `BB-${manilaDay(issuedAt).replace(/-/g, '')}-${cl.billingCycle === 'Monthly' ? 'M' : 'W'}${branchCode}`, invoiceDate: manilaDay(issuedAt), billingCycle: cl.billingCycle, creditTermDays: ct.creditTermDays,
      sentTo: cl.ebillingEmail, sentAt: addHours(issuedAt, 1), printCount: 0,
      history: [{ at: issuedAt, by: 'ACCTG', action: 'Finalized', note: 'Billing run' }, { at: addHours(issuedAt, 1), by: 'system', action: 'Sent', note: `Billing Completion email with invoice copy to ${cl.ebillingEmail}` }],
      ...o,
    };
  };
  const invoices: Invoice[] = [
    inv('INV-MNL-00001101', 'C-00123', 'LTL-2026-0045', 20, [[7, 7], [7, 7], [6, 7], [5, 7], [5, 7]], 0),
    inv('INV-MNL-00001102', 'C-00123', 'LTL-2026-0045', 13, [[7, 7], [7, 7], [6, 7], [5, 7], [5, 7]], 20000),
    inv('INV-MNL-00001050', 'C-00188', 'SPL-2026-0012', 75, [[0, 30], [1, 30], [2, 30], [3, 30], [4, 30]], 0),
    inv('INV-MNL-00001068', 'C-00188', 'SPL-2026-0012', 45, [[3, 30], [1, 30], [1, 20]], 0),
    inv('INV-CEB-00000310', 'C-00201', 'LTL-2026-0051', 10, [[3, 7], [4, 7], [5, 7], [6, 7], [7, 7]], 43120, 'CEB', { heldReason: 'Awaiting late-encoding credit memo CM-000006 approval (BR-05) — Deputy Yard Manager + Treasury' }),
    inv('INV-BTG-00000122', 'C-00215', 'QLP-2026-0007', 50, [[0, 30], [4, 20]], 30000, 'BTG'),
    inv('INV-MNL-00001120', 'C-00230', 'LTL-2026-0060', 5, [[0, 7], [1, 7], [2, 7], [2, 7], [3, 7], [3, 7], [6, 3]], 0),
  ];
  {
    // BR-05: the late-encoded Visayas unit (LE-00099, 9 days, WF-LE-1) is held on its invoice — excluded from the totals until CM-000006 is approved.
    const m = invoices[4]; const gp = gatePasses[2];
    const eq = equipmentTypes.find((e) => e.code === chassis.find((c) => c.chassisNo === gp?.chassisNo)?.chassisType);
    const r = contracts.find((c) => c.contractNo === 'LTL-2026-0051')?.rates.find((x) => x.equipmentType === eq?.code)?.dailyRate ?? 1300;
    if (gp && gp.clientCode === m.clientCode) m.lines.push({ id: `${m.invoiceNo}-H`, lineType: 'Lease', description: `Chassis lease — ${eq?.name ?? 'unit'}`, equipmentType: eq?.code, chassisNo: gp.chassisNo, from: gp.actualEventAt, days: 7, rate: r, rateType: 'Daily — contract snapshot', amount: 7 * r, held: true, lateDays: 9, heldMemoNo: 'CM-000006' });
    // Other bill types (DBL-FIN-005): repair (gate-in damage), GPS fee, special billing fully credited, and a cancelled duplicate.
    const one = (no: string, clientCode: string, contractNo: string, d: number, billType: string, line: Invoice['lines'][number], paid: number, branchCode: string, o: Partial<Invoice> = {}) => {
      const base = inv(no, clientCode, contractNo, d, [], paid, branchCode, { billType, ...o }); const vat = Math.round(line.amount * 0.12 * 100) / 100;
      return { ...base, lines: [{ ...line, id: `${no}-1` }], subtotal: line.amount, vat, total: line.amount + vat };
    };
    invoices.push(
      // A one-off repair bill covers the gate-in day it was found, not a weekly lease period (review 1.1: no overlap with INV-MNL-00001102).
      one('INV-MNL-00001118', 'C-00123', 'LTL-2026-0045', 8, 'Repair', { id: '', lineType: 'Damage', description: 'Chargeable damage — tail lamp + wiring (EIR gate-in)', chassisNo: chassis[0].chassisNo, rateType: 'Fixed — EIR chargeable', amount: 4500 }, 0, 'MNL', { periodStart: manilaDay(ago(9)), periodEnd: manilaDay(ago(9)) }),
      one('INV-CEB-00000315', 'C-00201', 'LTL-2026-0051', 3, 'GPS', { id: '', lineType: 'GPS', description: 'GPS tracking fee — 2 units × 1 month', days: 2, rate: 500, rateType: 'Monthly per unit (proposed, DBL-FIN-010)', amount: 1000 }, 0, 'CEB'),
      // Staff review 1.2: issued 12 days ago (after INV-MNL-00001102/1103, 13 days) so invoice numbers follow the invoice dates.
      one('INV-MNL-00001105', 'C-00230', 'LTL-2026-0060', 12, 'Special', { id: '', lineType: 'Special', description: 'Special billing — weekend yard handling', rateType: 'Fixed — special billing', amount: 2000, reason: 'Client request (DBL-FIN-004)' }, 0, 'MNL', { credited: 2240 }),
      // Numbered right after INV-MNL-00001102: the duplicate came out of the same billing run (review 1.1: numbers follow issue dates).
      one('INV-MNL-00001103', 'C-00123', 'LTL-2026-0045', 13, 'Lease', { id: '', lineType: 'Lease', description: 'Duplicate of INV-MNL-00001102 (same client & period)', amount: 42000 }, 0, 'MNL', { status: 'Cancelled', cancelReason: 'Billing batch conflict — duplicate of INV-MNL-00001102' }),
    );
    invoices[invoices.length - 1].history?.push({ at: ago(12), by: 'FINMGR', action: 'Cancelled', note: 'Billing batch conflict — duplicate of INV-MNL-00001102' });
    invoices[invoices.length - 2].history?.push({ at: ago(10), by: 'FINMGR', action: 'Credited', note: 'CM-000008 applied (no-rescue service dispute)' });
  }

  const parts: Part[] = [
    ['TIR-1100', 'Tire 11R22.5 radial', 'pc', 'Tires', 14500], ['TIR-VALVE', 'Tire valve stem', 'pc', 'Tires', 120], ['BRK-PAD', 'Brake lining set', 'set', 'Brakes', 3800],
    ['BRK-DRUM', 'Brake drum', 'pc', 'Brakes', 7200], ['SUS-LEAF', 'Leaf spring assembly', 'pc', 'Suspension', 9800], ['ELC-LAMP', 'Tail lamp assembly', 'pc', 'Electrical', 950],
    ['ELC-WIRE', 'Wiring harness 7-pin', 'pc', 'Electrical', 2400], ['MEC-KING', 'King pin', 'pc', 'Mechanical', 5600], ['MEC-LEG', 'Landing leg', 'pair', 'Mechanical', 12500], ['PNT-PRIM', 'Primer paint (gal)', 'gal', 'Painting', 1350],
  ].map(([partCode, description, uom, category, cost]) => ({ partCode: String(partCode), description: String(description), uom: String(uom), category: String(category), standardCost: Number(cost), rescuePrice: Math.round(Number(cost) * 1.15), lowStockThreshold: 5 }));
  // SCR-29 review: counts mostly agree with the system; a few realistic variances; CEB is past its monthly cycle; DVO adds a Mindanao stockroom.
  const countVar: Record<string, number> = { 'TIR-VALVE@WH-MNL': -2, 'ELC-LAMP@WH-CEB': 1, 'MEC-KING@WH-MNL': -6, 'PNT-PRIM@WH-MNL': -1, 'SUS-LEAF@WH-DVO': -1 };
  const countAgo: Record<string, number> = { 'WH-MNL': 12, 'WH-CEB': 38, 'WH-DVO': 25 };
  const stock: Db['stock'] = parts.flatMap((p, i) => ['WH-MNL', 'WH-CEB', ...(i < 6 ? ['WH-DVO'] : [])].map((wh, j) => {
    const qtyOnHand = wh === 'WH-DVO' ? (i * 7 + 4) % 15 : (i * 3 + j * 5 + 2) % 24;
    return { partCode: p.partCode, warehouseCode: wh, qtyOnHand, lastPhysicalCount: Math.max(0, qtyOnHand + (countVar[`${p.partCode}@${wh}`] ?? 0)), lastCountDate: ago(countAgo[wh]).slice(0, 10),
      entityCode: p.partCode === 'PNT-PRIM' ? 'KNEX' : wh === 'WH-DVO' && p.category === 'Tires' ? 'NAK' : 'DBL' };
  }));
  parts.forEach((p, i) => { p.weightKg ??= [62, 0.05, 4.5, 38, 45, 1.2, 2.8, 6.5, 55, 4.2][i]; p.movementClass ??= (['Fast', 'Slow', 'Fast', 'Fast', 'Slow', 'Fast', 'Slow', 'Slow', 'Non-moving', 'Fast'] as const)[i]; });
  // Staff review 1.2 (SCR-29): reorder level and reorder quantity per part (fast movers higher, slow / non-moving lower) — proposed values, editable in Admin → Parts.
  parts.forEach((p, i) => { p.lowStockThreshold = [6, 4, 5, 4, 3, 5, 3, 4, 2, 5][i]; p.reorderQty ??= [12, 20, 10, 6, 4, 10, 6, 4, 2, 8][i]; });
  // Staff review 1.2: bin location per stock line (rack-shelf), used when counting and receiving.
  stock.forEach((s) => { s.bin ??= `${'ABCDE'[parts.findIndex((p) => p.partCode === s.partCode) % 5]}-${String(parts.findIndex((p) => p.partCode === s.partCode) + 1).padStart(2, '0')}`; });

  const wf = (w: Partial<WorkflowInstance> & Pick<WorkflowInstance, 'id' | 'matrixCode' | 'title' | 'subjectType' | 'subjectId' | 'steps'>): WorkflowInstance => ({
    requestedBy: 'AE.JREYES', requestedAt: ago(1), status: 'Pending', currentStep: 0, ...w,
  });
  // System Administrator inbox samples: every My approvals tab (pending at an IT step, escalated, submitted by me, history) and the Notifications tabs.
  const adminWorkflows: WorkflowInstance[] = [
    wf({ id: 'WF-USR-1', matrixCode: 'USER_ACCESS', title: 'User access — new Accounting user for Cebu (ACCTG.CEB)', subjectType: 'user', subjectId: 'ACCTG.CEB', branchCode: 'CEB', requestedBy: 'FINMGR', requestedAt: ago(0.6), currentStep: 1, steps: [
      // Staff review 1.2: submitted 14.4 h ago, endorsed 9.6 h ago; the IT step (24 h SLA) started at the endorsement, when the notification was sent.
      { step: 1, label: 'Department head endorsement', roles: ['FINANCE_MANAGER'], decision: 'Approved', decidedBy: 'FINMGR', decidedAt: ago(0.4), comment: 'FINMGR:FINANCE_MANAGER:New hire starts Monday — Accounting role, CEB scope|' },
      { step: 2, label: 'IT account provisioning', roles: ['SYS_ADMIN'], decision: 'Pending', dueAt: ahead(0.6) }] }),
    wf({ id: 'WF-UNL-1', matrixCode: 'ACCOUNT_UNLOCK', title: 'Unlock account — BG.CEB (5 failed sign-in attempts)', subjectType: 'user', subjectId: 'BG.CEB', branchCode: 'CEB', requestedBy: 'BG.CEB', requestedAt: addHours(now(), -3), steps: [
      { step: 1, label: 'IT verification and unlock', roles: ['SYS_ADMIN'], decision: 'Pending', dueAt: addHours(now(), 5) }] }),
    wf({ id: 'WF-EWX-2', matrixCode: 'EWA_EXTENSION', title: 'EWA extension — EU-000779 (revalidation after expiry)', subjectType: 'ewa', subjectId: 'EU-000779', branchCode: 'MNL', requestedBy: 'AE.JREYES', requestedAt: addHours(now(), -6.5), currentStep: 1, steps: [
      // Review 1.1: requested after EU-000779 expired (created 31 h ago, expired 7 h ago); manager approved, IT revalidation overdue (4 h SLA) → escalated.
      { step: 1, label: 'Manager approval', roles: ['DYM', 'REGIONAL_MANAGER', 'OPS_MANAGER'], decision: 'Approved', decidedBy: 'OPSMGR', decidedAt: addHours(now(), -6), comment: 'OPSMGR:OPS_MANAGER:Trucker delayed by port congestion — extend 24 h|' },
      { step: 2, label: 'IT / authorised revalidation', roles: ['SYS_ADMIN'], decision: 'Pending', dueAt: addHours(now(), -2) }] }),
    wf({ id: 'WF-XBR-1', matrixCode: 'CROSS_BRANCH_RETURN', title: 'Cross-branch return code — DW-CEB-1046 returning to Manila', subjectType: 'chassis', subjectId: 'DW-CEB-1046', branchCode: 'MNL', requestedBy: 'BG.MNL', requestedAt: ago(3), currentStep: 2, steps: [
      { step: 1, label: 'Regional / Operations Manager', roles: ['REGIONAL_MANAGER', 'OPS_MANAGER'], decision: 'Approved', decidedBy: 'RM.NCR', decidedAt: ago(2.8), comment: 'RM.NCR:REGIONAL_MANAGER:Client returns at MNL — confirmed with Cebu|' },
      { step: 2, label: 'APS', roles: ['APS_MANAGER'], decision: 'Approved', decidedBy: 'APS', decidedAt: ago(2.5), comment: 'APS:APS_MANAGER:Transfer the unit to MNL on finalise|' },
      { step: 3, label: 'IT issues the approval code', roles: ['SYS_ADMIN'], decision: 'Pending', dueAt: ago(1.5) }] }),
    wf({ id: 'WF-SET-1', matrixCode: 'SETTING_CHANGE', title: 'System setting — e-wallet minimum balance ₱10,000 → ₱15,000', subjectType: 'setting', subjectId: 'ewl.min_balance', amount: 15000, requestedBy: 'ADMIN', requestedAt: ago(1), steps: [
      { step: 1, label: 'Finance Manager approval', roles: ['FINANCE_MANAGER'], decision: 'Pending', dueAt: ahead(1) }] }),
    wf({ id: 'WF-SET-2', matrixCode: 'SETTING_CHANGE', title: 'System setting — EWA validity 24 h → 48 h', subjectType: 'setting', subjectId: 'gat.ewa_validity_hours', requestedBy: 'ADMIN', requestedAt: ago(9), status: 'Approved', currentStep: 1, steps: [
      { step: 1, label: 'Operations Manager approval', roles: ['OPS_MANAGER'], decision: 'Approved', decidedBy: 'OPSMGR', decidedAt: ago(8), comment: 'OPSMGR:OPS_MANAGER:Approved for the port-congestion period|' }] }),
    wf({ id: 'WF-USR-0', matrixCode: 'USER_ACCESS', title: 'Grant Treasury approver role to ACCTG', subjectType: 'user', subjectId: 'ACCTG', requestedBy: 'ADMIN', requestedAt: ago(12), status: 'Rejected', currentStep: 0, steps: [
      { step: 1, label: 'CHRO approval', roles: ['CHRO'], decision: 'Rejected', decidedBy: 'CHRO', decidedAt: ago(11), comment: 'CHRO:CHRO:Segregation of duties — Accounting cannot also approve Treasury releases|' }] }),
  ];
  // Staff review 1.2: each notice carries its category, the rule that produced it (Admin → Notification rules), the channels used and the
  // recipient role; links open the exact record. Times match the approval records (a notice is sent when the step starts or escalates).
  type NoteCat = NonNullable<Db['notifications'][number]['category']>;
  const adminNote = (id: string, hoursAgo: number, title: string, body: string, link: string, read: boolean, requiresAck = false, ackAt?: string, meta: { category?: NoteCat; ruleId?: string; channels?: string[]; ackBy?: string } = {}) =>
    ({ id, at: addHours(now(), -hoursAgo), title, body, link, read, requiresAck, ackAt, userId: 'ADMIN', recipientRole: 'SYS_ADMIN', channels: ['In-App', 'Email'], ...meta });
  const adminNotifications = [
    adminNote('N-ADM-1', 0.4 * 24, 'Approval needed — user access', 'Finance Manager endorsed a new Accounting user for Cebu (ACCTG.CEB). IT provisioning is waiting for you (24 h SLA).', '/approvals?id=WF-USR-1', false, false, undefined, { category: 'Approval', ruleId: 'N28' }),
    adminNote('N-ADM-2', 3, 'Account locked — BG.CEB', 'Five failed sign-in attempts. The user has requested an unlock.', '/approvals?id=WF-UNL-1', false, false, undefined, { category: 'Security', ruleId: 'N28' }),
    adminNote('N-ADM-3', 1.5 * 24, 'Escalated — cross-branch return code', 'DW-CEB-1046 → Manila has waited 24 h at the IT step (24 h SLA, counted from when the step started) and was escalated.', '/approvals?id=WF-XBR-1', false, true, undefined, { category: 'Escalation', ruleId: 'N28' }),
    adminNote('N-ADM-4', 26, 'Email delivery failed', '3 notification emails to billing@example.ph bounced (mailbox full). Retried 3 times.', '/admin/notifications', false, false, undefined, { category: 'Delivery', ruleId: 'N30' }),
    adminNote('N-ADM-5', 24, 'Setting change submitted', 'E-wallet minimum balance ₱10,000 → ₱15,000 is waiting for the Finance Manager.', '/approvals?id=WF-SET-1', true, false, undefined, { category: 'Approval', ruleId: 'N28', channels: ['In-App'] }),
    adminNote('N-ADM-6', 48, 'Nightly DCIR snapshot saved', 'Snapshot for all branches saved at 23:59. Retained for 90 days.', '/allocation/dcir', true, false, undefined, { category: 'System', ruleId: 'N29', channels: ['In-App'] }),
    adminNote('N-ADM-7', 72, 'Audit hash chain verified', 'Weekly check passed — 13 sealed events, no gaps.', '/admin/audit', true, false, undefined, { category: 'System', ruleId: 'N29', channels: ['In-App'] }),
    adminNote('N-ADM-8', 8 * 24, 'Setting change approved', 'EWA validity 24 h → 48 h approved by the Operations Manager.', '/approvals?id=WF-SET-2', true, true, addHours(now(), -8 * 24 + 2), { category: 'Approval', ruleId: 'N28', ackBy: 'ADMIN' }),
    adminNote('N-ADM-9', 11 * 24, 'Role change rejected', 'CHRO rejected “Grant Treasury approver role to ACCTG” — segregation of duties.', '/approvals?id=WF-USR-0', true, false, undefined, { category: 'Approval', ruleId: 'N28' }),
    adminNote('N-ADM-10', 260, 'New portal registration', 'Islandlink Cargo registered on the client portal and is waiting for AE approval.', '/clients/C-00251', true, false, undefined, { category: 'Operations', ruleId: 'N01' }),
  ];
  const workflows: WorkflowInstance[] = [
    // SCR-07 history: Metro approved last year; Northstar's first attempt rejected by Finance, resubmitted 3 days ago (48h window → escalated).
    wf({ id: 'WF-ACC-0', matrixCode: 'ACCREDITATION', title: 'Accreditation — Metro Container Lines', subjectType: 'client', subjectId: 'C-00230', requestedAt: ago(408), status: 'Approved', currentStep: 3, steps: [
      { step: 1, label: 'C&C investigation (BICI)', roles: ['CNC_OFFICER'], decision: 'Approved', decidedBy: 'CNC.OFF1', decidedAt: ago(407), comment: 'CNC.OFF1:CNC_OFFICER:Recommend — clean trade and bank references|' },
      { step: 2, label: 'Finance endorsement', roles: ['FINANCE_MANAGER'], decision: 'Approved', decidedBy: 'FINMGR', decidedAt: ago(406), comment: 'FINMGR:FINANCE_MANAGER:Endorsed with ₱1.5M limit|' },
      { step: 3, label: 'VP final sign-off', roles: ['VP'], decision: 'Approved', decidedBy: 'VP', decidedAt: ago(405), comment: 'VP:VP:Approved|' }] }),
    wf({ id: 'WF-ACC-R', matrixCode: 'ACCREDITATION', title: 'Accreditation — Northstar Trucking', subjectType: 'client', subjectId: 'C-00244', requestedAt: ago(14), status: 'Rejected', currentStep: 1, steps: [
      { step: 1, label: 'C&C investigation (BICI)', roles: ['CNC_OFFICER'], decision: 'Approved', decidedBy: 'CNC.OFF1', decidedAt: ago(12), comment: 'CNC.OFF1:CNC_OFFICER:Recommend with conditions|' },
      { step: 2, label: 'Finance endorsement', roles: ['FINANCE_MANAGER'], decision: 'Rejected', decidedBy: 'FINMGR', decidedAt: ago(10), comment: 'FINMGR:FINANCE_MANAGER:Bank reference not verifiable — resubmit with bank certificate|' },
      { step: 3, label: 'VP final sign-off', roles: ['VP'], decision: 'Pending' }] }),
    wf({ id: 'WF-ACC-1', matrixCode: 'ACCREDITATION', title: 'Accreditation — Northstar Trucking', subjectType: 'client', subjectId: 'C-00244', requestedAt: ago(3), steps: [
      { step: 1, label: 'C&C investigation (BICI)', roles: ['CNC_OFFICER'], decision: 'Pending', dueAt: ago(1) },
      { step: 2, label: 'Finance endorsement', roles: ['FINANCE_MANAGER'], decision: 'Pending' },
      { step: 3, label: 'VP final sign-off', roles: ['VP'], decision: 'Pending' }] }),
    // Cash bond withdrawal in progress (SCR-09 review: show the approval stages on the list).
    wf({ id: 'WF-CBW-1', matrixCode: 'CASH_BOND_WITHDRAWAL', title: 'Cash bond withdrawal (EARLY — exception) — Visayas Freight Services', subjectType: 'cashbond', subjectId: 'CB-3', amount: 18880, requestedBy: 'AE.KONG', requestedAt: ago(2), currentStep: 1, steps: [
      { step: 1, label: 'Credit & Collection', roles: ['CNC_OFFICER'], decision: 'Approved', decidedBy: 'CNC.OFF1', decidedAt: ago(1), comment: 'CNC.OFF1:CNC_OFFICER:No overdue balance; early exception supported|' },
      { step: 2, label: 'Finance', roles: ['FINANCE_MANAGER'], decision: 'Pending', dueAt: ahead(1) },
      { step: 3, label: 'Accounting', roles: ['ACCOUNTING'], decision: 'Pending' },
      { step: 4, label: 'Admin', roles: ['SYS_ADMIN'], decision: 'Pending' }] }),
    // Staff UI changes V1.4 (row 11, BR-03): completed hold-lift chains for the other two tiers — Tier 1 (Officer 1 alone) and
    // Tier 3 (Officers 1, 2 and 3, each a separate signature; ₱500k–₱1M gap routed to Tier 3 by setting cnc.gap_policy).
    { ...wf({ id: 'WF-HL-T1', matrixCode: 'HOLD_LIFT', title: 'Hold lift — Metro Container Lines (Tier 1)', subjectType: 'client', subjectId: 'C-00230', amount: 64800, requestedBy: 'CNC.MGR', requestedAt: ago(120), steps: [
      { step: 1, label: 'Tier 1 — Officer 1', roles: ['CNC_OFFICER'], decision: 'Approved', decidedBy: 'CNC.OFF1', decidedAt: ago(119.8), comment: 'CNC.OFF1:CNC_OFFICER:₱40,000 paid; balance covered by a promise to pay within 7 days|' }] }), status: 'Approved' as const, currentStep: 1 },
    { ...wf({ id: 'WF-HL-T3', matrixCode: 'HOLD_LIFT', title: 'Hold lift — ABC Logistics Inc. (Tier 3)', subjectType: 'client', subjectId: 'C-00123', amount: 560000, requestedBy: 'CNC.MGR', requestedAt: ago(260), steps: [
      { step: 1, label: 'Tier 3 — Officers 1, 2 and 3', roles: ['CNC_OFFICER', 'EXEC_OFFICER', 'EXEC_OFFICER'], decision: 'Approved', decidedBy: 'EXEC.OFF3', decidedAt: ago(258.5),
        comment: 'CNC.OFF1:CNC_OFFICER:Payment plan agreed — PDCs received|EXEC.OFF2:EXEC_OFFICER:Approved on the payment plan|EXEC.OFF3:EXEC_OFFICER:Approved — monitor weekly|' }] }), status: 'Approved' as const, currentStep: 1 },
    wf({ id: 'WF-HL-1', matrixCode: 'HOLD_LIFT', title: 'Hold lift — Pacific Movers Corp.', subjectType: 'client', subjectId: 'C-00188', amount: 308000, requestedBy: 'CNC.MGR', requestedAt: ago(3), steps: [
      { step: 1, label: 'Tier 2 — Officer 1 + Finance Manager', roles: ['CNC_OFFICER', 'FINANCE_MANAGER'], decision: 'Pending', dueAt: ago(1) }] }),
    // Gate (SCR-14/18 review): populated extension and late-encoding approval examples.
    wf({ id: 'WF-EWX-1', matrixCode: 'EWA_EXTENSION', title: 'EWA extension — EU-000776', subjectType: 'ewa', subjectId: 'EU-000776', branchCode: 'CEB', requestedBy: 'AE.JREYES', requestedAt: addHours(now(), -2), steps: [
      { step: 1, label: 'Manager approval', roles: ['DYM', 'REGIONAL_MANAGER', 'OPS_MANAGER'], decision: 'Pending', dueAt: ahead(1) }, { step: 2, label: 'IT / authorised revalidation', roles: ['SYS_ADMIN'], decision: 'Pending' }] }),
    wf({ id: 'WF-LE-1', matrixCode: 'LATE_ENCODING_CM', title: `Late encoding 9 days — ${gatePasses[2]?.gatePassNo}`, subjectType: 'gatepass', subjectId: gatePasses[2]?.gatePassNo ?? '', requestedBy: 'BG.MNL', branchCode: gatePasses[2]?.branchCode, steps: [
      { step: 1, label: 'Deputy Yard Manager', roles: ['DYM'], decision: 'Pending', dueAt: ahead(1) }, { step: 2, label: 'Treasury', roles: ['TREASURY'], decision: 'Pending' }] }),
  ];
  // SCR-28 ledger sample (review: populated rows incl. pending-approval Adjustment / Transfer and auto-posted PO / JO movements).
  const qoh = (pc: string, wh: string) => stock.find((s) => s.partCode === pc && s.warehouseCode === wh)?.qtyOnHand ?? 0;
  const repairUnit = chassis.find((c) => c.status === 'In Repair')?.chassisNo;
  const stx = (no: number, t: Partial<Db['stockTxns'][number]> & Pick<Db['stockTxns'][number], 'type' | 'partCode' | 'qty' | 'fromWarehouse' | 'at' | 'by'>): Db['stockTxns'][number] =>
    ({ id: `STX-${no}`, txnNo: `STK-${String(no).padStart(6, '0')}`, entityCode: 'DBL', status: 'Posted', source: 'Manual', balanceAfter: qoh(t.partCode, t.fromWarehouse!), ...t });
  const stockTxns: Db['stockTxns'] = [
    // Staff review 1.2: Manila (2 pair on hand, at its reorder level) asks Cebu (7 pair) — the requesting side is the one short of stock; needed-by date and priority added.
    stx(118, { type: 'Request', partCode: 'MEC-LEG', qty: 2, fromWarehouse: 'WH-MNL', toWarehouse: 'WH-CEB', referenceType: 'Request', status: 'Open', requestingBranch: 'MNL', department: 'Repair & Maintenance', requestedBy: 'BG.MNL', remarks: 'Manila stock is down to 2 pair (reorder level) — restock for landing-leg repairs found at Gate In', neededBy: manilaDay(ahead(5)), priority: 'Normal', at: addHours(now(), -5), by: 'BG.MNL' }),
    stx(117, { type: 'Transfer', partCode: 'BRK-PAD', qty: -4, fromWarehouse: 'WH-MNL', toWarehouse: 'WH-CEB', referenceType: 'Transfer', status: 'Pending Approval', workflowId: 'WF-STK-2', remarks: 'Rebalance brake linings to Cebu', at: addHours(now(), -20), by: 'WH.MNL' }),
    stx(116, { type: 'Adjustment', partCode: 'TIR-VALVE', qty: -2, fromWarehouse: 'WH-MNL', referenceType: 'Count', referenceId: 'TIR-VALVE@WH-MNL', source: 'Auto — Count', reason: 'Monthly cycle count: counted 3 vs system 5 — two valve stems found damaged', status: 'Pending Approval', workflowId: 'WF-STK-1', at: ago(1), by: 'WH.MNL' }),
    stx(115, { type: 'Issue', partCode: 'PNT-PRIM', qty: -3, fromWarehouse: 'WH-MNL', referenceType: 'JO', referenceId: 'JO-NVL-000498', source: 'Auto — Job Order', equipmentRef: repairUnit, entityCode: 'KNEX', at: ago(2), by: 'BG.MNL' }),
    stx(114, { type: 'Issue', partCode: 'ELC-LAMP', qty: -2, fromWarehouse: 'WH-MNL', referenceType: 'JO', referenceId: 'JO-NVL-000498', source: 'Auto — Job Order', equipmentRef: repairUnit, damagedQty: 2, remarks: 'Two broken lamps returned to scrap bin', at: ago(2), by: 'BG.MNL' }),
    stx(113, { type: 'Receive', partCode: 'ELC-WIRE', qty: 3, fromWarehouse: 'WH-CEB', referenceType: 'Transfer', referenceId: 'STK-000112', approvalRef: 'WF-00007', balanceAfter: 3, at: ago(7), by: 'BG.CEB' }),
    // Review 1.1: transaction numbers follow date order (110 → 113); the transfer was dated before 110/111.
    stx(112, { type: 'Transfer', partCode: 'ELC-WIRE', qty: -3, fromWarehouse: 'WH-MNL', toWarehouse: 'WH-CEB', referenceType: 'Transfer', approvalRef: 'WF-00007', at: ago(8), by: 'WH.MNL' }),
    stx(111, { type: 'Receive', partCode: 'SUS-LEAF', qty: 8, fromWarehouse: 'WH-MNL', referenceType: 'RR', referenceId: 'RR-000059', poNo: 'PO-000149', orderedQty: 8, source: 'Auto — PO', deliveryRef: 'DR-ABP-55821', receivedBy: 'WH.MNL', at: ago(9), by: 'WH.MNL' }),
    stx(110, { type: 'Issue', partCode: 'SUS-LEAF', qty: -1, fromWarehouse: 'WH-MNL', referenceType: 'JO', referenceId: 'JO-MNL-000470', source: 'Auto — Job Order', equipmentRef: chassis[0].chassisNo, balanceAfter: qoh('SUS-LEAF', 'WH-MNL') - 8, at: ago(13), by: 'BG.MNL' }),
  ];
  stockTxns[2].balanceAfter = qoh('TIR-VALVE', 'WH-MNL'); stockTxns[1].balanceAfter = qoh('BRK-PAD', 'WH-MNL');
  const mnlKing = stock.find((s) => s.partCode === 'MEC-KING' && s.warehouseCode === 'WH-MNL');
  if (mnlKing) mnlKing.pendingCount = { counted: 18, auditType: 'Monthly cycle count', reason: 'Recount after −6 variance; one king pin found in R&M bay', photoName: 'bin-card-MEC-KING-MNL.jpg', submittedBy: 'WH.MNL', submittedAt: ago(0.5), workflowId: 'WF-CNT-1' };
  workflows.push(
    wf({ id: 'WF-STK-1', matrixCode: 'STOCK_ADJUSTMENT', title: 'Stock adjustment STK-000116 — TIR-VALVE', subjectType: 'stock', subjectId: 'STK-000116', requestedBy: 'WH.MNL', steps: [{ step: 1, label: 'APS approval', roles: ['APS_MANAGER'], decision: 'Pending', dueAt: ahead(1) }] }),
    wf({ id: 'WF-STK-2', matrixCode: 'STOCK_TRANSFER', title: 'Stock transfer STK-000117 — BRK-PAD WH-MNL → WH-CEB', subjectType: 'stock', subjectId: 'STK-000117', requestedBy: 'WH.MNL', requestedAt: addHours(now(), -20), steps: [{ step: 1, label: 'APS approval', roles: ['APS_MANAGER'], decision: 'Pending', dueAt: ahead(1) }] }),
    wf({ id: 'WF-CNT-1', matrixCode: 'STOCK_COUNT', title: 'Monthly cycle count MEC-KING @ WH-MNL — variance −5', subjectType: 'stock', subjectId: 'MEC-KING@WH-MNL', requestedBy: 'WH.MNL', requestedAt: ago(0.5), steps: [{ step: 1, label: 'APS / MMG Manager — audit report approval', roles: ['APS_MANAGER'], decision: 'Pending', dueAt: ahead(1.5) }] }),
    wf({ id: 'WF-AST-1', matrixCode: 'ASSET_DISPOSAL', title: 'Dispose asset AST-ST-005 — Pallet jack', subjectType: 'asset', subjectId: 'AST-ST-005', requestedBy: 'APS.OFF', branchCode: 'MNL', steps: [{ step: 1, label: 'APS / MMG Manager approval', roles: ['APS_MANAGER'], decision: 'Pending', dueAt: ahead(1) }] }),
  );
  const lateEncodings: Db['lateEncodings'] =[gatePasses[1], gatePasses[2]].filter(Boolean).map((g, i) => ({
    id: `LE-0009${8 + i}`, gatePassNo: g.gatePassNo, originalDate: g.encodedAt, correctedDate: addDays(g.encodedAt, i ? -9 : -3), daysLate: i ? 9 : 3,
    reason: i ? 'Branch system outage — paper gate pass encoded after restoration' : 'Connectivity outage at the gate tablet', path: i ? 'CREDIT_MEMO' : 'AUTO', status: i ? 'Pending Approval' : 'Posted',
    // Staff review 1.2: "Recorded" = when the correction was posted — 20 minutes after the late gate pass was encoded.
    workflowId: i ? 'WF-LE-1' : undefined, createdAt: addHours(g.encodedAt, 1 / 3), createdBy: 'BG.MNL', attachment: i ? 'outage-report-ITSR-0142.pdf' : undefined,
  }));

  // ── SCR-36 / SCR-37 billing examples: PR → Treasury clearance → OR, bounced / cancelled / provisional receipts; memos in every state.
  const billRc = (r: Partial<Db['receipts'][number]> & Pick<Db['receipts'][number], 'receiptNo' | 'clientCode' | 'amount' | 'method'>): Db['receipts'][number] => ({
    type: 'PR', date: ago(5).slice(0, 10), applications: [], unapplied: 0, by: 'ACCTG', status: 'Provisional', createdAt: ago(5), tin: clients.find((c) => c.clientCode === r.clientCode)?.tin, ...r,
  });
  const billingReceipts: Db['receipts'] = [
    billRc({ receiptNo: 'PR-MNL-00000455', clientCode: 'C-00230', amount: 30000, method: 'Check', checkNo: '0081234', bank: 'BPI', checkDate: ahead(3).slice(0, 10), pdc: true, depositStatus: 'Not deposited', date: ago(1).slice(0, 10), createdAt: ago(1),
      reference: 'BPI 0081234', applications: [{ invoiceNo: 'INV-MNL-00001120', amount: 30000 }], notes: 'Post-dated check received at Manila cashier; deposit on check date.',
      // Staff review 1.2: check scan and the recording step in the history.
      attachments: ['check-BPI-0081234.jpg'], history: [{ at: ago(1), by: 'ACCTG', action: 'PR recorded', note: 'Post-dated check — deposit on the check date, then Treasury clearance' }] }),
    // Staff review 1.2: receipt numbers follow the dates received (one shared counter for PR and OR, all branches): 447 bounced (16 d), 448 cancelled (9 d), 449 → OR 450 (6 d).
    billRc({ receiptNo: 'PR-MNL-00000449', orNo: 'OR-MNL-00000450', type: 'OR', status: 'OR Issued', clientCode: 'C-00123', amount: 20000, method: 'Check', checkNo: '004512', bank: 'BDO', checkDate: ago(6).slice(0, 10), depositStatus: 'Cleared', reference: 'BDO 004512',
      date: ago(6).slice(0, 10), createdAt: ago(6), clearedAt: ago(5).slice(0, 10), clearedBy: 'TREAS', orIssuedAt: ago(5), applications: [{ invoiceNo: 'INV-MNL-00001102', amount: 20000 }],
      depositDate: ago(6).slice(0, 10), depositSlipNo: 'DS-MNL-061108', depositAccount: 'BDO current account ••••3456', depositedBy: 'ACCTG',
      history: [{ at: ago(6), by: 'ACCTG', action: 'PR recorded' }, { at: ago(5.9), by: 'ACCTG', action: 'Check deposited', note: 'slip DS-MNL-061108 · BDO current account ••••3456' }, { at: ago(5), by: 'TREAS', action: 'Clearance confirmed — OR-MNL-00000450 issued' }] }),
    billRc({ receiptNo: 'PR-CEB-00000451', orNo: 'OR-CEB-00000452', type: 'OR', status: 'OR Issued', clientCode: 'C-00201', amount: 43120, method: 'Bank Transfer', bank: 'Metrobank', reference: 'MBTC-TRF-88120', date: ago(4).slice(0, 10), createdAt: ago(4),
      clearedAt: ago(3).slice(0, 10), clearedBy: 'TREAS', orIssuedAt: ago(3), depositStatus: 'Cleared', applications: [{ invoiceNo: 'INV-CEB-00000310', amount: 43120 }], history: [{ at: ago(4), by: 'ACCTG', action: 'PR recorded' }, { at: ago(3), by: 'TREAS', action: 'Clearance confirmed — OR-CEB-00000452 issued' }] }),
    billRc({ receiptNo: 'PR-BTG-00000441', orNo: 'OR-BTG-00000442', type: 'OR', status: 'OR Issued', clientCode: 'C-00215', amount: 30000, method: 'Check', checkNo: '220019', bank: 'Landbank', checkDate: ago(30).slice(0, 10), reference: 'LBP 220019',
      date: ago(30).slice(0, 10), createdAt: ago(30), clearedAt: ago(27).slice(0, 10), clearedBy: 'TREAS', orIssuedAt: ago(27), depositStatus: 'Cleared', applications: [{ invoiceNo: 'INV-BTG-00000122', amount: 30000 }],
      depositDate: ago(29).slice(0, 10), depositSlipNo: 'DS-BTG-101402', depositAccount: 'Landbank savings ••••7702', depositedBy: 'ACCTG' }),
    billRc({ receiptNo: 'PR-MNL-00000447', status: 'Bounced', clientCode: 'C-00188', amount: 50000, method: 'Check', checkNo: '0012077', bank: 'RCBC', checkDate: ago(16).slice(0, 10), depositStatus: 'Returned', reference: 'RCBC 0012077',
      // Review 1.1: bounce dated 13 days ago so its penalty DM-000037 precedes the Park & Fix DM-000039 (numbers follow creation order).
      date: ago(16).slice(0, 10), createdAt: ago(16), applications: [{ invoiceNo: 'INV-MNL-00001068', amount: 50000 }], penaltyMemoNo: 'DM-000037', notes: 'Returned DAIF by RCBC; client informed by C&C.',
      depositDate: ago(16).slice(0, 10), depositSlipNo: 'DS-MNL-102601', depositAccount: 'BDO current account ••••3456', depositedBy: 'ACCTG',
      bounceReason: 'Returned DAIF (drawn against insufficient funds)', bouncedBy: 'TREAS', bouncedAt: ago(13),
      history: [{ at: ago(16), by: 'ACCTG', action: 'PR recorded' }, { at: ago(13), by: 'TREAS', action: 'Bounced — check returned DAIF', note: 'Dishonoured-check penalty DM-000037 raised' }] }),
    billRc({ receiptNo: 'PR-MNL-00000448', status: 'Cancelled', clientCode: 'C-00123', amount: 5000, method: 'Cash', date: ago(9).slice(0, 10), createdAt: ago(9), cancelledAt: ago(9), unapplied: 5000, cancelReason: 'Encoded under the wrong client — re-issued under Metro Container Lines', cancelledBy: 'ACCTG',
      history: [{ at: ago(9), by: 'ACCTG', action: 'PR recorded' }, { at: ago(9), by: 'ACCTG', action: 'Cancelled', note: 'Encoded under the wrong client' }] }),
  ];
  const billStep = (label: string, roles: RoleCode[], decision: 'Pending' | 'Approved' | 'Rejected', by?: string, at?: string, comment?: string) => ({ step: 0, label, roles, decision, decidedBy: by, decidedAt: at, comment: by ? `${by}:${roles[0]}:${comment ?? ''}|` : undefined });
  const memoWf = (id: string, subjectId: string, title: string, amount: number, status: WorkflowInstance['status'], steps: ReturnType<typeof billStep>[], at: string) =>
    wf({ id, matrixCode: 'MEMO', title, subjectType: 'memo', subjectId, amount, status, requestedBy: 'ACCTG', requestedAt: at, currentStep: status === 'Pending' ? steps.findIndex((s) => s.decision === 'Pending') : steps.length, steps: steps.map((s, i) => ({ ...s, step: i + 1 })) });
  workflows.push(
    memoWf('WF-CM-7', 'CM-000007', 'Credit memo CM-000007 — Southern Haulers Co.', 3000, 'Rejected', [billStep('Finance Manager', ['FINANCE_MANAGER'], 'Rejected', 'FINMGR', ago(18), 'No evidence of overbilling — rates match contract snapshot')], ago(19)),
    memoWf('WF-CM-8', 'CM-000008', 'Credit memo CM-000008 — Metro Container Lines', 2240, 'Approved', [billStep('Finance Manager', ['FINANCE_MANAGER'], 'Approved', 'FINMGR', ago(10), 'Dispute upheld')], ago(11)),
    memoWf('WF-CM-10', 'CM-000010', 'Credit memo CM-000010 — ABC Logistics Inc.', 840, 'Approved', [billStep('Finance Manager', ['FINANCE_MANAGER'], 'Approved', 'FINMGR', ago(2), 'BIR 2307 received')], ago(3)),
    memoWf('WF-DM-37', 'DM-000037', 'Debit memo DM-000037 — Pacific Movers Corp.', 2500, 'Pending', [billStep('Finance Manager', ['FINANCE_MANAGER'], 'Pending')], ago(13)),
  );
  const leWf = workflows.find((w) => w.id === 'WF-LE-1');
  // Staff review 1.2: the CM approval starts when LE-00099 is recorded (same time); the DYM approved the next day and the Treasury
  // step is past its 48-hour target, so it shows as overdue / escalated instead of "pending for a month" with no flag.
  const leAt = lateEncodings[1]?.createdAt;
  if (leWf && leAt) { leWf.requestedAt = leAt; leWf.steps[0] = { ...leWf.steps[0], dueAt: addHours(leAt, 48), decision: 'Approved', decidedBy: 'DYM.MNL', decidedAt: addHours(leAt, 20), comment: 'DYM.MNL:DYM:Outage report verified|' }; leWf.currentStep = 1; leWf.steps[1].dueAt = addHours(leAt, 68); }
  const leHeld = invoices[4].lines.find((l) => l.held);
  const q2307 = (d?: string) => { const x = (d ?? manilaDay(now())).slice(0, 10); return `${x.slice(0, 4)}Q${Math.floor((Number(x.slice(5, 7)) - 1) / 3) + 1}`; };
  const billingMemos: Db['memos'] = [
    // Review 1.1: the withholding-tax credit references the invoice it names (approved = client credit; applied to the invoice as a separate step).
    { memoNo: 'CM-000010', type: 'Credit', clientCode: 'C-00123', referenceInvoiceNo: 'INV-MNL-00001101', referenceType: 'Invoice', amount: 840, reason: 'Creditable withholding tax (2% of ₱42,000) on INV-MNL-00001101 — BIR Form 2307 received', category: 'Withholding-tax adjustment', status: 'Approved', workflowId: 'WF-CM-10',
      // Staff review 1.2: the BIR 2307 file is for the quarter of the invoice date; withholding base / rate captured; no VAT on a withholding-tax credit.
      createdAt: ago(3), createdBy: 'ACCTG', source: 'Manual', evidence: [`BIR-2307-ABC-${q2307(invoices[0].invoiceDate)}.pdf`], approvalChain: ['Finance Manager'],
      vatTreatment: 'VAT-exempt', wht: { base: 42000, rate: 0.02, form2307: `BIR-2307-ABC-${q2307(invoices[0].invoiceDate)}`, quarter: q2307(invoices[0].invoiceDate) } },
    // Review 1.1: the late-encoding CM is raised automatically when LE-00099 is submitted (same timestamp), so it is numbered before
    // CM-000007 (CM-000006); the amount is the held invoice line it releases — its calculation is spelled out in the reason.
    { memoNo: 'CM-000006', type: 'Credit', clientCode: 'C-00201', referenceInvoiceNo: 'INV-CEB-00000310', referenceType: 'Late Encoding', referenceId: 'LE-00099', amount: leHeld?.amount ?? 0,
      reason: `Late encoding 9 days (LE-00099) — held line ${leHeld?.chassisNo ?? ''}: ${leHeld?.days ?? 7} days × ${leHeld?.rate != null ? `₱${leHeld.rate.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : 'contract rate'} = ₱${(leHeld?.amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}, released to billing on approval; unit billed from the actual gate-out date`,
      category: 'Late-encoding correction', status: 'Pending Approval', workflowId: 'WF-LE-1', createdAt: lateEncodings[1]?.createdAt ?? ago(30), createdBy: 'BG.MNL', source: 'Auto', evidence: ['outage-report-ITSR-0142.pdf'], approvalChain: ['Deputy Yard Manager', 'Treasury'], vatTreatment: 'VAT-exclusive' },
    { memoNo: 'CM-000008', type: 'Credit', clientCode: 'C-00230', referenceInvoiceNo: 'INV-MNL-00001105', referenceType: 'Invoice', amount: 2240, reason: 'Special billing disputed — handling was covered by the rescue already charged', category: 'No-rescue service dispute', status: 'Applied',
      workflowId: 'WF-CM-8', createdAt: ago(11), createdBy: 'ACCTG', source: 'Manual', evidence: ['client-dispute-letter.pdf'], approvalChain: ['Finance Manager'], appliedTo: 'INV-MNL-00001105', balanceAfter: 0, appliedAt: ago(10), appliedBy: 'ACCTG', vatTreatment: 'VAT-inclusive' },
    { memoNo: 'CM-000007', type: 'Credit', clientCode: 'C-00215', referenceInvoiceNo: 'INV-BTG-00000122', referenceType: 'Invoice', amount: 3000, reason: 'Client claims overbilling of 2 days', category: 'Billing correction', status: 'Rejected',
      workflowId: 'WF-CM-7', createdAt: ago(19), createdBy: 'ACCTG', source: 'Manual', evidence: ['client-email.pdf'], approvalChain: ['Finance Manager'], vatTreatment: 'VAT-inclusive' },
    // Review 1.1: a Draft estimate created after the JO (numbered after DM-000040); it can be submitted only once the JO is closed with its Accomplishment Report.
    { memoNo: 'DM-000041', type: 'Debit', clientCode: 'C-00123', referenceType: 'Job Order', referenceId: 'JO-NVL-000512', joNo: 'JO-NVL-000512', amount: 13328, reason: 'Draft estimate — chargeable repair after gate-in (two tires and brake lining); submit when JO-NVL-000512 is closed with its Accomplishment Report', category: 'Repair cost', status: 'Draft',
      createdAt: ago(0.5), createdBy: 'ACCTG', source: 'Manual', evidence: ['JO-NVL-000512-photos.zip'], breakdown: { labor: 1900, parts: 9200, travel: 0, service: 800, inputTax: 1428 }, approvalChain: ['Finance Manager'], vatTreatment: 'VAT-inclusive' },
    { memoNo: 'DM-000037', type: 'Debit', clientCode: 'C-00188', referenceInvoiceNo: 'INV-MNL-00001068', referenceType: 'Receipt', referenceId: 'PR-MNL-00000447', amount: 2500, reason: 'Dishonoured check RCBC 0012077 — contract penalty', category: 'Dishonoured check penalty', status: 'Pending Approval', vatTreatment: 'VAT-exempt', settlement: 'Reference invoice',
      workflowId: 'WF-DM-37', createdAt: ago(13), createdBy: 'TREAS', source: 'Auto', evidence: ['RCBC-return-slip.pdf'], approvalChain: ['Finance Manager'] },
  ];

  // Staff UI changes V1.4 (rows 44–46): the cash-bond withdrawal approval chains (C&C → Finance → Accounting → Admin).
  {
    const step = (n: number, label: string, role: RoleCode, by: string, at: string | undefined, c: string) => ({ step: n, label, roles: [role], decision: (at ? 'Approved' : 'Pending') as 'Approved' | 'Pending', decidedBy: at ? by : undefined, decidedAt: at, comment: at ? `${by}:${role}:${c}|` : undefined });
    const chain = (start: number, done: number) => [
      step(1, 'Credit & Collection', 'CNC_OFFICER', 'CNC.OFF1', done > 0 ? ago(start - 1) : undefined, 'Balances checked'), step(2, 'Finance', 'FINANCE_MANAGER', 'FINMGR', done > 1 ? ago(start - 2) : undefined, 'Endorsed'),
      step(3, 'Accounting', 'ACCOUNTING', 'ACCTG', done > 2 ? ago(start - 3) : undefined, 'Refundable amount verified against the ledger'), step(4, 'Admin', 'SYS_ADMIN', 'ADMIN', done > 3 ? ago(start - 4) : undefined, 'Approved')];
    const w = (id: string, bondId: string, client: string, amount: number, requestedAt: string, steps: ReturnType<typeof chain>, status: 'Pending' | 'Approved') => ({ id, matrixCode: 'CASH_BOND_WITHDRAWAL', title: `Cash bond withdrawal — ${client}`, subjectType: 'cashbond', subjectId: bondId, amount,
      requestedBy: 'AE.KONG', requestedAt, status, currentStep: steps.filter((s) => s.decision === 'Approved').length, steps: steps.map((s, i) => (i === steps.filter((x) => x.decision === 'Approved').length && status === 'Pending' ? { ...s, dueAt: ahead(1) } : s)) });
    workflows.push(
      { ...w('WF-CBW-6', 'CB-6', 'ABC Logistics Inc.', 15000, ago(238), chain(238, 4), 'Approved'), requestedBy: 'AE.JREYES' },
      w('WF-CBW-8', 'CB-8', 'Visayas Freight Services', 8880, ago(6), chain(6, 3), 'Pending'), // Pending Admin
      w('WF-CBW-9', 'CB-9', 'Visayas Freight Services', 10000, ago(15), chain(15, 4), 'Approved')); // Approved — awaiting refund
  }
  // Staff UI changes V1.4 (row 34, RM-002): a chargeable job order fully closed — JO-MNL-000440 on DW-MNL-1005 (Visayas). Repairs closed
  // per system with before / after photos, Closed by R&M, then "Closed by EIR Out" when the unit left on GP-MNL-000902 (EIR-MNL-000202).
  // DM-000030 bills the final parts + labor (+ input VAT) and was settled from the e-wallet; the top-up that funded it nets to zero, so the
  // Visayas wallet balance (₱45,000) is unchanged.
  const extraJos: JobOrder[] = [];
  const extraEwt: Db['ewalletTxns'] = [];
  {
    const gp5 = gatePasses.find((g) => g.direction === 'OUT' && g.chassisNo === 'DW-MNL-1005');
    if (gp5 && gp5.clientCode === 'C-00201') {
      const created = ago(54), closed = ago(44), bom = [{ partCode: 'BRK-PAD', description: 'Brake lining set', qty: 1, unitCost: 3800 }, { partCode: 'ELC-LAMP', description: 'Tail lamp assembly', qty: 1, unitCost: 950 }];
      const labor = [{ worker: 'Laborer A', hours: 5, rate: 95, date: manilaDay(ago(45)), shift: 'Morning' as const }];
      const cost = 3800 + 950 + 475, inputTax = Math.round(cost * 0.12 * 100) / 100, amount = Math.round((cost + inputTax) * 100) / 100;
      extraJos.push({ joNo: 'JO-MNL-000440', chassisNo: 'DW-MNL-1005', branchCode: 'MNL', source: 'Gate In', sourceRef: 'Gate-in inspection on return (worn brake lining, broken tail lamp)', categories: ['Brakes', 'Electrical'],
        notes: 'Brake lining worn below limit and left tail lamp broken on return — client damage, chargeable.', workers: ['Laborer A'], status: 'Closed by EIR Out', isMajor: false, chargeable: true, chargeClientCode: 'C-00201',
        priority: 'Normal', estimatedCost: 5000, photos: ['jo440-brake-before.jpg'], afterPhotos: ['jo440-brake-after.jpg', 'jo440-lamp-after.jpg'], bom, labor,
        systemsClosed: [{ system: 'Brakes', at: addHours(closed, -3), by: 'BG.MNL' }, { system: 'Electrical', at: addHours(closed, -1), by: 'BG.MNL' }],
        createdAt: created, createdBy: 'BG.MNL', approvedBy: 'BG.MNL', confirmedBy: 'DYM.MNL', closedAt: closed, eirOut: { gatePassNo: gp5.gatePassNo, eirNo: gp5.eirNo, at: gp5.actualEventAt },
        history: [{ at: created, by: 'BG.MNL', status: 'Draft', note: 'Created' }, { at: addHours(created, 2), by: 'BG.MNL', status: 'Approved' }, { at: addHours(created, 5), by: 'DYM.MNL', status: 'Confirmed' },
          { at: ago(46), by: 'BG.MNL', status: 'Ongoing', note: 'Work started' }, { at: addHours(closed, -3), by: 'BG.MNL', status: 'Ongoing', note: 'Brakes repair closed' }, { at: addHours(closed, -1), by: 'BG.MNL', status: 'Ongoing', note: 'Electrical repair closed' },
          { at: closed, by: 'BG.MNL', status: 'Closed by R&M', note: 'After-repair photos attached' }, { at: gp5.actualEventAt, by: gp5.encodedBy, status: 'Closed by EIR Out', note: `Departed on ${gp5.gatePassNo} · ${gp5.eirNo}` }] });
      billingMemos.push({ memoNo: 'DM-000030', type: 'Debit', clientCode: 'C-00201', referenceType: 'Job Order', referenceId: 'JO-MNL-000440', joNo: 'JO-MNL-000440', amount,
        reason: `Chargeable repair JO-MNL-000440 (closed) — parts ₱4,750.00 + labor ₱475.00 + 12% input VAT ₱${inputTax.toLocaleString('en-PH', { minimumFractionDigits: 2 })}; deducted from the e-wallet`, category: 'Repair cost', status: 'Posted',
        createdAt: addHours(closed, 4), createdBy: 'ACCTG', source: 'Manual', evidence: ['JO-MNL-000440-accomplishment-report.pdf'], breakdown: { labor: 475, parts: 4750, travel: 0, service: 0, inputTax }, approvalChain: ['Finance Manager'], vatTreatment: 'VAT-exclusive' });
      extraEwt.push({ id: 'EWT-7A', clientCode: 'C-00201', at: ago(47), type: 'Replenishment', amount, balanceAfter: 45000 + amount, referenceType: 'Top-up', referenceId: 'OR-CEB-00000041', receiptNo: 'OR-CEB-00000041', treasuryRef: 'TRS-2026-0163', category: 'Top-up', by: 'ACCTG', reason: 'Top-up to cover the chargeable repair JO-MNL-000440' },
        { id: 'EWT-7B', clientCode: 'C-00201', at: addHours(closed, 5), type: 'Deduction', amount: -amount, balanceAfter: 45000, referenceType: 'Debit Memo', referenceId: 'DM-000030', category: 'Repair', by: 'system' });
    }
  }
  // Staff UI changes V1.4 (row 54): a completed PARK & REPAIR example (PF-3). Its job order JO-MNL-000505 is closed with actual parts + labor;
  // the park-out bill carries handling, repair, parking and VAT, and DM-000042 matches it to the centavo.
  const pf3Jo: JobOrder = { joNo: 'JO-MNL-000505', chassisNo: 'VFS-TRL-0311', branchCode: 'MNL', source: 'Spot Repair', sourceRef: 'PF-3', categories: ['Brakes', 'Electrical'],
    notes: 'Park & Fix repair for client-owned trailer VFS-TRL-0311 (Visayas Freight Services). Chargeable to client. Scope: replace brake lining set and one tail lamp.', workers: ['Laborer B'], status: 'Closed by R&M', isMajor: false,
    chargeable: true, chargeClientCode: 'C-00201', estimatedCost: 5000, photos: ['pf3-brake-before.jpg'], afterPhotos: ['pf3-brake-after.jpg'], priority: 'Normal',
    bom: [{ partCode: 'BRK-PAD', description: 'Brake lining set', qty: 1, unitCost: 3800 }, { partCode: 'ELC-LAMP', description: 'Tail lamp assembly', qty: 1, unitCost: 950 }],
    labor: [{ worker: 'Laborer B', hours: 4, rate: 95, date: manilaDay(ago(1)), shift: 'Afternoon' }],
    systemsClosed: [{ system: 'Brakes', at: ago(0.9), by: 'BG.MNL' }, { system: 'Electrical', at: ago(0.85), by: 'BG.MNL' }],
    createdAt: ago(3), createdBy: 'BG.MNL', approvedBy: 'BG.MNL', confirmedBy: 'DYM.MNL', closedAt: ago(0.8),
    history: [{ at: ago(3), by: 'BG.MNL', status: 'Draft', note: 'Created from Park & Fix PF-3' }, { at: ago(2.9), by: 'BG.MNL', status: 'Approved' }, { at: ago(2.8), by: 'DYM.MNL', status: 'Confirmed' }, { at: ago(1.2), by: 'BG.MNL', status: 'Ongoing', note: 'Work started' }, { at: ago(0.8), by: 'BG.MNL', status: 'Closed by R&M', note: 'After-repair photo attached' }] };
  extraJos.push(pf3Jo);
  const pf3Charges = { handling: 500, repair: 5130, park: 1050, net: 5964.29, vat: 715.71, total: 6680, interimBilled: 0, due: 6680, vatBasis: 'inclusive' as const, repairSource: 'Actual cost of JO-MNL-000505 (parts + labor, Closed by R&M)' };
  billingMemos.push({ memoNo: 'DM-000042', type: 'Debit', clientCode: 'C-00201', referenceType: 'Park & Fix', referenceId: 'PF-3', joNo: 'JO-MNL-000505', amount: 6680,
    reason: 'Park & Fix VFS-TRL-0311 (Park & Repair) — handling ₱500.00 + repair ₱5,130.00 + park 3 day(s) × ₱350 = ₱1,050.00; VAT inclusive ₱715.71; total ₱6,680.00 (DBL-ALO-005)', status: 'Posted', createdAt: ago(0.3) });
  // Staff UI changes V1.4 (row 19): a FULLY APPROVED late-encoding Credit Memo example (LE-00097) — Visayas unit DW-LAG-1022, gate pass
  // encoded 10 days late. DYM then Treasury approved CM-000005; the held line was released to INV-CEB-00000302, which the client paid
  // (OR-CEB-00000301), so AR / aging totals do not change. The gate pass and the unit's status date now use the actual gate-out.
  {
    const lgp = gatePasses.find((g) => g.direction === 'OUT' && g.chassisNo === 'DW-LAG-1022');
    const lch = chassis.find((c) => c.chassisNo === 'DW-LAG-1022');
    const eqIdx = equipmentTypes.findIndex((e) => e.code === lch?.chassisType);
    if (lgp && lch && eqIdx >= 0 && lgp.clientCode === 'C-00201') {
      const corrected = addDays(lgp.encodedAt, -10), recorded = addHours(lgp.encodedAt, 1 / 3), dymAt = addHours(recorded, 19), trsAt = addHours(recorded, 41);
      lgp.actualEventAt = corrected; lch.statusSince = corrected;
      const ev = inv('INV-CEB-00000302', 'C-00201', lgp.contractNo, Math.max(1, Math.round((Date.now() - new Date(trsAt).getTime()) / 86_400_000) - 2), [[eqIdx, 10]], 0, 'CEB');
      const ln = ev.lines[0];
      Object.assign(ln, { description: `Chassis lease — ${equipmentTypes[eqIdx].name} · late-encoded days released by CM-000005 (LE-00097)`, chassisNo: lch.chassisNo, from: corrected, to: addDays(corrected, 9), days: 10, lateDays: 10, heldMemoNo: 'CM-000005', recalculated: true, gatePassNo: lgp.gatePassNo, ewaNo: lgp.euNo });
      ev.amountPaid = ev.total;
      (ev.history ??= []).push({ at: trsAt, by: 'system', action: 'Held lines released', note: 'CM-000005 approved (BR-05)' });
      invoices.push(ev);
      billingReceipts.push(billRc({ receiptNo: 'PR-CEB-00000300', orNo: 'OR-CEB-00000301', type: 'OR', status: 'OR Issued', clientCode: 'C-00201', amount: ev.total, method: 'Bank Transfer', bank: 'Metrobank', reference: 'MBTC-TRF-87011',
        date: addDays(ev.issuedAt, 3).slice(0, 10), createdAt: addDays(ev.issuedAt, 3), depositStatus: 'Cleared', applications: [{ invoiceNo: ev.invoiceNo, amount: ev.total }] }));
      workflows.push({ id: 'WF-LE-0', matrixCode: 'LATE_ENCODING_CM', title: `Late encoding 10 days — ${lgp.gatePassNo}`, subjectType: 'gatepass', subjectId: lgp.gatePassNo, requestedBy: 'BG.MNL', requestedAt: recorded, branchCode: lgp.branchCode, status: 'Approved', currentStep: 2, steps: [
        { step: 1, label: 'Deputy Yard Manager', roles: ['DYM'], decision: 'Approved', decidedBy: 'DYM.MNL', decidedAt: dymAt, dueAt: addHours(recorded, 48), comment: 'DYM.MNL:DYM:Paper gate pass and guard logbook verified|' },
        { step: 2, label: 'Treasury', roles: ['TREASURY'], decision: 'Approved', decidedBy: 'TREAS', decidedAt: trsAt, dueAt: addHours(dymAt, 48), comment: 'TREAS:TREASURY:Billing correction accepted|' }] });
      billingMemos.push({ memoNo: 'CM-000005', type: 'Credit', clientCode: 'C-00201', referenceInvoiceNo: ev.invoiceNo, referenceType: 'Late Encoding', referenceId: 'LE-00097', amount: ln.amount,
        reason: `Late encoding 10 days (LE-00097) — held line ${lch.chassisNo}: 10 days × ₱${ln.rate?.toLocaleString('en-PH', { minimumFractionDigits: 2 })} = ₱${ln.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}, released to ${ev.invoiceNo}; unit billed from the actual gate-out date`,
        category: 'Late-encoding correction', status: 'Posted', workflowId: 'WF-LE-0', createdAt: recorded, createdBy: 'BG.MNL', source: 'Auto', evidence: ['paper-gate-pass-LAG-scan.pdf'], approvalChain: ['Deputy Yard Manager', 'Treasury'], vatTreatment: 'VAT-exclusive' });
      lateEncodings.unshift({ id: 'LE-00097', gatePassNo: lgp.gatePassNo, originalDate: lgp.encodedAt, correctedDate: corrected, daysLate: 10, reason: 'Gate tablet replaced — paper gate pass encoded once the new tablet was set up',
        path: 'CREDIT_MEMO', status: 'Approved', workflowId: 'WF-LE-0', createdAt: recorded, createdBy: 'BG.MNL', attachment: 'paper-gate-pass-LAG-scan.pdf', memoNo: 'CM-000005', approvedAt: trsAt,
        releasedLines: [{ invoiceNo: ev.invoiceNo, lineId: ln.id, description: ln.description, days: 10, amount: ln.amount }] });
    }
  }

  const rule = (id: string, eventType: string, description: string, recipientRoles: RoleCode[], source: string, o: Partial<NotificationRule> = {}): NotificationRule => ({
    id, eventType, description, recipientRoles, namedRecipients: [], includeClient: false, includeAe: false, channels: ['Email', 'SMS', 'In-App'], mode: 'One-time', active: true, source, ...o,
  });
  const notificationRules: NotificationRule[] = [
    rule('N01', 'client.portal_registered', 'Portal registration — AE one-click approval', [], 'DBL-CLT-019', { includeAe: true, channels: ['Email', 'In-App'] }),
    rule('N02', 'client.portal_denied', 'Portal registration denied', [], 'DBL-CLT-019', { includeClient: true, channels: ['Email'] }),
    rule('N03', 'client.hold.applied', 'Credit Hold Alert', ['CNC_OFFICER', 'OPS_MANAGER'], 'DBL-NOT-004', { includeAe: true, includeClient: true }),
    rule('N04', 'client.reactivated', 'Client reactivated', ['CNC_OFFICER', 'OPS_MANAGER'], 'UC-09', { includeAe: true, includeClient: true, channels: ['Email', 'In-App'] }),
    rule('N05', 'contract.expiring', 'Contract expiry 3/2/1 months', ['SALES_DIRECTOR'], 'DBL-CLT-011', { includeAe: true, channels: ['Email', 'In-App'] }),
    rule('N06', 'contract.activated', 'Contract activation / expiration', ['SALES_DIRECTOR', 'CNC_OFFICER'], 'DBL-NOT-004', { includeAe: true, includeClient: true, channels: ['Email'] }),
    rule('N07', 'cashbond.withdrawal', 'Cash bond withdrawal', ['SALES_DIRECTOR', 'CNC_OFFICER', 'ACCOUNTING', 'FINANCE_MANAGER'], 'DBL-NOT-004', { channels: ['Email', 'In-App'] }),
    rule('N08', 'ewa.created', 'EWA created — full details', ['BRANCH_GENERALIST', 'DYM', 'REGIONAL_MANAGER', 'SALES_DIRECTOR'], 'DBL-GAT-002, DBL-NOT-006', { includeAe: true, includeClient: true, namedRecipients: ['ops-mailbox@demo.delbros.local'] }),
    rule('N09', 'gate.out.completed', 'Chassis out', ['BRANCH_GENERALIST'], 'DBL-NOT-003', { includeAe: true, includeClient: true }),
    rule('N10', 'gate.in.completed', 'Chassis in', ['BRANCH_GENERALIST'], 'DBL-NOT-003', { includeAe: true, includeClient: true }),
    rule('N11', 'gate.in.unroadworthy', 'Unroadworthy return → JO approval chain', ['BRANCH_GENERALIST', 'DYM'], 'DBL-RM-008', { channels: ['Email', 'In-App'] }),
    rule('N12', 'late_encoding.cm_required', 'Late encoding > 7 days — CM approval', ['DYM', 'TREASURY'], 'DBL-GAT-009, DBL-NOT-005', { escalationHours: 48, channels: ['Email', 'In-App'] }),
    rule('N13', 'rescue.requested', 'Rescue requested (urgent = repeat SMS until ack)', ['SALES_DIRECTOR', 'DYM', 'BRANCH_GENERALIST', 'OPS_MANAGER', 'CNC_OFFICER', 'ACCOUNTING'], 'DBL-RES-005, DBL-NOT-003', { mode: 'Repeat until ack', repeatMinutes: 15 }),
    rule('N14', 'rescue.completed', 'Rescue completed — full detail', ['OPS_MANAGER', 'CNC_OFFICER', 'ACCOUNTING'], 'DBL-NOT-006', { includeClient: true, channels: ['Email'] }),
    rule('N15', 'jo.created', 'Job order created (DYM escalation if major)', ['BRANCH_GENERALIST', 'DYM'], 'DBL-RM-008', { channels: ['Email', 'In-App'] }),
    rule('N16', 'jo.spot_repair', 'Spot repair (urgent)', ['BRANCH_GENERALIST', 'DYM'], 'DBL-NOT-003', { mode: 'Repeat until ack', repeatMinutes: 15, channels: ['SMS', 'In-App'] }),
    rule('N17', 'prc.approval_needed', 'RFP / PO approvals', ['DEPT_HEAD', 'ACCOUNTING'], 'DBL-NOT-004/005', { escalationHours: 48, channels: ['Email', 'In-App'] }),
    rule('N18', 'prc.payable.due_in_14d', 'Supplier payable due in 2 weeks', ['APS_OFFICER', 'ACCOUNTING'], 'DBL-FIN-016', { channels: ['Email'] }),
    rule('N19', 'billing.completed', 'Billing completion (client gets invoice copy)', ['ACCOUNTING', 'CNC_OFFICER', 'SALES_DIRECTOR'], 'DBL-NOT-004', { includeClient: true, channels: ['Email'] }),
    rule('N20', 'payment.applied', 'Payment application alert', ['CNC_OFFICER', 'SALES_DIRECTOR'], 'DBL-NOT-004', { includeClient: true, channels: ['Email'] }),
    rule('N21', 'invoice.overdue', 'Overdue balance alert', ['SALES_DIRECTOR', 'OPS_MANAGER', 'CNC_OFFICER'], 'DBL-NOT-004', { includeClient: true }),
    rule('N22', 'collection.reminder', 'SOA summary / payment reminders', ['CNC_OFFICER'], 'DBL-CNC-003…006', { includeClient: true, channels: ['Email'] }),
    rule('N23', 'hold_lift.escalated', 'Hold-to-Active escalation', ['FINANCE_MANAGER', 'CNC_MANAGER', 'EXEC_OFFICER'], 'DBL-NOT-004', { channels: ['Email', 'In-App'] }),
    rule('N24', 'ewallet.movement', 'E-wallet deduction / replenishment / below minimum', ['OPS_MANAGER', 'CNC_OFFICER'], 'DBL-EWL-004', { includeAe: true, includeClient: true }),
    rule('N25', 'registration.expiring_90_30', 'Registration expiring in 90 / 30 days', ['REGULATORY', 'ACCOUNTING'], 'DBL-REG-003', { channels: ['Email', 'In-App'] }),
    rule('N26', 'registration.expiring_14', 'Registration expiring in 14 days', ['OPS_MANAGER', 'SALES_DIRECTOR'], 'DBL-REG-003'),
    rule('N27', 'inventory.low_stock', 'Low stock', ['APS_OFFICER', 'WAREHOUSE'], 'DBL-RPT-004', { channels: ['In-App', 'Email'] }),
    rule('N28', 'workflow.task', 'Approval task assigned / escalated', [], 'Engine', { channels: ['In-App', 'Email'], escalationHours: 48 }),
    rule('N29', 'report.ready', 'Report ready', [], 'Reporting', { channels: ['In-App'] }),
    rule('N30', 'integration.delivery_failed', 'Delivery failure alert', ['SYS_ADMIN'], 'INT-002', { channels: ['Email', 'In-App'] }),
  ];

  const vendors: Db['vendors'] = [
    { vendorId: 'V-001', name: 'Tire Pro Supply', tin: '000-111-222-000', address: 'Quezon City', email: 'vendor@tirepro.ph', paymentTerms: '30 days', status: 'Active' },
    { vendorId: 'V-002', name: 'Axle & Brake Parts Co.', tin: '000-333-444-000', address: 'Valenzuela', email: 'sales@axlebrake.ph', paymentTerms: '15 days', status: 'Active' },
    { vendorId: 'V-003', name: 'Roadside Rescue Partners', tin: '000-555-666-000', address: 'Cavite', email: 'dispatch@rrp.ph', paymentTerms: '30 days', status: 'Active' },
  ];

  const breakdown = chassis.find((c) => c.status === 'Breakdown')!;
  const inRepair = chassis.find((c) => c.status === 'In Repair')!;
  // Review 1.1: days in status for the two units with seeded JOs count from the job order (Breakdown at gate-in / repair start).
  breakdown.statusSince = ago(1); inRepair.statusSince = ago(5);
  // Review 1.1: every Breakdown / In Repair unit has a job order. Minor / Major units carry an open JO (Major = escalated);
  // TQS units (repairs finished, awaiting the BR-07 sign-off) carry a JO Closed by R&M. Repair categories on the board / DCIR are unchanged.
  const repairJos: JobOrder[] = [];
  {
    const SYS: RepairCategory[][] = [['Suspension', 'Brakes'], ['Mechanical'], ['Tires'], ['Electrical', 'Mechanical'], ['Brakes'], ['Painting'], ['Tires', 'Suspension'], ['Electrical'], ['Mechanical', 'Brakes'], ['Suspension']];
    const crew: Record<string, string> = { CAV: 'Laborer D', BTG: 'Laborer E', SUB: 'Laborer F', CEB: 'Laborer G', CDO: 'Laborer H', DVO: 'Laborer J' };
    const units = chassis.filter((c) => (c.status === 'Breakdown' || c.status === 'In Repair') && c !== breakdown && c !== inRepair);
    const drafts = units.map((c, k) => {
      const done = !c.yardCategory; // no override = TQS (repair finished)
      const major = c.yardCategory === 'Major Repair';
      const worker = crew[c.branchCode] ?? 'Laborer D';
      const status: JobOrder['status'] = done ? 'Closed by R&M' : c.status === 'Breakdown' ? (major ? 'Confirmed' : 'Draft') : k % 3 === 2 ? 'On Hold' : 'Ongoing';
      const worked = status === 'Ongoing' || status === 'On Hold' || done;
      const createdAt = addHours(c.statusSince, 3);
      return { c, createdAt, jo: {
        chassisNo: c.chassisNo, branchCode: c.branchCode, source: (c.status === 'Breakdown' ? 'Gate In' : 'Scheduled') as JobOrder['source'], categories: SYS[k % SYS.length],
        notes: done ? 'Repairs completed; awaiting quality sign-off to Available.' : major ? 'Major parts / chassis-legal issue — escalated to the Deputy Yard Manager.' : c.status === 'Breakdown' ? 'Unroadworthy at gate-in inspection; repair scope to be approved.' : 'Repair in progress.',
        workers: [worker], status, isMajor: major, chargeable: false, bom: [],
        labor: worked ? [{ worker, hours: 4 + (k % 3), rate: k % 2 ? 110 : 95, date: manilaDay(ago(done ? 2 : 1)), shift: (['Morning', 'Afternoon', 'Evening'] as const)[k % 3] }] : [],
        // Review 1.2: Cebu JOs are raised and approved by the Cebu Branch Generalist; other branches have no own BG demo user yet.
        createdAt, createdBy: c.branchCode === 'CEB' ? 'BG.CEB' : 'BG.MNL', approvedBy: status === 'Draft' ? undefined : c.branchCode === 'CEB' ? 'BG.CEB' : 'BG.MNL', confirmedBy: status === 'Draft' ? undefined : 'DYM.MNL', closedAt: done ? ago(1 + (k % 2)) : undefined,
        holdReason: status === 'On Hold' ? 'Waiting for parts — stock request raised to the stockroom' : undefined,
      } };
    }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    // Numbered in creation order: older than JO-…-000470 (14 days) from 000450, newer from 000480.
    let older = 450, newer = 480;
    drafts.forEach(({ jo, createdAt }) => { const no = createdAt < ago(14) ? older++ : newer++; repairJos.push({ joNo: `JO-${jo.branchCode}-${String(no).padStart(6, '0')}`, ...jo }); });
  }

  const seedOut: Db = {
    version: 4,
    branches, equipmentTypes, users, clients,
    accreditations: [
      { id: 'ACC-1', clientCode: 'C-00244', status: 'Pending C&C', bici: { yearsInOperation: 6, secReg: 'CS2019-00123', tin: '123-456-789-000', bankReferences: 'BPI Pasig — bank certificate attached',
        natureOfBusiness: 'Trucking — container haulage for forwarders, Pasig and Port Area', owners: 'Rico Dela Paz (President)', requestedLimit: 500000, requestedTermDays: 30, expectedUnits: 6, requestedTypes: ['LTL'] }, workflowId: 'WF-ACC-1', submittedAt: ago(3), submittedBy: 'AE.JREYES',
        documents: [{ id: 'AD-1', kind: 'SEC / DTI certificate', fileName: 'northstar-sec-cert.pdf', at: ago(3), by: 'AE.JREYES' }, { id: 'AD-2', kind: 'Bank certificate', fileName: 'northstar-bpi-cert.pdf', at: ago(3), by: 'AE.JREYES' }],
        log: [{ at: ago(3), by: 'AE.JREYES', action: 'Resubmitted after rejection' }] },
      { id: 'ACC-R', clientCode: 'C-00244', status: 'Rejected', bici: { yearsInOperation: 6, secReg: 'CS2019-00123', tin: '123-456-789-000', creditScore: 61, grade: 'C', result: 'Recommend', reasoning: 'Acceptable trade references; bank reference pending' }, workflowId: 'WF-ACC-R', submittedAt: addHours(ago(14), -5.3), submittedBy: 'AE.JREYES',
        log: [{ at: ago(14), by: 'AE.JREYES', action: 'Submitted for accreditation' }, { at: ago(12), by: 'CNC.OFF1', action: 'C&C investigation (BICI): Approved — Recommend with conditions' }, { at: ago(10), by: 'FINMGR', action: 'Finance endorsement: Rejected — Bank reference not verifiable' }] },
      { id: 'ACC-0', clientCode: 'C-00230', status: 'Approved', bici: { yearsInOperation: 12, secReg: 'CS2008-00456', tin: '222-333-444-000', creditScore: 82, grade: 'A', recommendedTermDays: 30, recommendedLimit: 1500000, result: 'Recommend', reasoning: 'Clean trade and bank references' }, workflowId: 'WF-ACC-0', submittedAt: addHours(ago(408), 2.6), submittedBy: 'AE.JREYES',
        activation: { allowLt: true, allowSt: true, allowOnline: true, allowSpecial: true, allowRescue: true, cwsBranchAccess: ['MNL', 'NVL', 'CAV'], creditLimit: 1500000, creditTermDays: 30, signOffDate: ago(405).slice(0, 10) } },
    ],
    contracts,
    cashBonds: [
      // Staff UI changes V1.4 (rows 44–46): one bond at each final withdrawal stage, on ended contracts.
      { id: 'CB-6', clientCode: 'C-00123', contractNo: 'QLP-2025-0019', amount: 15000, dateReceived: ago(422).slice(0, 10), receiptRef: 'OR-MNL-00000196', status: 'Refunded', paymentMethod: 'Bank transfer', receivedBy: 'TREAS', branchCode: 'MNL', bondType: 'New', recordedAt: ago(422),
        notes: 'Refunded in full by bank transfer after the contract expired — all units returned, nothing owed (BR-14).',
        withdrawals: [{ id: 'CBW-6', amount: 15000, reason: 'Contract expired; all units returned and nothing owed', refundable: 15000, workflowId: 'WF-CBW-6', status: 'Refunded', requestedAt: ago(238),
          refund: { method: 'Bank transfer', date: ago(226).slice(0, 10), reference: 'RF-2026-0041', by: 'ACCTG' } }] },
      { id: 'CB-7', clientCode: 'C-00123', contractNo: 'SPL-2025-0007', amount: 10000, dateReceived: ago(562).slice(0, 10), receiptRef: 'OR-MNL-00000142', status: 'Applied', paymentMethod: 'Check', receivedBy: 'TREAS', branchCode: 'MNL', bondType: 'New', recordedAt: ago(562), withdrawals: [],
        notes: 'Applied in full to the final Spot List bill INV-MNL-00000987 at termination (BR-14: what is owed is deducted first); nothing left to refund.' },
      { id: 'CB-8', clientCode: 'C-00201', contractNo: 'LTL-2025-0031', amount: 10000, dateReceived: ago(432).slice(0, 10), receiptRef: 'OR-CEB-00000012', status: 'Withdrawal Pending', paymentMethod: 'Bank transfer', bankRef: 'MBTC-TRF-31007', receivedBy: 'ACCTG', branchCode: 'CEB', bondType: 'New', recordedAt: ago(432),
        withdrawals: [{ id: 'CBW-8', amount: 8880, reason: 'Contract ended — refund of the bond less the unpaid balance (₱1,120)', refundable: 8880, workflowId: 'WF-CBW-8', status: 'Pending', requestedAt: ago(6) }] },
      { id: 'CB-9', clientCode: 'C-00201', contractNo: 'QLP-2025-0022', amount: 10000, dateReceived: ago(302).slice(0, 10), receiptRef: 'OR-CEB-00000027', status: 'Withdrawal Pending', paymentMethod: 'Check', checkNo: '0045519', checkBank: 'Metrobank', checkDate: ago(302).slice(0, 10), receivedBy: 'ACCTG', branchCode: 'CEB', bondType: 'New', recordedAt: ago(302),
        withdrawals: [{ id: 'CBW-9', amount: 10000, reason: 'Contract ended — all units returned, nothing owed at the time of request', refundable: 10000, workflowId: 'WF-CBW-9', status: 'Approved — awaiting refund', requestedAt: ago(15) }] },
      // Review 1.2: every bond carries its payment method, who received it, its branch and when it was recorded.
      { id: 'CB-1', clientCode: 'C-00123', contractNo: 'LTL-2026-0045', amount: 20000, dateReceived: ago(205).slice(0, 10), receiptRef: 'OR-MNL-00000301', status: 'Held', withdrawals: [],
        paymentMethod: 'Cash', receivedBy: 'ACCTG', branchCode: 'MNL', bondType: 'New', recordedAt: ago(205), receiptFile: 'OR-MNL-00000301.pdf', notes: 'Cash deposit for LTL-2026-0045, paid at signing.' },
      { id: 'CB-2', clientCode: 'C-00188', contractNo: 'SPL-2026-0012', amount: 20000, dateReceived: ago(190).slice(0, 10), receiptRef: 'OR-MNL-00000318', status: 'Held', withdrawals: [],
        paymentMethod: 'Check', checkNo: '0011820', checkBank: 'RCBC', checkDate: ago(190).slice(0, 10), receivedBy: 'ACCTG', branchCode: 'MNL', bondType: 'New', recordedAt: ago(190) },
      { id: 'CB-3', clientCode: 'C-00201', contractNo: 'LTL-2026-0051', amount: 20000, dateReceived: ago(180).slice(0, 10), receiptRef: 'OR-CEB-00000044', status: 'Withdrawal Pending',
        paymentMethod: 'Bank transfer', bankRef: 'MBTC-TRF-40211', receivedBy: 'ACCTG', branchCode: 'CEB', bondType: 'New', recordedAt: ago(180),
        withdrawals: [{ id: 'CBW-1', amount: 18880, reason: 'Client consolidating fleet; requests early release of the bond', refundable: 18880, workflowId: 'WF-CBW-1', status: 'Pending', requestedAt: ago(2), earlyException: true }] },
      // Review 1.1: every contract has a bond on file (Metro and Southern Haulers were missing). Southern Haulers' contract has expired, so its bond is refundable.
      // Review 1.2: Metro's bond was received when its LTL contract was signed (contract now starts 305 days ago); its own check number (004512 is ABC's receipt check).
      { id: 'CB-4', clientCode: 'C-00230', contractNo: 'LTL-2026-0060', amount: 20000, dateReceived: manilaDay(ago(310)), receiptRef: 'OR-MNL-00000296', status: 'Held', paymentMethod: 'Check', checkNo: '0078841', checkBank: 'BPI', checkDate: manilaDay(ago(310)), receivedBy: 'ACCTG', branchCode: 'MNL', bondType: 'New', recordedAt: ago(310), withdrawals: [] },
      { id: 'CB-5', clientCode: 'C-00215', contractNo: 'QLP-2026-0007', amount: 20000, dateReceived: manilaDay(ago(202)), receiptRef: 'OR-BTG-00000031', status: 'Held', paymentMethod: 'Bank transfer', bankRef: 'LBP-TRF-10377', receivedBy: 'ACCTG', branchCode: 'BTG', bondType: 'New', recordedAt: ago(202), withdrawals: [] },
    ],
    salesActivities: Array.from({ length: 24 }, (_, i) => ({ id: `SA-${i}`, aeUserId: clients[i % 5].aeAssigned, clientCode: clients[i % 5].clientCode, type: i % 3 ? 'Call' as const : 'Visit' as const, date: manilaDay(ago(i * 2)),
      // Review 1.2: a visit's location is the client's own office (Southern Haulers is in Batangas City, not Port Area); calls carry the branch and next action.
      at: ago(i * 2), loggedAt: ago(i * 2 - (i % 5 === 4 ? 3 : 0)), businessType: clients[i % 5].industry ?? 'Trucking', location: i % 3 ? 'Phone' : `Client office, ${clients[i % 5].address1}, ${clients[i % 5].city}`, outcome: (['Interested', 'Follow-up needed', 'Quote sent'] as const)[i % 3],
      branchCode: clients[i % 5].branchCode, loggedBy: clients[i % 5].aeAssigned, nextAction: i % 3 === 1 ? 'Call back with updated availability' : i % 3 === 2 ? 'Follow up on the quotation' : undefined, followUpOwner: i % 3 ? clients[i % 5].aeAssigned : undefined,
      expectedUnits: i % 3 === 2 ? 2 + (i % 4) : undefined })),
    chassis,
    assets: [
      // SCR-13 review: PM interval is set per asset (Next PM = last maintenance + interval); PM is suspended while Under Repair.
      { assetId: 'AST-FL-001', category: 'Forklift', description: 'Forklift 3T diesel', branchCode: 'MNL', location: 'Manila Yard — Bay 2', status: 'In-Use', assignedTo: 'Dept: Yard Operations', qty: 1, uom: 'unit', serialNo: 'FD30-8812345', make: 'Toyota', model: '8FD30', condition: 'Good', pmIntervalDays: 90, qrCode: 'QR-AST-FL-001',
        // Staff review 1.2: quarterly (90-day) PM like the reach stacker; maintenance log carries who did the work, cost and the hour-meter reading.
        statusSince: ago(800), pmResponsible: 'APS.OFF', meterHours: 4310,
        acquisitionDate: ago(800).slice(0, 10), lastMaintenanceDate: ago(86).slice(0, 10), nextPmDate: ahead(4).slice(0, 10), maintenanceLog: [{ date: ago(86).slice(0, 10), type: 'Preventive', notes: '250-hour service: oil, filters, hydraulic check', by: 'APS.OFF', performedBy: 'Toyota Material Handling (service van)', cost: 8650, meterHours: 4310 }, { date: ago(176).slice(0, 10), type: 'Preventive', notes: 'Quarterly PM', by: 'APS.OFF', performedBy: 'In-house mechanic', cost: 3200, meterHours: 4060 }] },
      { assetId: 'AST-HE-002', category: 'Heavy Equipment', description: 'Reach stacker', branchCode: 'MNL', location: 'Manila Yard — Container stack A', status: 'Available', assignedTo: 'Dept: Yard Operations', qty: 1, uom: 'unit', serialNo: 'RS45-00981', make: 'Kalmar', model: 'DRG450', condition: 'Good', pmIntervalDays: 90, qrCode: 'QR-AST-HE-002',
        acquisitionDate: ago(1200).slice(0, 10), lastMaintenanceDate: ago(30).slice(0, 10), nextPmDate: ahead(60).slice(0, 10), maintenanceLog: [{ date: ago(30).slice(0, 10), type: 'Preventive', notes: '500-hour service', by: 'APS.OFF' }] },
      { assetId: 'AST-WM-003', category: 'Welding Machine', description: 'Inverter welder 300A', branchCode: 'CEB', location: 'Cebu Depot — R&M shop', status: 'Under Repair', assignedTo: 'Dept: Repair & Maintenance', qty: 1, uom: 'unit', serialNo: 'WX300-55120', make: 'Lincoln', model: 'Invertec 300', condition: 'Poor', pmIntervalDays: 60, qrCode: 'QR-AST-WM-003',
        statusSince: ago(10), acquisitionDate: ago(600).slice(0, 10), lastMaintenanceDate: ago(10).slice(0, 10), maintenanceLog: [{ date: ago(10).slice(0, 10), type: 'Corrective', notes: 'No arc output — control board sent for repair; PM suspended until returned', by: 'BG.CEB', performedBy: 'Lincoln service centre, Cebu (quote pending)' }] },
      { assetId: 'AST-DT-004', category: 'Depot Tool', description: 'Pneumatic impact wrench 3/4"', branchCode: 'BTG', location: 'Batangas Depot — tool crib', status: 'Available', assignedTo: 'Dept: Repair & Maintenance', qty: 6, uom: 'pc', make: 'Ingersoll Rand', model: '2135TiMAX', condition: 'Fair', pmIntervalDays: 180, qrCode: 'QR-AST-DT-004',
        acquisitionDate: ago(300).slice(0, 10), lastMaintenanceDate: ago(120).slice(0, 10), nextPmDate: ahead(60).slice(0, 10) },
      { assetId: 'AST-ST-005', category: 'Stockroom Tool', description: 'Pallet jack 2.5T', branchCode: 'MNL', location: 'Manila stockroom', status: 'Retired', qty: 1, uom: 'unit', make: 'Generic', model: 'PJ-25', condition: 'Unserviceable', qrCode: 'QR-AST-ST-005', acquisitionDate: ago(2000).slice(0, 10),
        notes: 'Retired after hydraulic pump failure; disposal requested.', disposal: { action: 'Dispose', reason: 'Beyond economic repair — sell as scrap', workflowId: 'WF-AST-1', status: 'Pending Approval', requestedAt: ago(1) } },
      { assetId: 'AST-ST-006', category: 'Stockroom Tool', description: 'Platform scale 300 kg', branchCode: 'CEB', location: 'Cebu stockroom', status: 'Disposed', qty: 1, uom: 'unit', make: 'Generic', model: 'TCS-300', condition: 'Unserviceable', qrCode: 'QR-AST-ST-006', acquisitionDate: ago(2400).slice(0, 10),
        notes: 'Disposed — sold as scrap (approved).', disposal: { action: 'Dispose', reason: 'Load cell failed; replaced by new scale', workflowId: 'WF-00003', status: 'Approved', requestedAt: ago(40) } },
      { assetId: 'AST-ST-007', category: 'Stockroom Tool', description: 'Socket wrench set', branchCode: 'MNL', location: 'Manila stockroom — Shelf C2', status: 'In-Use', assignedTo: 'WH.MNL', qty: 4, uom: 'set', make: 'Stanley', model: 'STMT74181', condition: 'Good', qrCode: 'QR-AST-ST-007', acquisitionDate: ago(400).slice(0, 10),
        // V1.4 row 50: issue / return history — 4 sets held by the stockroom custodian; 2 out now (1 with the technician, 1 with R&M), 2 on the shelf.
        issues: [
          { id: 'TI-0003', issuedTo: 'Dept: Repair & Maintenance', qty: 1, issuedAt: ago(5), issuedBy: 'WH.MNL', purpose: 'JO-NVL-000498 lamp replacement', conditionOut: 'Good', dueBack: manilaDay(ahead(2)), returns: [] },
          { id: 'TI-0002', issuedTo: 'TECH.MNL', qty: 2, issuedAt: ago(20), issuedBy: 'WH.MNL', purpose: 'Yard brake-lining jobs (two crews)', conditionOut: 'Good', returns: [{ qty: 1, at: ago(10), by: 'WH.MNL', condition: 'Good', notes: 'Second crew finished' }] },
          { id: 'TI-0001', issuedTo: 'BG.MNL', qty: 1, issuedAt: ago(30), issuedBy: 'WH.MNL', purpose: 'Spot repair at the gate', conditionOut: 'Good', returns: [{ qty: 1, at: ago(28), by: 'WH.MNL', condition: 'Fair', notes: 'One 14 mm socket worn — still usable' }] },
        ] },
    ],
    ewas: [
      { euNo: 'EU-000781', clientCode: 'C-00123', contractNo: 'LTL-2026-0045', branchCode: 'MNL', driverName: 'Juan Dela Cruz', driverLicenseNo: 'N01-23-456789', truckPlateNo: 'NAB 5678', trucker: 'XYZ Trucking',
        units: [{ equipmentType: 'EQ1', qty: 1, usedChassis: [] }], createdAt: addHours(now(), -3), validUntil: addHours(now(), 21), createdVia: 'Portal', status: 'Active', extensionCount: 0, createdBy: 'client@abclogistics.ph' },
      // Expired portal EWA so the client portal shows the "Request extension" path (portal review, DBL-GAT-003).
      { euNo: 'EU-000770', clientCode: 'C-00123', contractNo: 'LTL-2026-0045', branchCode: 'MNL', driverName: 'Mario Reyes', driverLicenseNo: 'N02-15-334455', truckPlateNo: 'NAB 5679', trucker: 'XYZ Trucking',
        units: [{ equipmentType: 'EQ2', qty: 1, usedChassis: [] }], createdAt: addHours(now(), -40), validUntil: addHours(now(), -16), createdVia: 'Portal', status: 'Expired', extensionCount: 0, createdBy: 'client@abclogistics.ph' },
      // Review 1.1: the cancelled EWA in the Audit log is EU-000765 (not EU-000770, which simply expired) — shown with the Cancelled status in the portal.
      { euNo: 'EU-000765', clientCode: 'C-00123', contractNo: 'LTL-2026-0045', branchCode: 'CAV', driverName: 'Ramil Santos', driverLicenseNo: 'N04-18-998877', truckPlateNo: 'NAB 5612', trucker: 'XYZ Trucking',
        units: [{ equipmentType: 'EQ1', qty: 1, usedChassis: [] }], createdAt: addHours(now(), -60), validUntil: addHours(now(), -36), createdVia: 'Portal', status: 'Cancelled', extensionCount: 0, createdBy: 'client@abclogistics.ph',
        cancelledAt: addHours(now(), -58), cancelledBy: 'BG.MNL', cancelReason: 'Client cancelled the pickup — trucker unavailable' },
      { euNo: 'EU-000779', clientCode: 'C-00230', contractNo: 'LTL-2026-0060', branchCode: 'MNL', driverName: 'Pedro Penduko', driverLicenseNo: 'N02-11-000111', truckPlateNo: 'NCR 1122', trucker: 'Metro Haul',
        // Review 1.1: the EWA in My approvals (WF-EWX-2) — created before the extension request, now Extension Pending at the IT revalidation step.
        units: [{ equipmentType: 'EQ2', qty: 2, usedChassis: [] }], createdAt: addHours(now(), -31), validUntil: addHours(now(), -7), createdVia: 'Internal', status: 'Extension Pending', extensionCount: 0, createdBy: 'AE.JREYES' },
      { euNo: 'EU-000776', clientCode: 'C-00201', contractNo: 'LTL-2026-0051', branchCode: 'CEB', driverName: 'Ramon Cruz', driverLicenseNo: 'G03-19-224466', truckPlateNo: 'GAB 3301', trucker: 'Visayas Trucking',
        units: [{ equipmentType: 'EQ3', qty: 1, usedChassis: [] }], createdAt: addHours(now(), -32), validUntil: addHours(now(), -8), createdVia: 'Internal', status: 'Extension Pending', extensionCount: 0, createdBy: 'AE.JREYES' },
      ...histEwas,
    ],
    gatePasses, eirs, lateEncodings,
    jobOrders: [...extraJos,
      // Review 1.2: the JO prefix is the chassis home branch (as the system issues it) — these two Navotas units now read JO-NVL-… (were JO-MNL-…).
      { joNo: 'JO-NVL-000512', chassisNo: breakdown.chassisNo, branchCode: breakdown.branchCode, source: 'Gate In', sourceRef: 'Gate-in inspection (EIR on return)', categories: ['Tires', 'Brakes'], notes: 'Two flat tires, worn brake lining found at gate-in inspection.', workers: ['Laborer A', 'Laborer B'],
        status: 'Draft', isMajor: false, chargeable: true, chargeClientCode: 'C-00123', estimatedCost: 11900, priority: 'Normal', targetDate: manilaDay(ahead(3)), photos: ['jo512-tires.jpg', 'jo512-brake-lining.jpg'],
        bom: [], labor: [], createdAt: ago(1), createdBy: 'BG.MNL', history: [{ at: ago(1), by: 'BG.MNL', status: 'Draft', note: 'Created' }] },
      { joNo: 'JO-NVL-000498', chassisNo: inRepair.chassisNo, branchCode: inRepair.branchCode, source: 'Scheduled', sourceRef: 'Preventive maintenance plan (Nov)', categories: ['Painting', 'Electrical'], notes: 'Scheduled repaint and lamp replacement.', workers: ['Laborer C'],
        status: 'Ongoing', isMajor: false, chargeable: false, priority: 'Normal', targetDate: manilaDay(ahead(2)), estimatedCost: 6800, photos: ['jo498-body-before.jpg'],
        bom: [{ partCode: 'PNT-PRIM', description: 'Primer paint (gal)', qty: 3, unitCost: 1350 }, { partCode: 'ELC-LAMP', description: 'Tail lamp assembly', qty: 2, unitCost: 950 }],
        labor: [{ worker: 'Laborer C', hours: 6, rate: 95, date: ago(2).slice(0, 10), shift: 'Morning' }], createdAt: ago(5), createdBy: 'BG.MNL', approvedBy: 'BG.MNL', confirmedBy: 'DYM.MNL',
        history: [{ at: ago(5), by: 'BG.MNL', status: 'Draft', note: 'Created' }, { at: addHours(ago(5), 1.5), by: 'BG.MNL', status: 'Approved' }, { at: addHours(ago(5), 4), by: 'DYM.MNL', status: 'Confirmed' }, { at: addHours(ago(4), 1), by: 'BG.MNL', status: 'Ongoing', note: 'Work started' }] },
      { joNo: 'JO-MNL-000470', chassisNo: chassis[0].chassisNo, branchCode: chassis[0].branchCode, source: 'Gate In', categories: ['Suspension'], notes: 'Leaf spring replaced.', workers: ['Laborer A', 'Laborer B'], // cross-check: both laborers on its labor lines / Laborer summary
        status: 'Closed by R&M', isMajor: false, chargeable: false, bom: [{ partCode: 'SUS-LEAF', description: 'Leaf spring assembly', qty: 1, unitCost: 9800 }], labor: [{ worker: 'Laborer A', hours: 4, rate: 95, date: ago(12).slice(0, 10), shift: 'Morning' }, { worker: 'Laborer B', hours: 3, rate: 110, date: ago(12).slice(0, 10), shift: 'Afternoon' }], createdAt: ago(14), createdBy: 'BG.MNL', approvedBy: 'BG.MNL', confirmedBy: 'DYM.MNL', closedAt: ago(11) }, // a closed JO was approved and confirmed
      ...repairJos,
    ],
    rescues: [
      { rescueNo: 'RSC-000041', clientCode: 'C-00123', chassisNo: onHire[0]?.chassisNo ?? '', locationText: 'SLEX northbound km 32, near Sta. Rosa exit', incident: 'Blown tire, rear axle', sceneContactName: 'Juan Dela Cruz', sceneContactPhone: '+63 917 222 3344',
        urgent: true, status: 'Requested', requestedAt: addHours(now(), -1), requestedVia: 'Portal', branchCode: 'MNL', chargeable: true,
        problemType: 'Flat / blown tire', loadStatus: 'Loaded', photos: ['rsc41-blown-tire.jpg', 'rsc41-location.jpg'], requestedBy: 'client@abclogistics.ph' }, // review 1.1: load status was blank
      // Review 1.1: RSC-000020 is the ₱18,048.80 e-wallet deduction (EWT-2). BR-11: travel 20 km × 2 × ₱50 = 2,000 + parts 12,650 (BRK-DRUM 8,280 + BRK-PAD 4,370)
      // = 14,650 + 10% service 1,465 = 16,115 + 12% VAT 1,933.80 = 18,048.80.
      { rescueNo: 'RSC-000020', clientCode: 'C-00123', chassisNo: onHire.filter((c) => c.currentClientCode === 'C-00123')[1]?.chassisNo ?? onHire[0]?.chassisNo ?? '', locationText: 'NLEX northbound km 40, Marilao', incident: 'Brake drum cracked, rear axle locking',
        sceneContactName: 'Juan Dela Cruz', sceneContactPhone: '+63 917 222 3344', urgent: false, status: 'Completed', requestedAt: addHours(ago(60), -5), requestedVia: 'Portal', branchCode: 'MNL', problemType: 'Brake problem', requestedBy: 'client@abclogistics.ph',
        verifiedBy: 'CNC.OFF1', confirmedBy: 'AE.JREYES', crew: 'In-house crew', rescueVehicle: 'Service van NCR 4521', driverName: 'Romeo Santos', driverPhone: '+63 917 555 0101',
        dispatchedAt: addHours(ago(60), -4.5), eta: addHours(ago(60), -3.5), completedAt: addHours(ago(60), -1),
        chargeable: true, oneWayKm: 20, ratePerKm: 50, tireCost: 0, partsCost: 12650, total: 18048.8, debitMemoNo: 'DM-000021', loadStatus: 'Empty', photos: ['rsc20-brake.jpg'],
        costLines: [{ kind: 'Part', partCode: 'BRK-DRUM', description: 'Brake drum', qty: 1, unitPrice: 8280 }, { kind: 'Part', partCode: 'BRK-PAD', description: 'Brake lining set', qty: 1, unitPrice: 4370 }],
        onsiteAssessment: 'Cracked rear brake drum; drum and lining replaced on site.', beforePhotos: ['rsc20-before.jpg'], afterPhotos: ['rsc20-after.jpg'], clientAckName: 'Juan Dela Cruz', acknowledgedAt: addHours(ago(60), -1), ewalletBalanceAfter: 11951.2 },
      { rescueNo: 'RSC-000038', clientCode: 'C-00230', chassisNo: onHire[3]?.chassisNo ?? '', locationText: 'C5 Road, Taguig', incident: 'Brake lock', sceneContactName: 'Pedro Penduko', sceneContactPhone: '+63 917 111 2233',
        urgent: false, status: 'Completed', requestedAt: ago(6), requestedVia: 'Internal', requestedBy: 'AE.JREYES', problemType: 'Brake problem', branchCode: 'MNL', crew: 'Roadside Rescue Partners', dispatchedAt: addHours(ago(6), 0.5), completedAt: addHours(ago(6), 3.25),
        // BR-11: travel 18 km × 2 × ₱50 = 1,800 + parts 4,370 (BRK-PAD rescue price) = 6,170 + 10% = 6,787 + 12% VAT = 7,601.44
        chargeable: true, oneWayKm: 18, ratePerKm: 50, tireCost: 0, partsCost: 4370, total: 7601.44, debitMemoNo: 'DM-000040', verifiedBy: 'CNC.OFF1', confirmedBy: 'AE.JREYES',
        // Review 1.2: a vendor job uses the vendor's own truck and driver (the in-house service van / Romeo Santos is RSC-000020).
        loadStatus: 'Loaded', photos: ['brake-lock-scene.jpg'], rescueVehicle: 'Tow truck RRP-07 (NDE 3310)', driverName: 'Allan Garcia', driverPhone: '+63 917 888 1200',
        costLines: [{ kind: 'Part', partCode: 'BRK-PAD', description: 'Brake lining set', qty: 1, unitPrice: 4370 }], onsiteAssessment: 'Rear brake seized; lining replaced on site, unit driven to yard.',
        beforePhotos: ['rsc38-before-1.jpg'], afterPhotos: ['rsc38-after-1.jpg'], clientAckName: 'Pedro Penduko', acknowledgedAt: addHours(ago(6), 3.25), ewalletBalanceAfter: 9398.56 },
      { rescueNo: 'RSC-000040', clientCode: 'C-00123', chassisNo: onHire[5]?.chassisNo ?? '', locationText: 'NLEX southbound km 21, Valenzuela', incident: 'Flat tire, front axle', sceneContactName: 'Mark Villanueva', sceneContactPhone: '+63 917 333 4455',
        // Review 1.2: Branch = the dispatching branch nearest the scene (Valenzuela → MNL), not the chassis home branch.
        urgent: true, status: 'Cancelled', requestedAt: ago(2), requestedVia: 'Portal', requestedBy: 'client@abclogistics.ph', problemType: 'Flat / blown tire', branchCode: 'MNL', chargeable: true, loadStatus: 'Empty', urgentAckBy: 'OPSMGR', urgentAckAt: addHours(ago(2), 0.2),
        cancelReason: 'Client driver fixed the tire on site; rescue no longer needed.', cancelledBy: 'OPSMGR', cancelledAt: addHours(ago(2), 0.75) },
      // Hold client blocked at intake (BR-01): logged for audit, never reaches C&C verification.
      { rescueNo: 'RSC-000037', clientCode: 'C-00188', chassisNo: onHire[1]?.chassisNo ?? '', locationText: 'Marcos Highway, Antipolo', incident: 'Air leak, brakes locked', sceneContactName: 'Leo Navarro', sceneContactPhone: '+63 917 777 8899',
        urgent: false, status: 'Blocked', blockedReason: 'Pacific Movers Corp. is ON HOLD for overdue balance. Chassis release, gate pass, repair scheduling and new services are blocked (BR-01).', blockedAt: addHours(now(), -5), requestedAt: addHours(now(), -5), requestedVia: 'Portal', requestedBy: 'client@pacificmovers.ph', problemType: 'Brake problem', branchCode: 'MNL', chargeable: true, loadStatus: 'Loaded' },
      { rescueNo: 'RSC-000039', clientCode: 'C-00201', chassisNo: onHire[2]?.chassisNo ?? '', locationText: 'CAVITEX km 14, Kawit', incident: 'Landing leg damaged, cannot detach', sceneContactName: 'Ramon Cruz', sceneContactPhone: '+63 917 444 5566',
        // Review 1.2: dispatched from Cavite (the scene is CAVITEX Kawit and the wrecker is CAV-02); the chassis home branch stays MNL.
        urgent: false, status: 'Dispatched', requestedAt: addHours(now(), -3), requestedVia: 'Internal', requestedBy: 'AE.JREYES', problemType: 'Mechanical breakdown', branchCode: 'CAV', chargeable: true, loadStatus: 'Loaded', verifiedBy: 'CNC.OFF1', confirmedBy: 'AE.JREYES',
        crew: 'In-house crew', rescueVehicle: 'Wrecker CAV-02 (NBC 7788)', driverName: 'Jun Reyes', driverPhone: '+63 917 666 7788', dispatchedAt: addHours(now(), -2.5) },
    ],
    parts, stock, stockTxns,
    vendors,
    prs: [{ prNo: 'PR-000210', department: 'Operations', requestedBy: 'BG.MNL', justification: 'Replenish tires for rescue and repair stock (low stock).', entityCode: 'DBL', lines: [{ partCode: 'TIR-1100', description: 'Tire 11R22.5 radial', qty: 20, estUnitCost: 14500, uom: 'pc', standardCost: 14500, supplierId: 'V-001' }], status: 'For Approval', workflowId: 'WF-PR-1', createdAt: ago(2),
      supplierId: 'V-001', neededBy: ahead(10).slice(0, 10), priority: 'Urgent', deliveryWarehouse: 'WH-MNL', stockRef: 'Low stock · TIR-1100 @ WH-MNL', attachments: ['quote-tirepro-2026-10.pdf'] },
      // Staff UI changes V1.4 (row 10): a PR already at the FINAL step (above the BR-09 threshold) — CEO and CHRO each sign separately; both are pending.
      { prNo: 'PR-000209', department: 'Repair & Maintenance', requestedBy: 'DEPTHEAD', justification: 'Brake drums and leaf springs for the Q1 preventive maintenance plan (all branches).', entityCode: 'DBL',
        lines: [{ partCode: 'BRK-DRUM', description: 'Brake drum', qty: 25, estUnitCost: 7200, uom: 'pc', standardCost: 7200, supplierId: 'V-002' }, { partCode: 'SUS-LEAF', description: 'Leaf spring assembly', qty: 14, estUnitCost: 9800, uom: 'pc', standardCost: 9800, supplierId: 'V-002' }],
        status: 'For Approval', workflowId: 'WF-PR-0', createdAt: ago(6), supplierId: 'V-002', neededBy: ahead(21).slice(0, 10), priority: 'Normal', deliveryWarehouse: 'WH-MNL', attachments: ['quote-axlebrake-2026-11.pdf'] }],
    pos: [{ poNo: 'PO-000155', prNo: 'PR-000190', vendorId: 'V-002', terms: '15 days', deliveryDate: ahead(5).slice(0, 10), entityCode: 'DBL', status: 'Issued', createdAt: ago(10), lines: [{ partCode: 'BRK-PAD', description: 'Brake lining set', qty: 30, unitPrice: 3700, qtyReceived: 0 }, { partCode: 'BRK-DRUM', description: 'Brake drum', qty: 10, unitPrice: 7000, qtyReceived: 0 }] },
      // One open PO for the demo vendor (vendor@tirepro.ph) so the portal upload-invoice dialog can be shown.
      { poNo: 'PO-000154', prNo: 'PR-000189', vendorId: 'V-001', terms: '30 days', deliveryDate: ahead(7).slice(0, 10), entityCode: 'DBL', status: 'Issued', createdAt: ago(6), lines: [{ partCode: 'TIR-1100', description: 'Tire 11R22.5 radial', qty: 8, unitPrice: 14500, qtyReceived: 0 }] },
      { poNo: 'PO-000149', prNo: 'PR-000184', vendorId: 'V-002', terms: '15 days', deliveryDate: manilaDay(ago(9)), entityCode: 'DBL', status: 'Received', createdAt: ago(20), lines: [{ partCode: 'SUS-LEAF', description: 'Leaf spring assembly', qty: 8, unitPrice: 9800, qtyReceived: 8 }] }],
    // Review 1.1: RR-000059 / PO-000149 are referenced by ledger row STK-000111 (+8 leaf springs) — now on the Procurement tabs too.
    rrs: [{ rrNo: 'RR-000059', poNo: 'PO-000149', receivedDate: manilaDay(ago(9)), receivedBy: 'WH.MNL', warehouseCode: 'WH-MNL', lines: [{ partCode: 'SUS-LEAF', qtyReceived: 8, qtyRejected: 0, condition: 'Good' }], conditionNotes: 'Complete delivery, no damage', discrepancy: false }],
    vendorInvoices: [{ id: 'VI-1', vendorId: 'V-002', invoiceNo: 'ABP-2026-0911', invoiceDate: ago(1).slice(0, 10), amount: 181000, poNo: 'PO-000155', status: 'Under Review', submittedVia: 'Internal', submittedAt: ago(1) }],
    paymentRequests: [{ docNo: 'PCV-000088', type: 'PCV', referenceType: 'Justification', referenceId: '-', justification: 'Urgent fuses and tape for gate lighting', payee: 'Local hardware', amount: 1850, dueDate: ahead(2).slice(0, 10), entityCode: 'DBL', status: 'Approved', createdAt: ago(1),
      department: 'Operations', requestedBy: 'BG.MNL', fundingSource: 'Petty Cash Fund', lines: [{ description: 'Fuses (box of 10)', category: 'Repairs & maintenance supplies', amount: 650 }, { description: 'Electrical tape and wire nuts', category: 'Repairs & maintenance supplies', amount: 1200 }] }],
    invoices,
    receipts: [...billingReceipts,
      // DBL-EWL-001 demo: Treasury-cleared PR for Southern Haulers' initial e-wallet funding (no wallet yet)
      // Staff review 1.2: numbered in date order (PR-BTG-00000453 → OR-BTG-00000454), recorded by Accounting and cleared by Treasury (segregation of duties),
      // marked as e-wallet funding so it is not unapplied AR credit — Southern's INV-BTG-00000122 balance ₱41,680 is correct.
      { receiptNo: 'PR-BTG-00000453', orNo: 'OR-BTG-00000454', prNo: 'PR-BTG-00000453', type: 'OR', clientCode: 'C-00215', date: ago(1.4).slice(0, 10), createdAt: ago(1.4), amount: 15000, method: 'Bank Transfer', bank: 'BPI', reference: 'BPI 778120', applications: [], unapplied: 15000, by: 'ACCTG', status: 'OR Issued', depositStatus: 'Cleared',
        clearedBy: 'TREAS', clearedAt: ago(1).slice(0, 10), orIssuedAt: ago(1), purpose: 'E-wallet funding', branchCode: 'BTG', tin: clients.find((c) => c.clientCode === 'C-00215')?.tin, notes: 'Initial e-wallet funding (DBL-EWL-001) — not applied to invoices',
        history: [{ at: ago(1.4), by: 'ACCTG', action: 'PR recorded', note: 'Initial e-wallet funding' }, { at: ago(1), by: 'TREAS', action: 'Clearance confirmed — OR-BTG-00000454 issued' }] }],
    memos: [...billingMemos, { memoNo: 'DM-000021', type: 'Debit', clientCode: 'C-00123', referenceType: 'Rescue', referenceId: 'RSC-000020', amount: 18048.8, reason: 'Rescue charge (BR-11)', status: 'Posted', createdAt: ago(60), vatTreatment: 'VAT-inclusive', settlement: 'E-wallet' }, { memoNo: 'DM-000039', type: 'Debit', clientCode: 'C-00123', referenceType: 'Park & Fix', referenceId: 'PF-2', amount: 2800, reason: 'Park & Fix ABC-CH-2210 — 8 day(s) × ₱350 (DBL-ALO-005)', status: 'Posted', createdAt: ago(12), vatTreatment: 'VAT-exclusive', settlement: 'Next invoice' }, { memoNo: 'DM-000040', type: 'Debit', clientCode: 'C-00230', referenceType: 'Rescue', referenceId: 'RSC-000038', amount: 7601.44, reason: 'Rescue charge (BR-11)', status: 'Posted', createdAt: ago(6), vatTreatment: 'VAT-inclusive', settlement: 'E-wallet' }],
    // Review 1.1: placed the day the invoice passed 30 days overdue (31 days at hold; the list shows today's age separately).
    holdEvents: [{ id: 'HE-1', clientCode: 'C-00188', type: 'Auto Hold', at: ago(14), by: 'system', outstanding: 308000, daysOverdue: 31, invoiceNo: 'INV-MNL-00001050', reason: 'Invoice INV-MNL-00001050 unpaid 31 days past due at hold (BR-02)' },
      // V1.4 row 11: the holds lifted by the Tier 1 and Tier 3 examples (each reactivation names its approvers and workflow).
      { id: 'HE-T1A', clientCode: 'C-00230', type: 'Auto Hold', at: ago(122), by: 'system', outstanding: 64800, daysOverdue: 31, reason: 'Balance unpaid 31 days past due at hold (BR-02)' },
      { id: 'HE-T1B', clientCode: 'C-00230', type: 'Reactivated', at: ago(119.8), by: 'CNC.OFF1', outstanding: 64800, reason: 'Hold lift approved — Tier 1 — Officer 1', approvedBy: 'CNC.OFF1', workflowId: 'WF-HL-T1' },
      { id: 'HE-T3A', clientCode: 'C-00123', type: 'Auto Hold', at: ago(262), by: 'system', outstanding: 560000, daysOverdue: 33, reason: 'Balance unpaid 33 days past due at hold (BR-02)' },
      { id: 'HE-T3B', clientCode: 'C-00123', type: 'Reactivated', at: ago(258.5), by: 'EXEC.OFF3', outstanding: 560000, reason: 'Hold lift approved — Tier 3 — Officers 1, 2 and 3', approvedBy: 'CNC.OFF1, EXEC.OFF2, EXEC.OFF3', workflowId: 'WF-HL-T3' }],
    collections: [
      { clientCode: 'C-00188', stage: '2nd Reminder', stageChangedAt: ago(4), nextActionDue: ahead(6).slice(0, 10), acknowledgedAt: ago(13), soaSends: [{ id: 'SS-1', soaNo: 'SOA-2026-00301', at: ago(14), by: 'CNC.OFF1', channel: 'Email', to: 'ap@pacificmovers.ph' }],
        // Staff review 1.2: collection owner, last contact and a promise to pay.
        ownerUserId: 'CNC.OFF1', lastContactAt: ago(3), promiseToPay: { date: manilaDay(ahead(5)), amount: 106400, recordedAt: ago(3), by: 'CNC.OFF1', notes: 'AP head promised to settle INV-MNL-00001068 first, then a plan for INV-MNL-00001050' },
        actions: [{ at: ago(3), action: `Client contact (Phone) — promise to pay ₱106,400 by ${manilaDay(ahead(5))}`, by: 'CNC.OFF1', notes: 'AP head promised to settle INV-MNL-00001068 first' }, { at: ago(4), action: '2nd Reminder', by: 'system' }, { at: ago(9), action: '1st Reminder', by: 'system' }, { at: ago(13), action: 'SOA acknowledged by client', by: 'CNC.OFF1' }, { at: ago(14), action: 'SOA Sent', by: 'CNC.OFF1', notes: 'SOA-2026-00301 by email' }] },
      // V1.4 row 48: the courier SOA carries the courier, the named recipient and the delivery result with proof of delivery.
      { clientCode: 'C-00215', stage: 'SOA Sent', stageChangedAt: ago(7), nextActionDue: ago(2).slice(0, 10), soaSends: [{ id: 'SS-2', soaNo: 'SOA-2026-00310', at: ago(7), by: 'CNC.OFF1', channel: 'Courier', to: 'Southern Haulers Co., Batangas City', trackingNo: 'LBC 7781-2201',
        courier: 'LBC Express', recipientName: 'Accounts Payable — Southern Haulers Co.', delivery: { status: 'Delivered', at: ago(5).slice(0, 10), receivedBy: 'R. Mendoza (AP clerk)', podFile: 'LBC-7781-2201-POD.jpg', recordedBy: 'CNC.OFF1' } }],
        ownerUserId: 'CNC.OFF1', actions: [{ at: ago(4.5), action: 'SOA SOA-2026-00310 — delivered (received by R. Mendoza (AP clerk))', by: 'CNC.OFF1', notes: 'LBC proof of delivery attached' }, { at: ago(7), action: 'SOA Sent', by: 'CNC.OFF1', notes: 'SOA-2026-00310 by courier' }] },
      // V1.4 row 49 (CNC-006): a client that reached the last step — the Legal department's final demand, approved, issued and delivered.
      { clientCode: 'C-00099', stage: 'Demand Letter', stageChangedAt: ago(96), acknowledgedAt: ago(150), ownerUserId: 'CNC.MGR',
        soaSends: [{ id: 'SS-0', soaNo: 'SOA-2026-00211', at: ago(152), by: 'CNC.OFF1', channel: 'Courier', to: 'Defunct Transport Ltd., Pasig City', trackingNo: 'LBC 6610-0102', courier: 'LBC Express', recipientName: 'Treasurer — Defunct Transport Ltd.',
          delivery: { status: 'Delivered', at: ago(150).slice(0, 10), receivedBy: 'M. Ramos (Treasurer)', podFile: 'LBC-6610-0102-POD.jpg', recordedBy: 'CNC.OFF1' } }],
        demandLetter: { letterRef: 'DL-2026-0007', legalOwner: 'Atty. R. Villanueva — Legal Department', approvedBy: 'CNC.MGR', approvedAt: ago(97), issuedAt: ago(96), file: 'DL-2026-0007-final-demand-signed.pdf', amount: 186400,
          recipient: 'Defunct Transport Ltd., Pasig City (Attn: President)', channel: 'Courier', courier: 'LBC Express', trackingNo: 'LBC 6610-0423',
          delivery: { status: 'Delivered', at: ago(94).slice(0, 10), receivedBy: 'Security guard on duty (refused to sign — photo on file)', podFile: 'LBC-6610-0423-POD.jpg', recordedBy: 'CNC.MGR', notes: 'Account referred to Legal; client blacklisted after the 5-day demand period' } },
        actions: [{ at: ago(90), action: 'Client blacklisted — referred to Legal after the demand period lapsed', by: 'CNC.MGR' },
          { at: ago(93.5), action: 'Demand letter DL-2026-0007 — delivered (received by Security guard on duty)', by: 'CNC.MGR', notes: 'LBC proof of delivery attached' },
          { at: ago(96), action: 'Demand Letter', by: 'CNC.MGR', notes: 'Demand letter approved — issued by the Legal department (DL-2026-0007, ₱186,400)', letter: 'Final demand for ₱186,400 within five (5) days of receipt.' },
          { at: ago(120), action: '2nd Reminder', by: 'system' }, { at: ago(130), action: '1st Reminder', by: 'system' }, { at: ago(150), action: 'SOA acknowledged by client', by: 'CNC.OFF1' }, { at: ago(152), action: 'SOA Sent', by: 'CNC.OFF1', notes: 'SOA-2026-00211 by courier' }] },
    ],
    ewallets: [
      { clientCode: 'C-00123', balance: 11951.2, minimumBalance: 10000, createdAt: ago(200), createdBy: 'ACCTG', receiptNo: 'OR-MNL-00000290', clearedDate: ago(200).slice(0, 10), paymentMethod: 'Bank transfer', bankRef: 'BDO 003311', treasuryRef: 'TRS-2026-0112', treasuryConfirmedBy: 'TREAS', treasuryConfirmedAt: ago(200), walletNo: 'EW-MNL-00123' },
      // Staff review 1.2: wallet numbers; replenishment reminders logged for the negative and below-minimum wallets.
      { clientCode: 'C-00188', balance: -2500, minimumBalance: 10000, createdAt: ago(190), walletNo: 'EW-MNL-00188', lastReminderAt: ago(8), lastReminderBy: 'ACCTG' },
      { clientCode: 'C-00201', balance: 45000, minimumBalance: 10000, createdAt: ago(170), walletNo: 'EW-CEB-00201' },
      { clientCode: 'C-00230', balance: 9398.56, minimumBalance: 10000, createdAt: ago(150), walletNo: 'EW-MNL-00230', lastReminderAt: ago(5), lastReminderBy: 'ACCTG' },
    ],
    ewalletTxns: [...extraEwt,
      { id: 'EWT-1', clientCode: 'C-00123', at: ago(200), type: 'Replenishment', amount: 30000, balanceAfter: 30000, referenceType: 'Top-up', referenceId: 'OR-MNL-00000290', receiptNo: 'OR-MNL-00000290', treasuryRef: 'TRS-2026-0112', category: 'Top-up', reason: 'Initial funding (Treasury confirmed)', by: 'ACCTG' },
      { id: 'EWT-2', clientCode: 'C-00123', at: ago(60), type: 'Deduction', amount: -18048.8, balanceAfter: 11951.2, referenceType: 'Rescue', referenceId: 'RSC-000020', category: 'Rescue', by: 'system' },
      { id: 'EWT-3', clientCode: 'C-00230', at: ago(150), type: 'Replenishment', amount: 17000, balanceAfter: 17000, referenceType: 'Top-up', referenceId: 'OR-MNL-00000305', receiptNo: 'OR-MNL-00000305', treasuryRef: 'TRS-2026-0140', category: 'Top-up', by: 'ACCTG' },
      { id: 'EWT-4', clientCode: 'C-00230', at: ago(6), type: 'Deduction', amount: -7601.44, balanceAfter: 9398.56, referenceType: 'Debit Memo', referenceId: 'DM-000040', category: 'Rescue', by: 'system' },
      { id: 'EWT-5', clientCode: 'C-00188', at: ago(190), type: 'Replenishment', amount: 10000, balanceAfter: 10000, referenceType: 'Top-up', referenceId: 'OR-MNL-00000317', receiptNo: 'OR-MNL-00000317', treasuryRef: 'TRS-2026-0128', category: 'Top-up', by: 'ACCTG' },
      { id: 'EWT-6', clientCode: 'C-00188', at: ago(40), type: 'Deduction', amount: -12500, balanceAfter: -2500, referenceType: 'Rescue', referenceId: 'RSC-000029', category: 'Rescue', by: 'system', reason: 'Rescue RSC-000029 charge (BR-11) — wallet allowed to go negative (BR-04)' },
      { id: 'EWT-7', clientCode: 'C-00201', at: ago(170), type: 'Replenishment', amount: 45000, balanceAfter: 45000, referenceType: 'Top-up', referenceId: 'OR-CEB-00000040', receiptNo: 'OR-CEB-00000040', treasuryRef: 'TRS-2026-0151', category: 'Top-up', by: 'ACCTG' },
      { id: 'EWT-8', clientCode: 'C-00201', at: ago(30), type: 'Deduction', amount: -5200, balanceAfter: 39800, referenceType: 'Repair', referenceId: 'JO-MNL-000470', category: 'Repair', by: 'system', reversedById: 'EWT-9' },
      { id: 'EWT-9', clientCode: 'C-00201', at: ago(29), type: 'Reversal', amount: 5200, balanceAfter: 45000, referenceType: 'Reversal', referenceId: 'EWT-8', reversesId: 'EWT-8', category: 'Reversal', reason: 'Posted against a non-chargeable JO (JO-MNL-000470) - reversed', by: 'ACCTG' },
    ],
    topups: [{ id: 'TU-1', clientCode: 'C-00230', amount: 20000, proofFileName: 'bank-transfer.pdf', status: 'Submitted', submittedAt: ago(0.2) },
      // Staff review 1.2: a rejected request (shown with "Show posted / rejected") — Treasury could not match the deposit.
      { id: 'TU-0', clientCode: 'C-00201', amount: 15000, proofFileName: 'deposit-slip-visayas.jpg', paymentRef: 'MBTC 55120', status: 'Rejected', submittedAt: ago(9), rejectedBy: 'TREAS', rejectedAt: ago(8), rejectReason: 'No matching deposit in the Metrobank account on the slip date — please resubmit with the bank confirmation' }],
    registrations,
    workflows: [...workflows, {
      // V1.4 row 10: PR-000209 (₱317,200) — Dept Head, Admin and APS done; the final step needs BOTH the CEO and the CHRO (two separate signatures).
      id: 'WF-PR-0', matrixCode: 'PR_PO', title: 'Purchase request PR-000209 — brake drums and leaf springs', subjectType: 'pr', subjectId: 'PR-000209', amount: 317200, requestedBy: 'DEPTHEAD', requestedAt: ago(6), status: 'Pending', currentStep: 3,
      steps: [
        { step: 1, label: 'Department Head', roles: ['DEPT_HEAD'], decision: 'Approved', decidedBy: 'DEPTHEAD', decidedAt: ago(5.9), comment: 'DEPTHEAD:DEPT_HEAD:Within the Q1 PM budget|' },
        { step: 2, label: 'Admin Department', roles: ['APS_MANAGER'], decision: 'Approved', decidedBy: 'APS', decidedAt: ago(4), comment: 'APS:APS_MANAGER:OK|' },
        { step: 3, label: 'APS processing', roles: ['APS_OFFICER'], decision: 'Approved', decidedBy: 'APS.OFF', decidedAt: ago(2.5), comment: 'APS.OFF:APS_OFFICER:Quotation checked — Axle & Brake Parts Co.|' },
        { step: 4, label: 'Final approval — CEO + CHRO (> ₱250,000)', roles: ['CEO', 'CHRO'], decision: 'Pending', dueAt: ahead(1) },
      ],
    }, {
      id: 'WF-PR-1', matrixCode: 'PR_PO', title: 'Purchase request PR-000210 — tires', subjectType: 'pr', subjectId: 'PR-000210', amount: 290000, requestedBy: 'BG.MNL', requestedAt: ago(2), status: 'Pending', currentStep: 0,
      steps: [
        { step: 1, label: 'Department Head', roles: ['DEPT_HEAD'], decision: 'Pending', dueAt: ahead(0.5) },
        { step: 2, label: 'Admin Department', roles: ['APS_MANAGER'], decision: 'Pending' },
        { step: 3, label: 'APS processing', roles: ['APS_OFFICER'], decision: 'Pending' },
        { step: 4, label: 'Final approval — CEO + CHRO (> ₱250,000)', roles: ['CEO', 'CHRO'], decision: 'Pending' },
      ],
    }, ...adminWorkflows],
    notificationRules,
    notifications: adminNotifications,
    audit: [{ id: 'A-1', at: ago(14), actor: 'system', action: 'client.hold.applied', entityType: 'client', entityId: 'C-00188', after: { status: 'Hold' }, reason: 'Invoice INV-MNL-00001050 unpaid 31 days past due at hold (BR-02)' }],
    settings: DEFAULT_SETTINGS.map((s) => ({ ...s })),
    // Park & Fix stores CLIENT-OWNED trailers (not in the Delbros fleet, so never in Available / DCIR fleet totals).
    parkFix: [
      // V1.4 row 54: completed Park & Repair — JO-MNL-000505 closed with actual cost; DM-000042 = the itemized park-out bill.
      { id: 'PF-3', chassisNo: 'VFS-TRL-0311', clientOwned: true, chassisType: 'EQ1', plateNo: 'GAB 3110', clientCode: 'C-00201', branchCode: 'MNL', parkInAt: ago(3), parkOutAt: ago(0.3), reason: 'Awaiting Repair', service: 'Park & Repair', joNo: 'JO-MNL-000505',
        dailyRate: 350, status: 'Released', inReceiptNo: 'PFR-IN-000004', outReceiptNo: 'PFR-OUT-000005', billingStatus: 'Billed', debitMemoNo: 'DM-000042', billedAmount: 6680, handlingIn: 500, handlingTiming: 'park_out',
        repairScope: 'Replace brake lining set and one tail lamp', repairEstimate: 5000, agreementRef: 'VFS-PO-2026-118', charges: pf3Charges, dymSignoff: { by: 'DYM.MNL', at: ago(2.9) },
        parkIn: { trucker: 'Visayas Haulers', truckPlateNo: 'GAB 7781', truckOrcr: 'OR 4109911 / CR 5209911', driverName: 'Rogelio Tan', driverLicenseNo: 'G05-19-224466', inspection: [{ part: 'Brake system', statusCode: 'WRN', qty: 1, chargeable: 0 }, { part: 'Lights & wiring', statusCode: 'DMG', qty: 1, chargeable: 0 }, { part: 'Tires', statusCode: 'OK', qty: 8, chargeable: 0 }], by: 'BG.MNL', signature: DEMO_SIGNATURE },
        parkOut: { trucker: 'Visayas Haulers', truckPlateNo: 'GAB 7781', truckOrcr: 'OR 4109911 / CR 5209911', driverName: 'Rogelio Tan', driverLicenseNo: 'G05-19-224466', inspection: [{ part: 'Brake system', statusCode: 'RPL', qty: 1, chargeable: 0 }, { part: 'Lights & wiring', statusCode: 'RPL', qty: 1, chargeable: 0 }, { part: 'Tires', statusCode: 'OK', qty: 8, chargeable: 0 }], by: 'BG.MNL', signature: DEMO_SIGNATURE } },
      { id: 'PF-1', chassisNo: 'MCL-TRL-0458', clientOwned: true, chassisType: 'EQ2', plateNo: 'NBC 4581', clientCode: 'C-00230', branchCode: 'MNL', parkInAt: ago(4), reason: 'Idle', service: 'Park only', dailyRate: 350, status: 'Parked',
        expectedParkOut: manilaDay(ahead(10)), inReceiptNo: 'PFR-IN-000003', billingStatus: 'Unbilled', // review 1.1: receipt numbers follow date order (PF-2 in 1, out 2; PF-1 in 3)
        handlingIn: 500, handlingTiming: 'park_out', // V1.4 row 22: handling-in charge (proposed), billed with the park-out Debit Memo
        parkIn: { trucker: 'Metro Haul', truckPlateNo: 'NCR 1122', truckOrcr: 'OR 4108811 / CR 5208811', remarks: 'Left tail light cracked on arrival (client informed).',driverName: 'Pedro Penduko', driverLicenseNo: 'N02-11-000111', inspection: [{ part: 'Tires', statusCode: 'OK', qty: 8, chargeable: 0 }, { part: 'Lights & wiring', statusCode: 'DMG', qty: 1, chargeable: 0 }, { part: 'Landing legs', statusCode: 'OK', qty: 2, chargeable: 0 }], by: 'BG.MNL' } },
      { id: 'PF-2', chassisNo: 'ABC-CH-2210', clientOwned: true, chassisType: 'EQ1', plateNo: 'NAB 2210', clientCode: 'C-00123', branchCode: 'MNL', parkInAt: ago(20), parkOutAt: ago(12), reason: 'Client Request', service: 'Park only', dailyRate: 350, status: 'Released',
        inReceiptNo: 'PFR-IN-000001', outReceiptNo: 'PFR-OUT-000002', billingStatus: 'Billed', debitMemoNo: 'DM-000039', billedAmount: 2800,
        // V1.4 rows 21 / 23: DYM sign-off and the stored itemized bill (VAT-inclusive basis keeps DM-000039 = 8 × ₱350 = ₱2,800; no handling-in — record predates the setting).
        dymSignoff: { by: 'DYM.MNL', at: addHours(ago(20), 1) },
        charges: { handling: 0, repair: 0, park: 2800, net: 2500, vat: 300, total: 2800, interimBilled: 0, due: 2800, vatBasis: 'inclusive', repairSource: 'Park only — no repair' },
        parkIn: { trucker: 'XYZ Trucking', truckPlateNo: 'NAB 5600', truckOrcr: 'OR 4100200 / CR 5200300',driverName: 'Juan Dela Cruz', driverLicenseNo: 'N01-23-456789', inspection: [{ part: 'Tires', statusCode: 'WRN', qty: 8, chargeable: 0 }], by: 'BG.MNL' },
        parkOut: { trucker: 'XYZ Trucking', truckPlateNo: 'NAB 5600', truckOrcr: 'OR 4100200 / CR 5200300',driverName: 'Juan Dela Cruz', driverLicenseNo: 'N01-23-456789', inspection: [{ part: 'Tires', statusCode: 'OK', qty: 8, chargeable: 0 }], by: 'BG.MNL' } },
    ],
    unitRequests: [
      { reqNo: 'UR-000031', clientCode: 'C-00123', contractNo: 'LTL-2026-0045', branchCode: 'MNL', equipmentType: 'EQ1', qty: 2, targetPickupDate: manilaDay(ahead(2)), requiredParts: 'Twist locks ×4 (client spec)', allocated: [], status: 'Open', createdAt: ago(1), createdBy: 'AE.JREYES',
        expectedReturn: manilaDay(ahead(32)), source: 'Internal', contactName: 'Juan Dela Cruz', contactPhone: '+63 917 222 3344' },
      { reqNo: 'UR-000030', clientCode: 'C-00201', contractNo: 'LTL-2026-0051', branchCode: 'CEB', equipmentType: 'EQ8', qty: 1, targetPickupDate: manilaDay(ahead(5)), allocated: [], status: 'Open', createdAt: ago(2), createdBy: 'AE.JREYES',
        expectedReturn: manilaDay(ahead(35)), source: 'Internal', contactName: 'Ramon Cruz', contactPhone: '+63 917 444 5566' },
      { reqNo: 'UR-000029', clientCode: 'C-00188', contractNo: 'SPL-2026-0012', branchCode: 'MNL', equipmentType: 'EQ2', qty: 1, targetPickupDate: manilaDay(ahead(1)), notes: 'Client on credit hold — cannot allocate until lifted.', allocated: [], status: 'Open', createdAt: ago(3), createdBy: 'AE.JREYES',
        source: 'Internal', contactName: 'Leo Navarro', contactPhone: '+63 917 777 8899' },
      // Staff review 1.2: logged before QLP-2026-0007 expired (~50 days ago), so it is numbered before the 6 fulfilled requests (UR-000020+); held (no Find chassis) until renewal.
      { reqNo: 'UR-000019', clientCode: 'C-00215', contractNo: 'QLP-2026-0007', branchCode: 'BTG', equipmentType: 'EQ5', qty: 1, targetPickupDate: manilaDay(ahead(7)), requiredParts: 'Extra spare tire', notes: 'Logged before QLP-2026-0007 expired — on hold pending contract renewal. Pickup moved to next week at the client’s request.', allocated: [], status: 'Open', createdAt: ago(55), createdBy: 'AE.JREYES',
        source: 'Internal', contactName: 'Nestor Aquino', contactPhone: '+63 917 888 1200' },
      ...allocReqs, // review 1.1: fulfilled requests behind the six allocated units
    ],
    crossBranchCodes: [],
    seq: { EU: 781, GP: 2000, EIR: 500, JO: 520, RSC: 41, INV: 1200, OR: 460, CM: 10, DM: 42, PR: 210, PO: 155, RR: 60, RFP: 30, PCV: 88, CT: 70, CL: 251, WF: 10, LE: 1, SOA: 318, STK: 120,EWT: 10, HL: 1, DL: 7 },
  };
  addRecordNotices(seedOut); // Staff UI changes V1.4 rows 30–31
  return seedOut;
}

/**
 * Staff UI changes V1.4 (rows 30–31): seeded notice history behind the "Notifications for this record" panels — rescue requested
 * (rule N13; urgent = SMS repeated until acknowledged) and completed (N14, client included) for RSC-000041 / RSC-000020, and the
 * cash-bond withdrawal notice (N07: Sales, C&C, Accounting, Finance) for CB-3 and CB-8. Historical notices are "Sent" (handed to the
 * channel); notices raised live start as "Queued" for email / SMS until the mail / SMS service reports Sent or Failed.
 */
function addRecordNotices(d: Db) {
  const plus = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60_000).toISOString();
  const emit = (ruleId: string, title: string, body: string, link: string, at: string, o: { branchCode?: string; clientCode?: string; urgent?: boolean } = {}) => {
    const rule = d.notificationRules.find((r) => r.id === ruleId); if (!rule) return;
    const inBranch = (u: Db['users'][number]) => !o.branchCode || u.branchAccess === 'ALL' || u.branchCode === o.branchCode || (Array.isArray(u.branchAccess) && u.branchAccess.includes(o.branchCode));
    const users = d.users.filter((u) => u.status === 'Active' && ((u.realm === 'INTERNAL' && u.roles.some((r) => rule.recipientRoles.includes(r)) && inBranch(u)) || (rule.includeClient && !!o.clientCode && u.clientCode === o.clientCode)));
    const channels = o.urgent ? rule.channels : rule.channels;
    users.forEach((u, k) => d.notifications.push({ id: `NT-${ruleId}-${link.replace(/\W+/g, '')}-${k}`, at, title, body, link, read: k % 3 !== 0, requiresAck: !!o.urgent && rule.mode === 'Repeat until ack', userId: u.userId,
      category: 'Operations', ruleId, channels, recipientRole: u.realm === 'INTERNAL' ? u.roles.find((r) => rule.recipientRoles.includes(r)) : 'Client',
      delivery: channels.map((ch) => ({ channel: ch, state: 'Sent' as const, at: plus(at, ch === 'In-App' ? 0 : 1) })) }));
  };
  const cn = (code: string) => d.clients.find((c) => c.clientCode === code)?.clientName ?? code;
  for (const r of d.rescues.filter((x) => ['RSC-000041', 'RSC-000020'].includes(x.rescueNo))) {
    emit('N13', `${r.urgent ? 'URGENT ' : ''}Rescue ${r.rescueNo}: ${cn(r.clientCode)}`, `${r.chassisNo} · ${r.locationText} · ${r.incident}`, `/rescue/${r.rescueNo}`, r.requestedAt, { branchCode: r.branchCode, urgent: r.urgent });
    if (r.status === 'Completed' && r.completedAt) emit('N14', `Rescue completed: ${r.rescueNo}`, `${cn(r.clientCode)} · total ₱${(r.total ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, `/rescue/${r.rescueNo}`, r.completedAt, { clientCode: r.clientCode, branchCode: r.branchCode });
  }
  for (const b of d.cashBonds.filter((x) => ['CB-3', 'CB-8'].includes(x.id))) {
    const w = b.withdrawals[0]; if (!w) continue;
    emit('N07', `Cash bond withdrawal requested — ${b.id}`, `${cn(b.clientCode)} · ₱${w.amount.toLocaleString('en-PH')} · ${w.reason}`, `/cash-bonds?bond=${b.id}`, w.requestedAt);
  }
}
