import type { NotificationCategory } from "./notifications";

/**
 * The Hostello alert tones.
 *
 * Synthesised with the Web Audio API rather than shipped as files: they are a
 * few hundred bytes of code instead of five downloads, they work offline and on
 * the first paint, and retuning one is editing a number here. Each category gets
 * a motif you can tell apart without looking at the screen — money rises, a
 * clash nags.
 */

type Note = {
  /** Hz. */
  freq: number;
  /** Seconds from the start of the motif. */
  at: number;
  /** Seconds. */
  dur: number;
  gain?: number;
  type?: OscillatorType;
};

const MOTIFS: Record<NotificationCategory, Note[]> = {
  // Two warm notes stepping up — something good landed.
  booking: [
    { freq: 1046.5, at: 0, dur: 0.16 },
    { freq: 1318.5, at: 0.12, dur: 0.26 },
  ],
  // Three ascending — the money chime.
  payment: [
    { freq: 784.0, at: 0, dur: 0.12 },
    { freq: 1046.5, at: 0.09, dur: 0.12 },
    { freq: 1567.9, at: 0.18, dur: 0.32 },
  ],
  // One soft mid note — a date moved, look when you can.
  calendar: [{ freq: 880.0, at: 0, dur: 0.22 }],
  // Quieter still — account housekeeping.
  system: [{ freq: 698.5, at: 0, dur: 0.2, gain: 0.5 }],
  // Two hard pairs, lower and louder — this one wants you now.
  critical: [
    { freq: 659.3, at: 0, dur: 0.11, type: "square", gain: 0.5 },
    { freq: 880.0, at: 0.11, dur: 0.14, type: "square", gain: 0.55 },
    { freq: 659.3, at: 0.34, dur: 0.11, type: "square", gain: 0.5 },
    { freq: 880.0, at: 0.45, dur: 0.2, type: "square", gain: 0.55 },
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
    const now = ctx.currentTime;
    for (const note of MOTIFS[category] ?? MOTIFS.system) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type ?? "triangle";
      osc.frequency.value = note.freq;

      // A hard start or stop on a sine is an audible click; ramp both ends.
      const peak = 0.16 * (note.gain ?? 1);
      const at = now + note.at;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + note.dur);

      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + note.dur + 0.02);
    }
  };

  if (ctx.state === "suspended") {
    ctx.resume().then(start, () => {});
    return;
  }
  start();
}
