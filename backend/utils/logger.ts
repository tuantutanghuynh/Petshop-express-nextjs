import pino, { type DestinationStream, type Logger } from 'pino';
import { isDevelopment, logLevel } from '../config/env';

// The one logger of the backend (CLAUDE.md §6): levels, JSON lines in production, readable lines in
// development. Credentials never reach a log line: these headers are replaced even if some code
// logs a whole request by mistake (the request serializer already leaves headers out).
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-internal-secret"]',
  'res.headers["set-cookie"]',
];

// `destination` is for tests (an in-memory stream). Without it, development pretty-prints to the
// terminal and every other environment writes JSON to stdout for the hosting platform to collect.
export function createLogger(destination?: DestinationStream): Logger {
  const options = {
    level: logLevel,
    redact: { paths: REDACT, censor: '[Redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  if (!destination && isDevelopment) {
    return pino({ ...options, transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } } });
  }
  // Level as its name ("warn"), not pino's number, so JSON lines read without a lookup table.
  return pino({ ...options, formatters: { level: (label: string) => ({ level: label }) } }, destination);
}

export const logger = createLogger();

export default logger;
