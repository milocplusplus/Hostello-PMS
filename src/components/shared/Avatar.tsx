/** Each entry is a two-stop gradient — a flat fill reads as a placeholder,
 *  a gradient reads as a designed avatar. */
const PALETTE = [
  ["#8b5cf6", "#5b21b6"],
  ["#6c4ab6", "#3b1e6e"],
  ["#c9a44c", "#8a7238"],
  ["#3b82f6", "#1d4ed8"],
  ["#ff5a8a", "#c11d55"],
  ["#34d399", "#0f766e"],
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
  const [from, to] = PALETTE[hash % PALETTE.length];
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 font-semibold text-white ${
        rounded === "full" ? "rounded-full" : "rounded-lg"
      }`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
        boxShadow: `0 1px 0 rgba(255,255,255,0.25) inset, 0 0 0 1px rgba(255,255,255,0.06)`,
      }}
      aria-hidden
    >
      {initials(label)}
    </span>
  );
}
