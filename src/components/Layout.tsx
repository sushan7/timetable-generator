import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, Users, GraduationCap, LayoutDashboard, Settings as SettingsIcon, Menu, X } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Timetable', icon: LayoutDashboard },
  { to: '/faculty', label: 'Faculty', icon: GraduationCap },
  { to: '/batches', label: 'Batches', icon: Users },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export default function Layout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
      isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  const Brand = () => (
    <div className="flex items-center gap-2.5 text-indigo-600">
      <CalendarDays className="w-6 h-6" />
      <span className="text-lg font-bold text-slate-900 tracking-tight">Timetable Generator</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 md:flex">

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-30">
        <Brand />
        <button
          onClick={() => setMobileNavOpen(true)}
          className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
          aria-label="Open navigation"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileNavOpen(false)} />
          <nav className="relative w-72 bg-white h-full p-5 flex flex-col shadow-xl">
            <div className="flex items-center justify-between mb-8">
              <Brand />
              <button onClick={() => setMobileNavOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-700" aria-label="Close navigation">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={to === '/'} className={navLinkClass} onClick={() => setMobileNavOpen(false)}>
                  <Icon className="w-5 h-5" />
                  {label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <nav className="hidden md:flex w-60 shrink-0 bg-white border-r border-slate-200 px-4 py-6 flex-col">
        <div className="px-2 mb-8"><Brand /></div>
        <div className="flex flex-col gap-1.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={navLinkClass}>
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}