import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Check, ChevronRight, Download, Eye, EyeOff, History, Lock, Plus, RotateCcw, Search, ShieldAlert, ShieldCheck, Unlock } from 'lucide-react';
import { api, ApiError, PH_MOBILE, SENSITIVE_AUDIT, type MasterKind } from '../../lib/api-client';
import {
  ACTIONS, CONTRACT_TYPES, DEFAULT_SETTINGS, changePasswordSchema, formatDate, formatDateTime, formatPhp, ROLE_TEMPLATES, validateSetting, PENDING_ROLES, RESCUE_ROLE_MAPPING, pendingRole,
  type Action, type AuditEvent, type ContractType, type Grants, type RoleCode, type SettingDef, type User,
} from '../../lib/shared';
import {
  Badge, Banner, Button, Card, CardHeader, ConfirmDialog, DataTable, Drawer, FormGrid, Input, Modal, MoneyInput, PageHeader, ReadField, Segmented, Select, Stack, StatusBadge, Tabs, Textarea, cn, stripCodes, type ColumnDef,
} from '../../lib/ui';
import { useAction, useData, useRefLookups } from '../../shared/hooks';
import { useAuth } from '../../app/auth';

// ── SCR-02 Change Password ──────────────────────────────────────────────────
export function ChangePasswordPage() {
  const { setting } = useRefLookups();
  const min = Number(setting('auth.password_min_length') ?? 10);
  const f = useForm<{ current: string; next: string; confirm: string }>({ resolver: zodResolver(changePasswordSchema(min)), mode: 'onChange' });
  const next = f.watch('next') ?? '';
  const act = useAction((v: { current: string; next: string }) => api.auth.changePassword(v.current, v.next), { success: 'Password updated. Other sessions were signed out.', onSuccess: () => f.reset() });
  const rules = [[`At least ${min} characters`, next.length >= min], ['Uppercase letter', /[A-Z]/.test(next)], ['Lowercase letter', /[a-z]/.test(next)], ['A digit', /\d/.test(next)]] as const;
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const pwd = (k: 'current' | 'next' | 'confirm', label: string, auto: string) => (
    <div className="relative">
      <Input type={show[k] ? 'text' : 'password'} label={label} required autoComplete={auto} placeholder={{ current: 'Enter your current password', next: `At least ${min} characters`, confirm: 'Re-enter the new password' }[k]} className="pr-9" error={f.formState.errors[k]?.message} {...f.register(k)} />
      <button type="button" onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))} className="absolute right-2 top-[30px] rounded p-1 text-muted hover:text-ink" aria-label={show[k] ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>
        {show[k] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
  return (
    <div className="max-w-xl">
      <PageHeader title="Change password" description="Update your own password. You will stay signed in on this device." />
      <Card>
        <form className="space-y-4" onSubmit={f.handleSubmit((v) => act.mutate(v))} noValidate>
          {pwd('current', 'Current password', 'current-password')}
          {pwd('next', 'New password', 'new-password')}
          <ul className="grid grid-cols-2 gap-1 text-[13px]" aria-live="polite">
            {rules.map(([t, ok]) => <li key={t} className={cn('flex items-center gap-1.5', ok ? 'font-medium text-success' : 'text-muted')}>{ok ? <Check className="size-3.5" aria-hidden /> : <span className="mx-[5px] size-1.5 rounded-full bg-disabled" aria-hidden />}{t}<span className="sr-only">{ok ? ' — met' : ' — not met yet'}</span></li>)}
          </ul>
          {pwd('confirm', 'Confirm new password', 'new-password')}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => f.reset()}>Cancel</Button><Button type="submit" loading={act.isPending}>Save password</Button></div>
        </form>
      </Card>
    </div>
  );
}

// ── SCR-03 User & Role Management + Permission Matrix ──────────────────────
type UserRow = User & { grants: Grants; failed: number; lockedUntil?: string; overrides?: Grants };

const ROLE_GROUP_DEF: [string, string[]][] = [
  ['Operations', ['BRANCH_GENERALIST', 'DYM', 'REGIONAL_MANAGER', 'OPS_MANAGER', 'RESCUE_COORDINATOR', 'WAREHOUSE', 'REGULATORY', 'TECHNICIAN']],
  ['Sales and credit & collection', ['ACCOUNT_EXECUTIVE', 'SALES_DIRECTOR', 'CNC_OFFICER', 'CNC_MANAGER']],
  ['Finance and procurement', ['ACCOUNTING', 'TREASURY', 'FINANCE_MANAGER', 'APS_OFFICER', 'APS_MANAGER', 'DEPT_HEAD']],
  ['Executive and administration', ['SYS_ADMIN', 'EXEC_OFFICER', 'VP', 'CEO', 'CHRO', 'PRESIDENT', 'EXECUTIVE', 'AUDITOR']],
  ['Portal', ['CLIENT', 'VENDOR']],
];
/** Role checkboxes grouped by function; any role not listed above lands in "Other" so none is ever hidden. */
const ROLE_GROUPS: [string, RoleCode[]][] = (() => {
  const all = Object.keys(ROLE_TEMPLATES) as RoleCode[];
  const known = ROLE_GROUP_DEF.map(([g, cs]) => [g, cs.filter((c) => all.includes(c as RoleCode)) as RoleCode[]] as [string, RoleCode[]]);
  const rest = all.filter((c) => !ROLE_GROUP_DEF.some(([, cs]) => cs.includes(c)));
  return [...known, ...(rest.length ? [['Other', rest] as [string, RoleCode[]]] : [])].filter(([, cs]) => cs.length);
})();

export function UsersPage() {
  const users = useData(['admin', 'users'], () => api.admin.users());
  const { can } = useAuth();
  const master = useData(['admin', 'master'], () => api.admin.masterData(), can('admin.masterdata'));
  const { branchName, branchOptions } = useRefLookups();
  const [edit, setEdit] = useState<UserRow | 'new' | null>(null);
  const [tab, setTab] = useState('users');
  // Review 1.1: role / branch / realm / status / department filters.
  const [uf, setUf] = useState({ role: '', branch: '', realm: '', status: '', dept: '' });
  const unlock = useAction((id: string) => api.admin.unlock(id), { success: 'Account unlocked' });
  const [rowAct, setRowAct] = useState<{ kind: 'reset' | 'deactivate' | 'reactivate'; user: UserRow } | null>(null);
  const reset = useAction((id: string) => api.admin.resetPassword(id), { success: 'Temporary password emailed — the user must change it at next sign-in (audited)', onSuccess: () => setRowAct(null) });
  const activate = useAction((p: { id: string; on: boolean; why: string }) => api.admin.setUserActive(p.id, p.on, p.why), { success: 'User status changed — audited', onSuccess: () => setRowAct(null) });
  const deptName = (code?: string) => (code ? master.data?.lists.find((l) => l.list === 'Department' && l.code === code)?.name ?? code : undefined);
  const deptOpts = [...new Set((users.data ?? []).map((u) => u.department).filter(Boolean) as string[])].sort().map((d) => ({ value: d, label: deptName(d) ?? d }));
  const isLocked = (u: UserRow) => !!u.lockedUntil && new Date(u.lockedUntil) > new Date();
  const shown = (users.data as UserRow[] | undefined)?.filter((u) => (!uf.role || u.roles.includes(uf.role as RoleCode)) && (!uf.realm || u.realm === uf.realm) && (!uf.dept || u.department === uf.dept)
    && (!uf.branch || (uf.branch === 'ALL' ? u.branchAccess === 'ALL' : u.branchCode === uf.branch || (Array.isArray(u.branchAccess) && u.branchAccess.includes(uf.branch))))
    && (!uf.status || (uf.status === 'Locked' ? isLocked(u) : u.status === uf.status && !isLocked(u))));
  const cols: ColumnDef<UserRow>[] = [
    { accessorKey: 'userId', header: 'User ID', cell: (c) => <span className="font-mono font-medium">{c.getValue<string>()}</span> },
    { accessorKey: 'name', header: 'Name', cell: (c) => <div><p>{c.getValue<string>()}</p>{c.row.original.employeeNo && <p className="font-mono text-[11px] text-muted" title="HRIS employee number">{c.row.original.employeeNo}</p>}</div> },
    // Staff review 1.2: email and mobile on the list (CSV keeps both).
    { accessorKey: 'email', header: 'Email / mobile', cell: (c) => <div className="text-xs"><p className="max-w-[13rem] truncate" title={c.getValue<string>()}>{c.getValue<string>()}</p><p className="text-muted">{c.row.original.mobile || '—'}</p></div> },
    { accessorKey: 'designation', header: 'Designation' },
    { accessorKey: 'department', header: 'Department', cell: (c) => deptName(c.getValue<string>()) ?? <span className="text-muted">—</span> },
    { accessorKey: 'realm', header: 'Realm', cell: (c) => <Badge tone={c.getValue() === 'INTERNAL' ? 'brand' : 'purple'} dot={false}>{String(c.getValue()).replace('_', ' ')}</Badge> },
    { id: 'branch', header: 'Branch', cell: (c) => { const u = c.row.original; return u.branchAccess === 'ALL' ? 'All branches' : <div><p>{branchName(u.branchCode)}</p>{u.regionScope ? <p className="text-[11px] text-muted" title={u.branchAccess.join(', ')}>Region {u.regionScope} ({u.branchAccess.length} branches)</p> : u.branchAccess.length > 1 ? <p className="text-[11px] text-muted">+ {u.branchAccess.filter((b) => b !== u.branchCode).join(', ')}</p> : null}</div>; } },
    { accessorKey: 'warehouseCode', header: 'Stockroom', cell: (c) => <span className="font-mono">{c.getValue<string>() ?? '—'}</span> },
    { id: 'roles', header: 'Roles', cell: (c) => { const n = Object.keys(c.row.original.overrides ?? {}).length; return <div className="flex flex-wrap gap-1">{c.row.original.roles.map((r) => <Badge key={r} tone="neutral" dot={false}>{ROLE_TEMPLATES[r]?.label ?? r}</Badge>)}{n > 0 && <span title={`Per-user permission overrides on: ${Object.keys(c.row.original.overrides ?? {}).join(', ')}`}><Badge tone="warning" dot={false}>{n} override{n > 1 ? 's' : ''}</Badge></span>}</div>; } },
    { accessorKey: 'status', header: 'Status', cell: (c) => { const u = c.row.original; return <div className="flex flex-col items-start gap-0.5">{isLocked(u) ? <Badge tone="danger" icon={<Lock className="size-3" />}>Locked</Badge> : <StatusBadge domain="generic" value={c.getValue<string>()} />}{u.failed > 0 && <span className="text-[11px] text-danger" title={isLocked(u) ? `Locked until ${formatDateTime(u.lockedUntil)}` : 'Failed sign-ins since the last successful sign-in'}>{u.failed} failed sign-in{u.failed > 1 ? 's' : ''}</span>}</div>; } },
    { accessorKey: 'lastLogin', header: 'Last login', cell: (c) => formatDateTime(c.getValue<string>()) },
    { accessorKey: 'createdAt', header: 'Created', cell: (c) => <div className="text-xs"><p>{formatDate(c.getValue<string>())}</p><p className="text-muted">{c.row.original.createdBy ?? '—'}</p></div> },
    { id: 'act', header: '', cell: (c) => { const u = c.row.original; const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); }; return (
      <div className="flex flex-nowrap gap-0.5">
        {can('admin.users', 'edit') && <Button size="sm" variant="ghost" className="!px-2" onClick={stop(() => setEdit(u))}>Edit</Button>}
        {can('admin.users', 'edit') && u.realm === 'INTERNAL' && <Button size="sm" variant="ghost" className="!px-2" title="Email a temporary password (forced change at next sign-in)" onClick={stop(() => setRowAct({ kind: 'reset', user: u }))}>Reset password</Button>}
        {isLocked(u) && <Button size="sm" variant="secondary" icon={<Unlock className="size-4" />} onClick={stop(() => unlock.mutate(u.userId))}>Unlock</Button>}
        {can('admin.users', u.status === 'Active' ? 'delete' : 'edit') && <Button size="sm" variant="ghost" className={cn('!px-2', u.status === 'Active' && 'text-danger')} onClick={stop(() => setRowAct({ kind: u.status === 'Active' ? 'deactivate' : 'reactivate', user: u }))}>{u.status === 'Active' ? 'Deactivate' : 'Reactivate'}</Button>}
      </div>); } },
  ];
  return (
    <>
      <PageHeader title="Users & roles" description="Register users, assign roles and branch scope, and fine-tune access with the permission matrix (View · Add · Edit · Delete · Check · Approve · Cancel · Export)."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setEdit('new')}>New user</Button>} />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'users', label: 'Users', count: users.data?.length }, { id: 'roles', label: 'Role templates', count: Object.keys(ROLE_TEMPLATES).length }]} />
      {tab === 'users' ? (
        <DataTable data={shown} loading={users.isLoading} columns={cols} onRowClick={(r) => setEdit(r)} exportName="users" searchPlaceholder="Search user ID, name…"
          toolbar={<>
            <Select aria-label="Role" value={uf.role} onChange={(e) => setUf({ ...uf, role: e.target.value })} placeholder="All roles" options={Object.entries(ROLE_TEMPLATES).map(([k, v]) => ({ value: k, label: v.label }))} />
            <Select aria-label="Branch" value={uf.branch} onChange={(e) => setUf({ ...uf, branch: e.target.value })} placeholder="All branches" options={[{ value: 'ALL', label: 'All-branch access' }, { value: 'HO', label: 'HO — Head Office' }, ...branchOptions]} />
            <Select aria-label="Department" value={uf.dept} onChange={(e) => setUf({ ...uf, dept: e.target.value })} placeholder="All departments" options={deptOpts} />
            <Select aria-label="Realm" value={uf.realm} onChange={(e) => setUf({ ...uf, realm: e.target.value })} placeholder="All realms" options={[{ value: 'INTERNAL', label: 'Internal' }, { value: 'CLIENT_PORTAL', label: 'Client portal' }, { value: 'VENDOR_PORTAL', label: 'Vendor portal' }]} />
            <Select aria-label="Status" value={uf.status} onChange={(e) => setUf({ ...uf, status: e.target.value })} placeholder="All statuses" options={['Active', 'Inactive', 'Locked'].map((s) => ({ value: s, label: s }))} />
            {Object.values(uf).some(Boolean) && <Button variant="ghost" size="sm" onClick={() => setUf({ role: '', branch: '', realm: '', status: '', dept: '' })}>Clear</Button>}
          </>} />
      ) : <RoleTemplates />}
      {edit && <UserEditor user={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      <ConfirmDialog open={rowAct?.kind === 'reset'} onClose={() => setRowAct(null)} loading={reset.isPending} confirmLabel="Email temporary password" title={`Reset the password of ${rowAct?.user.userId ?? ''}?`}
        onConfirm={() => rowAct && reset.mutate(rowAct.user.userId)} message={<>A temporary password is emailed to <strong>{rowAct?.user.email}</strong> (never shown on screen or sent by SMS). The user must change it at the next sign-in; a lock is cleared. Recorded in the audit log.</>} />
      <ConfirmDialog open={rowAct?.kind === 'deactivate' || rowAct?.kind === 'reactivate'} onClose={() => setRowAct(null)} requireReason tone={rowAct?.kind === 'deactivate' ? 'danger' : 'primary'} loading={activate.isPending}
        confirmLabel={rowAct?.kind === 'deactivate' ? 'Deactivate' : 'Reactivate'} title={`${rowAct?.kind === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${rowAct?.user.userId ?? ''}?`}
        onConfirm={(why) => rowAct && activate.mutate({ id: rowAct.user.userId, on: rowAct.kind === 'reactivate', why })}
        message={rowAct?.kind === 'deactivate' ? 'The user can no longer sign in. The account and its history stay (never deleted); open approvals assigned to the role still go to the other holders of that role.' : 'The user can sign in again with the current password.'} />
    </>
  );
}

function RoleTemplates() {
  const [role, setRole] = useState<RoleCode>('BRANCH_GENERALIST');
  const pend = pendingRole(role);
  return (
    <Stack>
      {/* Staff UI changes V1.4 rows 2–7: one register of the role labels that are not in the FRS role list. */}
      <Card>
        <CardHeader title="Roles pending Delbros confirmation" description="These role labels are not in the FRS role list. Their permission templates are proposed defaults; record the approved name, scope and permissions here once Delbros confirms." />
        <Banner tone="warning" className="mb-3" title="Rescue Coordinator / Rescue Dispatcher">{RESCUE_ROLE_MAPPING}</Banner>
        <DataTable data={PENDING_ROLES} exportName="roles-pending-confirmation" onRowClick={(r) => setRole(r.role)} columns={[
          { accessorKey: 'label', header: 'Role / demo user', cell: (c) => <div><p className="font-medium">{c.getValue<string>()}</p><p className="font-mono text-xs text-muted">{c.row.original.demoUser} · {c.row.original.role}</p></div> },
          { accessorKey: 'frsMapping', header: 'FRS mapping (proposed)', meta: { wrap: true }, cell: (c) => <span className="block min-w-64 max-w-md text-xs">{c.getValue<string>()}</span> },
          { accessorKey: 'scope', header: 'Scope', meta: { wrap: true }, cell: (c) => <span className="block min-w-32 text-xs">{c.getValue<string>()}</span> },
          { accessorKey: 'responsibilities', header: 'Responsibilities (proposed)', meta: { wrap: true }, cell: (c) => <span className="block min-w-56 max-w-sm text-xs">{c.getValue<string>()}</span> },
          { accessorKey: 'status', header: 'Status', cell: (c) => <Badge tone="warning">{c.getValue<string>()}</Badge> },
        ]} />
        <p className="mt-2 text-xs text-muted">Click a row to open its permission template below.</p>
      </Card>
      <Card>
        <CardHeader title="Role permission template" description="Templates grant default access; per-user overrides are set on the user." actions={
          <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as RoleCode)} options={Object.entries(ROLE_TEMPLATES).map(([k, v]) => ({ value: k, label: `${v.label}${pendingRole(k as RoleCode) ? ' — pending confirmation' : ''}` }))} />} />
        {pend && <Banner tone="warning" className="mb-3" title={`${pend.label}: proposed permissions, pending Delbros confirmation`}>{pend.frsMapping}</Banner>}
        <PermissionMatrix grants={ROLE_TEMPLATES[role].grants} readOnly />
      </Card>
    </Stack>
  );
}

function UserEditor({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const isNew = !user;
  const { can } = useAuth();
  const { branchOptions, branchName, clientOptions, ref } = useRefLookups();
  const master = useData(['admin', 'master'], () => api.admin.masterData(), can('admin.masterdata'));
  const initScope = user?.branchAccess === 'ALL' ? 'all' : user?.regionScope ? 'region' : (user?.branchAccess.length ?? 0) > 1 ? 'multi' : 'own';
  const [form, setForm] = useState({
    userId: user?.userId ?? '', name: user?.name ?? '', designation: user?.designation ?? '', department: user?.department ?? '', status: user?.status ?? 'Active', email: user?.email ?? '', mobile: user?.mobile ?? '',
    branchCode: user?.branchCode ?? 'MNL', allBranches: user?.branchAccess === 'ALL', warehouseCode: user?.warehouseCode ?? '', roles: user?.roles ?? ([] as RoleCode[]), password: '',
    // Staff review 1.2: HRIS employee no., branch scope (own / several branches / a region / all), backup approver, portal client / vendor link.
    employeeNo: user?.employeeNo ?? '', scope: initScope as 'own' | 'multi' | 'region' | 'all', branches: (user?.branchAccess !== 'ALL' ? user?.branchAccess ?? [] : []) as string[], region: user?.regionScope ?? '',
    delegateUserId: user?.delegateUserId ?? '', delegateUntil: user?.delegateUntil ?? '', clientCode: user?.clientCode ?? '', vendorId: user?.vendorId ?? '',
  });
  const regions = [...new Set((ref?.branches ?? []).map((b) => b.region))].sort();
  const access = (): string[] | 'ALL' => form.scope === 'all' ? 'ALL' : form.scope === 'region' ? [...new Set([form.branchCode, ...(ref?.branches ?? []).filter((b) => b.region === form.region).map((b) => b.code)])] : form.scope === 'multi' ? [...new Set([form.branchCode, ...form.branches])] : [form.branchCode];
  const portalRole = form.roles.includes('CLIENT') ? 'CLIENT' : form.roles.includes('VENDOR') ? 'VENDOR' : undefined;
  const [overrides, setOverrides] = useState<Grants>(user?.overrides ?? {});
  const [tab, setTab] = useState('profile');
  const base = useMemo(() => {
    const out: Grants = {};
    for (const r of form.roles) for (const [k, v] of Object.entries(ROLE_TEMPLATES[r]?.grants ?? {})) out[k] = [...new Set([...(out[k] ?? []), ...v])];
    return out;
  }, [form.roles]);
  const save = useAction(() => api.admin.saveUser({
    userId: form.userId.trim(), name: form.name, designation: form.designation, department: form.department || undefined, status: form.status as User['status'], email: form.email, mobile: form.mobile.trim(), branchCode: form.branchCode,
    branchAccess: portalRole ? [] : access(), regionScope: form.scope === 'region' ? form.region || undefined : undefined, warehouseCode: form.warehouseCode || undefined, roles: form.roles, password: form.password || undefined, overrides,
    employeeNo: form.employeeNo.trim() || undefined, delegateUserId: form.delegateUserId || undefined, delegateUntil: form.delegateUserId ? form.delegateUntil || undefined : undefined,
    ...(isNew ? { realm: portalRole === 'CLIENT' ? 'CLIENT_PORTAL' as const : portalRole === 'VENDOR' ? 'VENDOR_PORTAL' as const : 'INTERNAL' as const } : {}),
    clientCode: portalRole === 'CLIENT' ? form.clientCode || undefined : user?.clientCode, vendorId: portalRole === 'VENDOR' ? form.vendorId || undefined : user?.vendorId,
  }, isNew), { success: isNew ? `User created — credentials emailed to ${form.email}` : form.password ? 'User saved — temporary password emailed' : 'User saved', onSuccess: onClose });
  const missingList = [!form.userId && 'User ID', !form.name && 'Name', !form.email && 'Email', !form.roles.length && 'at least one role', portalRole === 'CLIENT' && !form.clientCode && 'linked client', portalRole === 'VENDOR' && !form.vendorId && 'linked vendor', form.scope === 'region' && !portalRole && !form.region && 'region'].filter(Boolean) as string[];
  const mobileErr = form.mobile.trim() && !PH_MOBILE.test(form.mobile.trim()) ? 'Use a mobile number such as 0917 123 4567 or +63 917 123 4567' : undefined;
  const emailErr = form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? 'Enter a valid email address' : undefined;
  const missing = missingList.length > 0 || !!mobileErr || !!emailErr;
  const depts = (master.data?.lists ?? []).filter((l) => l.list === 'Department' && (l.active || l.code === form.department));
  const sod = form.roles.includes('ACCOUNTING') && form.roles.includes('FINANCE_MANAGER');
  // Default stockroom = lookup to the warehouse master (SUP-06), own branch first.
  const whs = (master.data?.warehouses ?? []).filter((w) => w.active || w.code === form.warehouseCode).sort((a, b) => Number(b.branchCode === form.branchCode) - Number(a.branchCode === form.branchCode));
  return (
    <Drawer open onClose={onClose} title={isNew ? 'New user' : `Edit ${user.userId}`} width="max-w-3xl"
      footer={<>{missing && <span className="mr-auto text-xs text-muted">Required: {missingList.join(', ')}</span>}<Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={missing} onClick={() => save.mutate(undefined)}>Save user</Button></>}>
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'profile', label: 'Profile & roles' }, { id: 'matrix', label: 'Permission matrix' }]} />
      {tab === 'profile' ? (
        <Stack>
          <FormGrid>
            <Input label="User ID" required maxLength={20} value={form.userId} disabled={!isNew} onChange={(e) => setForm({ ...form, userId: e.target.value })} placeholder="e.g. BG.MNL" hint="Immutable after creation" autoComplete="off" />
            <Input label="Name" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Juan Dela Cruz" />
            <Input label="Designation" maxLength={50} value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Branch supervisor" autoComplete="off" />
            {depts.length ? <Select label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="— Select —" options={depts.map((l) => ({ value: l.code, label: l.name }))} hint="Scopes department-level approvals (e.g. PR Dept Head)" />
              : <Input label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. OPS" hint="Department code from Master data" autoComplete="off" />}
            <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as User['status'] })} options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} hint="Locked is set automatically after too many failed sign-ins (unlock on the list)" />
            <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g. name@company.ph" hint="Used for notifications and credential delivery" autoComplete="off" error={emailErr} />
            <Input label="Mobile" type="tel" inputMode="tel" name="new-user-mobile" autoComplete="off" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="e.g. 0917 123 4567" hint="Required if the user's roles receive SMS" error={mobileErr} />
            <Select label="Default branch" value={form.branchCode} onChange={(e) => setForm({ ...form, branchCode: e.target.value })} options={[{ value: 'HO', label: 'HO — Head Office' }, ...branchOptions]} />
            <Select label="Branch scope" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as typeof form.scope, allBranches: e.target.value === 'all' })} disabled={!!portalRole}
              options={[{ value: 'own', label: 'Default branch only' }, { value: 'multi', label: 'Several branches' }, { value: 'region', label: 'A region (e.g. Regional Manager)' }, { value: 'all', label: 'All branches (Head Office role)' }]}
              hint={portalRole ? 'Portal users see only their own client / vendor records' : form.scope === 'region' && form.region ? `Access: ${access() === 'ALL' ? 'all' : (access() as string[]).join(', ')}` : 'Which branches’ records the user can see and act on'} />
            {form.scope === 'region' && !portalRole && <Select label="Region" required value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="— Select —" options={regions.map((r) => ({ value: r, label: r }))} hint="New branches in the region are not added automatically — re-save the user" />}
            {form.scope === 'multi' && !portalRole && <div className="sm:col-span-2"><p className="mb-1.5 text-[13px] font-medium text-ink-2">Other branches</p><div className="flex flex-wrap gap-x-4 gap-y-1">{branchOptions.filter((b) => b.value !== form.branchCode).map((b) => <label key={b.value} className="flex items-center gap-1.5 text-[13px] text-ink-2"><input type="checkbox" className="size-4 accent-brand-600" checked={form.branches.includes(b.value)} onChange={(e) => setForm({ ...form, branches: e.target.checked ? [...form.branches, b.value] : form.branches.filter((x) => x !== b.value) })} />{b.value}</label>)}</div></div>}
            <Input label="Employee no. (HRIS)" maxLength={20} value={form.employeeNo} onChange={(e) => setForm({ ...form, employeeNo: e.target.value })} placeholder="e.g. E-10024" hint="Links the account to the HR record (format to confirm)" autoComplete="off" />
            {!portalRole && <Select label="Backup approver (while away)" value={form.delegateUserId} onChange={(e) => setForm({ ...form, delegateUserId: e.target.value })} placeholder="— None —" options={(ref?.users ?? []).filter((u) => !u.roles.some((r) => r === 'CLIENT' || r === 'VENDOR') && u.userId !== form.userId).map((u) => ({ value: u.userId, label: `${u.name} (${u.userId})` }))} hint="Shown to requesters; automatic re-routing of approvals is pending confirmation" />}
            {!portalRole && form.delegateUserId && <Input label="Backup until" type="date" value={form.delegateUntil} onChange={(e) => setForm({ ...form, delegateUntil: e.target.value })} />}
            {portalRole === 'CLIENT' && <Select label="Linked client" required value={form.clientCode} onChange={(e) => setForm({ ...form, clientCode: e.target.value })} placeholder="— Select —" options={clientOptions} hint="The portal user sees only this client’s data" />}
            {portalRole === 'VENDOR' && <Select label="Linked vendor" required value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })} placeholder="— Select —" options={(master.data?.vendors ?? []).map((v) => ({ value: v.vendorId, label: `${v.vendorId} — ${v.name}` }))} hint="The vendor portal shows only this vendor’s POs and payments" />}
            {master.data ? (
              <Select label="Default stockroom" value={form.warehouseCode} onChange={(e) => setForm({ ...form, warehouseCode: e.target.value })} placeholder="— None —"
                options={whs.map((w) => ({ value: w.code, label: `${w.code} — ${w.name} · ${branchName(w.branchCode)}${w.active ? '' : ' · inactive'}` }))} hint="From Master data → Warehouses" />
            ) : <Input label="Default stockroom" value={form.warehouseCode} onChange={(e) => setForm({ ...form, warehouseCode: e.target.value })} placeholder="e.g. WH-MNL" hint="Warehouse list needs Master data access" />}
            <Input label={isNew ? 'Initial password (optional)' : 'Set new password (optional)'} type="password" name="new-user-initial-password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={isNew ? 'Leave blank to auto-generate' : 'Leave blank to keep current'} hint={isNew ? 'Leave blank to generate a temporary password (forced change on first login)' : 'Leave blank to keep the current password. A value typed here becomes a temporary password and is emailed to the user.'} />
          </FormGrid>
          {(isNew || form.password) && <Banner tone="info" title="Credential delivery">
            We email the user ID and a temporary password to {form.email || 'the registered email address'}. The user must change the password at first sign-in. Passwords are never shown on screen or sent by SMS. The action is recorded in the audit log.
          </Banner>}
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">Roles<span className="text-danger">*</span>{form.roles.length > 0 && <span className="ml-2 font-normal text-muted">{form.roles.length} selected</span>}</p>
            <div className="space-y-3">
              {ROLE_GROUPS.map(([g, codes]) => (
                <div key={g}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{g}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {codes.map((k) => (
                      <label key={k} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px]', form.roles.includes(k) ? 'border-brand-300 bg-brand-50' : 'border-line')}>
                        <input type="checkbox" className="size-4 accent-brand-600" checked={form.roles.includes(k)} onChange={(e) => setForm({ ...form, roles: e.target.checked ? [...form.roles, k] : form.roles.filter((r) => r !== k) })} />
                        {ROLE_TEMPLATES[k].label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {sod && <Banner tone="warning" title="Segregation-of-duties warning">This user can both raise and approve billing adjustments. The workflow engine still blocks self-approval.</Banner>}
        </Stack>
      ) : <PermissionMatrix grants={base} overrides={overrides} onChange={setOverrides} />}
    </Drawer>
  );
}

/** Virtual-scroll-friendly permission grid: rows = resources, cols = 7 legacy actions + export. */
export function PermissionMatrix({ grants, overrides, onChange, readOnly }: { grants: Grants; overrides?: Grants; onChange?: (g: Grants) => void; readOnly?: boolean }) {
  const [q, setQ] = useState('');
  const [onlyGranted, setOnlyGranted] = useState(false);
  const resources = api.admin.resources();
  const eff = (res: string) => overrides?.[res] ?? grants[res] ?? [];
  const rows = resources.filter((r) => (!q || `${r.id} ${r.description} ${r.module}`.toLowerCase().includes(q.toLowerCase())) && (!onlyGranted || eff(r.id).length));
  const modules = [...new Set(rows.map((r) => r.module))];
  const toggle = (res: string, a: Action) => {
    if (readOnly || !onChange) return;
    const cur = eff(res);
    onChange({ ...overrides, [res]: cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a] });
  };
  /** Column header click: grant the action on every listed resource, or remove it if all already have it. */
  const toggleCol = (a: Action) => {
    if (readOnly || !onChange) return;
    const allOn = rows.every((r) => eff(r.id).includes(a));
    const next: Grants = { ...overrides };
    for (const r of rows) { const cur = eff(r.id); next[r.id] = allOn ? cur.filter((x) => x !== a) : cur.includes(a) ? cur : [...cur, a]; }
    onChange(next);
  };
  const toggleRow = (res: string) => { if (!readOnly && onChange) onChange({ ...overrides, [res]: eff(res).length === ACTIONS.length ? [] : [...ACTIONS] }); };
  const changed = Object.keys(overrides ?? {}).length;
  const cell = 'inline-flex size-6 items-center justify-center rounded-md border';
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-64"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-disabled" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter resources…" className="h-9 w-full rounded-lg border border-line-strong pl-8 pr-3 text-sm focus:border-brand-600 focus:outline-none" /></div>
        <label className="flex items-center gap-2 text-[13px] text-ink-2"><input type="checkbox" className="accent-brand-600" checked={onlyGranted} onChange={(e) => setOnlyGranted(e.target.checked)} /> Show only granted</label>
        {!readOnly && <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
          {/* Legend swatches are small plain squares so they don't read as more checkboxes. */}
          <span className="flex items-center gap-1.5 text-muted"><span aria-hidden className="size-2.5 rounded-sm border-2 border-brand-600" />Inherited from role</span>
          <span className="flex items-center gap-1.5 text-muted"><span aria-hidden className="size-2.5 rounded-sm bg-brand-600" />Set for this user (override)</span>
          {changed > 0 && <span className="text-muted">{changed} overridden resource(s), saved when you save the user</span>}
          {changed > 0 && onChange && <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => onChange({})}>Reset to role template</Button>}
        </span>}
      </div>
      {/* No inner height cap: the matrix grows with the page/drawer, so there is a single scroll and the header stays sticky. */}
      <div className="rounded-lg border border-line">
        <table className="w-full text-[13px]">
          <thead className={cn('sticky z-10 bg-surface-alt text-[11px] uppercase tracking-wide text-muted', readOnly ? 'top-16' : 'top-0')}>
            <tr><th className="sticky left-0 bg-surface-alt px-3 py-2 text-left">Resource</th>{ACTIONS.map((a) => <th key={a} className="px-2 py-2 text-center">{readOnly || !onChange ? a : <button type="button" className="uppercase text-brand-700 underline decoration-dotted underline-offset-2 hover:decoration-solid" title={`Toggle ${a} for all listed resources`} onClick={() => toggleCol(a)}>{a}</button>}</th>)}</tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <FragmentRows key={m} module={m} rows={rows.filter((r) => r.module === m)} render={(r) => (
                <tr key={r.id} className={cn('border-t border-line', overrides?.[r.id] && 'bg-warning-bg/40')}>
                  <td className="sticky left-0 bg-inherit px-3 py-1.5">{readOnly || !onChange ? <p className="font-medium text-ink" title={r.id}>{r.description}</p>
                    : <button type="button" className="text-left font-medium text-ink hover:text-brand-700 hover:underline" title="Toggle all actions for this resource" onClick={() => toggleRow(r.id)}>{r.description}</button>}</td>
                  {ACTIONS.map((a) => {
                    const on = eff(r.id).includes(a);
                    const inherited = !readOnly && !overrides?.[r.id] && on;
                    return (
                      <td key={a} className="px-2 py-1.5 text-center">
                        <button type="button" disabled={readOnly} aria-pressed={on} aria-label={`${r.description} ${a}${inherited ? ' (inherited from role)' : ''}`} onClick={() => toggle(r.id, a)}
                          className={cn(cell, 'transition-colors', on ? (inherited ? 'border-2 border-brand-600 bg-surface text-brand-600' : 'border-brand-600 bg-brand-600 text-white') : 'border-disabled bg-surface text-transparent hover:border-brand-600', readOnly && 'cursor-default')}>
                          <Check className="size-3.5" />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              )} />
            ))}
          </tbody>
        </table>
      </div>
      {/* Staff review 1.2: what each action means and which screens are covered by a parent resource. */}
      <div className="mt-3 space-y-1 text-xs text-muted">
        <p><strong className="text-ink-2">Actions:</strong> View = open and print · Add = create / submit / post · Edit = change, apply or reprint · Delete = deactivate (records are never deleted) · <strong>Check</strong> = first-level verification before approval (e.g. C&amp;C checks an accreditation, Treasury confirms a top-up, the AE checks rescue costs) · <strong>Approve</strong> = sign-off on an approval step (amount tiers come from the role, e.g. hold-lift and PO gates in System settings) · Cancel = cancel with a reason · Export = CSV / Excel download (audited).</p>
        <p><strong className="text-ink-2">Screens without their own row:</strong> Client unit requests → Allocation board · Rescue dashboard → Rescue requests · Park &amp; Repair → Park &amp; Fix · Statement of account → Aging &amp; collection · My approvals → open to everyone, deciding needs Approve on the record’s resource and the step’s role · Notifications inbox → every user · Each report in the library (incl. Restricted ones) → its own resource (e.g. Audit log report → Audit log, Executive dashboard → Executive dashboard).</p>
        <p>Scope: every resource follows the user’s branch scope on the Profile tab (own branch, several branches, a region or all). A different scope per resource is not built — to be confirmed.</p>
      </div>
    </div>
  );
}
function FragmentRows<T>({ module, rows, render }: { module: string; rows: T[]; render: (r: T) => React.ReactNode }) {
  return (<>
    <tr className="bg-brand-50/60"><td colSpan={ACTIONS.length + 1} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand-800">{module}</td></tr>
    {rows.map(render)}
  </>);
}

// ── SUP-04 Audit log ────────────────────────────────────────────────────────
const RECORD_LINK: Record<string, (id: string) => string> = {
  client: (id) => `/clients/${id}`, chassis: (id) => `/chassis/${id}`, jo: (id) => `/repair/jo/${id}`, rescue: (id) => `/rescue/${id}`, ewa: () => '/gate/ewa', gatepass: () => '/gate/late',
  invoice: (id) => `/billing/invoices/${id}`, contract: (id) => `/contracts/${id}`, ewallet: (id) => `/ewallet/${id}`, user: () => '/admin/users', setting: () => '/admin/settings',
  branch: () => '/admin/master', vendor: () => '/admin/master', part: () => '/admin/master', equipmentType: () => '/admin/master', warehouse: () => '/admin/master', ratecard: () => '/admin/master',
  notification_rule: () => '/admin/notifications', pr: () => '/procurement', po: () => '/procurement', memo: () => '/billing/memos', cashbond: () => '/cash-bonds', stock: () => '/inventory/transactions',
};
/** Sensitive actions that must carry a reason (cancellations, overrides, deactivations, settings). */
const NEEDS_REASON = /(cancel|override|deactivat|settings\.|hold\.manual|force_inbound|rejected|adjust|reversal|blacklist)/;
const TZ = 'Asia/Manila (UTC+08:00)';
/** Sensitive actions shown in amber in the Action column (legend under the table). Same rule as the API's amber / blue filter. */
const SENSITIVE_ACTION = SENSITIVE_AUDIT;
type AuditRow = AuditEvent & { seq: number; branch?: string; entityName?: string };
/** 'masterdata.vendor.deactivated' → 'Vendor deactivated'; 'auth.login_failed' → 'Login failed'. The raw key stays in the tooltip and CSV. */
/** Document acronyms stay upper-case ('ewa.cancelled' → 'EWA cancelled'). */
const ACRONYM = /^(ewa|eir|po|pr|rr|jo|or|soa|dcir|rfp|ae|sms|otp|csv|vat|tin)$/i;
const actionLabel = (key: string) => {
  const s = key.split('.');
  const words = s.length > 2 ? s.slice(-2) : s.length === 2 && s[1].includes('_') ? [s[1]] : s;
  const t = words.join(' ').replace(/_/g, ' ').split(' ').map((w) => (ACRONYM.test(w) ? w.toUpperCase() : w)).join(' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const csvEsc = (v: unknown) => `"${String(typeof v === 'object' && v !== null ? JSON.stringify(v) : v ?? '').replace(/"/g, '""')}"`;

export function AuditPage() {
  const { can } = useAuth();
  const { userName } = useRefLookups();
  const { branchOptions } = useRefLookups();
  const EMPTY_F = { q: '', actor: '', entityType: '', action: '', from: '', to: '', branch: '', tone: '' };
  const [f, setF] = useState(EMPTY_F);
  const data = useData(['admin', 'audit', f], () => api.admin.audit(f));
  const all = useData(['admin', 'audit', 'facets'], () => api.admin.audit({}));
  const chain = useData(['admin', 'audit', 'verify', data.dataUpdatedAt], () => api.admin.verifyAudit());
  const exp = useAction((n: number) => api.admin.logAuditExport(n, f), { success: (/* logged */) => 'Exported — the export itself is recorded as audit.export' });
  const [sel, setSel] = useState<AuditRow | null>(null);
  // Staff review 1.2: previous / next event inside the detail (in the current filtered order).
  const list = (data.data ?? []) as AuditRow[];
  const selIdx = sel ? list.findIndex((a) => a.id === sel.id) : -1;
  const facet = (k: 'actor' | 'entityType') => [...new Set((all.data ?? []).map((a) => a[k]))].sort().map((v) => ({ value: v, label: k === 'actor' && v !== 'system' ? `${v} — ${userName(v)}` : v }));
  const actionGroups = [...new Set((all.data ?? []).map((a) => a.action.split('.')[0]))].sort().map((v) => ({ value: `${v}.`, label: `${v}.*` }));
  const exportCsv = () => {
    const rows = list;
    const head = ['No.', 'Time (Asia/Manila)', 'Actor', 'Role', 'Branch', 'Action', 'Record type', 'ID', 'Record name', 'Reason', 'Before', 'After', 'Source', 'IP address', 'Hash', 'Previous hash'];
    const body = rows.map((a) => [a.seq, formatDateTime(a.at), a.actor, a.actorRole, a.branch, a.action, a.entityType, a.entityId, a.entityName, a.reason, a.before, a.after, a.source, a.ip, a.hash, a.prevHash].map(csvEsc).join(','));
    const url = URL.createObjectURL(new Blob([[head.map(csvEsc).join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const el = document.createElement('a'); el.href = url; el.download = 'audit-log.csv'; el.click(); URL.revokeObjectURL(url);
    exp.mutate(rows.length);
  };
  const cols: ColumnDef<AuditRow>[] = [
    { accessorKey: 'seq', header: 'No.', meta: { align: 'right' }, cell: (c) => <span className="font-mono text-xs text-muted" title={`Event ${c.getValue<number>()} in the hash chain · #${c.row.original.hash ?? '—'}`}>{c.getValue<number>()}</span> },
    { accessorKey: 'at', header: 'Time (UTC+8)', cell: (c) => <span className="whitespace-nowrap">{formatDateTime(c.getValue<string>())}</span> },
    { accessorKey: 'actor', header: 'Actor', cell: (c) => <div><p className="font-mono">{c.getValue<string>()}</p><p className="text-[11px] text-muted">{c.row.original.actorRole ? ROLE_TEMPLATES[c.row.original.actorRole as RoleCode]?.label ?? c.row.original.actorRole : ''}</p></div> },
    { accessorKey: 'branch', header: 'Branch', cell: (c) => <span className="font-mono text-xs">{c.getValue<string>() ?? '—'}</span> },
    { accessorKey: 'action', header: 'Action', cell: (c) => <span title={c.getValue<string>()}><Badge tone={SENSITIVE_ACTION.test(c.getValue<string>()) ? 'warning' : 'brand'} dot={false}>{actionLabel(c.getValue<string>())}</Badge></span> },
    { accessorKey: 'entityType', header: 'Record type' },
    { accessorKey: 'entityId', header: 'ID', cell: (c) => <div><p className="font-mono">{c.getValue<string>()}</p>{c.row.original.entityName && c.row.original.entityName !== c.getValue<string>() && <p className="max-w-[12rem] truncate text-[11px] text-muted" title={c.row.original.entityName}>{c.row.original.entityName}</p>}</div> },
    { accessorKey: 'source', header: 'Source · IP', cell: (c) => <div className="text-xs">{c.getValue<string>() ? <p>{c.getValue<string>()}</p> : <p className="text-muted">—</p>}<p className="font-mono text-[11px] text-muted">{c.row.original.ip ?? (c.row.original.actor === 'system' ? 'server job' : 'IP not captured in the demo')}</p></div> },
    // System-job reasons drop internal rule IDs; user-entered reasons stay verbatim.
    { accessorKey: 'reason', header: 'Reason', cell: (c) => c.getValue<string>() ? <span className="block min-w-[14rem] max-w-sm whitespace-normal break-words">{c.row.original.actor === 'system' ? stripCodes(c.getValue<string>()) : c.getValue<string>()}</span>
      : NEEDS_REASON.test(c.row.original.action) ? <Badge tone="danger">Reason missing</Badge> : <span className="text-muted">—</span> },
    { id: 'chg', header: 'Changes', cell: (c) => (c.row.original.before !== undefined || c.row.original.after !== undefined ? <span className="text-xs text-brand-700">View before / after</span> : <span className="text-muted">—</span>) },
  ];
  const clear = () => setF(EMPTY_F);
  const filtered = Object.values(f).some(Boolean);
  const viewers = Object.entries(ROLE_TEMPLATES).filter(([, r]) => r.grants['admin.audit']?.includes('view')).map(([, r]) => r.label);
  const exporters = Object.entries(ROLE_TEMPLATES).filter(([, r]) => r.grants['admin.audit']?.includes('export')).map(([, r]) => r.label);
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of critical transactions and administrative actions. There is no edit or delete anywhere; deactivated records stay viewable."
        actions={chain.data && (chain.data.ok
          ? <Badge tone="success" icon={<ShieldCheck className="size-3.5" />}>Hash chain verified · {chain.data.sealed} sealed events</Badge>
          : <Badge tone="danger" icon={<ShieldAlert className="size-3.5" />}>Integrity check FAILED at {chain.data.brokenAt}</Badge>)} />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Input label="Search" placeholder="Search…" title="Search actor, action, entity or reason" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <Select label="User" value={f.actor} onChange={(e) => setF({ ...f, actor: e.target.value })} placeholder="All users" options={facet('actor')} />
          <Select label="Branch" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="All branches" options={[{ value: 'HO', label: 'HO — Head Office' }, ...branchOptions]} />
          <Select label="Sensitivity" value={f.tone} onChange={(e) => setF({ ...f, tone: e.target.value })} placeholder="Amber + blue" options={[{ value: 'sensitive', label: 'Amber (sensitive)' }, { value: 'routine', label: 'Blue (routine)' }]} />
          <Select label="Record type" value={f.entityType} onChange={(e) => setF({ ...f, entityType: e.target.value })} placeholder="All record types" options={facet('entityType')} />
          <Select label="Action" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} placeholder="All actions" options={actionGroups} />
          <Input label="From" type="date" value={f.from} max={f.to || undefined} onChange={(e) => setF({ ...f, from: e.target.value })} />
          <Input label="To" type="date" value={f.to} min={f.from || undefined} onChange={(e) => setF({ ...f, to: e.target.value })} error={f.from && f.to && f.to < f.from ? 'To is before From' : undefined} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>Times and date filters are in {TZ}. {data.data ? <><span className="font-semibold text-ink">{data.data.length.toLocaleString()}</span> event(s){filtered ? ' match the filters' : ' in total'}.</> : null}</span>
          <div className="flex gap-2">
            {filtered && <Button size="sm" variant="ghost" onClick={clear}>Clear filters</Button>}
            {can('admin.audit', 'export') ? <Button size="sm" variant="secondary" icon={<Download className="size-4" />} loading={exp.isPending} disabled={!data.data?.length} onClick={exportCsv}>Export CSV</Button>
              : <span title="Needs Audit log → Export permission"><Button size="sm" variant="secondary" icon={<Lock className="size-4" />} disabled>Export</Button></span>}
          </div>
        </div>
      </Card>
      {data.isError ? <Banner tone="danger" title="Could not load the audit log">{data.error instanceof ApiError ? data.error.message : 'Please retry.'}</Banner> : (
        <DataTable data={data.data ? list : undefined} loading={data.isLoading} columns={cols} onRowClick={setSel} searchable={false} pageSize={25}
          emptyTitle="No audit events match these filters" emptyHint="Widen the date range or clear the filters." />
      )}
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted"><Badge tone="warning" dot={false}>Amber</Badge> actions are sensitive (cancellations, deactivations, failed or locked sign-ins, exports, role changes, password resets, overrides, settings changes); <Badge tone="brand" dot={false}>Blue</Badge> actions are routine. No. = the event’s position in the hash chain (1 = oldest). Branch = the record’s branch, otherwise the user’s home branch. 25 events per page.</p>
      <p className="mt-1 text-xs text-muted">Access: view — {viewers.join(', ')}; export — {exporters.join(', ')} (per-user overrides in Users &amp; roles).</p>
      <Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? `Audit event No. ${sel.seq}` : 'Audit event'} width="max-w-2xl"
        footer={sel && <><span className="mr-auto text-xs text-muted">{selIdx >= 0 ? `${selIdx + 1} of ${list.length} in this list` : ''}</span>
          <Button variant="secondary" size="sm" disabled={selIdx <= 0} onClick={() => setSel(list[selIdx - 1])}>← Newer</Button>
          <Button variant="secondary" size="sm" disabled={selIdx < 0 || selIdx >= list.length - 1} onClick={() => setSel(list[selIdx + 1])}>Older →</Button></>}>
        {sel && <Stack>
          <div className="grid grid-cols-2 gap-3">
            <ReadField label="Event no.">{sel.seq} of {chain.data?.total ?? list.length} <span className="text-xs text-muted">(1 = oldest)</span></ReadField>
            <ReadField label={`Time (${TZ})`}>{formatDateTime(sel.at)}</ReadField>
            <ReadField label="Actor">{sel.actor === 'system' ? 'system (scheduled job)' : `${sel.actor} — ${userName(sel.actor)}`}{sel.actorRole && <span className="block text-xs text-muted">{ROLE_TEMPLATES[sel.actorRole as RoleCode]?.label ?? sel.actorRole}</span>}</ReadField>
            <ReadField label="Action"><Badge tone={SENSITIVE_ACTION.test(sel.action) ? 'warning' : 'brand'} dot={false}>{actionLabel(sel.action)}</Badge><span className="mt-0.5 block font-mono text-[11px] text-muted">{sel.action}</span></ReadField>
            <ReadField label="Record">{sel.entityName && sel.entityName !== sel.entityId && <span className="block font-medium">{sel.entityName}</span>}{sel.entityType} · <span className="font-mono">{sel.entityId}</span>{RECORD_LINK[sel.entityType] && <Link to={RECORD_LINK[sel.entityType](sel.entityId)} className="ml-2 text-brand-600 hover:underline">Open record →</Link>}{sel.entityType === 'report' && <Link to={`/reports/view/${sel.entityId}`} className="ml-2 text-brand-600 hover:underline">Open report →</Link>}</ReadField>
            <ReadField label="Branch">{sel.branch ?? '—'}</ReadField>
            <ReadField label="Source (channel · device)">{sel.source ?? '—'}</ReadField>
            <ReadField label="IP address">{sel.ip ? <span className="font-mono">{sel.ip}</span> : sel.actor === 'system' ? 'Server job (no client IP)' : 'Not captured in the demo (the server records it)'}</ReadField>
            <ReadField label="Integrity (this event ← previous event)">{sel.hash ? <span className="font-mono text-xs" title="Each event's hash includes the previous event's hash; any edit breaks the chain">#{sel.hash} ← #{sel.prevHash}</span> : 'Not sealed'}</ReadField>
            <ReadField label="Reason">{sel.reason ? (sel.actor === 'system' ? stripCodes(sel.reason) : sel.reason) : NEEDS_REASON.test(sel.action) ? <Badge tone="danger">Reason missing</Badge> : <span className="text-muted">— (not required for this action)</span>}</ReadField>
          </div>
          {!sel.reason && NEEDS_REASON.test(sel.action) && <Banner tone="danger" title="Reason missing">This is a sensitive action and should carry a reason. New cancellations and overrides require one.</Banner>}
          {sel.action === 'report.run' && <p className="text-xs text-muted">Report runs change nothing, so the table lists the parameters used (After) — blank filters show as “All …” / “Any”.</p>}
          <ChangeDiff before={sel.before} after={sel.after} />
        </Stack>}
      </Drawer>
    </>
  );
}

/** Field-level before/after table for material changes (falls back to raw JSON for non-objects). */
function ChangeDiff({ before, after }: { before: unknown; after: unknown }) {
  if (before === undefined && after === undefined) return <p className="text-sm text-muted">No field values were recorded for this event.</p>;
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const b = isObj(before) ? before : {}; const a = isObj(after) ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const show = (v: unknown) => (v === undefined ? <span className="text-muted">—</span> : typeof v === 'object' ? <code className="text-[11px]">{JSON.stringify(v)}</code> : String(v));
  if (!isObj(before) && before !== undefined || !isObj(after) && after !== undefined) return <pre className="overflow-auto rounded-lg bg-surface-alt p-3 text-xs">{JSON.stringify({ before, after }, null, 2)}</pre>;
  return (
    <div className="overflow-auto rounded-lg border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-surface-alt text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-3 py-2 text-left">Field</th><th className="px-3 py-2 text-left">Before</th><th className="px-3 py-2 text-left">After</th></tr></thead>
        <tbody>{keys.map((k) => { const changed = JSON.stringify(b[k]) !== JSON.stringify(a[k]); return (
          <tr key={k} className={cn('border-t border-line align-top', changed && before !== undefined && 'bg-warning-bg/40')}><td className="px-3 py-1.5 font-mono text-xs">{k}</td><td className="max-w-[16rem] break-words px-3 py-1.5">{show(b[k])}</td><td className="max-w-[16rem] break-words px-3 py-1.5">{show(a[k])}</td></tr>); })}</tbody>
      </table>
    </div>
  );
}

// ── SUP-05 System settings ──────────────────────────────────────────────────
const fmtSetting = (s: Pick<SettingDef, 'type' | 'unit' | 'options'> & { label?: string }, v: unknown) => {
  if (s.type === 'boolean') return v ? 'Yes' : 'No';
  if (s.options) return stripCodes(s.options.find((o) => o.value === v)?.label ?? String(v));
  if (s.type === 'money') return formatPhp(Number(v));
  if (s.type === 'percent') return `${Math.round(Number(v) * 1000) / 10}%`;
  if (s.type === 'json') return String(v).length > 40 ? `${String(v).slice(0, 40)}…` : String(v);
  // One list format: comma + space, with the unit when the label names one ("90, 30, 14 days").
  if (s.type === 'text' && /^[^,]+(,[^,]+)+$/.test(String(v))) {
    const list = String(v).split(',').map((x) => x.trim()).join(', ');
    return /^[\d, ]+$/.test(list) && /\(days\b/i.test(s.label ?? '') ? `${list} days` : list;
  }
  // One multiplier format everywhere ("1.00×", as on Master data → Branches); singular unit for 1 ("1 day").
  if (s.unit === '×' && s.type === 'number') return `${Number(v).toFixed(2)}×`;
  const unit = s.unit ?? (s.type === 'number' && /\bhours\b/i.test(s.label ?? '') ? 'hours' : undefined);
  if (unit && s.type === 'number') return unit === '%' ? `${String(v)}%` : `${String(v)} ${Number(v) === 1 && /s$/.test(unit) ? unit.slice(0, -1) : unit}`;
  return String(v);
};

export function SettingsPage() {
  const { can } = useAuth();
  const { userName } = useRefLookups();
  const data = useData(['admin', 'settings'], () => api.admin.settings());
  const [edit, setEdit] = useState<SettingDef | null>(null);
  const [editHist, setEditHist] = useState(false);
  const [q, setQ] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const rows = (data.data ?? []).filter((s) => (!onlyPending || s.pending) && (!q || `${s.label} ${s.key} ${s.rule}`.toLowerCase().includes(q.toLowerCase())));
  const groups = [...new Set(rows.map((s) => s.group))];
  const pending = (data.data ?? []).filter((s) => s.pending);
  const canEdit = can('admin.settings', 'edit');
  return (
    <>
      <PageHeader title="System settings" description="Business-rule parameters that change without a code deployment. Every change is validated, needs a reason and an effective date, and is written to the audit log. Changes never rewrite values already stamped on documents." />
      {pending.length > 0 && <Banner tone="warning" className="mb-3" title={`${pending.length} values are proposed defaults awaiting a Delbros decision`}
        actions={<Button size="sm" variant="secondary" onClick={() => setOnlyPending(!onlyPending)}>{onlyPending ? 'Show all settings' : `Show ${pending.length} pending`}</Button>}>
        They work as shown until the decision is made; each is marked “Pending”.
      </Banner>}
      <Banner tone="info" className="mb-5" title="Who may edit">
        Only roles with System settings → Edit (System Administrator by default). Sensitive settings (hold, tiers, thresholds, VAT, security) are flagged; whether they need a second approver is still to be decided.{!canEdit && ' You have view-only access.'}
      </Banner>
      {/* Review 1.1: system locale, fixed for this release (one time zone, date format and currency across every screen and document). */}
      <Card className="mb-5"><CardHeader title="Regional settings (system-wide)" description="Fixed for this release; every screen, report, document and date filter uses them." />
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[['Time zone', TZ], ['“Today” and date defaults', 'Manila calendar day'], ['Date format', `dd-Mon-yyyy (e.g. ${formatDate(new Date().toISOString())})`], ['Time format', '24-hour (HH:mm)'], ['Currency', 'Philippine peso (₱), 2 decimals'], ['Number format', '1,234,567.89']].map(([k, v]) =>
            <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium text-ink">{v}</dd></div>)}
        </dl>
      </Card>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input aria-label="Search settings" placeholder="Search settings…" value={q} onChange={(e) => setQ(e.target.value)} wrapperClassName="w-80" />
        <label className="flex items-center gap-2 text-[13px] text-ink-2"><input type="checkbox" className="accent-brand-600" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Only pending decisions</label>
      </div>
      {/* Staff review 1.2: index of every group (incl. the ones further down: Regulatory, Allocation, Company, Security…). */}
      {groups.length > 1 && <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs"><span className="text-muted">Jump to:</span>{groups.map((g) => <button key={g} type="button" className="rounded-full border border-line px-2.5 py-0.5 text-ink-2 hover:border-brand-600 hover:text-brand-700" onClick={() => document.getElementById(`setgrp-${g}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{g} <span className="text-muted">{rows.filter((s) => s.group === g).length}</span></button>)}</div>}
      {data.isError && <Banner tone="danger" title="Could not load settings">{data.error instanceof ApiError ? data.error.message : 'Please retry.'}</Banner>}
      {/* Masonry (CSS columns): short cards stack under each other instead of leaving holes beside taller neighbours. */}
      <div className="gap-5 xl:columns-2">
        {groups.map((g) => (
          <Card key={g} padded={false} className="mb-5 break-inside-avoid">
            <div id={`setgrp-${g}`} className="scroll-mt-20 border-b border-line px-5 py-3"><h2 className="font-semibold">{g}</h2></div>
            <ul>
              {rows.filter((s) => s.group === g).map((s) => {
                const shown = fmtSetting(s, s.value);
                // Long text values get their own full-width line under the label instead of being cut off; the scoring model opens in the dialog.
                const long = s.type === 'json' || shown.length > 22;
                return (
                  <li key={s.key} className="flex items-start justify-between gap-3 border-b border-line px-5 py-3 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">
                        {s.label}
                        {s.pending && <span title={s.decision ? `Pending decision ${s.decision}` : 'Pending decision'} className="ml-2 inline-block align-middle"><Badge tone="warning">Pending</Badge></span>}
                        {s.sensitive && <span className="ml-1.5 inline-block align-middle"><Badge tone="purple" dot={false}>Sensitive</Badge></span>}
                      </p>
                      {long && (s.type === 'json'
                        ? <button type="button" className="mt-1 text-sm font-medium text-brand-600 hover:underline" onClick={() => setEdit(s)}>View model →</button>
                        : <p className="mt-1 text-sm font-semibold text-ink">{shown}</p>)}
                      {/* Staff review 1.2: effective date and last change on every row, and the shipped default when the value differs. */}
                      {s.updatedAt ? <p className="mt-0.5 text-[11px] text-muted">Effective {formatDate(s.effectiveFrom ?? s.updatedAt)} · last changed {formatDateTime(s.updatedAt)} by {userName(s.updatedBy)}</p>
                        : <p className="mt-0.5 text-[11px] text-muted">Shipped default · in effect since go-live · never changed</p>}
                      {(() => { const dv = DEFAULT_SETTINGS.find((x) => x.key === s.key)?.value; return dv !== undefined && JSON.stringify(dv) !== JSON.stringify(s.value) ? <p className="text-[11px] text-muted">Default {fmtSetting(s, dv)}</p> : null; })()}
                      {s.scheduled && <p className="text-[11px] text-info">Changes to {fmtSetting(s, s.scheduled.value)} on {formatDate(s.scheduled.from)}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {!long && <span className="whitespace-nowrap text-right text-sm font-semibold tabular">{shown}</span>}
                      <Button size="sm" variant="ghost" className="!px-2" icon={<History className="size-4" />} title="Change history" aria-label={`History of ${s.label}`} onClick={() => { setEdit(s); setEditHist(true); }} />
                      <Button size="sm" variant="secondary" onClick={() => { setEdit(s); setEditHist(false); }}>{canEdit ? 'Edit' : 'View'}</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
      {edit && <SettingEditor def={edit} canEdit={canEdit} openHistory={editHist} onClose={() => setEdit(null)} />}
    </>
  );
}

function SettingEditor({ def, canEdit, openHistory, onClose }: { def: SettingDef; canEdit: boolean; openHistory?: boolean; onClose: () => void }) {
  const { userName } = useRefLookups();
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  const toInput = (v: unknown) => (def.type === 'percent' ? String(Math.round(Number(v) * 10000) / 100) : String(v));
  const [val, setVal] = useState<string | boolean>(def.type === 'boolean' ? Boolean(def.value) : toInput(def.value));
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState(today);
  const [hist, setHist] = useState(!!openHistory);
  const [done, setDone] = useState<{ scheduled: boolean; from: string } | null>(null);
  const parsed: unknown = def.type === 'boolean' || def.options || def.type === 'text' || def.type === 'json' ? val : String(val).trim() === '' ? '' : def.type === 'percent' ? Math.round(Number(val) * 100) / 10000 : Number(val);
  const err = validateSetting(def, parsed);
  const changed = JSON.stringify(parsed) !== JSON.stringify(def.value);
  const dflt = DEFAULT_SETTINGS.find((d) => d.key === def.key)?.value;
  const impact = useData(['admin', 'setting-impact', def.key, parsed], () => api.admin.settingImpact(def.key, parsed), !err && changed);
  const history = useData(['admin', 'setting-history', def.key], () => api.admin.settingHistory(def.key), hist);
  const save = useAction(() => api.admin.saveSetting(def.key, parsed, reason, { effectiveFrom: from, expected: def.value }), { success: (r) => (r.scheduled ? `Change scheduled for ${formatDate(r.from)}` : 'Setting saved — takes effect immediately'), onSuccess: (r) => setDone(r) });
  const reasonErr = reason && reason.trim().length < 10 ? 'At least 10 characters' : undefined;
  const fromErr = from < today ? 'Today or later' : undefined;
  // "Whole number from 1 to 365 days" — the unit is stated once, after the range.
  const rn = (v: number) => (def.type === 'number' ? String(v) : fmtSetting({ ...def, options: undefined }, v));
  const unitSfx = def.type === 'number' && def.unit ? (def.unit === '%' || def.unit === '×' ? def.unit : ` ${def.unit}`) : '';
  const kind = def.integer ? 'Whole number' : 'Value';
  const range = def.min != null && def.max != null ? `${kind} from ${rn(def.min)} to ${rn(def.max)}${unitSfx}`
    : def.min != null ? `${kind} of at least ${rn(def.min)}${unitSfx}` : def.max != null ? `${kind} up to ${rn(def.max)}${unitSfx}` : undefined;
  const serverErr = save.error instanceof ApiError ? save.error : null;
  const tech = (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer select-none">Technical details</summary>
      <p className="mt-1 font-mono">{def.key}</p>
      {def.rule && <p className="font-mono">{def.rule}{def.decision ? ` · ${def.decision}` : ''}</p>}
    </details>
  );
  if (done) return (
    <Modal open onClose={onClose} title={def.label} footer={<Button onClick={onClose}>Done</Button>}>
      <Stack>
        <Banner tone="success" title={done.scheduled ? `Scheduled for ${formatDate(done.from)}` : 'Saved'}>
          {fmtSetting(def, def.value)} → <strong>{fmtSetting(def, parsed)}</strong>. The change is recorded in the audit log with your reason.
        </Banner>
        <Link to="/admin/audit" className="text-sm font-medium text-brand-600 hover:underline">Open the audit log →</Link>
      </Stack>
    </Modal>
  );
  return (
    <Modal open onClose={onClose} title={def.label} size="lg"
      footer={<>
        <div className="mr-auto flex flex-wrap gap-1">
          {canEdit && dflt !== undefined && <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} disabled={JSON.stringify(parsed) === JSON.stringify(dflt)} onClick={() => setVal(def.type === 'boolean' ? Boolean(dflt) : toInput(dflt))} title={`Default: ${fmtSetting(def, dflt)}`}>Reset to default</Button>}
          <Button size="sm" variant="ghost" icon={<History className="size-4" />} onClick={() => setHist(!hist)}>{hist ? 'Hide history' : 'View history'}</Button>
        </div>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>{canEdit && <Button loading={save.isPending} disabled={!!err || !changed || reason.trim().length < 10 || !!fromErr} onClick={() => save.mutate(undefined)}>{from > today ? 'Schedule change' : 'Save'}</Button>}</>}>
      <Stack>
        {def.help && <p className="text-sm text-ink-2">{def.help}</p>}
        {def.pending && <Banner tone="warning" title="Proposed default — awaiting a Delbros decision">Not decided yet. Record who decided and when once Delbros confirms the value.</Banner>}
        {def.sensitive && <Banner tone="info">Sensitive setting — changes affect account status or approvals. Whether a second approver is needed is still to be decided.</Banner>}
        {!canEdit && <Banner tone="danger" title="View only">You do not have System settings → Edit permission.</Banner>}
        {changed && !err ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-alt/50 px-4 py-3 text-sm">
            <span className="text-muted">Current <span className="font-medium text-ink-2">{fmtSetting(def, def.value)}</span></span>
            <ArrowRight className="size-4 text-muted" aria-hidden />
            <span className={cn('font-bold', dflt !== undefined && JSON.stringify(parsed) !== JSON.stringify(dflt) ? 'text-warning' : 'text-brand-700')}>New {fmtSetting(def, parsed)}</span>
            {dflt !== undefined && JSON.stringify(parsed) !== JSON.stringify(dflt) && <span className="text-xs text-muted">(default {fmtSetting(def, dflt)})</span>}
          </div>
        ) : <ReadField label="Current value">{def.type === 'json' ? <code className="break-all text-xs">{String(def.value)}</code> : fmtSetting(def, def.value)}</ReadField>}
        {def.type === 'boolean' ? <div><p className="mb-1.5 text-[13px] font-medium text-ink-2">Value</p><Segmented value={val ? 'yes' : 'no'} onChange={(v) => setVal(v === 'yes')} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} /></div>
          : def.options ? <Select label="Value" required value={String(val)} onChange={(e) => setVal(e.target.value)} options={def.options.map((o) => ({ ...o, label: stripCodes(o.label) }))} error={err} disabled={!canEdit} />
          : def.type === 'json' ? <Textarea label="Value (JSON)" required rows={4} className="font-mono text-xs" value={String(val)} onChange={(e) => setVal(e.target.value)} error={err} placeholder='e.g. {"key": "value"}' disabled={!canEdit} />
          : def.type === 'money' ? <MoneyInput label="Value (₱)" required value={String(val)} onChange={(e) => setVal(e.target.value)} error={err} hint={range} disabled={!canEdit} />
          : <Input label={`Value${def.unit ? ` (${def.unit})` : ''}`} required type={def.type === 'text' ? 'text' : 'number'} step={def.integer ? 1 : 'any'} inputMode={def.type === 'text' ? 'text' : 'decimal'} value={String(val)} onChange={(e) => setVal(e.target.value)} error={err} placeholder={def.type === 'text' ? 'Enter a value' : `e.g. ${String(def.value)}${def.unit ? ` ${def.unit}` : ''}`} hint={range} disabled={!canEdit} />}
        {impact.data && impact.data.lines.length > 0 && <Banner tone={impact.data.tone} title="Impact preview">{impact.data.lines.map((l) => <p key={l}>{l}</p>)}</Banner>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Effective from" type="date" required min={today} value={from} onChange={(e) => setFrom(e.target.value)} error={fromErr} disabled={!canEdit} hint="Today = immediately. A future date schedules the change." />
          <ReadField label="Last changed">{def.updatedAt ? `${formatDateTime(def.updatedAt)} by ${userName(def.updatedBy)}` : 'Never changed — default value'}</ReadField>
        </div>
        <Textarea label="Reason for change" required value={reason} onChange={(e) => setReason(e.target.value)} error={reasonErr} placeholder="Why this setting is changing (kept in the audit trail)" hint="Recorded in the audit trail (min. 10 characters)" disabled={!canEdit} />
        {serverErr && <Banner tone="danger" title={serverErr.code === 'CONCURRENT_EDIT' ? 'Changed by another administrator' : serverErr.code === 'FORBIDDEN' ? 'Permission denied' : 'Could not save'}>{serverErr.message}</Banner>}
        {tech}
        {hist && (history.isLoading ? <p className="text-sm text-muted">Loading…</p> : !history.data?.length ? <p className="text-sm text-muted">No changes recorded yet — the value is the shipped default.</p> : (
          <ul className="space-y-2 text-[13px]">{history.data.map((h) => {
            const b = (h.before as { value?: unknown } | undefined)?.value; const a = (h.after as { value?: unknown; effectiveFrom?: string } | undefined);
            return <li key={h.id} className="rounded-lg border border-line px-3 py-2"><p><span className="font-medium">{fmtSetting(def, b)} → {fmtSetting(def, a?.value)}</span>{a?.effectiveFrom && <span className="text-muted"> · effective {formatDate(a.effectiveFrom)}</span>}</p><p className="text-xs text-muted">{formatDateTime(h.at)} · {h.actor} · {h.action}</p>{h.reason && <p className="text-xs text-ink-2">“{h.reason}”</p>}</li>;
          })}</ul>
        ))}
      </Stack>
    </Modal>
  );
}

// ── SUP-06 Master data ──────────────────────────────────────────────────────
type MD = Awaited<ReturnType<typeof api.admin.masterData>>;
type Rec = Record<string, unknown>;
type FieldSpec = { k: string; label: string; type?: 'text' | 'number' | 'money' | 'select' | 'bool' | 'csv'; options?: { value: string; label: string }[]; required?: boolean; key?: boolean; hint?: string; placeholder?: string; locked?: boolean };
const get = (r: Rec, k: string): unknown => k.split('.').reduce<unknown>((o, p) => (o as Rec | undefined)?.[p], r);
const set = (r: Rec, k: string, v: unknown): Rec => { const [h, ...t] = k.split('.'); return { ...r, [h]: t.length ? set((r[h] as Rec) ?? {}, t.join('.'), v) : v }; };
const ActiveBadge = ({ active, reason }: { active?: boolean; reason?: string }) => <span title={reason}><StatusBadge domain="generic" value={active === false ? 'Inactive' : 'Active'} /></span>;
const statusOk = (st: string, active?: boolean) => st === 'all' || (st === 'active' ? active !== false : active === false);
/** The DEMO DATA badge already says the records are demo data; the '(demo)' suffix only made names wrap. */
const plain = (s?: string) => (s ?? '').replace(/\s*\(demo\)\s*$/i, '');
/** Full CSV for tables whose on-screen columns are merged (every field stays in the export). */
function ExportCsv<T>({ name, rows, cols }: { name: string; rows?: T[]; cols: [string, (r: T) => unknown][] }) {
  const run = () => {
    const body = (rows ?? []).map((r) => cols.map(([, f]) => csvEsc(f(r))).join(','));
    const url = URL.createObjectURL(new Blob([[cols.map(([h]) => csvEsc(h)).join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const el = document.createElement('a'); el.href = url; el.download = `${name}.csv`; el.click(); URL.revokeObjectURL(url);
  };
  return <Button className="ml-auto h-9 shrink-0" variant="secondary" size="sm" icon={<Download className="size-4" />} disabled={!rows?.length} onClick={run}>Export</Button>;
}

export function MasterDataPage() {
  const { can } = useAuth();
  const data = useData(['admin', 'master'], () => api.admin.masterData());
  const { branchName, eqName } = useRefLookups();
  const [tab, setTab] = useState('branches');
  const [st, setSt] = useState('all');
  const [flt, setFlt] = useState('');
  const [listName, setListName] = useState('Axle configuration');
  const [ed, setEd] = useState<{ kind: MasterKind; rec: Rec; isNew: boolean } | null>(null);
  const [rate, setRate] = useState<{ equipmentType: string; contractType: ContractType } | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const d = data.data;
  const vendorOpts = (d?.vendors ?? []).map((v) => ({ value: v.vendorId, label: `${v.vendorId} — ${v.name}` }));
  const regionOpts = [...new Set((d?.branches ?? []).map((b) => b.region))].map((r) => ({ value: r, label: r }));
  const lists = [...new Set((d?.lists ?? []).map((l) => l.list))];
  const statusSel = <Select aria-label="Status" value={st} onChange={(e) => setSt(e.target.value)} options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} wrapperClassName="w-40" />;
  const add = (kind: MasterKind, rec: Rec = {}, label = 'Add') => can('admin.masterdata', 'add') && <Button icon={<Plus className="size-4" />} onClick={() => setEd({ kind, rec, isNew: true })}>{label}</Button>;
  // Primary action sits top-right in the page header (as on other screens), per tab.
  const headerAction = {
    branches: add('branch', { isHeadOffice: false, partsMultiplier: 1, issuesGatePasses: true }, 'Add branch'),
    warehouses: add('warehouse', { active: true }, 'Add warehouse'),
    eq: add('equipmentType', { sort: (d?.equipmentTypes.length ?? 0) + 1, placeholder: true }, 'Add equipment type'),
    rates: can('admin.masterdata', 'edit') && <Button icon={<Plus className="size-4" />} onClick={() => setRate({ equipmentType: d?.equipmentTypes[0]?.code ?? 'EQ1', contractType: 'LTL' })}>New rate</Button>,
    parts: add('part', { uom: 'pc', lowStockThreshold: 5, movementClass: 'Slow', scrapFlag: false }, 'Add part'),
    vendors: add('vendor', { status: 'Pending', paymentTerms: '30 days', vatStatus: 'VAT-registered', entityCodes: ['DBL'], portalAccess: false }, 'Add vendor'),
    lists: listName !== 'Contract type' && add('list', { list: listName, standard: false, active: true }, 'Add item'),
  }[tab];
  /** Row affordance: rows open the editor (edit / deactivate). Pinned right by DataTable (id 'a'). */
  const openCol = () => ({ id: 'a', header: '', cell: () => <ChevronRight className="size-4 text-muted" aria-label="Open to edit or deactivate" /> });
  const dash = <span className="text-muted">—</span>;
  const vendorName = (id?: string) => d?.vendors.find((v) => v.vendorId === id)?.name;
  const open = (kind: MasterKind) => (r: unknown) => setEd({ kind, rec: r as Rec, isNew: false });
  const tabs = [{ id: 'branches', label: 'Branches', count: d?.branches.length }, { id: 'warehouses', label: 'Warehouses', count: d?.warehouses.length }, { id: 'eq', label: 'Equipment types', count: d?.equipmentTypes.length },
    { id: 'rates', label: 'Rate cards', count: d?.rateCards.filter((r) => !r.validTo).length }, { id: 'parts', label: 'Parts', count: d?.parts.length }, { id: 'vendors', label: 'Vendors', count: d?.vendors.length }, { id: 'lists', label: 'Other lists', count: lists.length }];
  const curRate = (e: string, t: ContractType) => d?.rateCards.find((r) => r.equipmentType === e && r.contractType === t && !r.validTo);
  return (
    <>
      <PageHeader title="Master data" description="Reference lists used across modules. Records are deactivated with a reason, never deleted; every add, edit and deactivation is audited. Rate cards and part prices are effective-dated and never overwritten." actions={headerAction || undefined} />
      <Tabs className="mb-4" value={tab} onChange={(t) => { setTab(t); setSt('all'); setFlt(''); }} items={tabs} />
      {tab === 'branches' && <Stack>
        <p className="text-xs text-muted">Region hierarchy: <strong>Luzon</strong> → NCR · North Luzon · South Luzon; <strong>Visayas</strong>; <strong>Mindanao</strong>. The gate-pass number format (prefix + digits, 6 digits in use — System settings) and whether Head Office issues gate passes are still to be confirmed. Other documents take the branch code automatically (EIR-MNL-, INV-MNL-, OR-MNL-, PR-MNL-, JO-MNL-), so they need no prefix field. Entity and “served by” stockroom are proposed defaults.</p>
        {(() => { const rows = d?.branches.filter((b) => statusOk(st, b.active) && (!flt || b.region === flt || b.regionGroup === flt)); return (
        <DataTable data={rows} loading={data.isLoading} onRowClick={open('branch')}
          toolbar={<><Select aria-label="Region" value={flt} onChange={(e) => setFlt(e.target.value)} placeholder="All regions" options={[...['Luzon', 'Visayas', 'Mindanao'].map((g) => ({ value: g, label: `${g} (group)` })), ...regionOpts]} wrapperClassName="w-48" />{statusSel}
            <ExportCsv name="branches" rows={rows} cols={[['Code', (b) => b.code], ['Name', (b) => b.name], ['Island group', (b) => b.regionGroup], ['Region', (b) => b.region], ['Manager / contact', (b) => b.manager], ['Phone', (b) => b.phone], ['Address', (b) => b.address], ['Entity', (b) => b.entityCode], ['Served by stockroom', (b) => b.servedByWarehouse], ['Gate-pass prefix', (b) => (b.issuesGatePasses === false ? '' : b.gatePassPrefix)],
              ['Issues gate passes', (b) => (b.issuesGatePasses === false ? 'No' : 'Yes')], ['Warehouses', (b) => b.warehouses.join(', ')], ['Parts multiplier', (b) => Number(b.partsMultiplier ?? 1).toFixed(2)], ['Head office', (b) => (b.isHeadOffice ? 'Yes' : 'No')], ['Chassis', (b) => b.usage], ['Status', (b) => (b.active === false ? 'Inactive' : 'Active')]]} /></>}
          columns={[
            { accessorKey: 'code', header: 'Code', cell: (c) => <span className="font-mono font-medium">{c.getValue<string>()}</span> },
            { accessorKey: 'name', header: 'Name', meta: { nowrap: true }, cell: (c) => <span>{plain(c.getValue<string>())}{c.row.original.isHeadOffice && <span className="ml-1.5"><Badge tone="brand" dot={false}>Head office</Badge></span>}</span> },
            { accessorKey: 'region', header: 'Region', meta: { nowrap: true }, cell: (c) => <span>{c.getValue<string>()}{c.row.original.regionGroup !== c.getValue<string>() && <span className="text-muted"> · {c.row.original.regionGroup}</span>}</span> },
            { accessorKey: 'manager', header: 'Manager / contact', cell: (c) => <div title={c.row.original.address}><p className={c.getValue<string>() === 'To be assigned' ? 'text-warning' : undefined}>{c.getValue<string>()}</p><p className="text-[11px] text-muted">{c.row.original.phone ?? ''}</p><p className="max-w-[14rem] truncate text-[11px] text-muted">{c.row.original.address ?? ''}</p></div> },
            { accessorKey: 'entityCode', header: 'Entity', cell: (c) => <span className="font-mono text-xs" title={d?.lists.find((l) => l.list === 'Entity' && l.code === c.getValue<string>())?.name}>{c.getValue<string>() ?? '—'}</span> },
            { accessorKey: 'gatePassPrefix', header: 'Gate-pass prefix', cell: (c) => (c.row.original.issuesGatePasses === false ? <span className="text-muted">No gate passes</span> : <span className="font-mono">{c.getValue<string>()}</span>) },
            { id: 'wh', header: 'Warehouses', cell: (c) => (c.row.original.warehouses.length ? <span className="font-mono text-xs">{c.row.original.warehouses.join(', ')}</span> : c.row.original.servedByWarehouse ? <span className="text-xs text-muted" title="No own stockroom — served by this one (proposed, to confirm)">served by <span className="font-mono">{c.row.original.servedByWarehouse}</span></span> : <span className="text-muted">—</span>) },
            { accessorKey: 'partsMultiplier', header: 'Parts multiplier', meta: { align: 'right' }, cell: (c) => <span title="Parts price multiplier applied to the standard part price at this branch">{`${Number(c.getValue() ?? 1).toFixed(2)}×`}</span> },
            { accessorKey: 'usage', header: 'Chassis', meta: { align: 'right' } },
            { accessorKey: 'active', header: 'Status', cell: (c) => <ActiveBadge active={c.row.original.active} reason={c.row.original.inactiveReason} /> }, openCol()]} />); })()}
      </Stack>}
      {tab === 'warehouses' && <DataTable data={d?.warehouses.filter((w) => statusOk(st, w.active))} loading={data.isLoading} exportName="warehouses" onRowClick={open('warehouse')} toolbar={statusSel}
        emptyTitle="No warehouses" emptyHint="Add the stockrooms used by Inventory and as users' default stockroom." columns={[
          { accessorKey: 'code', header: 'Code', cell: (c) => <span className="font-mono font-medium">{c.getValue<string>()}</span> }, { accessorKey: 'name', header: 'Name' },
          { accessorKey: 'branchCode', header: 'Branch', cell: (c) => branchName(c.getValue<string>()) }, { accessorKey: 'custodian', header: 'Custodian' },
          { accessorKey: 'active', header: 'Status', cell: (c) => <ActiveBadge active={c.row.original.active} reason={c.row.original.inactiveReason} /> }, openCol()]} />}
      {tab === 'eq' && <Stack>
        <Banner tone="warning" title="Placeholder names — to be replaced with the real equipment types">Contract rates are set for 8 equipment types, but their names have not been supplied yet. Other lists → Chassis type holds 7 chassis types; please confirm whether these plus one more make the 8. Contracts show whatever rows exist here.</Banner>
        <DataTable data={d?.equipmentTypes.filter((e) => statusOk(st, e.active))} loading={data.isLoading} exportName="equipment-types" onRowClick={open('equipmentType')} toolbar={statusSel} columns={[
          { accessorKey: 'code', header: 'Code', cell: (c) => <span className="font-mono font-medium">{c.getValue<string>()}</span> },
          { accessorKey: 'name', header: 'Name', cell: (c) => <span>{c.getValue<string>()}{c.row.original.placeholder && <span className="ml-1.5 text-[11px] font-medium text-warning">placeholder</span>}</span> },
          // Columns with no data in any row are hidden until data exists.
          ...((d?.equipmentTypes ?? []).some((e) => e.lengthFt != null) ? [{ accessorKey: 'lengthFt', header: 'Length (ft)', cell: (c) => c.getValue<number>() ?? dash } as ColumnDef<MD['equipmentTypes'][number]>] : []),
          { id: 'ax', header: 'Axle', cell: (c) => c.row.original.axles?.length ? c.row.original.axles.join(', ') : dash }, { id: 'hub', header: 'Hub', cell: (c) => c.row.original.hubTypes?.length ? c.row.original.hubTypes.join(', ') : dash },
          ...((d?.equipmentTypes ?? []).some((e) => e.tags?.length) ? [{ id: 'tags', header: 'Tags', cell: (c) => (c.row.original.tags?.length ? <div className="flex flex-wrap gap-1">{c.row.original.tags.map((t) => <Badge key={t} dot={false}>{t}</Badge>)}</div> : dash) } as ColumnDef<MD['equipmentTypes'][number]>] : []),
          { id: 'rate', header: 'LTL daily rate', meta: { align: 'right' }, cell: (c) => { const r = curRate(c.row.original.code, 'LTL'); return r ? formatPhp(r.dailyRate) : dash; } },
          { accessorKey: 'usage', header: 'Chassis', meta: { align: 'right' } }, { accessorKey: 'contracts', header: 'Contracts', meta: { align: 'right' } },
          { accessorKey: 'active', header: 'Status', cell: (c) => <ActiveBadge active={c.row.original.active} reason={c.row.original.inactiveReason} /> }, openCol()]} />
      </Stack>}
      {tab === 'rates' && <Stack>
        <p className="text-xs text-muted">Daily rate and indemnity / loss value per equipment type and contract type. Class is fixed by the contract type. A new rate closes the current row the day before its valid-from date; history is kept. Custom contract types are still to be decided.</p>
        <DataTable data={d?.rateCards.filter((r) => (!flt || r.equipmentType === flt) && (st === 'all' || (st === 'active' ? !r.validTo : !!r.validTo))).sort((a, b) => a.equipmentType.localeCompare(b.equipmentType) || a.contractType.localeCompare(b.contractType) || b.validFrom.localeCompare(a.validFrom))}
          loading={data.isLoading} exportName="rate-cards" onRowClick={(r) => can('admin.masterdata', 'edit') && setRate({ equipmentType: r.equipmentType, contractType: r.contractType })}
          toolbar={<><Select aria-label="Equipment type" value={flt} onChange={(e) => setFlt(e.target.value)} placeholder="All equipment types" options={(d?.equipmentTypes ?? []).map((e) => ({ value: e.code, label: `${e.code} — ${e.name}` }))} wrapperClassName="w-56" />
            <Select aria-label="Validity" value={st} onChange={(e) => setSt(e.target.value)} options={[{ value: 'all', label: 'Current + history' }, { value: 'active', label: 'Current only' }, { value: 'inactive', label: 'History only' }]} wrapperClassName="w-44" />
</>}
          columns={[
            { accessorKey: 'equipmentType', header: 'Equipment type', cell: (c) => `${c.getValue<string>()} — ${eqName(c.getValue<string>())}` }, { accessorKey: 'contractType', header: 'Contract type', cell: (c) => `${c.getValue<string>()} · ${CONTRACT_TYPES[c.getValue<ContractType>()]?.name}` },
            { accessorKey: 'contractClass', header: 'Class' }, { accessorKey: 'dailyRate', header: 'Daily rate', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) },
            { accessorKey: 'indemnity', header: 'Indemnity / loss', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) },
            { accessorKey: 'validFrom', header: 'Valid from', cell: (c) => formatDate(c.getValue<string>()) }, { accessorKey: 'validTo', header: 'Valid to', cell: (c) => (c.getValue() ? formatDate(c.getValue<string>()) : <Badge tone="success">current</Badge>) },
            { accessorKey: 'createdBy', header: 'By' }, { accessorKey: 'reason', header: 'Reason', cell: (c) => <span className="line-clamp-1 max-w-[12rem]">{c.getValue<string>() ?? ''}</span> }]} />
      </Stack>}
      {tab === 'parts' && <Stack>
        <p className="text-xs text-muted">Rescue price is the standard cost plus the rescue uplift, rounded to the peso. Click a part to edit it or add an effective-dated price.</p>
        {(() => { const rows = d?.parts.filter((p) => statusOk(st, p.active) && (!flt || p.category === flt)); const rp = (p: NonNullable<typeof rows>[number], k: 'Luzon' | 'Visayas' | 'Mindanao') => p.regionalPrices?.[k]; return (
        <DataTable data={rows} loading={data.isLoading} onRowClick={open('part')}
          toolbar={<><Select aria-label="Category" value={flt} onChange={(e) => setFlt(e.target.value)} placeholder="All categories" options={[...new Set((d?.parts ?? []).map((p) => p.category))].map((c) => ({ value: c, label: c }))} wrapperClassName="w-44" />{statusSel}
            <ExportCsv name="parts" rows={rows} cols={[['Part code', (p) => p.partCode], ['Description', (p) => p.description], ['Category', (p) => p.category], ['UoM', (p) => p.uom], ['Weight (kg)', (p) => p.weightKg], ['Std cost', (p) => p.standardCost], ['Rescue price', (p) => p.rescuePrice],
              ['Luzon', (p) => rp(p, 'Luzon')], ['Visayas', (p) => rp(p, 'Visayas')], ['Mindanao', (p) => rp(p, 'Mindanao')], ['Preferred supplier ID', (p) => p.preferredVendorId], ['Preferred supplier', (p) => plain(vendorName(p.preferredVendorId))], ['Movement', (p) => p.movementClass],
              ['Low-stock at', (p) => p.lowStockThreshold], ['Reorder qty', (p) => p.reorderQty], ['Scrap', (p) => (p.scrapFlag ? 'Yes' : 'No')], ['Status', (p) => (p.active === false ? 'Inactive' : 'Active')]]} /></>}
          columns={[
            { accessorKey: 'partCode', header: 'Part', cell: (c) => <div><p className="font-mono font-medium">{c.getValue<string>()}</p><p className="whitespace-nowrap text-[12px] text-ink-2">{c.row.original.description}</p></div> },
            { accessorKey: 'category', header: 'Category', meta: { nowrap: true } },
            { accessorKey: 'weightKg', header: 'UoM · kg', meta: { align: 'right' }, cell: (c) => <span title="Unit of measure · weight per unit (kg)"><span className="text-muted">{c.row.original.uom} · </span>{c.getValue<number>()}</span> },
            { accessorKey: 'standardCost', header: 'Std cost', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) },
            { accessorKey: 'rescuePrice', header: 'Rescue price', meta: { align: 'right' }, cell: (c) => <span title="Standard cost plus the rescue uplift, rounded half-up to the peso">{formatPhp(c.getValue<number>())}</span> },
            { id: 'reg', header: 'Visayas / Mindanao', meta: { align: 'right', nowrap: true }, cell: (c) => <div className="text-[13px]"><p title="Visayas price"><span className="text-[11px] text-muted">Visayas </span>{rp(c.row.original, 'Visayas') != null ? formatPhp(rp(c.row.original, 'Visayas')) : dash}</p><p title="Mindanao price"><span className="text-[11px] text-muted">Mindanao </span>{rp(c.row.original, 'Mindanao') != null ? formatPhp(rp(c.row.original, 'Mindanao')) : dash}</p></div> },
            { accessorKey: 'preferredVendorId', header: 'Preferred supplier', meta: { nowrap: true }, cell: (c) => { const id = c.getValue<string>(); return id ? <span className="block max-w-[11rem] truncate" title={`${plain(vendorName(id)) || id} · ${id}`}>{plain(vendorName(id)) || id}</span> : dash; } },
            { accessorKey: 'movementClass', header: 'Movement', meta: { nowrap: true }, cell: (c) => <span>{c.getValue<string>()}{c.row.original.scrapFlag && <span className="ml-1.5"><Badge tone="danger">scrap</Badge></span>}</span> },
            { accessorKey: 'lowStockThreshold', header: 'Low-stock / reorder', meta: { align: 'right' }, cell: (c) => <span title="Low-stock level / reorder quantity">{c.getValue<number>()}<span className="text-muted"> / {c.row.original.reorderQty ?? '—'}</span></span> },
            { accessorKey: 'active', header: 'Status', cell: (c) => <ActiveBadge active={c.row.original.active} reason={c.row.original.inactiveReason} /> }, openCol()]} />); })()}
      </Stack>}
      {tab === 'vendors' && <Stack>
        <p className="text-xs text-muted">Vendor statuses: Active, Pending, Blocked, Inactive. Rescue partners are vendors in the “Rescue partner” category. Payable due dates count from the invoice date. (All three to be confirmed.)</p>
        {(() => { const rows = d?.vendors.filter((v) => (st === 'all' || (st === 'active' ? v.status === 'Active' : v.status !== 'Active')) && (!flt || v.category === flt)); return (
        <DataTable data={rows} loading={data.isLoading} onRowClick={open('vendor')}
          toolbar={<><Select aria-label="Category" value={flt} onChange={(e) => setFlt(e.target.value)} placeholder="All categories" options={[...new Set((d?.vendors ?? []).map((v) => v.category).filter(Boolean) as string[])].map((c) => ({ value: c, label: c }))} wrapperClassName="w-44" />{statusSel}
            <ExportCsv name="vendors" rows={rows} cols={[['Vendor ID', (v) => v.vendorId], ['Name', (v) => v.name], ['Category', (v) => v.category], ['Contact person', (v) => v.contactPerson], ['Phone', (v) => v.phone], ['Email', (v) => v.email], ['TIN', (v) => v.tin], ['VAT', (v) => v.vatStatus],
              ['Terms', (v) => v.paymentTerms], ['Pay by', (v) => v.paymentMethod], ['Entities', (v) => (v.entityCodes ?? []).join(', ')], ['Parts supplied', (v) => v.parts.join(', ')], ['Portal access', (v) => (v.portalAccess ? 'Yes' : 'No')], ['Status', (v) => v.status]]} /></>}
          columns={[
            { accessorKey: 'name', header: 'Vendor', meta: { nowrap: true }, cell: (c) => <div><p className="font-medium">{plain(c.getValue<string>())}</p><p className="font-mono text-[11px] text-muted">{c.row.original.vendorId}</p></div> },
            { accessorKey: 'category', header: 'Category', meta: { nowrap: true } },
            { id: 'ct', header: 'Contact', cell: (c) => <div className="text-xs" title={[c.row.original.phone, c.row.original.email].filter(Boolean).join(' · ')}><p>{c.row.original.contactPerson ?? '—'}</p><p className="text-muted">{c.row.original.phone || c.row.original.email || ''}</p></div> },
            { accessorKey: 'tin', header: 'TIN / VAT', meta: { nowrap: true }, cell: (c) => <div>{c.getValue<string>() ? <p className="font-mono">{c.getValue<string>()}</p> : dash}<p className="text-[11px] text-muted">{c.row.original.vatStatus || '—'}</p></div> },
            { accessorKey: 'paymentTerms', header: 'Terms / pay by', meta: { nowrap: true }, cell: (c) => <div><p>{c.getValue<string>() || '—'}</p><p className="text-[11px] text-muted">{c.row.original.paymentMethod || '—'}</p></div> },
            { id: 'ent', header: 'Entities', meta: { nowrap: true }, cell: (c) => (c.row.original.entityCodes?.length ? c.row.original.entityCodes.join(', ') : dash) },
            { id: 'pp', header: 'Parts supplied', meta: { nowrap: true }, cell: (c) => { const p = c.row.original.parts; return p.length ? <div className="flex flex-nowrap gap-1" title={p.join(', ')}><Badge dot={false} className="font-mono">{p[0]}</Badge>{p.length > 1 && <Badge dot={false}>+{p.length - 1}</Badge>}</div> : dash; } },
            { accessorKey: 'status', header: 'Status', cell: (c) => <div className="flex flex-col items-start gap-0.5" title={c.row.original.statusReason}><StatusBadge domain="generic" value={c.getValue<string>()} />{c.row.original.portalAccess && <span className="text-[11px] text-info">Portal user</span>}</div> }, openCol()]} />); })()}
      </Stack>}
      {tab === 'lists' && <Stack>
        <p className="text-xs text-muted">Other reference lists: chassis types, axle and hub lists, classification tags (standard and custom), contract types and classes, entities, departments, repair categories, non-chassis asset and expense categories.</p>
        <DataTable data={d?.lists.filter((l) => l.list === listName && statusOk(st, l.active))} loading={data.isLoading} exportName="reference-list" onRowClick={(r) => r.list !== 'Contract type' && setEd({ kind: 'list', rec: r as unknown as Rec, isNew: false })}
          toolbar={<><Select aria-label="List" value={listName} onChange={(e) => setListName(e.target.value)} options={lists.map((l) => ({ value: l, label: l }))} wrapperClassName="w-64" />{statusSel}</>}
          columns={[{ accessorKey: 'code', header: 'Code', cell: (c) => <span className="font-mono font-medium">{c.getValue<string>()}</span> }, { accessorKey: 'name', header: 'Name' },
            { accessorKey: 'standard', header: 'Type', cell: (c) => (c.getValue() ? 'Standard' : <Badge tone="info" dot={false}>custom</Badge>) },
            { accessorKey: 'active', header: 'Status', cell: (c) => <ActiveBadge active={c.row.original.active} reason={c.row.original.inactiveReason} /> }, ...(listName !== 'Contract type' ? [openCol()] : [])]} />
      </Stack>}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><ShieldCheck className="size-3.5 shrink-0" /><span>Admin-only (Master data permission). Every change is in the <Link to="/admin/audit" className="text-brand-600 hover:underline">audit log</Link>.</span></p>
      {ed && d && <MasterEditor {...ed} vendorOpts={vendorOpts} regionOpts={regionOpts} data={d} onClose={() => setEd(null)} onPrice={(p) => { setEd(null); setPrice(p); }} />}
      {rate && d && <RateDialog init={rate} data={d} onClose={() => setRate(null)} />}
      {price && d && <PriceDialog partCode={price} data={d} vendorOpts={vendorOpts} onClose={() => setPrice(null)} />}
    </>
  );
}

const BRANCH_ISLAND: Record<string, string> = { NCR: 'Luzon', 'North Luzon': 'Luzon', 'South Luzon': 'Luzon', Visayas: 'Visayas', Mindanao: 'Mindanao' };
function specs(kind: MasterKind, o: { vendorOpts: FieldSpec['options']; regionOpts: FieldSpec['options']; data: MD }): FieldSpec[] {
  const lst = (n: string) => o.data.lists.filter((l) => l.list === n && l.active).map((l) => l.name).join(', ');
  switch (kind) {
    case 'branch': return [{ k: 'code', label: 'Code', key: true, required: true, placeholder: 'e.g. MNL' }, { k: 'name', label: 'Name', required: true, placeholder: 'e.g. Manila Yard' }, { k: 'region', label: 'Region', type: 'select', options: o.regionOpts, required: true },
      { k: 'regionGroup', label: 'Island group', type: 'select', options: ['Luzon', 'Visayas', 'Mindanao'].map((v) => ({ value: v, label: v })), required: true }, { k: 'address', label: 'Address', placeholder: 'Street, city, province' }, { k: 'manager', label: 'Manager / contact', placeholder: 'e.g. Juan Dela Cruz' }, { k: 'phone', label: 'Phone', placeholder: 'e.g. 0917 123 4567' },
      { k: 'gatePassPrefix', label: 'Gate-pass prefix', required: true, hint: 'Final format still to be confirmed', placeholder: 'e.g. GP-MNL-' }, { k: 'partsMultiplier', label: 'Parts markup multiplier (×)', type: 'number', hint: 'Applied to the standard part price at this branch', placeholder: 'e.g. 1.15' },
      // Staff review 1.2: owning entity and the stockroom serving a branch without its own (both proposed defaults, to confirm).
      { k: 'entityCode', label: 'Owning entity', type: 'select', options: o.data.lists.filter((l) => l.list === 'Entity' && l.active).map((l) => ({ value: l.code, label: `${l.code} — ${l.name}` })), hint: 'Entity that owns the stock and documents of this branch (to confirm)' },
      { k: 'servedByWarehouse', label: 'Served by stockroom', type: 'select', options: o.data.warehouses.filter((w) => w.active).map((w) => ({ value: w.code, label: `${w.code} — ${w.name}` })), hint: 'For a branch without its own stockroom (Master data → Warehouses)' },
      { k: 'issuesGatePasses', label: 'Issues gate passes', type: 'bool' }, { k: 'isHeadOffice', label: 'Head office', type: 'bool' }];
    case 'warehouse': return [{ k: 'code', label: 'Code', key: true, required: true, hint: 'e.g. WH-MNL', placeholder: 'e.g. WH-MNL' }, { k: 'name', label: 'Name', required: true, placeholder: 'e.g. Manila Yard stockroom' }, { k: 'branchCode', label: 'Branch', type: 'select', options: o.data.branches.map((b) => ({ value: b.code, label: `${b.code} — ${b.name}` })), required: true }, { k: 'custodian', label: 'Custodian (user ID)', placeholder: 'e.g. BG.MNL' }];
    case 'equipmentType': return [{ k: 'code', label: 'Code', key: true, required: true, placeholder: 'e.g. EQ9' }, { k: 'name', label: 'Name', required: true, placeholder: 'e.g. 40ft chassis' }, { k: 'sort', label: 'Sort order', type: 'number', placeholder: 'e.g. 9' }, { k: 'lengthFt', label: 'Length (ft)', type: 'number', placeholder: 'e.g. 40' },
      { k: 'axles', label: 'Axle configuration(s)', type: 'csv', hint: `From list: ${lst('Axle configuration')}`, placeholder: 'Comma-separated values from the list' }, { k: 'hubTypes', label: 'Hub type(s)', type: 'csv', hint: `From list: ${lst('Hub type')}`, placeholder: 'Comma-separated values from the list' },
      { k: 'tags', label: 'Classification tags', type: 'csv', hint: `From list: ${lst('Classification tag')}`, placeholder: 'Comma-separated values from the list' }, { k: 'placeholder', label: 'Placeholder name', type: 'bool' }];
    case 'part': return [{ k: 'partCode', label: 'Part code', key: true, required: true, placeholder: 'e.g. BRK-PAD' }, { k: 'description', label: 'Description', required: true, placeholder: 'e.g. Brake pad set, rear axle' },
      { k: 'category', label: 'Category', type: 'select', options: o.data.lists.filter((l) => l.list === 'Repair category').map((l) => ({ value: l.name, label: l.name })), required: true },
      { k: 'uom', label: 'Unit of measure', type: 'select', options: ['pc', 'set', 'pair', 'gal', 'L', 'kg', 'm'].map((v) => ({ value: v, label: v })), required: true }, { k: 'weightKg', label: 'Weight (kg)', type: 'number', required: true, placeholder: 'e.g. 2.5' },
      { k: 'standardCost', label: 'Standard cost', type: 'money', required: true, hint: 'Changes after creation go through “Add price” (effective-dated)' },
      { k: 'regionalPrices.Luzon', label: 'Price — Luzon', type: 'money' }, { k: 'regionalPrices.Visayas', label: 'Price — Visayas', type: 'money' }, { k: 'regionalPrices.Mindanao', label: 'Price — Mindanao', type: 'money' },
      { k: 'preferredVendorId', label: 'Preferred supplier', type: 'select', options: o.vendorOpts }, { k: 'movementClass', label: 'Movement class', type: 'select', options: ['Fast', 'Slow', 'Non-moving'].map((v) => ({ value: v, label: v })) },
      { k: 'lowStockThreshold', label: 'Low-stock level', type: 'number', required: true, placeholder: 'e.g. 5' }, { k: 'reorderQty', label: 'Reorder quantity', type: 'number', hint: 'Confirm whether wanted', placeholder: 'e.g. 20' }, { k: 'scrapFlag', label: 'Scrap (damaged) part', type: 'bool' }];
    case 'vendor': return [{ k: 'vendorId', label: 'Vendor ID', key: true, required: true, placeholder: 'e.g. V-005' }, { k: 'name', label: 'Name', required: true, placeholder: 'e.g. ABC Logistics Inc.' }, { k: 'tin', label: 'TIN', required: true, placeholder: 'e.g. 123-456-789-000' }, { k: 'vatStatus', label: 'VAT status', type: 'select', options: ['VAT-registered', 'Non-VAT'].map((v) => ({ value: v, label: v })), required: true },
      { k: 'contactPerson', label: 'Contact person', required: true, placeholder: 'e.g. Juan Dela Cruz' }, { k: 'phone', label: 'Phone', required: true, placeholder: 'e.g. 0917 123 4567' }, { k: 'email', label: 'Email', required: true, placeholder: 'e.g. name@company.ph' }, { k: 'address', label: 'Address', required: true, placeholder: 'Street, city, province' },
      { k: 'category', label: 'Category', type: 'select', options: o.data.lists.filter((l) => l.list === 'Vendor category').map((l) => ({ value: l.name, label: l.name })) }, { k: 'paymentTerms', label: 'Payment terms', required: true, hint: 'Drives the payable due date (reminder 2 weeks before)', placeholder: 'e.g. 30 days' },
      { k: 'paymentMethod', label: 'Payment method', type: 'select', options: ['Check', 'Bank transfer', 'Cash'].map((v) => ({ value: v, label: v })) }, { k: 'bankName', label: 'Bank', placeholder: 'e.g. BDO Unibank' }, { k: 'bankAccount', label: 'Bank account no.', placeholder: 'e.g. 0012 3456 7890' },
      { k: 'entityCodes', label: 'Entities served', type: 'csv', hint: 'Comma-separated, e.g. DBL, NAK, KNX', placeholder: 'e.g. DBL, NAK' }, { k: 'status', label: 'Status', type: 'select', options: ['Active', 'Pending', 'Blocked', 'Inactive'].map((v) => ({ value: v, label: v })) },
      { k: 'portalAccess', label: 'Vendor portal access', type: 'bool' }, { k: 'portalUserId', label: 'Portal user ID', placeholder: 'e.g. V-005.PORTAL' }];
    case 'list': return [{ k: 'code', label: 'Code', key: true, required: true, placeholder: 'e.g. FLAT' }, { k: 'name', label: 'Name', required: true, placeholder: 'e.g. Flat tire' }, { k: 'standard', label: 'Standard (vs custom)', type: 'bool' }];
  }
}

function MasterEditor({ kind, rec, isNew, vendorOpts, regionOpts, data, onClose, onPrice }: { kind: MasterKind; rec: Rec; isNew: boolean; vendorOpts: FieldSpec['options']; regionOpts: FieldSpec['options']; data: MD; onClose: () => void; onPrice: (partCode: string) => void }) {
  const { can } = useAuth();
  const [r, setR] = useState<Rec>(rec);
  // Review 1.1: the gate-pass prefix is required only when the branch issues gate passes.
  const { ref } = useRefLookups();
  // Staff review 1.2: the manager is picked from the user list ("Name (USER ID)", as on the Branches tab) or left "To be assigned".
  const mgrOpts = [{ value: 'To be assigned', label: 'To be assigned' }, ...(ref?.users ?? []).filter((u) => !u.roles.some((x) => x === 'CLIENT' || x === 'VENDOR')).map((u) => ({ value: `${u.name} (${u.userId})`, label: `${u.name} (${u.userId}) — ${ROLE_TEMPLATES[u.roles[0]]?.label ?? ''}` }))];
  if (typeof rec.manager === 'string' && rec.manager && !mgrOpts.some((m) => m.value === rec.manager)) mgrOpts.push({ value: rec.manager, label: rec.manager });
  const fields = specs(kind, { vendorOpts, regionOpts, data }).map((x): FieldSpec => (kind === 'branch' && x.k === 'gatePassPrefix' ? { ...x, required: r.issuesGatePasses !== false, locked: r.issuesGatePasses === false, hint: r.issuesGatePasses === false ? 'Not used — this branch does not issue gate passes (tick “Issues gate passes” to set one)' : x.hint }
    : kind === 'branch' && x.k === 'manager' ? { ...x, type: 'select', options: mgrOpts, hint: 'From Users & roles' } : x));
  const keyF = fields.find((x) => x.key)!;
  // Staff review 1.2: last change (who / when) and a link to the record's audit history.
  const hist = useData(['admin', 'audit', 'master', kind, String(rec[keyF.k] ?? '')], () => api.admin.audit({ entityType: kind }), !isNew && can('admin.audit'));
  const lastChange = (hist.data ?? []).find((a) => a.entityId === String(rec[keyF.k]));
  const [reason, setReason] = useState('');
  const [deact, setDeact] = useState(false);
  const isActive = kind === 'vendor' ? rec.status === 'Active' : rec.active !== false;
  const ruleErrs = kind !== 'branch' ? [] : [
    r.isHeadOffice && data.branches.some((b) => b.isHeadOffice && b.code.toLowerCase() !== String(r.code ?? '').toLowerCase()) && `Only one head office is allowed — ${data.branches.find((b) => b.isHeadOffice)?.code} is already the head office.`,
    r.region && r.regionGroup && BRANCH_ISLAND[String(r.region)] && BRANCH_ISLAND[String(r.region)] !== r.regionGroup && `Region ${String(r.region)} belongs to island group ${BRANCH_ISLAND[String(r.region)]}.`,
  ].filter(Boolean) as string[];
  const missing = fields.filter((x) => x.required && (get(r, x.k) === undefined || get(r, x.k) === '')).map((x) => x.label);
  const clean = () => { const { usage: _u, contracts: _c, warehouses: _w, onHand: _o, parts: _p, poCount: _pc, ...rest } = r; return rest; };
  const save = useAction(() => api.admin.saveMaster(kind, clean(), isNew, reason), { success: isNew ? 'Record added — audited' : 'Record saved — audited', onSuccess: onClose });
  const toggle = useAction((why: string) => api.admin.setMasterActive(kind, String(rec[keyF.k]), !isActive, why, kind === 'list' ? String(rec.list) : undefined), { success: isActive ? 'Deactivated — the record stays viewable and in history' : 'Reactivated', onSuccess: onClose });
  const title = { branch: 'Branch', warehouse: 'Warehouse', equipmentType: 'Equipment type', part: 'Part', vendor: 'Vendor', list: String(rec.list ?? 'List item') }[kind];
  const inUse = Number(rec.usage ?? 0) + Number(rec.contracts ?? 0) + Number(rec.onHand ?? 0) + Number(rec.poCount ?? 0);
  const canSave = can('admin.masterdata', isNew ? 'add' : 'edit');
  return (
    <Drawer open onClose={onClose} title={isNew ? `Add ${title.toLowerCase()}` : `${title} ${String(rec[keyF.k])}`} width="max-w-2xl"
      footer={<>{!isNew && can('admin.masterdata', isActive ? 'delete' : 'edit') && <Button variant={isActive ? 'danger' : 'secondary'} className="mr-auto" onClick={() => setDeact(true)}>{isActive ? 'Deactivate' : 'Reactivate'}</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>{canSave && <Button loading={save.isPending} disabled={missing.length > 0 || ruleErrs.length > 0 || (!isNew && !reason.trim())} onClick={() => save.mutate(undefined)}>{isNew ? 'Add' : 'Save changes'}</Button>}</>}>
      <Stack>
        {!isNew && !isActive && <Banner tone="warning" title={`Inactive record${rec.inactiveAt ? ` since ${formatDate(String(rec.inactiveAt))}` : ''}`}>{String(rec.inactiveReason ?? rec.statusReason ?? 'No reason recorded')} — kept for history; not offered in new transactions.</Banner>}
        {!isNew && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2"><span>Status: <ActiveBadge active={kind === 'vendor' ? rec.status === 'Active' : rec.active !== false} reason={String(rec.inactiveReason ?? '')} /></span>
          <span className="text-xs text-muted">{lastChange ? <>Last changed {formatDateTime(lastChange.at)} by {lastChange.actor}</> : 'No changes since go-live'} · <Link to="/admin/audit" className="text-brand-600 hover:underline">Audit history →</Link></span>
          {isActive && <span className="text-xs text-muted">Deactivate asks for a reason; the date and reason are kept on the record.</span>}</div>}
        <FormGrid>
          {fields.map((x) => {
            const v = get(r, x.k);
            const err = missing.includes(x.label) && v !== undefined ? 'Required' : undefined;
            const dis = (x.key && !isNew) || !canSave || !!x.locked;
            if (x.type === 'bool') return <label key={x.k} className="flex items-center gap-2 self-end pb-2 text-sm text-ink-2"><input type="checkbox" className="size-4 accent-brand-600" disabled={!canSave} checked={!!v} onChange={(e) => setR(set(r, x.k, e.target.checked))} />{x.label}</label>;
            if (x.type === 'select') return <Select key={x.k} label={x.label} required={x.required} value={String(v ?? '')} placeholder="— Select —" options={x.options ?? []} disabled={dis} hint={x.hint} error={err} onChange={(e) => setR(set(r, x.k, e.target.value || undefined))} />;
            if (x.type === 'money') return <MoneyInput key={x.k} label={x.label} required={x.required} value={v === undefined ? '' : String(v)} disabled={dis || (x.k === 'standardCost' && !isNew)} hint={x.hint} error={err} min={0} onChange={(e) => setR(set(r, x.k, e.target.value === '' ? undefined : Number(e.target.value)))} />;
            if (x.type === 'number') return <Input key={x.k} label={x.label} type="number" min={0} step="any" required={x.required} value={v === undefined ? '' : String(v)} placeholder={x.placeholder} disabled={dis} hint={x.hint} error={err} onChange={(e) => setR(set(r, x.k, e.target.value === '' ? undefined : Number(e.target.value)))} />;
            if (x.type === 'csv') return <Input key={x.k} label={x.label} value={((v as string[] | undefined) ?? []).join(', ')} placeholder={x.placeholder} disabled={dis} hint={x.hint} onChange={(e) => setR(set(r, x.k, e.target.value.split(',').map((s) => s.trim()).filter(Boolean)))} />;
            return <Input key={x.k} label={x.label} required={x.required} value={String(v ?? '')} placeholder={x.placeholder} disabled={dis} hint={x.hint ??(x.key && !isNew ? 'Code is immutable' : undefined)} error={err} onChange={(e) => setR(set(r, x.k, e.target.value))} />;
          })}
        </FormGrid>
        {kind === 'part' && !isNew && <Card className="bg-surface-alt/40">
          <CardHeader title="Price history" description="Per part and supplier; never overwritten." actions={canSave && <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => onPrice(String(rec.partCode))}>Add price</Button>} />
          <table className="w-full text-[13px]"><thead className="text-[11px] uppercase text-muted"><tr><th className="py-1 text-left">Valid from</th><th className="text-left">Valid to</th><th className="text-left">Supplier</th><th className="text-right">Unit cost</th><th className="pl-3 text-left">Source</th></tr></thead>
            <tbody>{((rec.priceHistory as { validFrom: string; validTo?: string; vendorId?: string; unitCost: number; source: string }[] | undefined) ?? []).map((h, i) => <tr key={i} className="border-t border-line"><td className="py-1">{formatDate(h.validFrom)}</td><td>{h.validTo ? formatDate(h.validTo) : 'current'}</td><td>{h.vendorId ?? '—'}</td><td className="text-right tabular">{formatPhp(h.unitCost)}</td><td className="pl-3">{h.source}</td></tr>)}</tbody></table>
        </Card>}
        {!isNew && <Textarea label="Reason for change" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`Why this record is changing — e.g. ${{ branch: 'branch manager changed', warehouse: 'custodian changed', equipmentType: 'official equipment name received', part: 'new supplier price list', vendor: 'supplier changed TIN', list: 'name corrected' }[kind]}`} hint="Recorded with the before/after values in the audit log" disabled={!canSave} />}
        {ruleErrs.map((e) => <p key={e} className="text-xs text-danger">{e}</p>)}
        {missing.length > 0 && <p className="text-xs text-danger">Required: {missing.join(', ')}</p>}
      </Stack>
      <ConfirmDialog open={deact} onClose={() => setDeact(false)} requireReason tone={isActive ? 'danger' : 'primary'} loading={toggle.isPending} confirmLabel={isActive ? 'Deactivate' : 'Reactivate'}
        title={isActive ? `Deactivate ${String(rec[keyF.k])}?` : `Reactivate ${String(rec[keyF.k])}?`} onConfirm={(why) => toggle.mutate(why)}
        message={isActive ? <>Records are never deleted. The record stays viewable and in reports, but is not offered in new transactions.{inUse > 0 && <> It is referenced by <strong>{inUse}</strong> existing record(s), which keep it.</>}</> : 'The record becomes available for new transactions again.'} />
    </Drawer>
  );
}

function RateDialog({ init, data, onClose }: { init: { equipmentType: string; contractType: ContractType }; data: MD; onClose: () => void }) {
  const tomorrow = new Date(Date.now() + 32 * 3_600_000).toISOString().slice(0, 10);
  const [f, setF] = useState({ ...init, dailyRate: '', indemnity: '', validFrom: tomorrow, reason: '' });
  const cur = data.rateCards.find((r) => r.equipmentType === f.equipmentType && r.contractType === f.contractType && !r.validTo);
  const save = useAction(() => api.admin.addRate({ equipmentType: f.equipmentType, contractType: f.contractType, dailyRate: Number(f.dailyRate), indemnity: Number(f.indemnity || cur?.indemnity || 0), validFrom: f.validFrom }, f.reason), { success: 'New rate added — previous row closed, history kept', onSuccess: onClose });
  const fromErr = cur && f.validFrom <= cur.validFrom ? `Must be after ${formatDate(cur.validFrom)}` : undefined;
  return (
    <Modal open onClose={onClose} title="New effective-dated rate" description="The current rate is closed the day before the new one starts; nothing is overwritten." size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!(Number(f.dailyRate) > 0) || !f.reason.trim() || !!fromErr} onClick={() => save.mutate(undefined)}>Add rate</Button></>}>
      <FormGrid>
        <Select label="Equipment type" required value={f.equipmentType} onChange={(e) => setF({ ...f, equipmentType: e.target.value })} options={data.equipmentTypes.map((e) => ({ value: e.code, label: `${e.code} — ${e.name}` }))} />
        <Select label="Contract type (class fixed)" required value={f.contractType} onChange={(e) => setF({ ...f, contractType: e.target.value as ContractType })} options={(Object.keys(CONTRACT_TYPES) as ContractType[]).map((k) => ({ value: k, label: `${k} · ${CONTRACT_TYPES[k].name} · Class ${CONTRACT_TYPES[k].class}` }))} />
        <ReadField label="Current rate">{cur ? `${formatPhp(cur.dailyRate)} / day · indemnity ${formatPhp(cur.indemnity)} · since ${formatDate(cur.validFrom)}` : 'None'}</ReadField>
        <Input label="Valid from" type="date" required value={f.validFrom} min={tomorrow} onChange={(e) => setF({ ...f, validFrom: e.target.value })} error={fromErr} />
        <MoneyInput label="New daily rate" required value={f.dailyRate} onChange={(e) => setF({ ...f, dailyRate: e.target.value })} error={f.dailyRate !== '' && !(Number(f.dailyRate) > 0) ? 'Must be greater than zero' : undefined} />
        <MoneyInput label="Indemnity / loss value" value={f.indemnity} placeholder={cur ? String(cur.indemnity) : ''} onChange={(e) => setF({ ...f, indemnity: e.target.value })} hint="Blank = keep current" />
      </FormGrid>
      <Textarea className="mt-4" label="Reason" required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Why the rate is changing — e.g. annual rate review" hint="Recorded in the audit log" />
    </Modal>
  );
}

function PriceDialog({ partCode, data, vendorOpts, onClose }: { partCode: string; data: MD; vendorOpts: FieldSpec['options']; onClose: () => void }) {
  const p = data.parts.find((x) => x.partCode === partCode);
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  const [f, setF] = useState({ unitCost: '', validFrom: today, vendorId: p?.preferredVendorId ?? '', source: 'Supplier quotation', reason: '' });
  const save = useAction(() => api.admin.addPartPrice(partCode, { unitCost: Number(f.unitCost), validFrom: f.validFrom, vendorId: f.vendorId || undefined, source: f.source }, f.reason), { success: 'Price added to the trail', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Add price — ${partCode}`} description={`${p?.description ?? ''} · current standard cost ${formatPhp(p?.standardCost)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!(Number(f.unitCost) > 0) || !f.reason.trim()} onClick={() => save.mutate(undefined)}>Add price</Button></>}>
      <Stack>
        <FormGrid>
          <MoneyInput label="Unit cost" required value={f.unitCost} onChange={(e) => setF({ ...f, unitCost: e.target.value })} error={f.unitCost !== '' && !(Number(f.unitCost) > 0) ? 'Must be greater than zero' : undefined} />
          <Input label="Valid from" type="date" required value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} hint="Today or earlier updates the standard cost" />
          <Select label="Supplier" value={f.vendorId} placeholder="— Standard (no supplier) —" options={vendorOpts ?? []} onChange={(e) => setF({ ...f, vendorId: e.target.value })} />
          <Input label="Source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="e.g. PO-000155 or supplier quotation" hint="e.g. PO number or quotation" />
        </FormGrid>
        <Textarea label="Reason" required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Why the price is changing — e.g. new supplier quotation" />
      </Stack>
    </Modal>
  );
}
