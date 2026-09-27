/** Stand-in for a property photo until properties have one: a gradient picked
 *  from the unit's name, so the same unit is always the same colour. */
const UNIT_TINTS = [
  "linear-gradient(135deg, #065f46, #34d399)",
  "linear-gradient(135deg, #1e3a8a, #818cf8)",
  "linear-gradient(135deg, #9a3412, #fbbf24)",
  "linear-gradient(135deg, #831843, #f472b6)",
  "linear-gradient(135deg, #134e4a, #22d3ee)",
  "linear-gradient(135deg, #4c1d95, #c084fc)",
];

export function unitTint(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return UNIT_TINTS[hash % UNIT_TINTS.length];
}
