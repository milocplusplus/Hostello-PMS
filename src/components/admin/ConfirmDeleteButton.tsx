"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { BusyToast, Spinner } from "@/components/shared/Busy";

export function ConfirmDeleteButton({
  confirmText,
  label = "Delete",
  children,
  className,
  busy,
}: {
  confirmText: string;
  label?: string;
  children?: ReactNode;
  className: string;
  /** What the strip at the bottom says while the delete is in flight. */
  busy?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <button
        type="submit"
        className={`${className} disabled:opacity-60 disabled:cursor-progress`}
        aria-label={label}
        aria-busy={pending}
        disabled={pending}
        onClick={(e) => {
          if (!window.confirm(confirmText)) {
            e.preventDefault();
          }
        }}
      >
        {pending ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner size={12} />
            {children ?? label}
          </span>
        ) : (
          children ?? label
        )}
      </button>
      <BusyToast label={busy ?? "Removing…"} />
    </>
  );
}
