/**
 * The groups of owner notices the admin can switch off, in Settings (for every
 * owner) and on a client's page (for one). `owner_notice_group()` in SQL maps
 * each notification kind to one of these keys; keep the two in step.
 */
export const OWNER_NOTICE_GROUPS = [
  { key: "bookings", label: "Bookings", about: "New, changed and cancelled stays; guests checking in and out." },
  { key: "calendar", label: "Calendar", about: "Dates blocked or reopened; units added, removed or re-rated." },
  { key: "payments", label: "Payments", about: "Payouts sent to them, their payments confirmed or rejected, terms changed." },
  { key: "digest", label: "Morning summary & bills", about: "The 07:15 daily summary, recurring bills due, budget alerts." },
  { key: "reminder", label: "Weekly payment reminder", about: "Mondays 10:00: what they owe Hostello, when it's above zero." },
] as const;

export type OwnerNoticeGroup = (typeof OWNER_NOTICE_GROUPS)[number]["key"];
export type OwnerNotices = Partial<Record<OwnerNoticeGroup, boolean>>;

export function isOwnerNoticeGroup(v: string): v is OwnerNoticeGroup {
  return OWNER_NOTICE_GROUPS.some((g) => g.key === v);
}
