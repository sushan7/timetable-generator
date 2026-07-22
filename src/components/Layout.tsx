import { NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, Users, GraduationCap, LayoutDashboard } from 'lucide-react';

export default function Layout() {
  const navItems = [
    { to: '/', label: 'Master Timetable', icon: <LayoutDashboard className="w-5 h-5" /> },
    { to: '/faculty', label: 'Faculty', icon: <GraduationCap className="w-5 h-5" /> },
    { to: '/batches', label: 'Batches', icon: <Users className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <nav className="w-full md:w-64 bg-white border-r border-gray-200 px-4 py-6 flex flex-col">
        <div className="flex items-center gap-3 px-2 mb-8 text-blue-600">
          <CalendarDays className="w-8 h-8" />
          <span className="text-xl font-bold text-gray-900">SDTG</span>
        </div>

        <div className="flex flex-col gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {/* The <Outlet /> renders whichever component matches the current route */}
        <Outlet /> 
      </main>
    </div>
  );
}