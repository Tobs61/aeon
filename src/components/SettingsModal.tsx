import {
  CheckCircle2,
  FolderOpen,
  Moon,
  Plus,
  Sun,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { isDirectoryPickerSupported } from '../lib/fsAccess.ts';
import { isTauriRuntime } from '../lib/tauriRuntime.ts';
import type { FirstDayOfWeek } from '../types/calendar.ts';

interface SettingsModalProps {
  rootFolderLabel: string;
  calendarCount: number;
  firstDayOfWeek: FirstDayOfWeek;
  onChangeFirstDay: (day: FirstDayOfWeek) => void;
  isDark: boolean;
  onToggleTheme: (dark: boolean) => void;
  onPickLocalFolder: () => Promise<void>;
  onMountNativeFolderFiles: (files: FileList) => Promise<void>;
  onCreateCalendarFile: (name: string) => Promise<void>;
  onClose: () => void;
}

const WEEK_START_OPTIONS: Array<{ label: string; value: FirstDayOfWeek }> = [
  { label: 'Monday', value: 1 },
  { label: 'Sunday', value: 0 },
  { label: 'Saturday', value: 6 },
];

export function SettingsModal({
  rootFolderLabel,
  calendarCount,
  firstDayOfWeek,
  onChangeFirstDay,
  isDark,
  onToggleTheme,
  onPickLocalFolder,
  onMountNativeFolderFiles,
  onCreateCalendarFile,
  onClose,
}: SettingsModalProps) {
  const [newCalName, setNewCalName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const canUseDirectDirectoryApi =
    !isTauriRuntime() &&
    isDirectoryPickerSupported() &&
    typeof window !== 'undefined' &&
    window.self === window.top;

  const handleChooseFolder = async () => {
    setError(null);
    setNotice(null);

    if (isTauriRuntime() || canUseDirectDirectoryApi) {
      setBusy(true);
      try {
        await onPickLocalFolder();
        setNotice('Folder access verified and .ics calendars scanned.');
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Could not open folder.';
        if (!msg.toLowerCase().includes('abort')) {
          setError(msg);
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    // Trigger native OS folder dialog synchronously when running in iframe/fallback browsers
    folderInputRef.current?.click();
  };

  const handleNativeFolderSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onMountNativeFolderFiles(fileList);
      setNotice('Mounted folder and scanned all .ics calendars.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to scan selected folder.'
      );
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handleCreateCal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCalName.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onCreateCalendarFile(newCalName.trim());
      setNewCalName('');
      setNotice('Created new .ics calendar file.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create .ics file.'
      );
    } finally {
      setBusy(false);
    }
  };

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
          <h2 className="font-display text-sm font-semibold text-neutral-900 dark:text-white">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-[#1a1a1a] px-3 py-2 text-xs font-medium text-neutral-900 dark:text-neutral-100">
              {error}
            </div>
          )}

          {notice && (
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-[#181818] px-3 py-2 text-xs text-neutral-800 dark:text-neutral-200">
              {notice}
            </div>
          )}

          {/* Section 1: Scanned Calendar Folder */}
          <section className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-neutral-900 dark:text-white">
                Calendar Folder
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                Aeon recursively scans this folder and all sub-folders for{' '}
                <span className="font-mono">.ics</span> files. Files stay
                strictly inside your chosen folder.
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#171717] p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-900 dark:text-white">
                  <CheckCircle2 className="w-3.5 h-3.5 text-neutral-700 dark:text-neutral-300 shrink-0" />
                  <span className="truncate">{rootFolderLabel}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums">
                  {calendarCount} .ics calendar
                  {calendarCount === 1 ? '' : 's'} loaded
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleChooseFolder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-950 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Choose Folder</span>
                </button>
              </div>
            </div>

            {/* Native Folder Picker Input */}
            <input
              ref={folderInputRef}
              type="file"
              multiple
              {...({ webkitdirectory: '', directory: '' } as Record<
                string,
                string
              >)}
              onChange={handleNativeFolderSelected}
              className="hidden"
            />

            {/* Create new .ics file in active folder */}
            <form onSubmit={handleCreateCal} className="flex gap-1.5 pt-1">
              <input
                type="text"
                value={newCalName}
                onChange={(e) => setNewCalName(e.target.value)}
                placeholder="New calendar (e.g. fitness.ics)"
                className="flex-1 min-w-0 h-8 px-2.5 text-xs font-mono rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400/30"
              />
              <button
                type="submit"
                disabled={busy || !newCalName.trim()}
                className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-xl border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New .ics</span>
              </button>
            </form>
          </section>

          {/* Section 2: First Day of the Week */}
          <section className="pt-5 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-semibold text-neutral-900 dark:text-white">
                First Day of the Week
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Applies to weekly, monthly, yearly, and sidebar calendars.
              </p>
            </div>

            <div className="flex items-center p-0.5 rounded-xl bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-800 shrink-0">
              {WEEK_START_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChangeFirstDay(opt.value)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    firstDayOfWeek === opt.value
                      ? 'bg-white dark:bg-[#2a2a2a] text-neutral-900 dark:text-white shadow-xs'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {/* Section 3: Theme */}
          <section className="pt-5 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-semibold text-neutral-900 dark:text-white">
                Appearance
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Choose light or dark monochromatic contrast.
              </p>
            </div>

            <div className="flex items-center p-0.5 rounded-xl bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-800 shrink-0">
              <button
                type="button"
                onClick={() => onToggleTheme(false)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  !isDark
                    ? 'bg-white dark:bg-[#2a2a2a] text-neutral-900 dark:text-white shadow-xs'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleTheme(true)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isDark
                    ? 'bg-white dark:bg-[#2a2a2a] text-neutral-900 dark:text-white shadow-xs'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </button>
            </div>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end bg-neutral-50 dark:bg-[#161616]">
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
