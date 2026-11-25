import {
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Menu,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type { RefObject } from 'react';
import type { CalendarViewMode } from '../types/calendar.ts';

interface TopBarProps {
  title: string;
  viewMode: CalendarViewMode;
  onChangeView: (mode: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNewEvent: () => void;
  onRescan: () => void;
  isScanning: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  sidebarCollapsed: boolean;
  onExpandSidebar: () => void;
  onOpenShortcuts: () => void;
  onOpenMobileSidebar: () => void;
}

const VIEW_TABS: Array<{ mode: CalendarViewMode; label: string; title: string }> = [
  { mode: 'day', label: 'Day', title: 'Day view (1 / D)' },
  { mode: 'week', label: 'Week', title: 'Week view (2 / W)' },
  { mode: 'month', label: 'Month', title: 'Month view (3 / M)' },
  { mode: 'year', label: 'Year', title: 'Year view (4 / Y)' },
];

export function TopBar({
  title,
  viewMode,
  onChangeView,
  onPrev,
  onNext,
  onToday,
  onNewEvent,
  onRescan,
  isScanning,
  searchQuery,
  onSearchChange,
  searchInputRef,
  sidebarCollapsed,
  onExpandSidebar,
  onOpenShortcuts,
  onOpenMobileSidebar,
}: TopBarProps) {
  return (
    <header className="flex h-14 items-center justify-between gap-3 sm:gap-4 px-4 sm:px-6 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0a0a0a] shrink-0">
      {/* Left: Sidebar Expand + Date Navigation + Active Period Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-2 -ml-1.5 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          aria-label="Open calendars sidebar"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex lg:hidden h-7 w-7 items-center justify-center rounded-lg bg-black border border-neutral-800/80 p-1 shrink-0">
          <img
            src="/assets/aeon-logo.svg"
            alt="Aeon logo"
            className="h-full w-full object-contain"
          />
        </div>

        {sidebarCollapsed && (
          <>
            <button
              type="button"
              onClick={onExpandSidebar}
              className="hidden lg:inline-flex p-1.5 -ml-1.5 rounded-xl text-neutral-500 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Expand sidebar"
              title="Expand sidebar (B)"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
            <div className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg bg-black border border-neutral-800/80 p-1 shrink-0">
              <img
                src="/assets/aeon-logo.svg"
                alt="Aeon logo"
                className="h-full w-full object-contain"
              />
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onToday}
          title="Jump to today (T)"
          className="px-3 py-1.5 text-xs font-medium rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#141414] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0"
        >
          Today
        </button>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onPrev}
            title="Previous (← or H)"
            className="p-1.5 rounded-xl text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Previous period"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            title="Next (→ or L)"
            className="p-1.5 rounded-xl text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Next period"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <h1 className="font-display text-base sm:text-lg font-semibold tracking-tight text-neutral-900 dark:text-white truncate">
          {title}
        </h1>
      </div>

      {/* Right-aligned: Search Events, View Switcher (Day/Week/Month/Year) & Quick Actions */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-auto">
        <div className="relative hidden md:block w-48 lg:w-56">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search events... (/)"
            className="w-full h-8 pl-8 pr-7 text-xs rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100/80 dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400/30 focus:border-neutral-400 dark:focus:border-neutral-600 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              aria-label="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Calendar view"
          className="flex items-center p-0.5 rounded-xl bg-neutral-100 dark:bg-[#141414] border border-neutral-200 dark:border-neutral-800"
        >
          {VIEW_TABS.map((tab) => {
            const active = viewMode === tab.mode;
            return (
              <button
                key={tab.mode}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChangeView(tab.mode)}
                title={tab.title}
                className={`px-2.5 sm:px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white dark:bg-[#242424] text-neutral-900 dark:text-white shadow-xs'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onOpenShortcuts}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#141414] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onRescan}
          disabled={isScanning}
          aria-label="Rescan folder for .ics files"
          title="Rescan folder (R)"
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#141414] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
        </button>

        <button
          type="button"
          onClick={onNewEvent}
          aria-label="New event"
          title="New event (N or C)"
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-950 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
