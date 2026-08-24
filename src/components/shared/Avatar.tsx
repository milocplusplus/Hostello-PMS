const PALETTE = [
  "var(--color-hostello-purple-glow)",
  "var(--color-hostello-purple-mid)",
  "var(--color-hostello-gold-muted)",
  "var(--color-channel-booking)",
  "var(--color-channel-airbnb)",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

/**
 * Initials avatar. There are no guest or property photos in the schema, so this
 * stands in for them rather than shipping a broken image slot.
 */
export function Avatar({
  name,
  size = 32,
  rounded = "full",
}: {
  name: string | null | undefined;
  size?: number;
  rounded?: "full" | "lg";
}) {
  const label = name?.trim() || "?";
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 font-medium text-white ${
        rounded === "full" ? "rounded-full" : "rounded-lg"
      }`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        backgroundColor: PALETTE[hash % PALETTE.length],
      }}
      aria-hidden
    >
      {initials(label)}
    </span>
  );
}
