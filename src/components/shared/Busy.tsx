"use client";

import type { CSSProperties, ReactNode } from "react";
import { createPortal, useFormStatus } from "react-dom";

/**
 * What the app says while a Server Action is in flight.
 *
 * Every write here crosses to a database on another continent, and an upload
 * carries a photo with it — long enough that a button which simply sits there
 * reads as a dead app. `useFormStatus` gives us the enclosing form's pending
 * state, so one `<SubmitButton busy="…">` per form is the whole change: the
 * button disables itself (no double submits) and the words appear on screen.
 *
 * `blocking` picks the register. An upload or a save worth waiting on dims the
 * screen so nobody navigates away mid-write; a quick confirm gets a strip at
 * the bottom instead, because a modal that flashes for 300ms is worse than
 * nothing.
 */

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Out to `document.body`, so a form inside the sidebar's `backdrop-filter` —
 * sign out — still dims the whole screen rather than just its own corner.
 * Rendered only while pending, so the server pass and the first client pass
 * agree and there is nothing to hydrate.
 */
function overlayPortal(node: ReactNode) {
  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

/**
 * A form with two buttons — confirm and reject on the payout queue — would
 * otherwise show both their pop-ups at once. `only` names the action this
 * pop-up belongs to; `useFormStatus` says which one was actually submitted.
 */
type Only = { only?: (formData: FormData) => void };

function speaksFor(
  status: { pending: boolean; action: unknown },
  only: Only["only"]
) {
  return status.pending && (!only || status.action === only);
}

export function BusyOverlay({ label, note, only }: { label: string; note?: string } & Only) {
  const status = useFormStatus();
  if (!speaksFor(status, only)) return null;
  return <BusyScreen show label={label} note={note} />;
}

/**
 * The same pop-up, driven by a boolean instead of a form. For the writes that
 * are not Server Actions — the password reset runs in the browser, because
 * Supabase hands it a session there and nowhere else.
 */
export function BusyScreen({
  show,
  label,
  note,
}: {
  show: boolean;
  label: string;
  note?: string;
}) {
  if (!show) return null;

  return overlayPortal(
    <div
      role="alertdialog"
      aria-busy="true"
      aria-live="assertive"
      aria-label={label}
      /* No fade: this exists to answer a press immediately, and 200ms of
         ramp-up is 200ms of the silence it is meant to end. */
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
    >
      <div className="card px-6 py-5 flex items-center gap-3.5 max-w-xs">
        <span className="text-hostello-gold">
          <Spinner size={18} />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-sm text-ink-primary">{label}</span>
          <span className="text-[11px] text-ink-muted">
            {note ?? "Keep this page open — it will finish on its own."}
          </span>
        </span>
      </div>
    </div>
  );
}

export function BusyToast({ label, only }: { label: string } & Only) {
  const status = useFormStatus();
  if (!speaksFor(status, only)) return null;

  return overlayPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[60] bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2.5 rounded-full border border-border-hairline bg-surface-2 pl-3.5 pr-4 py-2 shadow-[var(--shadow-pop)] animate-in"
    >
      <span className="text-hostello-gold">
        <Spinner size={13} />
      </span>
      <span className="text-xs text-ink-secondary whitespace-nowrap">{label}</span>
    </div>
  );
}

/**
 * A submit button that says what it is doing. `busy` is the sentence the user
 * reads — "Uploading the receipt…", not "Loading".
 */
export function SubmitButton({
  children,
  busy,
  blocking = false,
  note,
  pendingLabel,
  className,
  style,
  disabled,
  title,
  ariaLabel,
  onClick,
  formAction,
  whenAction,
}: {
  children: ReactNode;
  /** What is happening, in the user's words. Omit for no pop-up at all. */
  busy?: string;
  /** True dims the screen; false shows the bottom strip. */
  blocking?: boolean;
  /** Second line of the blocking pop-up. */
  note?: string;
  /** Replaces the button's own label while pending. Icon buttons leave it off. */
  pendingLabel?: string;
  className: string;
  style?: CSSProperties;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** A second action on the same form, e.g. "reject" beside "confirm". */
  formAction?: (formData: FormData) => void;
  /** Only speak when this is the action that ran. Needed only on such a form. */
  whenAction?: (formData: FormData) => void;
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <button
        type="submit"
        disabled={pending || disabled}
        aria-busy={pending}
        aria-label={ariaLabel}
        title={title}
        style={style}
        onClick={onClick}
        formAction={formAction}
        className={`${className} disabled:opacity-60 disabled:cursor-progress`}
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <Spinner size={13} />
            {pendingLabel ?? children}
          </span>
        ) : (
          children
        )}
      </button>
      {busy &&
        (blocking ? (
          <BusyOverlay label={busy} note={note} only={whenAction} />
        ) : (
          <BusyToast label={busy} only={whenAction} />
        ))}
    </>
  );
}
