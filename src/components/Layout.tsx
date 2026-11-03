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
  AlertTriangle,
} from 'lucide-react';
import { setStorageWarningCallback } from '../utils/storage';

const NAV_ITEMS = [
  { to: '/', label: 'Timetable Matrix', icon: LayoutDashboard },
  { to: '/faculty', label: 'Faculty Directory', icon: GraduationCap },
  { to: '/batches', label: 'Batches & Timing', icon: Users },
  { to: '/settings', label: 'Settings & Audit', icon: SettingsIcon },
];

function Brand() {
  return (
    <div className="flex items-center gap-3 select-none">
      <div className="w-8 h-8 rounded-md bg-[#6B2638] flex items-center justify-center text-white font-bold shrink-0 shadow-2xs">
        <CalendarDays className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <span className="text-sm font-bold text-[#252326] tracking-tight block leading-tight truncate">
          Timetable Pro
        </span>
        <span className="text-[11px] font-medium text-[#5E5B61] block truncate">
          Academic Administration
        </span>
      </div>
    </div>
  );
}

export default function Layout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    setStorageWarningCallback(msg => {
      setStorageWarning(msg);
    });
    return () => {
      setStorageWarningCallback(null);
    };
  }, []);

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
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 select-none ${
      isActive
        ? 'bg-[#6B2638] text-white shadow-2xs font-semibold'
        : 'text-[#5E5B61] hover:bg-[#FAF7F2] hover:text-[#252326]'
    }`;

  return (
    <div className="min-h-screen bg-[#F3EEE6] md:flex antialiased selection:bg-[#6B2638] selection:text-white">
      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#F3EEE6] border-b border-[#E5E0D8] sticky top-0 z-30">
        <Brand />
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="p-2 text-[#252326] hover:bg-[#FAF7F2] rounded-md transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile nav slide-over */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex animate-in fade-in duration-120">
          <div
            className="fixed inset-0 bg-[#252326]/50"
            onClick={() => setMobileNavOpen(false)}
            role="presentation"
          />
          <nav
            className="relative w-72 bg-[#F3EEE6] h-full p-5 flex flex-col justify-between shadow-xl z-50 border-r border-[#E5E0D8] animate-in slide-in-from-left duration-150"
            aria-label="Mobile Navigation"
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#E5E0D8] mb-6">
                <Brand />
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="p-1.5 text-[#5E5B61] hover:text-[#252326] rounded-md hover:bg-[#FAF7F2] transition-colors"
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

            <div className="pt-4 border-t border-[#E5E0D8]">
              <div className="p-3 rounded-md bg-[#FAF7F2] border border-[#E5E0D8] text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-[#252326] mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#6B2638] shrink-0" />
                  <span>Heuristic Engine Ready</span>
                </div>
                <p className="text-[#5E5B61] text-[11px] leading-relaxed">
                  Clash-free scheduling · PCMB ratio balance · Workload caps
                </p>
              </div>
              <div className="text-[11px] text-[#5E5B61] text-center mt-3 font-medium">
                Academic Year 2026-27
              </div>
            </div>
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 bg-[#FAF7F2] border-r border-[#E5E0D8] px-4 py-6 flex-col justify-between select-none">
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

        <div className="space-y-3 pt-6 border-t border-[#E5E0D8]">
          <div className="p-3 rounded-md bg-[#F3EEE6] border border-[#E5E0D8] text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-[#252326] mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#6B2638] shrink-0" />
              <span>Engine Status: Active</span>
            </div>
            <p className="text-[#5E5B61] text-[11px] leading-relaxed">
              Multi-candidate search · Hard clash prevention · Preserved locks
            </p>
          </div>

          <div className="text-[11px] text-[#5E5B61] text-center font-medium">
            Academic Year 2026-27 · v2.5
          </div>
        </div>
      </aside>

      {/* Main content container */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {storageWarning && (
          <div
            role="alert"
            className="bg-[#FAF0F2] text-[#6B2638] px-4 py-2 border-b border-[#ECD9DE] text-xs font-semibold flex items-center justify-between gap-2 z-30 shrink-0"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#6B2638]" />
              <span>{storageWarning}</span>
            </div>
            <button
              type="button"
              onClick={() => setStorageWarning(null)}
              className="p-1 hover:bg-[#F5DEE3] rounded transition-colors text-[#6B2638]"
              aria-label="Dismiss warning"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
