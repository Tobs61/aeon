import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clamp,
  type DragMode,
  HOURS,
  layoutTimedOccurrences,
  MIN_DURATION_MINUTES,
  minutesRangeToDates,
  minutesToTimeLabel,
  type PositionedTimedOccurrence,
  snapMinutes,
} from '../lib/calendarLayout.ts';
import { FOLDER_COLOR_STYLES } from '../lib/colors.ts';
import {
  endOfDay,
  formatHourLabel,
  formatTimeShort,
  isSameDay,
  startOfDay,
} from '../lib/dateUtils.ts';
import { expandEventsInRange } from '../lib/ics.ts';
import type {
  IcsCalendar,
  IcsEvent,
  IcsOccurrence,
} from '../types/calendar.ts';

interface DayViewProps {
  activeDate: Date;
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
}

const HOUR_HEIGHT = 60;

interface DragInteraction {
  mode: DragMode;
  occ: IcsOccurrence;
  originX: number;
  originY: number;
  hasMoved: boolean;
  origStartMinutes: number;
  origEndMinutes: number;
  grabOffsetMinutes: number;
  currentStartMinutes: number;
  currentEndMinutes: number;
}

export function DayView({
  activeDate,
  events,
  calendars,
  onSelectOccurrence,
  onCreateAt,
  onUpdateEventTiming,
  onEventContextMenu,
  onSlotContextMenu,
}: DayViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridColumnRef = useRef<HTMLDivElement>(null);
  const suppressSlotClickUntilRef = useRef<number>(0);

  const [interaction, setInteraction] = useState<DragInteraction | null>(null);
  const interactionRef = useRef<DragInteraction | null>(null);
  interactionRef.current = interaction;

  const calendarMap = useMemo(() => {
    const m = new Map<string, IcsCalendar>();
    calendars.forEach((c) => m.set(c.id, c));
    return m;
  }, [calendars]);

  const dayStart = useMemo(() => startOfDay(activeDate), [activeDate]);
  const dayEnd = useMemo(() => endOfDay(activeDate), [activeDate]);

  const occurrences = useMemo(
    () => expandEventsInRange(events, dayStart, dayEnd),
    [events, dayStart, dayEnd]
  );

  const allDayOccs = useMemo(
    () => occurrences.filter((o) => o.event.allDay),
    [occurrences]
  );
  const timedOccs = useMemo(
    () => occurrences.filter((o) => !o.event.allDay),
    [occurrences]
  );
  const positioned = useMemo(
    () => layoutTimedOccurrences(0, dayStart, timedOccs, HOUR_HEIGHT, 28),
    [dayStart, timedOccs]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT - 16;
    }
  }, []);

  const isInteracting = interaction !== null;
  useEffect(() => {
    if (!isInteracting) return;

    const handlePointerMove = (e: PointerEvent) => {
      const current = interactionRef.current;
      const container = gridColumnRef.current;
      if (!current || !container) return;

      const dist = Math.hypot(
        e.clientX - current.originX,
        e.clientY - current.originY
      );
      const hasMoved = current.hasMoved || dist > 4;

      const rect = container.getBoundingClientRect();
      const pointerMinutes = snapMinutes(
        ((e.clientY - rect.top) / HOUR_HEIGHT) * 60
      );

      let nextStart = current.currentStartMinutes;
      let nextEnd = current.currentEndMinutes;

      if (current.mode === 'move') {
        const duration = current.origEndMinutes - current.origStartMinutes;
        const maxStart = Math.max(0, 24 * 60 - duration);
        nextStart = clamp(
          snapMinutes(pointerMinutes - current.grabOffsetMinutes),
          0,
          maxStart
        );
        nextEnd = Math.min(24 * 60, nextStart + duration);
      } else if (current.mode === 'resize-start') {
        nextEnd = current.origEndMinutes;
        nextStart = clamp(
          pointerMinutes,
          0,
          nextEnd - MIN_DURATION_MINUTES
        );
      } else if (current.mode === 'resize-end') {
        nextStart = current.origStartMinutes;
        nextEnd = clamp(
          pointerMinutes,
          nextStart + MIN_DURATION_MINUTES,
          24 * 60
        );
      }

      setInteraction((prev) =>
        prev
          ? {
              ...prev,
              hasMoved,
              currentStartMinutes: nextStart,
              currentEndMinutes: nextEnd,
            }
          : null
      );
    };

    const handlePointerUp = () => {
      const current = interactionRef.current;
      setInteraction(null);
      if (!current) return;

      if (current.hasMoved) {
        suppressSlotClickUntilRef.current = Date.now() + 250;
      }

      if (!current.hasMoved && current.mode === 'move') {
        onSelectOccurrence(current.occ);
        return;
      }

      const changed =
        current.currentStartMinutes !== current.origStartMinutes ||
        current.currentEndMinutes !== current.origEndMinutes;
      if (!changed) return;

      const { start: newStart, end: newEnd } = minutesRangeToDates(
        dayStart,
        current.currentStartMinutes,
        current.currentEndMinutes
      );

      void onUpdateEventTiming(current.occ, newStart, newEnd);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dayStart, isInteracting, onSelectOccurrence, onUpdateEventTiming]);

  const startDragInteraction = (
    e: React.PointerEvent,
    mode: DragMode,
    item: PositionedTimedOccurrence
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const container = gridColumnRef.current;
    let grabOffsetMinutes = 0;
    if (container) {
      const rect = container.getBoundingClientRect();
      const pointerMins = ((e.clientY - rect.top) / HOUR_HEIGHT) * 60;
      grabOffsetMinutes = pointerMins - item.startMinutes;
    }

    setInteraction({
      mode,
      occ: item.occ,
      originX: e.clientX,
      originY: e.clientY,
      hasMoved: false,
      origStartMinutes: item.startMinutes,
      origEndMinutes: item.endMinutes,
      grabOffsetMinutes,
      currentStartMinutes: item.startMinutes,
      currentEndMinutes: item.endMinutes,
    });
  };

  const today = new Date();
  const isToday = isSameDay(activeDate, today);
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const nowTopPx = (nowMinutes / 60) * HOUR_HEIGHT;

  const weekdayLong = activeDate.toLocaleDateString('en-US', {
    weekday: 'long',
  });
  const totalCount = occurrences.length;

  return (
    <div
      className={`flex flex-1 flex-col min-h-0 bg-white dark:bg-[#0a0a0a] ${
        interaction ? 'select-none' : ''
      }`}
    >
      {/* Day Header & All-Day Strip */}
      <div className="shrink-0">
        <div className="grid grid-cols-[64px_1fr] border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#111111]">
          <div className="border-r border-neutral-200 dark:border-neutral-800 flex items-end justify-end pr-2.5 pb-2.5">
            <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
              Local
            </span>
          </div>

          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                  isToday
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950'
                    : 'bg-neutral-200/80 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
                }`}
              >
                {activeDate.getDate()}
              </span>
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-sm font-semibold text-neutral-900 dark:text-white">
                  {weekdayLong}
                </span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500 tabular-nums">
                  {totalCount} {totalCount === 1 ? 'event' : 'events'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* All-Day Strip */}
        <div className="grid grid-cols-[64px_1fr] border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-[#0e0e0e]">
          <div className="border-r border-neutral-200 dark:border-neutral-800 px-2.5 py-2 flex items-center justify-end">
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
              All day
            </span>
          </div>
          <div
            onClick={() => onCreateAt(activeDate, 9, true)}
            onContextMenu={(e) => onSlotContextMenu?.(e, activeDate, 9, true)}
            className="min-h-[36px] px-4 py-1.5 flex flex-wrap gap-1.5 cursor-pointer hover:bg-neutral-100/70 dark:hover:bg-neutral-900/60 transition-colors"
          >
            {allDayOccs.length === 0 ? (
              <span className="text-[11px] text-neutral-400 dark:text-neutral-600 self-center">
                Click to add an all-day event
              </span>
            ) : (
              allDayOccs.map((occ) => {
                const cal = calendarMap.get(occ.event.calendarId);
                const style = FOLDER_COLOR_STYLES[cal?.color ?? 'slate'];
                return (
                  <button
                    key={occ.occurrenceId}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectOccurrence(occ);
                    }}
                    onContextMenu={(e) => onEventContextMenu?.(e, occ)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${style.monthChip}`}
                  >
                    {occ.event.summary}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Scrollable 24-Hour Single Day Grid */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto relative"
      >
        <div
          className="grid grid-cols-[64px_1fr] relative"
          style={{ height: `${24 * HOUR_HEIGHT}px` }}
        >
          {/* Time Gutter */}
          <div className="border-r border-neutral-200 dark:border-neutral-800 relative select-none">
            {HOURS.map((hour) => (
              <div
                key={hour}
                style={{ height: `${HOUR_HEIGHT}px` }}
                className="relative pr-2.5 text-right"
              >
                {hour > 0 && (
                  <span className="text-[11px] font-mono tabular-nums text-neutral-400 dark:text-neutral-500 -translate-y-2 inline-block">
                    {formatHourLabel(hour)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Single Day Column */}
          <div ref={gridColumnRef} className="relative">
            <div className="pointer-events-none absolute inset-0">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  className="border-b border-neutral-100 dark:border-neutral-900"
                />
              ))}
            </div>

            {HOURS.map((hour) => (
              <div
                key={hour}
                style={{ height: `${HOUR_HEIGHT}px` }}
                onClick={() => {
                  if (Date.now() < suppressSlotClickUntilRef.current) return;
                  onCreateAt(activeDate, hour, false);
                }}
                onContextMenu={(e) =>
                  onSlotContextMenu?.(e, activeDate, hour, false)
                }
                className="hover:bg-neutral-100/70 dark:hover:bg-neutral-900/60 transition-colors cursor-pointer"
              />
            ))}

            {isToday && (
              <div
                style={{ top: `${nowTopPx}px` }}
                className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
              >
                <span className="h-2 w-2 -ml-1 rounded-full bg-neutral-900 dark:bg-white shrink-0" />
                <div className="h-px flex-1 bg-neutral-900/75 dark:bg-white/75" />
              </div>
            )}

            {/* Event Blocks */}
            {positioned.map((item) => {
              const { occ, colIndex, totalCols } = item;
              const isBeingManipulated =
                interaction &&
                interaction.hasMoved &&
                interaction.occ.occurrenceId === occ.occurrenceId;

              if (isBeingManipulated) return null;

              const cal = calendarMap.get(occ.event.calendarId);
              const style = FOLDER_COLOR_STYLES[cal?.color ?? 'slate'];
              const widthPct = 100 / totalCols;
              const leftPct = colIndex * widthPct;
              const isCompact = item.heightPx < 44;

              return (
                <div
                  key={occ.occurrenceId}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => startDragInteraction(e, 'move', item)}
                  onClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => onEventContextMenu?.(e, occ)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectOccurrence(occ);
                    }
                  }}
                  style={{
                    top: `${item.topPx + 2}px`,
                    height: `${Math.max(24, item.heightPx - 4)}px`,
                    left: `calc(${leftPct}% + 12px)`,
                    width: `calc(${widthPct}% - 24px)`,
                  }}
                  className={`touch-none select-none group absolute z-10 text-left rounded-xl border px-3.5 py-2 overflow-hidden transition-colors cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/60 ${style.eventSurface}`}
                >
                  {/* Top Resize Handle */}
                  <div
                    onPointerDown={(e) =>
                      startDragInteraction(e, 'resize-start', item)
                    }
                    title="Drag to adjust start time"
                    className="touch-none absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-20 flex items-start justify-center"
                  >
                    <span className="mt-0.5 h-0.5 w-8 rounded-full bg-current opacity-0 group-hover:opacity-30 transition-opacity" />
                  </div>

                  {isCompact ? (
                    <div className="flex items-center gap-2 text-xs leading-tight truncate pointer-events-none">
                      <span className="font-mono tabular-nums opacity-75 shrink-0">
                        {formatTimeShort(occ.startDate)}
                      </span>
                      <span className="font-medium truncate">
                        {occ.event.summary}
                      </span>
                      {occ.event.location && (
                        <span className="opacity-65 truncate">
                          · {occ.event.location}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col h-full justify-start pointer-events-none gap-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium leading-snug truncate">
                          {occ.event.summary}
                        </span>
                        <span className="text-xs font-mono tabular-nums opacity-75 shrink-0">
                          {formatTimeShort(occ.startDate)} –{' '}
                          {formatTimeShort(occ.endDate)}
                        </span>
                      </div>
                      {occ.event.location && (
                        <div className="text-xs opacity-75 truncate">
                          {occ.event.location}
                        </div>
                      )}
                      {item.heightPx >= 86 && occ.event.description && (
                        <div className="text-xs opacity-70 line-clamp-2 mt-0.5">
                          {occ.event.description}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bottom Resize Handle */}
                  <div
                    onPointerDown={(e) =>
                      startDragInteraction(e, 'resize-end', item)
                    }
                    title="Drag to adjust end time"
                    className="touch-none absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-20 flex items-end justify-center"
                  >
                    <span className="mb-0.5 h-0.5 w-8 rounded-full bg-current opacity-0 group-hover:opacity-30 transition-opacity" />
                  </div>
                </div>
              );
            })}

            {/* Live Drag / Resize Preview */}
            {interaction &&
              interaction.hasMoved &&
              (() => {
                const topPx =
                  (interaction.currentStartMinutes / 60) * HOUR_HEIGHT;
                const heightPx = Math.max(
                  26,
                  ((interaction.currentEndMinutes -
                    interaction.currentStartMinutes) /
                    60) *
                    HOUR_HEIGHT
                );
                const cal = calendarMap.get(interaction.occ.event.calendarId);
                const style = FOLDER_COLOR_STYLES[cal?.color ?? 'slate'];

                return (
                  <div
                    style={{
                      top: `${topPx + 2}px`,
                      height: `${heightPx - 4}px`,
                      left: '12px',
                      width: 'calc(100% - 24px)',
                    }}
                    className={`pointer-events-none absolute z-30 rounded-xl border px-3.5 py-2 overflow-hidden shadow-md ring-2 ring-neutral-500/40 ${style.eventSurface}`}
                  >
                    <div className="text-sm font-medium leading-snug truncate">
                      {interaction.occ.event.summary}
                    </div>
                    <div className="text-xs font-mono tabular-nums opacity-80 truncate">
                      {minutesToTimeLabel(interaction.currentStartMinutes)} –{' '}
                      {minutesToTimeLabel(interaction.currentEndMinutes)}
                    </div>
                  </div>
                );
              })()}
          </div>
        </div>
      </div>
    </div>
  );
}
