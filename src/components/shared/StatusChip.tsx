const STYLES: Record<string, string> = {
  confirmed: "text-positive border-positive/30 bg-positive/10",
  tentative: "text-status-pending border-status-pending/40 bg-status-pending/10",
  cancelled: "text-ink-muted border-border-hairline bg-surface-3/60",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`justify-self-end shrink-0 text-[11px] capitalize rounded-md px-2 py-1 border ${
        STYLES[status] ?? STYLES.cancelled
      }`}
    >
      {status}
    </span>
  );
}
