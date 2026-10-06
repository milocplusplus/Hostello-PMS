import type { ReactNode } from "react";
import { Check, ChevronRight, Star } from "lucide-react";
import { reviewMessage, waLink, waPhone, type HouseStyle } from "@/lib/guest-messages";
import type { ReviewRequest } from "@/lib/review-requests";
import { EmptyState } from "@/components/shared/PageHeader";
import { InfoSheet } from "@/components/shared/InfoSheet";
import { SubmitButton } from "@/components/shared/Busy";
import { CopyLinkButton } from "@/components/admin/CopyLinkButton";
import { tickReviewRequest } from "@/app/admin/today/actions";

function Tick({
  id,
  tick,
  on,
  className,
  children,
}: {
  id: string;
  tick: "asked" | "guest_reviewed" | "received";
  on: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <form action={tickReviewRequest}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="tick" value={tick} />
      <input type="hidden" name="on" value={String(on)} />
      <SubmitButton className={className}>{children}</SubmitButton>
    </form>
  );
}

function who(r: ReviewRequest): string {
  return r.guestName?.trim().split(/\s+/)[0] || "Airbnb guest";
}

function when(r: ReviewRequest, today: string): string {
  const days = Math.round((Date.parse(today) - Date.parse(r.leavesOn)) / 86_400_000);
  return days <= 0 ? "Leaves today" : days === 1 ? "Left yesterday" : `Left ${days} days ago`;
}

/** We reviewed the guest: a toggle, since Airbnb then prompts them for theirs. */
function ReviewedGuest({ r }: { r: ReviewRequest }) {
  return (
    <Tick id={r.id} tick="guest_reviewed" on={!r.guestReviewed} className="btn btn-ghost btn-sm">
      {r.guestReviewed && <Check size={13} className="text-positive" aria-hidden />}
      {r.guestReviewed ? "Guest reviewed" : "We reviewed guest"}
    </Tick>
  );
}

/**
 * Airbnb guests to ask for a review, on the staff Today page. It sends
 * nothing: Copy is for pasting into the Airbnb chat, and WhatsApp opens the
 * chat with the text typed when the booking holds a number.
 */
export function ReviewRequests({
  toAsk,
  waiting,
  today,
  house,
}: {
  toAsk: ReviewRequest[];
  waiting: ReviewRequest[];
  today: string;
  house: HouseStyle;
}) {
  return (
    <section id="reviews" className="card overflow-hidden flex flex-col scroll-mt-24">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-hairline">
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-hostello-gold) 20%, transparent)" }}
        >
          <Star size={14} style={{ color: "var(--color-hostello-gold)" }} />
        </span>
        <h2 className="text-sm font-medium">Ask for a review</h2>
        <InfoSheet title="Ask for a review" className="bg-white/8 text-ink-secondary">
          <p>
            Airbnb guests appear here on the morning they leave and stay for a week. Copy the
            message and paste it into the Airbnb chat, then tick Asked.
          </p>
          <p className="mt-2">
            Review the guest on Airbnb as well: Airbnb then prompts them to write theirs. When
            their review appears, tick Review came in. The wording is in Settings, under Guest
            messages.
          </p>
        </InfoSheet>
        <span className="flex-1" />
        {toAsk.length > 0 && <span className="text-xs text-ink-muted">{toAsk.length}</span>}
      </div>

      {toAsk.length === 0 ? (
        <div className="p-3">
          <EmptyState
            inset
            icon={Star}
            title="No Airbnb guests to ask."
            body="A stay shows here on the morning its guest leaves."
          />
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border-hairline)]">
          {toAsk.map((r) => {
            const message = reviewMessage({
              guestName: r.guestName,
              unitName: r.unitName,
              checkIn: r.checkIn,
              leavesOn: r.leavesOn,
              house,
            });
            const number = waPhone(r.guestPhone);
            return (
              <li key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-sm text-ink-primary truncate">
                    {r.unitName} <span className="text-ink-secondary">· {who(r)}</span>
                  </p>
                  <p className="text-xs text-ink-secondary mt-0.5">{when(r, today)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyLinkButton value={message} className="btn btn-ghost btn-sm" label="Copy message" />
                  {number && (
                    <a href={waLink(number, message)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                      WhatsApp
                    </a>
                  )}
                  <ReviewedGuest r={r} />
                  <Tick id={r.id} tick="asked" on className="btn btn-gold btn-sm">
                    Asked
                  </Tick>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {waiting.length > 0 && (
        <details className="group border-t border-border-hairline">
          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer px-4 py-3 flex items-center gap-2 text-xs font-bold text-ink-secondary">
            <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden />
            Asked, waiting for the review
            <span className="num font-normal text-ink-muted">{waiting.length}</span>
          </summary>
          <ul className="divide-y divide-[var(--color-border-hairline)] border-t border-border-hairline">
            {waiting.map((r) => (
              <li key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-sm text-ink-primary truncate">
                    {r.unitName} <span className="text-ink-secondary">· {who(r)}</span>
                  </p>
                  <p className="text-xs text-ink-secondary mt-0.5">{when(r, today)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Tick id={r.id} tick="asked" on={false} className="btn btn-ghost btn-sm">
                    Not asked
                  </Tick>
                  <ReviewedGuest r={r} />
                  <Tick id={r.id} tick="received" on className="btn btn-gold btn-sm">
                    Review came in
                  </Tick>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
