import { type RefObject, useCallback, useRef } from 'react';

interface UseWheelPeriodStepOptions {
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  cooldownMs?: number;
  threshold?: number;
}

/**
 * Smoothly steps to the previous/next calendar period when scrolling up/down.
 * For views with an internal vertical scroll container (e.g. Day/Week time grid),
 * allows full internal scrolling and only steps when intentionally overscrolling
 * past the top or bottom boundary.
 */
export function useWheelPeriodStep({
  onPrev,
  onNext,
  disabled = false,
  scrollContainerRef,
  cooldownMs = 320,
  threshold = 30,
}: UseWheelPeriodStepOptions) {
  const accumRef = useRef(0);
  const lastEventAtRef = useRef(0);
  const cooldownUntilRef = useRef(0);
  const lastInnerScrollAtRef = useRef(0);

  return useCallback(
    (e: React.WheelEvent<HTMLElement>) => {
      if (disabled) return;
      if (Math.abs(e.deltaY) < 3) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      const now = Date.now();
      const scroller = scrollContainerRef?.current;

      if (scroller) {
        const hasOverflow = scroller.scrollHeight > scroller.clientHeight + 2;
        if (hasOverflow) {
          const atTop = scroller.scrollTop <= 2;
          const atBottom =
            scroller.scrollTop + scroller.clientHeight >=
            scroller.scrollHeight - 2;

          if (e.deltaY < 0 && !atTop) {
            lastInnerScrollAtRef.current = now;
            accumRef.current = 0;
            return;
          }
          if (e.deltaY > 0 && !atBottom) {
            lastInnerScrollAtRef.current = now;
            accumRef.current = 0;
            return;
          }

          // Require a brief pause after hitting the edge so inertial flicks
          // to 00:00 or 23:59 don't accidentally jump to the adjacent day/week.
          if (now - lastInnerScrollAtRef.current < 280) {
            accumRef.current = 0;
            return;
          }
        }
      }

      if (now < cooldownUntilRef.current) {
        return;
      }

      if (
        now - lastEventAtRef.current > 180 ||
        (accumRef.current !== 0 &&
          Math.sign(accumRef.current) !== Math.sign(e.deltaY))
      ) {
        accumRef.current = 0;
      }
      lastEventAtRef.current = now;
      accumRef.current += e.deltaY;

      if (Math.abs(accumRef.current) >= threshold) {
        const dir = accumRef.current > 0 ? 1 : -1;
        accumRef.current = 0;
        cooldownUntilRef.current = now + cooldownMs;
        if (dir > 0) {
          onNext();
        } else {
          onPrev();
        }
      }
    },
    [cooldownMs, disabled, onNext, onPrev, scrollContainerRef, threshold]
  );
}
