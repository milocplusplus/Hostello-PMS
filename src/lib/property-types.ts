export const PROPERTY_TYPES = [
  { value: "studio", label: "Studio" },
  { value: "1bhk", label: "1 BHK" },
  { value: "2bhk", label: "2 BHK" },
  { value: "3bhk", label: "3 BHK" },
  { value: "2_plus_kids", label: "2+ Kids" },
  { value: "farmhouse", label: "Farmhouse" },
  { value: "penthouse", label: "Penthouse" },
  { value: "villa", label: "Villa" },
  { value: "cottage", label: "Cottage" },
] as const;

export function propertyTypeLabel(value: string | null | undefined) {
  return PROPERTY_TYPES.find((t) => t.value === value)?.label ?? null;
}
