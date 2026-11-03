import { useMemo } from 'react';
import type { DayOfWeek } from '../../types';
import { getTabsOrder } from '../../utils/validation';

export default function DayTabs({
  currentDay,
  onSelect,
  hasData,
  weekStartDay,
}: {
  currentDay: DayOfWeek;
  onSelect: (day: DayOfWeek) => void;
  hasData: (day: DayOfWeek) => boolean;
  weekStartDay?: string;
}) {
  const orderedDays = useMemo(() => getTabsOrder(weekStartDay), [weekStartDay]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIdx = (index + 1) % orderedDays.length;
      onSelect(orderedDays[nextIdx]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIdx = (index - 1 + orderedDays.length) % orderedDays.length;
      onSelect(orderedDays[prevIdx]);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Academic Weekdays"
      className="flex flex-wrap gap-1 bg-[#FAF7F2] p-1 rounded-md border border-[#E5E0D8] select-none"
    >
      {orderedDays.map((day, idx) => {
        const active = currentDay === day;
        const exists = hasData(day);
        return (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(day)}
            onKeyDown={e => handleKeyDown(e, idx)}
            className={`flex-1 min-w-[90px] px-3 py-1.5 rounded text-sm font-medium transition-colors duration-150 flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-[#6B2638] ${
              active
                ? 'bg-[#6B2638] text-white shadow-2xs font-semibold'
                : 'text-[#5E5B61] hover:bg-white hover:text-[#252326]'
            }`}
          >
            <span>{day}</span>
            {exists && (
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                  active ? 'bg-[#B08D57]' : 'bg-[#6B2638]'
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
