// Domain types. Field names follow docs/04-data-model.md (legacy DelWater names kept where they exist).

export type Realm = 'INTERNAL' | 'CLIENT_PORTAL' | 'VENDOR_PORTAL';

export type ClientStatus = 'Active' | 'Draft' | 'Hold' | 'Blacklist' | 'Inactive';
export type AccreditationStatus = 'Draft' | 'Pending C&C' | 'Pending Finance' | 'Pending VP' | 'Approved' | 'Rejected';
export type ContractType = 'LTL' | 'SPL' | 'QLP';
export type ContractClass = 'A' | 'Z' | 'Q';
export type ContractStatus = 'Draft' | 'Printed' | 'Sent to Client' | 'Signed' | 'For Notarisation' | 'Notarized' | 'Active' | 'Expired' | 'Renewed' | 'Terminated';
export type ChassisStatus =
  | 'New' | 'Available' | 'Allocated' | 'On Hire' | 'Breakdown' | 'In Repair' | 'Rescue'
  | 'Parked' | 'Unaccounted' | 'Legal' | 'Converted' | 'Sold' | 'Killed';
export type Assessment = 'Roadworthy' | 'Unroadworthy';
export type EwaStatus = 'Active' | 'Used' | 'Partially Used' | 'Expired' | 'Extension Pending' | 'Cancelled';
export type JoStatus = 'Draft' | 'Approved' | 'Confirmed' | 'Ongoing' | 'On Hold' | 'Closed by R&M' | 'Closed by EIR Out';
export type RepairCategory = 'Tires' | 'Suspension' | 'Mechanical' | 'Electrical' | 'Brakes' | 'Painting';
export type RescueStatus = 'Requested' | 'Verified' | 'Confirmed' | 'Dispatched' | 'In Progress' | 'Completed' | 'Cancelled' | 'Blocked';
export type InvoiceStatus = 'Draft' | 'Finalized' | 'Sent' | 'Cancelled';
export type PaymentStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Overdue' | 'Credited' | 'Cancelled';
export type CollectionStage = 'None' | 'SOA Sent' | '1st Reminder' | '2nd Reminder' | 'Demand Letter';
export type RegistrationStatus = 'Current' | 'Registered' | 'Pending' | 'Expiring' | 'Renewal In Progress' | 'Expired';
export type ApprovalDecision = 'Pending' | 'Approved' | 'Rejected' | 'Escalated' | 'Skipped';
export type EwalletTxnType = 'Replenishment' | 'Deduction' | 'Adjustment' | 'Reversal';
export type StockTxnType = 'Request' | 'Issue' | 'Transfer' | 'Receive' | 'Adjustment' | 'Return';
export type PoStatus = 'Draft' | 'For Approval' | 'Approved' | 'Issued' | 'Partially Received' | 'Received' | 'On Hold' | 'Closed' | 'Cancelled';
export type PaymentRequestType = 'RFP' | 'PCV';

export interface Branch {
  code: string; name: string; region: string; gatePassPrefix: string; isHeadOffice: boolean;
  // SUP-06 master-data detail (optional so older records keep compiling)
  regionGroup?: 'Luzon' | 'Visayas' | 'Mindanao'; address?: string; manager?: string; phone?: string; partsMultiplier?: number; issuesGatePasses?: boolean; active?: boolean; inactiveReason?: string;
  /** Staff review 1.2: owning entity (Master data → Entity), the stockroom that serves a branch without its own, and when it was deactivated. */
  entityCode?: string; servedByWarehouse?: string; inactiveAt?: string;
}
export interface EquipmentType {
  code: string; name: string; sort: number; placeholder?: boolean;
  lengthFt?: number; axles?: string[]; hubTypes?: string[]; tags?: string[]; active?: boolean; inactiveReason?: string;
}
/** SUP-06 Warehouse / stockroom master (used by Inventory and the user's default stockroom). */
export interface Warehouse { code: string; name: string; branchCode: string; custodian?: string; active: boolean; inactiveReason?: string }
/** SUP-06 effective-dated rate card row (BR-18: never overwritten — a change closes the old row and opens a new one). */
export interface RateCardRow { id: string; equipmentType: string; contractType: ContractType; contractClass: ContractClass; dailyRate: number; indemnity: number; validFrom: string; validTo?: string; createdBy: string; reason?: string }
/** SUP-06 simple reference list item (axle configs, hub types, tags, entities, departments, categories…). */
export interface MasterListItem { list: string; code: string; name: string; standard?: boolean; active: boolean; inactiveReason?: string }

export interface User {
  userId: string; name: string; designation: string; status: 'Active' | 'Inactive';
  branchCode: string; branchAccess: string[] | 'ALL'; warehouseCode?: string;
  email: string; mobile?: string; roles: RoleCode[]; realm: Realm;
  clientCode?: string; vendorId?: string; lastLogin?: string;
  /** Department scope (DBL-ADM-001) — code from Master data → Other lists → Department. */
  department?: string;
  /** Staff review 1.2: the sign-in before the current one (shown in the user menu and My profile). */
  previousLogin?: string;
  /** Staff review 1.2 (Users & roles): HRIS employee number, region scope (branchAccess then holds that region's branches), backup approver while away, who created the account and when. */
  employeeNo?: string; regionScope?: string; delegateUserId?: string; delegateUntil?: string; createdAt?: string; createdBy?: string;
}

export type RoleCode =
  | 'SYS_ADMIN' | 'BRANCH_GENERALIST' | 'DYM' | 'REGIONAL_MANAGER' | 'OPS_MANAGER' | 'RESCUE_COORDINATOR'
  | 'ACCOUNT_EXECUTIVE' | 'SALES_DIRECTOR' | 'CNC_OFFICER' | 'CNC_MANAGER' | 'ACCOUNTING' | 'TREASURY'
  | 'FINANCE_MANAGER' | 'EXEC_OFFICER' | 'APS_OFFICER' | 'APS_MANAGER' | 'DEPT_HEAD' | 'REGULATORY'
  | 'VP' | 'CEO' | 'CHRO' | 'PRESIDENT' | 'EXECUTIVE' | 'WAREHOUSE' | 'CLIENT' | 'VENDOR' | 'AUDITOR' | 'TECHNICIAN'
  // Staff review 1.2 (sign-in picker): proposed roles, pending Delbros confirmation of their exact permissions.
  | 'BRANCH_HEAD' | 'DISPATCHER' | 'GATE_CLERK';

export interface ContactPerson { id: string; firstName: string; lastName: string; phone: string; email: string; isPrimary?: boolean; isSignatory?: boolean; /** Review 1.2: position / designation; also the billing contact. */ position?: string; isBilling?: boolean;
  /** Staff UI changes V1.4 (row 42, CLT-002/003): identification and specimen signature of an authorised signatory (proposed field set, pending Delbros). */
  signatoryEvidence?: { idType: string; idNumber: string; idExpiry?: string; idFile?: string; specimenFile?: string; verifiedBy?: string; verifiedAt?: string } }

export interface Client {
  clientCode: string; clientName: string; billingName: string; qbName?: string;
  address1: string; address2?: string; city?: string; zipCode?: string; country: string;
  phone?: string; fax?: string; website?: string; email?: string; ebillingEmail?: string;
  billingCycle: 'Weekly' | 'Monthly'; aeAssigned: string; branchCode: string; status: ClientStatus;
  allowLt: boolean; allowSt: boolean; allowOnline: boolean; allowSpecial: boolean; allowRescue: boolean;
  cwsBranchAccess: string[]; notes?: string; isLegal: boolean; isCollectionAgency: boolean;
  creditLimit?: number; registrationSource: 'Internal' | 'Portal'; contacts: ContactPerson[];
  createdAt: string;
  /** Printed on invoices / receipts (SCR-35 correction pass). */
  tin?: string; vatStatus?: 'VAT-registered' | 'Non-VAT' | 'Zero-rated';
  /** Review 1.2 (register / profile): province or region, who created the record, and optional sales details (pending confirmation whether required at registration). */
  province?: string; createdBy?: string; industry?: string; tradeName?: string; leadSource?: string; expectedUnits?: number; contractInterest?: string[];
}

export interface ApprovalStep {
  step: number; label: string; roles: RoleCode[]; decision: ApprovalDecision;
  decidedBy?: string; decidedAt?: string; comment?: string; dueAt?: string;
}

export interface WorkflowInstance {
  id: string; matrixCode: string; title: string; subjectType: string; subjectId: string;
  amount?: number; branchCode?: string; requestedBy: string; requestedAt: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'; steps: ApprovalStep[]; currentStep: number;
}

export interface Accreditation {
  id: string; clientCode: string; status: AccreditationStatus;
  bici: { yearsInOperation?: number; secReg?: string; tin?: string; tradeReferences?: string; bankReferences?: string; siteVisitNotes?: string; creditScore?: number; grade?: string; recommendedTermDays?: number; recommendedLimit?: number; result?: 'Recommend' | 'Do not recommend'; reasoning?: string;
    /** Review 1.2: request details captured at submission (pending confirmation). */
    natureOfBusiness?: string; owners?: string; requestedLimit?: number; requestedTermDays?: number; expectedUnits?: number; requestedTypes?: string[]; remarks?: string };
  workflowId: string; submittedAt: string; submittedBy?: string;
  /** SCR-07: supporting documents (FRS 447), form change log, activation set on VP sign-off (DBL-CLT-005). */
  documents?: { id: string; kind: string; fileName: string; at: string; by: string }[];
  log?: { at: string; by: string; action: string }[];
  activation?: { allowLt: boolean; allowSt: boolean; allowOnline: boolean; allowSpecial: boolean; allowRescue: boolean; cwsBranchAccess: string[]; creditLimit?: number; signOffDate?: string; creditTermDays?: number };
}

export interface ContractRate { equipmentType: string; dailyRate: number; indemnity: number; qty?: number; templateRate?: number }
export interface ContractEvent { status: string; at: string; by: string; note?: string; fileName?: string }
export interface Contract {
  contractNo: string; clientCode: string; contractType: ContractType; class: ContractClass;
  effectiveDate: string; expiryDate?: string; unitQty: number; region: string; signatoryId?: string;
  paymentMethod: string; billingCycle: 'Weekly' | 'Monthly'; creditTermDays: number; cashDeposit: number; lockInMonths: number;
  rates: ContractRate[];
  penalties: { nonReturn: number; deferredCheck: number; lateInterestPct: number; dishonoredCheck: number };
  status: ContractStatus; renewalOf?: string; createdAt: string;
  /** DBL-CLT-008/010 additions — optional so older records keep loading. */
  version?: number; createdBy?: string; aeUserId?: string; branchCode?: string; renewedTo?: string;
  customType?: { name: string; rateStructure: string };
  approval?: { workflowId: string; reason: string; status: 'Pending' | 'Approved' | 'Rejected'; kind: 'Custom type' | 'Rate variance' | 'Custom type + rate variance' };
  termination?: { workflowId: string; reason: string; status: 'Pending' | 'Approved' | 'Rejected'; effectiveDate: string };
  history?: ContractEvent[];
  documents?: { kind: 'Signed copy' | 'Notarized copy' | 'Amendment' | 'Supporting document'; fileName: string; at: string; by: string }[];
  versions?: { version: number; at: string; by: string; reason: string }[];
  /** Review 1.2: Delbros (lessor) signatory, pick-up branch, renewal option and special terms. */
  lessorSignatoryId?: string; pickupBranch?: string; autoRenew?: boolean; specialTerms?: string;
}

export interface CashBond {
  id: string; clientCode: string; contractNo?: string; amount: number; dateReceived: string; receiptRef: string;
  /** Review 1.1: check details when the bond is paid by check. */
  checkNo?: string; checkBank?: string; checkDate?: string;
  status: 'Held' | 'Withdrawal Pending' | 'Refunded' | 'Applied';
  withdrawals: { id: string; amount: number; reason: string; refundable: number; workflowId: string; status: string; requestedAt: string; earlyException?: boolean; refund?: { method: string; date: string; reference: string; by: string } }[];
  paymentMethod?: string; receivedBy?: string; notes?: string; receiptFile?: string;
  /** Review 1.2: branch (from the client), bond type, bank-transfer reference, when it was recorded. */
  branchCode?: string; bondType?: 'New' | 'Top-up' | 'Replacement'; bankRef?: string; recordedAt?: string;
}

export interface Chassis {
  chassisNo: string; chassisType: string; plateNo?: string; branchCode: string; status: ChassisStatus;
  owner: string; ownerEquipmentNo?: string; generalAssessment: Assessment; standard: 'DW' | 'Nakamura';
  remarks?: string; acquisitionDate?: string; currentClientCode?: string; currentContractNo?: string;
  currentGatePassNo?: string; statusSince: string; allocation?: { clientCode: string; contractNo: string; date: string; expectedReturn?: string; targetPickupDate?: string; requestNo?: string; by?: string };
  /** DCIR yard / repair category override (DBL-ALO-003); otherwise derived from status + open job orders. */
  yardCategory?: YardCategory;
  /** Master-record attributes (DBL-CHS-001) and classification tags (DBL-CHS-002). */
  axleConfig?: '2-axle' | '3-axle'; hubType?: 'Spoke' | '8-hole' | '10-hole'; tags?: string[];
  /** Staff review 1.2 (SCR-12): optional technical / maintenance details — which ones are required is pending Delbros confirmation. */
  make?: string; yearBuilt?: number; vinSerial?: string; gpsDeviceNo?: string; tireCount?: number; tireSize?: string;
  lastInspectionDate?: string; nextMaintenanceDate?: string; photos?: string[];
}
export type YardCategory = 'TQS' | 'Roadworthy' | 'Minor Repair' | 'Major Repair';
/** Client unit request — allocation-tracking pipeline (DBL-ALO-002). */
export interface UnitRequest {
  reqNo: string; clientCode: string; contractNo: string; branchCode: string; equipmentType: string; qty: number; targetPickupDate: string;
  requiredParts?: string; notes?: string; allocated: string[]; status: 'Open' | 'Partially Allocated' | 'Allocated' | 'Cancelled'; createdAt: string; createdBy: string;
  /** Staff review 1.2: expected return, request source and pickup contact; cancellation trail. */
  expectedReturn?: string; source?: 'Internal' | 'Portal'; contactName?: string; contactPhone?: string;
  cancelReason?: string; cancelledAt?: string; cancelledBy?: string;
}

export interface Asset {
  assetId: string; category: 'Heavy Equipment' | 'Forklift' | 'Welding Machine' | 'Depot Tool' | 'Stockroom Tool';
  description: string; branchCode: string; location?: string; status: 'Available' | 'In-Use' | 'Under Repair' | 'Retired' | 'Disposed';
  assignedTo?: string; acquisitionDate?: string; lastMaintenanceDate?: string; nextPmDate?: string; notes?: string;
  /** DBL-CHS-006/010/011 — quantity for depot/stockroom tools, identity, condition, PM interval, QR tag, lifecycle. */
  qty?: number; uom?: string; serialNo?: string; make?: string; model?: string; condition?: 'Good' | 'Fair' | 'Poor' | 'Unserviceable';
  pmIntervalDays?: number; qrCode?: string;
  /** Staff review 1.2 (SCR-13): status-since date, PM responsible person, source PO / RR, last meter reading (operating hours). */
  statusSince?: string; pmResponsible?: string; sourceRef?: string; meterHours?: number;
  maintenanceLog?: { date: string; type: 'Preventive' | 'Corrective' | 'Inspection'; notes: string; joNo?: string; by: string; performedBy?: string; cost?: number; meterHours?: number }[];
  disposal?: { action: 'Retire' | 'Dispose'; reason: string; workflowId: string; status: 'Pending Approval' | 'Approved' | 'Rejected'; requestedAt: string };
  /** Staff UI changes V1.4 (row 50): tools issued to individual users / departments and their (partial) returns with condition. */
  issues?: ToolIssue[];
}
export interface ToolIssue { id: string; issuedTo: string; qty: number; issuedAt: string; issuedBy: string; purpose?: string; conditionOut: string; dueBack?: string;
  returns: { qty: number; at: string; by: string; condition: string; notes?: string }[] }

export interface EwaUnit { equipmentType: string; qty: number; usedChassis: string[] }
export interface Ewa {
  euNo: string; clientCode: string; contractNo: string; branchCode: string; driverName: string; driverLicenseNo: string;
  truckPlateNo: string; trucker: string; units: EwaUnit[]; createdAt: string; validUntil: string;
  createdVia: 'Portal' | 'Internal'; status: EwaStatus; extensionCount: number; createdBy: string;
  /** DBL-GAT-003: inbound-leg credentials updated by the Branch Generalist (pre-fill Gate In). */
  inbound?: EwaCredentials; updatedAt?: string; updatedBy?: string;
  cancelledAt?: string; cancelledBy?: string; cancelReason?: string;
}
export interface EwaCredentials { trucker: string; driverName: string; driverLicenseNo: string; truckPlateNo: string }

export interface InspectionLine { part: string; branding?: string; threadDepth?: string; statusCode: string; qty: number; chargeable: number }
export interface GatePass {
  gatePassNo: string; direction: 'OUT' | 'IN'; chassisNo: string; clientCode: string; contractNo: string; euNo?: string;
  trucker: string; truckPlateNo: string; truckOrcr?: string; driverName: string; driverLicenseNo: string;
  generalAssessment: Assessment; inspection: InspectionLine[]; flatTires?: number; vandalized?: boolean;
  signature?: string; actualEventAt: string; encodedAt: string; branchCode: string; originBranchCode?: string;
  crossBranchCode?: string; isForceInbound?: boolean; eirNo: string; pairedGatePassNo?: string; encodedBy: string;
  /** DBL-GAT-005/006 condition notes + damage photo file names; credentialMismatch = fields that differed from the EWA at release. */
  remarks?: string; photos?: string[]; credentialMismatch?: string[];
}
export interface EirReprint { no: number; at: string; by: string; reason: string; copy: 'OUT' | 'IN' }

export interface Eir {
  eirNo: string; gatePassOutNo: string; gatePassInNo?: string; clientCode: string; chassisNo: string; chassisType: string;
  eirOutDate: string; eirInDate?: string; depotCode: string; bookingNo?: string; contractNo: string; reprintCount: number;
  reprints?: EirReprint[];
}

export interface LateEncoding {
  id: string; gatePassNo: string; originalDate: string; correctedDate: string; daysLate: number; reason: string;
  path: 'AUTO' | 'CREDIT_MEMO'; workflowId?: string; status: 'Posted' | 'Pending Approval' | 'Approved' | 'Rejected'; createdAt: string; createdBy: string;
  memoNo?: string; attachment?: string;
  /** Staff UI changes V1.4 (row 19): final state kept on the record after DYM + Treasury approval — when it was approved and the
   *  invoice lines the Credit Memo released (they are no longer "held", so the link would otherwise be lost). */
  approvedAt?: string; releasedLines?: { invoiceNo: string; lineId: string; description: string; days?: number; amount: number }[];
}

export interface JobOrder {
  joNo: string; chassisNo: string; branchCode: string; source: 'Gate In' | 'Rescue' | 'Spot Repair' | 'Scheduled'; sourceRef?: string;
  categories: RepairCategory[]; notes: string; workers: string[]; status: JoStatus; isMajor: boolean; chargeable: boolean;
  spotDriver?: { name: string; license: string; truckPlate: string };
  bom: BomLine[]; labor: { worker: string; hours: number; rate: number; date: string; shift: LaborShift }[];
  createdAt: string; createdBy: string; approvedBy?: string; confirmedBy?: string; closedAt?: string;
  /** Staff review 1.2: planning fields, attachments, hold reason and status history (all optional; older records have none). */
  priority?: 'Normal' | 'Urgent'; targetDate?: string; estimatedCost?: number; photos?: string[];
  /** Client the repair is charged to (Debit Memo, category Repair cost) when chargeable. */
  chargeClientCode?: string;
  holdReason?: string;
  history?: { at?: string; by?: string; status: string; note?: string }[];
  /** Staff UI changes V1.4: per-repair-system closure (row 32, ALO-004 — rule pending), after-repair photos taken at Close by R&M
   *  (row 33; `photos` are the before / damage photos) and the departure that closed the JO "by EIR Out" (row 34). */
  systemsClosed?: { system: RepairCategory; at: string; by: string }[];
  afterPhotos?: string[];
  eirOut?: { gatePassNo: string; eirNo: string; at: string };
}
export interface BomLine { partCode: string; description: string; qty: number; unitCost: number }
// DBL-RM-007 shift split (windows pending Q-RM-02); legacy 'Day' / 'Night' entries read as Morning / Evening.
export type LaborShift = 'Morning' | 'Afternoon' | 'Evening' | 'Day' | 'Night';

export interface RescueRequest {
  rescueNo: string; clientCode: string; chassisNo: string; locationText: string; lat?: number; lng?: number;
  incident: string; sceneContactName: string; sceneContactPhone: string; urgent: boolean; status: RescueStatus;
  requestedAt: string; requestedVia: 'Portal' | 'Internal'; branchCode: string;
  verifiedBy?: string; confirmedBy?: string; crew?: string; dispatchedAt?: string; eta?: string; completedAt?: string;
  chargeable: boolean; oneWayKm?: number; ratePerKm?: number; tireCost?: number; partsCost?: number;
  total?: number; debitMemoNo?: string; blockedReason?: string; acknowledgedAt?: string;
  loadStatus?: 'Loaded' | 'Empty'; photos?: string[]; // US-RES-001 load status + supporting photos at request time
  // DBL-RES-002/005/006/008 (correction pass): eligibility, urgent ack, dispatch log, cost lines, billing evidence, cancel.
  blockedAt?: string; notEligibleBy?: string;
  urgentAckBy?: string; urgentAckAt?: string;
  rescueVehicle?: string; driverName?: string; driverPhone?: string;
  onsiteAssessment?: string; costLines?: RescueCostLine[]; beforePhotos?: string[]; afterPhotos?: string[];
  clientAckName?: string; completedBy?: string; ewalletBalanceAfter?: number;
  cancelReason?: string; cancelledBy?: string; cancelledAt?: string;
  /** Portal review 1.1: problem type chosen by the client (flat tire, brake, mechanical, accident, other) — helps the dispatcher plan crew and parts. */
  problemType?: string;
  /** Staff review 1.2: user who logged the request (portal user or staff member logging on behalf of the client). */
  requestedBy?: string;
}
/** Portal review 1.1 (DBL-CLT-017): client feedback and contract requests (renewal / amendment / termination) sent to the Account Executive. */
export interface ClientFeedback {
  id: string; clientCode: string; category: string; subject: string; message: string; reference?: string;
  submittedAt: string; submittedBy: string; status: 'Submitted' | 'Acknowledged' | 'Closed';
}
export interface RescueCostLine { kind: 'Tire' | 'Part'; partCode: string; description: string; qty: number; unitPrice: number }

export interface Part {
  partCode: string; description: string; uom: string; category: string; standardCost: number; rescuePrice?: number; lowStockThreshold: number;
  // SUP-06 master-data detail (DBL-INV-001/006, DBL-PRC-005/010)
  weightKg?: number; regionalPrices?: Record<string, number>; preferredVendorId?: string; movementClass?: 'Fast' | 'Slow' | 'Non-moving'; scrapFlag?: boolean; reorderQty?: number; active?: boolean; inactiveReason?: string;
  priceHistory?: { validFrom: string; validTo?: string; vendorId?: string; unitCost: number; source: string }[];
}
export interface StockBalance {
  partCode: string; warehouseCode: string; qtyOnHand: number; lastPhysicalCount?: number; lastCountDate?: string; pendingPo?: string;
  /** Owning entity (DBL-PRC-009) and the pre-audit count submission awaiting approval (DBL-INV-004/007). */
  entityCode?: string; bin?: string;
  pendingCount?: { counted: number; auditType: 'Monthly cycle count' | 'Annual audit'; reason?: string; photoName?: string; submittedBy: string; submittedAt: string; workflowId: string };
}
export interface StockTxn {
  id: string; txnNo: string; type: StockTxnType; partCode: string; qty: number; fromWarehouse?: string; toWarehouse?: string; referenceType?: string; referenceId?: string; reason?: string; balanceAfter: number; entityCode: string; at: string; by: string;
  /** SCR-28 ledger detail (DBL-INV-001/003/005/007). Missing status = Posted. */
  status?: 'Posted' | 'Pending Approval' | 'Rejected' | 'Open' | 'Fulfilled' | 'Cancelled'; source?: 'Manual' | 'Auto — PO' | 'Auto — Job Order' | 'Auto — Count'; workflowId?: string;
  joNo?: string; equipmentRef?: string; approvalRef?: string; poNo?: string; orderedQty?: number; requestingBranch?: string; department?: string; requestedBy?: string; damagedQty?: number; remarks?: string;
  /** Staff review 1.2: receiving detail (delivery receipt / supplier invoice, bin, received by, attachment) and request follow-up (needed by, priority, linked transfer). */
  deliveryRef?: string; bin?: string; receivedBy?: string; attachment?: string; unitCost?: number;
  neededBy?: string; priority?: 'Normal' | 'Urgent'; fulfilledQty?: number; fulfilledBy?: string; requestRef?: string; cancelReason?: string;
}

export interface Vendor {
  vendorId: string; name: string; tin: string; address: string; email: string; paymentTerms: string; status: 'Active' | 'Inactive' | 'Pending' | 'Blocked';
  // SUP-06 master-data detail (DBL-PRC-001/002/009/011)
  contactPerson?: string; phone?: string; vatStatus?: 'VAT-registered' | 'Non-VAT'; bankName?: string; bankAccount?: string; paymentMethod?: 'Check' | 'Bank transfer' | 'Cash';
  category?: string; entityCodes?: string[]; portalAccess?: boolean; portalUserId?: string; statusReason?: string;
}
export interface PoLine { partCode: string; description: string; qty: number; unitPrice: number; qtyReceived: number }
export interface PurchaseRequest {
  prNo: string; department: string; requestedBy: string; justification: string; entityCode: string; sourceJo?: string;
  lines: { partCode: string; description: string; qty: number; estUnitCost: number; uom?: string; standardCost?: number; priceOverride?: boolean; supplierId?: string; spec?: string }[]; status: 'Draft' | 'For Approval' | 'Approved' | 'Converted' | 'Rejected';
  /** Staff review 1.2: expense category / cost centre (proposed list, pending chart of accounts), delivery contact, chassis or asset the purchase is for. */
  expenseCategory?: string; costCenter?: string; deliveryContact?: string; forEquipment?: string;
  workflowId?: string; createdAt: string; poNo?: string;
  supplierId?: string; neededBy?: string; priority?: 'Normal' | 'Urgent' | 'Critical'; deliveryWarehouse?: string; stockRef?: string; attachments?: string[];
}
export interface PurchaseOrder { poNo: string; prNo: string; vendorId: string; terms: string; deliveryDate: string; lines: PoLine[]; status: PoStatus; workflowId?: string; entityCode: string; createdAt: string }
export interface ReceivingReport { rrNo: string; poNo: string; receivedDate: string; receivedBy: string; warehouseCode: string; lines: { partCode: string; qtyReceived: number; qtyRejected: number; condition: string }[]; conditionNotes?: string; discrepancy: boolean }
export interface VendorInvoice { id: string; vendorId: string; invoiceNo: string; invoiceDate: string; amount: number; poNo: string; rrNo?: string; fileName?: string; status: 'Submitted' | 'Under Review' | 'Approved' | 'Paid' | 'Rejected'; submittedVia: 'Portal' | 'Internal'; submittedAt: string }
export interface PaymentRequest { docNo: string; type: PaymentRequestType; referenceType: 'PO' | 'RR' | 'Justification'; referenceId: string; payee: string; amount: number; dueDate: string; entityCode: string; status: 'Draft' | 'For Approval' | 'Approved' | 'Paid' | 'Rejected'; workflowId?: string; createdAt: string; justification?: string;
  department?: string; requestedBy?: string; fundingSource?: string; attachments?: string[];
  /** Particulars; for an RFP against POs each line may be allocated to a PO line (many-to-many, DBL-PRC-001). */
  lines?: { description: string; category: string; amount: number; poNo?: string; partCode?: string }[] }

export interface InvoiceLine {
  id: string; lineType: 'Lease' | 'Rescue' | 'Repair' | 'Park & Fix' | 'Penalty' | 'Adjustment' | 'Damage' | 'GPS' | 'Special'; description: string; chassisNo?: string; from?: string; to?: string; days?: number; rate?: number; amount: number; held?: boolean;
  // SCR-34/35 correction pass (DBL-FIN-002/003/004, BR-05): equipment, rate type, late-encoding markers, correction / adjustment audit.
  equipmentType?: string; rateType?: string; lateDays?: number; recalculated?: boolean; heldMemoNo?: string;
  adjType?: string; reason?: string; evidence?: string; by?: string; at?: string; originalDays?: number; originalRate?: number;
  /** Staff review 1.2 (SCR-34): source gate pass (OUT / IN) and EWA behind a lease line. */
  gatePassNo?: string; gatePassInNo?: string; ewaNo?: string;
}
export interface InvoiceEvent { at: string; by: string; action: string; note?: string }
export interface Invoice {
  invoiceNo: string; clientCode: string; contractNo?: string; periodStart: string; periodEnd: string; billType: string;
  lines: InvoiceLine[]; subtotal: number; vat: number; total: number; amountPaid: number; dueDate: string;
  status: InvoiceStatus; issuedAt: string; heldReason?: string; branchCode: string;
  // SCR-35 correction pass: header fields, delivery, history, reprint log.
  batchNo?: string; invoiceDate?: string; billingCycle?: string; creditTermDays?: number; sentTo?: string; sentAt?: string;
  history?: InvoiceEvent[]; printCount?: number; credited?: number; cancelReason?: string;
  /** Staff review 1.2 (SCR-34): client PO / reference and remarks entered on the draft. */
  clientRef?: string; remarks?: string;
}
export type ReceiptStatus = 'Provisional' | 'Cleared' | 'OR Issued' | 'Bounced' | 'Cancelled';
export interface Receipt {
  receiptNo: string; type: 'OR' | 'PR' | 'NVAR'; clientCode: string; date: string; amount: number; method: string; reference?: string; applications: { invoiceNo: string; amount: number }[]; unapplied: number; by: string;
  // SCR-36 correction pass (DBL-FIN-012/013/015): PR → Treasury clearance → OR, check / PDC detail, cancel / bounce.
  status?: ReceiptStatus; orNo?: string; prNo?: string; checkNo?: string; bank?: string; checkDate?: string; pdc?: boolean; depositStatus?: 'Not deposited' | 'Deposited' | 'Cleared' | 'Returned';
  clearedAt?: string; clearedBy?: string; tin?: string; notes?: string; createdAt?: string; cancelReason?: string; cancelledBy?: string; penaltyMemoNo?: string; history?: InvoiceEvent[];
  /** Staff review 1.2 (SCR-36): attachments, branch, deposit details, bounce reason, OR issue time, purpose (e.g. e-wallet funding). */
  attachments?: string[]; branchCode?: string; depositDate?: string; depositSlipNo?: string; depositAccount?: string; depositedBy?: string;
  bounceReason?: string; bouncedBy?: string; bouncedAt?: string; cancelledAt?: string; orIssuedAt?: string; purpose?: 'Invoice payment' | 'E-wallet funding';
}
export interface MemoBreakdown { labor: number; parts: number; travel: number; service: number; inputTax: number }
export interface Memo {
  memoNo: string; type: 'Credit' | 'Debit'; clientCode: string; referenceInvoiceNo?: string; referenceType: string; referenceId?: string; amount: number; reason: string;
  status: 'Draft' | 'Pending Approval' | 'Approved' | 'Posted' | 'Rejected' | 'Applied'; workflowId?: string; createdAt: string;
  // SCR-37 correction pass (DBL-FIN-011, DBL-FIN-003, DBL-RES-006): category, evidence, DM cost breakdown, links, source, approval chain.
  category?: string; evidence?: string[]; breakdown?: MemoBreakdown; joNo?: string; rescueNo?: string; source?: 'Auto' | 'Manual'; createdBy?: string;
  approvalChain?: string[]; appliedTo?: string; balanceAfter?: number; appliedAt?: string;
  /** Staff review 1.2 (SCR-37): VAT basis of the amount, withholding-tax detail, debit-memo settlement, who applied it. */
  vatTreatment?: 'VAT-exclusive' | 'VAT-inclusive' | 'VAT-exempt'; vatAmount?: number;
  wht?: { base: number; rate: number; form2307?: string; quarter?: string }; settlement?: 'Reference invoice' | 'Next invoice' | 'E-wallet'; appliedBy?: string;
}

export interface HoldEvent { id: string; clientCode: string; type: 'Auto Hold' | 'Manual Hold' | 'Reactivated' | 'Re-Hold'; at: string; by: string; outstanding: number; daysOverdue?: number; invoiceNo?: string; reason?: string; effectiveDate?: string; approvedBy?: string; workflowId?: string }
/** Staff UI changes V1.4 (rows 48–49): courier / delivery evidence for an SOA or a final demand letter. */
export interface DeliveryResult { status: 'In transit' | 'Delivered' | 'Returned'; at?: string; receivedBy?: string; podFile?: string; recordedBy?: string; notes?: string }
export interface SoaSend { id: string; soaNo: string; at: string; by: string; channel: 'Email' | 'Courier'; to: string; trackingNo?: string; courier?: string; recipientName?: string; delivery?: DeliveryResult }
/** Row 49 (CNC-006): the final demand letter issued by the Legal department — the last collection step. */
export interface DemandLetterRecord { letterRef: string; legalOwner: string; approvedBy?: string; approvedAt?: string; issuedAt: string; file?: string; amount: number; recipient: string; channel: 'Courier' | 'Personal service' | 'Registered mail'; courier?: string; trackingNo?: string; delivery: DeliveryResult }
export interface CollectionCase { clientCode: string; stage: CollectionStage; stageChangedAt?: string; nextActionDue?: string; actions: { at: string; action: string; by: string; notes?: string; letter?: string }[]; soaSends?: SoaSend[]; acknowledgedAt?: string; pendingWorkflowId?: string;
  /** Staff review 1.2 (SCR-39): collection owner, last client contact and promise-to-pay. */
  ownerUserId?: string; lastContactAt?: string; promiseToPay?: { date: string; amount: number; recordedAt: string; by: string; notes?: string };
  demandLetter?: DemandLetterRecord }
// DBL-CNC-001 authorised override of one blocked gate, time-boxed.
export interface GateOverride { id: string; clientCode: string; action: string; reason: string; validUntil: string; requestedBy: string; requestedAt: string; workflowId: string; status: 'Pending' | 'Approved' | 'Rejected'; approvedBy?: string; approvedAt?: string }

export interface Ewallet {
  clientCode: string; balance: number; minimumBalance: number; createdAt: string;
  // DBL-EWL-001 initial funding evidence (Treasury-cleared receipt)
  createdBy?: string; receiptNo?: string; clearedDate?: string; paymentMethod?: string; bankRef?: string; treasuryRef?: string; treasuryConfirmedBy?: string; treasuryConfirmedAt?: string;
  /** Staff review 1.2 (SCR-40/41): wallet number, creation notes / Treasury attachment, last replenishment reminder. */
  walletNo?: string; notes?: string; attachment?: string; lastReminderAt?: string; lastReminderBy?: string;
}
// DBL-EWL-003 deduction scope + top-up / reversal / adjustment categories
export type EwalletCategory = 'Top-up' | 'Rescue' | 'Repair' | 'Debit Memo' | 'Contract-termination lease' | 'Reversal' | 'Adjustment';
export interface EwalletTxn { id: string; clientCode: string; at: string; type: EwalletTxnType; amount: number; balanceAfter: number; referenceType: string; referenceId?: string; reason?: string; by: string; category?: EwalletCategory; receiptNo?: string; treasuryRef?: string; reversesId?: string; reversedById?: string; workflowId?: string }
export interface TopupRequest { id: string; clientCode: string; amount: number; proofFileName?: string; status: 'Submitted' | 'Confirmed by Treasury' | 'Posted' | 'Rejected'; submittedAt: string; bankRef?: string; paymentRef?: string;
  receiptNo?: string; confirmedBy?: string; confirmedAt?: string; postedBy?: string; postedAt?: string; txnId?: string; rejectedBy?: string; rejectedAt?: string; rejectReason?: string }

export interface Registration {
  id: string; subjectType: 'Chassis' | 'Trailer' | 'Vehicle' | 'Asset' | 'Motorcycle' | 'Prime Mover'; subjectId: string; plateNo: string; orNo: string; crNo: string;
  issueDate: string; expiryDate: string; agency: string; region: string; renewalInProgress: boolean; documents: string[];
  lastNotifiedStage?: '90' | '30' | '14';
  /** Non-chassis units carry their own branch; chassis take it from the chassis master. */
  branchCode?: string; description?: string; pending?: boolean;
  notices?: { at: string; stage: '90' | '30' | '14' | 'expired' | 'manual'; recipients: string }[];
  responsible?: string; followUp?: string; followUpDate?: string; renewalCost?: number; escalatedAt?: string; escalatedTo?: string;
  /** Staff review 1.2: pending (first) registrations — when the unit was acquired, why it is still pending and the expected registration date. */
  acquiredOn?: string; pendingReason?: string; expectedRegDate?: string;
  /** Staff review 1.2: remarks, registration fee paid with its receipt, the open renewal (who / reference / expected date) and past renewals (actual cost, receipt, who). */
  notes?: string; feePaid?: number; feeReceiptNo?: string;
  renewal?: { startedAt: string; startedBy: string; processedBy?: string; reference?: string; expectedDate?: string };
  renewals?: RegistrationRenewal[];
}
export interface RegistrationRenewal { at: string; by: string; orNo: string; crNo?: string; issueDate: string; expiryDate: string; cost?: number; receiptNo?: string; ltoRef?: string; documents?: string[] }

export interface NotificationRule {
  id: string; eventType: string; description: string; recipientRoles: RoleCode[]; namedRecipients: string[]; includeClient: boolean; includeAe: boolean;
  channels: ('Email' | 'SMS' | 'In-App')[]; mode: 'One-time' | 'Repeat until ack'; repeatMinutes?: number; escalationHours?: number; active: boolean; source: string;
  /** SCR-44: who receives the escalation when escalationHours lapses without action/ack. */
  escalateTo?: RoleCode[];
  /** SCR-44: message template ({{placeholders}} resolved at send time) and optional send condition. */
  template?: { subject: string; body: string; sms?: string };
  condition?: string;
  pending?: string;
  /** Runtime only (from the audit log): last save of this rule. Staff review 1.2. */
  lastChangedAt?: string; lastChangedBy?: string;
}
export interface AppNotification { id: string; at: string; title: string; body: string; link?: string; read: boolean; requiresAck: boolean; ackAt?: string; userId: string;
  /** Staff review 1.2: category, the notification rule that produced it, channels used, recipient role, who acknowledged, archived flag. */
  category?: 'Approval' | 'Security' | 'Escalation' | 'Delivery' | 'System' | 'Operations' | 'Finance' | 'Compliance'; ruleId?: string; channels?: string[]; recipientRole?: string; ackBy?: string; archived?: boolean;
  /** Staff UI changes V1.4 (rows 30–31): per-channel delivery state. In-App is Sent when written; Email / SMS stay "Queued" until the
   *  mail / SMS service reports Sent or Failed (the demo never claims a queued message was delivered). */
  delivery?: { channel: string; state: 'Sent' | 'Queued' | 'Failed'; at?: string }[];
}
export interface AuditEvent {
  id: string; at: string; actor: string; action: string; entityType: string; entityId: string; branchCode?: string; before?: unknown; after?: unknown; reason?: string;
  /** NFR-AUD-001: channel / device the action came from, and the hash chain (tamper evidence). */
  source?: string; actorRole?: string; prevHash?: string; hash?: string;
  /** Staff review 1.2: client IP address (recorded by the server in production; sample values in the demo). */
  ip?: string;
}
export interface ParkFixRecord { id: string; chassisNo: string; clientCode: string; branchCode: string; parkInAt: string; reason: 'Idle' | 'Awaiting Repair' | 'Client Request'; parkOutAt?: string; dailyRate: number; status: 'Parked' | 'Released';
  // Gate-receipt pattern + billing feed (DBL-ALO-005)
  clientOwned?: boolean; chassisType?: string; plateNo?: string; service?: 'Park only' | 'Park & Repair' | 'Fix only'; joNo?: string; expectedParkOut?: string;
  /** Staff UI changes V1.4: handling-in charge (row 22, proposed setting) and when it is billed; the final itemized charges stored at park-out
   *  (row 23); DYM sign-off on the receipt (row 21); amounts already billed on interim long-stay memos (row 26). */
  handlingIn?: number; handlingTiming?: 'park_in' | 'park_out'; handlingDmNo?: string;
  charges?: { handling: number; repair: number; park: number; net: number; vat: number; total: number; interimBilled: number; due: number; vatBasis: 'inclusive' | 'exclusive'; repairSource?: string };
  dymSignoff?: { by: string; at: string; note?: string }; interimBilled?: number;
  rateOverrideReason?: string; inReceiptNo?: string; outReceiptNo?: string; reprintCount?: number;
  parkIn?: ParkFixGate; parkOut?: ParkFixGate; billingStatus?: 'Unbilled' | 'Billed'; debitMemoNo?: string; billedAmount?: number;
  /** Staff review 1.2: Park & Repair scope / estimate and the client's parking agreement reference. */
  repairScope?: string; repairEstimate?: number; agreementRef?: string;
}
export interface ParkFixGate { trucker: string; truckPlateNo: string; driverName: string; driverLicenseNo: string; inspection: InspectionLine[]; signature?: string; remarks?: string; by?: string; truckOrcr?: string; photos?: string[] }
export interface SalesActivity {
  id: string; aeUserId: string; clientCode?: string; type: 'Visit' | 'Call' | 'Email' | 'Meeting' | 'Tracker update'; date: string; notes?: string;
  // DBL-CLT-014 fields (correction pass) — optional so older records keep loading.
  at?: string; loggedAt?: string; loggedBy?: string; businessType?: string; location?: string; outcome?: string; outcomeDetails?: string;
  prospectCompany?: string; prospectContact?: string; nextActionDate?: string;
  /** Review 1.2: pipeline and follow-up details (optional, pending confirmation). */
  prospectEmail?: string; leadSource?: string; expectedUnits?: number; estimatedValue?: number; nextAction?: string; followUpOwner?: string; branchCode?: string; attachment?: string;
}
