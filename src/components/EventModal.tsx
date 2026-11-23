import { Check, ChevronDown, FileCode2, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FOLDER_COLOR_STYLES } from '../lib/colors.ts';
import { addDays, toDateInputString } from '../lib/dateUtils.ts';
import { serializeEventToIcs, slugifyIcsFilename } from '../lib/ics.ts';
import type { EventDraft, IcsCalendar, IcsEvent } from '../types/calendar.ts';

interface EventModalProps {
  calendars: IcsCalendar[];
  initialDraft: EventDraft;
  editingEvent: IcsEvent | null;
  onClose: () => void;
  onSave: (draft: EventDraft) => Promise<void>;
}

const RRULE_OPTIONS = [
  { label: 'Does not repeat', value: '' },
  { label: 'Every day', value: 'FREQ=DAILY' },
  { label: 'Every week', value: 'FREQ=WEEKLY' },
  { label: 'Mon, Wed, Fri', value: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' },
  { label: 'Weekdays (Mon–Fri)', value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Every month', value: 'FREQ=MONTHLY' },
  { label: 'Every year', value: 'FREQ=YEARLY' },
];

export function EventModal({
  calendars,
  initialDraft,
  editingEvent,
  onClose,
  onSave,
}: EventModalProps) {
  const [draft, setDraft] = useState<EventDraft>(initialDraft);
  const [showRawPreview, setShowRawPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<
    'calendar' | 'recurrence' | null
  >(null);

  const calendarDropdownRef = useRef<HTMLDivElement>(null);
  const recurrenceDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openDropdown) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        openDropdown === 'calendar' &&
        calendarDropdownRef.current &&
        !calendarDropdownRef.current.contains(target)
      ) {
        setOpenDropdown(null);
      } else if (
        openDropdown === 'recurrence' &&
        recurrenceDropdownRef.current &&
        !recurrenceDropdownRef.current.contains(target)
      ) {
        setOpenDropdown(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpenDropdown(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [openDropdown]);

  const isCreatingNewFile = draft.calendarId === '__new__';

  const selectedCalendar = useMemo(
    () => calendars.find((c) => c.id === draft.calendarId),
    [calendars, draft.calendarId]
  );

  const selectedRecurrenceLabel = useMemo(
    () =>
      RRULE_OPTIONS.find((opt) => opt.value === draft.rrule)?.label ??
      (draft.rrule ? draft.rrule : 'Does not repeat'),
    [draft.rrule]
  );

  const computedEndForIcs = useMemo(() => {
    if (!draft.allDay) {
      return `${draft.endDate}T${draft.endTime}:00`;
    }
    const [y, m, d] = draft.endDate.split('-').map(Number);
    const inclusiveEnd = new Date(y, (m || 1) - 1, d || 1);
    return toDateInputString(addDays(inclusiveEnd, 1));
  }, [draft.allDay, draft.endDate, draft.endTime]);

  const targetFilename = useMemo(() => {
    if (isCreatingNewFile) {
      return slugifyIcsFilename(draft.newFileName || 'calendar');
    }
    return selectedCalendar?.fileName ?? 'calendar.ics';
  }, [
    draft.newFileName,
    isCreatingNewFile,
    selectedCalendar?.fileName,
  ]);

  const rawIcsPreview = useMemo(() => {
    const startVal = draft.allDay
      ? draft.startDate
      : `${draft.startDate}T${draft.startTime}:00`;
    return serializeEventToIcs({
      uid: editingEvent?.uid ?? 'aeon-preview@local',
      summary: draft.summary || 'Untitled Event',
      description: draft.description,
      location: draft.location,
      start: startVal,
      end: computedEndForIcs,
      allDay: draft.allDay,
      rrule: draft.rrule || undefined,
      status: draft.status,
    });
  }, [draft, computedEndForIcs, editingEvent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.summary.trim()) {
      setError('Please enter an event title.');
      return;
    }
    if (isCreatingNewFile && !draft.newFileName?.trim()) {
      setError('Please enter a filename for the new .ics calendar.');
      return;
    }
    if (!isCreatingNewFile && !draft.calendarId) {
      setError('Please select a target calendar.');
      return;
    }
    const startCheck = draft.allDay
      ? draft.startDate
      : `${draft.startDate}T${draft.startTime}:00`;
    const endCheck = draft.allDay
      ? draft.endDate
      : `${draft.endDate}T${draft.endTime}:00`;
    if (endCheck < startCheck) {
      setError('End date and time must be after the start date and time.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to write .ics file.'
      );
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 dark:bg-black/65 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#121212] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200 dark:border-neutral-800 rounded-t-2xl">
          <div>
            <h2 className="font-display text-sm font-semibold text-neutral-900 dark:text-white">
              {editingEvent ? 'Edit Event' : 'Create Event'}
            </h2>
            <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400 mt-0.5">
              {targetFilename}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-[#1a1a1a] px-3 py-2 text-xs font-medium text-neutral-900 dark:text-neutral-100">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
              Title
            </label>
            <input
              type="text"
              autoFocus
              required
              value={draft.summary}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, summary: e.target.value }))
              }
              placeholder="Kernel sync, coffee with Alex, dentist..."
              className="w-full h-9 px-3 text-sm rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400/30 focus:border-neutral-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Custom Monochrome Calendar Selector */}
            <div ref={calendarDropdownRef} className="relative">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                Calendar (.ics)
              </label>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={openDropdown === 'calendar'}
                onClick={() =>
                  setOpenDropdown((prev) =>
                    prev === 'calendar' ? null : 'calendar'
                  )
                }
                className="flex w-full h-9 items-center justify-between gap-2 px-3 text-sm rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818] text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100/70 dark:hover:bg-[#1f1f1f] focus:outline-none focus:ring-2 focus:ring-neutral-400/30 focus:border-neutral-500 transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {isCreatingNewFile ? (
                    <>
                      <Plus className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="truncate">New .ics file...</span>
                    </>
                  ) : selectedCalendar ? (
                    <>
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          (
                            FOLDER_COLOR_STYLES[selectedCalendar.color] ??
                            FOLDER_COLOR_STYLES.slate
                          ).swatch
                        }`}
                      />
                      <span className="truncate">
                        {selectedCalendar.fileName.replace(/\.ics$/i, '')}
                      </span>
                    </>
                  ) : (
                    <span className="text-neutral-400 truncate">
                      Select calendar...
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform ${
                    openDropdown === 'calendar' ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openDropdown === 'calendar' && (
                <div
                  role="listbox"
                  aria-label="Calendar (.ics)"
                  className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-52 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#181818] p-1 shadow-xl"
                >
                  {calendars.map((cal) => {
                    const active = draft.calendarId === cal.id;
                    const swatch = (
                      FOLDER_COLOR_STYLES[cal.color] ?? FOLDER_COLOR_STYLES.slate
                    ).swatch;
                    return (
                      <button
                        key={cal.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          setDraft((prev) => ({
                            ...prev,
                            calendarId: cal.id,
                          }));
                          setOpenDropdown(null);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                          active
                            ? 'bg-neutral-100 dark:bg-[#242424] text-neutral-900 dark:text-white font-medium'
                            : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100/75 dark:hover:bg-[#222222]'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className={`h-2.5 w-2.5 rounded-full shrink-0 ${swatch}`}
                          />
                          <span className="truncate">
                            {cal.fileName.replace(/\.ics$/i, '')}
                          </span>
                        </span>
                        {active && (
                          <Check className="w-3.5 h-3.5 text-neutral-900 dark:text-white shrink-0" />
                        )}
                      </button>
                    );
                  })}

                  {calendars.length > 0 && (
                    <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
                  )}

                  <button
                    type="button"
                    role="option"
                    aria-selected={isCreatingNewFile}
                    onClick={() => {
                      setDraft((prev) => ({
                        ...prev,
                        calendarId: '__new__',
                      }));
                      setOpenDropdown(null);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      isCreatingNewFile
                        ? 'bg-neutral-100 dark:bg-[#242424] text-neutral-900 dark:text-white font-medium'
                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100/75 dark:hover:bg-[#222222]'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Plus className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span>New .ics file...</span>
                    </span>
                    {isCreatingNewFile && (
                      <Check className="w-3.5 h-3.5 text-neutral-900 dark:text-white shrink-0" />
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-end pb-1.5">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={draft.allDay}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, allDay: e.target.checked }))
                  }
                  className="h-4 w-4 rounded-md border-neutral-300 dark:border-neutral-700 accent-neutral-900 dark:accent-white"
                />
                <span>All-day event</span>
              </label>
            </div>
          </div>

          {isCreatingNewFile && (
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                New Calendar Filename
              </label>
              <input
                type="text"
                value={draft.newFileName ?? ''}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, newFileName: e.target.value }))
                }
                placeholder="e.g. travel.ics"
                className="w-full h-9 px-3 text-sm font-mono rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400/30"
              />
            </div>
          )}

          {/* Start & End Date/Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                Start
              </label>
              <div className="flex gap-1.5">
                <input
                  type="date"
                  required
                  value={draft.startDate}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    setDraft((prev) => ({
                      ...prev,
                      startDate: nextStart,
                      endDate:
                        prev.endDate < nextStart ? nextStart : prev.endDate,
                    }));
                  }}
                  className="flex-1 min-w-0 h-9 px-2 text-xs font-mono tabular-nums rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400/30"
                />
                {!draft.allDay && (
                  <input
                    type="time"
                    required
                    value={draft.startTime}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        startTime: e.target.value,
                      }))
                    }
                    className="w-24 h-9 px-2 text-xs font-mono tabular-nums rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400/30"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                End
              </label>
              <div className="flex gap-1.5">
                <input
                  type="date"
                  required
                  value={draft.endDate}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                  className="flex-1 min-w-0 h-9 px-2 text-xs font-mono tabular-nums rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400/30"
                />
                {!draft.allDay && (
                  <input
                    type="time"
                    required
                    value={draft.endTime}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, endTime: e.target.value }))
                    }
                    className="w-24 h-9 px-2 text-xs font-mono tabular-nums rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400/30"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                Location
              </label>
              <input
                type="text"
                value={draft.location}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, location: e.target.value }))
                }
                placeholder="Room, address, or link"
                className="w-full h-9 px-3 text-sm rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400/30"
              />
            </div>

            {/* Custom Monochrome Recurrence Selector */}
            <div ref={recurrenceDropdownRef} className="relative">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
                Recurrence
              </label>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={openDropdown === 'recurrence'}
                onClick={() =>
                  setOpenDropdown((prev) =>
                    prev === 'recurrence' ? null : 'recurrence'
                  )
                }
                className="flex w-full h-9 items-center justify-between gap-2 px-3 text-sm rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818] text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100/70 dark:hover:bg-[#1f1f1f] focus:outline-none focus:ring-2 focus:ring-neutral-400/30 focus:border-neutral-500 transition-colors"
              >
                <span className="truncate">{selectedRecurrenceLabel}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform ${
                    openDropdown === 'recurrence' ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openDropdown === 'recurrence' && (
                <div
                  role="listbox"
                  aria-label="Recurrence"
                  className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-52 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#181818] p-1 shadow-xl"
                >
                  {RRULE_OPTIONS.map((opt) => {
                    const active = draft.rrule === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          setDraft((prev) => ({ ...prev, rrule: opt.value }));
                          setOpenDropdown(null);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                          active
                            ? 'bg-neutral-100 dark:bg-[#242424] text-neutral-900 dark:text-white font-medium'
                            : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100/75 dark:hover:bg-[#222222]'
                        }`}
                      >
                        <span className="truncate">{opt.label}</span>
                        {active && (
                          <Check className="w-3.5 h-3.5 text-neutral-900 dark:text-white shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              value={draft.description}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Plain-text notes stored in DESCRIPTION..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400/30 resize-none"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowRawPreview((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>
                {showRawPreview ? 'Hide .ics output' : 'Preview .ics output'}
              </span>
            </button>

            {showRawPreview && (
              <pre className="mt-2 max-h-40 overflow-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#181818] p-3 text-[11px] font-mono text-neutral-700 dark:text-neutral-300 leading-relaxed">
                {rawIcsPreview}
              </pre>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium rounded-xl border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-950 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {saving
                ? 'Saving...'
                : editingEvent
                  ? 'Save Changes'
                  : 'Save Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
