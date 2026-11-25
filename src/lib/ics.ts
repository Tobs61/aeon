import { parseRruleParts } from './dateUtils.ts';
import type { FolderSource, IcsEvent, IcsOccurrence } from '../types/calendar.ts';

interface ParseMeta {
  calendarId: string;
  fileName: string;
  relativePath: string;
  source: FolderSource;
}

export function generateEventUid(): string {
  return `aeon-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}@local`;
}

export interface SerializableVEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
  rrule?: string;
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  categories?: string[];
}

function unfoldLines(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.split('\n');
  const unfolded: string[] = [];

  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let idx = 0;
  chunks.push(line.slice(0, 75));
  idx = 75;
  while (idx < line.length) {
    chunks.push(' ' + line.slice(idx, idx + 74));
    idx += 74;
  }
  return chunks.join('\r\n');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseIcsDateValue(
  rawValue: string,
  params: Record<string, string>
): { iso: string; allDay: boolean } {
  const val = rawValue.trim();
  const isDateOnly = params.VALUE === 'DATE' || /^\d{8}$/.test(val);

  if (isDateOnly && /^\d{8}$/.test(val)) {
    const y = val.slice(0, 4);
    const m = val.slice(4, 6);
    const d = val.slice(6, 8);
    return { iso: `${y}-${m}-${d}`, allDay: true };
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i.exec(val);
  if (match) {
    const [, y, m, d, hh, mm, ss, zFlag] = match;
    if (zFlag) {
      const utcDate = new Date(
        Date.UTC(
          Number(y),
          Number(m) - 1,
          Number(d),
          Number(hh),
          Number(mm),
          Number(ss)
        )
      );
      return {
        iso: `${utcDate.getFullYear()}-${pad2(utcDate.getMonth() + 1)}-${pad2(
          utcDate.getDate()
        )}T${pad2(utcDate.getHours())}:${pad2(utcDate.getMinutes())}:${pad2(
          utcDate.getSeconds()
        )}`,
        allDay: false,
      };
    }
    return {
      iso: `${y}-${m}-${d}T${hh}:${mm}:${ss}`,
      allDay: false,
    };
  }

  const parsed = new Date(val);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      iso: `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(
        parsed.getDate()
      )}T${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}:${pad2(
        parsed.getSeconds()
      )}`,
      allDay: false,
    };
  }

  const now = new Date();
  return {
    iso: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(
      now.getDate()
    )}T09:00:00`,
    allDay: false,
  };
}

function parseIsoDurationMs(duration: string): number {
  const match =
    /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(
      duration.trim()
    );
  if (!match) return 60 * 60 * 1000;
  const weeks = Number(match[1] || 0);
  const days = Number(match[2] || 0);
  const hours = Number(match[3] || 0);
  const mins = Number(match[4] || 0);
  const secs = Number(match[5] || 0);
  return (
    ((weeks * 7 + days) * 86400 + hours * 3600 + mins * 60 + secs) * 1000
  );
}

export function isoToLocalDate(iso: string, allDay: boolean): Date {
  if (allDay || /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  }
  const [datePart, timePart = '00:00:00'] = iso.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = timePart.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0, 0);
}

export function dateToIsoLocal(date: Date, allDay: boolean): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  if (allDay) return `${y}-${m}-${d}`;
  return `${y}-${m}-${d}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
    date.getSeconds()
  )}`;
}

export function parseIcsContent(raw: string, meta: ParseMeta): IcsEvent[] {
  const lines = unfoldLines(raw);
  const events: IcsEvent[] = [];

  let inEvent = false;
  let currentProps: Record<
    string,
    { value: string; params: Record<string, string> }
  > = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentProps = {};
      continue;
    }

    if (line === 'END:VEVENT') {
      if (inEvent) {
        const evt = buildEventFromProps(currentProps, raw, meta);
        if (evt) events.push(evt);
      }
      inEvent = false;
      currentProps = {};
      continue;
    }

    if (!inEvent) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const left = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1);
    const parts = left.split(';');
    const propName = parts[0].toUpperCase();
    const params: Record<string, string> = {};

    for (let i = 1; i < parts.length; i++) {
      const eqIdx = parts[i].indexOf('=');
      if (eqIdx !== -1) {
        const k = parts[i].slice(0, eqIdx).toUpperCase();
        const v = parts[i].slice(eqIdx + 1).replace(/^"|"$/g, '');
        params[k] = v;
      }
    }

    currentProps[propName] = { value, params };
  }

  return events;
}

function buildEventFromProps(
  props: Record<string, { value: string; params: Record<string, string> }>,
  rawIcs: string,
  meta: ParseMeta
): IcsEvent | null {
  if (!props.DTSTART) return null;

  const startParsed = parseIcsDateValue(
    props.DTSTART.value,
    props.DTSTART.params
  );
  let endIso: string;

  if (props.DTEND) {
    const endParsed = parseIcsDateValue(
      props.DTEND.value,
      props.DTEND.params
    );
    endIso = endParsed.iso;
  } else if (props.DURATION) {
    const startDate = isoToLocalDate(startParsed.iso, startParsed.allDay);
    const ms = parseIsoDurationMs(props.DURATION.value);
    const endDate = new Date(startDate.getTime() + ms);
    endIso = dateToIsoLocal(endDate, startParsed.allDay);
  } else {
    const startDate = isoToLocalDate(startParsed.iso, startParsed.allDay);
    if (startParsed.allDay) {
      const nextDay = new Date(startDate);
      nextDay.setDate(nextDay.getDate() + 1);
      endIso = dateToIsoLocal(nextDay, true);
    } else {
      const oneHour = new Date(startDate.getTime() + 60 * 60 * 1000);
      endIso = dateToIsoLocal(oneHour, false);
    }
  }

  const uid = props.UID?.value?.trim() || `${meta.fileName}-${startParsed.iso}`;
  const summary = props.SUMMARY
    ? unescapeIcsText(props.SUMMARY.value.trim())
    : '(Untitled Event)';
  const description = props.DESCRIPTION
    ? unescapeIcsText(props.DESCRIPTION.value)
    : undefined;
  const location = props.LOCATION
    ? unescapeIcsText(props.LOCATION.value)
    : undefined;
  const categories = props.CATEGORIES
    ? props.CATEGORIES.value
        .split(',')
        .map((c) => unescapeIcsText(c.trim()))
        .filter(Boolean)
    : undefined;

  const rawStatus = props.STATUS?.value?.trim().toUpperCase();
  const status =
    rawStatus === 'TENTATIVE' || rawStatus === 'CANCELLED'
      ? rawStatus
      : 'CONFIRMED';

  return {
    uid,
    summary,
    description,
    location,
    start: startParsed.iso,
    end: endIso,
    allDay: startParsed.allDay,
    rrule: props.RRULE?.value?.trim(),
    categories,
    status,
    calendarId: meta.calendarId,
    fileName: meta.fileName,
    relativePath: meta.relativePath,
    rawIcs,
    source: meta.source,
  };
}

function formatIcsDateTime(iso: string, allDay: boolean): string {
  if (allDay) {
    return iso.slice(0, 10).replace(/-/g, '');
  }
  const dt = isoToLocalDate(iso, false);
  return `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(
    dt.getDate()
  )}T${pad2(dt.getHours())}${pad2(dt.getMinutes())}${pad2(dt.getSeconds())}`;
}

function formatUtcStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(
    date.getUTCDate()
  )}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(
    date.getUTCSeconds()
  )}Z`;
}

function buildVEventLines(event: SerializableVEvent): string[] {
  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${formatUtcStamp(new Date())}`,
  ];

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDateTime(event.start, true)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDateTime(event.end, true)}`);
  } else {
    lines.push(`DTSTART:${formatIcsDateTime(event.start, false)}`);
    lines.push(`DTEND:${formatIcsDateTime(event.end, false)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(event.summary)}`);

  if (event.location?.trim()) {
    lines.push(`LOCATION:${escapeIcsText(event.location.trim())}`);
  }
  if (event.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description.trim())}`);
  }
  if (event.categories && event.categories.length > 0) {
    lines.push(
      `CATEGORIES:${event.categories.map((c) => escapeIcsText(c)).join(',')}`
    );
  }
  if (event.status) {
    lines.push(`STATUS:${event.status}`);
  }
  if (event.rrule?.trim()) {
    lines.push(`RRULE:${event.rrule.trim()}`);
  }

  lines.push('END:VEVENT');
  return lines;
}

export function serializeEventToIcs(event: SerializableVEvent): string {
  return serializeCalendarEventsToIcs([event]);
}

export function serializeCalendarEventsToIcs(
  events: SerializableVEvent[],
  calendarName?: string
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aeon Calendar//Debian Local ICS 1.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (calendarName?.trim()) {
    lines.push(`X-WR-CALNAME:${escapeIcsText(calendarName.trim())}`);
  }
  for (const evt of events) {
    lines.push(...buildVEventLines(evt));
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

function toSerializableVEvent(item: IcsEvent): SerializableVEvent {
  return {
    uid: item.uid,
    summary: item.summary,
    description: item.description,
    location: item.location,
    start: item.start,
    end: item.end,
    allDay: item.allDay,
    rrule: item.rrule,
    status: item.status,
    categories: item.categories,
  };
}

function parseRawEvents(raw: string): IcsEvent[] {
  return parseIcsContent(raw, {
    calendarId: 'tmp',
    fileName: 'tmp.ics',
    relativePath: 'tmp.ics',
    source: 'workspace',
  });
}

/**
 * Inserts or updates a VEVENT (by UID) inside an existing .ics file's text,
 * preserving all other VEVENT blocks.
 */
export function upsertEventInIcsContent(
  existingRaw: string | null,
  event: SerializableVEvent
): string {
  if (!existingRaw || !existingRaw.includes('BEGIN:VCALENDAR')) {
    return serializeCalendarEventsToIcs([event]);
  }

  const parsedExisting = parseRawEvents(existingRaw);
  const updatedList: SerializableVEvent[] = [];
  let replaced = false;

  for (const item of parsedExisting) {
    if (item.uid === event.uid) {
      updatedList.push(event);
      replaced = true;
    } else {
      updatedList.push(toSerializableVEvent(item));
    }
  }
  if (!replaced) {
    updatedList.push(event);
  }

  return serializeCalendarEventsToIcs(updatedList);
}

/**
 * Removes a single VEVENT (by UID) from a modular .ics calendar file,
 * keeping all remaining events intact.
 */
export function removeEventFromIcsContent(
  existingRaw: string,
  uid: string
): string {
  const remaining = parseRawEvents(existingRaw)
    .filter((item) => item.uid !== uid)
    .map(toSerializableVEvent);

  return serializeCalendarEventsToIcs(remaining);
}

export function slugifyIcsFilename(name: string): string {
  const base = name
    .replace(/\.ics$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'calendar'}.ics`;
}

const WEEKDAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

export function updateRruleWeekday(
  rrule: string,
  oldDate: Date,
  newDate: Date
): { rrule: string; multiDayByDay: boolean } {
  const oldCode = WEEKDAY_CODES[oldDate.getDay()];
  const newCode = WEEKDAY_CODES[newDate.getDay()];

  const segments = rrule.split(';').filter(Boolean);
  let multiDayByDay = false;

  if (oldCode === newCode) {
    const byDaySeg = segments.find((s) =>
      s.toUpperCase().startsWith('BYDAY=')
    );
    if (byDaySeg && byDaySeg.split('=')[1]?.includes(',')) {
      multiDayByDay = true;
    }
    return { rrule, multiDayByDay };
  }

  const nextSegments = segments.map((seg) => {
    const eqIdx = seg.indexOf('=');
    if (eqIdx === -1) return seg;
    const key = seg.slice(0, eqIdx).toUpperCase();
    const val = seg.slice(eqIdx + 1).toUpperCase();
    if (key !== 'BYDAY') return seg;

    const days = val.split(',').filter(Boolean);
    multiDayByDay = days.length > 1;
    const updatedDays: string[] = [];
    for (const d of days) {
      const code = d.slice(-2);
      const prefix = d.slice(0, -2);
      const mapped = code === oldCode ? `${prefix}${newCode}` : d;
      if (!updatedDays.includes(mapped)) {
        updatedDays.push(mapped);
      }
    }
    if (!updatedDays.some((d) => d.endsWith(newCode))) {
      updatedDays.push(newCode);
    }
    return `BYDAY=${updatedDays.join(',')}`;
  });

  return { rrule: nextSegments.join(';'), multiDayByDay };
}

export function expandEventsInRange(
  events: IcsEvent[],
  rangeStart: Date,
  rangeEnd: Date
): IcsOccurrence[] {
  const occurrences: IcsOccurrence[] = [];

  for (const event of events) {
    const baseStart = isoToLocalDate(event.start, event.allDay);
    let baseEnd = isoToLocalDate(event.end, event.allDay);

    if (event.allDay) {
      if (baseEnd.getTime() <= baseStart.getTime()) {
        baseEnd = new Date(baseStart);
        baseEnd.setDate(baseEnd.getDate() + 1);
      }
    } else if (baseEnd.getTime() <= baseStart.getTime()) {
      baseEnd = new Date(baseStart.getTime() + 30 * 60 * 1000);
    }

    const durationMs = baseEnd.getTime() - baseStart.getTime();

    if (!event.rrule) {
      if (baseEnd > rangeStart && baseStart < rangeEnd) {
        occurrences.push({
          occurrenceId: `${event.uid}::${event.start}`,
          event,
          startDate: baseStart,
          endDate: baseEnd,
          isRecurringInstance: false,
        });
      }
      continue;
    }

    const parts = parseRruleParts(event.rrule);

    const freq = parts.FREQ;
    const interval = Math.max(1, Number(parts.INTERVAL || 1));
    const countLimit = parts.COUNT ? Number(parts.COUNT) : 250;
    const untilDate = parts.UNTIL
      ? isoToLocalDate(
          parseIcsDateValue(parts.UNTIL, {}).iso,
          parts.UNTIL.length === 8
        )
      : null;
    if (untilDate && parts.UNTIL?.length === 8) {
      untilDate.setHours(23, 59, 59, 999);
    }

    const byDayNums = parts.BYDAY
      ? parts.BYDAY.split(',')
          .map((d) => WEEKDAY_MAP[d.slice(-2)])
          .filter((n) => n !== undefined)
      : null;

    let emitted = 0;
    let safety = 0;
    const maxSafety = 750;

    if (freq === 'WEEKLY' && byDayNums && byDayNums.length > 0) {
      const weekCursor = new Date(baseStart);
      weekCursor.setDate(weekCursor.getDate() - weekCursor.getDay());

      while (safety < maxSafety && emitted < countLimit) {
        safety++;
        for (let dow = 0; dow < 7; dow++) {
          if (!byDayNums.includes(dow)) continue;
          const occStart = new Date(weekCursor);
          occStart.setDate(occStart.getDate() + dow);
          occStart.setHours(
            baseStart.getHours(),
            baseStart.getMinutes(),
            baseStart.getSeconds(),
            0
          );

          if (occStart < baseStart) continue;
          if (untilDate && occStart > untilDate) {
            safety = maxSafety;
            break;
          }
          if (occStart > rangeEnd) {
            safety = maxSafety;
            break;
          }
          emitted++;
          if (emitted > countLimit) {
            safety = maxSafety;
            break;
          }
          const occEnd = new Date(occStart.getTime() + durationMs);
          if (occEnd > rangeStart && occStart < rangeEnd) {
            occurrences.push({
              occurrenceId: `${event.uid}::${occStart.toISOString()}`,
              event,
              startDate: occStart,
              endDate: occEnd,
              isRecurringInstance: occStart.getTime() !== baseStart.getTime(),
            });
          }
        }
        weekCursor.setDate(weekCursor.getDate() + 7 * interval);
      }
      continue;
    }

    const cursor = new Date(baseStart);
    while (safety < maxSafety && emitted < countLimit) {
      safety++;
      if (untilDate && cursor > untilDate) break;
      if (cursor > rangeEnd) break;

      emitted++;
      const occStart = new Date(cursor);
      const occEnd = new Date(occStart.getTime() + durationMs);

      if (occEnd > rangeStart && occStart < rangeEnd) {
        occurrences.push({
          occurrenceId: `${event.uid}::${occStart.toISOString()}`,
          event,
          startDate: occStart,
          endDate: occEnd,
          isRecurringInstance: occStart.getTime() !== baseStart.getTime(),
        });
      }

      if (freq === 'DAILY') {
        cursor.setDate(cursor.getDate() + interval);
      } else if (freq === 'WEEKLY') {
        cursor.setDate(cursor.getDate() + 7 * interval);
      } else if (freq === 'MONTHLY') {
        cursor.setMonth(cursor.getMonth() + interval);
      } else if (freq === 'YEARLY') {
        cursor.setFullYear(cursor.getFullYear() + interval);
      } else {
        break;
      }
    }
  }

  return occurrences.sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  );
}
