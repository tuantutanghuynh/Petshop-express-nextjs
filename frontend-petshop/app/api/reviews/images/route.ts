import { proxy } from '../../../../lib/bff/session';
import { REVIEW_IMAGE_TYPES, REVIEW_LIMITS } from '../../../../lib/reviews';
import { badRequest, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

// One review photo, relayed as multipart. Only the image part is passed on; size and declared type
// are checked here so an obviously wrong file never travels further. The backend checks the bytes.
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return badRequest();
  }
  const file = incoming.get('image');
  if (!(file instanceof File)) return badRequest();
  if (!(REVIEW_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return toResponse({ status: 422, body: { data: null, meta: null, error: { code: 'INVALID_FILE_TYPE', message: 'Chỉ nhận ảnh JPG, PNG hoặc WebP', details: null } } });
  }
  if (file.size > REVIEW_LIMITS.imageBytes) {
    return toResponse({ status: 413, body: { data: null, meta: null, error: { code: 'FILE_TOO_LARGE', message: 'Ảnh quá lớn, tối đa 5MB', details: null } } });
  }
  const form = new FormData();
  form.append('image', file, file.name || 'review.jpg');
  return toResponse(await proxy(await sessionJar(), { path: '/reviews/images', method: 'POST', body: form }, await requestContext()));
}
