/**
 * The room groups a unit's photos are filed under, in the order the gallery
 * shows them. Keep in step with the `room` check on `property_photos`.
 * Safe to import from a browser component.
 */
export const PHOTO_ROOMS = [
  { value: "bedroom", label: "Bedroom" },
  { value: "lounge", label: "Lounge" },
  { value: "kitchen", label: "Kitchen" },
  { value: "dining", label: "Dining" },
  { value: "bathroom", label: "Bathroom" },
  { value: "balcony", label: "Balcony / Outside" },
  { value: "view", label: "View" },
  { value: "pool_garden", label: "Pool / Garden" },
  { value: "building", label: "Building / Entrance" },
  { value: "parking", label: "Parking" },
  { value: "other", label: "Other" },
] as const;

export type PhotoRoom = (typeof PHOTO_ROOMS)[number]["value"];

export function isPhotoRoom(value: string): value is PhotoRoom {
  return PHOTO_ROOMS.some((r) => r.value === value);
}

/** Also enforced by the `property_photos_prepare` trigger. */
export const MAX_PHOTOS_PER_UNIT = 20;

/** One gallery photo, its links already signed for the next hour. */
export type GalleryPhoto = {
  id: string;
  room: PhotoRoom;
  isCover: boolean;
  /** The small copy the screen shows. */
  thumbUrl: string | null;
  /** The full-size file that Save and Share hand over. */
  fullUrl: string | null;
};
