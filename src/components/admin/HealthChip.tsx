import { TONE_CLASS, type Health } from "@/lib/channel-health";

/** A channel link's health in one word and a colour. */
export function HealthChip({ health }: { health: Health }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] whitespace-nowrap ${TONE_CLASS[health.tone]}`}
    >
      {health.label}
    </span>
  );
}
