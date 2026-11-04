// Set once SIGTERM / SIGINT arrives (bin/www.ts). /health/ready reads it to tell the platform to
// stop sending traffic while in-flight requests finish. Kept apart from bin/www.ts so app.ts can
// read it without importing the entry point that starts the server.
let shuttingDown = false;

export function markShuttingDown(): void {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
