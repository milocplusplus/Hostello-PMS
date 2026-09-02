import { FileText, IdCard } from "lucide-react";
import { formatDayMonth } from "@/lib/calendar";
import { GUEST_ID_ACCEPT, MAX_GUEST_IDS_PER_UPLOAD, type GuestId } from "@/lib/guest-ids";
import { fieldInput, fieldLabel, errorBanner, secondaryButton } from "@/lib/form-styles";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { SubmitButton } from "@/components/shared/Busy";

/**
 * Guest ID cards on a booking. Read-only unless an upload action is passed in.
 * Both portals pass one — collecting the guest's ID is the job of whoever met
 * the guest, which on a self-sourced booking is the owner.
 */
export function GuestIdCards({
  bookingId,
  guestIds,
  uploadAction,
  deleteAction,
  viewerId,
  error,
}: {
  bookingId: string;
  guestIds: GuestId[];
  uploadAction?: (formData: FormData) => void;
  deleteAction?: (formData: FormData) => void;
  /** Set on the owner's side: they may only take back their own uploads. */
  viewerId?: string;
  error?: string;
}) {
  const canDelete = (g: GuestId) =>
    Boolean(deleteAction) && (!viewerId || g.uploadedBy === viewerId);
  return (
    <div className="card p-5">
      <h2 className="text-sm font-medium text-ink-secondary mb-1 flex items-center gap-1.5">
        <IdCard size={13} /> Guest ID cards
      </h2>
      <p className="text-[11px] text-ink-muted mb-3">
        CNIC or passport scans for this stay — one per guest, or a front and a back.
      </p>

      {guestIds.length === 0 && <p className="text-xs text-ink-muted">No ID attached yet.</p>}

      {guestIds.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {guestIds.map((g) => (
            <div key={g.id} className="flex flex-col gap-1.5">
              <a
                href={g.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md border border-border-hairline overflow-hidden bg-surface-2 aspect-[3/2] hover:border-border-strong transition-colors"
              >
                {g.isPdf || !g.url ? (
                  <span className="h-full w-full flex flex-col items-center justify-center gap-1.5 text-ink-muted text-[11px]">
                    <FileText size={20} />
                    {g.url ? "PDF" : "Unavailable"}
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires; not worth optimizing
                  <img src={g.url} alt="Guest ID card" className="h-full w-full object-cover" />
                )}
              </a>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-ink-muted">
                  {formatDayMonth(g.created_at.slice(0, 10))}
                </span>
                {deleteAction && canDelete(g) && (
                  <form action={deleteAction} className="ml-auto">
                    <input type="hidden" name="id" value={g.id} />
                    <input type="hidden" name="booking_id" value={bookingId} />
                    <ConfirmDeleteButton
                      confirmText="Remove this ID card?"
                      label="Remove"
                      className="text-[11px] text-ink-muted hover:text-status-booked transition-colors"
                    />
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {uploadAction && (
        <form action={uploadAction} className="mt-4 pt-4 border-t border-border-hairline flex flex-col gap-3">
          <input type="hidden" name="booking_id" value={bookingId} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="guest_ids" className={fieldLabel}>
              ID cards (PNG, JPG or PDF, up to {MAX_GUEST_IDS_PER_UPLOAD} at a time)
            </label>
            <input
              id="guest_ids"
              name="guest_ids"
              type="file"
              required
              multiple
              accept={GUEST_ID_ACCEPT}
              className={`${fieldInput} file:mr-3 file:rounded file:border-0 file:bg-surface-3 file:px-2 file:py-1 file:text-xs file:text-ink-secondary`}
            />
          </div>

          {error && <p className={errorBanner}>{error}</p>}

          <SubmitButton
            className={`${secondaryButton} self-start`}
            busy="Uploading the ID cards…"
            blocking
            note="Several scans can take a while. They upload together — closing now loses all of them."
          >
            Attach ID cards
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
