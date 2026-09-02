import { Check, LogIn, LogOut } from "lucide-react";
import { SubmitButton } from "@/components/shared/Busy";

/**
 * Ticking an arrival or a departure off. Each portal passes its own write —
 * `markStayProgress` / `markClientStayProgress`.
 */
export type StayProgressAction = (formData: FormData) => void;

export type ProgressStep = "in" | "out";

function label(step: ProgressStep) {
  return step === "in" ? "checked in" : "checked out";
}

/**
 * The tick itself. A form rather than a checkbox because this is a write, and a
 * checkbox that needs a separate Save button is worse than a thing you press
 * once. Both directions toggle, so a mis-tap is undone the same way.
 */
export function StayTick({
  bookingId,
  step,
  done,
  action,
}: {
  bookingId: string;
  step: ProgressStep;
  done: boolean;
  action: StayProgressAction;
}) {
  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="id" value={bookingId} />
      <input type="hidden" name="step" value={step} />
      <input type="hidden" name="done" value={(!done).toString()} />
      <SubmitButton
        title={done ? `Undo — marked ${label(step)}` : `Mark ${label(step)}`}
        ariaLabel={done ? `Undo — marked ${label(step)}` : `Mark ${label(step)}`}
        busy={done ? `Undoing ${label(step)}…` : `Marking ${label(step)}…`}
        /* Empty, so the spinner takes the tick's place rather than crowding it. */
        pendingLabel=""
        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
          done
            ? "border-positive bg-positive/15 text-positive"
            : "border-border-hairline text-ink-muted hover:border-border-strong hover:text-ink-secondary"
        }`}
      >
        <Check size={15} />
      </SubmitButton>
    </form>
  );
}

/** "3:40 PM" in Karachi — when the tick was made, not when the stay is booked for. */
function tickedAt(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  });
}

/**
 * The same two ticks on the booking itself.
 *
 * The day sheet only ever shows today, so without this an arrival nobody
 * ticked on the day could never be ticked at all.
 */
export function StayProgressCard({
  bookingId,
  checkedInAt,
  checkedOutAt,
  action,
}: {
  bookingId: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  action: StayProgressAction;
}) {
  const steps: { step: ProgressStep; icon: typeof LogIn; title: string; at: string | null }[] = [
    { step: "in", icon: LogIn, title: "Arrival", at: checkedInAt },
    { step: "out", icon: LogOut, title: "Departure", at: checkedOutAt },
  ];

  return (
    <div className="card p-5">
      <h2 className="text-sm font-medium text-ink-secondary mb-3">Arrival &amp; departure</h2>
      <div className="flex flex-col">
        {steps.map(({ step, icon: Icon, title, at }) => (
          <div
            key={step}
            className="flex items-center gap-3 py-2.5 border-b border-border-hairline last:border-0"
          >
            <Icon size={14} className="text-ink-muted shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-primary">{title}</p>
              <p className="text-xs text-ink-muted mt-0.5">
                {at ? `Marked ${label(step)} at ${tickedAt(at)}` : "Not yet marked"}
              </p>
            </div>
            <StayTick bookingId={bookingId} step={step} done={Boolean(at)} action={action} />
          </div>
        ))}
      </div>
    </div>
  );
}
