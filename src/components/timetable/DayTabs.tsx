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
      className="flex flex-wrap gap-1 bg-[#F0EFE9] p-1 rounded-md border border-[#E5E2DA] select-none"
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
            className={`flex-1 min-w-[90px] px-3 py-1.5 rounded text-sm font-medium transition-colors duration-150 flex items-center justify-center gap-2 ${
              active
                ? 'bg-[#C47B59] text-white shadow-2xs font-semibold'
                : 'text-[#77766F] hover:bg-white hover:text-[#252522]'
            }`}
          >
            <span>{day}</span>
            {exists && (
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                  active ? 'bg-[#F2D7CC]' : 'bg-[#C47B59]'
                }`}
                title="Schedule exists"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
