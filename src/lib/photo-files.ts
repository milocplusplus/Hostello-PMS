/**
 * Browser-only helpers for the photo gallery: shrinking a picked photo before
 * it is uploaded, and getting saved photos out of the app again.
 */

// "Large": above what Airbnb and Booking.com ask for, about 2 MB.
const FULL_EDGE = 4000;
const FULL_MAX_BYTES = 3 * 1024 * 1024;
// The screen copy: what the grid, the viewer and the cover show.
const THUMB_EDGE = 1000;
const THUMB_MAX_BYTES = 400 * 1024;

function load(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("not an image"));
    };
    img.src = url;
  });
}

async function toJpeg(img: HTMLImageElement, maxEdge: number, maxBytes: number, name: string): Promise<File> {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  // A transparent PNG would otherwise come out black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Step the quality down until it fits; a very detailed photo needs it.
  for (let quality = 0.9; quality >= 0.5; quality -= 0.1) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= maxBytes) return new File([blob], name, { type: "image/jpeg" });
  }
  throw new Error("too large");
}

/**
 * The two files a gallery photo is stored as. Redrawing through a canvas also
 * turns any format into JPG and drops the camera's metadata — a photo sent to
 * a guest should not carry the GPS position it was taken at.
 */
export async function preparePhoto(file: Blob): Promise<{ full: File; thumb: File }> {
  const img = await load(file);
  return {
    full: await toJpeg(img, FULL_EDGE, FULL_MAX_BYTES, "full.jpg"),
    thumb: await toJpeg(img, THUMB_EDGE, THUMB_MAX_BYTES, "thumb.jpg"),
  };
}

/** Downloads signed links into named files, ready to save or share. */
export async function fetchPhotoFiles(items: { url: string; name: string }[]): Promise<File[]> {
  return Promise.all(
    items.map(async ({ url, name }) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("link expired");
      return new File([await res.blob()], name, { type: "image/jpeg" });
    })
  );
}

/** The phone's share sheet takes photos (WhatsApp, and "Save Image" on an iPhone). */
export function canSharePhotos(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  return navigator.canShare({ files: [new File([""], "a.jpg", { type: "image/jpeg" })] });
}

/** An iPhone only puts a picture in Photos through the share sheet; a download lands in Files. */
export function savesThroughShareSheet(): boolean {
  if (typeof navigator === "undefined") return false;
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
  return apple && canSharePhotos();
}

/** One browser download per file. On Android these land in the gallery's Download album. */
export async function downloadFiles(files: File[]) {
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    // Browsers drop downloads fired in the same instant.
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** "Cedar Lodge, Upper" → "cedar-lodge-upper". */
export function fileSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unit";
}
