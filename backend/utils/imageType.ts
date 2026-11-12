// The real type of an uploaded image from its first bytes ("magic numbers"), or null. The type the
// browser sends is the visitor's claim; this is what the file is. Only the three formats the site
// shows are recognised (no GIF, no SVG — SVG can carry script).
export type ImageType = 'jpeg' | 'png' | 'webp';

const startsWith = (buf: Buffer, sig: number[], at = 0) => sig.every((b, i) => buf[at + i] === b);

export function detectImageType(buf: Buffer): ImageType | null {
  if (buf.length < 12) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  // RIFF <size> WEBP
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
