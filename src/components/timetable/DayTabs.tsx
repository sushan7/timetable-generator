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
    <div
      role="tablist"
      aria-label="Academic Weekdays"
      className="flex flex-wrap gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs select-none"
    >
      {WEEKDAYS.map(day => {
        const active = currentDay === day;
        const exists = hasData(day);
        return (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(day)}
            className={`flex-1 min-w-[100px] px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors duration-150 flex items-center justify-center gap-2 ${
              active
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>{day}</span>
            {exists && (
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                  active ? 'bg-indigo-200' : 'bg-emerald-500'
                }`}
                title="Schedule generated"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
