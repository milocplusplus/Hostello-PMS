const STYLES: Record<string, string> = {
  confirmed: "text-positive border-positive/30 bg-positive/10",
  tentative: "text-status-pending border-status-pending/40 bg-status-pending/10",
  cancelled: "text-ink-muted border-border-hairline bg-surface-3/60",
};

const DOTS: Record<string, string> = {
  confirmed: "bg-positive",
  tentative: "bg-status-pending",
  cancelled: "bg-ink-muted",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`justify-self-end shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium capitalize rounded-full pl-1.5 pr-2.5 py-1 border ${
        STYLES[status] ?? STYLES.cancelled
      }`}
    >
      {/* A dot carries the state at a glance, before the word is read */}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOTS[status] ?? DOTS.cancelled}`} />
      {status}
    </span>
  );
}
