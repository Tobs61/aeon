import {
  Calendar,
  CalendarDays,
  Check,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  FileCode2,
  Keyboard,
  Moon,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  Trash2,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FOLDER_COLOR_KEYS, FOLDER_COLOR_STYLES } from '../lib/colors.ts';
import { formatHourLabel, formatTimeShort } from '../lib/dateUtils.ts';
import type {
  CalendarViewMode,
  FolderColorKey,
  IcsCalendar,
  IcsOccurrence,
} from '../types/calendar.ts';

export type ContextMenuTarget =
  | { kind: 'event'; occurrence: IcsOccurrence }
  | { kind: 'calendar'; calendar: IcsCalendar }
  | { kind: 'slot'; date: Date; hour: number; allDay?: boolean }
  | { kind: 'general' };

export interface ContextMenuState {
  x: number;
  y: number;
  target: ContextMenuTarget;
}

interface ContextMenuProps {
  state: ContextMenuState;
  calendars: IcsCalendar[];
  viewMode: CalendarViewMode;
  sidebarCollapsed: boolean;
  isDark: boolean;
  onClose: () => void;
  onInspectEvent: (occ: IcsOccurrence) => void;
  onEditEvent: (occ: IcsOccurrence) => void;
  onDuplicateEvent: (occ: IcsOccurrence) => void;
  onDeleteEvent: (occ: IcsOccurrence) => Promise<void>;
  onCreateAt: (date: Date, hour: number, allDay?: boolean) => void;
  onCreateInCalendar: (calendarId: string) => void;
  onToggleCalendar: (calendarId: string) => void;
  onFocusCalendar: (calendarId: string) => void;
  onChangeCalendarColor: (calendarId: string, color: FolderColorKey) => void;
  onChangeView: (mode: CalendarViewMode) => void;
  onJumpToDay: (date: Date) => void;
  onToday: () => void;
  onRescan: () => void;
  onToggleSidebar: () => void;
  onToggleTheme: (dark: boolean) => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
}

export function ContextMenu({
  state,
  calendars,
  viewMode,
  sidebarCollapsed,
  isDark,
  onClose,
  onInspectEvent,
  onEditEvent,
  onDuplicateEvent,
  onDeleteEvent,
  onCreateAt,
  onCreateInCalendar,
  onToggleCalendar,
  onFocusCalendar,
  onChangeCalendarColor,
  onChangeView,
  onJumpToDay,
  onToday,
  onRescan,
  onToggleSidebar,
  onToggleTheme,
  onOpenShortcuts,
  onOpenSettings,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: state.x,
    top: state.y,
  });
  const [copiedIcs, setCopiedIcs] = useState(false);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const padding = 8;
    const maxLeft = Math.max(padding, window.innerWidth - rect.width - padding);
    const maxTop = Math.max(padding, window.innerHeight - rect.height - padding);
    setPos({
      left: Math.min(Math.max(padding, state.x), maxLeft),
      top: Math.min(Math.max(padding, state.y), maxTop),
    });
  }, [state.x, state.y, state.target]);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const handleBlur = () => onClose();

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
    };
  }, [onClose]);

  const itemClass =
    'flex w-full items-center justify-between gap-4 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/90 transition-colors text-left';
  const kbdClass =
    'font-mono text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0';

  const renderViewItems = () => (
    <>
      <div className="my-1 border-t border-neutral-200/80 dark:border-neutral-800" />
      {(
        [
          { mode: 'day', label: 'Day view', kbd: 'D' },
          { mode: 'week', label: 'Week view', kbd: 'W' },
          { mode: 'month', label: 'Month view', kbd: 'M' },
          { mode: 'year', label: 'Year view', kbd: 'Y' },
        ] as Array<{ mode: CalendarViewMode; label: string; kbd: string }>
      ).map((item) => {
        const active = viewMode === item.mode;
        return (
          <button
            key={item.mode}
            type="button"
            onClick={() => {
              onChangeView(item.mode);
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <span className="flex h-3.5 w-3.5 items-center justify-center">
                {active && <Check className="w-3.5 h-3.5 text-neutral-900 dark:text-white" />}
              </span>
              <span>{item.label}</span>
            </span>
            <span className={kbdClass}>{item.kbd}</span>
          </button>
        );
      })}
    </>
  );

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 min-w-[220px] max-w-[270px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-[#141414]/95 backdrop-blur-md shadow-xl p-1.5 select-none"
    >
      {state.target.kind === 'event' && (() => {
        const occ = state.target.occurrence;
        const cal = calendars.find((c) => c.id === occ.event.calendarId);
        const style = FOLDER_COLOR_STYLES[cal?.color ?? 'slate'];
        return (
          <>
            <div className="px-2.5 py-1.5 border-b border-neutral-200/80 dark:border-neutral-800 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${style.swatch}`}
                />
                <span className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                  {occ.event.summary}
                </span>
              </div>
              <div className="mt-0.5 pl-4 text-[11px] font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                {occ.event.allDay
                  ? 'All day'
                  : `${formatTimeShort(occ.startDate)} – ${formatTimeShort(occ.endDate)}`}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onInspectEvent(occ);
                onClose();
              }}
              className={itemClass}
            >
              <span className="flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                <span>Inspect event</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onEditEvent(occ);
                onClose();
              }}
              className={itemClass}
            >
              <span className="flex items-center gap-2">
                <Pencil className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                <span>Edit event</span>
              </span>
              <span className={kbdClass}>E</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onDuplicateEvent(occ);
                onClose();
              }}
              className={itemClass}
            >
              <span className="flex items-center gap-2">
                <CopyPlus className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                <span>Duplicate event</span>
              </span>
            </button>

            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard
                  .writeText(occ.event.rawIcs)
                  .catch(() => undefined);
                setCopiedIcs(true);
                setTimeout(onClose, 250);
              }}
              className={itemClass}
            >
              <span className="flex items-center gap-2">
                {copiedIcs ? (
                  <Copy className="w-3.5 h-3.5 text-neutral-900 dark:text-white" />
                ) : (
                  <FileCode2 className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                )}
                <span>{copiedIcs ? 'Copied .ics' : 'Copy .ics source'}</span>
              </span>
            </button>

            <div className="my-1 border-t border-neutral-200/80 dark:border-neutral-800" />

            <button
              type="button"
              onClick={() => {
                void onDeleteEvent(occ);
                onClose();
              }}
              className="flex w-full items-center justify-between gap-4 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-900 hover:text-white dark:hover:bg-white dark:hover:text-neutral-950 transition-colors text-left"
            >
              <span className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete event</span>
              </span>
            </button>
          </>
        );
      })()}

      {state.target.kind === 'calendar' && (() => {
        const cal = state.target.calendar;
        const displayName = cal.fileName.replace(/\.ics$/i, '');
        return (
          <>
            <div className="px-2.5 py-1.5 border-b border-neutral-200/80 dark:border-neutral-800 mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                {displayName}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-neutral-400 dark:text-neutral-500 shrink-0">
                {cal.eventCount}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                onToggleCalendar(cal.id);
                onClose();
              }}
              className={itemClass}
            >
              <span className="flex items-center gap-2">
                {cal.visible ? (
                  <EyeOff className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                ) : (
                  <Eye className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                )}
                <span>{cal.visible ? 'Hide calendar' : 'Show calendar'}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onFocusCalendar(cal.id);
                onClose();
              }}
              className={itemClass}
            >
              <span className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                <span>Show only this calendar</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onCreateInCalendar(cal.id);
                onClose();
              }}
              className={itemClass}
            >
              <span className="flex items-center gap-2">
                <Plus className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                <span>New event in {displayName}</span>
              </span>
            </button>

            <div className="my-1 border-t border-neutral-200/80 dark:border-neutral-800" />

            <div className="px-2.5 py-1.5">
              <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                Calendar color
              </div>
              <div className="flex items-center justify-between gap-1">
                {FOLDER_COLOR_KEYS.map((key) => {
                  const opt = FOLDER_COLOR_STYLES[key];
                  const active = cal.color === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        onChangeCalendarColor(cal.id, key);
                        onClose();
                      }}
                      title={opt.label}
                      aria-label={`Set ${displayName} color to ${opt.label}`}
                      className={`flex h-4.5 w-4.5 items-center justify-center rounded-full transition-transform hover:scale-110 ${opt.swatch} ${
                        active
                          ? 'ring-2 ring-offset-2 ring-neutral-800 dark:ring-neutral-200 ring-offset-white dark:ring-offset-[#141414]'
                          : ''
                      }`}
                    >
                      {active && (
                        <Check className="w-2.5 h-2.5 text-white stroke-[2.5]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        );
      })()}

      {state.target.kind === 'slot' && (() => {
        const { date, hour, allDay } = state.target;
        const dateLabel = date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        return (
          <>
            <div className="px-2.5 py-1.5 border-b border-neutral-200/80 dark:border-neutral-800 mb-1">
              <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                {dateLabel}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                {allDay ? 'All day' : formatHourLabel(hour)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onCreateAt(date, hour, Boolean(allDay));
                onClose();
              }}
              className={itemClass}
            >
              <span className="flex items-center gap-2">
                <Plus className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                <span>New event here</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onJumpToDay(date);
                onClose();
              }}
              className={itemClass}
            >
              <span className="flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                <span>Open day view</span>
              </span>
              <span className={kbdClass}>D</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onToday();
                onClose();
              }}
              className={itemClass}
            >
              <span className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                <span>Jump to today</span>
              </span>
              <span className={kbdClass}>T</span>
            </button>

            {renderViewItems()}

            <div className="my-1 border-t border-neutral-200/80 dark:border-neutral-800" />

            <button
              type="button"
              onClick={() => {
                onRescan();
                onClose();
              }}
              className={itemClass}
            >
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                <span>Rescan folder</span>
              </span>
              <span className={kbdClass}>R</span>
            </button>
          </>
        );
      })()}

      {state.target.kind === 'general' && (
        <>
          <button
            type="button"
            onClick={() => {
              onCreateAt(new Date(), 9, false);
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
              <span>New event</span>
            </span>
            <span className={kbdClass}>N</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onToday();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
              <span>Jump to today</span>
            </span>
            <span className={kbdClass}>T</span>
          </button>

          {renderViewItems()}

          <div className="my-1 border-t border-neutral-200/80 dark:border-neutral-800" />

          <button
            type="button"
            onClick={() => {
              onToggleSidebar();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <PanelLeft className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
              <span>{sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}</span>
            </span>
            <span className={kbdClass}>B</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onToggleTheme(!isDark);
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              {isDark ? (
                <Sun className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
              )}
              <span>{isDark ? 'Light theme' : 'Dark theme'}</span>
            </span>
            <span className={kbdClass}>\</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onRescan();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
              <span>Rescan folder</span>
            </span>
            <span className={kbdClass}>R</span>
          </button>

          <div className="my-1 border-t border-neutral-200/80 dark:border-neutral-800" />

          <button
            type="button"
            onClick={() => {
              onOpenShortcuts();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <Keyboard className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
              <span>Keyboard shortcuts</span>
            </span>
            <span className={kbdClass}>?</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className={itemClass}
          >
            <span className="flex items-center gap-2">
              <Settings className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
              <span>Settings</span>
            </span>
            <span className={kbdClass}>,</span>
          </button>
        </>
      )}
    </div>
  );
}
