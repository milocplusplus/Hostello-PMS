"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderInput,
  Images,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { MAX_PHOTOS_PER_UNIT, PHOTO_ROOMS, type GalleryPhoto, type PhotoRoom } from "@/lib/photo-rooms";
import {
  canSharePhotos,
  downloadFiles,
  fetchPhotoFiles,
  fileSlug,
  preparePhoto,
  savesThroughShareSheet,
} from "@/lib/photo-files";
import {
  deletePropertyPhotos,
  finishPhotoUpload,
  movePropertyPhotos,
  starPropertyPhoto,
  uploadPropertyPhoto,
} from "@/app/photos/actions";
import { ChoiceChips } from "@/components/shared/FormStep";
import { BusyScreen } from "@/components/shared/Busy";
import { EmptyState } from "@/components/shared/PageHeader";
import { errorBanner } from "@/lib/form-styles";

const noop = () => () => {};

/** Out to <body>: the page's sections animate with transforms, which trap a fixed overlay. */
function Portal({ children }: { children: ReactNode }) {
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  return inBrowser ? createPortal(children, document.body) : null;
}

/**
 * A unit's photos, grouped by room. Anyone who can open it can save or share
 * the full-size files; `canEdit` adds upload, the cover star and removal. Both
 * portals render this one component — who may write is the database's call.
 */
export function PhotoGallery({
  propertyId,
  unitName,
  photos,
  canEdit,
  canMove = false,
  legacyCoverUrl,
}: {
  propertyId: string;
  unitName: string;
  photos: GalleryPhoto[];
  canEdit: boolean;
  /** Staff only: file the ticked photos under another room. */
  canMove?: boolean;
  /** A cover uploaded before the gallery existed, which is in no gallery yet. */
  legacyCoverUrl?: string | null;
}) {
  const [room, setRoom] = useState<PhotoRoom>("bedroom");
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  // null = not selecting.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Files fetched for sharing whose tap went stale while they downloaded.
  const [ready, setReady] = useState<File[] | null>(null);
  // The "move to which room?" sheet for the ticked photos.
  const [moving, setMoving] = useState(false);
  const shareable = useSyncExternalStore(noop, canSharePhotos, () => false);

  const groups = useMemo(
    () =>
      PHOTO_ROOMS.map((r) => ({ ...r, photos: photos.filter((p) => p.room === r.value) })).filter(
        (g) => g.photos.length > 0
      ),
    [photos]
  );
  const ordered = useMemo(() => groups.flatMap((g) => g.photos), [groups]);
  // cedar-lodge-bedroom-1.jpg: recognisable in a phone gallery or an Airbnb upload.
  const names = useMemo(() => {
    const slug = fileSlug(unitName);
    const map = new Map<string, string>();
    for (const g of groups) {
      g.photos.forEach((p, i) => map.set(p.id, `${slug}-${g.value.replace("_", "-")}-${i + 1}.jpg`));
    }
    return map;
  }, [groups, unitName]);

  const openIndex = open ? ordered.findIndex((p) => p.id === open) : -1;
  const current = openIndex >= 0 ? ordered[openIndex] : null;
  const roomLeft = MAX_PHOTOS_PER_UNIT - photos.length;
  const roomLabel = PHOTO_ROOMS.find((r) => r.value === room)?.label ?? "";

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowLeft" && openIndex > 0) setOpen(ordered[openIndex - 1].id);
      if (e.key === "ArrowRight" && openIndex < ordered.length - 1) setOpen(ordered[openIndex + 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, openIndex, ordered]);

  // ── Adding ────────────────────────────────────────────────────────────────

  async function addPhotos(list: { blob: Blob; name: string }[], cover = false) {
    const failed: string[] = [];
    if (list.length > roomLeft) {
      failed.push(
        roomLeft > 0
          ? `Only ${roomLeft} more fit: a unit holds ${MAX_PHOTOS_PER_UNIT} photos. The rest were left out.`
          : `This unit already has ${MAX_PHOTOS_PER_UNIT} photos. Remove one first.`
      );
      list = list.slice(0, Math.max(roomLeft, 0));
    }

    let added = 0;
    for (const [i, item] of list.entries()) {
      setBusy(list.length === 1 ? "Uploading the photo…" : `Uploading photo ${i + 1} of ${list.length}…`);
      try {
        const { full, thumb } = await preparePhoto(item.blob);
        const body = new FormData();
        body.set("property_id", propertyId);
        body.set("room", room);
        body.set("full", full);
        body.set("thumb", thumb);
        if (cover) body.set("cover", "1");
        const result = await uploadPropertyPhoto(body);
        if (result.error) failed.push(`${item.name}: ${result.error}`);
        else added += 1;
      } catch {
        failed.push(`${item.name}: could not be read as a photo.`);
      }
    }

    if (list.length > 0) {
      await finishPhotoUpload(propertyId, added, crypto.randomUUID()).catch(() => {});
    }
    setBusy(null);
    setErrors(failed);
  }

  async function adoptLegacyCover() {
    if (!legacyCoverUrl) return;
    setBusy("Uploading the photo…");
    try {
      const blob = await (await fetch(legacyCoverUrl)).blob();
      await addPhotos([{ blob, name: "Cover photo" }], true);
    } catch {
      setBusy(null);
      setErrors(["Could not fetch the old cover photo."]);
    }
  }

  // ── Saving and sharing ────────────────────────────────────────────────────

  async function share(files: File[], secondTap = false) {
    try {
      await navigator.share({ files });
      setReady(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return setReady(null); // sheet closed
      // Fetching outlived the tap that asked for it; the browser wants a fresh one.
      if (!secondTap) return setReady(files);
      setReady(null);
      await downloadFiles(files);
    }
  }

  async function take(mode: "save" | "share", ids: string[]) {
    const items = ordered
      .filter((p) => ids.includes(p.id) && p.fullUrl)
      .map((p) => ({ url: p.fullUrl as string, name: names.get(p.id) ?? "photo.jpg" }));
    if (items.length === 0) return;

    setErrors([]);
    setBusy(items.length === 1 ? "Getting the photo…" : `Getting ${items.length} photos…`);
    try {
      const files = await fetchPhotoFiles(items);
      setBusy(null);
      if (mode === "share" || savesThroughShareSheet()) await share(files);
      else await downloadFiles(files);
    } catch {
      setBusy(null);
      setErrors(["Could not fetch the photos. Reload the page and try again."]);
    }
  }

  // ── Cover and removal ─────────────────────────────────────────────────────

  async function remove(ids: string[]) {
    const ask = ids.length === 1 ? "Remove this photo?" : `Remove ${ids.length} photos?`;
    if (ids.length === 0 || !window.confirm(ask)) return;
    setBusy("Removing…");
    const result = await deletePropertyPhotos(propertyId, ids).catch(() => ({
      error: "Could not remove. Try again.",
    }));
    setBusy(null);
    setErrors(result.error ? [result.error] : []);
    setPicked(null);
    setOpen(null);
  }

  async function move(ids: string[], to: PhotoRoom) {
    setMoving(false);
    setBusy(ids.length === 1 ? "Moving the photo…" : `Moving ${ids.length} photos…`);
    const result = await movePropertyPhotos(propertyId, ids, to).catch(() => ({
      error: "Could not move. Try again.",
    }));
    setBusy(null);
    setErrors(result.error ? [result.error] : []);
    setPicked(null);
  }

  async function star(id: string) {
    setBusy("Setting the cover…");
    const result = await starPropertyPhoto(propertyId, id).catch(() => ({
      error: "Could not set the cover. Try again.",
    }));
    setBusy(null);
    setErrors(result.error ? [result.error] : []);
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  const pickedIds = picked ? [...picked] : [];

  return (
    <div className="flex flex-col gap-5">
      {errors.length > 0 && (
        <div className={`${errorBanner} flex flex-col gap-1`}>
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      {canEdit && (
        <section className="card p-4 md:p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink-primary">Add photos</h2>
            <span className="num text-xs text-ink-muted">
              {photos.length} of {MAX_PHOTOS_PER_UNIT}
            </span>
          </div>
          <ChoiceChips label="Room" value={room} onChange={setRoom} options={PHOTO_ROOMS} />
          <label
            className={`btn btn-primary h-11 self-start ${roomLeft > 0 ? "cursor-pointer" : "opacity-55 pointer-events-none"}`}
          >
            <Camera size={16} />
            Add to {roomLabel}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={roomLeft <= 0}
              className="sr-only"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []).map((f) => ({ blob: f, name: f.name }));
                e.target.value = "";
                if (list.length > 0) void addPhotos(list);
              }}
            />
          </label>
          {legacyCoverUrl && (
            <p className="text-xs text-ink-secondary">
              This unit&apos;s cover was added before the gallery and is not in it yet.{" "}
              <button type="button" onClick={adoptLegacyCover} className="text-hostello-gold hover:underline">
                Add it under {roomLabel}
              </button>
            </p>
          )}
        </section>
      )}

      {photos.length === 0 ? (
        <EmptyState
          icon={Images}
          title={<>No photos of {unitName} yet.</>}
          body={canEdit ? "Pick a room above, then add its pictures." : undefined}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">
              {picked ? `${picked.size} selected` : "Tap a photo to open it."}
            </p>
            <div className="flex items-center gap-2">
              {picked && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPicked(new Set(ordered.map((p) => p.id)))}
                >
                  All
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPicked(picked ? null : new Set())}
              >
                {picked ? "Done" : "Select"}
              </button>
            </div>
          </div>

          {groups.map((g) => (
            <section key={g.value} className="flex flex-col gap-2.5">
              <h2 className="text-sm font-semibold text-ink-secondary">
                {g.label} <span className="num text-ink-muted font-normal">· {g.photos.length}</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {g.photos.map((p) => {
                  const on = picked?.has(p.id) ?? false;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => (picked ? toggle(p.id) : setOpen(p.id))}
                      aria-pressed={picked ? on : undefined}
                      aria-label={`${g.label} photo${p.isCover ? ", cover" : ""}`}
                      className={`relative aspect-[4/3] rounded-2xl overflow-hidden bg-surface-2 border transition-colors ${
                        on ? "border-hostello-gold" : "border-border-hairline hover:border-border-strong"
                      }`}
                    >
                      {p.thumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires; not worth optimizing
                        <img src={p.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                      {p.isCover && (
                        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-bold text-hostello-gold-bright">
                          <Star size={11} fill="currentColor" /> Cover
                        </span>
                      )}
                      {picked && (
                        <span
                          className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                            on ? "border-hostello-gold bg-hostello-gold text-surface-0" : "border-white/80 bg-black/45"
                          }`}
                        >
                          {on && <Check size={14} strokeWidth={3} />}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      <BusyScreen show={busy !== null} label={busy ?? ""} />

      {/* What to do with the ticked photos. */}
      {picked && picked.size > 0 && !ready && (
        <Portal>
          <div className="fixed z-50 left-1/2 -translate-x-1/2 bottom-[calc(1rem+var(--tabbar-space,0px))] flex items-center gap-2 rounded-2xl border border-hostello-purple/40 bg-surface-2 p-2 shadow-[var(--shadow-pop)]">
            <button type="button" className="btn btn-primary btn-sm h-10" onClick={() => take("save", pickedIds)}>
              <Download size={15} /> Save {picked.size}
            </button>
            {shareable && (
              <button type="button" className="btn btn-ghost btn-sm h-10" onClick={() => take("share", pickedIds)}>
                <Share2 size={15} /> Share
              </button>
            )}
            {canMove && (
              <button type="button" className="btn btn-ghost btn-sm h-10" onClick={() => setMoving(true)}>
                <FolderInput size={15} /> Move
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                className="btn btn-ghost btn-sm h-10"
                aria-label="Remove the selected photos"
                onClick={() => remove(pickedIds)}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </Portal>
      )}

      {moving && picked && (
        <Portal>
          <div
            className="fixed inset-0 z-[58] flex items-end md:items-center justify-center bg-black/75 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            role="dialog"
            aria-modal
            aria-label="Move to a room"
          >
            <div className="card w-full max-w-sm p-5 flex flex-col gap-3">
              <p className="text-sm font-semibold text-ink-primary">
                Move {picked.size === 1 ? "this photo" : `${picked.size} photos`} to
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PHOTO_ROOMS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className="btn btn-ghost h-11 justify-start"
                    onClick={() => move(pickedIds, r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-ghost h-11" onClick={() => setMoving(false)}>
                Cancel
              </button>
            </div>
          </div>
        </Portal>
      )}

      {ready && (
        <Portal>
          <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/75 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="card w-full max-w-sm p-5 flex flex-col gap-3">
              <p className="text-sm font-semibold text-ink-primary">
                {ready.length === 1 ? "Your photo is ready." : `Your ${ready.length} photos are ready.`}
              </p>
              <button type="button" className="btn btn-primary h-12 text-[15px]" onClick={() => share(ready, true)}>
                <Share2 size={16} /> Save or share
              </button>
              <button type="button" className="btn btn-ghost h-11" onClick={() => setReady(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Portal>
      )}

      {current && !ready && (
        <Portal>
          <div
            // Under the busy screen (z-60), which Save and Make cover raise from here.
            className="fixed inset-0 z-[55] flex flex-col bg-black/95 text-white"
            role="dialog"
            aria-modal
            aria-label={`${unitName} photo`}
          >
            <div className="flex items-center justify-between gap-3 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
              <p className="text-sm font-semibold truncate">
                {PHOTO_ROOMS.find((r) => r.value === current.room)?.label}
                <span className="num text-white/60 font-normal">
                  {" "}
                  · {openIndex + 1} / {ordered.length}
                </span>
              </p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
              >
                <X size={20} />
              </button>
            </div>

            <div className="relative flex-1 min-h-0 flex items-center justify-center px-2">
              {current.thumbUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires; not worth optimizing
                <img src={current.thumbUrl} alt="" className="max-h-full max-w-full object-contain rounded-lg" />
              )}
              {openIndex > 0 && (
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => setOpen(ordered[openIndex - 1].id)}
                  className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60"
                >
                  <ChevronLeft size={22} />
                </button>
              )}
              {openIndex < ordered.length - 1 && (
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => setOpen(ordered[openIndex + 1].id)}
                  className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60"
                >
                  <ChevronRight size={22} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button type="button" className="btn btn-primary h-11" onClick={() => take("save", [current.id])}>
                <Download size={16} /> Save
              </button>
              {shareable && (
                <button type="button" className="btn btn-ghost h-11" onClick={() => take("share", [current.id])}>
                  <Share2 size={16} /> Share
                </button>
              )}
              {canEdit &&
                (current.isCover ? (
                  <span className="flex items-center gap-1.5 px-3 text-xs font-bold text-hostello-gold-bright">
                    <Star size={14} fill="currentColor" /> Cover photo
                  </span>
                ) : (
                  <button type="button" className="btn btn-ghost h-11" onClick={() => star(current.id)}>
                    <Star size={16} /> Make cover
                  </button>
                ))}
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-ghost h-11"
                  aria-label="Remove this photo"
                  onClick={() => remove([current.id])}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
