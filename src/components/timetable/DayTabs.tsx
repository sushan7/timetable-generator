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
      const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[role="tab"]');
      buttons?.[nextIdx]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIdx = (index - 1 + orderedDays.length) % orderedDays.length;
      onSelect(orderedDays[prevIdx]);
      const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[role="tab"]');
      buttons?.[prevIdx]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Academic Weekdays"
      className="flex flex-wrap gap-1 bg-surface-muted p-1 rounded-md border border-border select-none"
    >
      {orderedDays.map((day, idx) => {
        const active = currentDay === day;
        const exists = hasData(day);
        return (
          <button
            key={day}
            type="button"
            role="tab"
            id={`timetable-tab-${day.toLowerCase()}`}
            aria-controls={`timetable-panel-${day.toLowerCase()}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(day)}
            onKeyDown={e => handleKeyDown(e, idx)}
            className={`flex-1 min-w-[90px] px-3 py-1.5 rounded text-sm font-medium transition-colors duration-150 flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-accent relative ${
              active
                ? 'bg-primary text-canvas shadow-2xs font-semibold after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:bg-accent after:rounded-full'
                : 'text-ink-muted hover:bg-surface hover:text-ink'
            }`}
          >
            <span>{day}</span>
            {exists && (
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                  active ? 'bg-accent' : 'bg-primary'
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
