import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';
import { loadAppConfig, loginSchema } from '../../lib/shared';
import { Banner, Button, ChangeLogLauncher, Input, Modal } from '../../lib/ui';
import logo from '../../assets/delbros-logo.png';
import { landingFor, useAuth } from '../../app/auth';

/** SCR-01 Login (US-ADM-004) + SUP-01 Forgot password entry. */
export function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [show, setShow] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [forgot, setForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotId, setForgotId] = useState('');
  const [sending, setSending] = useState(false);
  const openForgot = () => { setForgot(true); setForgotSent(false); setError(null); };
  const backToSignIn = () => { setForgot(false); setForgotSent(false); setForgotId(''); };
  const [demoOpen, setDemoOpen] = useState(false);
  const [portalUrl, setPortalUrl] = useState('');
  const [showDemoLogins, setShowDemo] = useState(false); // app-config.json showDemoLogins — off in production
  const [helpdesk, setHelpdesk] = useState(''); // app-config.json helpdeskContact (e.g. local / email) — set per deployment
  useEffect(() => { loadAppConfig().then((c) => { setPortalUrl(c.portalUrl ?? ''); setShowDemo(c.showDemoLogins === true); setHelpdesk(c.helpdeskContact ?? ''); }); }, []);
  const { register, handleSubmit, formState, setValue } = useForm<{ userId: string; password: string }>({ resolver: zodResolver(loginSchema) });

  if (user) return <Navigate to={landingFor(user)} replace state={{ mainNav: true }} />;

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      const u = await login(v.userId, v.password);
      // Admins always land on the Dashboard; other roles return to the page they were sent from (deep link), else their landing page.
      const admin = u!.roles.includes('SYS_ADMIN');
      nav(!admin && loc.state?.from && loc.state.from !== '/' ? loc.state.from : landingFor(u!), { replace: true, state: { mainNav: true } }); // landing screen: no Back button
    } catch (e) { setError(e as ApiError); }
  });
  const demo = api.auth.demoAccounts().filter((d) => d.realm === 'INTERNAL');

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <ChangeLogLauncher />{/* CHANGELOG-REMOVE (temporary) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 size-96 rotate-45 rounded-3xl bg-brand-800/60" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-80 rotate-45 rounded-3xl bg-brand-700/40" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="rounded-xl bg-white p-2"><img src={logo} alt="Delbros" className="h-14 w-auto" /></span>
          <div><p className="text-2xl font-bold">Delbros Leasing</p><p className="text-sm text-brand-200">Delbros Group</p></div>
        </div>
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold leading-tight">Chassis leasing, one system of record.</p>
          <p className="mt-3 text-brand-200">Onboarding, gate operations, rescue, repair, billing, collection and compliance — for Head Office and all 10 branches.</p>
        </div>
        <p className="relative text-[13px] text-brand-100">Internal — Confidential · Authorised users only. Activity is recorded in the audit trail.</p>
      </div>

      <div className="flex items-center justify-center bg-surface px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden"><img src={logo} alt="" className="h-9" /><span className="text-lg font-bold text-brand-800">Delbros Leasing</span></div>
          {forgot ? (
            // SUP-01 Forgot password — shown in place of the sign-in form (no popup).
            <>
              <h1 className="text-2xl font-bold text-ink">Reset your password</h1>
              <p className="mt-1 text-sm text-muted">Enter your user ID or email. If the account exists, we email a single-use link that is valid for 30 minutes.</p>
              {forgotSent ? (
                <>
                  <Banner className="mt-6" tone="success" title="Check your email">If the account exists, a reset link was sent to its registered email. The link expires in 30 minutes.</Banner>
                  <Button size="lg" className="mt-6 w-full" onClick={backToSignIn}>Back to sign in</Button>
                </>
              ) : (
                <form className="mt-6 space-y-4" noValidate onSubmit={async (e) => { e.preventDefault(); if (!forgotId.trim()) return; setSending(true); try { await api.auth.forgotPassword(forgotId); setForgotSent(true); } finally { setSending(false); } }}>
                  <Input label="User ID or email" required autoFocus placeholder="e.g. BG.MNL" value={forgotId} onChange={(e) => setForgotId(e.target.value)} />
                  <Button type="submit" size="lg" className="w-full" disabled={!forgotId.trim()} loading={sending}>Send reset link</Button>
                  <div className="text-center"><button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={backToSignIn}>← Back to sign in</button></div>
                </form>
              )}
            </>
          ) : (<>
          <h1 className="text-2xl font-bold text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Use your Delbros user ID and password.</p>

          {/* US-ADM-004 states: invalid credentials (generic — never reveals whether the user ID exists), account locked, pending portal account, session/other errors */}
          {error && (
            <Banner className="mt-5" tone={error.code === 'ACCOUNT_PENDING' ? 'warning' : 'danger'} title={error.code === 'ACCOUNT_LOCKED' ? 'Account locked' : error.code === 'ACCOUNT_PENDING' ? 'Account not active yet' : error.code === 'ACCOUNT_DEACTIVATED' ? 'Account deactivated' : 'Sign-in failed'}
              actions={error.code === 'ACCOUNT_LOCKED' ? <button type="button" className="text-sm font-medium text-brand-700 hover:underline" onClick={openForgot}>Reset password</button> : undefined}>
              {error.code === 'ACCOUNT_LOCKED' && <Lock className="mr-1 inline size-3.5" />}{error.message}
              {error.code === 'INVALID_CREDENTIALS' && <span className="mt-1 block text-xs">Check your user ID and password. After repeated failed attempts the account is locked for security.</span>}
              {error.code === 'ACCOUNT_LOCKED' && <span className="mt-1 block text-xs">IT can unlock the account in Users &amp; roles. The lock and each failed attempt are recorded in the audit log.</span>}
            </Banner>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <Input label="Username / User ID" autoComplete="username" autoFocus maxLength={20} required placeholder="e.g. BG.MNL" error={formState.errors.userId?.message} {...register('userId')} />
            <div className="relative">
              <Input label="Password" type={show ? 'text' : 'password'} autoComplete="current-password" required placeholder="Enter your password" error={formState.errors.password?.message} {...register('password')} />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-[30px] rounded p-1 text-muted hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <div className="flex justify-end"><button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={openForgot}>Forgot password?</button></div>
            <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>Sign in</Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">Can’t sign in? {helpdesk ? <>Contact the IT helpdesk: <span className="font-medium text-ink-2">{helpdesk}</span></> : 'Contact your IT administrator or branch head.'}</p>

          {portalUrl && (
            <p className="mt-6 text-center text-sm text-muted">
              Client or supplier? <a href={portalUrl} className="font-medium text-brand-600 hover:underline">Go to the Client &amp; Vendor Portal →</a>
            </p>
          )}

          {showDemoLogins && (
            <div className="mt-6 rounded-lg border border-dashed border-warning-line bg-warning-bg/60 p-3 text-[13px] text-ink-2">
              <p><span className="font-semibold text-warning">Demo environment.</span> Password for all demo users: <code className="rounded bg-surface px-1 font-mono">Demo@2026</code></p>
              <button className="mt-1 font-medium text-brand-600 hover:underline" onClick={() => setDemoOpen(true)}>Choose a demo user by role…</button>
            </div>
          )}
          </>)}
        </div>
      </div>

      <Modal open={demoOpen} onClose={() => setDemoOpen(false)} title={`Demo users (${demo.length})`} description="Each user has a different role, branch scope and permission set — shown on each card." size="lg">
        <div className="grid max-h-[60vh] gap-1 overflow-y-auto sm:grid-cols-2">
          {demo.map((d) => (
            <button key={d.userId} onClick={() => { setValue('userId', d.userId); setValue('password', 'Demo@2026'); setDemoOpen(false); }}
              className="rounded-lg border border-line px-3 py-2 text-left hover:border-brand-300 hover:bg-brand-50">
              <p className="font-mono text-[13px] font-semibold text-brand-700">{d.userId}</p>
              <p className="text-[13px] text-ink">{d.name}</p><p className="text-xs text-muted">{d.designation}</p>
              {/* Staff review 1.2: branch scope and a short permission summary on every card. */}
              <p className="mt-1 text-[11px] text-ink-2"><span className="font-medium">Scope:</span> {d.scope}</p>
              <p className="text-[11px] text-muted" title={d.viewModules.join(', ')}>Opens {d.viewModules.length} module{d.viewModules.length === 1 ? '' : 's'}{d.approveModules.length ? ` · approves in ${d.approveModules.join(', ')}` : ' · no approvals'}</p>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">User ID rule in this demo: role code, plus the branch for branch-based users (BG.MNL, DYM.MNL, BH.MNL); Head Office users have the role code only (ADMIN, TREAS). Branch Head, Dispatcher and Gate Clerk are proposed roles, pending confirmation. The picker and the shared password are hidden when <code className="font-mono">showDemoLogins</code> is off (production).</p>
      </Modal>
    </div>
  );
}
