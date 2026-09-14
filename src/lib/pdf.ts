/**
 * The smallest PDF that can carry a drawn page, and nothing more.
 *
 * A canvas produces an image, not a document — `toBlob` gives a PNG. This wraps
 * one JPEG per page in the minimum PDF structure a reader needs: a catalog, a
 * pages tree, and for each page a content stream that paints a single full-bleed
 * image XObject. JPEG bytes go in verbatim under `/DCTDecode`, which is why no
 * encoder is needed here — the browser already made one.
 *
 * It exists instead of a dependency because this is the whole of what the
 * statement needs. It is **not** a general PDF writer: there is no text object,
 * no font, no vector path. A consequence the caller has to accept is that the
 * words in the output are pixels — nothing in the file is selectable, and
 * nothing is searchable.
 *
 * The one part that must be exact is the cross-reference table: every offset is
 * counted in bytes from the start of the file, so the assembly below tracks
 * lengths as it goes rather than building a string and measuring it at the end.
 */

export type PdfPage = {
  /** JPEG bytes, straight from `canvas.toBlob("image/jpeg")`. */
  jpeg: Uint8Array;
  width: number;
  height: number;
};

const enc = new TextEncoder();

/** PDF wants `A4`-ish points; the image is scaled to fill whatever we declare. */
function pagePoints(px: { width: number; height: number }) {
  // 72pt per inch. The canvases are drawn at 150 DPI, so the page in points is
  // the pixel size scaled down by 150/72 — that is what makes an A4-shaped
  // canvas print as an actual A4 page rather than a giant one.
  const scale = 72 / 150;
  return { w: +(px.width * scale).toFixed(2), h: +(px.height * scale).toFixed(2) };
}

export function pagesToPdfBlob(pages: PdfPage[]): Blob {
  if (pages.length === 0) throw new Error("A PDF needs at least one page.");

  const chunks: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [];

  const push = (bytes: Uint8Array | string) => {
    const b = typeof bytes === "string" ? enc.encode(bytes) : bytes;
    chunks.push(b);
    length += b.length;
  };

  /** Records where this object starts before writing it — that is the xref. */
  const obj = (id: number, body: string) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\nendobj\n`);
  };

  push("%PDF-1.4\n");
  // A comment of high bytes marks the file binary, so a transport that might
  // "helpfully" convert line endings leaves it alone.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // 1 = catalog, 2 = pages tree, then 3 objects per page.
  const pageIds = pages.map((_, i) => 3 + i * 3);
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`
  );

  pages.forEach((page, i) => {
    const pageId = 3 + i * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const { w, h } = pagePoints(page);

    obj(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );

    // `cm` scales the unit square to the page, then `Do` paints the image into
    // it. q/Q keep the transform from leaking into anything after it.
    const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
    obj(contentId, `<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`);

    offsets[imageId] = length;
    push(
      `${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} ` +
        `/Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
        `/Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`
    );
    push(page.jpeg);
    push("\nendstream\nendobj\n");
  });

  const count = 3 + pages.length * 3;
  const xrefAt = length;
  // Entry 0 is the head of the free list and is fixed by the spec. Every other
  // line is exactly 20 bytes: a 10-digit offset, a 5-digit generation, a flag.
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) {
    xref += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

/** `canvas.toBlob` as a promise, already JPEG-encoded at a sane quality. */
export async function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Uint8Array> {
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("The browser could not encode the page.");
  return new Uint8Array(await blob.arrayBuffer());
}
