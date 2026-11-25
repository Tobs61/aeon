let sharedAudioCtx: AudioContext | null = null;
let unlockBound = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (sharedAudioCtx) return sharedAudioCtx;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioCtx) return null;
  try {
    sharedAudioCtx = new AudioCtx();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function bindAudioUnlock(): () => void {
  if (typeof window === 'undefined' || unlockBound) {
    return () => undefined;
  }
  unlockBound = true;

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    unlockBound = false;
  };

  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  return () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    unlockBound = false;
  };
}

/**
 * Plays a clean, soft two-note chime using Web Audio API.
 * Safe across browsers, WebKitGTK (Linux), WKWebView (macOS), and WebView2 (Windows).
 */
export async function playNotificationSound(volume = 0.24): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;
    const notes = [
      { freq: 880, start: 0, duration: 0.24, gainScale: 1.0 },
      { freq: 1318.51, start: 0.11, duration: 0.36, gainScale: 0.85 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      const peak = Math.max(0.001, Math.min(0.6, volume * note.gainScale));
      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(peak, now + note.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + note.start + note.duration
      );

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.02);
    }

    return true;
  } catch {
    return false;
  }
}
