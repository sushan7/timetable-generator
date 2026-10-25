import { WEEKDAYS, type DayOfWeek } from '../../types';

export default function DayTabs({
  currentDay,
  onSelect,
  hasData,
}: {
  currentDay: DayOfWeek;
  onSelect: (day: DayOfWeek) => void;
  hasData: (day: DayOfWeek) => boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs">
      {WEEKDAYS.map(day => {
        const active = currentDay === day;
        const exists = hasData(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            className={`flex-1 min-w-[100px] px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 ${
              active
                ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-600/20'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>{day}</span>
            {exists && (
              <span
                className={`w-2 h-2 rounded-full transition-colors ${
                  active ? 'bg-white' : 'bg-emerald-500'
                }`}
                title="Timetable exists"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}