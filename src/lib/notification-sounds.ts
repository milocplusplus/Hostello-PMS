import type { NotificationCategory } from "./notifications";

/**
 * The Hostello alert tones — "Glass": a struck glass bell.
 *
 * Synthesised with the Web Audio API rather than shipped as files: a few hundred
 * bytes of code instead of five downloads, working offline and on the first
 * paint, and retuning one is editing a number here.
 *
 * The bell comes from the partials, not the fundamental. A real struck bell is
 * inharmonic — its overtones are not whole multiples — so 2.76× and 5.4× are
 * what stop this sounding like a beep. Each category gets its own motif on that
 * same timbre, so you can tell what happened without looking: money climbs three
 * notes, a booking is two, a clash nags in pairs.
 */

type Note = {
  /** Hz. */
  f: number;
  /** Seconds from the start of the motif. */
  t: number;
  /** Seconds. */
  d: number;
  /** Relative loudness; 1 is the reference. */
  g?: number;
};

/** [frequency ratio, relative gain] — the inharmonic overtones of a struck bell. */
const PARTIALS: [number, number][] = [
  [1, 1],
  [2.76, 0.22],
  [5.4, 0.08],
];

const ATTACK = 0.004;
const PEAK = 0.17;

const MOTIFS: Record<NotificationCategory, Note[]> = {
  // Two strikes, a fifth apart — something landed.
  booking: [
    { f: 1046, t: 0, d: 0.6 },
    { f: 1568, t: 0.11, d: 0.9 },
  ],
  // Three, climbing.
  payment: [
    { f: 784, t: 0, d: 0.4, g: 0.85 },
    { f: 1046, t: 0.1, d: 0.45, g: 0.9 },
    { f: 1568, t: 0.2, d: 1.0 },
  ],
  // One, softer — a date moved, look when you can.
  calendar: [{ f: 880, t: 0, d: 0.55, g: 0.7 }],
  // Quieter still — account housekeeping.
  system: [{ f: 698, t: 0, d: 0.5, g: 0.55 }],
  // Two pairs, lower and louder — this one wants you now.
  critical: [
    { f: 659, t: 0, d: 0.3, g: 1.2 },
    { f: 880, t: 0.14, d: 0.34, g: 1.2 },
    { f: 659, t: 0.4, d: 0.3, g: 1.2 },
    { f: 880, t: 0.54, d: 0.5, g: 1.25 },
  ],
};

type WindowWithLegacyAudio = Window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as WindowWithLegacyAudio).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/**
 * Plays the motif for a category. Silent — never throwing — when the browser has
 * no Web Audio, or when it is still holding the context closed because the user
 * has not interacted with the page yet. A missed sound is not worth an error.
 */
export function playNotificationSound(category: NotificationCategory): void {
  const ctx = audioContext();
  if (!ctx) return;

  const start = () => {
    const now = ctx.currentTime + 0.02;
    for (const note of MOTIFS[category] ?? MOTIFS.system) {
      for (const [ratio, partialGain] of PARTIALS) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = note.f * ratio;

        // A hard start or stop is an audible click, and the decay has to be
        // exponential or the bell sounds like it was switched off.
        const peak = PEAK * (note.g ?? 1) * partialGain;
        const at = now + note.t;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(peak, at + ATTACK);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + note.d);

        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + note.d + 0.03);
      }
    }
  };

  if (ctx.state === "suspended") {
    ctx.resume().then(start, () => {});
    return;
  }
  start();
}
