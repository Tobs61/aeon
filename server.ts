import express from 'express';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  parseIcsContent,
  removeEventFromIcsContent,
  serializeCalendarEventsToIcs,
  type SerializableVEvent,
  slugifyIcsFilename,
  upsertEventInIcsContent,
} from './src/lib/ics.ts';
import type {
  FolderColorKey,
  IcsCalendar,
  IcsEvent,
} from './src/types/calendar.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const CALENDARS_ROOT = path.resolve(DATA_DIR, 'calendars');
const PREFS_FILE = path.resolve(DATA_DIR, '.aeon-calendars.json');

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

function sanitizeLogText(value: unknown, maxLen = 140): string {
  const cleaned = String(value ?? '')
    .replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 3)}...`;
}

function writeLog(level: LogLevel, message: string): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [aeon] ${level.padEnd(5, ' ')} ${message}`;
  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function logInfo(message: string): void {
  writeLog('INFO', message);
}

function logWarn(message: string): void {
  writeLog('WARN', message);
}

function logError(message: string, err?: unknown): void {
  if (err instanceof Error) {
    writeLog('ERROR', `${message}: ${sanitizeLogText(err.message, 240)}`);
    if (err.stack) {
      console.error(err.stack);
    }
  } else if (err !== undefined) {
    writeLog('ERROR', `${message}: ${sanitizeLogText(err, 240)}`);
  } else {
    writeLog('ERROR', message);
  }
}

const COLOR_CYCLE: FolderColorKey[] = [
  'blue',
  'emerald',
  'teal',
  'amber',
  'rose',
  'indigo',
  'violet',
  'slate',
];

const ALLOWED_COLORS = new Set<FolderColorKey>(COLOR_CYCLE);

function calendarNameKey(fileNameOrPath: string): string {
  const base = fileNameOrPath.split('/').pop() ?? fileNameOrPath;
  return base.replace(/\.ics$/i, '').trim().toLowerCase();
}

interface CalendarPref {
  color?: FolderColorKey;
  visible?: boolean;
}

function isValidRelativeIcsPath(rel: string): boolean {
  if (!rel || rel.includes('..') || rel.startsWith('/') || rel.includes('\\')) {
    return false;
  }
  const segments = rel.split('/');
  if (segments.length === 0) return false;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg || seg.startsWith('.')) return false;
    if (!/^[a-zA-Z0-9._-]{1,120}$/.test(seg)) return false;
  }
  return rel.toLowerCase().endsWith('.ics');
}

function resolveInsideCalendars(relativePath: string): string {
  const target = path.resolve(CALENDARS_ROOT, relativePath);
  if (!target.startsWith(CALENDARS_ROOT + path.sep)) {
    throw new Error('Path escapes calendars directory');
  }
  return target;
}

async function readCalendarPrefs(): Promise<Record<string, CalendarPref>> {
  try {
    const raw = await fs.readFile(PREFS_FILE, 'utf8');
    return JSON.parse(raw) as Record<string, CalendarPref>;
  } catch {
    return {};
  }
}

async function writeCalendarPrefs(
  prefs: Record<string, CalendarPref>
): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PREFS_FILE, JSON.stringify(prefs, null, 2), 'utf8');
}

async function seedModularCalendars(): Promise<void> {
  await fs.mkdir(CALENDARS_ROOT, { recursive: true });
  const existing = await fs.readdir(CALENDARS_ROOT);

  if (existing.length > 0) {
    logInfo(
      `Workspace calendar directory ready (${existing.length} top-level entry/entries); skipping starter seed.`
    );
    return;
  }

  const seedFiles: Array<{
    relativePath: string;
    color: FolderColorKey;
    name: string;
    events: SerializableVEvent[];
  }> = [
    {
      relativePath: 'personal/personal.ics',
      color: 'emerald',
      name: 'Personal',
      events: [
        {
          uid: 'aeon-p101@local',
          summary: 'Morning Trail Run',
          location: 'Forest Park Loop',
          description: '5km steady pace before work.',
          start: '2026-11-16T07:00:00',
          end: '2026-11-16T07:50:00',
          allDay: false,
          rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
          status: 'CONFIRMED',
        },
        {
          uid: 'aeon-p102@local',
          summary: 'Dental Checkup',
          location: 'Cedar Street Clinic',
          description: 'Six-month routine cleaning.',
          start: '2026-11-19T16:30:00',
          end: '2026-11-19T17:15:00',
          allDay: false,
          status: 'CONFIRMED',
        },
        {
          uid: 'aeon-p103@local',
          summary: 'Quiet Reading & Coffee',
          location: 'Home Study',
          description:
            'Finish chapter 7 of Designing Data-Intensive Applications.',
          start: '2026-11-22T09:30:00',
          end: '2026-11-22T11:00:00',
          allDay: false,
          status: 'CONFIRMED',
        },
      ],
    },
    {
      relativePath: 'work/work.ics',
      color: 'blue',
      name: 'Work',
      events: [
        {
          uid: 'aeon-w201@local',
          summary: 'Engineering Sprint Planning',
          location: 'Room 3B / Matrix Call',
          description: 'Triage milestone tickets and review Q4 deliverables.',
          start: '2026-11-16T10:00:00',
          end: '2026-11-16T11:30:00',
          allDay: false,
          rrule: 'FREQ=WEEKLY;BYDAY=MO',
          status: 'CONFIRMED',
        },
        {
          uid: 'aeon-w202@local',
          summary: 'Storage Engine Review',
          location: 'Main Lab',
          description: 'Review WAL compaction benchmarks and zero-copy parser.',
          start: '2026-11-18T14:00:00',
          end: '2026-11-18T15:00:00',
          allDay: false,
          status: 'CONFIRMED',
        },
        {
          uid: 'aeon-w203@local',
          summary: 'v2.4 Release Freeze',
          description:
            'No feature merges after 17:00 UTC; regression suite only.',
          start: '2026-11-20',
          end: '2026-11-21',
          allDay: true,
          status: 'CONFIRMED',
        },
        {
          uid: 'aeon-w204@local',
          summary: 'Weekly Design Sync',
          location: 'Studio Desk',
          description: 'Keyboard shortcuts and high-contrast theme audit.',
          start: '2026-11-24T11:00:00',
          end: '2026-11-24T12:00:00',
          allDay: false,
          status: 'TENTATIVE',
        },
      ],
    },
    {
      relativePath: 'community/debian.ics',
      color: 'rose',
      name: 'Debian',
      events: [
        {
          uid: 'aeon-d301@local',
          summary: 'Unattended Upgrades & Snapshot',
          location: 'thinkpad-t14 (Debian Bookworm)',
          description:
            'Run apt update && apt full-upgrade, verify btrfs root snapshot.',
          start: '2026-11-21T11:00:00',
          end: '2026-11-21T12:00:00',
          allDay: false,
          rrule: 'FREQ=WEEKLY;BYDAY=SA',
          status: 'CONFIRMED',
        },
        {
          uid: 'aeon-d302@local',
          summary: 'Debian Local Packaging Meetup',
          location: 'Hackerspace Civic Center',
          description:
            'Building clean .deb bundles for Rust & Tauri desktop apps.',
          start: '2026-11-22T18:00:00',
          end: '2026-11-22T20:00:00',
          allDay: false,
          status: 'CONFIRMED',
        },
        {
          uid: 'aeon-d303@local',
          summary: 'Debian Backports Kernel Check',
          description: 'Test 6.12 backports kernel image on workstation.',
          start: '2026-11-26T15:00:00',
          end: '2026-11-26T16:00:00',
          allDay: false,
          status: 'CONFIRMED',
        },
      ],
    },
  ];

  const prefs = await readCalendarPrefs();
  for (const item of seedFiles) {
    const dest = resolveInsideCalendars(item.relativePath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(
      dest,
      serializeCalendarEventsToIcs(item.events, item.name),
      'utf8'
    );
    prefs[item.relativePath] = { color: item.color, visible: true };
  }
  await writeCalendarPrefs(prefs);
  logInfo(
    `Seeded ${seedFiles.length} modular .ics calendars: ${seedFiles
      .map((s) => path.basename(s.relativePath))
      .join(', ')}`
  );
}

async function walkIcsFiles(
  dirPath: string,
  prefix: string,
  out: Array<{ fileName: string; relativePath: string; fullPath: string }>
): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      await walkIcsFiles(fullPath, rel, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.ics')) {
      out.push({ fileName: entry.name, relativePath: rel, fullPath });
    }
  }
}

async function scanWorkspaceCalendars(): Promise<{
  rootFolderName: string;
  calendars: IcsCalendar[];
  events: IcsEvent[];
  scannedAt: string;
}> {
  await fs.mkdir(CALENDARS_ROOT, { recursive: true });
  const prefs = await readCalendarPrefs();
  const discovered: Array<{
    fileName: string;
    relativePath: string;
    fullPath: string;
  }> = [];

  await walkIcsFiles(CALENDARS_ROOT, '', discovered);
  discovered.sort((a, b) => a.fileName.localeCompare(b.fileName));

  const calendars: IcsCalendar[] = [];
  const events: IcsEvent[] = [];

  for (let idx = 0; idx < discovered.length; idx++) {
    const file = discovered[idx];
    const raw = await fs.readFile(file.fullPath, 'utf8');
    const calendarId = file.relativePath;
    const parsed = parseIcsContent(raw, {
      calendarId,
      fileName: file.fileName,
      relativePath: file.relativePath,
      source: 'workspace',
    });

    const nameKey = calendarNameKey(file.fileName);
    const pref = prefs[nameKey] ?? prefs[file.relativePath] ?? {};
    const color =
      pref.color && ALLOWED_COLORS.has(pref.color)
        ? pref.color
        : COLOR_CYCLE[idx % COLOR_CYCLE.length];
    const visible = typeof pref.visible === 'boolean' ? pref.visible : true;

    calendars.push({
      id: calendarId,
      fileName: file.fileName,
      relativePath: file.relativePath,
      color,
      visible,
      source: 'workspace',
      eventCount: parsed.length,
    });
    events.push(...parsed);
  }

  return {
    rootFolderName: 'Calendars (Workspace)',
    calendars,
    events,
    scannedAt: new Date().toISOString(),
  };
}

async function startServer(): Promise<void> {
  const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  logInfo(
    `Starting Aeon server (mode=${mode}, node=${process.version}, pid=${process.pid})`
  );
  logInfo(`Workspace calendars root: ${CALENDARS_ROOT}`);
  logInfo(`Preferences file: ${PREFS_FILE}`);

  await seedModularCalendars();

  const initialScan = await scanWorkspaceCalendars();
  const fileSummary = initialScan.calendars
    .map((c) => `${c.fileName} (${c.eventCount})`)
    .join(', ');
  logInfo(
    `Initial .ics scan complete: ${initialScan.calendars.length} calendar(s), ${initialScan.events.length} event(s)${
      fileSummary ? ` [${fileSummary}]` : ''
    }`
  );

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Terminal request logger for all API routes
  app.use('/api', (req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const elapsedMs = Date.now() - startedAt;
      const line = `[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsedMs}ms)`;
      if (res.statusCode >= 500) {
        logError(line);
      } else if (res.statusCode >= 400) {
        logWarn(line);
      } else {
        logInfo(line);
      }
    });
    next();
  });

  // Recursively scan all sub-folders & files for .ics calendars
  app.get('/api/scan', async (_req, res) => {
    try {
      const result = await scanWorkspaceCalendars();
      logInfo(
        `Scanned workspace .ics files: ${result.calendars.length} calendar(s), ${result.events.length} event(s)`
      );
      res.json(result);
    } catch (err) {
      logError('Failed to scan calendars', err);
      res.status(500).json({ error: 'Failed to scan .ics calendars.' });
    }
  });

  // Update calendar visibility or color (saved keyed by calendar name)
  app.patch('/api/calendars', async (req, res) => {
    try {
      const rawRef = String(
        req.body?.calendarName || req.body?.relativePath || ''
      ).trim();
      const nameKey = calendarNameKey(rawRef);
      if (!nameKey || nameKey.includes('..') || !/^[a-z0-9._-]{1,120}$/.test(nameKey)) {
        logWarn(`Rejected calendar prefs update with invalid name: "${sanitizeLogText(rawRef)}"`);
        res.status(400).json({ error: 'Invalid calendar name.' });
        return;
      }

      const prefs = await readCalendarPrefs();
      const current = prefs[nameKey] ?? (rawRef ? prefs[rawRef] : undefined) ?? {};
      const nextColor = ALLOWED_COLORS.has(req.body?.color)
        ? (req.body.color as FolderColorKey)
        : current.color;
      const nextVisible =
        typeof req.body?.visible === 'boolean'
          ? req.body.visible
          : current.visible;
      prefs[nameKey] = {
        color: nextColor,
        visible: nextVisible,
      };
      await writeCalendarPrefs(prefs);
      logInfo(
        `Saved calendar preferences for "${sanitizeLogText(nameKey)}" (visible=${String(
          nextVisible ?? true
        )}, color=${nextColor ?? 'default'})`
      );
      res.json({ ok: true });
    } catch (err) {
      logError('Failed to update calendar prefs', err);
      res.status(500).json({ error: 'Failed to update calendar preferences.' });
    }
  });

  // Create a new empty .ics calendar file
  app.post('/api/calendars', async (req, res) => {
    try {
      const fileName = slugifyIcsFilename(String(req.body?.name || 'calendar'));
      const color = ALLOWED_COLORS.has(req.body?.color)
        ? (req.body.color as FolderColorKey)
        : 'blue';

      if (!isValidRelativeIcsPath(fileName)) {
        res.status(400).json({ error: 'Invalid .ics filename.' });
        return;
      }

      const dest = resolveInsideCalendars(fileName);
      const exists = await fs
        .stat(dest)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        res.status(409).json({ error: `${fileName} already exists.` });
        return;
      }

      await fs.writeFile(
        dest,
        serializeCalendarEventsToIcs([], fileName.replace(/\.ics$/i, '')),
        'utf8'
      );
      const prefs = await readCalendarPrefs();
      prefs[calendarNameKey(fileName)] = { color, visible: true };
      await writeCalendarPrefs(prefs);

      const scan = await scanWorkspaceCalendars();
      logInfo(`Created calendar file "${sanitizeLogText(fileName)}" (color=${color})`);
      res.status(201).json(scan);
    } catch (err) {
      logError('Failed to create .ics calendar', err);
      res.status(500).json({ error: 'Failed to create .ics calendar.' });
    }
  });

  // Create a new event inside an existing .ics file or a brand-new .ics file
  app.post('/api/events', async (req, res) => {
    try {
      const {
        relativePath,
        newFileName,
        summary,
        description,
        location,
        start,
        end,
        allDay,
        rrule,
        status,
      } = req.body ?? {};

      if (!summary || !String(summary).trim()) {
        res.status(400).json({ error: 'Event title is required.' });
        return;
      }
      if (!start || !end) {
        res.status(400).json({ error: 'Start and end times are required.' });
        return;
      }

      const targetRel = newFileName
        ? slugifyIcsFilename(String(newFileName))
        : String(relativePath || '');

      if (!isValidRelativeIcsPath(targetRel)) {
        res.status(400).json({ error: 'Valid target .ics file is required.' });
        return;
      }

      const destPath = resolveInsideCalendars(targetRel);
      await fs.mkdir(path.dirname(destPath), { recursive: true });

      const existingRaw = await fs.readFile(destPath, 'utf8').catch(() => null);
      const uid = `aeon-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 7)}@local`;

      const updatedRaw = upsertEventInIcsContent(existingRaw, {
        uid,
        summary: String(summary).trim(),
        description: description ? String(description) : undefined,
        location: location ? String(location) : undefined,
        start: String(start),
        end: String(end),
        allDay: Boolean(allDay),
        rrule: rrule ? String(rrule) : undefined,
        status:
          status === 'TENTATIVE' || status === 'CANCELLED'
            ? status
            : 'CONFIRMED',
      });

      await fs.writeFile(destPath, updatedRaw, 'utf8');
      logInfo(
        `Created event "${sanitizeLogText(summary)}" [${uid}] in "${sanitizeLogText(targetRel)}" (${Boolean(allDay) ? 'all-day' : `${sanitizeLogText(start)} -> ${sanitizeLogText(end)}`})`
      );
      res.status(201).json({ ok: true, relativePath: targetRel, uid });
    } catch (err) {
      logError('Failed to save event', err);
      res.status(500).json({ error: 'Failed to save event to .ics file.' });
    }
  });

  // Update an existing VEVENT by UID inside its .ics file (or move across .ics files)
  app.put('/api/events', async (req, res) => {
    try {
      const {
        originalRelativePath,
        relativePath,
        newFileName,
        uid,
        summary,
        description,
        location,
        start,
        end,
        allDay,
        rrule,
        status,
      } = req.body ?? {};

      const targetRel = newFileName
        ? slugifyIcsFilename(String(newFileName))
        : String(relativePath || '');

      if (
        !isValidRelativeIcsPath(String(originalRelativePath || '')) ||
        !isValidRelativeIcsPath(targetRel)
      ) {
        res.status(400).json({ error: 'Invalid .ics calendar path.' });
        return;
      }
      if (!uid || !summary || !String(summary).trim()) {
        res.status(400).json({ error: 'Event UID and title are required.' });
        return;
      }

      const oldFullPath = resolveInsideCalendars(String(originalRelativePath));
      const newFullPath = resolveInsideCalendars(targetRel);
      await fs.mkdir(path.dirname(newFullPath), { recursive: true });

      const eventPayload: SerializableVEvent = {
        uid: String(uid),
        summary: String(summary).trim(),
        description: description ? String(description) : undefined,
        location: location ? String(location) : undefined,
        start: String(start),
        end: String(end),
        allDay: Boolean(allDay),
        rrule: rrule ? String(rrule) : undefined,
        status:
          status === 'TENTATIVE' || status === 'CANCELLED'
            ? status
            : 'CONFIRMED',
      };

      if (oldFullPath !== newFullPath) {
        const oldRaw = await fs.readFile(oldFullPath, 'utf8').catch(() => '');
        if (oldRaw) {
          await fs.writeFile(
            oldFullPath,
            removeEventFromIcsContent(oldRaw, String(uid)),
            'utf8'
          );
        }
      }

      const targetRaw = await fs
        .readFile(newFullPath, 'utf8')
        .catch(() => null);
      await fs.writeFile(
        newFullPath,
        upsertEventInIcsContent(targetRaw, eventPayload),
        'utf8'
      );

      const moveNote =
        oldFullPath !== newFullPath
          ? ` (moved from "${sanitizeLogText(originalRelativePath)}")`
          : '';
      logInfo(
        `Updated event "${sanitizeLogText(summary)}" [${sanitizeLogText(uid)}] in "${sanitizeLogText(targetRel)}"${moveNote}`
      );
      res.json({ ok: true, relativePath: targetRel });
    } catch (err) {
      logError('Failed to update event', err);
      res.status(500).json({ error: 'Failed to update event in .ics file.' });
    }
  });

  // Delete a VEVENT by UID from its .ics file
  app.delete('/api/events', async (req, res) => {
    try {
      const relativePath = String(req.body?.relativePath || '');
      const uid = String(req.body?.uid || '');

      if (!isValidRelativeIcsPath(relativePath) || !uid) {
        res.status(400).json({ error: 'Invalid .ics file or event UID.' });
        return;
      }

      const fullPath = resolveInsideCalendars(relativePath);
      const existingRaw = await fs.readFile(fullPath, 'utf8');
      const nextRaw = removeEventFromIcsContent(existingRaw, uid);
      await fs.writeFile(fullPath, nextRaw, 'utf8');
      logInfo(
        `Deleted event [${sanitizeLogText(uid)}] from "${sanitizeLogText(relativePath)}"`
      );
      res.json({ ok: true });
    } catch (err) {
      logError('Failed to delete event', err);
      res.status(500).json({ error: 'Failed to remove event from .ics file.' });
    }
  });

  // Import one or more .ics files into workspace root
  app.post('/api/import', async (req, res) => {
    try {
      const files = Array.isArray(req.body?.files) ? req.body.files : [];
      let importedCount = 0;

      for (const item of files) {
        const safeName = slugifyIcsFilename(
          String(item?.fileName || 'imported.ics')
        );
        const content = String(item?.content || '');
        if (!content.includes('BEGIN:VCALENDAR')) continue;
        if (!isValidRelativeIcsPath(safeName)) continue;

        const destPath = resolveInsideCalendars(safeName);
        await fs.writeFile(destPath, content, 'utf8');
        importedCount++;
      }

      const scan = await scanWorkspaceCalendars();
      logInfo(`Imported ${importedCount} .ics file(s) into workspace`);
      res.status(201).json({ importedCount, ...scan });
    } catch (err) {
      logError('Failed to import .ics files', err);
      res.status(500).json({ error: 'Failed to import .ics files.' });
    }
  });

  // Forward sanitized local-PC folder operations to terminal stdout/stderr
  app.post('/api/log', (req, res) => {
    const levelRaw = String(req.body?.level || 'INFO').toUpperCase();
    const action = sanitizeLogText(req.body?.action || 'client', 48);
    const detail = sanitizeLogText(req.body?.detail || '', 200);
    if (action) {
      const msg = detail ? `[local-pc:${action}] ${detail}` : `[local-pc:${action}]`;
      if (levelRaw === 'ERROR') {
        logError(msg);
      } else if (levelRaw === 'WARN') {
        logWarn(msg);
      } else {
        logInfo(msg);
      }
    }
    res.status(204).end();
  });

  const httpServer = http.createServer(app);

  if (mode === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    logInfo(`Serving static production bundle from ${distDir}`);
    app.use(express.static(distDir));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const hmrEnabled = process.env.DISABLE_HMR !== 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: hmrEnabled,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    logInfo(`Vite dev middleware attached (HMR ${hmrEnabled ? 'enabled' : 'disabled'})`);
  }

  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      logError(`Unhandled error on ${req.method} ${req.originalUrl}`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error.' });
      }
    }
  );

  httpServer.listen(PORT, '0.0.0.0', () => {
    logInfo(
      `Aeon local .ics server ready at http://localhost:${PORT} (listening on 0.0.0.0:${PORT})`
    );
  });

  const shutdown = (signal: NodeJS.Signals) => {
    logInfo(`Received ${signal}; shutting down Aeon server...`);
    httpServer.close((closeErr) => {
      if (closeErr) {
        logError('Error while closing HTTP server', closeErr);
        process.exit(1);
      }
      logInfo('Aeon server stopped cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  logError('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (err) => {
  logError('Uncaught exception', err);
  process.exit(1);
});

startServer().catch((err) => {
  logError('Aeon server failed to start', err);
  process.exit(1);
});
