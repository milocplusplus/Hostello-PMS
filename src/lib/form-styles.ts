/**
 * The app's form and button vocabulary. Every page imports from here, so this
 * is where the look of a control changes — the visual definitions themselves
 * live as `.field` / `.btn` in `globals.css`.
 */
export const fieldLabel = "text-xs font-medium text-ink-secondary";

/* No width on either: both used to size to content, and stretch to full width
   only because their containers are flex columns. Keep it that way — some call
   sites put them inline in a row. */
export const fieldInput = "field";

export const primaryButton = "btn btn-gold";

export const secondaryButton = "btn btn-ghost btn-sm";

export const errorBanner =
  "text-xs text-negative bg-negative/10 border border-negative/30 rounded-lg px-3 py-2.5";

export const noticeBanner =
  "text-xs text-positive bg-positive/10 border border-positive/30 rounded-lg px-3 py-2.5";
