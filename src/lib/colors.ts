import type { FolderColorKey } from '../types/calendar.ts';

export interface FolderColorStyle {
  label: string;
  swatch: string;
  softDot: string;
  eventSurface: string;
  monthChip: string;
}

export const FOLDER_COLOR_STYLES: Record<FolderColorKey, FolderColorStyle> = {
  blue: {
    label: 'Sky',
    swatch: 'bg-sky-500/90 dark:bg-sky-400/90',
    softDot: 'bg-sky-400 dark:bg-sky-400',
    eventSurface:
      'bg-sky-50/90 hover:bg-sky-100/80 text-sky-900 border-sky-200/75 dark:bg-sky-950/45 dark:hover:bg-sky-900/50 dark:text-sky-100 dark:border-sky-800/55',
    monthChip:
      'bg-sky-50/85 text-sky-900 border-sky-200/70 hover:bg-sky-100/80 dark:bg-sky-950/45 dark:text-sky-100 dark:border-sky-800/50 dark:hover:bg-sky-900/50',
  },
  emerald: {
    label: 'Sage',
    swatch: 'bg-emerald-500/90 dark:bg-emerald-400/90',
    softDot: 'bg-emerald-400 dark:bg-emerald-400',
    eventSurface:
      'bg-emerald-50/90 hover:bg-emerald-100/80 text-emerald-900 border-emerald-200/75 dark:bg-emerald-950/45 dark:hover:bg-emerald-900/50 dark:text-emerald-100 dark:border-emerald-800/55',
    monthChip:
      'bg-emerald-50/85 text-emerald-900 border-emerald-200/70 hover:bg-emerald-100/80 dark:bg-emerald-950/45 dark:text-emerald-100 dark:border-emerald-800/50 dark:hover:bg-emerald-900/50',
  },
  teal: {
    label: 'Seafoam',
    swatch: 'bg-teal-500/90 dark:bg-teal-400/90',
    softDot: 'bg-teal-400 dark:bg-teal-400',
    eventSurface:
      'bg-teal-50/90 hover:bg-teal-100/80 text-teal-900 border-teal-200/75 dark:bg-teal-950/45 dark:hover:bg-teal-900/50 dark:text-teal-100 dark:border-teal-800/55',
    monthChip:
      'bg-teal-50/85 text-teal-900 border-teal-200/70 hover:bg-teal-100/80 dark:bg-teal-950/45 dark:text-teal-100 dark:border-teal-800/50 dark:hover:bg-teal-900/50',
  },
  amber: {
    label: 'Honey',
    swatch: 'bg-amber-500/90 dark:bg-amber-400/90',
    softDot: 'bg-amber-400 dark:bg-amber-400',
    eventSurface:
      'bg-amber-50/90 hover:bg-amber-100/80 text-amber-950 border-amber-200/75 dark:bg-amber-950/40 dark:hover:bg-amber-900/45 dark:text-amber-100 dark:border-amber-800/50',
    monthChip:
      'bg-amber-50/85 text-amber-950 border-amber-200/70 hover:bg-amber-100/80 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-800/50 dark:hover:bg-amber-900/45',
  },
  rose: {
    label: 'Blush',
    swatch: 'bg-rose-400/95 dark:bg-rose-400/90',
    softDot: 'bg-rose-400 dark:bg-rose-400',
    eventSurface:
      'bg-rose-50/90 hover:bg-rose-100/80 text-rose-900 border-rose-200/75 dark:bg-rose-950/45 dark:hover:bg-rose-900/50 dark:text-rose-100 dark:border-rose-800/55',
    monthChip:
      'bg-rose-50/85 text-rose-900 border-rose-200/70 hover:bg-rose-100/80 dark:bg-rose-950/45 dark:text-rose-100 dark:border-rose-800/50 dark:hover:bg-rose-900/50',
  },
  indigo: {
    label: 'Periwinkle',
    swatch: 'bg-indigo-500/85 dark:bg-indigo-400/90',
    softDot: 'bg-indigo-400 dark:bg-indigo-400',
    eventSurface:
      'bg-indigo-50/90 hover:bg-indigo-100/80 text-indigo-900 border-indigo-200/75 dark:bg-indigo-950/45 dark:hover:bg-indigo-900/50 dark:text-indigo-100 dark:border-indigo-800/55',
    monthChip:
      'bg-indigo-50/85 text-indigo-900 border-indigo-200/70 hover:bg-indigo-100/80 dark:bg-indigo-950/45 dark:text-indigo-100 dark:border-indigo-800/50 dark:hover:bg-indigo-900/50',
  },
  violet: {
    label: 'Lavender',
    swatch: 'bg-violet-500/85 dark:bg-violet-400/90',
    softDot: 'bg-violet-400 dark:bg-violet-400',
    eventSurface:
      'bg-violet-50/90 hover:bg-violet-100/80 text-violet-900 border-violet-200/75 dark:bg-violet-950/45 dark:hover:bg-violet-900/50 dark:text-violet-100 dark:border-violet-800/55',
    monthChip:
      'bg-violet-50/85 text-violet-900 border-violet-200/70 hover:bg-violet-100/80 dark:bg-violet-950/45 dark:text-violet-100 dark:border-violet-800/50 dark:hover:bg-violet-900/50',
  },
  slate: {
    label: 'Mono',
    swatch: 'bg-neutral-600 dark:bg-neutral-400',
    softDot: 'bg-neutral-500 dark:bg-neutral-400',
    eventSurface:
      'bg-neutral-100 hover:bg-neutral-200/80 text-neutral-900 border-neutral-300/85 dark:bg-neutral-900 dark:hover:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700/80',
    monthChip:
      'bg-neutral-100 text-neutral-900 border-neutral-300/80 hover:bg-neutral-200/80 dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-700/80 dark:hover:bg-neutral-800',
  },
};

export const FOLDER_COLOR_KEYS: FolderColorKey[] = [
  'blue',
  'emerald',
  'teal',
  'amber',
  'rose',
  'indigo',
  'violet',
  'slate',
];

const CALENDAR_NAME_PREFS_STORAGE_KEY = 'aeon-calendar-prefs-by-name';

export interface CalendarNamePref {
  color?: FolderColorKey;
  visible?: boolean;
}

/**
 * Normalizes a calendar filename or path to its bare calendar name key
 * (e.g. "community/debian.ics" -> "debian").
 */
export function calendarNameKey(fileNameOrPath: string): string {
  const base = fileNameOrPath.split('/').pop() ?? fileNameOrPath;
  return base.replace(/\.ics$/i, '').trim().toLowerCase();
}

export function isFolderColorKey(value: unknown): value is FolderColorKey {
  return (
    typeof value === 'string' &&
    (FOLDER_COLOR_KEYS as string[]).includes(value)
  );
}

export function readSavedCalendarPrefsByName(): Record<string, CalendarNamePref> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CALENDAR_NAME_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CalendarNamePref>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeSavedCalendarPrefByName(
  fileNameOrPath: string,
  patch: CalendarNamePref
): Record<string, CalendarNamePref> {
  const key = calendarNameKey(fileNameOrPath);
  const current = readSavedCalendarPrefsByName();
  const existing = current[key] ?? {};
  const next: Record<string, CalendarNamePref> = {
    ...current,
    [key]: {
      color: isFolderColorKey(patch.color) ? patch.color : existing.color,
      visible:
        typeof patch.visible === 'boolean' ? patch.visible : existing.visible,
    },
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        CALENDAR_NAME_PREFS_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      // ignore storage errors
    }
  }
  return next;
}
