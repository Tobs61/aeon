import { addDays, endOfDay, parseDateInputString } from './dateUtils.ts';
import type { IcsOccurrence } from '../types/calendar.ts';

export const SNAP_MINUTES = 15;
export const MIN_DURATION_MINUTES = 15;
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

export type DragMode = 'move' | 'resize-start' | 'resize-end';

export interface PositionedTimedOccurrence {
  occ: IcsOccurrence;
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
  topPx: number;
  heightPx: number;
  colIndex: number;
  totalCols: number;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function snapMinutes(mins: number, step = SNAP_MINUTES): number {
  return Math.round(mins / step) * step;
}

export function minutesToTimeLabel(totalMinutes: number): string {
  const clamped = clamp(totalMinutes, 0, 24 * 60);
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function minutesRangeToDates(
  dayStart: Date,
  startMinutes: number,
  endMinutes: number
): { start: Date; end: Date } {
  const start = new Date(dayStart);
  start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

  const end = new Date(dayStart);
  if (endMinutes >= 24 * 60) {
    end.setHours(23, 59, 0, 0);
  } else {
    end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
  }

  return { start, end };
}

export function layoutTimedOccurrences(
  dayIndex: number,
  dayStart: Date,
  occurrences: IcsOccurrence[],
  hourHeight: number,
  minHeightPx: number
): PositionedTimedOccurrence[] {
  const dayEnd = endOfDay(dayStart);
  const items = occurrences
    .map((occ) => {
      const clampedStart = occ.startDate < dayStart ? dayStart : occ.startDate;
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
      (a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes
    );

  const positioned: PositionedTimedOccurrence[] = [];
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
      const topPx = (item.startMinutes / 60) * hourHeight;
      const heightPx = Math.max(
        minHeightPx,
        ((item.endMinutes - item.startMinutes) / 60) * hourHeight
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

export function findDropDatasetKey(
  x: number,
  y: number,
  datasetKey: 'monthDrop' | 'alldayDrop'
): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const key = (el as HTMLElement).dataset?.[datasetKey];
    if (key) return key;
  }
  return null;
}

export function shiftOccurrenceByDayKeys(
  occ: IcsOccurrence,
  origDayKey: string,
  targetDayKey: string
): { start: Date; end: Date } | null {
  if (!targetDayKey || targetDayKey === origDayKey) return null;
  const targetStart = parseDateInputString(targetDayKey);
  const origStart = parseDateInputString(origDayKey);
  const diffDays = Math.round(
    (targetStart.getTime() - origStart.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (diffDays === 0) return null;
  return {
    start: addDays(occ.startDate, diffDays),
    end: addDays(occ.endDate, diffDays),
  };
}
