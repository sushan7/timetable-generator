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
      <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-canvas font-bold shrink-0 shadow-2xs border border-primary-hover">
        <CalendarDays className="w-4 h-4 text-accent" />
      </div>
      <div className="min-w-0">
        <span className="text-sm font-bold text-ink tracking-tight block leading-tight truncate">
          Timetable Pro
        </span>
        <span className="text-[11px] font-medium text-ink-muted block truncate">
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
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 select-none relative ${
      isActive
        ? 'bg-primary text-canvas shadow-2xs font-semibold after:absolute after:left-0 after:top-1.5 after:bottom-1.5 after:w-1 after:rounded-r after:bg-accent'
        : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
    }`;

  return (
    <div className="min-h-screen bg-canvas md:flex antialiased selection:bg-primary selection:text-canvas">
      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-canvas border-b border-border sticky top-0 z-30">
        <Brand />
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="p-2 text-ink hover:bg-surface-muted rounded-md transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile nav slide-over */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex animate-in fade-in duration-120">
          <div
            className="fixed inset-0 bg-ink/50"
            onClick={() => setMobileNavOpen(false)}
            role="presentation"
          />
          <nav
            className="relative w-72 bg-canvas h-full p-5 flex flex-col justify-between shadow-xl z-50 border-r border-border animate-in slide-in-from-left duration-150"
            aria-label="Mobile Navigation"
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-border mb-6">
                <Brand />
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="p-1.5 text-ink-muted hover:text-ink rounded-md hover:bg-surface-muted transition-colors"
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

            <div className="pt-4 border-t border-border">
              <div className="p-3 rounded-md bg-surface-muted border border-border text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-ink mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>Heuristic Engine Ready</span>
                </div>
                <p className="text-ink-muted text-[11px] leading-relaxed">
                  Clash-free scheduling · PCMB ratio balance · Workload caps
                </p>
              </div>
              <div className="text-[11px] text-ink-muted text-center mt-3 font-medium">
                Academic Year 2026-27
              </div>
            </div>
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 bg-surface border-r border-border px-4 py-6 flex-col justify-between select-none">
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

        <div className="space-y-3 pt-6 border-t border-border">
          <div className="p-3 rounded-md bg-surface-muted border border-border text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-ink mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>Engine Status: Active</span>
            </div>
            <p className="text-ink-muted text-[11px] leading-relaxed">
              Multi-candidate search · Hard clash prevention · Preserved locks
            </p>
          </div>

          <div className="text-[11px] text-ink-muted text-center font-medium">
            Academic Year 2026-27 · v2.5
          </div>
        </div>
      </aside>

      {/* Main content container */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {storageWarning && (
          <div
            role="alert"
            className="bg-burgundy-soft text-burgundy px-4 py-2 border-b border-burgundy/20 text-xs font-semibold flex items-center justify-between gap-2 z-30 shrink-0"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-burgundy" />
              <span>{storageWarning}</span>
            </div>
            <button
              type="button"
              onClick={() => setStorageWarning(null)}
              className="p-1 hover:bg-burgundy-soft/80 rounded transition-colors text-burgundy"
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
