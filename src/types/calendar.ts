export type FolderColorKey =
  | 'blue'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'indigo'
  | 'teal'
  | 'violet'
  | 'slate';

export type CalendarViewMode = 'day' | 'week' | 'month' | 'year';

export type FolderSource = 'workspace' | 'local-pc';

/**
 * 0 = Sunday, 1 = Monday, 6 = Saturday
 */
export type FirstDayOfWeek = 0 | 1 | 6;

export interface IcsCalendar {
  id: string;
  /** Filename only, e.g. "work.ics" (no directory path shown in UI) */
  fileName: string;
  /** Internal relative path inside root folder for reads/writes */
  relativePath: string;
  color: FolderColorKey;
  visible: boolean;
  source: FolderSource;
  eventCount: number;
}

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  /**
   * ISO local format:
   * - All-day: "YYYY-MM-DD"
   * - Timed: "YYYY-MM-DDTHH:mm:ss"
   */
  start: string;
  end: string;
  allDay: boolean;
  rrule?: string;
  categories?: string[];
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  /** Minutes before event start for reminder; undefined = use app default, null = explicit none */
  reminderMinutes?: number | null;
  calendarId: string;
  /** Filename only, e.g. "work.ics" */
  fileName: string;
  relativePath: string;
  rawIcs: string;
  source: FolderSource;
}

export interface IcsOccurrence {
  occurrenceId: string;
  event: IcsEvent;
  startDate: Date;
  endDate: Date;
  isRecurringInstance: boolean;
}

export interface EventDraft {
  uid?: string;
  summary: string;
  description: string;
  location: string;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endDate: string;   // YYYY-MM-DD
  endTime: string;   // HH:mm
  allDay: boolean;
  rrule: string;
  reminderMinutes?: number | null;
  /** Target calendar ID or "__new__" */
  calendarId: string;
  /** Used when calendarId === "__new__" */
  newFileName?: string;
  status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
}
