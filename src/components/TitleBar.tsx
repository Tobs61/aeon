import { Copy, Minus, Moon, Square, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  isTauriRuntime,
  tauriCloseWindow,
  tauriMinimizeWindow,
  tauriStartDragging,
  tauriSubscribeWindowMaximized,
  tauriToggleMaximizeWindow,
} from '../lib/tauriRuntime.ts';

interface TitleBarProps {
  rootFolderLabel: string;
  periodTitle: string;
  isDark: boolean;
  onToggleTheme: (dark: boolean) => void;
  onMinimizeFallback: () => void;
  onCloseFallback: () => void;
}

export function TitleBar({
  rootFolderLabel,
  periodTitle,
  isDark,
  onToggleTheme,
  onMinimizeFallback,
  onCloseFallback,
}: TitleBarProps) {
  const tauri = isTauriRuntime();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (tauri) {
      let unlisten: (() => void) | undefined;
      void tauriSubscribeWindowMaximized((maximized) => {
        setIsMaximized(maximized);
      }).then((fn) => {
        unlisten = fn;
      });
      return () => {
        unlisten?.();
      };
    }

    const handleFullscreenChange = () => {
      setIsMaximized(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [tauri]);

  const handleMinimize = async () => {
    if (tauri) {
      await tauriMinimizeWindow().catch(() => undefined);
      return;
    }
    onMinimizeFallback();
  };

  const handleToggleMaximize = async () => {
    if (tauri) {
      const next = await tauriToggleMaximizeWindow().catch(() => !isMaximized);
      setIsMaximized(next);
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen rejection in restricted iframes
    }
  };

  const handleClose = async () => {
    if (tauri) {
      await tauriCloseWindow().catch(() => undefined);
      return;
    }
    onCloseFallback();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button')) return;
    if (tauri) {
      void tauriStartDragging().catch(() => undefined);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('button')) return;
    void handleToggleMaximize();
  };

  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      className="relative flex h-9 items-center justify-between gap-3 px-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0f0f0f] select-none shrink-0 z-30"
    >
      {/* Left: App Icon, Name & Active Calendar Root */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 min-w-0 flex-1"
      >
        <div className="flex h-4.5 w-4.5 items-center justify-center rounded-[5px] bg-black border border-neutral-800/80 p-0.5 shrink-0 pointer-events-none">
          <img
            src="/assets/aeon-logo.svg"
            alt="Aeon"
            className="h-full w-full object-contain"
          />
        </div>
        <span className="font-display text-xs font-semibold tracking-tight text-neutral-900 dark:text-white whitespace-nowrap pointer-events-none">
          Aeon
        </span>
        <span
          className="text-neutral-300 dark:text-neutral-700 text-xs pointer-events-none hidden sm:inline"
          aria-hidden="true"
        >
          ·
        </span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate pointer-events-none hidden sm:inline">
          {rootFolderLabel}
        </span>
      </div>

      {/* Center: Quiet Active Period Title */}
      <div
        data-tauri-drag-region
        className="hidden md:flex items-center justify-center min-w-0 max-w-xs pointer-events-none"
      >
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 truncate">
          {periodTitle}
        </span>
      </div>

      {/* Right: Theme Switch + Window Controls */}
      <div className="flex items-center justify-end gap-1 flex-1 shrink-0">
        <button
          type="button"
          onClick={() => onToggleTheme(!isDark)}
          title={isDark ? 'Switch to Light theme (\\)' : 'Switch to Dark theme (\\)'}
          aria-label={isDark ? 'Switch to Light theme' : 'Switch to Dark theme'}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors"
        >
          {isDark ? (
            <Sun className="w-3.5 h-3.5" />
          ) : (
            <Moon className="w-3.5 h-3.5" />
          )}
        </button>

        <div
          className="h-3.5 w-px bg-neutral-200 dark:bg-neutral-800 mx-1"
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={() => void handleMinimize()}
          title={tauri ? 'Minimize window' : 'Toggle compact workspace'}
          aria-label={tauri ? 'Minimize window' : 'Toggle compact workspace'}
          className="inline-flex h-6 w-7 items-center justify-center rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => void handleToggleMaximize()}
          title={
            tauri
              ? isMaximized
                ? 'Restore window'
                : 'Maximize window'
              : isMaximized
                ? 'Exit fullscreen'
                : 'Enter fullscreen'
          }
          aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
          className="inline-flex h-6 w-7 items-center justify-center rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors"
        >
          {isMaximized ? (
            <Copy className="w-3 h-3" />
          ) : (
            <Square className="w-3 h-3" />
          )}
        </button>

        <button
          type="button"
          onClick={() => void handleClose()}
          title={tauri ? 'Close window' : 'Dismiss open overlays'}
          aria-label={tauri ? 'Close window' : 'Dismiss open overlays'}
          className="inline-flex h-6 w-7 items-center justify-center rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/80 dark:hover:bg-neutral-800 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
