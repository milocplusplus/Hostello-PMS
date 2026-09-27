"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Camera, Home, Loader2, Trash2 } from "lucide-react";
import { unitArt } from "@/lib/unit-tint";

function Uploading() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <span className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-black/55 backdrop-blur-sm text-sm font-bold text-white">
      <Loader2 size={18} className="animate-spin" />
      Uploading…
    </span>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Remove photo"
      className="btn h-10 w-10 p-0 rounded-xl bg-black/45 backdrop-blur-sm text-white"
    >
      {pending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
    </button>
  );
}

/**
 * A unit's cover photo with Add / Change and Remove. Picking a file submits
 * at once; there is nothing else to fill in. `fields` are the hidden inputs
 * each portal's action needs (the admin's takes the client id, the owner's
 * reads it from the session).
 */
export function PropertyPhotoField({
  name,
  photoPath,
  fields,
  uploadAction,
  removeAction,
  className = "h-40",
}: {
  name: string;
  photoPath: string | null;
  fields: Record<string, string>;
  uploadAction: (formData: FormData) => void | Promise<void>;
  removeAction: (formData: FormData) => void | Promise<void>;
  className?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const hidden = Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{ background: unitArt(name, photoPath) }}
    >
      {!photoPath && (
        <Home size={96} strokeWidth={1.2} className="absolute -right-3 -top-4 text-white/20" aria-hidden />
      )}
      <form ref={form} action={uploadAction} className="contents">
        {hidden}
        <Uploading />
        <label className="btn btn-primary absolute left-3 bottom-3 h-10 rounded-xl cursor-pointer">
          <Camera size={16} />
          {photoPath ? "Change photo" : "Add photo"}
          <input
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={() => form.current?.requestSubmit()}
          />
        </label>
      </form>
      {photoPath && (
        <form action={removeAction} className="absolute right-3 bottom-3">
          {hidden}
          <RemoveButton />
        </form>
      )}
    </div>
  );
}
