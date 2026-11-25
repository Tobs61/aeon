import { Copy, Minus, Square, X } from 'lucide-react';
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
  onMinimizeFallback: () => void;
  onCloseFallback: () => void;
}

export function TitleBar({
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
      className="relative flex h-8 items-stretch justify-between pl-0 pr-0 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0f0f0f] select-none shrink-0 z-30"
    >
      {/* Window Drag Region */}
      <div data-tauri-drag-region className="flex-1" />

      {/* Flush Top-Right Window Controls */}
      <div className="flex items-stretch shrink-0">
        <button
          type="button"
          onClick={() => void handleMinimize()}
          title={tauri ? 'Minimize window' : 'Toggle compact workspace'}
          aria-label={tauri ? 'Minimize window' : 'Toggle compact workspace'}
          className="inline-flex h-full w-11 items-center justify-center rounded-none text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/75 dark:hover:bg-neutral-800 transition-colors"
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
          className="inline-flex h-full w-11 items-center justify-center rounded-none text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/75 dark:hover:bg-neutral-800 transition-colors"
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
          className="inline-flex h-full w-11 items-center justify-center rounded-none text-neutral-500 dark:text-neutral-400 hover:bg-neutral-900 hover:text-white dark:hover:bg-white dark:hover:text-neutral-950 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
