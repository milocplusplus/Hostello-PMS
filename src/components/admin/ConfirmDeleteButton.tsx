"use client";

import type { ReactNode } from "react";

export function ConfirmDeleteButton({
  confirmText,
  label = "Delete",
  children,
  className,
}: {
  confirmText: string;
  label?: string;
  children?: ReactNode;
  className: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      aria-label={label}
      onClick={(e) => {
        if (!window.confirm(confirmText)) {
          e.preventDefault();
        }
      }}
    >
      {children ?? label}
    </button>
  );
}
