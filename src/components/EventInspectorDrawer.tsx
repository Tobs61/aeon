import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileCode2,
  MapPin,
  Pencil,
  Repeat,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { FOLDER_COLOR_STYLES } from '../lib/colors.ts';
import {
  addDays,
  formatDurationHuman,
  formatRruleHuman,
  formatTimeShort,
  isSameDay,
} from '../lib/dateUtils.ts';
import type { IcsCalendar, IcsOccurrence } from '../types/calendar.ts';

interface EventInspectorDrawerProps {
  occurrence: IcsOccurrence;
  calendar: IcsCalendar | undefined;
  onClose: () => void;
  onEdit: (occurrence: IcsOccurrence) => void;
  onDelete: (occurrence: IcsOccurrence) => Promise<void>;
}

export function EventInspectorDrawer({
  occurrence,
  calendar,
  onClose,
  onEdit,
  onDelete,
}: EventInspectorDrawerProps) {
  const [showTechnical, setShowTechnical] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { event, startDate, endDate } = occurrence;
  const colorStyle = FOLDER_COLOR_STYLES[calendar?.color ?? 'slate'];
  const calendarLabel = event.fileName.replace(/\.ics$/i, '');

  const displayEnd = event.allDay ? addDays(endDate, -1) : endDate;
  const multiDay = !isSameDay(startDate, displayEnd);

  const formattedStartDate = startDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const formattedEndDate = displayEnd.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const durationLabel = event.allDay
    ? 'All day'
    : formatDurationHuman(startDate, endDate);

  const recurrenceLabel = event.rrule ? formatRruleHuman(event.rrule) : null;

  const statusLabel =
    event.status === 'TENTATIVE'
      ? 'Tentative'
      : event.status === 'CANCELLED'
        ? 'Cancelled'
        : null;

  const handleCopyRaw = async () => {
    await navigator.clipboard.writeText(event.rawIcs);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadIcs = () => {
    const blob = new Blob([event.rawIcs], {
      type: 'text/calendar;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = event.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(occurrence);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/35 dark:bg-black/65 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-md h-full bg-white dark:bg-[#121212] border-l border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`h-2.5 w-2.5 rounded-full shrink-0 ${colorStyle.swatch}`}
            />
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
              {calendarLabel}
            </span>
            {statusLabel && (
              <>
                <span
                  className="text-neutral-300 dark:text-neutral-700"
                  aria-hidden="true"
                >
                  ·
                </span>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {statusLabel}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Close event details"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Human-Readable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white leading-snug">
              {event.summary}
            </h2>
          </div>

          <div className="space-y-4">
            {/* Date */}
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-neutral-400 mt-0.5 shrink-0" />
              <div className="text-sm text-neutral-800 dark:text-neutral-200 leading-snug">
                {multiDay ? (
                  <div>
                    <div>{formattedStartDate}</div>
                    <div className="text-neutral-500 dark:text-neutral-400 mt-0.5">
                      to {formattedEndDate}
                    </div>
                  </div>
                ) : (
                  <div>{formattedStartDate}</div>
                )}
              </div>
            </div>

            {/* Time & Duration */}
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-neutral-400 mt-0.5 shrink-0" />
              <div className="flex flex-wrap items-center gap-x-2 text-sm text-neutral-800 dark:text-neutral-200">
                {event.allDay ? (
                  <span>All day</span>
                ) : (
                  <>
                    <span className="font-mono tabular-nums">
                      {formatTimeShort(startDate)} – {formatTimeShort(endDate)}
                    </span>
                    <span
                      className="text-neutral-300 dark:text-neutral-700"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                    <span className="text-neutral-500 dark:text-neutral-400 tabular-nums">
                      {durationLabel}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Location */}
            {event.location && (
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-neutral-400 mt-0.5 shrink-0" />
                <div className="text-sm text-neutral-800 dark:text-neutral-200 leading-snug">
                  {event.location}
                </div>
              </div>
            )}

            {/* Human-readable Recurrence */}
            {recurrenceLabel && (
              <div className="flex items-start gap-3">
                <Repeat className="w-4 h-4 text-neutral-400 mt-0.5 shrink-0" />
                <div className="text-sm text-neutral-800 dark:text-neutral-200 leading-snug">
                  {recurrenceLabel}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          {event.description && (
            <div className="pt-5 border-t border-neutral-200 dark:border-neutral-800">
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2">
                Notes
              </h3>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap leading-relaxed">
                {event.description}
              </p>
            </div>
          )}

          {/* Collapsible Technical .ics Details */}
          <div className="pt-5 border-t border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setShowTechnical((v) => !v)}
              className="flex w-full items-center justify-between text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              <span className="inline-flex items-center gap-1.5">
                <FileCode2 className="w-3.5 h-3.5" />
                <span>Calendar file &amp; .ics source</span>
              </span>
              {showTechnical ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>

            {showTechnical && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="font-mono">{event.fileName}</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleCopyRaw}
                      className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadIcs}
                      className="inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-white transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500 break-all">
                  UID: {event.uid}
                </div>

                <pre className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818] p-3.5 text-[11px] font-mono text-neutral-700 dark:text-neutral-300 overflow-x-auto leading-relaxed">
                  {event.rawIcs}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Action Footer */}
        <div className="px-5 py-3.5 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2 shrink-0 bg-neutral-50 dark:bg-[#161616]">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/70 dark:hover:bg-neutral-800 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs font-medium rounded-xl border border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 hover:opacity-90 transition-opacity"
              >
                {deleting ? 'Removing...' : 'Confirm Delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2.5 py-1.5 text-xs font-medium rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                Cancel
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onEdit(occurrence)}
            title="Edit event (E)"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-950 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
