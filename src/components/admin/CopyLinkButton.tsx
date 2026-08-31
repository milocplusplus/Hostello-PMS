"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copies a link and says so. The value is shown in full next to it, so if the
 * clipboard is unavailable (an insecure origin, a locked-down browser) the
 * button falls back to selecting nothing and the user can still copy by hand.
 */
export function CopyLinkButton({ value, className }: { value: string; className: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
