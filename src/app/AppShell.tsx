import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bell, CheckSquare, ChevronDown, CircleHelp, KeyRound, LogOut, Menu, PanelLeftClose, PanelLeftOpen, RotateCcw, UserRound, X } from 'lucide-react';
import { api } from '../lib/api-client';
import { cn } from '../lib/ui';
import { formatDateTime, loadAppConfig } from '../lib/shared';
import logo from '../assets/delbros-logo.png';
import { useAuth } from './auth';
import { NAV } from './nav';
import { useRefLookups } from '../shared/hooks';

/** Back to the previous screen — shown only on screens reached through a link inside a page (list → detail, related record).
 *  Hidden on screens opened from the main navigation and on the first screen of the session (e.g. right after sign-in). */
// Screens opened from the main navigation (sidebar, header icons, user menu) carry this state, so Back stays hidden there.
const MAIN_NAV = { mainNav: true };
function BackButton() {
  const loc = useLocation(); // re-render on every navigation
  const nav = useNavigate();
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx < 1 || (loc.state as { mainNav?: boolean } | null)?.mainNav) return null;
  return (
    <button type="button" onClick={() => nav(-1)} title="Back to the previous screen"
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line bg-surface pl-2 pr-3 text-[13px] font-medium text-ink-2 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
      <ArrowLeft className="size-4" aria-hidden />Back
    </button>
  );
}

function readPref(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function writePref(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { can } = useAuth();
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.perm === '*' || can(i.perm)) })).filter((g) => g.items.length);
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.label} className="mb-4">
          {!collapsed && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-disabled">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.items.map((i) => (
              <li key={i.to}>
                <NavLink to={i.to} state={MAIN_NAV} end onClick={onNavigate} title={collapsed ? i.label : undefined}
                  className={({ isActive }) => cn('relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                    isActive ? 'bg-brand-50 text-brand-800 before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-600' : 'text-ink-2 hover:bg-surface-alt',
                    collapsed && 'justify-center px-0')}>
                  <i.icon className="size-[18px] shrink-0" aria-hidden />
                  {!collapsed && <span className="truncate">{i.label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const { branchName } = useRefLookups();
  const [collapsed, setCollapsed] = useState(() => readPref('ui.sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  // Staff review 1.2: Reset demo data only in the demo environment (app-config showDemoLogins); help contact from app-config.
  const [cfg, setCfg] = useState<{ demo: boolean; helpdesk: string }>({ demo: false, helpdesk: '' });
  useEffect(() => { loadAppConfig().then((c) => setCfg({ demo: c.showDemoLogins === true, helpdesk: c.helpdeskContact ?? '' })); }, []);
  const counts =useQuery({ queryKey: ['counts', loc.pathname], queryFn: () => api.inbox.counts(), refetchInterval: 20_000 });
  useEffect(() => { setMenu(false); setMobileOpen(false); }, [loc.pathname]);
  // User menu closes on a click anywhere outside it, or on Esc (it already closes on navigation).
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const out = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const toggle = () => { setCollapsed((c) => { writePref('ui.sidebar', c ? 'open' : 'collapsed'); return !c; }); };
  const initials = user?.name.split(' ').map((p) => p[0]).slice(0, 2).join('') ?? '';

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface lg:flex transition-[width] duration-200', collapsed ? 'w-[72px]' : 'w-[248px]')}>
        <div className={cn('flex h-16 items-center gap-2.5 border-b border-line px-4', collapsed && 'justify-center px-0')}>
          <img src={logo} alt="Delbros" className="h-8 w-auto" />
          {!collapsed && <div className="leading-tight"><p className="text-[15px] font-bold text-brand-800">Delbros Leasing</p><p className="text-[11px] text-muted">Leasing management</p></div>}
        </div>
        <Sidebar collapsed={collapsed} />
        <button onClick={toggle} className="m-3 flex items-center justify-center gap-2 rounded-lg py-2 text-xs text-muted hover:bg-surface-alt" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Collapse</>}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="flex h-full w-[260px] flex-col bg-surface" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <div className="flex items-center gap-2"><img src={logo} alt="" className="h-7" /><span className="font-bold text-brand-800">Delbros Leasing</span></div>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="size-5 text-muted" /></button>
            </div>
            <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:px-6 no-print">
          <button className="rounded-lg p-2 text-ink-2 hover:bg-surface-alt lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <BackButton />
            <span className="hidden rounded-md border border-warning-line bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning sm:inline">DEMO DATA</span>
            <span className="truncate text-[13px] text-muted">Branch: <span className="font-medium text-ink-2">{user?.branchAccess === 'ALL' ? 'All branches' : branchName(user?.branchCode)}</span></span>
          </div>
          <Link to="/approvals" state={MAIN_NAV} className="relative rounded-lg p-2 text-ink-2 hover:bg-surface-alt" aria-label={`Approvals (${counts.data?.approvals ?? 0})`}>
            <CheckSquare className="size-5" />
            {!!counts.data?.approvals && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-brand-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{counts.data.approvals}</span>}
          </Link>
          <Link to="/notifications" state={MAIN_NAV} className="relative rounded-lg p-2 text-ink-2 hover:bg-surface-alt" aria-label={`Notifications (${counts.data?.unread ?? 0} unread)`}>
            <Bell className="size-5" />
            {!!counts.data?.unread && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-white">{counts.data.unread}</span>}
          </Link>
          <div ref={menuRef} className="relative">
            <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-surface-alt" aria-haspopup="menu" aria-expanded={menu}>
              <span className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{initials}</span>
              <span className="hidden text-left leading-tight md:block"><span className="block text-[13px] font-medium text-ink">{user?.name}</span><span className="block text-[11px] text-muted">{user?.designation}</span></span>
              <ChevronDown className="size-4 text-muted" />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 mt-2 w-64 rounded-xl border border-line bg-surface p-1 shadow-lg">
                <div className="border-b border-line px-3 py-2 text-xs text-muted">Signed in as <span className="font-medium text-ink-2">{user?.userId}</span>
                  <span className="block">{user?.branchAccess === 'ALL' ? 'All branches' : branchName(user?.branchCode)}</span>
                  {user?.previousLogin && <span className="block">Last sign-in {formatDateTime(user.previousLogin)}</span>}</div>
                <Link to="/account/profile" state={MAIN_NAV} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-alt" role="menuitem"><UserRound className="size-4" /> My profile</Link>
                <Link to="/account/password" state={MAIN_NAV} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-alt" role="menuitem"><KeyRound className="size-4" /> Change password</Link>
                {cfg.helpdesk ? <a href={/@/.test(cfg.helpdesk) ? `mailto:${cfg.helpdesk}` : undefined} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-alt" role="menuitem"><CircleHelp className="size-4" /> Help: {cfg.helpdesk}</a>
                  : <span className="flex items-center gap-2 px-3 py-2 text-sm text-muted" role="menuitem"><CircleHelp className="size-4" /> Help: contact your IT administrator</span>}
                {cfg.demo && <button onClick={() => { api.auth.resetDemo(); window.location.href = '/login'; }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-alt" role="menuitem" title="Demo environment only — hidden when demo sign-ins are switched off"><RotateCcw className="size-4" /> Reset demo data</button>}
                <button onClick={async () => { await logout(); nav('/login'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-bg" role="menuitem"><LogOut className="size-4" /> Sign out</button>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
