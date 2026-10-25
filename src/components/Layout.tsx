import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, Users, GraduationCap, LayoutDashboard, Settings as SettingsIcon, Menu, X, Sparkles } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Timetable', icon: LayoutDashboard },
  { to: '/faculty', label: 'Faculty', icon: GraduationCap },
  { to: '/batches', label: 'Batches', icon: Users },
  { to: '/settings', label: 'Settings & Audit', icon: SettingsIcon },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 ring-1 ring-white/20">
        <CalendarDays className="w-5 h-5" />
      </div>
      <div>
        <span className="text-base font-extrabold text-slate-900 tracking-tight block leading-tight">
          Timetable Pro
        </span>
        <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider block">
          Academic Engine
        </span>
      </div>
    </div>
  );
}

export default function Layout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
      isActive
        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <div className="min-h-screen bg-slate-50 md:flex antialiased">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30">
        <Brand />
        <button
          onClick={() => setMobileNavOpen(true)}
          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileNavOpen(false)}
          />
          <nav className="relative w-72 bg-white h-full p-5 flex flex-col shadow-2xl justify-between">
            <div>
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
                <Brand />
                <button
                  onClick={() => setMobileNavOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                  aria-label="Close navigation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={navLinkClass}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4" />
                      <span>{label}</span>
                    </div>
                  </NavLink>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-100 text-xs text-indigo-900">
                <div className="flex items-center gap-1.5 font-bold mb-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> V2 Heuristic Scheduler
                </div>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Clash-free scheduling &middot; PCMB ratio bias &middot; Workload caps
                </p>
              </div>
            </div>
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <nav className="hidden md:flex w-64 shrink-0 bg-white border-r border-slate-200/90 px-4 py-6 flex-col justify-between">
        <div>
          <div className="px-2 mb-8">
            <Brand />
          </div>
          <div className="flex flex-col gap-1.5">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className={navLinkClass}>
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </div>
              </NavLink>
            ))}
          </div>
        </div>

        <div className="space-y-3 pt-6 border-t border-slate-100">
          <div className="bg-gradient-to-br from-indigo-50/80 to-slate-50 p-3.5 rounded-2xl border border-indigo-100/70 text-xs shadow-2xs">
            <div className="flex items-center gap-1.5 font-bold text-indigo-950 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Smart Engine Active</span>
            </div>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              Auto-resolves overlaps, preserves frozen periods, and distributes faculty workload.
            </p>
          </div>
          <div className="text-[11px] text-slate-400 text-center font-medium">
            Academic Year 2026–27 &middot; v2.2
          </div>
        </div>
      </nav>

      {/* Main content container */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}