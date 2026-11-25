import { addDays, endOfDay, startOfDay } from './dateUtils.ts';
import { expandEventsInRange } from './ics.ts';
import type { IcsCalendar, IcsEvent, IcsOccurrence } from '../types/calendar.ts';

export type DefaultReminderMinutes = -1 | 0 | 5 | 10 | 15 | 30 | 60 | 1440;

export interface NotificationSettings {
  enabled: boolean;
  soundEnabled: boolean;
  desktopEnabled: boolean;
  defaultReminderMinutes: DefaultReminderMinutes;
}

export interface DueNotification {
  id: string;
  occurrence: IcsOccurrence;
  leadMinutes: number;
  triggerAtMs: number;
}

const SETTINGS_STORAGE_KEY = 'aeon-notification-settings';
const FIRED_STORAGE_KEY = 'aeon-fired-notifications';
const FIRED_TTL_MS = 48 * 60 * 60 * 1000;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  soundEnabled: true,
  desktopEnabled: true,
  defaultReminderMinutes: 10,
};

export function readNotificationSettings(): NotificationSettings {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      enabled:
        typeof parsed.enabled === 'boolean'
          ? parsed.enabled
          : DEFAULT_NOTIFICATION_SETTINGS.enabled,
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_NOTIFICATION_SETTINGS.soundEnabled,
      desktopEnabled:
        typeof parsed.desktopEnabled === 'boolean'
          ? parsed.desktopEnabled
          : DEFAULT_NOTIFICATION_SETTINGS.desktopEnabled,
      defaultReminderMinutes:
        typeof parsed.defaultReminderMinutes === 'number'
          ? (parsed.defaultReminderMinutes as DefaultReminderMinutes)
          : DEFAULT_NOTIFICATION_SETTINGS.defaultReminderMinutes,
    };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export function writeNotificationSettings(
  next: NotificationSettings
): NotificationSettings {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }
  return next;
}

export function readFiredNotificationIds(nowMs = Date.now()): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(FIRED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const pruned: Record<string, number> = {};
    for (const [k, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number' && nowMs - ts < FIRED_TTL_MS) {
        pruned[k] = ts;
      }
    }
    return pruned;
  } catch {
    return {};
  }
}

export function writeFiredNotificationIds(map: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FIRED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

export type DesktopPermissionState =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported';

export function getDesktopNotificationPermission(): DesktopPermissionState {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestDesktopNotificationPermission(): Promise<DesktopPermissionState> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission !== 'default') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission ?? 'unsupported';
  }
}

export function sendDesktopNotification(
  title: string,
  body: string,
  tag: string,
  onClick?: () => void
): void {
  if (
    typeof window === 'undefined' ||
    typeof Notification === 'undefined' ||
    Notification.permission !== 'granted'
  ) {
    return;
  }
  try {
    const notif = new Notification(title, {
      body,
      tag,
      silent: true, // Aeon plays its own consistent notification sound
    });
    if (onClick) {
      notif.onclick = () => {
        window.focus();
        onClick();
        notif.close();
      };
    }
  } catch {
    // Ignore environments where Notification constructor is restricted
  }
}

export function formatReminderLeadLabel(minutes: number): string {
  if (minutes < 0) return 'No reminder';
  if (minutes === 0) return 'At start time';
  if (minutes < 60) return `${minutes} min before`;
  if (minutes === 60) return '1 hour before';
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? '1 day before' : `${days} days before`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours} hours before`;
}

export function computeDueNotifications(
  events: IcsEvent[],
  calendars: IcsCalendar[],
  settings: NotificationSettings,
  firedMap: Record<string, number>,
  now = new Date()
): DueNotification[] {
  if (!settings.enabled || events.length === 0) return [];

  const visibleIds = new Set(
    calendars.filter((c) => c.visible).map((c) => c.id)
  );
  const visibleEvents = events.filter(
    (e) => visibleIds.has(e.calendarId) && e.status !== 'CANCELLED'
  );
  if (visibleEvents.length === 0) return [];

  const windowStart = startOfDay(addDays(now, -1));
  const windowEnd = endOfDay(addDays(now, 2));
  const occs = expandEventsInRange(visibleEvents, windowStart, windowEnd);

  const nowMs = now.getTime();
  const due: DueNotification[] = [];

  for (const occ of occs) {
    const explicit = occ.event.reminderMinutes;
    const leadMinutes =
      explicit === null
        ? -1
        : typeof explicit === 'number'
          ? explicit
          : settings.defaultReminderMinutes;

    if (leadMinutes < 0) continue;

    let anchorMs = occ.startDate.getTime();
    if (occ.event.allDay) {
      const morning = new Date(occ.startDate);
      morning.setHours(9, 0, 0, 0);
      anchorMs = morning.getTime();
    }

    const triggerAtMs = anchorMs - leadMinutes * 60_000;
    const graceWindowEndMs = anchorMs + 5 * 60_000;

    if (nowMs < triggerAtMs || nowMs > graceWindowEndMs) {
      continue;
    }

    const key = `${occ.occurrenceId}::${leadMinutes}`;
    if (firedMap[key]) {
      continue;
    }

    due.push({
      id: key,
      occurrence: occ,
      leadMinutes,
      triggerAtMs,
    });
  }

  return due;
}
