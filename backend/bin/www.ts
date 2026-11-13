#!/usr/bin/env node
import app from '../app';
import { assertProductionConfig, port } from '../config/env';
import prisma from '../services/prisma';
import { isShuttingDown, markShuttingDown } from '../utils/lifecycle';
import { logger } from '../utils/logger';
import { startExpiredOrderSweeper } from '../workers/releaseExpiredOrders';
import { startPendingSubscriberPurge } from '../workers/purgePendingSubscribers';
import { startNewsletterSender } from '../workers/sendNewsletters';
import { startReviewImageCleanup } from '../workers/cleanupReviewImages';

// Longest a deploy waits for in-flight requests before the process is cut anyway.
const SHUTDOWN_GRACE_MS = 15_000;

// Refuse to start in production without what password reset emails need (names the missing variables).
assertProductionConfig();

const server = app.listen(port, () => {
  logger.info({ port }, `Server đang chạy tại http://localhost:${port}`);
});

// Runs inside the web process rather than as a separate service. That is enough while there is
// one instance, and the job claims each order with a conditional UPDATE so it stays correct if a
// second instance ever appears. It should move to a real scheduler once the deployment grows.
const sweeper = startExpiredOrderSweeper();
const newsletterPurge = startPendingSubscriberPurge();
const newsletterSender = startNewsletterSender();
const reviewImageCleanup = startReviewImageCleanup(); // production only (see the worker)

// SIGTERM (platform stopping the instance on deploy) or SIGINT (Ctrl+C): /health/ready turns 503,
// the sweeper stops, no new connections are accepted and the requests already running finish
// (server.close also closes idle keep-alive sockets, Node ≥ 19), then the database pool is
// released. A transaction cut by the grace timeout is rolled back by Postgres, never half-written.
function shutdown(signal: string): void {
  if (isShuttingDown()) return;
  markShuttingDown();
  logger.info({ signal }, `${signal}: stopping — finishing in-flight requests`);
  clearInterval(sweeper);
  clearInterval(newsletterPurge);
  clearInterval(newsletterSender);
  if (reviewImageCleanup) clearInterval(reviewImageCleanup);
  server.close((err) => {
    if (err) logger.error({ err }, 'Closing the HTTP server failed');
    prisma.$disconnect().finally(() => process.exit(err ? 1 : 0));
  });
  setTimeout(() => {
    logger.error(`Requests still running after ${SHUTDOWN_GRACE_MS / 1000} s — exiting`);
    process.exit(1);
  }, SHUTDOWN_GRACE_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
