// DEMO DATA ONLY — SUP-04/05/06 + SCR-44 enrichment (master-data detail, warehouses, rate cards, reference lists,
// extra notification rules, multi-actor audit sample). Applied once to a fresh or previously persisted mock DB.
import { addDays, addHours, toDateInput, CONTRACT_TYPES, DEFAULT_SETTINGS, type AuditEvent, type ContractType, type MasterListItem, type NotificationRule, type RateCardRow, type RoleCode, type Warehouse } from '../shared';
import { sealAudit } from './core';
import type { Db } from './db';

const ago = (d: number) => addDays(new Date().toISOString(), -d);
const REGION_GROUP: Record<string, 'Luzon' | 'Visayas' | 'Mindanao'> = { NCR: 'Luzon', 'North Luzon': 'Luzon', 'South Luzon': 'Luzon', Visayas: 'Visayas', Mindanao: 'Mindanao' };
const MANAGERS: Record<string, string> = { HO: 'Liza Gomez (RM.NCR)', MNL: 'Carlos Mendoza (DYM.MNL)', CEB: 'Ana Villanueva (BG.CEB)' };

export function applyAdminSeed(db: Db) {
  if (db.seq.ADMSEED) return;
  db.seq.ADMSEED = 1;

  // ── Branches: region hierarchy (Luzon → NCR / North / South), details, status
  for (const b of db.branches) {
    b.regionGroup ??= REGION_GROUP[b.region];
    b.address ??= `${b.name} compound, ${b.region}`;
    b.manager ??= MANAGERS[b.code] ?? 'To be assigned';
    b.phone ??= '+63 2 8000 0000';
    b.partsMultiplier ??= 1;
    b.issuesGatePasses ??= !b.isHeadOffice;
    b.active ??= true;
    // Staff review 1.2 (proposed, to confirm): Mindanao stock belongs to Nakamura, the rest to Delbros Leasing; yards without a stockroom
    // are served by the nearest one (Luzon → WH-MNL, Visayas → WH-CEB, Mindanao → WH-DVO).
    b.entityCode ??= b.region === 'Mindanao' ? 'NAK' : 'DBL';
    if (!['MNL', 'CEB', 'DVO', 'HO'].includes(b.code)) b.servedByWarehouse ??= b.regionGroup === 'Visayas' ? 'WH-CEB' : b.regionGroup === 'Mindanao' ? 'WH-DVO' : 'WH-MNL';
  }
  const ho = db.branches.find((b) => b.isHeadOffice); if (ho && ho.issuesGatePasses === false && ho.gatePassPrefix === 'GP-HO-') ho.gatePassPrefix = '';
  // ── Equipment types: attributes (axle / hub lists, tags, status). Names stay placeholders (Q-CLT-01).
  db.equipmentTypes.forEach((e, i) => { e.axles ??= i % 3 === 2 ? ['3-axle'] : ['2-axle']; e.hubTypes ??= [i % 2 ? '10-hole' : '8-hole']; e.tags ??= []; e.active ??= true; });
  // ── Parts: weight, regional price, supplier, movement class, scrap flag, history. Rescue price re-derived with one rounding rule (half up, integer maths).
  const supplier: Record<string, string> = { Tires: 'V-001', Brakes: 'V-002', Suspension: 'V-002', Mechanical: 'V-002' };
  const weight: Record<string, number> = { 'TIR-1100': 55, 'TIR-VALVE': 0.05, 'BRK-PAD': 6, 'BRK-DRUM': 38, 'SUS-LEAF': 48, 'ELC-LAMP': 1.2, 'ELC-WIRE': 2.5, 'MEC-KING': 9, 'MEC-LEG': 70, 'PNT-PRIM': 4.5 };
  for (const p of db.parts) {
    p.weightKg ??= weight[p.partCode] ?? 1;
    p.rescuePrice = Math.round((p.standardCost * 115) / 100);
    p.regionalPrices ??= { Luzon: p.standardCost, Visayas: Math.round((p.standardCost * 105) / 100), Mindanao: Math.round((p.standardCost * 108) / 100) };
    p.preferredVendorId ??= supplier[p.category];
    p.movementClass ??= ['Tires', 'Brakes'].includes(p.category) ? 'Fast' : 'Slow';
    p.scrapFlag ??= false; p.reorderQty ??= 10; p.active ??= true;
    p.priceHistory ??= [{ validFrom: '2026-01-01', vendorId: p.preferredVendorId, unitCost: p.standardCost, source: 'Standard cost (master)' }];
  }
  const po = db.pos.find((x) => x.poNo === 'PO-000155');
  po?.lines.forEach((l) => { const p = db.parts.find((x) => x.partCode === l.partCode); if (p?.priceHistory && !p.priceHistory.some((h) => h.source === po.poNo)) p.priceHistory.unshift({ validFrom: po.createdAt.slice(0, 10), vendorId: po.vendorId, unitCost: l.unitPrice, source: po.poNo }); });
  // ── Vendors: contact, address, VAT, bank, category, entity, portal flag
  const vx: Record<string, Partial<Db['vendors'][number]>> = {
    'V-001': { contactPerson: 'Rene Dizon', phone: '+63 917 300 1001', address: '12 Quirino Hwy, Quezon City', vatStatus: 'VAT-registered', bankName: 'BDO', bankAccount: '0012-3456-78', paymentMethod: 'Bank transfer', category: 'Tires', entityCodes: ['DBL', 'NAK'], portalAccess: true, portalUserId: 'vendor@tirepro.ph' },
    'V-002': { contactPerson: 'Lorna Sy', phone: '+63 917 300 1002', address: '88 MacArthur Hwy, Valenzuela', vatStatus: 'VAT-registered', bankName: 'BPI', bankAccount: '3141-5926-53', paymentMethod: 'Check', category: 'Brakes & parts', entityCodes: ['DBL'], portalAccess: false },
    'V-003': { contactPerson: 'Jun Mercado', phone: '+63 917 300 1003', address: 'Aguinaldo Hwy, Imus, Cavite', vatStatus: 'Non-VAT', bankName: 'Metrobank', bankAccount: '2718-2818-28', paymentMethod: 'Bank transfer', category: 'Rescue partner', entityCodes: ['DBL', 'KNEX'], portalAccess: false },
  };
  for (const v of db.vendors) Object.assign(v, { ...vx[v.vendorId], ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) });
  if (!db.vendors.some((v) => v.vendorId === 'V-004')) db.vendors.push({ vendorId: 'V-004', name: 'Metro Paint Supply', tin: '000-777-888-000', address: 'Pasig', email: 'orders@metropaint.ph', paymentTerms: '30 days', status: 'Inactive', statusReason: 'No transactions since 2024 — deactivated by APS', contactPerson: 'Ella Ong', phone: '+63 917 300 1004', vatStatus: 'VAT-registered', category: 'Painting', entityCodes: ['DBL'], portalAccess: false });

  db.warehouses ??= [
    { code: 'WH-MNL', name: 'Manila stockroom', branchCode: 'MNL', custodian: 'WH.MNL', active: true },
    { code: 'WH-CEB', name: 'Cebu stockroom', branchCode: 'CEB', custodian: 'BG.CEB', active: true },
    { code: 'WH-DVO', name: 'Davao stockroom', branchCode: 'DVO', active: true },
  ] satisfies Warehouse[];
  // Review 1.1: WH-DVO holds stock on the Inventory summary — backfill it into older saved warehouse masters.
  if (!db.warehouses.some((w) => w.code === 'WH-DVO')) db.warehouses.push({ code: 'WH-DVO', name: 'Davao stockroom', branchCode: 'DVO', active: true });

  // ── Rate cards (BR-18 effective-dated). Class is fixed by contract type (BR-12).
  const base: Record<ContractType, number> = { LTL: 900, SPL: 1100, QLP: 1200 };
  db.rateCards ??= [
    ...db.equipmentTypes.flatMap((e, i) => (Object.keys(base) as ContractType[]).map((t): RateCardRow => ({ id: `RC-${e.code}-${t}`, equipmentType: e.code, contractType: t, contractClass: CONTRACT_TYPES[t].class, dailyRate: base[t] + i * 50, indemnity: 350000 + i * 25000, validFrom: '2026-01-01', createdBy: 'ADMIN' }))),
    { id: 'RC-EQ1-LTL-2025', equipmentType: 'EQ1', contractType: 'LTL', contractClass: 'A', dailyRate: 850, indemnity: 340000, validFrom: '2025-01-01', validTo: '2025-12-31', createdBy: 'ADMIN', reason: 'Superseded by 2026 rate card' },
  ];

  const L = (list: string, items: [string, string][], standard = true): MasterListItem[] => items.map(([code, name]) => ({ list, code, name, standard, active: true }));
  db.masterLists ??= [
    ...L('Chassis type (DBL-CHS-001)', [['20FT', '20ft'], ['40FT', '40ft'], ['40FB', '40ft flatbed'], ['40CB', '40ft combo'], ['40SC', '40ft super combo'], ['45FT', '45ft'], ['CANE', 'Cane cage trailer']]),
    ...L('Axle configuration', [['2AX', '2-axle'], ['3AX', '3-axle']]),
    ...L('Hub type', [['SPOKE', 'Spoke'], ['8H', '8-hole'], ['10H', '10-hole']]),
    ...L('Classification tag', [['PORT', 'Port use'], ['LONGHAUL', 'Long haul']]), ...L('Classification tag', [['VIP', 'Key account unit (custom)']], false),
    ...(Object.entries(CONTRACT_TYPES).map(([k, v]) => ({ list: 'Contract type', code: k, name: `${v.name} — Class ${v.class} (${v.rule})`, standard: true, active: true }))),
    ...L('Entity', [['DBL', 'Delbros Leasing'], ['NAK', 'Nakamura'], ['KNEX', 'KNEX']]),
    ...L('Department', [['OPS', 'Operations'], ['ACC', 'Accounting'], ['TRS', 'Treasury'], ['CNC', 'Credit & Collection'], ['SLS', 'Sales'], ['APS', 'Asset & Procurement'], ['REG', 'Regulatory'], ['IT', 'IT'], ['EXE', 'Executive office'], ['AUD', 'Internal Audit'], ['RAM', 'Repair & Maintenance'], ['YRD', 'Yard Operations']]),
    ...L('Repair category', [['TIR', 'Tires'], ['SUS', 'Suspension'], ['MEC', 'Mechanical'], ['ELC', 'Electrical'], ['BRK', 'Brakes'], ['PNT', 'Painting']]),
    ...L('Non-chassis asset category', [['FL', 'Forklift'], ['HE', 'Heavy Equipment'], ['WM', 'Welding Machine'], ['DT', 'Depot Tool'], ['ST', 'Stockroom Tool']]),
    ...L('Vendor category', [['TIR', 'Tires'], ['BRK', 'Brakes & parts'], ['RES', 'Rescue partner'], ['PNT', 'Painting']]),
    ...L('Expense category', [['UTL', 'Utilities'], ['SUP', 'Office supplies'], ['FUEL', 'Fuel'], ['REP', 'Repairs & maintenance']]),
  ];

  // ── Notification rules (SCR-44 review): new rules, client on N13, escalation timers + targets, INT-003
  const R = (id: string, eventType: string, description: string, recipientRoles: RoleCode[], source: string, o: Partial<NotificationRule> = {}): NotificationRule => ({
    id, eventType, description, recipientRoles, namedRecipients: [], includeClient: false, includeAe: false, channels: ['Email', 'SMS', 'In-App'], mode: 'One-time', active: true, source, ...o,
  });
  const patch: Record<string, Partial<NotificationRule>> = {
    N13: { includeClient: true },
    N15: { escalationHours: 48, escalateTo: ['DYM', 'OPS_MANAGER'], condition: 'Escalate when the JO is major or not confirmed within the timer' },
    N23: { escalationHours: 48, escalateTo: ['VP'], pending: 'Q-NOT-02 escalation target' },
    N12: { escalateTo: ['OPS_MANAGER'] }, N17: { escalateTo: ['APS_MANAGER'] },
    N22: { description: 'Collection — SOA sent', condition: "stage = 'SOA Sent'" },
    N30: { source: 'INT-003' },
  };
  for (const r of db.notificationRules) if (patch[r.id]) Object.assign(r, patch[r.id]);
  const extra: NotificationRule[] = [
    R('N41', 'rescue.dispatched', 'Rescue dispatched — crew and ETA', ['OPS_MANAGER', 'RESCUE_COORDINATOR', 'BRANCH_GENERALIST'], 'DBL-RES-006, DBL-NOT-006', { includeClient: true, includeAe: true,
      template: { subject: 'Rescue {{rescueNo}} dispatched', body: 'Crew {{crew}} is on the way to {{location}}. ETA {{eta}}. Chassis {{chassisNo}}.', sms: 'Delbros: rescue {{rescueNo}} dispatched, ETA {{eta}}.' } }),
    R('N42', 'ar.aging_alert', 'AR & aging alert (C&C, Accounting, Finance)', ['CNC_OFFICER', 'CNC_MANAGER', 'ACCOUNTING', 'FINANCE_MANAGER'], 'DBL-CNC-002, DBL-NOT-004', { channels: ['Email', 'In-App'], condition: 'Balance moves into the 31–60 day bucket or older', escalationHours: 72, escalateTo: ['FINANCE_MANAGER'] }),
    R('N43', 'collection.first_reminder', 'Collection — 1st reminder', ['CNC_OFFICER'], 'DBL-CNC-006', { includeClient: true, includeAe: true, channels: ['Email'], condition: "stage = '1st Reminder' (day set in SUP-05)" }),
    R('N44', 'collection.second_reminder', 'Collection — 2nd reminder', ['CNC_OFFICER', 'CNC_MANAGER'], 'DBL-CNC-006 (Q-CNC-04)', { includeClient: true, includeAe: true, channels: ['Email', 'In-App'], condition: "stage = '2nd Reminder'" }),
    R('N45', 'collection.demand_letter', 'Collection — demand letter issued', ['CNC_MANAGER', 'FINANCE_MANAGER', 'SALES_DIRECTOR'], 'DBL-CNC-006 (Q-CNC-04)', { includeClient: true, includeAe: true, channels: ['Email', 'In-App'], condition: "stage = 'Demand Letter'", escalationHours: 72, escalateTo: ['EXEC_OFFICER'] }),
    R('N46', 'client.accreditation.stage', 'Accreditation stage change (C&C → Finance → VP)', ['CNC_OFFICER', 'FINANCE_MANAGER', 'VP'], 'DBL-CLT-006', { includeAe: true, channels: ['Email', 'In-App'] }),
    R('N47', 'client.internal_registered', 'Internal client registration (Draft created)', ['CNC_OFFICER', 'SALES_DIRECTOR'], 'DBL-CLT-001', { includeAe: true, channels: ['Email', 'In-App'] }),
    R('N48', 'user.credentials_issued', 'New-user credentials / password reset', [], 'US-ADM-001', { channels: ['Email'], condition: 'Sent only to the user’s registered email; temporary password expires at first login',
      template: { subject: 'Your Delbros Leasing account', body: 'Hello {{name}}, your user ID is {{userId}}. Sign in with the temporary password sent separately; you must change it at first login.' } }),
    R('N49', 'contract.signature_pending', 'Contract awaiting client signature', ['SALES_DIRECTOR'], 'DBL-CLT-010, DBL-NOT-005', { includeAe: true, includeClient: true, channels: ['Email', 'In-App'], escalationHours: 48, escalateTo: ['SALES_DIRECTOR'] }),
  ];
  // Review 1.1 (DBL-REG-003): the expired-registration escalation had an event but no rule.
  extra.push(R('N50', 'registration.expired', 'Registration expired — escalation (Gate Out blocked)', ['REGULATORY', 'OPS_MANAGER', 'ACCOUNTING'], 'DBL-REG-003, DBL-REG-004', { channels: ['Email', 'SMS', 'In-App'], pending: 'Q-REG-ESC escalation recipients' }));
  for (const r of extra) if (!db.notificationRules.some((x) => x.id === r.id)) db.notificationRules.push(r);

  // ── Settings: add keys introduced after the DB was persisted (values already saved are kept)
  for (const d of DEFAULT_SETTINGS) if (!db.settings.some((s) => s.key === d.key)) db.settings.push({ ...d });

  // ── Staff review 1.2 (Users & roles): created date / by, HRIS employee no., the Regional Manager's region scope, departments that
  // match other screens, a backup approver, and sign-in problems that match the audit sample (BG.CEB failed once, APS.OFF locked).
  const goLive = '2026-01-05T09:00:00+08:00';
  db.users.forEach((u, i) => {
    u.createdAt ??= u.userId === 'WH.MNL' ? ago(21.27) : u.userId === 'tess@islandlink.ph' ? ago(1) : new Date(goLive).toISOString();
    u.createdBy ??= u.realm === 'CLIENT_PORTAL' && u.status !== 'Active' ? 'Portal self-registration' : 'ADMIN';
    if (u.realm === 'INTERNAL') u.employeeNo ??= `E-${String(10021 + i * 3)}`;
  });
  const rmNcr = db.users.find((u) => u.userId === 'RM.NCR');
  if (rmNcr && rmNcr.branchAccess === 'ALL' && !rmNcr.regionScope) { rmNcr.regionScope = 'NCR'; rmNcr.branchAccess = db.branches.filter((b) => b.region === 'NCR').map((b) => b.code); }
  const tech = db.users.find((u) => u.userId === 'TECH.MNL'); if (tech) tech.department = 'RAM';
  const finMgr = db.users.find((u) => u.userId === 'FINMGR'); if (finMgr) { finMgr.delegateUserId ??= 'CNC.MGR'; finMgr.delegateUntil ??= toDateInput(ago(-3)); }
  const bgCeb = db.users.find((u) => u.userId === 'BG.CEB'); if (bgCeb && !bgCeb.failed) bgCeb.failed = 1;
  const apsOff = db.users.find((u) => u.userId === 'APS.OFF'); if (apsOff && !apsOff.lockedUntil) { apsOff.failed = 5; apsOff.lockedUntil = addHours(new Date().toISOString(), 0.5); }
  // The settings change in the audit sample is also stamped on the setting itself (Last changed / effective on the Settings list).
  const firstRem = db.settings.find((s) => s.key === 'cnc.first_reminder_days');
  if (firstRem && !firstRem.updatedAt) Object.assign(firstRem, { updatedAt: ago(20.36), updatedBy: 'ADMIN', effectiveFrom: toDateInput(ago(20.36)) });

  // ── Audit sample: several actors, create / update / delete (deactivate) / status / export, reasons on sensitive actions
  // Staff review 1.2: sample client IPs (office LAN per branch); the server records the real address in production.
  const ipOf = (actor: string) => { if (actor === 'system') return undefined; const u = db.users.find((x) => x.userId === actor); const k = Math.max(0, db.users.indexOf(u!)); return u?.branchCode === 'CEB' ? `10.30.8.${20 + k}` : u?.branchCode === 'MNL' ? `10.20.4.${20 + k}` : `10.10.1.${20 + k}`; };
  const ev =(d: number, actor: string, actorRole: string, action: string, entityType: string, entityId: string, o: Partial<AuditEvent> = {}): AuditEvent =>
    ({ id: `A-S${Math.round(d * 100)}-${action}`, at: ago(d), actor, actorRole, action, entityType, entityId, source: 'Web (internal) · Win32', ip: ipOf(actor), ...o });
  // Review 1.1: varied times of day (fractional days), and RSC-000040 is the rescue that was actually cancelled (at its seeded cancel time).
  const rsc40 = db.rescues.find((r) => r.rescueNo === 'RSC-000040');
  const sample: AuditEvent[] = [
    ev(21.27, 'ADMIN', 'SYS_ADMIN', 'user.created', 'user', 'WH.MNL', { after: { name: 'Eddie Garcia', roles: ['WAREHOUSE'], branchCode: 'MNL', warehouseCode: 'WH-MNL' } }),
    ev(20.36, 'ADMIN', 'SYS_ADMIN', 'settings.changed', 'setting', 'cnc.first_reminder_days', { before: { value: 7 }, after: { value: 5 }, reason: 'Align with DBL-CNC-006 baseline (5 days)' }),
    ev(18.18, 'AE.JREYES', 'ACCOUNT_EXECUTIVE', 'client.updated', 'client', 'C-00123', { before: { phone: '+63 2 8123 4567' }, after: { phone: '+63 2 8123 9999' } }),
    ev(17.09, 'APS', 'APS_MANAGER', 'masterdata.vendor.created', 'vendor', 'V-003', { after: { name: 'Roadside Rescue Partners', category: 'Rescue partner' } }),
    ev(16.31, 'APS', 'APS_MANAGER', 'masterdata.vendor.deactivated', 'vendor', 'V-004', { before: { status: 'Active' }, after: { status: 'Inactive' }, reason: 'No transactions since 2024 — deactivated by APS (soft delete; record kept)' }),
    ev(58 / 24, 'BG.MNL', 'BRANCH_GENERALIST', 'ewa.cancelled', 'ewa', 'EU-000765', { before: { status: 'Active' }, after: { status: 'Cancelled' }, reason: 'Client cancelled the pickup — trucker unavailable', source: 'Web (internal) · Android tablet (gate)' }),
    ev(10.22, 'CNC.OFF1', 'CNC_OFFICER', 'collection.advanced', 'client', 'C-00188', { before: { stage: 'SOA Sent' }, after: { stage: '1st Reminder' }, reason: 'Ladder day 5 — no payment received' }),
    // Staff review 1.2: WF-ACC-1 (Northstar) is still waiting at the C&C step, so the trail shows its submission, not a Finance approval.
    ev(7.13, 'AE.JREYES', 'ACCOUNT_EXECUTIVE', 'accreditation.submitted', 'client', 'C-00244', { after: { workflow: 'WF-ACC-1', step: 'C&C review' }, reason: 'BICI submitted for accreditation' }),
    { ...ev(2, 'OPSMGR', 'OPS_MANAGER', 'rescue.cancel', 'rescue', 'RSC-000040', { before: { status: 'Requested' }, after: { status: 'Cancelled' }, reason: rsc40?.cancelReason ?? 'Client driver fixed the tire on site; rescue no longer needed.' }), ...(rsc40?.cancelledAt ? { at: rsc40.cancelledAt } : {}) },
    ev(5.29, 'CNC.MGR', 'CNC_MANAGER', 'audit.export', 'audit', 'audit-log.csv', { after: { rows: 42, filter: { entityType: 'client' } }, reason: 'Monthly C&C control review' }),
    ev(3.41, 'BG.CEB', 'BRANCH_GENERALIST', 'auth.login_failed', 'user', 'BG.CEB', { source: 'Web (internal) · Android tablet (gate)', ip: '112.198.0.14', reason: 'Wrong password (1 of 5 attempts)' }),
    // Staff review 1.2: an account lock that matches the Locked user on Users & roles, and audited notification-rule saves (Last changed on the rules list).
    ev(0.003, 'APS.OFF', 'APS_OFFICER', 'auth.account_locked', 'user', 'APS.OFF', { after: { failedAttempts: 5 }, reason: 'Locked after 5 failed sign-in attempts', ip: '10.10.1.37' }),
    ev(12.4, 'ADMIN', 'SYS_ADMIN', 'notification_rule.saved', 'notification_rule', 'N15', { before: { escalationHours: null, escalateTo: [] }, after: { escalationHours: 48, escalateTo: ['DYM', 'OPS_MANAGER'] }, reason: 'Review: major JOs escalate to the DYM and Operations Manager after 48 h' }),
    ev(12.35, 'ADMIN', 'SYS_ADMIN', 'notification_rule.saved', 'notification_rule', 'N23', { before: { escalationHours: null, escalateTo: [] }, after: { escalationHours: 48, escalateTo: ['VP'] }, reason: 'Proposed escalation target (VP) pending Q-NOT-02' }),
    ev(9.6, 'ADMIN', 'SYS_ADMIN', 'notification_rule.saved', 'notification_rule', 'N50', { after: { channels: ['Email', 'SMS', 'In-App'], recipientRoles: ['REGULATORY', 'OPS_MANAGER', 'ACCOUNTING'] }, reason: 'New rule for expired registrations (DBL-REG-003)' }),
    ev(4.12, 'ADMIN', 'SYS_ADMIN', 'user.roles_changed', 'user', 'OPSMGR', { before: { roles: ['OPS_MANAGER'] }, after: { roles: ['OPS_MANAGER', 'RESCUE_COORDINATOR'] }, reason: 'Covers rescue dispatch while the coordinator post is vacant' }),
    ev(8.47, 'TREAS', 'TREASURY', 'auth.password_changed', 'user', 'TREAS'),
  ];
  // Business-record events taken from the seeded records themselves, so the ID, actor and time match the source screen.
  const roleOf = (id: string) => db.users.find((u) => u.userId === id)?.roles[0] ?? 'SYSTEM';
  const rec = (id: string, at: string, actor: string, action: string, entityType: string, entityId: string, o: Partial<AuditEvent> = {}): AuditEvent =>
    ({ id: `A-S${id}`, at, actor, actorRole: roleOf(actor), action, entityType, entityId, source: actor === 'system' ? 'System job' : 'Web (internal) · Win32', ip: ipOf(actor), ...o });
  // Staff review 1.2: the sampled release is one encoded at the encoder's own branch (no Manila user on a Cagayan de Oro gate pass).
  const outs = [...db.gatePasses].filter((g) => g.direction === 'OUT').sort((a, b) => b.encodedAt.localeCompare(a.encodedAt));
  const gpOut = outs.find((g) => db.users.find((u) => u.userId === g.encodedBy)?.branchCode === g.branchCode) ?? outs[0];
  const gpIn = db.gatePasses.find((g) => g.direction === 'IN');
  const inv = [...db.invoices].filter((i) => i.status !== 'Draft').sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0];
  const ewt = [...db.ewalletTxns].sort((a, b) => b.at.localeCompare(a.at))[0];
  const stk = [...db.stockTxns].filter((t) => !t.status || t.status === 'Posted').sort((a, b) => b.at.localeCompare(a.at))[0];
  const cm = db.memos.find((m) => m.type === 'Credit' && m.status === 'Applied');
  if (gpOut) sample.push(rec('-gp-out', gpOut.encodedAt, gpOut.encodedBy, 'gate.out.completed', 'gate', gpOut.gatePassNo, { after: { chassisNo: gpOut.chassisNo, clientCode: gpOut.clientCode, euNo: gpOut.euNo, eirNo: gpOut.eirNo }, source: 'Web (internal) · Android tablet (gate)' }));
  if (gpIn) sample.push(rec('-gp-in', gpIn.encodedAt, gpIn.encodedBy, 'gate.in.completed', 'gate', gpIn.gatePassNo, { after: { chassisNo: gpIn.chassisNo, assessment: gpIn.generalAssessment, eirNo: gpIn.eirNo }, source: 'Web (internal) · Android tablet (gate)' }));
  if (inv) sample.push(rec('-inv', inv.issuedAt, 'ACCTG', 'invoice.issued', 'invoice', inv.invoiceNo, { after: { clientCode: inv.clientCode, total: inv.total, dueDate: inv.dueDate } }));
  if (ewt) sample.push(rec('-ewt', ewt.at, ewt.by || 'ACCTG', `ewallet.${String(ewt.type).toLowerCase().replace(/\W+/g, '_')}`, 'ewallet', ewt.clientCode, { after: { txn: ewt.id, amount: ewt.amount, balanceAfter: ewt.balanceAfter, reference: `${ewt.referenceType} ${ewt.referenceId ?? ''}`.trim() } }));
  if (stk) sample.push(rec('-stk', stk.at, stk.by, `stock.${String(stk.type).toLowerCase().replace(/\W+/g, '_')}`, 'stock', stk.txnNo, { after: { partCode: stk.partCode, qty: stk.qty, warehouse: stk.fromWarehouse ?? stk.toWarehouse, balanceAfter: stk.balanceAfter } }));
  if (cm?.appliedAt) sample.push(rec('-cm', cm.appliedAt, 'ACCTG', 'memo.applied', 'memo', cm.memoNo, { before: { status: 'Approved' }, after: { status: 'Applied', appliedTo: cm.appliedTo } }));
  // Staff review 1.2: every renewal in progress has its Start renewal event (at the recorded start), and every expired unit its escalation by the notice job.
  for (const r of db.registrations.filter((x) => !x.pending && x.renewalInProgress)) sample.push(rec(`-reg-${r.id}`, r.renewal?.startedAt ?? addHours(ago(1), -2.4), r.renewal?.startedBy ?? 'REG', 'registration.renewal_started', 'registration', r.subjectId, { before: { renewalInProgress: false }, after: { renewalInProgress: true, processedBy: r.renewal?.processedBy, reference: r.renewal?.reference, expectedDate: r.renewal?.expectedDate } }));
  for (const r of db.registrations.filter((x) => x.escalatedAt)) sample.push(rec(`-esc-${r.id}`, r.escalatedAt!, 'system', 'registration.escalated', 'registration', r.subjectId, { after: { to: r.escalatedTo, expiryDate: r.expiryDate }, reason: 'Registration expired — notice job escalated (Gate Out blocked)' }));
  for (const ct of db.contracts.filter((c) => c.status === 'Expired')) { const h = ct.history?.find((x) => x.status === 'Expired' && x.by === 'system'); if (h) sample.push(rec(`-ctx-${ct.contractNo}`, h.at, 'system', 'contract.expired', 'contract', ct.contractNo, { before: { status: 'Active' }, after: { status: 'Expired' }, reason: `Expiry date ${ct.expiryDate} reached (nightly job)` })); }
  // Staff review 1.2 (SCR-13): the asset audit trail records creation, assignment, maintenance logs and status changes — sample for AST-FL-001 from its own record.
  const fl = db.assets.find((a) => a.assetId === 'AST-FL-001');
  if (fl?.acquisitionDate) {
    const at = (d: string, h: number) => addHours(`${d}T00:00:00+08:00`, h);
    sample.push(rec('-ast-c', at(fl.acquisitionDate, 10), 'APS.OFF', 'asset.created', 'asset', fl.assetId, { after: { description: fl.description, branchCode: fl.branchCode, status: 'Available' } }));
    sample.push(rec('-ast-a', at(fl.acquisitionDate, 15), 'APS.OFF', 'asset.status', 'asset', fl.assetId, { before: { status: 'Available' }, after: { status: 'In-Use', assignedTo: fl.assignedTo }, reason: 'Assigned to Yard Operations for container handling' }));
    (fl.maintenanceLog ?? []).forEach((m, k) => sample.push(rec(`-ast-m${k}`, at(m.date, 14), m.by, 'asset.maintenance', 'asset', fl.assetId, { after: { type: m.type, notes: m.notes, cost: m.cost, meterHours: m.meterHours } })));
  }
  const all = [...db.audit.filter((a) => !a.id.startsWith('A-S')), ...sample].sort((a, b) => b.at.localeCompare(a.at));
  // One-time migration seal: chain every event oldest → newest (NFR-AUD-001). New events are sealed by core.audit().
  let prev = 'GENESIS';
  for (let i = all.length - 1; i >= 0; i--) { all[i].source ??= all[i].actor === 'system' ? 'System job' : 'Web (internal)'; sealAudit(all[i], prev); prev = all[i].hash!; }
  db.audit.splice(0, db.audit.length, ...all);
}
