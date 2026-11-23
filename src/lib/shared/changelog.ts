// Temporary change log — explains the order of the correction / UI-UX work to the project team.
// Shown as a sticky "Change log" button (bottom-right) on the staff and portal sign-in pages while app-config.json has "showChangeLog": true. Hide: set it to false (no rebuild).
// Remove later: search for CHANGELOG-REMOVE — this file, src/lib/ui/ChangeLog.tsx, one line on each login page, scripts/changelog-md.mjs and CHANGELOG.md.
// Keep in step with CHANGELOG.md at the project root.

export interface ChangeEntry {
  date: string; // ISO date
  title: string;
  kind: 'Fix' | 'Feature' | 'Report' | 'Housekeeping';
  why: string;
  changes: string[];
  result?: string;
}

export const CHANGELOG: ChangeEntry[] = [
  {
    "date": "2026-11-16",
    "kind": "Report",
    "title": "Staff review 1.2 — audit report with screenshots",
    "why": "Requested: fix every point of the v1.2 corrections list (doc/v 1.2 -new corrections list - have to fix it.docx) and record how to verify each one.",
    "changes": [
      "New folder doc/audit-review-1.2: open index.html. For each of the 87 reviewed screens it shows every review item with its status (Fixed, Data fixed, Already built, Answered, Open), what was done and how to check it, plus the reviewer’s screenshot, the build before this pass and the build after it.",
      "771 review items traced: 459 fixed, 81 sample-data corrections, 132 already in the build, 159 answered, 176 needing a Delbros decision (listed together at the end of the report with a recommendation each). Some items carry two tags.",
      "Mock DB version 15: saved demo data reloads once on first load."
    ],
    "result": "Typecheck clean · 36/36 unit tests · production build and no-CDN check pass."
  },
  {
    "date": "2026-11-16",
    "kind": "Fix",
    "title": "Staff review 1.2 — sign-in, dashboard, approvals, notifications, reports",
    "why": "v1.2 corrections list, screens 1–5 and 74–77.",
    "changes": [
      "Sign-in picker: each demo user shows branch scope and a permission summary; proposed Branch Head, Rescue Dispatcher and Gate Clerk roles (BH.MNL, DISP.MNL, GATE.MNL).",
      "Dashboard: approval lines show requester, branch, submitted and due time with a link; new “Alerts for your role” row; each fleet tile says what it counts.",
      "My approvals: reference, record link and priority columns, all approval types in the filter, submitted-date filter, Decided by / on; /approvals?id=… opens one request.",
      "Notifications: category, rule, channels, recipient and acknowledgement; read / unread, archive, filters, date groups and paging. User menu: My profile page, branch scope, last sign-in, Help.",
      "Reports: registered / unregistered report filters from the data, run date and run by, Agency column, pending-registration details; Executive “Collected” counts cleared receipts only, new tiles; Report library adds 5 reports (57 in all) with who can open, formats and last run."
    ]
  },
  {
    "date": "2026-11-16",
    "kind": "Fix",
    "title": "Staff review 1.2 — EWA, Gate Out / In, EIR and late encoding",
    "why": "v1.2 corrections list, screens 6–17.",
    "changes": [
      "EWA list: driver licence, client hold pill, cancelled by and reason, Release button (opens Gate Out with the EU number checked), Region filter, printable detail. New EWA: client status, units available per line, confirmation with the EU number and who was notified.",
      "Gate Out / Gate In: status, hold, trucker and licence, counts and totals; units allocated to the client listed first; receive screen adds trucker, truck OR/CR, EIR number, days on hire and an “On finalise” summary.",
      "Force inbound: chassis picked from units on hire with contract indemnity and balance; loss date / place, settlement type and attachments.",
      "EIR and late encoding: one date rule on Gate In and EIR, View button, condition and damages, approver names and dates, overdue flag, billing-impact estimate and a status history.",
      "Sample data: Pacific Movers’ released unit swapped so no unit leaves after the hold date (BR-01); late-encoding records dated after their gate passes."
    ]
  },
  {
    "date": "2026-11-16",
    "kind": "Fix",
    "title": "Staff review 1.2 — allocation, DCIR, Park & Fix, rescue and repair",
    "why": "v1.2 corrections list, screens 18–32.",
    "changes": [
      "Allocation board: ownership chips, who allocated, requester and pickup contact, “type not rated on contract” flag; unit request detail view, contract usage, expected return and contact on new requests.",
      "DCIR: Expired (all) column, by equipment type and ownership table, snapshot time; Park & Fix: Truck OR/CR, damage photos, tire positions, agreement reference, detail view with both gate receipts.",
      "Rescue: problem type, dispatch branch, checks (C&C, Sales, SMS) and dispatch columns, branch filter, e-wallet balance on the request form.",
      "Job orders: total cost and four new filters; priority, target date, estimate, photos and the client to charge on create; status history and hold reason on the detail. Labor reports: rates, drill-downs, capacity legend and more efficiency columns.",
      "Sample data: job order numbers follow the chassis home branch (JO-NVL-000498 / 000512); rescues have problem type and requester."
    ]
  },
  {
    "date": "2026-11-16",
    "kind": "Fix",
    "title": "Staff review 1.2 — clients, accreditation, contracts, cash bonds and sales",
    "why": "v1.2 corrections list, screens 33–44.",
    "changes": [
      "Register client / profile: province, trade name, contact position, signatory, billing email, sales information; profile shows cash bond, contract expiry and term, TIN, SEC / DTI.",
      "Clients list: status chips, credit term, contract types, eligibility flags, overdue amount. Accreditation: attempt number, submitted by, decided, granted terms, attachments and notes.",
      "Create lease contract: Delbros signatory, pick-up branch, auto-renew, special terms, supporting documents; defaults from settings. Cash bonds: branch, method, withdrawal requester and steps; ledger By column.",
      "Sales: Team total, AE region, new-client names, pipeline line, activity drawer; log activity adds pipeline and follow-up fields.",
      "Sample data: Metro contract term fixed to the 1-year LTL minimum; client addresses, ZIP and province corrected; cash bond details completed."
    ]
  },
  {
    "date": "2026-11-16",
    "kind": "Fix",
    "title": "Staff review 1.2 — billing, receipts, memos, e-wallet and credit",
    "why": "v1.2 corrections list, screens 45–57.",
    "changes": [
      "Bill generation: client PO / remarks per draft, predicted invoice number, dates billed with gate passes and EWA per line, generated by and when.",
      "Invoices: branch and contract, sent / emailed, payment method, held amount with credit memo link, row icons and a totals footer.",
      "Receipts: deposit details, bounce reason and penalty, cleared by, OR issued, attachments, totals per status; “Apply unapplied credit”.",
      "Memos: VAT treatment, withholding-tax computation, source record, settlement, days pending, rejection reason, “Apply to invoice”. E-wallets: wallet number, created from cleared receipts only, reminders.",
      "Aging and client status: credit limit and term, collection owner, last contact and promise to pay; contract card and pending items; on-hire estimate from each unit’s contract rate.",
      "Sample data: receipts renumbered into date order; invoice dates follow their numbers."
    ]
  },
  {
    "date": "2026-11-16",
    "kind": "Fix",
    "title": "Staff review 1.2 — chassis, assets, inventory and procurement",
    "why": "v1.2 corrections list, screens 58–69.",
    "changes": [
      "Chassis: days in status with idle flag, location / last move with open job order, Gate Out blocked badge, technical and maintenance fields, EIR history with condition.",
      "Assets: acquisition date, PM interval and responsible, disposal request details, maintenance cost and meter.",
      "Inventory: reorder level, bin, unit cost and supplier per line; ledger value and approver; requests can be fulfilled or cancelled; receiving updates the PO and creates an RR.",
      "Purchase request: entity codes match inventory (NAK, KNEX), WH-DVO delivery, chassis / asset, expense category, cost centre, line specification and named approvers."
    ]
  },
  {
    "date": "2026-11-16",
    "kind": "Fix",
    "title": "Staff review 1.2 — compliance and administration",
    "why": "v1.2 corrections list, screens 70–73 and 78–87.",
    "changes": [
      "Registration: unit type, OR/CR copy flag, last / next notice, renewal in progress with who and when, renewal history with actual cost; compliance dashboard share and actual spend.",
      "Users & roles: contact, employee no., created, override badge, failed sign-ins and lock; Edit, Reset password, Unlock, Deactivate / Reactivate; branch scope choice and backup approver.",
      "Settings: effective date, last change and history per row; 6 proposed contract settings. Master data branches: entity, served-by stockroom, manager picker.",
      "Audit log: event number, branch, source and IP, sensitivity filter, Newer / Older in the event detail. Notification rules: module, condition, all recipients, last changed."
    ]
  },
  {
    "date": "2026-11-02",
    "kind": "Report",
    "title": "Staff review 1.1 — audit report with screenshots",
    "why": "Requested: check every point of Staff UI Changes Review 1.1 (doc/Staff UI Changes_Review_1.1.docx), fix what can be built, and record how to verify each one.",
    "changes": [
      "New folder doc/audit-review-1.1: open index.html. For each of the 66 reviewed screens it shows every review item with its status (Fixed, Data fixed, Already built, Answered, Open), what was done and how to check it, plus three screenshots: the reviewer’s, the build before this pass and the build after it.",
      "638 review items traced: 203 fixed, 45 sample-data corrections, 183 already in the build (with where to find them), 64 answered, 184 needing a Delbros decision (listed together at the end of the report with a recommendation each).",
      "An independent check re-tested 408 claims against the code and found 31 problems: 20 were corrected in the code or sample data, 7 statuses in the report were corrected (over-claims), and 4 are noted as known limits. A screenshot check found one more (the returned EIR row), also fixed."
    ],
    "result": "Typecheck clean · 36/36 unit tests · production build and no-CDN check pass · 91 screens captured in headless Chrome with no page errors."
  },
  {
    "date": "2026-11-02",
    "kind": "Housekeeping",
    "title": "Staff review 1.1 — shared sample data and Manila dates aligned with the portal",
    "why": "The portal review 1.1 pass corrected the shared sample data and the date handling in its own copy of src/lib; the staff app still had the old copy, so the two apps disagreed (and several staff forms pre-filled yesterday’s date before 08:00 Manila).",
    "changes": [
      "Brought the portal’s 02-Nov shared changes into the staff copy of src/lib (sample data, mock API, date helpers, types): EWA numbers follow creation dates, four different drivers, EU-000765 is the cancelled EWA, RSC-000020 with its BR-11 breakdown, Manila-day invoice / due / contract dates. The portal project itself was not changed.",
      "Every “today” default and date-only value now uses the Manila calendar day (shared toDateInput / new todayManila), so forms such as New unit request, Create lease contract, Record cash bond, DCIR and Aging no longer open on yesterday.",
      "Mock DB version 14: saved demo data reloads once on first load.",
      "Note: the staff copy of src/lib now has further sample-data fixes from this review (memo numbers, job orders, registrations, a second Account Executive). The same changes still have to be copied to the portal project before both apps show identical data."
    ]
  },
  {
    "date": "2026-11-02",
    "kind": "Fix",
    "title": "Staff review 1.1 — sign-in, dashboard, approvals and gate screens",
    "why": "Staff UI Changes Review 1.1 (doc/Staff UI Changes_Review_1.1.docx): 10 screens (EWA, Gate Out / In, EIR and late encoding), 117 review items.",
    "changes": [
      "Dashboard: the approvals banner lists every waiting approval (up to 5, then “+N more”) with its type, amount and due / escalated flag, so the count always matches the list.",
      "Dashboard: each active EWA shows the time left and its expiry time (24-hour validity).",
      "My approvals: new Branch column; “Step n of m · next: …” under the current step; escalated rows show when they were due; the drawer shows branch, step and due time.",
      "EWA: EU-000779 is now the extension waiting for IT revalidation, requested after it expired, so the EWA list matches My approvals. EU-000776 is a separate request awaiting Manager approval.",
      "EWA list: shows the equipment type per line, the trucker, links to the gate passes released under each EWA, and “Extended ×n”; the row buttons now read Extend and Cancel.",
      "New EWA: Pickup branch counts as required; each line warns about a quantity over branch availability or a repeated equipment type and blocks Create; the success banner shows valid-until, branch and a View EWA link.",
      "Gate Out: the ready-for-release list shows the client code, the equipment type and the user’s branch scope.",
      "Gate In: the on-hire list shows the actual gate-out date (with the encoded date when different), days on hire and the truck plate.",
      "EIR view: the Late-encoded chip shows days late and the path (auto-corrected or Credit Memo pending DYM / Treasury); the out date shows the actual time.",
      "Late encoding: new Depot column; the form shows the outcome as you type, says “Submit for approval” when over 7 days, shows the selected gate pass’s chassis, client, direction, branch, EWA and driver, blocks dates that are in the future or not earlier than the encoded date, and warns when the actual date is before the EWA.",
      "Demo data: the two late-encoded releases now have EWAs created before the actual (paper) gate-out; the auto-corrected one bills from the actual date.",
      "Sign-in: a deactivated staff account gets its own message, and an IT helpdesk line shows under the form (set via app-config helpdeskContact)."
    ]
  },
  {
    "date": "2026-11-02",
    "kind": "Fix",
    "title": "Staff review 1.1 — allocation, DCIR, Park & Fix, rescue and repair",
    "why": "Staff UI Changes Review 1.1 (doc/Staff UI Changes_Review_1.1.docx): 14 screens (allocation board and pipeline, DCIR, Park & Fix, rescue, job orders and labor reports), 124 review items.",
    "changes": [
      "Allocation, DCIR, unit requests and Park & Fix use today’s Manila date: the DCIR now opens on today (Live) and the new unit request no longer pre-fills yesterday.",
      "DCIR: an earlier date shows a “Snapshot” badge with a “Back to today” button; the report shows its ID and who generated it, and “Blocked” and “Sign-off” are defined.",
      "Allocation board: the Allocation column shows the client unit request (UR) number, target pickup and return, and flags OR/CR expired after allocation or a return after OR/CR expiry; owner (company / partner) per chassis; legend for the orange idle-ageing days and colours.",
      "Client unit requests: fulfilled requests are listed with their allocated chassis; new columns for units of the same type in repair and requester / date; monetary-requirement reason shown; Find chassis disabled for Blocked requests and for requests whose contract has expired (shown as “on hold pending renewal”).",
      "New client unit request: Contract enabled only after Client, chassis type limited to the contract, Create greyed until valid with a “Required:” footer, preview of contract type/term, monetary requirement and matching availability, pickup cannot be in the past or after contract expiry.",
      "Sample data: the six allocated units now belong to fulfilled requests UR-000020…025 with pickup dates; every Breakdown / In repair unit has a job order (open for Minor/Major, Closed by R&M for units awaiting sign-off); Park & Fix receipt numbers follow date order.",
      "Rescue request dialog: shows the client’s rescue eligibility as soon as a client is chosen and warns when the unit already has an open rescue.",
      "Rescue list and dashboard: reasons for Blocked / Cancelled, Debit Memo number under the charge, dispatch vehicle and driver, one-way km, request date with time, and the period covered by the totals.",
      "Create job order: example chassis is a real unit (DW-NVL-1007); selecting a unit shows its type, status, branch, client, OR/CR and open job orders; states who is notified.",
      "Job orders list: branch column and filter, client / chargeable, workers, approved / confirmed by, closed date and days open.",
      "Labor reports: pay period defaults to the last 30 days and is shown; totals for the laborer summary and capacity; capacity gap column; efficiency turnaround measured from closed job orders and shown as “—” when none were completed."
    ]
  },
  {
    "date": "2026-11-02",
    "kind": "Fix",
    "title": "Staff review 1.1 — clients, accreditation, contracts, cash bonds and sales",
    "why": "Staff UI Changes Review 1.1 (doc/Staff UI Changes_Review_1.1.docx): 10 screens (client, accreditation, contract, cash bond and sales screens), 107 review items.",
    "changes": [
      "Create lease contract: the effective date defaults to today’s Philippine date and can no longer be in the past. Region and billing cycle default from the client, and Region uses the branch-master list (NCR, North Luzon, South Luzon, Visayas, Mindanao).",
      "Contracts: billing cycles now match the client record (Pacific Movers and Southern Haulers are Monthly). An expired contract with units still out is flagged “… units still on hire after expiry”.",
      "Cash bonds: bond records added for Metro Container Lines and Southern Haulers. The list shows the total held, has status, client and branch filters, shows the requested refund as bond less unpaid balances, marks bonds on ended contracts “Refundable”, and explains why Withdraw is disabled.",
      "Record cash bond: date received defaults to today’s Philippine date. Check number, bank and check date are required for checks. Duplicate receipt numbers are refused, and the dialog warns when a bond is already on file.",
      "Clients list: new Cash bond and Contract expiry columns, a client count, an Approve / decline link for portal registrations, and “contract expired” under clients whose units are out on an expired contract.",
      "Register client: City, ZIP code and Country fields. The next company code follows the highest existing code (C-00252).",
      "Submit for accreditation: clients already in accreditation and portal registrations not yet approved are disabled in the dropdown, with the reason shown.",
      "Sales performance: the Accredited tile shows the in-progress count from the accreditation queue. Weeks still in progress are marked and left out of the weekly-visit average. Week labels at month end are corrected.",
      "Log sales activity: administrators and managers must choose the Account Executive. Date and time default to Philippine time.",
      "Sample data: a second Account Executive (Kevin Ong) owns Visayas Freight and Southern Haulers, so AE filters and comparisons can be shown. Accreditation submission times vary."
    ]
  },
  {
    "date": "2026-11-02",
    "kind": "Fix",
    "title": "Staff review 1.1 — billing, invoices, memos, e-wallet and credit",
    "why": "Staff UI Changes Review 1.1 (doc/Staff UI Changes_Review_1.1.docx): 8 screens (bill generation, invoices, credit / debit memos, e-wallet, client status and aging), 82 review items.",
    "changes": [
      "Bill generation: drafts show the client’s e-billing email (missing email flagged), VAT status and the invoice-date rule; the default period uses Manila calendar days.",
      "Bill generation: batch total (subtotal, VAT, total) for the selected drafts, and a “Not in this run” list of clients with the reason (other billing cycle, branch filter, not accredited, blacklisted, nothing on hire).",
      "Bill generation: the billing-batch conflict banner shows the earlier invoice’s period, amount, status and balance, and how to clear it.",
      "Invoices: new “Cancel invoice” action with a mandatory reason (only for invoices with no payments, credits or receipts awaiting clearance).",
      "Invoice list: VAT under the amount, paid amount with the Official Receipt link and date under the balance, cancellation reason and credit-memo number under the status; CSV export adds these fields plus batch and delivery.",
      "Credit hold text now reads “days past due at hold” with today’s age alongside.",
      "Credit / debit memos: memo numbers follow creation order (late-encoding credit CM-000006, repair estimate DM-000041); the late-encoding credit shows its calculation and the Deputy Yard Manager then Treasury trail; CM-000010 references INV-MNL-00001101.",
      "Credit / debit memos: evidence indicator per row; client ledger link on the memo; repair-cost debit memos can only be submitted once the job order is closed with its Accomplishment Report.",
      "New memo form: approval wording corrected (Finance Manager approves every manual memo; amount tiers pending decision), invoice balance before/after, evidence rules.",
      "E-wallets: Allow Rescue follows the stated rule (funded above ₱0 and not On Hold; below-minimum flagged); rows show branch, AE, client status, last top-up amount and link to the client profile.",
      "Create e-wallet: initial amount defaults to the cleared receipt and warns on a difference; cleared-date limit uses the Manila day.",
      "Aging & collection: as-of date defaults to today (Manila); e-wallet and memo lines under each total are labelled and explained as outside the AR total."
    ]
  },
  {
    "date": "2026-11-02",
    "kind": "Fix",
    "title": "Staff review 1.1 — chassis, assets, inventory and procurement",
    "why": "Staff UI Changes Review 1.1 (doc/Staff UI Changes_Review_1.1.docx): 10 screens (chassis and asset masters, inventory, stock ledger, PR and RFP / PCV), 74 review items.",
    "changes": [
      "Registration status now uses one set of labels (Current, Expiring, Renewal In Progress, Expired, Missing) and one configurable “Expiring” window on the Chassis master, chassis detail, Allocation board and Allocate warning.",
      "New chassis: the chassis number follows the registry format (e.g. DW-MNL-1001); the 10-digit minimum is marked pending client confirmation.",
      "New asset: the required-fields footer lists asset ID, category, description and quantity.",
      "Asset maintenance log defaults to today’s Manila date.",
      "Inventory summary: the footnote defines the Low-stock rule (≤ threshold) and what “Available” means.",
      "Warehouse master includes WH-DVO (Davao stockroom).",
      "Stock ledger: pending rows show a labelled projected balance, quantities show the unit, issuance rows show the chassis, and the TIR-VALVE adjustment links to its physical count.",
      "Stock ledger sample transactions are numbered in date order.",
      "New stock transaction: the Entity hint changes with the transaction type (e.g. Receiving = owner of the stock received).",
      "New purchase request: Entity hint reads “Entity that owns this purchase”.",
      "Procurement: PR and RFP/PCV rows show “Step x of y” and days waiting; tab counts are defined; RR-000059 / PO-000149 now appear on the Receiving reports and Purchase orders tabs.",
      "New RFP / PCV: request number shows “Auto-assigned on save” and the payee example is a supplier."
    ]
  },
  {
    "date": "2026-11-02",
    "kind": "Fix",
    "title": "Staff review 1.1 — compliance, reports and administration",
    "why": "Staff UI Changes Review 1.1 (doc/Staff UI Changes_Review_1.1.docx): 14 screens (registration, compliance, regulatory reports, executive dashboard, report library, users, notification rules, settings, master data and audit log), 134 review items.",
    "changes": [
      "Registration master: status tiles (Registered, Expiring, Renewal In Progress, Expired with target 0, Pending, Off plate schedule); expiries that fall outside the plate-ending month are flagged “off schedule”.",
      "Registration sample data: expiry dates follow the LTO plate-ending month for current units, near-expiry plates match their expiry month, and notices are dated exactly 90 / 30 / 14 days before expiry (Manila day).",
      "Add registration record: warns when the expiry month is not the plate’s renewal month; duplicate plate, OR or CR numbers are blocked.",
      "Compliance dashboard and Executive dashboard: near-expiry tiles relabelled “≤ 2 weeks”, “2 weeks–1 month”, “1–3 months” (exclusive buckets).",
      "Registered detailed report: scope stated (current + expiring), record count, Status, Plate month, Issued and On-hire client columns; date filters explained.",
      "Unregistered detailed report: Region, On-hire client, last OR/CR, Responsible, last notice / escalation, next follow-up date and renewal cost with total.",
      "Report library: new reports “Rescues by month and client”, “Accounts receivable summary” and “Monthly revenue summary”; every report shows its record count.",
      "Executive dashboard: accredited clients, contract renewals due, pull-outs / returns, visits vs calls, rescues by month and by client, inventory variances and a DCIR tile; period ends today (Manila); Overdue % explained.",
      "Users & roles: Department field and column, role / branch / department / realm / status filters, new Auditor (read-only) and Repairman / Technician roles with demo users, last sign-in shown for active demo users.",
      "New user: browser autofill no longer fills Mobile or Initial password; mobile and email formats are validated.",
      "Notification rules: new “Registration expired — escalation” rule (proposed); header explains that rules are edited by selecting a row.",
      "System settings: Regional settings card (Asia/Manila, dd-Mon-yyyy, 24-hour, ₱); low-stock threshold reads “at this level or fewer”.",
      "Add branch: gate-pass prefix required only when the branch issues gate passes and must be unique; only one head office; region must match island group.",
      "Audit log: “Record type” filter; automatic contract expiry logged as system; sample events for gate passes, invoices, e-wallet, stock, memos, registrations, role and password changes with realistic times; cancelled rescue is RSC-000040."
    ]
  },
  {
    "date": "2026-11-02",
    "kind": "Fix",
    "title": "Staff review 1.1 — problems found by the independent check",
    "why": "A second pass re-checked every claimed fix against the code and the screenshots before the report was written.",
    "changes": [
      "Client unit requests: the “Contract expired — on hold pending renewal” badge and the disabled Find chassis now appear even if the Contracts screen was not opened first; the expired contract is no longer offered in the Allocate dialog.",
      "Rescue dashboard and list: a month period ends on its last day (November showed “01-Nov – 01-Dec”), and the month list follows the Manila calendar.",
      "Labor reports and DCIR snapshots compare Manila days, not the UTC date.",
      "Late encoding: a Credit Memo still in approval shows its number (CM-000006 pending) in the list and the drawer, linked to the memo.",
      "New EWA: the server also rejects the same equipment type on two lines.",
      "Cash bonds: an expired contract’s bond shows “Refundable” only when something is refundable; the duplicate-bond warning also fires when only the client is chosen; Metro’s check-paid bond has its check details.",
      "EIR: the returned example (DW-MNL-1001, Gate Out GP-MNL-000880 → Gate In GP-MNL-000881) now has its EIR row, EIR-MNL-000180, shown as Returned.",
      "Job orders: the closed Manila job order lists both laborers and its approval; PR / PO dates, report numbers and audit reasons use Manila dates; the allocation legend uses the shared registration labels; small wording fixes on the Executive dashboard, Users and Notification rules."
    ]
  },
  {
    date: '2026-10-25', kind: 'Fix', title: 'Staff app — user menu closes when you click elsewhere',
    why: 'The user menu (Change password / Reset demo data / Sign out) only closed when the name was clicked again; clicking another control or anywhere on the page left it open.',
    changes: ['The menu now closes on a click anywhere outside it, on another header icon, and on Esc — and still when you pick a menu item or move to another page. Clicking the name still opens and closes it.'],
  },
  {
    date: '2026-10-25', kind: 'Housekeeping', title: 'Staff app and portal split into two standalone projects',
    why: 'Requested: separate the two apps so each builds, runs and deploys on its own (backup taken first: 25-10-26final-backup-frontend.zip).',
    changes: [
      'The former frontend monorepo (apps + shared packages) is now two independent projects next to it: frontend-staff and frontend-portal.',
      'Each project has its own copy of the shared code under src/lib (ui components and theme, shared types / calculations / change log, mock API and sample data), its own package.json, libraries, tsconfig, scripts and README. No links between the two projects.',
      'Behaviour and screens are unchanged. Each project passes its own typecheck, 36 unit tests and production build with the no-CDN check; both were tested in the browser (sign-in, dashboard, lists, forms).',
      'Trade-off: a fix to shared code (src/lib) must now be made in both projects.',
    ],
  },
  {
    date: '2026-10-25', kind: 'Fix', title: 'Type-ahead fields — app-styled list instead of the browser’s',
    why: 'Fields with suggestions showed the browser’s own ▼ arrow on hover and a dark native popup (e.g. Create job order → Chassis / asset reference), which did not match the app.',
    changes: ['New shared type-ahead: an app-styled list under the field, filtered as you type, with a muted hint per option (e.g. chassis status “Available”, “On hire”); mouse or ↑ ↓ Enter / Esc; a new value can still be typed.', 'Used for Create job order → Chassis / asset reference and Worker / laborer assignment, and Chassis form → Partner code. No browser suggestion lists remain in either app.'],
  },
  {
    date: '2026-10-25', kind: 'Feature', title: 'Back button on every screen (both apps)',
    why: 'Requested: getting back to the previous screen was complicated (only the sidebar or the browser button).',
    changes: ['A “← Back” button at the left of the top bar returns to the previous screen. Same in the client / vendor portal header.', 'Shown only on screens reached through a link inside a page — e.g. Clients list → client detail, Contracts → contract detail, a related record. Hidden on screens opened from the main navigation (sidebar, approvals / notifications icons, user menu, portal menu) and on the landing screen after every sign-in (also after signing out and in again, and in the portal).', 'Detail panels that open through the page address (e.g. a registration record) count as a step too, so Back closes them first.'],
  },
  {
    date: '2026-10-25', kind: 'Fix', title: 'Aging receivables — Print / PDF',
    why: 'Print / PDF printed the screen: cards split across pages, the filter toolbar printed, and the client table was cut off on the right.',
    changes: ['Print / PDF now opens a print preview of a proper landscape report: company header, report no. and date, the filters used (as-of date, branch, AE, status, stage, bucket), the six summary figures, portfolio buckets with %, buckets by branch, every filtered client (not just the first 10) with buckets, total and collection stage, and column totals.', 'Checked as a real PDF: one landscape page, nothing cut off.'],
  },
  {
    date: '2026-10-25', kind: 'Fix', title: 'Summary cards — long hint no longer overlaps the number',
    why: 'On cards with a long hint and a large peso amount (e.g. Executive dashboard “Billed (period)”), the hint text ran under the number.',
    changes: ['When the hint and the number do not fit on one line, the hint sits above and the number stays in the bottom-right corner. Checked by measuring every card on the Executive dashboard: no overlaps.'],
  },
  {
    date: '2026-10-25', kind: 'Fix', title: 'Summary cards — number in the bottom-right corner',
    why: 'Requested: on every summary card the number should sit in the bottom-right corner, right-aligned.',
    changes: ['All KPI / summary cards in both apps (Allocation board, Executive dashboard, Compliance, Invoices, Aging, portal Invoices & SOA, etc.): label top-left, number bottom-right and right-aligned; any hint or trend (e.g. “Target 0”, “On hire ÷ fleet”) bottom-left on the same line.', 'Cards in a row share the same height so the numbers line up. Dashboard fleet tiles follow the same layout (“View list” bottom-left, count bottom-right); Executive dashboard drill-down arrows moved to the top-right corner.'],
  },
  {
    date: '2026-10-25', kind: 'Fix', title: 'Consolas replaced by Inter everywhere',
    why: 'Requested: wherever Consolas appeared it should use Inter, the app font.',
    changes: ['IDs and codes (EWA, job order, invoice, chassis, contract, OR / PR, SOA numbers…) and code snippets used the system monospace font, which is Consolas on Windows. They now use Inter in both apps and on printed documents.', 'Digits stay fixed-width (tabular figures), so ID columns still line up. One change in the shared theme (src/lib/ui/theme.css).'],
  },
  {
    date: '2026-10-25', kind: 'Fix', title: 'Dashboard — layout and icons',
    why: 'Requested: make the Dashboard look more polished — layout only, nothing added or removed.',
    changes: ['Fleet status tiles (Available, Allocated, On hire, In repair, Rescue, Breakdown, Parked) each have a coloured icon and a matching colour bar — the same colours as the Executive dashboard fleet chart — with a larger count; the whole tile opens the list.', 'The Active EWAs, Open job orders and Open rescues panels have an icon in the header, even row heights and a row hover highlight; empty messages centred.'],
  },
  {
    date: '2026-10-25', kind: 'Housekeeping', title: 'Change log — full-page design',
    why: 'Requested: the change log should open as a proper full page with a cleaner design instead of a side panel.',
    changes: ['The sticky “Change log” button on both sign-in pages now opens a full-page view: branded header with totals per type and the period covered, a sticky filter bar (All / Fix / Feature / Report / Housekeeping) with search, and a day-by-day timeline.', 'Each change is a card with a colour-coded type, the reason (Why), the list of changes and a highlighted Result. Close or Esc returns to the sign-in page.'],
  },
  {
    date: '2026-10-25', kind: 'Feature', title: 'Sample data — System Administrator approvals and notifications',
    why: 'Requested: the admin should see every tab of Notifications and My approvals filled, to review how the screens look.',
    changes: [
      'My approvals → Pending my action (4): user access for a new Cebu Accounting user, unlock account BG.CEB, EWA extension EU-000779 revalidation, cross-branch return code for DW-CEB-1046 — each waiting at an IT step, with earlier steps signed.',
      'Escalated (2): the EWA revalidation and the cross-branch return code are past their due time.',
      'Submitted by me (3): setting change e-wallet minimum ₱10,000 → ₱15,000 (pending Finance Manager), EWA validity 24 h → 48 h (approved), Treasury role for ACCTG (rejected by CHRO with a reason). History shows the decided ones.',
      'Notifications (10, 4 unread): approval needed, account locked, escalation that needs acknowledging, email delivery failure, setting changes, DCIR snapshot, audit hash check, new portal registration — each links to its screen.',
      'Approval drawers link to Users & roles / System settings for user and setting requests. Demo data reloads once (mock DB version 12).',
    ],
  },
  {
    date: '2026-10-25', kind: 'Fix', title: 'Admin always lands on the Dashboard after sign-in',
    why: 'Requested: every admin sign-in should open the Dashboard, not another page (it opened Users & roles, or the last page visited).',
    changes: ['System administrators now land on Dashboard after every sign-in, and when opening the app root.', 'Other roles keep their role landing page (e.g. Executive dashboard for executives, Aging for Credit & Collection) and still return to a deep link they were sent from.'],
  },
  {
    date: '2026-10-25', kind: 'Fix', title: 'Staff sign-in — Forgot password without a popup',
    why: 'Requested: the reset-password step should happen in the same sign-in section, not in a popup.',
    changes: ['“Forgot password?” (and “Reset password” on a locked-account message) switches the sign-in panel to “Reset your password”: user ID or email, Send reset link, ← Back to sign in.', 'After sending, the same panel confirms “Check your email” (link valid 30 minutes) with a Back to sign in button. The portal already used its own reset page.'],
  },
  {
    date: '2026-10-25', kind: 'Fix', title: 'Placeholder text in empty form fields (both apps)',
    why: 'Many free-entry fields were blank boxes (e.g. “What happened?”, “Contact at scene”, “Contact number” on the portal rescue request), so users had to guess the expected content or format.',
    changes: [
      'About 250 fields now show a short example or prompt; labels, validation and layout are unchanged. Formats follow the app’s real data (chassis DW-MNL-1001, contract LTL-2026-0045, invoice INV-MNL-00001101, OR7000000, client C-00123, asset AST-FL-007).',
      'Portal (16): rescue request — “Describe what happened — e.g. flat tire on the left rear axle”, contact “e.g. Juan Dela Cruz”, number “e.g. 0917 123 4567”; EWA trucker / driver / quantity; cash-bond withdrawal reason; vendor invoice no.; sign-in, registration and forgot-password fields.',
      'Admin, approvals and shared (64): change password; user editor (password “Leave blank to auto-generate”); settings value and change reason; every master-data field (branch, warehouse, equipment type, part, vendor, lists); rate and price dialogs; approval comments; notification-rule recipients, timers, email subject / body and SMS text; staff sign-in; inspection checklist branding / tread depth.',
      'Operations (55): trucker, driver, licence and plate on New EWA, Edit EWA, Gate Out, Gate In and Park & Fix; flat-tire count; cross-branch code; force-inbound chassis; unit-request quantity and notes; park-in trailer and plate; chassis, maintenance-log and asset forms; registration and renewal (OR / CR no., agency, follow-up).',
      'Rescue, repair, inventory, procurement (37): incident description, contacts, distance; job-order notes, laborer, hours, rate; physical count and variance reason; stock request and transactions; PR justification, PO terms, payee, receiving notes and quantities.',
      'Clients and finance (81): client registration, contacts / signatories, client edit, BICI evaluation (10 fields), sales activity; contract custom type, credit term, lock-in, amendment / termination / withdrawal reasons, cash-bond notes; payment check no., bank, transfer reference; memo and adjustment reasons; hold-lift arrangement, collection notes, SOA recipient and courier tracking; e-wallet bank and Treasury references.',
      'Amount fields show “0.00” and date fields “Select date” (shared components).',
    ],
  },
  {
    date: '2026-10-25', kind: 'Housekeeping', title: 'Change log added',
    why: 'To let the team follow the order and reasons of the changes during the correction phase.',
    changes: ['Sticky “Change log” button in the bottom-right corner of both sign-in pages (staff app and portal); it opens this log in a side panel. CHANGELOG.md in the project root has the same entries.', 'Shown only while app-config.json has "showChangeLog": true — set it to false to hide it without a rebuild.'],
  },
  {
    date: '2026-10-25', kind: 'Fix', title: 'Client portal — Print statement',
    why: 'Printing the Invoices & SOA page printed the screen itself: navigation, tiles and a cut-off invoice table with a scrollbar.',
    changes: ['Print statement now prints a proper Statement of Account: company header, SOA no. and as-of date, client details, aging row, every transaction with running balance, balance due, payment instructions and footer.', 'Column headings repeat on each printed page; only the statement is printed.', 'Company address / TIN / BIR permit / payee bank print once entered in Admin → System settings → Company.'],
    result: 'Checked as a real PDF: one clean page for ABC Logistics.',
  },
  {
    date: '2026-10-22', kind: 'Report', title: 'UI/UX report — score tile shows the current score only',
    why: 'Requested: the summary tile should show the current score, not before → after.',
    changes: ['Average UI score tile now reads “4.98 — Current average UI score / 5”.'],
  },
  {
    date: '2026-10-22', kind: 'Fix', title: 'High / Medium findings cleared — equipment names and company details',
    why: 'The last High and Medium audit items were placeholder data: “Equipment Type 1–8” and “to be confirmed” company address, TIN and bank details.',
    changes: [
      'Equipment types now carry their real names: 20ft chassis, 40ft chassis, 40ft flatbed, 40ft combo, 40ft super combo, 45ft chassis, cane cage trailer (DBL-CHS-001) and 20ft flatbed (legacy master database, 28-May-2026). Codes EQ1–EQ8 are unchanged, so existing records keep their links.',
      'New settings group Admin → System settings → Company: registered address, VAT Reg. TIN, BIR permit details, payee bank account.',
      'Invoices, receipts, EIRs, SOA and the portal top-up page show those values once entered; until then the line is left out (no more “to be confirmed” on client documents). Staff see a reminder above the print preview (screen only).',
      'UI/UX report summary tiles now separate UI defects from business decisions.',
    ],
    result: 'Report: 0 High, 0 Medium; 23 Low (5 UI items, 18 business/data items). Finance still has to enter the four company values before go-live.',
  },
  {
    date: '2026-10-22', kind: 'Fix', title: 'Report library — Print',
    why: 'Print on a report printed the screen: search box, Export button, cut-off columns and only the current page of rows. Long documents also printed rows on top of each other.',
    changes: [
      'Print opens a print preview with a proper document: header, report name, filters used (period / branch / client), every row, money totals and footer. Wide reports print landscape.',
      'All print previews now print a clean copy in normal page flow: multi-page documents paginate, table headings repeat, headers / footers / signature blocks are never split.',
      'Report dates show as dd-Mon-yyyy on screen and on paper.',
    ],
  },
  {
    date: '2026-10-22', kind: 'Fix', title: 'DCIR print preview',
    why: 'The 22-column DCIR matrix was wider than a portrait page; the last columns were cut off behind a scrollbar.',
    changes: ['DCIR prints on a landscape Letter page with compact cells and wrapping headings — all 22 columns fit.'],
  },
  {
    date: '2026-10-22', kind: 'Fix', title: 'File upload fields',
    why: 'Some uploads showed the browser’s raw “Choose Files / No file chosen” control.',
    changes: ['One styled picker (“Choose file(s)” button + selected file names) for OR/CR documents, invoice-adjustment evidence and the bin-card photo; the other uploads already used it.'],
  },
  {
    date: '2026-10-22', kind: 'Fix', title: 'Follow-up on the independent re-audit',
    why: 'The re-audit after the Low-findings pass found 13 side effects (mostly labelled row buttons making tables wider than their cards).',
    changes: [
      'Clients: “Lift hold” is a compact link stacked above View. Compliance dashboard: whole row opens the record; Renew / Resend / Follow-up wrap two per line. Inventory: Create PR / Count stacked.',
      'Tables re-measure after tightening their padding, so the “more columns” fade only shows when columns really are hidden (checked on all 56 staff pages: none overflow at 1600 px).',
      'Sales performance month filter is an app dropdown (last 24 months); Aging “As of” date no longer truncated; vendor invoice date no longer repeated; permission-matrix bulk toggles look clickable; EIR and fleet legend say “On hire”.',
    ],
  },
  {
    date: '2026-10-22', kind: 'Fix', title: 'Low-severity UI findings (about 90) across all modules',
    why: 'Clear the remaining Low items of the UI/UX audit — UI only, no new business rules.',
    changes: [
      'Admin: permission matrix row / column bulk toggles; notification-rule field is a dropdown; branch region on one line; Visayas / Mindanao price labels; audit-log acronyms (EWA, EIR, PO…) and system reasons without rule codes; dashboard panel headers aligned.',
      'Operations: equipment select disabled until a contract is chosen; EWA Cancel styled as a danger action and “Valid until” above the date; Actions header and Transfer label on allocation; receipt buttons “In receipt / Out receipt”; asset and chassis forms show what is required before Save; Renew / Resend / Follow-up labelled; chassis detail IDs in mono.',
      'Rescue & repair, inventory, procurement: locations wrap; cards no longer stretched; rescue references are links; table titles and legend contrast; labelled row actions; duplicate prefixes (PO PO-…) removed; particulars column labels; “Final: …” approver chip; optional / required markers on job-order fields.',
      'Clients & finance: labelled hold-lift and History actions; reasons shown in full; contract header tidy; Withdraw disabled when nothing is refundable; held-lines label; invoice numbers as links; compact empty states; payment form says what is missing; “Created” date range; one colour for Escalated; executive dashboard captions.',
      'Portal: rescue references open a read-only detail; total-due tile centred; ledger references in mono; contract documents listed; vendor upload states the 10 MB limit (proposed — confirm); registration shows the same 4 password rules as Change password.',
      'Shared: tables tighten padding automatically instead of overflowing; chassis statuses in sentence case; approval steps not yet reached show “Not started” (amber kept for current / escalated); “(demo)” removed from all names; demo sign-in panel controlled by app-config showDemoLogins (off for production).',
    ],
    result: 'Independent re-audit: open findings 133 → 55, then 39 after the follow-up.',
  },
  {
    date: '2026-10-22', kind: 'Feature', title: 'App-wide calendar (date picker)',
    why: 'Date fields used the browser’s native picker, whose look and format (mm/dd/yyyy) differed per browser and from the rest of the app.',
    changes: ['One calendar for every date and date-time field: shows dd-Mon-yyyy (HH:mm), month / year selects, Today / Now and Clear, min / max limits, keyboard support; works inside dialogs and drawers.', 'Form values unchanged (YYYY-MM-DD), so no business logic changed.'],
  },
  {
    date: '2026-10-22', kind: 'Fix', title: 'Reviewer UI remarks (High → Medium → Low)',
    why: 'Fix the important remarks from the two correction files, without adding or removing unnecessary content.',
    changes: ['EIR prints the checklist and the captured driver signature; signature lines aligned.', 'Treasury sees a Review action on its pending late-encoding step; empty states with hints; links from held invoice lines and late-encoding memos.', 'Sample data for a cash-bond withdrawal and an expired portal EWA so those states can be reviewed.'],
    result: '321 of 331 remarks resolved, 10 partly, 0 still present; 14 are business decisions.',
  },
  {
    date: '2026-10-22', kind: 'Fix', title: 'UI/UX fix passes 1 and 2',
    why: 'Bring every screen to at least 4.5 / 5, High issues first, following the corrections only.',
    changes: [
      'Garbled characters repaired on the finance screens and printed invoice; internal requirement codes (BR-, DBL-, Q-, SCR-…) removed from user-facing text.',
      'Tables: IDs, dates and amounts never wrap; long text columns wrap; actions column not pinned over data; scroll cue only when more columns exist.',
      'Amounts scale inside KPI tiles; dialogs keep their buttons visible; switches sit before their own label; dropdowns no longer look disabled; charts render without animation glitches.',
    ],
    result: 'Average score 3.11 → 4.67; all 87 screens at 4.5 or higher.',
  },
  {
    date: '2026-10-22', kind: 'Report', title: 'UI/UX audit report and deep audit report',
    why: 'Check every screen of both correction files and the whole app against the documents (reports only — no code change).',
    changes: ['Deep audit report (HTML, with screenshots) in “audit report”.', 'UI/UX audit report (HTML, with before / now screenshots) in “ui-ux-audit” — updated after every fix pass.'],
  },
  {
    date: '2026-10-22', kind: 'Fix', title: 'UI fixes requested from screenshots',
    why: 'Layout problems reported directly during the correction review.',
    changes: ['Dropdown arrow padding on every select.', 'EWA list alignment; E-wallet segmented control no longer squashed.', 'Stray scroll arrows removed app-wide.', 'Gate In screen layout.', 'Every side drawer at least 75% of the screen width.', 'Park & Fix spacing and Rescue totals layout (spacing only — no content added or removed).'],
  },
  {
    date: '2026-10-22', kind: 'Fix', title: 'Correction review — internal system and Client Self-Service Portal',
    why: 'Review “internal system.docx” and “Client Self-Service Portal.docx”, record the state before changes and fix all buildable items.',
    changes: [
      'Audit report of the state before the changes (Word): “Correction file\\Audit Report - Correction Review - v0.1.0 - 2026-10-22.docx” — 947 reviewer items checked.',
      'Fixed per module: Admin 87 · Gate operations (EWA, Gate Out/In, EIR, late encoding) 55 · Allocation, DCIR, Park & Fix 36 · Rescue & repair 31 · Clients & sales 76 · Billing, invoices, receipts, memos 84 · E-wallet, client status, SOA, aging 54 · Assets & inventory 68 · Procurement, compliance & reports 81 · Client & vendor portal 11 — 583 fixed in total; 93 already in the build, 45 partly fixed, 104 open for a client decision, 122 needed no change.',
      'Aging buckets: one shared calculation now gives six buckets (Current, 1–30, 31–60, 61–90, 91–180, Over 180) on Aging, the Executive dashboard, the SOA and the portal; unit tests added.',
      'Sample data made consistent: every screen uses the same 60-unit chassis set; Park & Fix uses client-owned trailers; open-rescue counts exclude cancelled / completed requests.',
      'Screen headers cite the FRS requirement IDs; the report library uses one report-code scheme.',
      '“Thread depth” corrected to “Tread depth” on Gate Out, Gate In and the printed EIR.',
      'Notification rules N41–N49 (rescue dispatch, collection stages, accreditation stages, internal registration) now have the matching events.',
      'Only one client portal exists (the spec-complete design); findings against the older “MOD-XX” screens were closed.',
      'Mock database version stamped automatically so new sample data loads once and then persists.',
    ],
    result: '583 of 947 items fixed; the rest were already present, partly fixed, need a client decision or needed no change.',
  },
  {
    date: '2026-10-22', kind: 'Housekeeping', title: 'Backup before changes',
    why: 'Safe restore point before the correction work.',
    changes: ['Dated zip of delbros-leasing-frontend v0.1.0.'],
  },
];
