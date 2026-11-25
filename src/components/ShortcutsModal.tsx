import { X } from 'lucide-react';

interface ShortcutsModalProps {
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  items: Array<{ keys: string[]; label: string }>;
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    items: [
      { keys: ['T'], label: 'Jump to Today' },
      { keys: ['1', 'D'], label: 'Switch to Day view' },
      { keys: ['2', 'W'], label: 'Switch to Week view' },
      { keys: ['3', 'M'], label: 'Switch to Month view' },
      { keys: ['4', 'Y'], label: 'Switch to Year view' },
      { keys: ['←', 'H'], label: 'Previous day, week, month, or year' },
      { keys: ['→', 'L'], label: 'Next day, week, month, or year' },
      { keys: ['Scroll ↑↓'], label: 'Move to previous or next month / year' },
    ],
  },
  {
    title: 'Events',
    items: [
      { keys: ['N', 'C'], label: 'Create a new event' },
      { keys: ['E'], label: 'Edit selected event' },
      { keys: ['/'], label: 'Focus event search filter' },
      { keys: ['Esc'], label: 'Close open dialog or drawer' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { keys: ['B', '['], label: 'Collapse or expand sidebar' },
      { keys: ['R'], label: 'Rescan folder for .ics files' },
      { keys: [','], label: 'Open Settings' },
      { keys: ['\\'], label: 'Toggle Light / Dark theme' },
      { keys: ['?'], label: 'Show keyboard shortcuts' },
    ],
  },
];

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 dark:bg-black/65 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#121212] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200 dark:border-neutral-800">
          <div>
            <h2 className="font-display text-sm font-semibold text-neutral-900 dark:text-white">
              Keyboard Shortcuts
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Navigate views, edit events, and manage your local calendars effortlessly.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Close shortcuts menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2">
                {group.title}
              </h3>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800/80 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between px-3.5 py-2 text-xs bg-neutral-50/50 dark:bg-[#161616]"
                  >
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.keys.map((k, idx) => (
                        <span key={k} className="inline-flex items-center gap-1">
                          {idx > 0 && (
                            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                              or
                            </span>
                          )}
                          <kbd className="inline-flex min-w-[24px] h-6 items-center justify-center px-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#202020] font-mono text-[11px] font-medium text-neutral-800 dark:text-neutral-200">
                            {k}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-[#161616]">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Press{' '}
            <kbd className="px-1.5 py-0.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#202020] font-mono text-[11px]">
              ?
            </kbd>{' '}
            anytime to toggle this menu
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-950 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
