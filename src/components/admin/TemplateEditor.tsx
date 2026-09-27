"use client";

import { useState } from "react";
import { fillTemplate, type GuestMessageContext, type GuestMessageId } from "@/lib/guest-messages";
import { fieldInput, primaryButton, secondaryButton } from "@/lib/form-styles";
import { SubmitButton } from "@/components/shared/Busy";

/**
 * One guest message's wording, with the result beside it for a sample stay —
 * so a mistyped {placeholder} shows up here, not in a guest's WhatsApp.
 */
export function TemplateEditor({
  id,
  label,
  saved,
  builtIn,
  sample,
  action,
}: {
  id: GuestMessageId;
  label: string;
  /** The saved wording, or null when the built-in text is in use. */
  saved: string | null;
  builtIn: string;
  sample: GuestMessageContext;
  action: (formData: FormData) => void;
}) {
  const [text, setText] = useState(saved ?? builtIn);

  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{label}</h3>
          <span className="text-[11px] text-ink-muted">{saved ? "Your wording" : "Built-in wording"}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <textarea
            name="body"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={`${fieldInput} font-mono text-xs leading-relaxed`}
            aria-label={`${label} wording`}
          />
          <div className="rounded-xl bg-surface-2 p-3 text-xs text-ink-secondary whitespace-pre-wrap leading-relaxed">
            <p className="text-[10px] uppercase tracking-[0.12em] text-ink-muted mb-2">Preview · sample stay</p>
            {fillTemplate(text, sample)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SubmitButton className={primaryButton} busy="Saving…">
            Save
          </SubmitButton>
        </div>
      </form>
      {saved && (
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="reset" value="1" />
          <SubmitButton className={secondaryButton} busy="Resetting…">
            Reset to built-in
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
