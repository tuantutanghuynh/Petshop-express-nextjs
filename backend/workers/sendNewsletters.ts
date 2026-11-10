import { SEND_TICK_SECONDS } from '../constants/newsletter';
import { runNewsletterTick } from '../services/newsletterSend.service';
import { logger } from '../utils/logger';

// Sends scheduled newsletter campaigns (spec 2026-11-10, ADR-025), once a minute. On Render Free the
// process sleeps when idle; an external pinger keeps it awake, and anything overdue goes out on the
// first tick after waking. Same shape as the other workers: errors are logged, never thrown out of
// the timer (that would kill the process), and unref() lets scripts exit.
//
// A slow SMTP server can make one tick outlast the interval; the next one is skipped rather than run
// alongside it. Overlap would still be safe (every claim is conditional), only wasteful.
export function startNewsletterSender(): NodeJS.Timeout {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    runNewsletterTick()
      .then((r) => {
        if (r.claimed || r.sent || r.failed || r.finished) logger.info(r, `[newsletter] Bản tin: bắt đầu ${r.claimed}, đã gửi ${r.sent}, lỗi ${r.failed}, xong ${r.finished}`);
      })
      .catch((err: Error) => logger.error({ err }, '[newsletter] Lỗi khi gửi bản tin'))
      .finally(() => {
        running = false;
      });
  };
  run();
  const timer = setInterval(run, SEND_TICK_SECONDS * 1000);
  timer.unref();
  return timer;
}

export default { startNewsletterSender };
