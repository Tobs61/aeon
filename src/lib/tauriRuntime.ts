import { getCurrentWindow } from '@tauri-apps/api/window';
import type {
  FolderColorKey,
  IcsCalendar,
  IcsEvent,
} from '../types/calendar.ts';
import {
  parseIcsContent,
  removeEventFromIcsContent,
  type SerializableVEvent,
  serializeCalendarEventsToIcs,
  slugifyIcsFilename,
  upsertEventInIcsContent,
} from './ics.ts';

interface TauriInvokeApi {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

interface TauriWindow extends Window {
  __TAURI__?: {
    core?: TauriInvokeApi;
  };
  __TAURI_INTERNALS__?: TauriInvokeApi;
}

export interface TauriFolderInfo {
  rootFolderName: string;
  isDefault: boolean;
}

interface TauriScannedFile {
  fileName: string;
  relativePath: string;
  rawIcs: string;
  color: FolderColorKey;
  visible: boolean;
}

interface TauriScanResult {
  rootFolderName: string;
  isDefault: boolean;
  files: TauriScannedFile[];
}

function getInvoke(): TauriInvokeApi['invoke'] | null {
  if (typeof window === 'undefined') return null;
  const w = window as TauriWindow;
  if (typeof w.__TAURI__?.core?.invoke === 'function') {
    return w.__TAURI__.core.invoke.bind(w.__TAURI__.core);
  }
  if (typeof w.__TAURI_INTERNALS__?.invoke === 'function') {
    return w.__TAURI_INTERNALS__.invoke.bind(w.__TAURI_INTERNALS__);
  }
  return null;
}

export function isTauriRuntime(): boolean {
  return getInvoke() !== null;
}

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const invoke = getInvoke();
  if (!invoke) {
    throw new Error('Tauri runtime is not available.');
  }
  return invoke<T>(cmd, args);
}

export async function tauriLog(
  level: 'INFO' | 'WARN' | 'ERROR',
  action: string,
  detail: string
): Promise<void> {
  if (!isTauriRuntime()) return;
  await tauriInvoke<void>('log_from_frontend', { level, action, detail }).catch(
    () => undefined
  );
}

export async function tauriPickCalendarFolder(): Promise<TauriFolderInfo | null> {
  return tauriInvoke<TauriFolderInfo | null>('pick_calendar_folder');
}

export async function tauriScanCalendars(): Promise<{
  rootFolderName: string;
  isDefault: boolean;
  calendars: IcsCalendar[];
  events: IcsEvent[];
}> {
  const res = await tauriInvoke<TauriScanResult>('scan_ics_folder');
  const calendars: IcsCalendar[] = [];
  const events: IcsEvent[] = [];

  for (const file of res.files) {
    const parsed = parseIcsContent(file.rawIcs, {
      calendarId: file.relativePath,
      fileName: file.fileName,
      relativePath: file.relativePath,
      source: 'local-pc',
    });
    calendars.push({
      id: file.relativePath,
      fileName: file.fileName,
      relativePath: file.relativePath,
      color: file.color,
      visible: file.visible,
      source: 'local-pc',
      eventCount: parsed.length,
    });
    events.push(...parsed);
  }

  return {
    rootFolderName: res.rootFolderName,
    isDefault: res.isDefault,
    calendars,
    events,
  };
}

export async function tauriUpdateCalendarPrefs(
  relativePath: string,
  prefs: { color?: FolderColorKey; visible?: boolean }
): Promise<void> {
  await tauriInvoke<void>('update_calendar_prefs', {
    relativePath,
    color: prefs.color ?? null,
    visible: typeof prefs.visible === 'boolean' ? prefs.visible : null,
  });
}

export async function tauriCreateCalendarFile(
  rawName: string,
  firstEvent?: SerializableVEvent
): Promise<string> {
  const fileName = slugifyIcsFilename(rawName);
  const content = firstEvent
    ? upsertEventInIcsContent(null, firstEvent)
    : serializeCalendarEventsToIcs([]);
  await tauriInvoke<void>('write_ics_file', {
    relativePath: fileName,
    content,
    createOnly: true,
  });
  return fileName;
}

export async function tauriUpsertEvent(
  targetRelativePath: string,
  eventData: SerializableVEvent,
  originalRelativePath?: string
): Promise<void> {
  if (originalRelativePath && originalRelativePath !== targetRelativePath) {
    const oldRaw = await tauriInvoke<string | null>('read_ics_file', {
      relativePath: originalRelativePath,
    });
    if (oldRaw) {
      const cleaned = removeEventFromIcsContent(oldRaw, eventData.uid);
      await tauriInvoke<void>('write_ics_file', {
        relativePath: originalRelativePath,
        content: cleaned,
        createOnly: false,
      });
    }
  }

  const existingRaw = await tauriInvoke<string | null>('read_ics_file', {
    relativePath: targetRelativePath,
  });
  const nextRaw = upsertEventInIcsContent(existingRaw, eventData);
  await tauriInvoke<void>('write_ics_file', {
    relativePath: targetRelativePath,
    content: nextRaw,
    createOnly: false,
  });
}

export async function tauriDeleteEvent(
  relativePath: string,
  uid: string
): Promise<void> {
  const existingRaw = await tauriInvoke<string | null>('read_ics_file', {
    relativePath,
  });
  if (!existingRaw) return;
  const nextRaw = removeEventFromIcsContent(existingRaw, uid);
  await tauriInvoke<void>('write_ics_file', {
    relativePath,
    content: nextRaw,
    createOnly: false,
  });
}

export async function tauriMinimizeWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  await getCurrentWindow().minimize();
}

export async function tauriToggleMaximizeWindow(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const win = getCurrentWindow();
  await win.toggleMaximize();
  return win.isMaximized();
}

export async function tauriCloseWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  await getCurrentWindow().close();
}

export async function tauriStartDragging(): Promise<void> {
  if (!isTauriRuntime()) return;
  await getCurrentWindow().startDragging();
}

export async function tauriSubscribeWindowMaximized(
  onChange: (maximized: boolean) => void
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined;
  const win = getCurrentWindow();
  onChange(await win.isMaximized().catch(() => false));
  const unlisten = await win.onResized(async () => {
    const maximized = await win.isMaximized().catch(() => false);
    onChange(maximized);
  });
  return unlisten;
}
