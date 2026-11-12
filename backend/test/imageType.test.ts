import { describe, expect, it } from 'vitest';
import { detectImageType } from '../utils/imageType';

// Customer photos are checked by their first bytes, not by the type the browser claims: a text or
// HTML file renamed .jpg must not reach Cloudinary.
const bytes = (...b: number[]) => Buffer.from([...b, 0, 0, 0, 0, 0, 0, 0, 0]);

describe('detectImageType', () => {
  it('recognises JPEG, PNG and WebP', () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    expect(detectImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]))).toBe('webp');
  });
  it.each([
    ['text', Buffer.from('hello world, not an image')],
    ['HTML', Buffer.from('<html><script>alert(1)</script></html>')],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['GIF', Buffer.from('GIF89a........')],
    ['a RIFF that is not WebP (WAV)', Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WAVEfmt ')])],
    ['too short', Buffer.from([0xff, 0xd8])],
  ])('refuses %s', (_name, buf) => {
    expect(detectImageType(buf)).toBeNull();
  });
});
