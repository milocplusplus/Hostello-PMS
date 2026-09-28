/**
 * A raw email (RFC 822 / MIME) turned into the few fields the intake needs.
 *
 * The Cloudflare Email Worker passes each message on untouched, so this is
 * where it gets taken apart: headers unfolded and decoded, the multipart tree
 * walked, quoted-printable and base64 undone, each part decoded in its own
 * charset. Deliberately small and dependency-free — it only has to find a
 * subject, the text and HTML bodies and a handful of headers, and it was
 * written against the real Airbnb and Booking.com mails in `fixtures/`.
 *
 * Works on bytes, not a string: a message's parts can be in different
 * charsets, and a body may be 8-bit, so the whole message is read as Latin-1
 * (one byte, one character, nothing lost) and each part is decoded properly
 * once its own charset is known.
 */

export type MimeMail = {
  messageId: string;
  from: string;
  /** The first address the message was sent to — the channel account's own. */
  to: string;
  subject: string;
  date: string;
  /** Airbnb's `X-Template`, which names the kind of mail. */
  template: string;
  text: string;
  html: string;
};

function latin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return s;
}

function bytesOf(latin: string): Uint8Array {
  const out = new Uint8Array(latin.length);
  for (let i = 0; i < latin.length; i++) out[i] = latin.charCodeAt(i) & 0xff;
  return out;
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function qpBytes(s: string): Uint8Array {
  const clean = s.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const hex = clean.slice(i + 1, i + 3);
    if (clean[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      out.push(parseInt(hex, 16));
      i += 2;
    } else {
      out.push(clean.charCodeAt(i) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function base64Bytes(s: string): Uint8Array {
  try {
    return bytesOf(atob(s.replace(/[^A-Za-z0-9+/=]/g, "")));
  } catch {
    return new Uint8Array();
  }
}

/** `=?utf-8?B?…?=` and `=?utf-8?Q?…?=` in a header, adjacent words joined. */
function decodeWords(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset: string, enc: string, text: string) =>
      decodeBytes(
        enc.toUpperCase() === "B" ? base64Bytes(text) : qpBytes(text.replace(/_/g, " ")),
        charset
      )
    );
}

/** Header block → lower-cased name → raw (still latin-1) value, folded lines joined. */
function headers(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of block.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const name = line.slice(0, i).trim().toLowerCase();
    if (!map.has(name)) map.set(name, line.slice(i + 1).trim());
  }
  return map;
}

function header(map: Map<string, string>, name: string): string {
  const raw = map.get(name) ?? "";
  // A header written raw in UTF-8 arrives here as latin-1 bytes; re-read it.
  return decodeWords(decodeBytes(bytesOf(raw), "utf-8")).trim();
}

function param(value: string, name: string): string {
  return value.match(new RegExp(`${name}\\s*=\\s*"?([^";]+)"?`, "i"))?.[1]?.trim() ?? "";
}

function split(raw: string): { head: string; body: string } {
  const m = raw.match(/\r?\n\r?\n/);
  if (!m || m.index === undefined) return { head: raw, body: "" };
  return { head: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) };
}

function walk(head: string, body: string, out: { text: string; html: string }, depth = 0) {
  if (depth > 8) return;
  const h = headers(head);
  const type = h.get("content-type") ?? "text/plain";
  const boundary = param(type, "boundary");

  if (/^multipart\//i.test(type) && boundary) {
    for (const chunk of body.split("--" + boundary).slice(1)) {
      if (chunk.startsWith("--")) break;
      const part = split(chunk.replace(/^\r?\n/, ""));
      walk(part.head, part.body, out, depth + 1);
    }
    return;
  }

  const mime = type.split(";")[0].trim().toLowerCase();
  if (mime !== "text/plain" && mime !== "text/html") return;
  if (/attachment/i.test(h.get("content-disposition") ?? "")) return;

  const encoding = (h.get("content-transfer-encoding") ?? "").toLowerCase();
  const bytes =
    encoding.includes("quoted-printable") ? qpBytes(body)
    : encoding.includes("base64") ? base64Bytes(body)
    : bytesOf(body);
  const decoded = decodeBytes(bytes, param(type, "charset") || "utf-8");

  // The first of each wins; later ones are usually quoted replies.
  if (mime === "text/html" && !out.html) out.html = decoded;
  if (mime === "text/plain" && !out.text) out.text = decoded;
}

/** The address inside `Name <addr>`, or the whole value when there is no `<>`. */
function address(value: string): string {
  return (value.match(/<([^>]+)>/)?.[1] ?? value.split(",")[0]).trim();
}

export function parseMime(raw: Uint8Array | string): MimeMail {
  const text = typeof raw === "string" ? raw : latin1(raw);
  const { head, body } = split(text);
  const h = headers(head);
  const out = { text: "", html: "" };
  walk(head, body, out);

  return {
    messageId: header(h, "message-id").replace(/^<|>$/g, ""),
    from: address(header(h, "from")),
    to: address(header(h, "to")),
    subject: header(h, "subject"),
    date: header(h, "date"),
    template: header(h, "x-template"),
    text: out.text,
    html: out.html,
  };
}
