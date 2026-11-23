import { X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { FOLDER_COLOR_STYLES } from '../lib/colors.ts';
import {
  endOfDay,
  formatTimeShort,
  getMonthGridDays,
  getOrderedWeekdays,
  isSameDay,
  startOfDay,
  toDateInputString,
} from '../lib/dateUtils.ts';
import { expandEventsInRange } from '../lib/ics.ts';
import { useWheelPeriodStep } from '../lib/useWheelPeriodStep.ts';
import type {
  FirstDayOfWeek,
  FolderColorKey,
  IcsCalendar,
  IcsEvent,
  IcsOccurrence,
} from '../types/calendar.ts';

interface YearViewProps {
  activeDate: Date;
  firstDayOfWeek: FirstDayOfWeek;
  events: IcsEvent[];
  calendars: IcsCalendar[];
  onSelectMonth: (monthDate: Date) => void;
  onSelectDay: (dayDate: Date) => void;
  onSelectOccurrence: (occ: IcsOccurrence) => void;
  onCreateAt: (date: Date, hour: number, allDay?: boolean) => void;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i);

export function YearView({
  activeDate,
  firstDayOfWeek,
  events,
  calendars,
  onSelectMonth,
  onSelectDay,
  onSelectOccurrence,
  onCreateAt,
  onPrevPeriod,
  onNextPeriod,
}: YearViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const year = activeDate.getFullYear();
  const today = new Date();

  const calendarMap = useMemo(() => {
    const m = new Map<string, IcsCalendar>();
    calendars.forEach((c) => m.set(c.id, c));
    return m;
  }, [calendars]);

  const yearOccurrences = useMemo(() => {
    const rangeStart = startOfDay(new Date(year, 0, 1));
    const rangeEnd = endOfDay(new Date(year, 11, 31));
    return expandEventsInRange(events, rangeStart, rangeEnd);
  }, [events, year]);

  // Index occurrences by YYYY-MM-DD for O(1) cell dot lookup
  const dayOccurrenceMap = useMemo(() => {
    const map = new Map<
      string,
      { colors: FolderColorKey[]; occs: IcsOccurrence[] }
    >();
    for (const occ of yearOccurrences) {
      const cal = calendarMap.get(occ.event.calendarId);
      const color: FolderColorKey = cal?.color ?? 'blue';

      const cur = startOfDay(occ.startDate);
      const end = occ.event.allDay
        ? startOfDay(new Date(occ.endDate.getTime() - 1))
        : startOfDay(occ.endDate);
      const safeEnd = end < cur ? cur : end;

      let guard = 0;
      while (cur <= safeEnd && guard < 366) {
        guard++;
        if (cur.getFullYear() === year) {
          const key = toDateInputString(cur);
          let entry = map.get(key);
          if (!entry) {
            entry = { colors: [], occs: [] };
            map.set(key, entry);
          }
          entry.occs.push(occ);
          if (!entry.colors.includes(color) && entry.colors.length < 3) {
            entry.colors.push(color);
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [calendarMap, year, yearOccurrences]);

  const weekdayHeaders = useMemo(
    () => getOrderedWeekdays(firstDayOfWeek, 'narrow'),
    [firstDayOfWeek]
  );

  const handleWheel = useWheelPeriodStep({
    onPrev: onPrevPeriod,
    onNext: onNextPeriod,
    disabled: selectedDay !== null,
    scrollContainerRef: scrollRef,
    cooldownMs: 360,
    threshold: 35,
  });

  const selectedDayOccs = useMemo(() => {
    if (!selectedDay) return [];
    const key = toDateInputString(selectedDay);
    return dayOccurrenceMap.get(key)?.occs ?? [];
  }, [dayOccurrenceMap, selectedDay]);

  return (
    <div
      ref={scrollRef}
      onWheel={handleWheel}
      className="flex-1 overflow-y-auto bg-white dark:bg-[#0a0a0a] p-4 sm:p-6 relative"
    >
      <div className="mx-auto max-w-6xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
        {MONTHS.map((monthIdx) => {
          const monthDate = new Date(year, monthIdx, 1);
          const monthLabel = monthDate.toLocaleDateString('en-US', {
            month: 'long',
          });
          const gridDays = getMonthGridDays(monthDate, firstDayOfWeek);
          const isCurrentMonth =
            today.getFullYear() === year && today.getMonth() === monthIdx;

          return (
            <section
              key={monthIdx}
              className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/55 dark:bg-[#111111] p-3.5 transition-colors"
            >
              <div className="flex items-center justify-between mb-2.5 px-1">
                <button
                  type="button"
                  onClick={() => onSelectMonth(monthDate)}
                  className={`font-display text-sm font-semibold tracking-tight hover:underline underline-offset-4 transition-colors ${
                    isCurrentMonth
                      ? 'text-neutral-950 dark:text-white'
                      : 'text-neutral-700 dark:text-neutral-200'
                  }`}
                >
                  {monthLabel}
                </button>
              </div>

              <div className="grid grid-cols-7 gap-y-0.5 text-center">
                {weekdayHeaders.map((label, i) => (
                  <div
                    key={i}
                    className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 py-1"
                  >
                    {label}
                  </div>
                ))}

                {gridDays.map((day) => {
                  const inMonth = day.getMonth() === monthIdx;
                  const isToday = isSameDay(day, today);
                  const isSelected = isSameDay(day, activeDate);
                  const dayKey = toDateInputString(day);
                  const entry = inMonth ? dayOccurrenceMap.get(dayKey) : undefined;

                  return (
                    <button
                      key={dayKey}
                      type="button"
                      onClick={() => {
                        if (!inMonth) {
                          onSelectDay(day);
                          return;
                        }
                        if (entry && entry.occs.length > 0) {
                          setSelectedDay(day);
                        } else {
                          onSelectDay(day);
                        }
                      }}
                      className={`relative mx-auto flex h-7 w-7 flex-col items-center justify-center rounded-lg text-[11px] tabular-nums transition-colors ${
                        !inMonth
                          ? 'text-neutral-300 dark:text-neutral-700 hover:bg-neutral-200/40 dark:hover:bg-neutral-800/30'
                          : isToday
                            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-semibold'
                            : isSelected
                              ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium'
                              : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/65 dark:hover:bg-neutral-800/70'
                      }`}
                    >
                      <span className={entry ? '-mt-0.5' : ''}>
                        {day.getDate()}
                      </span>
                      {entry && entry.colors.length > 0 && (
                        <span className="flex items-center gap-0.5 mt-px">
                          {entry.colors.map((c, ci) => (
                            <span
                              key={ci}
                              className={`h-1 w-1 rounded-full ${
                                isToday
                                  ? 'bg-white/90 dark:bg-neutral-950/85'
                                  : FOLDER_COLOR_STYLES[c].softDot
                              }`}
                            />
                          ))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Day Summary Popover */}
      {selectedDay && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 dark:bg-black/65 backdrop-blur-[2px] p-4"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#141414] shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="font-display text-sm font-semibold text-neutral-900 dark:text-white">
                {selectedDay.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {selectedDayOccs.map((occ) => {
                const cal = calendarMap.get(occ.event.calendarId);
                const style = FOLDER_COLOR_STYLES[cal?.color ?? 'slate'];
                return (
                  <button
                    key={occ.occurrenceId}
                    type="button"
                    onClick={() => {
                      setSelectedDay(null);
                      onSelectOccurrence(occ);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${style.monthChip}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${style.swatch}`}
                      />
                      <span className="font-medium truncate">
                        {occ.event.summary}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-[11px] opacity-75 shrink-0">
                      {occ.event.allDay
                        ? 'All day'
                        : formatTimeShort(occ.startDate)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = selectedDay;
                  setSelectedDay(null);
                  onSelectDay(target);
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Open Day
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = selectedDay;
                  setSelectedDay(null);
                  onCreateAt(target, 9, false);
                }}
                className="px-3.5 py-1.5 text-xs font-medium rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-950 transition-colors"
              >
                Add Event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
