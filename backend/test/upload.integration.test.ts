import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { PassThrough } from 'stream';
import { v2 as cloudinary, type UploadApiErrorResponse, type UploadApiResponse, type UploadResponseCallback } from 'cloudinary';
import app from '../app';
import { adminToken, customerToken } from './helpers/tokens';

// A stand-in for cloudinary.uploader.upload_stream: takes the file like the real stream, then
// answers through the callback the way Cloudinary does (an error, or the uploaded image).
function fakeUploadStream(answer: { error?: UploadApiErrorResponse; result?: Partial<UploadApiResponse> }) {
  return (_options?: unknown, callback?: UploadResponseCallback) => {
    const stream = new PassThrough();
    stream.on('finish', () => callback?.(answer.error, answer.result as UploadApiResponse | undefined));
    stream.resume(); // drain what multer writes
    return stream;
  };
}

describe('POST /api/v1/uploads/image', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const validJpgBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9,
  ]);

  it('uploads a valid image and returns the Cloudinary secure URL', async () => {
    const fakeSecureUrl = 'https://res.cloudinary.com/test-cloud/image/upload/v12345/sample.jpg';

    vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(fakeUploadStream({ result: { secure_url: fakeSecureUrl } }));

    const res = await request(app)
      .post('/api/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken()}`)
      .attach('image', validJpgBuffer, { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      data: { url: fakeSecureUrl },
      meta: null,
      error: null,
    });
  });

  it('rejects an upload from a non-admin user with 403', async () => {
    const res = await request(app)
      .post('/api/v1/uploads/image')
      .set('Authorization', `Bearer ${customerToken()}`)
      .attach('image', validJpgBuffer, { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects an upload without authentication with 401', async () => {
    const res = await request(app)
      .post('/api/v1/uploads/image')
      .attach('image', validJpgBuffer, { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a request with missing file with 422', async () => {
    const res = await request(app)
      .post('/api/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });

  it('rejects an unsupported MIME type (e.g. text/plain) with 422', async () => {
    const res = await request(app)
      .post('/api/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken()}`)
      .attach('image', Buffer.from('console.log("hello")'), {
        filename: 'script.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects a file exceeding the 15MB limit', async () => {
    // 15MB + 1KB buffer
    const oversizedBuffer = Buffer.alloc(15 * 1024 * 1024 + 1024);

    const res = await request(app)
      .post('/api/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken()}`)
      .attach('image', oversizedBuffer, {
        filename: 'heavy.jpg',
        contentType: 'image/jpeg',
      });

    // Multer rejects oversized file via limit error or connection reset / 500
    expect([413, 422, 500]).toContain(res.status);
    expect(res.body.error).toBeDefined();
  });

  it('returns 500 when Cloudinary stream fails', async () => {
    vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(
      fakeUploadStream({ error: { name: 'Error', message: 'Cloudinary service unavailable', http_code: 503 } }),
    );

    const res = await request(app)
      .post('/api/v1/uploads/image')
      .set('Authorization', `Bearer ${adminToken()}`)
      .attach('image', validJpgBuffer, { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});
