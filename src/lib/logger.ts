/**
 * Structured JSON logger with correlation ID propagation.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('Audit started', { requestId, findingCount: 8 });
 *
 * Output format (JSON):
 *   { "ts":"...", "level":"info", "msg":"Audit started", "requestId":"...", "findingCount":8, "service":"mcs" }
 *
 * Respects LOG_LEVEL env var (default: info).
 * In production (NODE_ENV=production), always outputs JSON.
 * In development, outputs human-readable text unless LOG_FORMAT=json.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3, critical: 4,
};

const MIN_LEVEL = (process.env.LOG_LEVEL as LogLevel) ?? 'info';
const JSON_FORMAT = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';
const SERVICE = 'mcs'; // Maritime Compliance Swarm

export interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  service: string;
  [key: string]: unknown;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatLog(entry: LogEntry): string {
  if (JSON_FORMAT) {
    return JSON.stringify(entry);
  }
  const { ts, level, msg, ...rest } = entry;
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
  const color = level === 'error' || level === 'critical' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[36m';
  return `${ts} ${color}${level.toUpperCase().padEnd(8)}\x1b[0m [${SERVICE}] ${msg}${extra}`;
}

function emit(level: LogLevel, msg: string, meta: Record<string, unknown> = {}): void {
  if (!shouldLog(level)) return;
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    msg,
    service: SERVICE,
    ...meta,
  };
  const line = formatLog(entry);
  if (level === 'error' || level === 'critical') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
  critical: (msg: string, meta?: Record<string, unknown>) => emit('critical', msg, meta),

  /** Create a child logger with pre-bound fields (e.g. requestId) */
  child: (fields: Record<string, unknown>) => ({
    debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, { ...fields, ...meta }),
    info:  (msg: string, meta?: Record<string, unknown>) => emit('info', msg, { ...fields, ...meta }),
    warn:  (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, { ...fields, ...meta }),
    error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, { ...fields, ...meta }),
    critical: (msg: string, meta?: Record<string, unknown>) => emit('critical', msg, { ...fields, ...meta }),
  }),
};
