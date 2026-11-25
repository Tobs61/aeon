import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContextMenu, type ContextMenuState } from './components/ContextMenu.tsx';
import { DayView } from './components/DayView.tsx';
import { EventInspectorDrawer } from './components/EventInspectorDrawer.tsx';
import { EventModal } from './components/EventModal.tsx';
import { MonthView } from './components/MonthView.tsx';
import {
  type ActiveToastNotification,
  buildToastFromOccurrence,
  NotificationToasts,
} from './components/NotificationToasts.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { ShortcutsModal } from './components/ShortcutsModal.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { TitleBar } from './components/TitleBar.tsx';
import { TopBar } from './components/TopBar.tsx';
import { WeekView } from './components/WeekView.tsx';
import { YearView } from './components/YearView.tsx';
import {
  type CalendarNamePref,
  calendarNameKey,
  isFolderColorKey,
  readSavedCalendarPrefsByName,
  writeSavedCalendarPrefByName,
} from './lib/colors.ts';
import {
  addDays,
  draftEndToIcsEnd,
  formatDayTitle,
  formatMonthTitle,
  formatWeekRangeTitle,
  formatYearTitle,
  startOfWeek,
  toDateInputString,
  toTimeInputString,
} from './lib/dateUtils.ts';
import {
  buildCalendarsFromSnapshot,
  createNewLocalCalendarFile,
  type LocalFileEntry,
  type LocalRootMount,
  type LocalSnapshotMount,
  pickLocalRootDirectory,
  removeEventFromLocalFile,
  scanLocalRootRecursive,
  scanWebkitFolderFiles,
  upsertEventInLocalFile,
} from './lib/fsAccess.ts';
import {
  dateToIsoLocal,
  generateEventUid,
  isoToLocalDate,
  removeEventFromIcsContent,
  type SerializableVEvent,
  serializeCalendarEventsToIcs,
  slugifyIcsFilename,
  updateRruleWeekday,
  upsertEventInIcsContent,
} from './lib/ics.ts';
import {
  computeDueNotifications,
  formatReminderLeadLabel,
  type NotificationSettings,
  readFiredNotificationIds,
  readNotificationSettings,
  sendDesktopNotification,
  writeFiredNotificationIds,
  writeNotificationSettings,
} from './lib/notifications.ts';
import { bindAudioUnlock, playNotificationSound } from './lib/sound.ts';
import {
  isTauriRuntime,
  tauriCreateCalendarFile,
  tauriDeleteEvent,
  tauriLog,
  tauriPickCalendarFolder,
  tauriScanCalendars,
  tauriUpdateCalendarPrefs,
  tauriUpsertEvent,
} from './lib/tauriRuntime.ts';
import type {
  CalendarViewMode,
  EventDraft,
  FirstDayOfWeek,
  FolderColorKey,
  IcsCalendar,
  IcsEvent,
  IcsOccurrence,
} from './types/calendar.ts';

interface ScanResponse {
  rootFolderName: string;
  calendars: IcsCalendar[];
  events: IcsEvent[];
  scannedAt: string;
}

function applySavedPrefsByName(
  scannedCalendars: IcsCalendar[],
  savedByName: Record<string, CalendarNamePref>
): IcsCalendar[] {
  return scannedCalendars.map((cal) => {
    const saved = savedByName[calendarNameKey(cal.fileName)];
    if (!saved) return cal;
    return {
      ...cal,
      color: isFolderColorKey(saved.color) ? saved.color : cal.color,
      visible: typeof saved.visible === 'boolean' ? saved.visible : cal.visible,
    };
  });
}

function emitTerminalLog(
  action: string,
  detail: string,
  level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'
): void {
  if (isTauriRuntime()) {
    void tauriLog(level, action, detail);
    return;
  }
  void fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, action, detail }),
  }).catch(() => undefined);
}

function buildNewEventDraft(
  date: Date,
  hour: number,
  allDay: boolean,
  calendarId: string
): EventDraft {
  const start = new Date(date);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    summary: '',
    description: '',
    location: '',
    startDate: toDateInputString(start),
    startTime: toTimeInputString(start),
    endDate: toDateInputString(end),
    endTime: toTimeInputString(end),
    allDay,
    rrule: '',
    reminderMinutes: undefined,
    calendarId,
    newFileName: '',
    status: 'CONFIRMED',
  };
}

function buildOccurrenceDraft(
  occ: IcsOccurrence,
  summaryOverride?: string
): EventDraft {
  const evt = occ.event;
  const displayEnd = evt.allDay ? addDays(occ.endDate, -1) : occ.endDate;
  const safeDisplayEnd =
    displayEnd < occ.startDate ? occ.startDate : displayEnd;
  return {
    uid: summaryOverride ? undefined : evt.uid,
    summary: summaryOverride ?? evt.summary,
    description: evt.description ?? '',
    location: evt.location ?? '',
    startDate: toDateInputString(occ.startDate),
    startTime: toTimeInputString(occ.startDate),
    endDate: toDateInputString(safeDisplayEnd),
    endTime: toTimeInputString(occ.endDate),
    allDay: evt.allDay,
    rrule: evt.rrule ?? '',
    reminderMinutes: evt.reminderMinutes,
    calendarId: evt.calendarId,
    newFileName: '',
    status: evt.status ?? 'CONFIRMED',
  };
}

async function persistCalendarPref(
  cal: IcsCalendar,
  patch: CalendarNamePref
): Promise<void> {
  if (isTauriRuntime()) {
    await tauriUpdateCalendarPrefs(cal.relativePath, patch).catch(
      () => undefined
    );
  } else if (cal.source !== 'local-pc') {
    await fetch('/api/calendars', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calendarName: cal.fileName,
        relativePath: cal.relativePath,
        ...patch,
      }),
    }).catch(() => undefined);
  }
}

export default function App() {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [rootFolderLabel, setRootFolderLabel] = useState<string>(
    'Calendars (Workspace)'
  );
  const [localRootMount, setLocalRootMount] = useState<LocalRootMount | null>(
    null
  );
  const [localSnapshotMount, setLocalSnapshotMount] =
    useState<LocalSnapshotMount | null>(null);
  const [localFileMap, setLocalFileMap] = useState<
    Map<string, LocalFileEntry>
  >(() => new Map());
  const [localPrefs, setLocalPrefs] = useState<
    Record<string, CalendarNamePref>
  >(() => readSavedCalendarPrefsByName());

  const [calendars, setCalendars] = useState<IcsCalendar[]>([]);
  const [events, setEvents] = useState<IcsEvent[]>([]);

  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [activeDate, setActiveDate] = useState<Date>(() => new Date());
  const [firstDayOfWeek, setFirstDayOfWeek] = useState<FirstDayOfWeek>(() => {
    try {
      const saved = localStorage.getItem('aeon-first-day');
      if (saved === '0' || saved === '1' || saved === '6') {
        return Number(saved) as FirstDayOfWeek;
      }
    } catch {
      // ignore storage errors
    }
    return 1;
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('aeon-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedOccurrence, setSelectedOccurrence] =
    useState<IcsOccurrence | null>(null);
  const [eventModalState, setEventModalState] = useState<{
    open: boolean;
    draft: EventDraft;
    editingEvent: IcsEvent | null;
  } | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(() => readNotificationSettings());
  const [toasts, setToasts] = useState<ActiveToastNotification[]>([]);
  const firedNotificationsRef = useRef<Record<string, number>>(
    readFiredNotificationIds()
  );
  const toastTimeoutsRef = useRef<Map<string, number>>(new Map());

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  const handleSetTheme = useCallback((dark: boolean) => {
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('aeon-theme', dark ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleChangeFirstDay = (day: FirstDayOfWeek) => {
    setFirstDayOfWeek(day);
    try {
      localStorage.setItem('aeon-first-day', String(day));
    } catch {
      // ignore storage errors
    }
  };

  const handleToggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('aeon-sidebar-collapsed', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimeoutsRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      toastTimeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: ActiveToastNotification) => {
      setToasts((prev) => {
        const filtered = prev.filter((item) => item.id !== toast.id);
        return [...filtered, toast].slice(-4);
      });
      const existingTimer = toastTimeoutsRef.current.get(toast.id);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }
      const timer = window.setTimeout(() => {
        toastTimeoutsRef.current.delete(toast.id);
        setToasts((prev) => prev.filter((item) => item.id !== toast.id));
      }, 12_000);
      toastTimeoutsRef.current.set(toast.id, timer);
    },
    []
  );

  const handleUpdateNotificationSettings = useCallback(
    (patch: Partial<NotificationSettings>) => {
      setNotificationSettings((prev) => writeNotificationSettings({ ...prev, ...patch }));
    },
    []
  );

  const handleTestNotification = useCallback(async () => {
    const id = `aeon-test-${Date.now()}`;
    pushToast({
      id,
      title: 'Aeon Reminder Test',
      subtitle: 'Notifications and chime are working',
      colorKey: calendars[0]?.color ?? 'slate',
    });
    if (notificationSettings.desktopEnabled) {
      sendDesktopNotification(
        'Aeon Reminder Test',
        'Notifications and chime are working.',
        id
      );
    }
    await playNotificationSound();
  }, [calendars, notificationSettings.desktopEnabled, pushToast]);

  const scanActiveFolder = useCallback(
    async (
      mountOverride?: LocalRootMount | null,
      snapshotOverride?: LocalSnapshotMount | null
    ) => {
      const activeMount =
        mountOverride !== undefined ? mountOverride : localRootMount;
      const activeSnapshot =
        snapshotOverride !== undefined ? snapshotOverride : localSnapshotMount;
      const savedByName = readSavedCalendarPrefsByName();
      const mergedPrefs = { ...localPrefs, ...savedByName };
      setIsScanning(true);
      setLoadError(null);
      try {
        if (isTauriRuntime()) {
          const result = await tauriScanCalendars();
          setRootFolderLabel(result.rootFolderName);
          setCalendars(applySavedPrefsByName(result.calendars, mergedPrefs));
          setEvents(result.events);
          setLocalFileMap(new Map());
          emitTerminalLog(
            'scan',
            `Loaded ${result.calendars.length} calendar(s), ${result.events.length} event(s)`
          );
        } else if (activeMount) {
          const result = await scanLocalRootRecursive(activeMount, mergedPrefs);
          setRootFolderLabel(activeMount.folderName);
          setCalendars(applySavedPrefsByName(result.calendars, mergedPrefs));
          setEvents(result.events);
          setLocalFileMap(result.fileMap);
          emitTerminalLog(
            'scan',
            `Scanned "${activeMount.folderName}": ${result.calendars.length} calendar(s), ${result.events.length} event(s)`
          );
        } else if (activeSnapshot) {
          const result = buildCalendarsFromSnapshot(activeSnapshot, mergedPrefs);
          setRootFolderLabel(activeSnapshot.folderName);
          setCalendars(applySavedPrefsByName(result.calendars, mergedPrefs));
          setEvents(result.events);
          setLocalFileMap(new Map());
          emitTerminalLog(
            'scan',
            `Scanned "${activeSnapshot.folderName}": ${result.calendars.length} calendar(s), ${result.events.length} event(s)`
          );
        } else {
          const res = await fetch('/api/scan');
          if (!res.ok) {
            throw new Error(`Scan failed (${res.status})`);
          }
          const data = (await res.json()) as ScanResponse;
          setRootFolderLabel(data.rootFolderName);
          setCalendars(applySavedPrefsByName(data.calendars, mergedPrefs));
          setEvents(data.events);
          setLocalFileMap(new Map());
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to scan calendar folder.';
        emitTerminalLog('scan-error', message, 'ERROR');
        setLoadError(message);
      } finally {
        setIsScanning(false);
      }
    },
    [localPrefs, localRootMount, localSnapshotMount]
  );

  useEffect(() => {
    void scanActiveFolder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => bindAudioUnlock(), []);

  useEffect(() => {
    const timeouts = toastTimeoutsRef.current;
    return () => {
      for (const timer of timeouts.values()) {
        window.clearTimeout(timer);
      }
      timeouts.clear();
    };
  }, []);

  useEffect(() => {
    if (!notificationSettings.enabled) return;

    const checkDue = () => {
      const due = computeDueNotifications(
        events,
        calendars,
        notificationSettings,
        firedNotificationsRef.current
      );
      if (due.length === 0) return;

      const nowMs = Date.now();
      for (const item of due) {
        firedNotificationsRef.current[item.id] = nowMs;
      }
      writeFiredNotificationIds(firedNotificationsRef.current);

      for (const item of due) {
        const cal = calendars.find(
          (c) => c.id === item.occurrence.event.calendarId
        );
        pushToast(
          buildToastFromOccurrence(
            item.id,
            item.occurrence,
            item.leadMinutes,
            cal
          )
        );
        if (notificationSettings.desktopEnabled) {
          const leadText =
            item.leadMinutes === 0
              ? 'Starting now'
              : formatReminderLeadLabel(item.leadMinutes);
          const loc = item.occurrence.event.location
            ? ` · ${item.occurrence.event.location}`
            : '';
          sendDesktopNotification(
            item.occurrence.event.summary,
            `${leadText}${loc}`,
            item.id,
            () => setSelectedOccurrence(item.occurrence)
          );
        }
      }

      if (notificationSettings.soundEnabled) {
        void playNotificationSound();
      }
    };

    checkDue();
    const intervalId = window.setInterval(checkDue, 5000);
    return () => window.clearInterval(intervalId);
  }, [calendars, events, notificationSettings, pushToast]);

  const dismissAllOverlays = useCallback(() => {
    setEventModalState(null);
    setSelectedOccurrence(null);
    setSettingsModalOpen(false);
    setShortcutsModalOpen(false);
    setMobileSidebarOpen(false);
  }, []);

  const openCreateModal = useCallback(
    (date: Date, hour = 9, allDay = false) => {
      const defaultCalendar =
        calendars.find((c) => c.visible)?.id ?? calendars[0]?.id ?? '__new__';
      setEventModalState({
        open: true,
        editingEvent: null,
        draft: buildNewEventDraft(date, hour, allDay, defaultCalendar),
      });
    },
    [calendars]
  );

  const openEditModal = useCallback((occ: IcsOccurrence) => {
    setSelectedOccurrence(null);
    setEventModalState({
      open: true,
      editingEvent: occ.event,
      draft: buildOccurrenceDraft(occ),
    });
  }, []);

  const handlePrev = useCallback(() => {
    setActiveDate((prev) => {
      if (viewMode === 'day') return addDays(prev, -1);
      if (viewMode === 'week') return addDays(prev, -7);
      if (viewMode === 'year') {
        return new Date(prev.getFullYear() - 1, prev.getMonth(), 1);
      }
      return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
    });
  }, [viewMode]);

  const handleNext = useCallback(() => {
    setActiveDate((prev) => {
      if (viewMode === 'day') return addDays(prev, 1);
      if (viewMode === 'week') return addDays(prev, 7);
      if (viewMode === 'year') {
        return new Date(prev.getFullYear() + 1, prev.getMonth(), 1);
      }
      return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
    });
  }, [viewMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (isInput && target === searchInputRef.current) {
          setSearchQuery('');
          searchInputRef.current?.blur();
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        dismissAllOverlays();
        return;
      }

      if (isInput) return;

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsModalOpen((prev) => !prev);
        return;
      }

      if (eventModalState || settingsModalOpen || shortcutsModalOpen) {
        return;
      }

      const key = e.key.toLowerCase();

      if (selectedOccurrence && key === 'e') {
        e.preventDefault();
        openEditModal(selectedOccurrence);
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === ',') {
        e.preventDefault();
        setSettingsModalOpen(true);
      } else if (key === 'n' || key === 'c') {
        e.preventDefault();
        openCreateModal(activeDate, 9, false);
      } else if (key === '1' || key === 'd') {
        setViewMode('day');
      } else if (key === '2' || key === 'w') {
        setViewMode('week');
      } else if (key === '3' || key === 'm') {
        setViewMode('month');
      } else if (key === '4' || key === 'y') {
        setViewMode('year');
      } else if (key === 't') {
        setActiveDate(new Date());
      } else if (key === 'r') {
        void scanActiveFolder();
      } else if (key === 'b' || e.key === '[') {
        e.preventDefault();
        handleToggleSidebarCollapsed();
      } else if (e.key === '\\') {
        handleSetTheme(!isDark);
      } else if (e.key === 'ArrowLeft' || key === 'h') {
        handlePrev();
      } else if (e.key === 'ArrowRight' || key === 'l') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeDate,
    contextMenu,
    dismissAllOverlays,
    eventModalState,
    handleNext,
    handlePrev,
    handleSetTheme,
    handleToggleSidebarCollapsed,
    isDark,
    openCreateModal,
    openEditModal,
    scanActiveFolder,
    selectedOccurrence,
    settingsModalOpen,
    shortcutsModalOpen,
  ]);

  const handleToggleCalendar = async (calendarId: string) => {
    const cal = calendars.find((c) => c.id === calendarId);
    if (!cal) return;
    const nextVisible = !cal.visible;

    setCalendars((prev) =>
      prev.map((c) =>
        c.id === calendarId ? { ...c, visible: nextVisible } : c
      )
    );

    const updatedByName = writeSavedCalendarPrefByName(cal.fileName, {
      visible: nextVisible,
    });
    setLocalPrefs(updatedByName);
    await persistCalendarPref(cal, { visible: nextVisible });
  };

  const handleChangeCalendarColor = async (
    calendarId: string,
    color: FolderColorKey
  ) => {
    const cal = calendars.find((c) => c.id === calendarId);
    if (!cal) return;

    setCalendars((prev) =>
      prev.map((c) => (c.id === calendarId ? { ...c, color } : c))
    );

    // Save preference keyed solely to calendar name; .ics file stays untouched inside user's folder
    const updatedByName = writeSavedCalendarPrefByName(cal.fileName, { color });
    setLocalPrefs(updatedByName);

    emitTerminalLog(
      'color-calendar',
      `Set color for "${cal.fileName.replace(/\.ics$/i, '')}" to ${color}`
    );

    await persistCalendarPref(cal, { color });
  };

  const handleSaveEvent = async (draft: EventDraft) => {
    const editing = eventModalState?.editingEvent ?? null;
    const isCreatingNewFile = draft.calendarId === '__new__';

    const startVal = draft.allDay
      ? draft.startDate
      : `${draft.startDate}T${draft.startTime}:00`;
    const endVal = draftEndToIcsEnd(draft.endDate, draft.endTime, draft.allDay);

    const eventPayload: SerializableVEvent = {
      uid: editing?.uid ?? generateEventUid(),
      summary: draft.summary.trim(),
      description: draft.description,
      location: draft.location,
      start: startVal,
      end: endVal,
      allDay: draft.allDay,
      rrule: draft.rrule || undefined,
      reminderMinutes: draft.reminderMinutes,
      status: draft.status,
    };

    if (isTauriRuntime()) {
      if (isCreatingNewFile) {
        const created = await tauriCreateCalendarFile(
          draft.newFileName || 'calendar.ics',
          eventPayload
        );
        emitTerminalLog(
          'create-event',
          `Created "${eventPayload.summary}" in "${created}"`
        );
      } else {
        const targetCal = calendars.find((c) => c.id === draft.calendarId);
        if (!targetCal) {
          throw new Error('Target calendar file not found.');
        }
        await tauriUpsertEvent(
          targetCal.relativePath,
          eventPayload,
          editing?.relativePath
        );
        emitTerminalLog(
          editing ? 'update-event' : 'create-event',
          `${editing ? 'Updated' : 'Created'} "${eventPayload.summary}" in "${targetCal.fileName}"`
        );
      }
      await scanActiveFolder();
      return;
    }

    if (localRootMount) {
      if (editing && editing.calendarId !== draft.calendarId) {
        const oldEntry = localFileMap.get(editing.calendarId);
        if (oldEntry) {
          await removeEventFromLocalFile(oldEntry.fileHandle, editing.uid);
        }
      }

      if (isCreatingNewFile) {
        const createdName = draft.newFileName || 'calendar.ics';
        await createNewLocalCalendarFile(
          localRootMount.handle,
          createdName,
          eventPayload
        );
        emitTerminalLog(
          'create-event',
          `Created "${eventPayload.summary}" in new file "${slugifyIcsFilename(createdName)}"`
        );
      } else {
        const targetEntry = localFileMap.get(draft.calendarId);
        if (!targetEntry) {
          throw new Error('Target .ics file not found in mounted folder.');
        }
        await upsertEventInLocalFile(targetEntry.fileHandle, eventPayload);
        emitTerminalLog(
          editing ? 'update-event' : 'create-event',
          `${editing ? 'Updated' : 'Created'} "${eventPayload.summary}" in "${targetEntry.fileName}"`
        );
      }

      await scanActiveFolder();
      return;
    }

    if (localSnapshotMount) {
      const nextFiles = new Map(localSnapshotMount.files);

      if (editing && editing.calendarId !== draft.calendarId) {
        const oldSnap = nextFiles.get(editing.calendarId);
        if (oldSnap) {
          nextFiles.set(editing.calendarId, {
            ...oldSnap,
            rawIcs: removeEventFromIcsContent(oldSnap.rawIcs, editing.uid),
          });
        }
      }

      if (isCreatingNewFile) {
        const safeName = slugifyIcsFilename(draft.newFileName || 'calendar.ics');
        const calendarId = `local::${safeName}`;
        const existingSnap = nextFiles.get(calendarId);
        nextFiles.set(calendarId, {
          calendarId,
          fileName: safeName,
          relativePath: safeName,
          rawIcs: upsertEventInIcsContent(
            existingSnap?.rawIcs ?? null,
            eventPayload
          ),
        });
        emitTerminalLog(
          'create-event',
          `Created "${eventPayload.summary}" in "${safeName}" (${localSnapshotMount.folderName})`
        );
      } else {
        const targetSnap = nextFiles.get(draft.calendarId);
        if (!targetSnap) {
          throw new Error('Target .ics file not found in mounted folder.');
        }
        nextFiles.set(draft.calendarId, {
          ...targetSnap,
          rawIcs: upsertEventInIcsContent(targetSnap.rawIcs, eventPayload),
        });
        emitTerminalLog(
          editing ? 'update-event' : 'create-event',
          `${editing ? 'Updated' : 'Created'} "${eventPayload.summary}" in "${targetSnap.fileName}"`
        );
      }

      const nextSnapshot: LocalSnapshotMount = {
        ...localSnapshotMount,
        files: nextFiles,
      };
      setLocalSnapshotMount(nextSnapshot);
      await scanActiveFolder(undefined, nextSnapshot);
      return;
    }

    if (editing) {
      const targetCal = calendars.find((c) => c.id === draft.calendarId);
      const res = await fetch('/api/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalRelativePath: editing.relativePath,
          relativePath: targetCal?.relativePath,
          newFileName: isCreatingNewFile ? draft.newFileName : undefined,
          uid: editing.uid,
          summary: draft.summary,
          description: draft.description,
          location: draft.location,
          start: startVal,
          end: endVal,
          allDay: draft.allDay,
          rrule: draft.rrule || undefined,
          reminderMinutes: draft.reminderMinutes,
          status: draft.status,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Failed to update event.');
      }
    } else {
      const targetCal = calendars.find((c) => c.id === draft.calendarId);
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relativePath: targetCal?.relativePath,
          newFileName: isCreatingNewFile ? draft.newFileName : undefined,
          summary: draft.summary,
          description: draft.description,
          location: draft.location,
          start: startVal,
          end: endVal,
          allDay: draft.allDay,
          rrule: draft.rrule || undefined,
          reminderMinutes: draft.reminderMinutes,
          status: draft.status,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Failed to save event.');
      }
    }

    await scanActiveFolder();
  };

  const handleUpdateEventTiming = useCallback(
    async (occ: IcsOccurrence, newStart: Date, newEnd: Date) => {
      const evt = occ.event;

      let targetStart: Date = newStart;
      let targetEnd: Date = newEnd;
      let nextRrule = evt.rrule;

      if (evt.rrule) {
        const { rrule: updatedRule, multiDayByDay } = updateRruleWeekday(
          evt.rrule,
          occ.startDate,
          newStart
        );
        nextRrule = updatedRule;

        const baseStart = isoToLocalDate(evt.start, evt.allDay);
        const baseEnd = isoToLocalDate(evt.end, evt.allDay);

        if (multiDayByDay && occ.isRecurringInstance) {
          const durationMs = newEnd.getTime() - newStart.getTime();
          targetStart = new Date(baseStart);
          if (!evt.allDay) {
            targetStart.setHours(
              newStart.getHours(),
              newStart.getMinutes(),
              newStart.getSeconds(),
              0
            );
          }
          targetEnd = new Date(targetStart.getTime() + durationMs);
        } else {
          const deltaStartMs = newStart.getTime() - occ.startDate.getTime();
          const deltaEndMs = newEnd.getTime() - occ.endDate.getTime();
          targetStart = new Date(baseStart.getTime() + deltaStartMs);
          targetEnd = new Date(baseEnd.getTime() + deltaEndMs);
        }
      }

      const startIso = dateToIsoLocal(targetStart, evt.allDay);
      const endIso = dateToIsoLocal(targetEnd, evt.allDay);

      setEvents((prev) =>
        prev.map((item) =>
          item.uid === evt.uid && item.calendarId === evt.calendarId
            ? { ...item, start: startIso, end: endIso, rrule: nextRrule }
            : item
        )
      );

      const updatedPayload: SerializableVEvent = {
        uid: evt.uid,
        summary: evt.summary,
        description: evt.description,
        location: evt.location,
        start: startIso,
        end: endIso,
        allDay: evt.allDay,
        rrule: nextRrule,
        status: evt.status ?? 'CONFIRMED',
        categories: evt.categories,
        reminderMinutes: evt.reminderMinutes,
      };

      try {
        if (isTauriRuntime()) {
          await tauriUpsertEvent(evt.relativePath, updatedPayload);
          emitTerminalLog(
            'move-event',
            `Moved/resized "${evt.summary}" in "${evt.fileName}" (${updatedPayload.start} -> ${updatedPayload.end})`
          );
        } else if (localRootMount) {
          const entry = localFileMap.get(evt.calendarId);
          if (entry) {
            await upsertEventInLocalFile(entry.fileHandle, updatedPayload);
            emitTerminalLog(
              'move-event',
              `Moved/resized "${evt.summary}" in "${entry.fileName}" (${updatedPayload.start} -> ${updatedPayload.end})`
            );
          }
        } else if (localSnapshotMount) {
          const targetSnap = localSnapshotMount.files.get(evt.calendarId);
          if (targetSnap) {
            const nextFiles = new Map(localSnapshotMount.files);
            nextFiles.set(evt.calendarId, {
              ...targetSnap,
              rawIcs: upsertEventInIcsContent(targetSnap.rawIcs, updatedPayload),
            });
            const nextSnapshot: LocalSnapshotMount = {
              ...localSnapshotMount,
              files: nextFiles,
            };
            setLocalSnapshotMount(nextSnapshot);
            emitTerminalLog(
              'move-event',
              `Moved/resized "${evt.summary}" in "${targetSnap.fileName}" (${updatedPayload.start} -> ${updatedPayload.end})`
            );
            await scanActiveFolder(undefined, nextSnapshot);
            return;
          }
        } else {
          const res = await fetch('/api/events', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              originalRelativePath: evt.relativePath,
              relativePath: evt.relativePath,
              ...updatedPayload,
            }),
          });
          if (!res.ok) {
            throw new Error('Failed to save updated event timing.');
          }
        }
        await scanActiveFolder();
      } catch (err) {
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Failed to update event timing.'
        );
        await scanActiveFolder();
      }
    },
    [localFileMap, localRootMount, localSnapshotMount, scanActiveFolder]
  );

  const handleDeleteEvent = async (occ: IcsOccurrence) => {
    const evt = occ.event;
    if (isTauriRuntime()) {
      await tauriDeleteEvent(evt.relativePath, evt.uid);
      emitTerminalLog(
        'delete-event',
        `Deleted "${evt.summary}" from "${evt.fileName}"`
      );
    } else if (localRootMount) {
      const entry = localFileMap.get(evt.calendarId);
      if (entry) {
        await removeEventFromLocalFile(entry.fileHandle, evt.uid);
        emitTerminalLog(
          'delete-event',
          `Deleted "${evt.summary}" from "${entry.fileName}"`
        );
      }
    } else if (localSnapshotMount) {
      const targetSnap = localSnapshotMount.files.get(evt.calendarId);
      if (targetSnap) {
        const nextFiles = new Map(localSnapshotMount.files);
        nextFiles.set(evt.calendarId, {
          ...targetSnap,
          rawIcs: removeEventFromIcsContent(targetSnap.rawIcs, evt.uid),
        });
        const nextSnapshot: LocalSnapshotMount = {
          ...localSnapshotMount,
          files: nextFiles,
        };
        setLocalSnapshotMount(nextSnapshot);
        emitTerminalLog(
          'delete-event',
          `Deleted "${evt.summary}" from "${targetSnap.fileName}"`
        );
        await scanActiveFolder(undefined, nextSnapshot);
        return;
      }
    } else {
      const res = await fetch('/api/events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relativePath: evt.relativePath,
          uid: evt.uid,
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to remove event from .ics file.');
      }
    }
    await scanActiveFolder();
  };

  const handlePickLocalFolder = async () => {
    if (isTauriRuntime()) {
      const picked = await tauriPickCalendarFolder();
      if (!picked) {
        throw new Error('Folder selection aborted');
      }
      setLocalSnapshotMount(null);
      await scanActiveFolder();
      return;
    }
    const mount = await pickLocalRootDirectory();
    emitTerminalLog('mount', `Mounted local folder "${mount.folderName}"`);
    setLocalSnapshotMount(null);
    setLocalRootMount(mount);
    await scanActiveFolder(mount, null);
  };

  const handleMountNativeFolderFiles = async (fileList: FileList) => {
    const savedByName = readSavedCalendarPrefsByName();
    const mergedPrefs = { ...localPrefs, ...savedByName };
    const result = await scanWebkitFolderFiles(fileList, mergedPrefs);
    setLocalRootMount(null);
    setLocalSnapshotMount(result.mount);
    setRootFolderLabel(result.mount.folderName);
    setCalendars(applySavedPrefsByName(result.calendars, mergedPrefs));
    setEvents(result.events);
    setLocalFileMap(new Map());
    emitTerminalLog(
      'mount-folder',
      `Mounted native folder "${result.mount.folderName}": ${result.calendars.length} calendar(s), ${result.events.length} event(s)`
    );
  };

  const handleCreateCalendarFile = async (name: string) => {
    if (isTauriRuntime()) {
      const created = await tauriCreateCalendarFile(name);
      emitTerminalLog('create-calendar', `Created "${created}"`);
      await scanActiveFolder();
      return;
    }
    if (localRootMount) {
      await createNewLocalCalendarFile(localRootMount.handle, name);
      emitTerminalLog(
        'create-calendar',
        `Created "${slugifyIcsFilename(name)}" in "${localRootMount.folderName}"`
      );
      await scanActiveFolder();
      return;
    }
    if (localSnapshotMount) {
      const safeName = slugifyIcsFilename(name);
      const calendarId = `local::${safeName}`;
      const nextFiles = new Map(localSnapshotMount.files);
      if (!nextFiles.has(calendarId)) {
        nextFiles.set(calendarId, {
          calendarId,
          fileName: safeName,
          relativePath: safeName,
          rawIcs: serializeCalendarEventsToIcs([]),
        });
      }
      const nextSnapshot: LocalSnapshotMount = {
        ...localSnapshotMount,
        files: nextFiles,
      };
      setLocalSnapshotMount(nextSnapshot);
      emitTerminalLog(
        'create-calendar',
        `Created "${safeName}" in "${localSnapshotMount.folderName}"`
      );
      await scanActiveFolder(undefined, nextSnapshot);
      return;
    }

    const res = await fetch('/api/calendars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || 'Failed to create .ics calendar.');
    }
    await scanActiveFolder();
  };

  const visibleEvents = useMemo(() => {
    const visibleIds = new Set(
      calendars.filter((c) => c.visible).map((c) => c.id)
    );
    const q = searchQuery.trim().toLowerCase();

    return events.filter((evt) => {
      if (!visibleIds.has(evt.calendarId)) return false;
      if (!q) return true;
      return (
        evt.summary.toLowerCase().includes(q) ||
        (evt.location?.toLowerCase().includes(q) ?? false) ||
        (evt.description?.toLowerCase().includes(q) ?? false) ||
        evt.fileName.toLowerCase().includes(q)
      );
    });
  }, [calendars, events, searchQuery]);

  const headerTitle = useMemo(() => {
    if (viewMode === 'day') {
      return formatDayTitle(activeDate);
    }
    if (viewMode === 'week') {
      return formatWeekRangeTitle(startOfWeek(activeDate, firstDayOfWeek));
    }
    if (viewMode === 'year') {
      return formatYearTitle(activeDate);
    }
    return formatMonthTitle(activeDate);
  }, [activeDate, firstDayOfWeek, viewMode]);

  const handleFocusCalendar = useCallback(
    async (calendarId: string) => {
      const updatedList = calendars.map((c) => ({
        ...c,
        visible: c.id === calendarId,
      }));
      setCalendars(updatedList);

      let latestPrefs = localPrefs;
      for (const c of updatedList) {
        latestPrefs = writeSavedCalendarPrefByName(c.fileName, {
          visible: c.visible,
        });
      }
      setLocalPrefs(latestPrefs);

      for (const c of updatedList) {
        await persistCalendarPref(c, { visible: c.visible });
      }
    },
    [calendars, localPrefs]
  );

  const handleCreateInCalendar = useCallback(
    (calendarId: string) => {
      setEventModalState({
        open: true,
        editingEvent: null,
        draft: buildNewEventDraft(activeDate, 9, false, calendarId),
      });
    },
    [activeDate]
  );

  const handleDuplicateEvent = useCallback((occ: IcsOccurrence) => {
    setSelectedOccurrence(null);
    setEventModalState({
      open: true,
      editingEvent: null,
      draft: buildOccurrenceDraft(occ, `${occ.event.summary} (Copy)`),
    });
  }, []);

  const handleEventContextMenu = useCallback(
    (e: React.MouseEvent, occ: IcsOccurrence) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        target: { kind: 'event', occurrence: occ },
      });
    },
    []
  );

  const handleSlotContextMenu = useCallback(
    (e: React.MouseEvent, date: Date, hour: number, allDay = false) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        target: { kind: 'slot', date, hour, allDay },
      });
    },
    []
  );

  const handleCalendarContextMenu = useCallback(
    (e: React.MouseEvent, calendar: IcsCalendar) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        target: { kind: 'calendar', calendar },
      });
    },
    []
  );

  const handleRootContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'PRE' ||
        target.isContentEditable)
    ) {
      return;
    }
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: { kind: 'general' },
    });
  }, []);

  const hasOpenOverlay = Boolean(
    eventModalState?.open ||
      settingsModalOpen ||
      shortcutsModalOpen ||
      selectedOccurrence ||
      mobileSidebarOpen
  );

  const selectedCalendar = selectedOccurrence
    ? calendars.find((c) => c.id === selectedOccurrence.event.calendarId)
    : undefined;

  return (
    <div
      onContextMenu={handleRootContextMenu}
      className="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-[#0a0a0a] text-neutral-900 dark:text-neutral-100"
    >
      <TitleBar
        onMinimizeFallback={handleToggleSidebarCollapsed}
        onCloseFallback={() => {
          setContextMenu(null);
          dismissAllOverlays();
        }}
      />

      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <Sidebar
          calendars={calendars}
          activeDate={activeDate}
          firstDayOfWeek={firstDayOfWeek}
          onSelectDate={(d) => setActiveDate(d)}
          onToggleCalendar={handleToggleCalendar}
          onChangeCalendarColor={handleChangeCalendarColor}
          onOpenSettings={() => setSettingsModalOpen(true)}
          onCalendarContextMenu={handleCalendarContextMenu}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <main className="flex flex-1 flex-col min-w-0 min-h-0">
          <TopBar
            title={headerTitle}
            viewMode={viewMode}
            onChangeView={setViewMode}
            onPrev={handlePrev}
            onNext={handleNext}
            onToday={() => setActiveDate(new Date())}
            onNewEvent={() => openCreateModal(activeDate, 9, false)}
            onRescan={() => void scanActiveFolder()}
            isScanning={isScanning}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchInputRef={searchInputRef}
            sidebarCollapsed={sidebarCollapsed}
            onExpandSidebar={handleToggleSidebarCollapsed}
            onOpenShortcuts={() => setShortcutsModalOpen(true)}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          />

          {loadError && (
            <div className="px-6 py-2.5 bg-neutral-100 dark:bg-[#141414] border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-800 dark:text-neutral-200 shrink-0">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => void scanActiveFolder()}
                className="font-medium underline"
              >
                Retry scan
              </button>
            </div>
          )}

          {isScanning && calendars.length === 0 ? (
            <div className="flex-1 p-6 grid grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100/70 dark:bg-neutral-900/60 animate-pulse"
                />
              ))}
            </div>
          ) : viewMode === 'day' ? (
            <DayView
              activeDate={activeDate}
              events={visibleEvents}
              calendars={calendars}
              onSelectOccurrence={setSelectedOccurrence}
              onCreateAt={openCreateModal}
              onUpdateEventTiming={handleUpdateEventTiming}
              onEventContextMenu={handleEventContextMenu}
              onSlotContextMenu={handleSlotContextMenu}
            />
          ) : viewMode === 'week' ? (
            <WeekView
              activeDate={activeDate}
              firstDayOfWeek={firstDayOfWeek}
              events={visibleEvents}
              calendars={calendars}
              onSelectOccurrence={setSelectedOccurrence}
              onCreateAt={openCreateModal}
              onUpdateEventTiming={handleUpdateEventTiming}
              onEventContextMenu={handleEventContextMenu}
              onSlotContextMenu={handleSlotContextMenu}
            />
          ) : viewMode === 'year' ? (
            <YearView
              activeDate={activeDate}
              firstDayOfWeek={firstDayOfWeek}
              events={visibleEvents}
              calendars={calendars}
              onSelectMonth={(monthDate) => {
                setActiveDate(monthDate);
                setViewMode('month');
              }}
              onSelectDay={(dayDate) => {
                setActiveDate(dayDate);
                setViewMode('day');
              }}
              onSelectOccurrence={setSelectedOccurrence}
              onCreateAt={openCreateModal}
              onEventContextMenu={handleEventContextMenu}
              onSlotContextMenu={handleSlotContextMenu}
              onPrevPeriod={handlePrev}
              onNextPeriod={handleNext}
            />
          ) : (
            <MonthView
              activeDate={activeDate}
              firstDayOfWeek={firstDayOfWeek}
              events={visibleEvents}
              calendars={calendars}
              onSelectOccurrence={setSelectedOccurrence}
              onCreateAt={openCreateModal}
              onUpdateEventTiming={handleUpdateEventTiming}
              onEventContextMenu={handleEventContextMenu}
              onSlotContextMenu={handleSlotContextMenu}
              onPrevPeriod={handlePrev}
              onNextPeriod={handleNext}
            />
          )}
        </main>
      </div>

      {selectedOccurrence && (
        <EventInspectorDrawer
          occurrence={selectedOccurrence}
          calendar={selectedCalendar}
          onClose={() => setSelectedOccurrence(null)}
          onEdit={openEditModal}
          onDelete={handleDeleteEvent}
        />
      )}

      {eventModalState?.open && (
        <EventModal
          calendars={calendars}
          initialDraft={eventModalState.draft}
          editingEvent={eventModalState.editingEvent}
          onClose={() => setEventModalState(null)}
          onSave={handleSaveEvent}
        />
      )}

      {settingsModalOpen && (
        <SettingsModal
          rootFolderLabel={rootFolderLabel}
          calendarCount={calendars.length}
          firstDayOfWeek={firstDayOfWeek}
          onChangeFirstDay={handleChangeFirstDay}
          isDark={isDark}
          onToggleTheme={handleSetTheme}
          notificationSettings={notificationSettings}
          onUpdateNotificationSettings={handleUpdateNotificationSettings}
          onTestNotification={handleTestNotification}
          onPickLocalFolder={handlePickLocalFolder}
          onMountNativeFolderFiles={handleMountNativeFolderFiles}
          onCreateCalendarFile={handleCreateCalendarFile}
          onClose={() => setSettingsModalOpen(false)}
        />
      )}

      {shortcutsModalOpen && (
        <ShortcutsModal onClose={() => setShortcutsModalOpen(false)} />
      )}

      <NotificationToasts
        items={toasts}
        onDismiss={dismissToast}
        onInspectOccurrence={setSelectedOccurrence}
      />

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          calendars={calendars}
          viewMode={viewMode}
          sidebarCollapsed={sidebarCollapsed}
          isDark={isDark}
          hasOpenOverlay={hasOpenOverlay}
          onClose={() => setContextMenu(null)}
          onDismissOverlay={dismissAllOverlays}
          onInspectEvent={(occ) => setSelectedOccurrence(occ)}
          onEditEvent={openEditModal}
          onDuplicateEvent={handleDuplicateEvent}
          onDeleteEvent={handleDeleteEvent}
          onCreateAt={openCreateModal}
          onCreateInCalendar={handleCreateInCalendar}
          onToggleCalendar={handleToggleCalendar}
          onFocusCalendar={handleFocusCalendar}
          onChangeCalendarColor={handleChangeCalendarColor}
          onChangeView={(mode) => {
            dismissAllOverlays();
            setViewMode(mode);
          }}
          onJumpToDay={(d) => {
            dismissAllOverlays();
            setActiveDate(d);
            setViewMode('day');
          }}
          onToday={() => setActiveDate(new Date())}
          onRescan={() => void scanActiveFolder()}
          onToggleSidebar={handleToggleSidebarCollapsed}
          onToggleTheme={handleSetTheme}
          onOpenShortcuts={() => setShortcutsModalOpen(true)}
          onOpenSettings={() => setSettingsModalOpen(true)}
        />
      )}
    </div>
  );
}
