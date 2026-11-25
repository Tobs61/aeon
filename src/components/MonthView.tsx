import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FOLDER_COLOR_STYLES } from '../lib/colors.ts';
import {
  addDays,
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
  IcsCalendar,
  IcsEvent,
  IcsOccurrence,
} from '../types/calendar.ts';

interface MonthViewProps {
  activeDate: Date;
  firstDayOfWeek: FirstDayOfWeek;
  events: IcsEvent[];
  calendars: IcsCalendar[];
  onSelectOccurrence: (occ: IcsOccurrence) => void;
  onCreateAt: (date: Date, hour: number, allDay?: boolean) => void;
  onUpdateEventTiming: (
    occ: IcsOccurrence,
    newStart: Date,
    newEnd: Date
  ) => Promise<void>;
  onEventContextMenu?: (e: React.MouseEvent, occ: IcsOccurrence) => void;
  onSlotContextMenu?: (
    e: React.MouseEvent,
    date: Date,
    hour: number,
    allDay?: boolean
  ) => void;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
}

interface MonthDragState {
  occ: IcsOccurrence;
  originX: number;
  originY: number;
  clientX: number;
  clientY: number;
  hasMoved: boolean;
  origDayKey: string;
  hoverDayKey: string | null;
}

function findMonthDropDateKey(x: number, y: number): string | null {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    const key = (el as HTMLElement).dataset?.monthDrop;
    if (key) return key;
  }
  return null;
}

export function MonthView({
  activeDate,
  firstDayOfWeek,
  events,
  calendars,
  onSelectOccurrence,
  onCreateAt,
  onUpdateEventTiming,
  onEventContextMenu,
  onSlotContextMenu,
  onPrevPeriod,
  onNextPeriod,
}: MonthViewProps) {
  const [expandedDay, setExpandedDay] = useState<Date | null>(null);
  const suppressDayClickUntilRef = useRef<number>(0);

  const [dragState, setDragState] = useState<MonthDragState | null>(null);
  const dragStateRef = useRef<MonthDragState | null>(null);
  dragStateRef.current = dragState;

  const handleWheel = useWheelPeriodStep({
    onPrev: onPrevPeriod,
    onNext: onNextPeriod,
    disabled: expandedDay !== null || dragState !== null,
  });

  const gridDays = useMemo(
    () => getMonthGridDays(activeDate, firstDayOfWeek),
    [activeDate, firstDayOfWeek]
  );
  const weekdayHeaders = useMemo(
    () => getOrderedWeekdays(firstDayOfWeek, 'short'),
    [firstDayOfWeek]
  );

  const calendarMap = useMemo(() => {
    const m = new Map<string, IcsCalendar>();
    calendars.forEach((c) => m.set(c.id, c));
    return m;
  }, [calendars]);

  const occurrences = useMemo(() => {
    const rangeStart = startOfDay(gridDays[0]);
    const rangeEnd = endOfDay(gridDays[gridDays.length - 1]);
    return expandEventsInRange(events, rangeStart, rangeEnd);
  }, [events, gridDays]);

  const today = new Date();
  const activeMonth = activeDate.getMonth();

  const expandedDayOccurrences = useMemo(() => {
    if (!expandedDay) return [];
    const dStart = startOfDay(expandedDay);
    const dEnd = endOfDay(expandedDay);
    return occurrences.filter((o) => o.startDate <= dEnd && o.endDate > dStart);
  }, [expandedDay, occurrences]);

  const isDragging = dragState !== null;
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: PointerEvent) => {
      const curr = dragStateRef.current;
      if (!curr) return;
      const dist = Math.hypot(
        e.clientX - curr.originX,
        e.clientY - curr.originY
      );
      const hasMoved = curr.hasMoved || dist > 5;
      const hoverDayKey = hasMoved
        ? findMonthDropDateKey(e.clientX, e.clientY)
        : null;

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              hasMoved,
              clientX: e.clientX,
              clientY: e.clientY,
              hoverDayKey,
            }
          : null
      );
    };

    const handleUp = () => {
      const curr = dragStateRef.current;
      setDragState(null);
      if (!curr) return;

      if (curr.hasMoved) {
        suppressDayClickUntilRef.current = Date.now() + 250;
      } else {
        onSelectOccurrence(curr.occ);
        return;
      }

      if (curr.hoverDayKey && curr.hoverDayKey !== curr.origDayKey) {
        const [ty, tm, td] = curr.hoverDayKey.split('-').map(Number);
        const [oy, om, od] = curr.origDayKey.split('-').map(Number);
        const targetDayStart = new Date(ty, (tm || 1) - 1, td || 1);
        const origCellStart = new Date(oy, (om || 1) - 1, od || 1);
        const diffDays = Math.round(
          (targetDayStart.getTime() - origCellStart.getTime()) /
            (24 * 60 * 60 * 1000)
        );
        if (diffDays !== 0) {
          const newStart = addDays(curr.occ.startDate, diffDays);
          const newEnd = addDays(curr.occ.endDate, diffDays);
          void onUpdateEventTiming(curr.occ, newStart, newEnd);
        }
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [isDragging, onSelectOccurrence, onUpdateEventTiming]);

  return (
    <div
      onWheel={handleWheel}
      className={`flex flex-1 flex-col min-h-0 bg-white dark:bg-[#0a0a0a] relative ${
        dragState ? 'select-none' : ''
      }`}
    >
      {/* Weekday Column Headers */}
      <div className="grid grid-cols-7 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#111111] shrink-0">
        {weekdayHeaders.map((label) => (
          <div
            key={label}
            className="px-3 py-2 text-xs font-medium text-neutral-500 dark:text-neutral-400 border-r last:border-r-0 border-neutral-200 dark:border-neutral-800"
          >
            {label}
          </div>
        ))}
      </div>

      {/* 6-Row Month Grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 min-h-0">
        {gridDays.map((day, idx) => {
          const dayKey = toDateInputString(day);
          const inMonth = day.getMonth() === activeMonth;
          const isToday = isSameDay(day, today);
          const dStart = startOfDay(day);
          const dEnd = endOfDay(day);
          const dayOccs = occurrences.filter(
            (o) => o.startDate <= dEnd && o.endDate > dStart
          );
          const visibleOccs = dayOccs.slice(0, 3);
          const overflowCount = dayOccs.length - visibleOccs.length;
          const isLastCol = (idx + 1) % 7 === 0;
          const isLastRow = idx >= 35;
          const isDropTarget =
            dragState?.hasMoved && dragState.hoverDayKey === dayKey;

          return (
            <div
              key={dayKey}
              data-month-drop={dayKey}
              onClick={() => {
                if (Date.now() < suppressDayClickUntilRef.current) return;
                onCreateAt(day, 9, false);
              }}
              onContextMenu={(e) => onSlotContextMenu?.(e, day, 9, false)}
              className={`group flex flex-col p-1.5 min-h-0 overflow-hidden cursor-pointer transition-colors ${
                !isLastCol
                  ? 'border-r border-neutral-200 dark:border-neutral-800'
                  : ''
              } ${
                !isLastRow
                  ? 'border-b border-neutral-200 dark:border-neutral-800'
                  : ''
              } ${
                isDropTarget
                  ? 'bg-neutral-200/70 dark:bg-neutral-800/60 ring-1 ring-inset ring-neutral-500/50'
                  : !inMonth
                    ? 'bg-neutral-50/80 dark:bg-[#0e0e0e] hover:bg-neutral-100/80 dark:hover:bg-[#151515]'
                    : 'bg-white dark:bg-[#0a0a0a] hover:bg-neutral-50 dark:hover:bg-[#121212]'
              }`}
            >
              <div className="flex items-center justify-between mb-1 shrink-0">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${
                    isToday
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-semibold'
                      : inMonth
                        ? 'text-neutral-800 dark:text-neutral-200 font-medium'
                        : 'text-neutral-400 dark:text-neutral-600'
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>

              <div className="flex-1 space-y-1 min-h-0 overflow-hidden">
                {visibleOccs.map((occ) => {
                  const cal = calendarMap.get(occ.event.calendarId);
                  const style = FOLDER_COLOR_STYLES[cal?.color ?? 'slate'];
                  const isDraggingThis =
                    dragState?.hasMoved &&
                    dragState.occ.occurrenceId === occ.occurrenceId;

                  return (
                    <div
                      key={occ.occurrenceId}
                      role="button"
                      tabIndex={0}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setDragState({
                          occ,
                          originX: e.clientX,
                          originY: e.clientY,
                          clientX: e.clientX,
                          clientY: e.clientY,
                          hasMoved: false,
                          origDayKey: dayKey,
                          hoverDayKey: dayKey,
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onContextMenu={(e) => onEventContextMenu?.(e, occ)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectOccurrence(occ);
                        }
                      }}
                      className={`touch-none select-none flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-0.5 text-left text-[11px] leading-tight transition-opacity cursor-grab active:cursor-grabbing ${style.monthChip} ${
                        isDraggingThis ? 'opacity-40' : ''
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${style.swatch}`}
                      />
                      {!occ.event.allDay && (
                        <span className="font-mono tabular-nums opacity-75 shrink-0">
                          {formatTimeShort(occ.startDate)}
                        </span>
                      )}
                      <span className="font-medium truncate">
                        {occ.event.summary}
                      </span>
                    </div>
                  );
                })}

                {overflowCount > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedDay(day);
                    }}
                    className="w-full text-left px-1.5 py-0.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                  >
                    +{overflowCount} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Drag Ghost */}
      {dragState?.hasMoved &&
        (() => {
          const cal = calendarMap.get(dragState.occ.event.calendarId);
          const style = FOLDER_COLOR_STYLES[cal?.color ?? 'slate'];
          return (
            <div
              style={{
                left: `${dragState.clientX + 10}px`,
                top: `${dragState.clientY + 10}px`,
              }}
              className={`pointer-events-none fixed z-50 flex max-w-[200px] items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium shadow-lg ring-2 ring-neutral-500/40 ${style.monthChip}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${style.swatch}`}
              />
              {!dragState.occ.event.allDay && (
                <span className="font-mono tabular-nums opacity-75 shrink-0">
                  {formatTimeShort(dragState.occ.startDate)}
                </span>
              )}
              <span className="truncate">{dragState.occ.event.summary}</span>
            </div>
          );
        })()}

      {/* Day Overflow Agenda Popover */}
      {expandedDay && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 dark:bg-black/65 backdrop-blur-[2px] p-4"
          onClick={() => setExpandedDay(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#141414] shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="font-display text-sm font-semibold text-neutral-900 dark:text-white">
                {expandedDay.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </h3>
              <button
                type="button"
                onClick={() => setExpandedDay(null)}
                className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {expandedDayOccurrences.map((occ) => {
                const cal = calendarMap.get(occ.event.calendarId);
                const style = FOLDER_COLOR_STYLES[cal?.color ?? 'slate'];
                return (
                  <button
                    key={occ.occurrenceId}
                    type="button"
                    onClick={() => {
                      setExpandedDay(null);
                      onSelectOccurrence(occ);
                    }}
                    onContextMenu={(e) => onEventContextMenu?.(e, occ)}
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
                        : `${formatTimeShort(occ.startDate)}`}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  const target = expandedDay;
                  setExpandedDay(null);
                  onCreateAt(target, 9, false);
                }}
                className="px-3.5 py-1.5 text-xs font-medium rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-950 transition-colors"
              >
                Add Event on This Day
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
