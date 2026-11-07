import { purgePending } from '../services/newsletter.service';
import { logger } from '../utils/logger';

// Deletes newsletter signups nobody confirmed within 7 days (spec 2026-11-07): an address is not
// kept for someone who never agreed. Hourly is plenty — the limit is in days. Same shape as
// startExpiredOrderSweeper: errors are logged, never thrown out of the timer (that would kill the
// process), and unref() lets scripts exit.
const PURGE_INTERVAL_MINUTES = 60;

export function startPendingSubscriberPurge(): NodeJS.Timeout {
  const run = () => {
    purgePending()
      .then((n) => {
        if (n > 0) logger.info({ purged: n }, `[newsletter] Đã xoá ${n} đăng ký chưa xác nhận`);
      })
      .catch((err: Error) => logger.error({ err }, '[newsletter] Lỗi khi xoá đăng ký chưa xác nhận'));
  };
  run();
  const timer = setInterval(run, PURGE_INTERVAL_MINUTES * 60 * 1000);
  timer.unref();
  return timer;
}

export default { startPendingSubscriberPurge };
