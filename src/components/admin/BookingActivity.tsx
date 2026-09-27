"use client";

import { sourceColor, sourceInitial } from "@/lib/block-sources";

export type ActivityBooking = {
  id: string;
  guestName: string | null;
  clientName: string | null;
  units: string;
  checkIn: string;
  checkOut: string;
  source: string;
  status: string;
};

export function ChannelBadge({ source }: { source: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white shrink-0"
      style={{
        backgroundColor: sourceColor(source),
        boxShadow: `0 0 0 1px rgba(255,255,255,0.12), 0 0 8px -2px ${sourceColor(source)}`,
      }}
      aria-hidden
    >
      {sourceInitial(source)}
    </span>
  );
}
