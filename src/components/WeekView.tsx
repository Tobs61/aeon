import { useEffect, useMemo, useRef, useState } from 'react';
import { FOLDER_COLOR_STYLES } from '../lib/colors.ts';
import {
  addDays,
  endOfDay,
  formatHourLabel,
  formatTimeShort,
  isSameDay,
  startOfDay,
  startOfWeek,
  toDateInputString,
} from '../lib/dateUtils.ts';
import { expandEventsInRange } from '../lib/ics.ts';
import type {
  FirstDayOfWeek,
  IcsCalendar,
  IcsEvent,
  IcsOccurrence,
} from '../types/calendar.ts';

interface WeekViewProps {
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
}

const HOUR_HEIGHT = 56;
const SNAP_MINUTES = 15;
const MIN_DURATION_MINUTES = 15;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface PositionedOccurrence {
  occ: IcsOccurrence;
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
  topPx: number;
  heightPx: number;
  colIndex: number;
  totalCols: number;
}

type DragMode = 'move' | 'resize-start' | 'resize-end';

interface DragInteraction {
  mode: DragMode;
  occ: IcsOccurrence;
  originX: number;
  originY: number;
  hasMoved: boolean;
  origDayIndex: number;
  origStartMinutes: number;
  origEndMinutes: number;
  grabOffsetMinutes: number;
  currentDayIndex: number;
  currentStartMinutes: number;
  currentEndMinutes: number;
}

interface AllDayDragState {
  occ: IcsOccurrence;
  originX: number;
  originY: number;
  clientX: number;
  clientY: number;
  hasMoved: boolean;
  origDayKey: string;
  hoverDayKey: string | null;
}

function snapMinutes(mins: number): number {
  return Math.round(mins / SNAP_MINUTES) * SNAP_MINUTES;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function minutesToTimeLabel(totalMinutes: number): string {
  const clamped = clamp(totalMinutes, 0, 24 * 60);
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function findAllDayDropKey(x: number, y: number): string | null {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    const key = (el as HTMLElement).dataset?.alldayDrop;
    if (key) return key;
  }
  return null;
}

function layoutDayOccurrences(
  dayIndex: number,
  dayStart: Date,
  occurrences: IcsOccurrence[]
): PositionedOccurrence[] {
  const dayEnd = endOfDay(dayStart);
  const items = occurrences
    .map((occ) => {
      const clampedStart =
        occ.startDate < dayStart ? dayStart : occ.startDate;
      const clampedEnd = occ.endDate > dayEnd ? dayEnd : occ.endDate;
      const startMinutes =
        clampedStart.getHours() * 60 + clampedStart.getMinutes();
      const endMinutes = Math.max(
        startMinutes + 25,
        clampedEnd.getHours() * 60 +
          clampedEnd.getMinutes() +
          (clampedEnd.getDate() !== clampedStart.getDate() ? 24 * 60 : 0)
      );
      return {
        occ,
        startMinutes,
        endMinutes: Math.min(24 * 60, endMinutes),
      };
    })
    .sort(
      (a, b) =>
        a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes
    );

  const positioned: PositionedOccurrence[] = [];
  let cluster: typeof items = [];
  let clusterMaxEnd = -1;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const colsEnd: number[] = [];
    const assignedCols: number[] = [];

    for (const item of cluster) {
      let col = colsEnd.findIndex((endMin) => endMin <= item.startMinutes);
      if (col === -1) {
        col = colsEnd.length;
        colsEnd.push(item.endMinutes);
      } else {
        colsEnd[col] = item.endMinutes;
      }
      assignedCols.push(col);
    }

    const totalCols = Math.max(1, colsEnd.length);
    cluster.forEach((item, idx) => {
      const topPx = (item.startMinutes / 60) * HOUR_HEIGHT;
      const heightPx = Math.max(
        24,
        ((item.endMinutes - item.startMinutes) / 60) * HOUR_HEIGHT
      );
      positioned.push({
        occ: item.occ,
        dayIndex,
        startMinutes: item.startMinutes,
        endMinutes: item.endMinutes,
        topPx,
        heightPx,
        colIndex: assignedCols[idx],
        totalCols,
      });
    });

    cluster = [];
    clusterMaxEnd = -1;
  };

  for (const item of items) {
    if (cluster.length > 0 && item.startMinutes >= clusterMaxEnd) {
      flushCluster();
    }
    cluster.push(item);
    clusterMaxEnd = Math.max(clusterMaxEnd, item.endMinutes);
  }
  flushCluster();

  return positioned;
}

export function WeekView({
  activeDate,
  firstDayOfWeek,
  events,
  calendars,
  onSelectOccurrence,
  onCreateAt,
  onUpdateEventTiming,
}: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridColumnsRef = useRef<HTMLDivElement>(null);
  const suppressSlotClickUntilRef = useRef<number>(0);

  const [interaction, setInteraction] = useState<DragInteraction | null>(null);
  const interactionRef = useRef<DragInteraction | null>(null);
  interactionRef.current = interaction;

  const [allDayDrag, setAllDayDrag] = useState<AllDayDragState | null>(null);
  const allDayDragRef = useRef<AllDayDragState | null>(null);
  allDayDragRef.current = allDayDrag;

  const weekStart = useMemo(
    () => startOfWeek(activeDate, firstDayOfWeek),
    [activeDate, firstDayOfWeek]
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const calendarMap = useMemo(() => {
    const m = new Map<string, IcsCalendar>();
    calendars.forEach((c) => m.set(c.id, c));
    return m;
  }, [calendars]);

  const occurrences = useMemo(() => {
    const rangeStart = startOfDay(weekDays[0]);
    const rangeEnd = endOfDay(weekDays[6]);
    return expandEventsInRange(events, rangeStart, rangeEnd);
  }, [events, weekDays]);

  const allDayOccs = useMemo(
    () => occurrences.filter((o) => o.event.allDay),
    [occurrences]
  );
  const timedOccs = useMemo(
    () => occurrences.filter((o) => !o.event.allDay),
    [occurrences]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT - 16;
    }
  }, []);

  // Pointer drag & resize for timed events
  const isInteracting = interaction !== null;
  useEffect(() => {
    if (!isInteracting) return;

    const handlePointerMove = (e: PointerEvent) => {
      const current = interactionRef.current;
      const container = gridColumnsRef.current;
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

      let nextDayIndex = current.currentDayIndex;
      let nextStart = current.currentStartMinutes;
      let nextEnd = current.currentEndMinutes;

      if (current.mode === 'move') {
        const col = Math.floor(((e.clientX - rect.left) / rect.width) * 7);
        nextDayIndex = clamp(col, 0, 6);
        const duration = current.origEndMinutes - current.origStartMinutes;
        const maxStart = Math.max(0, 24 * 60 - duration);
        nextStart = clamp(
          snapMinutes(pointerMinutes - current.grabOffsetMinutes),
          0,
          maxStart
        );
        nextEnd = Math.min(24 * 60, nextStart + duration);
      } else if (current.mode === 'resize-start') {
        nextDayIndex = current.origDayIndex;
        nextEnd = current.origEndMinutes;
        nextStart = clamp(
          pointerMinutes,
          0,
          nextEnd - MIN_DURATION_MINUTES
        );
      } else if (current.mode === 'resize-end') {
        nextDayIndex = current.origDayIndex;
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
              currentDayIndex: nextDayIndex,
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
        current.currentDayIndex !== current.origDayIndex ||
        current.currentStartMinutes !== current.origStartMinutes ||
        current.currentEndMinutes !== current.origEndMinutes;

      if (!changed) return;

      const targetDay = weekDays[current.currentDayIndex];
      const newStart = new Date(targetDay);
      newStart.setHours(
        Math.floor(current.currentStartMinutes / 60),
        current.currentStartMinutes % 60,
        0,
        0
      );

      const newEnd = new Date(targetDay);
      if (current.currentEndMinutes >= 24 * 60) {
        newEnd.setHours(23, 59, 0, 0);
      } else {
        newEnd.setHours(
          Math.floor(current.currentEndMinutes / 60),
          current.currentEndMinutes % 60,
          0,
          0
        );
      }

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
  }, [isInteracting, onSelectOccurrence, onUpdateEventTiming, weekDays]);

  // Pointer drag for all-day events across days
  const isAllDayDragging = allDayDrag !== null;
  useEffect(() => {
    if (!isAllDayDragging) return;

    const handleMove = (e: PointerEvent) => {
      const curr = allDayDragRef.current;
      if (!curr) return;
      const dist = Math.hypot(
        e.clientX - curr.originX,
        e.clientY - curr.originY
      );
      const hasMoved = curr.hasMoved || dist > 5;
      const hoverDayKey = hasMoved
        ? findAllDayDropKey(e.clientX, e.clientY)
        : null;

      setAllDayDrag((prev) =>
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
      const curr = allDayDragRef.current;
      setAllDayDrag(null);
      if (!curr) return;

      if (curr.hasMoved) {
        suppressSlotClickUntilRef.current = Date.now() + 250;
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
  }, [isAllDayDragging, onSelectOccurrence, onUpdateEventTiming]);

  const startDragInteraction = (
    e: React.PointerEvent,
    mode: DragMode,
    item: PositionedOccurrence
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const container = gridColumnsRef.current;
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
      origDayIndex: item.dayIndex,
      origStartMinutes: item.startMinutes,
      origEndMinutes: item.endMinutes,
      grabOffsetMinutes,
      currentDayIndex: item.dayIndex,
      currentStartMinutes: item.startMinutes,
      currentEndMinutes: item.endMinutes,
    });
  };

  const today = new Date();
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const nowTopPx = (nowMinutes / 60) * HOUR_HEIGHT;

  return (
    <div
      className={`flex flex-1 flex-col min-h-0 bg-white dark:bg-[#0a0a0a] ${
        interaction || allDayDrag ? 'select-none' : ''
      }`}
    >
      {/* Weekday Header Row + All-Day Strip */}
      <div className="shrink-0">
        <div className="grid grid-cols-[56px_1fr] sm:grid-cols-[64px_1fr] border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#111111]">
          <div className="border-r border-neutral-200 dark:border-neutral-800 flex items-end justify-end pr-2 pb-2">
            <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
              Local
            </span>
          </div>

          <div className="grid grid-cols-7">
            {weekDays.map((day) => {
              const isToday = isSameDay(day, today);
              const weekdayName = day.toLocaleDateString('en-US', {
                weekday: 'short',
              });
              return (
                <div
                  key={day.toISOString()}
                  className="flex items-center justify-center gap-1.5 py-2.5 border-r last:border-r-0 border-neutral-200 dark:border-neutral-800"
                >
                  <span
                    className={`text-xs font-medium ${
                      isToday
                        ? 'text-neutral-900 dark:text-white'
                        : 'text-neutral-500 dark:text-neutral-400'
                    }`}
                  >
                    {weekdayName}
                  </span>
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                      isToday
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950'
                        : 'text-neutral-800 dark:text-neutral-200'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* All-Day Strip */}
        <div className="grid grid-cols-[56px_1fr] sm:grid-cols-[64px_1fr] border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-[#0e0e0e]">
          <div className="border-r border-neutral-200 dark:border-neutral-800 px-2 py-1.5 flex items-center justify-end">
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
              All day
            </span>
          </div>
          <div className="grid grid-cols-7">
            {weekDays.map((day) => {
              const dayKey = toDateInputString(day);
              const dStart = startOfDay(day);
              const dEnd = endOfDay(day);
              const dayAllDay = allDayOccs.filter(
                (o) => o.startDate <= dEnd && o.endDate > dStart
              );
              const isDropTarget =
                allDayDrag?.hasMoved && allDayDrag.hoverDayKey === dayKey;

              return (
                <div
                  key={dayKey}
                  data-allday-drop={dayKey}
                  onClick={() => {
                    if (Date.now() < suppressSlotClickUntilRef.current) return;
                    onCreateAt(day, 9, true);
                  }}
                  className={`min-h-[30px] p-1 border-r last:border-r-0 border-neutral-200 dark:border-neutral-800 space-y-1 cursor-pointer transition-colors ${
                    isDropTarget
                      ? 'bg-neutral-200/70 dark:bg-neutral-800/60 ring-1 ring-inset ring-neutral-500/50'
                      : 'hover:bg-neutral-100/70 dark:hover:bg-neutral-900/60'
                  }`}
                >
                  {dayAllDay.map((occ) => {
                    const cal = calendarMap.get(occ.event.calendarId);
                    const style = FOLDER_COLOR_STYLES[cal?.color ?? 'slate'];
                    const isDraggingThis =
                      allDayDrag?.hasMoved &&
                      allDayDrag.occ.occurrenceId === occ.occurrenceId;

                    return (
                      <div
                        key={occ.occurrenceId}
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setAllDayDrag({
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectOccurrence(occ);
                          }
                        }}
                        className={`touch-none select-none w-full text-left px-2 py-0.5 rounded-lg border text-[11px] font-medium truncate transition-opacity cursor-grab active:cursor-grabbing ${style.monthChip} ${
                          isDraggingThis ? 'opacity-40' : ''
                        }`}
                      >
                        {occ.event.summary}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Scrollable 24-Hour Time Grid */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto relative"
      >
        <div
          className="grid grid-cols-[56px_1fr] sm:grid-cols-[64px_1fr] relative"
          style={{ height: `${24 * HOUR_HEIGHT}px` }}
        >
          {/* Time Gutter */}
          <div className="border-r border-neutral-200 dark:border-neutral-800 relative select-none">
            {HOURS.map((hour) => (
              <div
                key={hour}
                style={{ height: `${HOUR_HEIGHT}px` }}
                className="relative pr-2 text-right"
              >
                {hour > 0 && (
                  <span className="text-[11px] font-mono tabular-nums text-neutral-400 dark:text-neutral-500 -translate-y-2 inline-block">
                    {formatHourLabel(hour)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 7 Day Columns */}
          <div ref={gridColumnsRef} className="grid grid-cols-7 relative">
            <div className="pointer-events-none absolute inset-0">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  className="border-b border-neutral-100 dark:border-neutral-900"
                />
              ))}
            </div>

            {weekDays.map((day, dayIdx) => {
              const dStart = startOfDay(day);
              const dEnd = endOfDay(day);
              const dayEvents = timedOccs.filter(
                (o) => o.startDate < dEnd && o.endDate > dStart
              );
              const positioned = layoutDayOccurrences(dayIdx, dStart, dayEvents);
              const isToday = isSameDay(day, today);

              const activePreviewHere =
                interaction &&
                interaction.hasMoved &&
                interaction.currentDayIndex === dayIdx;

              return (
                <div
                  key={day.toISOString()}
                  className={`relative border-r last:border-r-0 border-neutral-200 dark:border-neutral-800 ${
                    activePreviewHere
                      ? 'bg-neutral-100/70 dark:bg-neutral-900/50'
                      : ''
                  }`}
                >
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      onClick={() => {
                        if (Date.now() < suppressSlotClickUntilRef.current) {
                          return;
                        }
                        onCreateAt(day, hour, false);
                      }}
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
                    const isCompact = item.heightPx < 42;

                    return (
                      <div
                        key={occ.occurrenceId}
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) =>
                          startDragInteraction(e, 'move', item)
                        }
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectOccurrence(occ);
                          }
                        }}
                        style={{
                          top: `${item.topPx + 1}px`,
                          height: `${Math.max(22, item.heightPx - 2)}px`,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                        }}
                        className={`touch-none select-none group absolute z-10 text-left rounded-lg border px-2 py-1 overflow-hidden transition-colors cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/60 ${style.eventSurface}`}
                      >
                        {/* Top Resize Handle */}
                        <div
                          onPointerDown={(e) =>
                            startDragInteraction(e, 'resize-start', item)
                          }
                          title="Drag to adjust start time"
                          className="touch-none absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-20 flex items-start justify-center"
                        >
                          <span className="mt-0.5 h-0.5 w-6 rounded-full bg-current opacity-0 group-hover:opacity-35 transition-opacity" />
                        </div>

                        {isCompact ? (
                          <div className="flex items-center gap-1.5 text-[11px] leading-tight truncate pointer-events-none">
                            <span className="font-mono tabular-nums opacity-75 shrink-0">
                              {formatTimeShort(occ.startDate)}
                            </span>
                            <span className="font-medium truncate">
                              {occ.event.summary}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col h-full justify-start pointer-events-none">
                            <div className="text-xs font-medium leading-snug truncate">
                              {occ.event.summary}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums opacity-75 truncate">
                              {formatTimeShort(occ.startDate)}–
                              {formatTimeShort(occ.endDate)}
                            </div>
                            {item.heightPx >= 64 && occ.event.location && (
                              <div className="text-[11px] opacity-70 truncate mt-0.5">
                                {occ.event.location}
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
                          <span className="mb-0.5 h-0.5 w-6 rounded-full bg-current opacity-0 group-hover:opacity-35 transition-opacity" />
                        </div>
                      </div>
                    );
                  })}

                  {/* Live Drag / Resize Preview Block */}
                  {activePreviewHere &&
                    interaction &&
                    (() => {
                      const topPx =
                        (interaction.currentStartMinutes / 60) * HOUR_HEIGHT;
                      const heightPx = Math.max(
                        22,
                        ((interaction.currentEndMinutes -
                          interaction.currentStartMinutes) /
                          60) *
                          HOUR_HEIGHT
                      );
                      const cal = calendarMap.get(
                        interaction.occ.event.calendarId
                      );
                      const style = FOLDER_COLOR_STYLES[cal?.color ?? 'slate'];

                      return (
                        <div
                          style={{
                            top: `${topPx + 1}px`,
                            height: `${heightPx - 2}px`,
                            left: '2px',
                            width: 'calc(100% - 4px)',
                          }}
                          className={`pointer-events-none absolute z-30 rounded-lg border px-2 py-1 overflow-hidden shadow-md ring-2 ring-neutral-500/45 ${style.eventSurface}`}
                        >
                          <div className="text-xs font-medium leading-snug truncate">
                            {interaction.occ.event.summary}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums opacity-85 truncate">
                            {minutesToTimeLabel(
                              interaction.currentStartMinutes
                            )}
                            –
                            {minutesToTimeLabel(interaction.currentEndMinutes)}
                          </div>
                        </div>
                      );
                    })()}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Ghost for All-Day Drag */}
      {allDayDrag?.hasMoved &&
        (() => {
          const cal = calendarMap.get(allDayDrag.occ.event.calendarId);
          const style = FOLDER_COLOR_STYLES[cal?.color ?? 'slate'];
          return (
            <div
              style={{
                left: `${allDayDrag.clientX + 10}px`,
                top: `${allDayDrag.clientY + 10}px`,
              }}
              className={`pointer-events-none fixed z-50 max-w-[180px] rounded-lg border px-2.5 py-1 text-[11px] font-medium shadow-lg ring-2 ring-neutral-500/40 truncate ${style.monthChip}`}
            >
              {allDayDrag.occ.event.summary}
            </div>
          );
        })()}
    </div>
  );
}
