"use client";

import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { VIEW_AS_EXIT_HREF } from "@/lib/view-as";

/**
 * Across the top of the owner portal while the admin is viewing as an owner.
 *
 * The middleware refuses every write; this only makes the refusal polite. A
 * form that would save something is stopped before it is sent, with a word
 * about why, instead of failing with a server error. GET forms (search,
 * filters) still work — they only read.
 */
export function ViewAsBanner({ clientName }: { clientName: string }) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement | null;
      if (!form) return;
      // A Server Action form keeps the default method ("get"); what marks it is
      // React's `javascript:` placeholder in `action` (or on the submitter).
      const action = `${form.getAttribute("action") ?? ""} ${e.submitter?.getAttribute("formaction") ?? ""}`;
      const writes = action.includes("javascript:") || form.method.toLowerCase() === "post";
      if (!writes) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setBlocked(true);
      clearTimeout(timer);
      timer = setTimeout(() => setBlocked(false), 3500);
    };
    // Capture phase, on window: ahead of React's own listener at the root.
    window.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("submit", onSubmit, true);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="sticky top-0 z-[60] gradient-gold text-surface-0">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3 text-xs font-bold">
        <Eye size={16} className="shrink-0" />
        <p className="min-w-0 flex-1 truncate">
          {blocked ? "Read-only — nothing can be saved while viewing as an owner." : `Viewing as ${clientName} · read-only`}
        </p>
        {/* A plain link, never <Link>: a prefetch would end the view by itself. */}
        <a
          href={VIEW_AS_EXIT_HREF}
          className="inline-flex items-center gap-1 rounded-full bg-surface-0/15 hover:bg-surface-0/25 px-3 py-1 shrink-0"
        >
          <X size={14} />
          Exit
        </a>
      </div>
    </div>
  );
}
