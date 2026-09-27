import { useId } from "react";

/**
 * The Hostello mark — two front panels with their side faces folded back.
 * Traced off the supplied logo; same geometry as the PWA icons in
 * `public/icons` (see the generator note in STATE.md). Change one, change both.
 * `size` is the mark's height; the artwork is taller than it is wide.
 */
export function HostelloMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // Gradient ids must be unique per copy: two marks on a page (sidebar and
  // phone top bar) otherwise both point at the first copy's gradients, and when
  // that copy is display:none the visible one paints nothing.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const side = `hostello-mark-side-${uid}`;
  const front = `hostello-mark-front-${uid}`;
  return (
    <svg
      width={(size * 100) / 117}
      height={size}
      viewBox="0 0 100 117"
      fill="none"
      aria-hidden
      className={className}
    >
      <defs>
        <linearGradient id={side} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
        <linearGradient id={front} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e7e4f0" />
        </linearGradient>
      </defs>
      <polygon points="0,31 20,26 20,73 0,80" fill={`url(#${side})`} />
      <polygon points="33,11 64,0 64,26 33,37" fill={`url(#${side})`} />
      <polygon points="20,26 46,38 46,102 20,91" fill={`url(#${front})`} />
      <polygon points="64,3 100,11 100,117 64,106" fill={`url(#${front})`} />
    </svg>
  );
}
