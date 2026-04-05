/**
 * MIME builder for Gmail outbound messages.
 *
 * Produces a base64url-encoded RFC 2822 / MIME string ready for the
 * Gmail API `messages.send` or `messages.insert` endpoint.
 */

export interface AttachmentInput {
  filename: string;
  mimeType: string;
  content: Buffer;
}

export interface MimeParams {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml?: string | null;
  bodyText: string;
  inReplyTo?: string | null;
  references?: string | null;
  attachments?: AttachmentInput[];
}

/** RFC 2822 date string */
function rfc2822Date(): string {
  return new Date().toUTCString();
}

/** Encode a header value with non-ASCII characters as RFC 2047 UTF-8 Q-encoding */
function encodeHeader(value: string): string {
  // If purely ASCII, return as-is
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  // Use base64 word encoding for non-ASCII
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generate a MIME boundary string guaranteed not to appear in the content.
 * We use a fixed prefix plus a random hex suffix.
 */
function makeBoundary(): string {
  const hex = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  return `----=_Part_${hex}`;
}

/**
 * Build a simple (no attachments) text/html or text/plain message.
 */
function buildSimpleMime(params: MimeParams): Buffer {
  const lines: string[] = [
    `From: ${params.from}`,
    `To: ${params.to.join(", ")}`,
  ];
  if (params.cc?.length) lines.push(`Cc: ${params.cc.join(", ")}`);
  if (params.bcc?.length) lines.push(`Bcc: ${params.bcc.join(", ")}`);
  lines.push(`Subject: ${encodeHeader(params.subject)}`);
  lines.push(`Date: ${rfc2822Date()}`);
  lines.push(`MIME-Version: 1.0`);
  if (params.inReplyTo) lines.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) lines.push(`References: ${params.references}`);

  const body = params.bodyHtml ?? params.bodyText;
  const contentType = params.bodyHtml
    ? "text/html; charset=UTF-8"
    : "text/plain; charset=UTF-8";
  lines.push(`Content-Type: ${contentType}`);
  lines.push(`Content-Transfer-Encoding: quoted-printable`);
  lines.push(``);
  lines.push(quotedPrintableEncode(body));

  return Buffer.from(lines.join("\r\n"), "utf8");
}

/**
 * Build a multipart/mixed message with a text/html body part followed by
 * one attachment part per file.
 */
function buildMultipartMimeBuffer(params: MimeParams, attachments: AttachmentInput[]): Buffer {
  const boundary = makeBoundary();

  const headers: string[] = [
    `From: ${params.from}`,
    `To: ${params.to.join(", ")}`,
  ];
  if (params.cc?.length) headers.push(`Cc: ${params.cc.join(", ")}`);
  if (params.bcc?.length) headers.push(`Bcc: ${params.bcc.join(", ")}`);
  headers.push(`Subject: ${encodeHeader(params.subject)}`);
  headers.push(`Date: ${rfc2822Date()}`);
  headers.push(`MIME-Version: 1.0`);
  if (params.inReplyTo) headers.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) headers.push(`References: ${params.references}`);
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [];

  // Body part — prefer HTML
  const bodyContent = params.bodyHtml ?? params.bodyText;
  const bodyContentType = params.bodyHtml
    ? "text/html; charset=UTF-8"
    : "text/plain; charset=UTF-8";
  parts.push(
    [
      `--${boundary}`,
      `Content-Type: ${bodyContentType}`,
      `Content-Transfer-Encoding: quoted-printable`,
      ``,
      quotedPrintableEncode(bodyContent),
    ].join("\r\n"),
  );

  // Attachment parts
  for (const att of attachments) {
    const encoded = att.content.toString("base64");
    // Split base64 into 76-char lines (RFC 2045)
    const chunked = encoded.match(/.{1,76}/g)?.join("\r\n") ?? encoded;
    const encodedFilename = encodeHeader(att.filename);
    parts.push(
      [
        `--${boundary}`,
        `Content-Type: ${att.mimeType}; name="${encodedFilename}"`,
        `Content-Transfer-Encoding: base64`,
        `Content-Disposition: attachment; filename="${encodedFilename}"`,
        ``,
        chunked,
      ].join("\r\n"),
    );
  }

  const body =
    headers.join("\r\n") +
    "\r\n\r\n" +
    parts.join("\r\n") +
    `\r\n--${boundary}--\r\n`;

  return Buffer.from(body, "utf8");
}

/**
 * Build a Gmail-ready base64url-encoded MIME message.
 *
 * When no attachments are provided (or the array is empty) a simple
 * single-part message is produced. When attachments are present a
 * multipart/mixed message is produced.
 */
export function buildMultipartMime(params: MimeParams): string {
  const attachments = params.attachments ?? [];
  const buf =
    attachments.length === 0
      ? buildSimpleMime(params)
      : buildMultipartMimeBuffer(params, attachments);
  return base64UrlEncode(buf);
}

/**
 * Minimal quoted-printable encoder.
 * Encodes characters outside printable ASCII range (and `=`) as `=XX`.
 * Lines are soft-wrapped at 76 characters per RFC 2045.
 */
function quotedPrintableEncode(input: string): string {
  // Encode character-by-character
  let encoded = "";
  for (const char of input) {
    const code = char.charCodeAt(0);
    if (char === "=") {
      encoded += "=3D";
    } else if ((code >= 33 && code <= 126) || char === " " || char === "\t") {
      encoded += char;
    } else if (char === "\r" || char === "\n") {
      encoded += char;
    } else {
      // Multi-byte UTF-8: encode each byte
      const bytes = Buffer.from(char, "utf8");
      for (const byte of bytes) {
        encoded += `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }

  // Soft-wrap at 76 chars (not breaking CRLF sequences)
  const lines = encoded.split(/\r\n|\r|\n/);
  const wrapped = lines.map((line) => {
    if (line.length <= 76) return line;
    const chunks: string[] = [];
    let remaining = line;
    while (remaining.length > 76) {
      // Find safe split point (must not split a =XX sequence)
      let splitAt = 75; // leave room for "="
      // Step back if we'd split mid-=XX
      while (splitAt > 0 && remaining[splitAt] === "=" ) splitAt--;
      while (splitAt > 0 && remaining[splitAt - 1] === "=") splitAt--;
      // Also avoid splitting a =XX escape that starts within the last 2 chars
      if (splitAt > 73 && remaining[splitAt - 2] === "=") splitAt -= 2;
      else if (splitAt > 74 && remaining[splitAt - 1] === "=") splitAt -= 1;
      chunks.push(remaining.slice(0, splitAt) + "=");
      remaining = remaining.slice(splitAt);
    }
    chunks.push(remaining);
    return chunks.join("\r\n");
  });

  return wrapped.join("\r\n");
}
