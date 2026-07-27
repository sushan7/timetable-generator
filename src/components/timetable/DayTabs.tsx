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
    <div className="flex flex-wrap gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200">
      {WEEKDAYS.map(day => {
        const active = currentDay === day;
        return (
          <button
            key={day}
            onClick={() => onSelect(day)}
            className={`flex-1 min-w-[90px] px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
              active ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {day}
            {hasData(day) && (
              <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-emerald-400'}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}