import type { FirstDayOfWeek } from '../types/calendar.ts';

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfWeek(
  date: Date,
  firstDayOfWeek: FirstDayOfWeek = 1
): Date {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day - firstDayOfWeek + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function toDateInputString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toTimeInputString(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function parseDateInputString(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function draftEndToIcsEnd(
  endDate: string,
  endTime: string,
  allDay: boolean
): string {
  if (!allDay) {
    return `${endDate}T${endTime}:00`;
  }
  return toDateInputString(addDays(parseDateInputString(endDate), 1));
}

export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function formatTimeShort(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`;
}

export function formatWeekRangeTitle(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();

  if (sameMonth && sameYear) {
    const month = weekStart.toLocaleDateString('en-US', { month: 'long' });
    return `${month} ${weekStart.getDate()}–${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  }
  if (sameYear) {
    const m1 = weekStart.toLocaleDateString('en-US', { month: 'short' });
    const m2 = weekEnd.toLocaleDateString('en-US', { month: 'short' });
    return `${m1} ${weekStart.getDate()} – ${m2} ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  }
  const f1 = weekStart.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const f2 = weekEnd.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${f1} – ${f2}`;
}

export function formatDayTitle(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatMonthTitle(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function formatYearTitle(date: Date): string {
  return String(date.getFullYear());
}

export function getMonthGridDays(
  anchorDate: Date,
  firstDayOfWeek: FirstDayOfWeek = 1
): Date[] {
  const firstOfMonth = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    1
  );
  const gridStart = startOfWeek(firstOfMonth, firstDayOfWeek);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(gridStart, i));
  }
  return days;
}

const WEEKDAYS_SHORT_BASE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_NARROW_BASE = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function getOrderedWeekdays(
  firstDayOfWeek: FirstDayOfWeek,
  style: 'short' | 'narrow' = 'short'
): string[] {
  const src = style === 'narrow' ? WEEKDAYS_NARROW_BASE : WEEKDAYS_SHORT_BASE;
  const result: string[] = [];
  for (let i = 0; i < 7; i++) {
    result.push(src[(firstDayOfWeek + i) % 7]);
  }
  return result;
}

export function formatDurationHuman(start: Date, end: Date): string {
  const diffMins = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 60000)
  );
  if (diffMins < 60) return `${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

const DAY_CODE_LABELS: Record<string, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

export function parseRruleParts(rrule: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const seg of rrule.split(';')) {
    const eqIdx = seg.indexOf('=');
    if (eqIdx === -1) continue;
    const k = seg.slice(0, eqIdx).trim().toUpperCase();
    const v = seg.slice(eqIdx + 1).trim().toUpperCase();
    if (k && v) parts[k] = v;
  }
  return parts;
}

export function formatRruleHuman(rrule: string): string {
  const parts = parseRruleParts(rrule);

  const freq = parts.FREQ;
  const interval = Math.max(1, Number(parts.INTERVAL || 1));
  const byDay = parts.BYDAY
    ? parts.BYDAY.split(',')
        .map((d) => DAY_CODE_LABELS[d.slice(-2)] || d)
        .filter(Boolean)
    : [];

  if (freq === 'DAILY') {
    return interval === 1 ? 'Repeats daily' : `Repeats every ${interval} days`;
  }
  if (freq === 'WEEKLY') {
    if (
      parts.BYDAY === 'MO,TU,WE,TH,FR' &&
      interval === 1
    ) {
      return 'Repeats every weekday (Mon–Fri)';
    }
    if (byDay.length > 0) {
      const prefix =
        interval === 1 ? 'Repeats weekly on' : `Repeats every ${interval} weeks on`;
      return `${prefix} ${byDay.join(', ')}`;
    }
    return interval === 1 ? 'Repeats weekly' : `Repeats every ${interval} weeks`;
  }
  if (freq === 'MONTHLY') {
    return interval === 1
      ? 'Repeats monthly'
      : `Repeats every ${interval} months`;
  }
  if (freq === 'YEARLY') {
    return interval === 1 ? 'Repeats yearly' : `Repeats every ${interval} years`;
  }
  return `Repeats (${rrule})`;
}
