import {
  Check,
  ChevronLeft,
  ChevronRight,
  Palette,
  PanelLeftClose,
  Settings,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { FOLDER_COLOR_KEYS, FOLDER_COLOR_STYLES } from '../lib/colors.ts';
import {
  getMonthGridDays,
  getOrderedWeekdays,
  isSameDay,
} from '../lib/dateUtils.ts';
import { useWheelPeriodStep } from '../lib/useWheelPeriodStep.ts';
import type {
  FirstDayOfWeek,
  FolderColorKey,
  IcsCalendar,
} from '../types/calendar.ts';

interface SidebarProps {
  calendars: IcsCalendar[];
  activeDate: Date;
  firstDayOfWeek: FirstDayOfWeek;
  onSelectDate: (date: Date) => void;
  onToggleCalendar: (calendarId: string) => void;
  onChangeCalendarColor: (calendarId: string, color: FolderColorKey) => void;
  onOpenSettings: () => void;
  onCalendarContextMenu?: (e: React.MouseEvent, calendar: IcsCalendar) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  calendars,
  activeDate,
  firstDayOfWeek,
  onSelectDate,
  onToggleCalendar,
  onChangeCalendarColor,
  onOpenSettings,
  onCalendarContextMenu,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [miniMonthCursor, setMiniMonthCursor] = useState<Date>(
    () => new Date(activeDate.getFullYear(), activeDate.getMonth(), 1)
  );
  const [colorPickerCalId, setColorPickerCalId] = useState<string | null>(null);

  useEffect(() => {
    setMiniMonthCursor((prev) => {
      if (
        prev.getFullYear() === activeDate.getFullYear() &&
        prev.getMonth() === activeDate.getMonth()
      ) {
        return prev;
      }
      return new Date(activeDate.getFullYear(), activeDate.getMonth(), 1);
    });
  }, [activeDate]);

  useEffect(() => {
    if (!colorPickerCalId) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setColorPickerCalId(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [colorPickerCalId]);

  const today = new Date();
  const miniDays = getMonthGridDays(miniMonthCursor, firstDayOfWeek);
  const weekdayLabels = getOrderedWeekdays(firstDayOfWeek, 'narrow');
  const miniMonthLabel = miniMonthCursor.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  const handleMiniPrev = () => {
    setMiniMonthCursor(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    );
  };

  const handleMiniNext = () => {
    setMiniMonthCursor(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    );
  };

  const handleMiniWheel = useWheelPeriodStep({
    onPrev: handleMiniPrev,
    onNext: handleMiniNext,
    cooldownMs: 260,
    threshold: 24,
  });

  const renderContent = (isMobileDrawer: boolean) => (
    <div className="flex h-full w-[260px] flex-col bg-neutral-50 dark:bg-[#0f0f0f] border-r border-neutral-200 dark:border-neutral-800 select-none">
      {/* Brand Lockup + Collapse Button */}
      <div className="flex h-14 items-center justify-between px-5 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-black border border-neutral-800/80 p-1 shrink-0">
            <img
              src="/assets/aeon-logo.svg"
              alt="Aeon logo"
              className="h-full w-full object-contain"
            />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight text-neutral-900 dark:text-white whitespace-nowrap">
            Aeon
          </span>
        </div>

        {isMobileDrawer ? (
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1.5 -mr-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Collapse sidebar"
            title="Collapse sidebar (B)"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mini Month Navigator (wheel scrolls months) */}
      <div
        onWheel={handleMiniWheel}
        className="px-4 pt-4 pb-3.5 border-b border-neutral-200/80 dark:border-neutral-800/80"
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 tracking-tight">
            {miniMonthLabel}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={handleMiniPrev}
              className="p-1 rounded-lg hover:bg-neutral-200/70 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleMiniNext}
              className="p-1 rounded-lg hover:bg-neutral-200/70 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-y-1 text-center">
          {weekdayLabels.map((label, idx) => (
            <div
              key={idx}
              className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 py-0.5"
            >
              {label}
            </div>
          ))}
          {miniDays.map((day) => {
            const inMonth = day.getMonth() === miniMonthCursor.getMonth();
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, activeDate);
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => {
                  onSelectDate(day);
                  onCloseMobile();
                }}
                className={`mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-xs tabular-nums transition-colors ${
                  isToday
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-semibold'
                    : isSelected
                      ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium'
                      : inMonth
                        ? 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800/70'
                        : 'text-neutral-400 dark:text-neutral-600 hover:bg-neutral-200/40 dark:hover:bg-neutral-800/40'
                }`}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Modular Calendars (name only, with per-calendar color picker) */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        onClick={() => setColorPickerCalId(null)}
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            Calendars
          </span>
        </div>

        <div className="space-y-1">
          {calendars.map((cal) => {
            const colorStyle =
              FOLDER_COLOR_STYLES[cal.color] ?? FOLDER_COLOR_STYLES.slate;
            const displayName = cal.fileName.replace(/\.ics$/i, '');
            const pickerOpen = colorPickerCalId === cal.id;

            return (
              <div key={cal.id} className="space-y-1">
                <div
                  onContextMenu={(e) => onCalendarContextMenu?.(e, cal)}
                  className={`group flex w-full items-center justify-between rounded-xl px-2 py-1.5 transition-colors ${
                    pickerOpen
                      ? 'bg-neutral-200/70 dark:bg-neutral-800/75'
                      : 'hover:bg-neutral-200/55 dark:hover:bg-neutral-800/55'
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCalendar(cal.id);
                    }}
                    className="flex flex-1 items-center gap-2.5 min-w-0 text-left"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        cal.visible
                          ? `${colorStyle.swatch} border-transparent text-white`
                          : 'border-neutral-300 dark:border-neutral-700 bg-transparent'
                      }`}
                    >
                      {cal.visible && <Check className="w-3 h-3 stroke-[2.5]" />}
                    </span>
                    <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                      {displayName}
                    </span>
                  </button>

                  <div className="flex items-center gap-1 ml-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setColorPickerCalId((curr) =>
                          curr === cal.id ? null : cal.id
                        );
                      }}
                      title={`Choose color for ${displayName}`}
                      aria-label={`Choose color for ${displayName}`}
                      aria-expanded={pickerOpen}
                      className={`p-1 rounded-lg transition-all ${
                        pickerOpen
                          ? 'opacity-100 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white'
                          : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-white hover:bg-white/80 dark:hover:bg-neutral-900/80'
                      }`}
                    >
                      <Palette className="w-3.5 h-3.5" />
                    </button>

                    <span className="min-w-[16px] text-right text-xs font-mono tabular-nums text-neutral-400 dark:text-neutral-500">
                      {cal.eventCount}
                    </span>
                  </div>
                </div>

                {pickerOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mx-1 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#171717] p-2 shadow-sm"
                  >
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
                              setColorPickerCalId(null);
                            }}
                            title={opt.label}
                            aria-label={`${displayName} color: ${opt.label}`}
                            className={`flex h-5 w-5 items-center justify-center rounded-full transition-transform hover:scale-110 ${opt.swatch} ${
                              active
                                ? 'ring-2 ring-offset-2 ring-neutral-800 dark:ring-neutral-200 ring-offset-white dark:ring-offset-[#171717]'
                                : ''
                            }`}
                          >
                            {active && (
                              <Check className="w-3 h-3 text-white stroke-[2.5]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {calendars.length === 0 && (
            <div className="py-4 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              No calendars found. Point Aeon to a folder in Settings.
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-3 py-2.5 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-1 shrink-0">
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings (,)"
          className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside
        className={`hidden lg:block shrink-0 h-full overflow-hidden transition-[width] duration-200 ease-out ${
          collapsed ? 'w-0' : 'w-[260px]'
        }`}
        aria-hidden={collapsed}
      >
        {renderContent(false)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/40 dark:bg-black/65 backdrop-blur-[2px]"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 w-[260px] max-w-[85vw] h-full shadow-xl">
            {renderContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}
