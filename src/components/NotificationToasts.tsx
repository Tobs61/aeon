import { Bell, X } from 'lucide-react';
import { FOLDER_COLOR_STYLES } from '../lib/colors.ts';
import { formatTimeShort } from '../lib/dateUtils.ts';
import { formatReminderLeadLabel } from '../lib/notifications.ts';
import type { IcsCalendar, IcsOccurrence } from '../types/calendar.ts';

export interface ActiveToastNotification {
  id: string;
  title: string;
  subtitle: string;
  location?: string;
  colorKey?: IcsCalendar['color'];
  occurrence?: IcsOccurrence;
}

interface NotificationToastsProps {
  items: ActiveToastNotification[];
  onDismiss: (id: string) => void;
  onInspectOccurrence: (occ: IcsOccurrence) => void;
}

export function buildToastFromOccurrence(
  id: string,
  occ: IcsOccurrence,
  leadMinutes: number,
  calendar?: IcsCalendar
): ActiveToastNotification {
  const timeText = occ.event.allDay
    ? 'All day'
    : `${formatTimeShort(occ.startDate)} – ${formatTimeShort(occ.endDate)}`;
  const leadText =
    leadMinutes === 0 ? 'Starting now' : formatReminderLeadLabel(leadMinutes);

  return {
    id,
    title: occ.event.summary,
    subtitle: `${leadText} · ${timeText}`,
    location: occ.event.location,
    colorKey: calendar?.color ?? 'slate',
    occurrence: occ,
  };
}

export function NotificationToasts({
  items,
  onDismiss,
  onInspectOccurrence,
}: NotificationToastsProps) {
  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))] pointer-events-none"
    >
      {items.map((item) => {
        const swatch =
          FOLDER_COLOR_STYLES[item.colorKey ?? 'slate']?.swatch ??
          FOLDER_COLOR_STYLES.slate.swatch;

        return (
          <div
            key={item.id}
            role="status"
            onClick={() => {
              if (item.occurrence) {
                onInspectOccurrence(item.occurrence);
              }
              onDismiss(item.id);
            }}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-[#141414]/95 backdrop-blur-md p-3.5 shadow-xl cursor-pointer hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
          >
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-[#1e1e1e] border border-neutral-200 dark:border-neutral-800">
              <Bell className="w-3.5 h-3.5 text-neutral-700 dark:text-neutral-200" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full shrink-0 ${swatch}`} />
                <span className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                  {item.title}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] font-mono tabular-nums text-neutral-500 dark:text-neutral-400 truncate">
                {item.subtitle}
              </div>
              {item.location && (
                <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                  {item.location}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(item.id);
              }}
              aria-label="Dismiss notification"
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
