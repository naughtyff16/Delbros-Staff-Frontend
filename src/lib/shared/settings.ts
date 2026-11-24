// Configuration keys (docs/05-business-rules.md §Configuration keys). Defaults only — runtime values
// come from system_settings and are editable in SUP-05 without a deploy (NFR-006).
export interface SettingDef {
  key: string; label: string; group: string; type: 'number' | 'money' | 'percent' | 'text' | 'json' | 'boolean'; value: unknown; rule: string; pending?: boolean;
  /** SUP-05 edit-dialog metadata (see SETTING_META): unit, allowed range, whole-number flag, choice list, help text. */
  unit?: string; min?: number; max?: number; integer?: boolean; options?: { value: string; label: string }[]; help?: string;
  /** Open decision reference for pending values (docs/10); sensitive = hold/tier/threshold/security values (second approver pending Q-ADM-02). */
  decision?: string; sensitive?: boolean;
  /** Runtime only — stamped by the API on save. */
  updatedBy?: string; updatedAt?: string; effectiveFrom?: string;
  /** A future-dated change waiting for its effective date (BR-18: never rewrites values already stamped on documents). */
  scheduled?: { value: unknown; from: string; by: string; reason: string };
}

export const DEFAULT_SETTINGS: SettingDef[] = [
  { key: 'cnc.hold_threshold_days', label: 'Auto-hold ageing threshold (days)', group: 'Credit & Collection', type: 'number', value: 30, rule: 'BR-02' },
  { key: 'cnc.hold_age_basis', label: 'Ageing measured from', group: 'Credit & Collection', type: 'text', value: 'acknowledgment', rule: 'DBL-CNC-005 (Q-CNC-03)', pending: true },
  { key: 'cnc.tier1_max', label: 'Hold-lift Tier 1 max (Officer 1)', group: 'Credit & Collection', type: 'money', value: 100000, rule: 'BR-03' },
  { key: 'cnc.tier2_max', label: 'Hold-lift Tier 2 max (Officer 1 + Finance Mgr)', group: 'Credit & Collection', type: 'money', value: 500000, rule: 'BR-03' },
  { key: 'cnc.tier3_min', label: 'Hold-lift Tier 3 min (Officers 1, 2, 3)', group: 'Credit & Collection', type: 'money', value: 1000000, rule: 'BR-03' },
  { key: 'cnc.gap_policy', label: 'Policy for ₱500k–₱1M gap', group: 'Credit & Collection', type: 'text', value: 'use_tier3', rule: 'BR-03 (Q-CNC-02)', pending: true },
  { key: 'cnc.first_reminder_days', label: '1st reminder after SOA (days)', group: 'Credit & Collection', type: 'number', value: 5, rule: 'UC-09' },
  { key: 'cnc.second_reminder_days', label: '2nd reminder after SOA (days)', group: 'Credit & Collection', type: 'number', value: 10, rule: 'Q-CNC-04', pending: true },
  { key: 'cnc.demand_letter_days', label: 'Demand letter after SOA (days)', group: 'Credit & Collection', type: 'number', value: 20, rule: 'Q-CNC-04', pending: true },
  { key: 'ewl.min_balance', label: 'E-wallet minimum balance', group: 'E-Wallet', type: 'money', value: 10000, rule: 'BR-04 (Q-001)' },
  { key: 'gat.late_encoding_auto_days', label: 'Late encoding auto-correct window (days)', group: 'Gate Operations', type: 'number', value: 7, rule: 'BR-05' },
  { key: 'gat.ewa_validity_hours', label: 'EWA validity (hours)', group: 'Gate Operations', type: 'number', value: 24, rule: 'BR-06' },
  { key: 'gat.cross_branch_code_ttl_hours', label: 'Cross-branch code validity (hours)', group: 'Gate Operations', type: 'number', value: 72, rule: 'BR-16' },
  // V1.4 row 9: the review read "₱250" in BR-09; the system uses ₱250,000 — kept, and flagged until Delbros confirms the BRD / FRS value.
  { key: 'prc.po_tier_threshold', label: 'PO approval threshold (CEO + CHRO above)', group: 'Procurement', type: 'money', value: 250000, rule: 'BR-09 (value to confirm: ₱250,000 in use)', pending: true },
  { key: 'fin.pcv_max', label: 'Petty cash maximum (RFP above)', group: 'Finance', type: 'money', value: 4000, rule: 'BR-10' },
  { key: 'fin.pcv_fund_float', label: 'Petty cash fund float (per entity)', group: 'Finance', type: 'money', value: 20000, rule: 'BR-10 (Q-PRC-PCF)', pending: true },
  { key: 'reg.renewal_cost_default', label: 'Default registration renewal cost (budget forecast)', group: 'Regulatory', type: 'money', value: 1800, rule: 'DBL-REG-005 (Q-REG-COST)', pending: true },
  { key: 'fin.vat_pct', label: 'VAT rate', group: 'Finance', type: 'percent', value: 0.12, rule: 'BR-11' },
  { key: 'fin.adjustment_approval_threshold', label: 'Billing adjustment approval threshold', group: 'Finance', type: 'money', value: 5000, rule: 'Q-FIN-01', pending: true },
  // SCR-34..37 correction pass — proposed defaults pending Finance decisions.
  { key: 'fin.billable_day_rule', label: 'Billable-day count rule', group: 'Finance', type: 'text', value: 'Pickup and return day both count; never more than the period days', rule: 'SR-004 (Q-FIN-02)', pending: true },
  { key: 'fin.billing_cycles', label: 'Billing cycles offered in the billing run', group: 'Finance', type: 'text', value: 'Weekly,Monthly', rule: 'DBL-FIN-001 (Q-FIN-04: Semi-monthly?)', pending: true },
  { key: 'fin.payment_instructions', label: 'Payment instructions printed on invoices', group: 'Finance', type: 'text', value: 'Check payable to DELBROS LEASING · Bank transfer to the Delbros payee account · Client e-wallet top-up via the portal', rule: 'DBL-FIN-006 (Q-FIN-05)', pending: true },
  // Company details printed on invoices, receipts, EIRs, SOAs and shown on the portal top-up page. Empty until Finance enters them — documents then simply omit the line.
  { key: 'co.registered_address', label: 'Company registered address (printed documents)', group: 'Company', type: 'text', value: '', rule: 'DBL-FIN-006 (docs/12 §9)', pending: true },
  { key: 'co.tin', label: 'Company VAT Reg. TIN incl. branch code (printed documents)', group: 'Company', type: 'text', value: '', rule: 'DBL-FIN-006 (docs/12 §9)', pending: true },
  { key: 'co.bir_permit', label: 'BIR permit / CAS acknowledgment details (document footer)', group: 'Company', type: 'text', value: '', rule: 'RSK-008 (docs/12 §9)', pending: true },
  { key: 'co.payee_bank', label: 'Payee bank and account for client payments / top-ups', group: 'Company', type: 'text', value: '', rule: 'DBL-FIN-006 (Q-FIN-05)', pending: true },
  { key: 'fin.receipt_cancel_role', label: 'Receipt cancel / reverse allowed for', group: 'Finance', type: 'text', value: 'Accounting with reason (audit logged)', rule: 'DBL-FIN-012 (Q-FIN-06)', pending: true },
  { key: 'res.service_charge_pct', label: 'Rescue service charge', group: 'Rescue', type: 'percent', value: 0.1, rule: 'BR-11' },
  { key: 'res.rate_per_km', label: 'Rescue standard rate per km', group: 'Rescue', type: 'money', value: 50, rule: 'BR-11 (value TBD)', pending: true },
  { key: 'res.sla_amber_hours', label: 'Rescue SLA amber after (hours, request → completion)', group: 'Rescue', type: 'number', value: 2, rule: 'DBL-RES-007 (proposed)', pending: true },
  { key: 'res.sla_red_hours', label: 'Rescue SLA red after (hours, request → completion)', group: 'Rescue', type: 'number', value: 4, rule: 'DBL-RES-007 (proposed)', pending: true },
  // Staff UI changes V1.4 (rows 32–33): repair closure rules — proposed, pending Delbros / R&M decision.
  { key: 'rm.closure_rule', label: 'Repair closure — close each repair system, or the whole job order at once', group: 'Repair', type: 'text', value: 'per_system', rule: 'DBL-ALO-004 (proposed — Delbros to confirm)', pending: true },
  { key: 'rm.after_photo_required', label: 'After-repair photo required at Close by R&M', group: 'Repair', type: 'boolean', value: true, rule: 'DBL-RM-002 / RES-006 evidence (proposed)', pending: true },
  { key: 'res.totals_zero_months', label: 'Rescue totals by month — list months with no completed rescue (₱0 rows)', group: 'Rescue', type: 'boolean', value: true, rule: 'DBL-RES-007 (proposed — Delbros to confirm)', pending: true },
  { key: 'rm.hours_per_laborer_week', label: 'Laborer hours per week (headcount planning)', group: 'Repair', type: 'number', value: 48, rule: 'DBL-RM-006 (proposed)', pending: true },
  { key: 'rm.shift_hours', label: 'Shift windows (morning / afternoon / evening)', group: 'Repair', type: 'text', value: 'Morning 06:00–14:00 · Afternoon 14:00–22:00 · Evening 22:00–06:00', rule: 'DBL-RM-007 (Q-RM-02)', pending: true },
  { key: 'ast.pm_due_soon_days', label: 'Non-chassis PM “due soon” flag (days before Next PM)', group: 'Assets & Inventory', type: 'number', value: 7, rule: 'BO-APS-04 (proposed default)', pending: true },
  { key: 'inv.count_cycle_days', label: 'Cycle count due after (days since last count)', group: 'Assets & Inventory', type: 'number', value: 30, rule: 'DBL-INV-004 (monthly cycle)' },
  { key: 'inv.recount_variance_qty', label: 'Variance needing recount (± units)', group: 'Assets & Inventory', type: 'number', value: 5, rule: 'DBL-INV-004 (proposed default)', pending: true },
  { key: 'clt.cash_bond_default', label: 'Default cash bond', group: 'Client & Contract', type: 'money', value: 20000, rule: 'BR-14' },
  { key: 'clt.rate_variance_tolerance_pct', label: 'Contract rate variance vs template needing approval (%)', group: 'Client & Contract', type: 'number', value: 10, rule: 'DBL-ALO-001 / SCR-08 (proposed)', pending: true },
  { key: 'clt.renewal_amber_days', label: 'Contract “expiring soon” flag (days before expiry)', group: 'Client & Contract', type: 'number', value: 90, rule: 'DBL-CLT-011 (3/2/1-month notices)' },
  // Staff review 1.2: contract defaults used by Create lease contract (each contract can still change them). Term limits per type (LTL ≥ 1 year,
  // QLP 10 days–6 months) are fixed business rules (BR-12) checked on the contract, not settings.
  // Staff UI changes V1.4 (rows 38–39): when the sales information and the accreditation request details must be captured — proposed, current behaviour kept.
  { key: 'clt.sales_info_stage', label: 'Sales information (industry, lead source, expected units, contract types) — required at', group: 'Client & Contract', type: 'text', value: 'optional', rule: 'V1.4 row 38 (Sales / C&C decision pending)', pending: true },
  { key: 'clt.request_details_stage', label: 'Accreditation request details (credit limit, term, units, contract types) — supplied by', group: 'Client & Contract', type: 'text', value: 'optional', rule: 'V1.4 row 39 (Delbros decision pending)', pending: true },
  { key: 'clt.default_credit_term_days', label: 'Default credit term on new contracts (days)', group: 'Client & Contract', type: 'number', value: 30, rule: 'SCR-08 contract defaults (proposed)', pending: true },
  { key: 'clt.default_lock_in_months', label: 'Default lock-in for Long-Term contracts (months, pre-termination basis)', group: 'Client & Contract', type: 'number', value: 12, rule: 'BR-12 / BR-15 (to confirm)', pending: true },
  { key: 'clt.penalty_non_return', label: 'Contract penalty default — non-return of unit', group: 'Client & Contract', type: 'money', value: 5000, rule: 'SCR-08 contract defaults (proposed)', pending: true },
  { key: 'clt.penalty_deferred_check', label: 'Contract penalty default — deferred check', group: 'Client & Contract', type: 'money', value: 1000, rule: 'SCR-08 contract defaults (proposed)', pending: true },
  { key: 'clt.penalty_late_interest_pct', label: 'Contract penalty default — late-payment interest (% per month)', group: 'Client & Contract', type: 'number', value: 2, rule: 'SCR-08 contract defaults (proposed)', pending: true },
  { key: 'clt.penalty_dishonored_check', label: 'Contract penalty default — dishonoured check', group: 'Client & Contract', type: 'money', value: 2500, rule: 'SCR-08 contract defaults (proposed)', pending: true },
  { key: 'sal.target_new_accreditations', label: 'Monthly target per AE — new accreditations', group: 'Sales targets', type: 'number', value: 2, rule: 'DBL-CLT-015 (proposed)', pending: true },
  { key: 'sal.target_combined_calls', label: 'Monthly target per AE — combined calls (calls + visits)', group: 'Sales targets', type: 'number', value: 40, rule: 'DBL-CLT-015 (proposed)', pending: true },
  { key: 'sal.target_weekly_visits', label: 'Weekly target per AE — client visits', group: 'Sales targets', type: 'number', value: 3, rule: 'DBL-CLT-015 (proposed)', pending: true },
  { key: 'sal.target_tracker_compliance_pct', label: 'Target per AE — tracker-update compliance (%)', group: 'Sales targets', type: 'number', value: 90, rule: 'DBL-CLT-015 (definition Q-CLT-03)', pending: true },
  { key: 'sal.tracker_logging_days', label: 'Tracker update counts as on time if logged within (days)', group: 'Sales targets', type: 'number', value: 1, rule: 'DBL-CLT-015 (definition Q-CLT-03)', pending: true },
  { key: 'wf.escalation_hours', label: 'Approval escalation timer — global fallback (hours)', group: 'Workflow', type: 'number', value: 48, rule: 'DBL-NOT-005' },
  // SUP-05 per-approval-type escalation timers (baseline 1–2 days, configurable per type). Read by core startWorkflow/decide.
  ...([['PAYMENT_REQUEST', 'RFP / PCV'], ['PR_PO', 'PR / PO'], ['JOB_ORDER', 'Job order confirmation'], ['HOLD_LIFT', 'Hold-to-Active'], ['CONTRACT_SIGNATURE', 'Contract signature'], ['ACCREDITATION', 'Accreditation'], ['MEMO', 'Credit / debit memo']] as const)
    .map(([t, l]): SettingDef => ({ key: `wf.escalation_hours.${t}`, label: `Escalation timer — ${l} (hours)`, group: 'Workflow', type: 'number', value: 48, rule: 'DBL-NOT-005' })),
  // Staff review 1.2: the IT-step timers used by the sample approvals (proposed, pending Delbros confirmation). Counted from when the step starts.
  ...([['USER_ACCESS', 'User access', 24], ['ACCOUNT_UNLOCK', 'Account unlock', 8], ['EWA_EXTENSION', 'EWA extension', 4], ['CROSS_BRANCH_RETURN', 'Cross-branch return code', 24]] as const)
    .map(([t, l, h]): SettingDef => ({ key: `wf.escalation_hours.${t}`, label: `Escalation timer — ${l} (hours)`, group: 'Workflow', type: 'number', value: h, rule: 'DBL-NOT-005 (proposed)', pending: true })),
  // SUP-05 configurable items added after review (gate-pass, registration, pricing, eligibility, scoring, routing)
  // Staff review 1.2: default aligned with the numbers in use (GP-MNL-000880 = prefix + 6 digits); the final format is still pending.
  { key: 'gat.gatepass_seq_digits', label: 'Gate-pass number length (digits after branch prefix)', group: 'Gate Operations', type: 'number', value: 6, rule: 'DBL-GAT-007 (Q-GAT-07)', pending: true },
  { key: 'reg.notice_days', label: 'Registration renewal notices (days before expiry)', group: 'Regulatory', type: 'text', value: '90,30,14', rule: 'DBL-REG-003' },
  { key: 'reg.renewal_cycle_months', label: 'Registration renewal cycle (months, LTO rules)', group: 'Regulatory', type: 'number', value: 12, rule: 'DBL-REG-001 (Q-REG-02)', pending: true },
  { key: 'prc.pr_routing', label: 'PR / PO approval routing gates', group: 'Procurement', type: 'text', value: 'DEPT_HEAD>APS_MANAGER>APS_OFFICER', rule: 'DBL-PRC-002' },
  { key: 'fin.rfp_funding_route', label: 'RFP funding route', group: 'Procurement', type: 'text', value: 'treasury', rule: 'DBL-FIN-014 (Q-FIN-03)', pending: true },
  { key: 'prc.branch_parts_multiplier', label: 'Branch parts markup multiplier (default)', group: 'Procurement', type: 'number', value: 1, rule: 'DBL-PRC-006 (Should)' },
  { key: 'prc.rescue_parts_uplift_pct', label: 'Rescue parts uplift over standard cost', group: 'Procurement', type: 'percent', value: 0.15, rule: 'DBL-PRC-004 (Q-005)', pending: true },
  { key: 'prc.price_rounding', label: 'Price rounding rule', group: 'Procurement', type: 'text', value: 'half_up_peso', rule: 'DBL-PRC-005 (Q-005)', pending: true },
  { key: 'inv.low_stock_default', label: 'Low-stock threshold — flag at this level or fewer (default per part)', group: 'Assets & Inventory', type: 'number', value: 5, rule: 'DBL-RPT-004' },
  { key: 'clt.default_allow_lt', label: 'Default eligibility — Allow Long-Term', group: 'Client & Contract', type: 'boolean', value: true, rule: 'DBL-CLT-004' },
  { key: 'clt.default_allow_st', label: 'Default eligibility — Allow Short-Term', group: 'Client & Contract', type: 'boolean', value: true, rule: 'DBL-CLT-004' },
  { key: 'clt.default_allow_online', label: 'Default eligibility — Allow Online (portal EWA)', group: 'Client & Contract', type: 'boolean', value: false, rule: 'DBL-CLT-004' },
  { key: 'clt.default_allow_rescue', label: 'Default eligibility — Allow Rescue', group: 'Client & Contract', type: 'boolean', value: true, rule: 'DBL-CLT-004' },
  { key: 'clt.default_allow_special', label: 'Default eligibility — Allow Special', group: 'Client & Contract', type: 'boolean', value: false, rule: 'DBL-CLT-004' },
  { key: 'clt.credit_score_model', label: 'Accreditation credit-scoring model (weights + pass mark)', group: 'Client & Contract', type: 'json', value: '{"yearsInOperation":25,"financials":35,"tradeReferences":25,"bankReferences":15,"passMark":70}', rule: 'DBL-CLT-006 (Q-CLT-04)', pending: true },
  { key: 'not.urgent_repeat_minutes', label: 'Urgent SMS repeat interval (minutes)', group: 'Workflow', type: 'number', value: 15, rule: 'DBL-NOT-003' },
  { key: 'auth.max_failed_logins', label: 'Max failed logins before lock', group: 'Security', type: 'number', value: 5, rule: 'SCR-01' },
  { key: 'auth.lockout_minutes', label: 'Lockout duration (minutes)', group: 'Security', type: 'number', value: 30, rule: 'SCR-01' },
  { key: 'auth.password_min_length', label: 'Password minimum length', group: 'Security', type: 'number', value: 10, rule: 'SCR-02' },
  { key: 'alo.idle_days_threshold', label: 'Idle unit flag after (days)', group: 'Allocation', type: 'number', value: 30, rule: 'DCIR (TBD)', pending: true },
  { key: 'alo.reg_warn_days', label: 'Registration “Expiring” window (days) — Chassis master, Allocation board and Allocate warning; expired = blocked', group: 'Allocation', type: 'number', value: 14, rule: 'DBL-ALO-003 (proposed default — confirm rule)', pending: true },
  { key: 'alo.parkfix_daily_rate', label: 'Park & Fix daily rate (override needs Park & Fix approve permission)', group: 'Allocation', type: 'money', value: 350, rule: 'DBL-ALO-005 (Q-ALO-02)', pending: true },
  // Staff UI changes V1.4 (row 51): how the contracted-unit limit applies to new unit requests — proposed "warn"; Sales / Operations to approve.
  { key: 'alo.contract_unit_limit', label: 'Contracted-unit limit on new unit requests (on hire + allocated + requested)', group: 'Allocation', type: 'text', value: 'warn', rule: 'DBL-ALO-001 (proposed — Sales / Operations to approve)', pending: true },
  // Staff UI changes V1.4 (rows 22, 24, 26): Park & Fix billing rules — proposed defaults, Finance / Delbros to approve.
  { key: 'alo.parkfix_handling_in', label: 'Park & Fix handling-in charge (per trailer)', group: 'Allocation', type: 'money', value: 500, rule: 'DBL-ALO-005 legacy receipt (proposed amount — Finance to approve)', pending: true },
  { key: 'alo.parkfix_handling_timing', label: 'Park & Fix handling-in charge billed at', group: 'Allocation', type: 'text', value: 'park_out', rule: 'DBL-ALO-005 (proposed — Finance to approve)', pending: true },
  { key: 'alo.parkfix_vat_basis', label: 'Park & Fix VAT basis (rate, handling and repair amounts)', group: 'Allocation', type: 'text', value: 'inclusive', rule: 'DBL-ALO-005 (VAT basis pending Finance)', pending: true },
  { key: 'alo.parkfix_long_stay', label: 'Park & Fix long-stay billing', group: 'Allocation', type: 'text', value: 'park_out_only', rule: 'DBL-ALO-005 (proposed — Finance to approve)', pending: true },
  { key: 'alo.dcir_snapshot_days', label: 'DCIR nightly snapshot retention (days)', group: 'Allocation', type: 'number', value: 90, rule: 'DBL-ALO-003 (proposed default — confirm retention)', pending: true },
];

export type SettingsMap = Record<string, number | string>;
export const settingsToMap = (defs: SettingDef[]): SettingsMap => Object.fromEntries(defs.map((d) => [d.key, d.value as number | string]));

// ── SUP-05 edit metadata (unit, range, choices, help, decision ref) ─────────
// Kept separate from DEFAULT_SETTINGS so other modules can add keys freely; settingMeta() fills sensible
// defaults (unit + whole-number range) from the type/label for keys without an entry here.
const D = { unit: 'days', integer: true } as const;
const H = { unit: 'hours', integer: true } as const;
export const SETTING_META: Record<string, Partial<SettingDef>> = {
  'cnc.hold_threshold_days': { ...D, min: 1, max: 365, sensitive: true, help: 'A client goes On Hold automatically when any balance is older than this many days. Hold status is re-evaluated whenever balances change, so lowering the value can put clients on hold immediately.' },
  'cnc.hold_age_basis': { decision: 'Q-CNC-03', options: [{ value: 'acknowledgment', label: 'Client acknowledgment of receipt (DBL-CNC-005)' }, { value: 'invoice_date', label: 'Invoice date' }, { value: 'due_date', label: 'Due date' }],
    help: 'DBL-CNC-005 measures the 30-day window from the client’s acknowledgment of receipt, so the default is acknowledgment. The SOA/invoice needs an acknowledgment-date field to support it. Still to be confirmed by Delbros.' },
  'cnc.tier1_max': { min: 1, sensitive: true }, 'cnc.tier2_max': { min: 1, sensitive: true }, 'cnc.tier3_min': { min: 1, sensitive: true },
  'cnc.gap_policy': { decision: 'Q-CNC-02', sensitive: true, options: [{ value: 'use_tier3', label: 'Route to Tier 3 (Officers 1, 2, 3)' }, { value: 'use_tier2', label: 'Route to Tier 2 (Officer 1 + Finance Mgr)' }] },
  'cnc.first_reminder_days': { ...D, min: 1, max: 90 }, 'cnc.second_reminder_days': { ...D, min: 1, max: 120, decision: 'Q-CNC-04' }, 'cnc.demand_letter_days': { ...D, min: 1, max: 180, decision: 'Q-CNC-04' },
  'ewl.min_balance': { decision: 'Q-001' },
  'gat.late_encoding_auto_days': { ...D, min: 1, max: 60 }, 'gat.ewa_validity_hours': { ...H, min: 1, max: 168 },
  'gat.cross_branch_code_ttl_hours': { ...H, min: 1, max: 336, pending: true, decision: 'Q-GAT-05', help: 'BR-16 requires the IT-issued code but gives no validity period. 72 hours is a proposed default; confirm the source.' },
  'gat.gatepass_seq_digits': { unit: 'digits', integer: true, min: 4, max: 8, decision: 'Q-GAT-07', help: 'Gate passes in use have 6 digits after the branch prefix (e.g. GP-MNL-000880). The FRS examples (GEN0001 / CEB0001) use 4 — Delbros to confirm the final format. The per-branch prefix is maintained in Master data → Branches.' },
  'reg.notice_days': { help: 'Comma-separated days before expiry: 3 months, 1 month, 2 weeks. Drives notification rules N25/N26.' },
  'reg.renewal_cycle_months': { unit: 'months', integer: true, min: 1, max: 60, decision: 'Q-REG-02', help: 'LTO renewal cadence; confirm whether it follows plate ending or registration date.' },
  'prc.po_tier_threshold': { min: 1, sensitive: true, decision: 'V1.4 row 9 — BR-09 amount', help: 'Up to this amount the APS / MMG Manager gives the final approval; above it both the CEO and the CHRO must approve (two separate signatures). The V1.4 review quoted ₱250; ₱250,000 is in use until Delbros confirms the BRD / FRS value.' },
  'prc.pr_routing': { sensitive: true, options: [{ value: 'DEPT_HEAD>APS_MANAGER>APS_OFFICER', label: 'Dept Head → Admin → APS → final approval (APS/MMG Manager, or CEO + CHRO above the PO threshold)' }, { value: 'DEPT_HEAD>APS_OFFICER', label: 'Dept Head → APS → final approval (APS/MMG Manager, or CEO + CHRO above the PO threshold)' }], help: 'Gates every PR/PO passes before the amount-based final approval: up to the PO threshold the APS/MMG Manager approves, above it CEO + CHRO (BR-09). Same steps as on the New purchase request dialog.' },
  'fin.rfp_funding_route': { decision: 'Q-FIN-03', options: [{ value: 'treasury', label: 'Treasury releases (check / transfer)' }, { value: 'branch_fund', label: 'Branch revolving fund, Treasury replenishes' }] },
  'prc.branch_parts_multiplier': { unit: '×', min: 0.5, max: 3, help: 'Applied to the standard part price per branch. Per-branch overrides are set in Master data → Branches.' },
  'prc.rescue_parts_uplift_pct': { decision: 'Q-005', help: 'Rescue price = standard cost × (1 + uplift); BR-11 then adds the 10% service charge and 12% VAT. Confirm the uplift is intended (possible double mark-up).' },
  'prc.price_rounding': { decision: 'Q-005', help: 'Applies to part prices only (rescue price and regional prices in Master data → Parts). Invoices, memos and receipts always keep centavos (2 decimals), e.g. rescue debit memos of ₱18,048.80.', options: [{ value: 'half_up_peso', label: 'Round half up to the peso' }, { value: 'centavo', label: 'Keep centavos (2 decimals)' }, { value: 'ceil_peso', label: 'Always round up to the peso' }] },
  'inv.low_stock_default': { unit: 'units', integer: true, min: 0, max: 10000, help: 'A line is Low when on hand is at or below this value (5 → 5 or fewer). Used when a part has no own low-stock level in Master data → Parts.' },
  'fin.vat_pct': { sensitive: true }, 'fin.adjustment_approval_threshold': { decision: 'Q-FIN-01' }, 'res.rate_per_km': { decision: 'Q-RES-01' },
  'clt.credit_score_model': { decision: 'Q-CLT-04', help: 'Weights (must total 100) and pass mark used in the C&C investigation (BICI). Proposed default; confirm the model with Credit & Collection.' },
  'wf.escalation_hours': { ...H, min: 1, max: 168, help: 'Used for approval types without their own timer.' },
  'not.urgent_repeat_minutes': { unit: 'minutes', integer: true, min: 1, max: 240, pending: true, decision: 'Q-NOT-01', help: 'Repeat-until-acknowledged is required; the interval and the SMS category scope are open in the FRS.' },
  'auth.max_failed_logins': { unit: 'attempts', integer: true, min: 3, max: 10, pending: true, decision: 'Q-SEC-01', sensitive: true },
  'auth.lockout_minutes': { unit: 'minutes', integer: true, min: 5, max: 1440, pending: true, decision: 'Q-SEC-01', sensitive: true },
  'auth.password_min_length': { unit: 'characters', integer: true, min: 8, max: 64, pending: true, decision: 'Q-SEC-01', sensitive: true },
  'rm.closure_rule': { decision: 'V1.4 row 32', options: [{ value: 'per_system', label: 'Per repair system — every system on the JO is closed before Close by R&M (proposed)' }, { value: 'per_jo', label: 'Per job order — one Close by R&M closes every system' }],
    help: 'ALO-004: a chassis returns from Breakdown / In Repair to Available only when every required repair is closed and the quality sign-off (TQS) is done.' },
  'clt.sales_info_stage': { decision: 'V1.4 row 38', options: [{ value: 'optional', label: 'Optional everywhere (current)' }, { value: 'registration', label: 'Required at registration' }, { value: 'accreditation', label: 'Optional at registration, required before submitting for accreditation' }],
    help: 'Values entered at registration are kept on the client and carried into accreditation either way.' },
  'clt.request_details_stage': { decision: 'V1.4 row 39', options: [{ value: 'optional', label: 'Optional at submission (current)' }, { value: 'submission', label: 'Required from the AE at submission' }, { value: 'investigation', label: 'Completed by C&C / Finance during the investigation (hidden at submission)' }] },
  'alo.idle_days_threshold': { ...D, min: 1, max: 365 },
  'alo.parkfix_handling_in': { decision: 'V1.4 row 22', help: 'Charged once per trailer for handling it into the depot (legacy receipt "handling details"). Amount is a proposed default.' },
  'alo.parkfix_handling_timing': { decision: 'V1.4 row 22', options: [{ value: 'park_out', label: 'On the park-out Debit Memo, with the parking fee (proposed)' }, { value: 'park_in', label: 'At park-in, on its own Debit Memo' }] },
  'alo.parkfix_vat_basis': { decision: 'V1.4 row 25', sensitive: true, options: [{ value: 'inclusive', label: 'VAT-inclusive — amounts include 12% VAT (proposed; matches DM-000039 = 8 × ₱350)' }, { value: 'exclusive', label: 'VAT-exclusive — 12% VAT added on top' }],
    help: 'Applies to the daily rate, the handling-in charge and the repair amount. The breakdown on the receipt and the Debit Memo uses the same basis.' },
  'alo.parkfix_long_stay': { decision: 'V1.4 row 26', options: [{ value: 'park_out_only', label: 'Bill once at park-out (current)' }, { value: 'monthly_interim', label: 'Interim Debit Memo every 30 days, balance at park-out' }],
    help: 'With interim billing, the park-out bill deducts the amounts already billed so nothing is charged twice. Repair charges join the bill when the job order is closed.' },
  'alo.contract_unit_limit': { decision: 'V1.4 row 51', options: [{ value: 'warn', label: 'Warn only — the request can still be logged (current)' }, { value: 'block', label: 'Block — amend the contract first' }],
    help: 'Counts units on hire, allocated and still requested on the contract plus the new request. Delbros to approve a hard limit or a controlled override.' },
};

/** Full definition for the edit dialog: base def + SETTING_META + defaults inferred from type/label. */
export function settingMeta(def: SettingDef): SettingDef {
  const m = { ...def, ...SETTING_META[def.key] };
  if (def.key.startsWith('wf.escalation_hours.')) Object.assign(m, { ...H, min: 1, max: 168, help: m.help ?? 'Hours an approval step of this type may wait before it escalates (baseline 1–2 days).' });
  if (m.type === 'money') { m.unit ??= '₱'; m.min ??= 0; m.max ??= 100_000_000; }
  if (m.type === 'percent') { m.unit ??= '%'; m.min ??= 0; m.max ??= 1; }
  if (m.type === 'number' && !m.unit) {
    const u = /\((days|hours|minutes|months|%)/i.exec(m.label)?.[1]?.toLowerCase() ?? (/days/i.test(m.label) ? 'days' : undefined);
    if (u) { m.unit = u; m.integer ??= u !== '%'; } m.min ??= 0; m.max ??= u === '%' ? 100 : 100_000;
  }
  if (m.pending && !m.decision) m.decision = /\((Q-[A-Z0-9-]+)/.exec(m.rule)?.[1] ?? /^(Q-[A-Z0-9-]+)/.exec(m.rule)?.[1];
  return m;
}

/** SUP-05 validation of a candidate value. Returns an error message or undefined. */
export function validateSetting(def: SettingDef, raw: unknown): string | undefined {
  const d = settingMeta(def);
  if (d.type === 'boolean') return typeof raw === 'boolean' ? undefined : 'Choose Yes or No.';
  if (d.options) return d.options.some((o) => o.value === raw) ? undefined : 'Choose one of the listed options.';
  if (d.type === 'json') { try { JSON.parse(String(raw)); return undefined; } catch { return 'Enter valid JSON.'; } }
  if (d.type === 'text') return String(raw ?? '').trim() ? undefined : 'A value is required.';
  const s = String(raw ?? '').trim();
  if (!s) return 'A value is required.';
  const n = Number(s);
  if (!Number.isFinite(n)) return 'Enter a number (digits only).';
  if (n < 0) return 'Negative values are not allowed.';
  if (d.integer && !Number.isInteger(n)) return 'Enter a whole number.';
  const shown = (v: number) => (d.type === 'percent' ? `${Math.round(v * 1000) / 10}%` : d.type === 'money' ? `₱${v.toLocaleString('en-PH')}` : `${v}${d.unit ? ` ${v === 1 ? d.unit.replace(/s$/, '') : d.unit}` : ''}`);
  if (d.min != null && n < d.min) return n === 0 ? `Zero is not allowed — minimum is ${shown(d.min)}.` : `Minimum is ${shown(d.min)}.`;
  if (d.max != null && n > d.max) return `Maximum is ${shown(d.max)}.`;
  return undefined;
}
