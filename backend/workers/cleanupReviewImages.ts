import { isProduction } from '../config/env';
import { cleanupReviewImages, isCloudinaryConfigured } from '../services/reviewImageCleanup.service';
import { logger } from '../utils/logger';

// Deletes review photos nobody uses, once a day (ADR-028).
//
// Production only. Development points at its own database but usually at the same Cloudinary
// account and folder: there, every photo uploaded on the live site would look unused (it is not in
// the dev database) and would be deleted. Same shape as the other workers: errors are logged, never
// thrown out of the timer, and unref() lets scripts exit.
const CLEANUP_INTERVAL_HOURS = 24;

export function startReviewImageCleanup(): NodeJS.Timeout | null {
  if (!isProduction || !isCloudinaryConfigured()) return null;
  const run = () => {
    cleanupReviewImages()
      .then((r) => logger.info(r, `[reviews] Dọn ảnh đánh giá: quét ${r.scanned}, xoá ${r.deleted}`))
      .catch((err: Error) => logger.error({ errorName: err.name, message: err.message }, '[reviews] Lỗi khi dọn ảnh đánh giá'));
  };
  run();
  const timer = setInterval(run, CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000);
  timer.unref();
  return timer;
}

export default { startReviewImageCleanup };
