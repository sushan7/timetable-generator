import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  CalendarDays,
  Users,
  GraduationCap,
  LayoutDashboard,
  Settings as SettingsIcon,
  Menu,
  X,
  CheckCircle2,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Timetable Matrix', icon: LayoutDashboard },
  { to: '/faculty', label: 'Faculty Directory', icon: GraduationCap },
  { to: '/batches', label: 'Batches & Timing', icon: Users },
  { to: '/settings', label: 'Settings & Audit', icon: SettingsIcon },
];

function Brand() {
  return (
    <div className="flex items-center gap-3 select-none">
      <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-2xs font-bold shrink-0">
        <CalendarDays className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <span className="text-sm font-bold text-slate-900 tracking-tight block leading-tight truncate">
          Timetable Pro
        </span>
        <span className="text-[11px] font-medium text-slate-500 block truncate">
          Academic Studio
        </span>
      </div>
    </div>
  );
}

export default function Layout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Handle ESC key for mobile drawer
  useEffect(() => {
    if (!mobileNavOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileNavOpen]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-colors duration-150 select-none ${
      isActive
        ? 'bg-indigo-600 text-white shadow-2xs'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <div className="min-h-screen bg-slate-50 md:flex antialiased selection:bg-indigo-600 selection:text-white">
      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-30">
        <Brand />
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile nav slide-over */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex animate-in fade-in duration-150">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileNavOpen(false)}
            role="presentation"
          />
          <nav
            className="relative w-72 bg-white h-full p-5 flex flex-col justify-between shadow-xl z-50 animate-in slide-in-from-left duration-200"
            aria-label="Mobile Navigation"
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                <Brand />
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                  aria-label="Close navigation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col gap-1">
                {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={() => setMobileNavOpen(false)}
                    className={navLinkClass}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Heuristic Engine Ready</span>
                </div>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Clash-free scheduling &middot; PCMB ratio balance &middot; Workload caps
                </p>
              </div>
              <div className="text-[11px] text-slate-400 text-center mt-3 font-medium">
                Academic Year 2026–27
              </div>
            </div>
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 bg-white border-r border-slate-200 px-4 py-6 flex-col justify-between select-none">
        <div>
          <div className="px-2 mb-8">
            <Brand />
          </div>

          <nav className="flex flex-col gap-1" aria-label="Main Navigation">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={navLinkClass}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="space-y-3 pt-6 border-t border-slate-100">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Engine Status: Active</span>
            </div>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              Auto-resolves overlaps, enforces faculty limits, and preserves locked slots.
            </p>
          </div>

          <div className="text-[11px] text-slate-400 text-center font-medium">
            Academic Year 2026–27 &middot; v2.2
          </div>
        </div>
      </aside>

      {/* Main content container */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
