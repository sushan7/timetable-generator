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
      <div className="w-8 h-8 rounded-md bg-[#C47B59] flex items-center justify-center text-white font-bold shrink-0 shadow-2xs">
        <CalendarDays className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <span className="text-sm font-bold text-[#252522] tracking-tight block leading-tight truncate">
          Timetable Pro
        </span>
        <span className="text-[11px] font-medium text-[#77766F] block truncate">
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
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 select-none ${
      isActive
        ? 'bg-[#C47B59] text-white shadow-2xs'
        : 'text-[#77766F] hover:bg-[#F0EFE9] hover:text-[#252522]'
    }`;

  return (
    <div className="min-h-screen bg-[#F8F7F3] md:flex antialiased selection:bg-[#C47B59] selection:text-white">
      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#F8F7F3] border-b border-[#E5E2DA] sticky top-0 z-30">
        <Brand />
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="p-2 text-[#252522] hover:bg-[#F0EFE9] rounded-md transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile nav slide-over */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex animate-in fade-in duration-120">
          <div
            className="fixed inset-0 bg-[#252522]/40"
            onClick={() => setMobileNavOpen(false)}
            role="presentation"
          />
          <nav
            className="relative w-72 bg-[#F8F7F3] h-full p-5 flex flex-col justify-between shadow-xl z-50 border-r border-[#E5E2DA] animate-in slide-in-from-left duration-150"
            aria-label="Mobile Navigation"
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#E5E2DA] mb-6">
                <Brand />
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="p-1.5 text-[#77766F] hover:text-[#252522] rounded-md hover:bg-[#F0EFE9] transition-colors"
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

            <div className="pt-4 border-t border-[#E5E2DA]">
              <div className="p-3 rounded-md bg-[#F0EFE9] border border-[#E5E2DA] text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-[#252522] mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#C47B59] shrink-0" />
                  <span>Heuristic Engine Ready</span>
                </div>
                <p className="text-[#77766F] text-[11px] leading-relaxed">
                  Clash-free scheduling &middot; PCMB ratio balance &middot; Workload caps
                </p>
              </div>
              <div className="text-[11px] text-[#77766F] text-center mt-3 font-medium">
                Academic Year 2026-27
              </div>
            </div>
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 bg-[#FBFBFA] border-r border-[#E5E2DA] px-4 py-6 flex-col justify-between select-none">
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

        <div className="space-y-3 pt-6 border-t border-[#E5E2DA]">
          <div className="p-3 rounded-md bg-[#F0EFE9] border border-[#E5E2DA] text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-[#252522] mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#C47B59] shrink-0" />
              <span>Engine Status: Active</span>
            </div>
            <p className="text-[#77766F] text-[11px] leading-relaxed">
              Auto-resolves overlaps, enforces faculty limits, and preserves locked slots.
            </p>
          </div>

          <div className="text-[11px] text-[#77766F] text-center font-medium">
            Academic Year 2026-27 &middot; v2.2
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
