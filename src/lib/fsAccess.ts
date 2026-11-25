import {
  type CalendarNamePref,
  calendarNameKey,
  FOLDER_COLOR_KEYS,
} from './colors.ts';
import {
  parseIcsContent,
  removeEventFromIcsContent,
  type SerializableVEvent,
  serializeCalendarEventsToIcs,
  slugifyIcsFilename,
  upsertEventInIcsContent,
} from './ics.ts';
import type { IcsCalendar, IcsEvent } from '../types/calendar.ts';

export interface LocalRootMount {
  folderName: string;
  handle: FileSystemDirectoryHandle;
}

export interface LocalFileEntry {
  calendarId: string;
  fileName: string;
  relativePath: string;
  fileHandle: FileSystemFileHandle;
}

export interface LocalSnapshotFile {
  calendarId: string;
  fileName: string;
  relativePath: string;
  rawIcs: string;
}

export interface LocalSnapshotMount {
  folderName: string;
  files: Map<string, LocalSnapshotFile>;
}

export function isDirectoryPickerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    typeof (window as unknown as { showDirectoryPicker?: unknown })
      .showDirectoryPicker === 'function'
  );
}

async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<boolean> {
  const permTarget = handle as unknown as {
    queryPermission?: (desc: { mode: string }) => Promise<PermissionState>;
    requestPermission?: (desc: { mode: string }) => Promise<PermissionState>;
  };

  if (typeof permTarget.queryPermission === 'function') {
    const current = await permTarget.queryPermission({ mode });
    if (current === 'granted') return true;
  }
  if (typeof permTarget.requestPermission === 'function') {
    const requested = await permTarget.requestPermission({ mode });
    return requested === 'granted';
  }
  return true;
}

export async function pickLocalRootDirectory(): Promise<LocalRootMount> {
  const picker = (
    window as unknown as {
      showDirectoryPicker: (opts?: {
        mode?: 'read' | 'readwrite';
      }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;

  const dirHandle = await picker({ mode: 'readwrite' });
  const granted = await ensureDirectoryPermission(dirHandle, 'readwrite');
  if (!granted) {
    throw new Error(
      'Read/write permission was not granted for the selected folder.'
    );
  }

  return {
    folderName: dirHandle.name,
    handle: dirHandle,
  };
}

async function walkDirectory(
  dirHandle: FileSystemDirectoryHandle,
  prefix: string,
  out: Array<{
    fileName: string;
    relativePath: string;
    fileHandle: FileSystemFileHandle;
  }>
): Promise<void> {
  const entries = (
    dirHandle as unknown as {
      values: () => AsyncIterable<FileSystemHandle>;
    }
  ).values();

  for await (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.kind === 'directory') {
      await walkDirectory(entry as FileSystemDirectoryHandle, rel, out);
    } else if (
      entry.kind === 'file' &&
      entry.name.toLowerCase().endsWith('.ics')
    ) {
      out.push({
        fileName: entry.name,
        relativePath: rel,
        fileHandle: entry as FileSystemFileHandle,
      });
    }
  }
}

function hydrateLocalCalendars(
  items: LocalSnapshotFile[],
  savedPrefs: Record<string, CalendarNamePref>
): { calendars: IcsCalendar[]; events: IcsEvent[] } {
  const sorted = [...items].sort((a, b) =>
    a.fileName.localeCompare(b.fileName)
  );
  const calendars: IcsCalendar[] = [];
  const events: IcsEvent[] = [];

  for (let idx = 0; idx < sorted.length; idx++) {
    const item = sorted[idx];
    const parsed = parseIcsContent(item.rawIcs, {
      calendarId: item.calendarId,
      fileName: item.fileName,
      relativePath: item.relativePath,
      source: 'local-pc',
    });

    const nameKey = calendarNameKey(item.fileName);
    const pref = savedPrefs[nameKey] ?? savedPrefs[item.calendarId] ?? {};
    const color =
      pref.color ?? FOLDER_COLOR_KEYS[idx % FOLDER_COLOR_KEYS.length];
    const visible = typeof pref.visible === 'boolean' ? pref.visible : true;

    calendars.push({
      id: item.calendarId,
      fileName: item.fileName,
      relativePath: item.relativePath,
      color,
      visible,
      source: 'local-pc',
      eventCount: parsed.length,
    });
    events.push(...parsed);
  }

  return { calendars, events };
}

export async function scanLocalRootRecursive(
  mount: LocalRootMount,
  savedPrefs: Record<string, CalendarNamePref>
): Promise<{
  calendars: IcsCalendar[];
  events: IcsEvent[];
  fileMap: Map<string, LocalFileEntry>;
}> {
  const granted = await ensureDirectoryPermission(mount.handle, 'readwrite');
  if (!granted) {
    throw new Error('Access to the designated folder was denied.');
  }

  const discovered: Array<{
    fileName: string;
    relativePath: string;
    fileHandle: FileSystemFileHandle;
  }> = [];

  await walkDirectory(mount.handle, '', discovered);
  discovered.sort((a, b) => a.fileName.localeCompare(b.fileName));

  const snapshotItems: LocalSnapshotFile[] = [];
  const fileMap = new Map<string, LocalFileEntry>();

  for (const item of discovered) {
    const calendarId = `local::${item.relativePath}`;
    const file = await item.fileHandle.getFile();
    const rawIcs = await file.text();
    snapshotItems.push({
      calendarId,
      fileName: item.fileName,
      relativePath: item.relativePath,
      rawIcs,
    });
    fileMap.set(calendarId, {
      calendarId,
      fileName: item.fileName,
      relativePath: item.relativePath,
      fileHandle: item.fileHandle,
    });
  }

  return { ...hydrateLocalCalendars(snapshotItems, savedPrefs), fileMap };
}

export async function upsertEventInLocalFile(
  fileHandle: FileSystemFileHandle,
  eventData: SerializableVEvent
): Promise<void> {
  const file = await fileHandle.getFile();
  const existingRaw = await file.text();
  const updatedRaw = upsertEventInIcsContent(existingRaw, eventData);
  const writable = await fileHandle.createWritable();
  await writable.write(updatedRaw);
  await writable.close();
}

export async function createNewLocalCalendarFile(
  rootHandle: FileSystemDirectoryHandle,
  rawName: string,
  firstEvent?: SerializableVEvent
): Promise<FileSystemFileHandle> {
  const fileName = slugifyIcsFilename(rawName);
  const fileHandle = await rootHandle.getFileHandle(fileName, { create: true });
  const content = firstEvent
    ? upsertEventInIcsContent(null, firstEvent)
    : serializeCalendarEventsToIcs([]);
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return fileHandle;
}

export async function removeEventFromLocalFile(
  fileHandle: FileSystemFileHandle,
  uid: string
): Promise<void> {
  const file = await fileHandle.getFile();
  const existingRaw = await file.text();
  const updatedRaw = removeEventFromIcsContent(existingRaw, uid);
  const writable = await fileHandle.createWritable();
  await writable.write(updatedRaw);
  await writable.close();
}

export function buildCalendarsFromSnapshot(
  snapshot: LocalSnapshotMount,
  savedPrefs: Record<string, CalendarNamePref>
): {
  calendars: IcsCalendar[];
  events: IcsEvent[];
} {
  return hydrateLocalCalendars(Array.from(snapshot.files.values()), savedPrefs);
}

export async function scanWebkitFolderFiles(
  fileList: FileList | File[],
  savedPrefs: Record<string, CalendarNamePref>
): Promise<{
  mount: LocalSnapshotMount;
  calendars: IcsCalendar[];
  events: IcsEvent[];
}> {
  const rawFiles = Array.from(fileList);
  let folderName = 'Local Folder';
  const map = new Map<string, LocalSnapshotFile>();

  for (const file of rawFiles) {
    const relFull =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name;
    const segments = relFull.split('/').filter(Boolean);
    if (segments.length > 1) {
      folderName = segments[0];
    }

    const innerSegments = segments.length > 1 ? segments.slice(1) : segments;
    if (innerSegments.some((seg) => seg.startsWith('.'))) {
      continue;
    }
    if (!file.name.toLowerCase().endsWith('.ics')) {
      continue;
    }

    const relativePath = innerSegments.join('/') || file.name;
    const calendarId = `local::${relativePath}`;
    const rawIcs = await file.text();
    map.set(calendarId, {
      calendarId,
      fileName: file.name,
      relativePath,
      rawIcs,
    });
  }

  const mount: LocalSnapshotMount = { folderName, files: map };
  const parsed = buildCalendarsFromSnapshot(mount, savedPrefs);
  return { mount, ...parsed };
}
