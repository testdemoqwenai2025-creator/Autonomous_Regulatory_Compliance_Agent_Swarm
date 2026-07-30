/**
 * Shared Zod validation schemas for API request bodies.
 * Each route imports the schema it needs and validates in a single line.
 *
 * Usage:
 *   import { loginSchema } from '@/lib/validation';
 *   const body = loginSchema.parse(await request.json());
 */

import { z } from 'zod';

// ── Auth ──
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  role: z.enum(['viewer', 'analyst', 'operator', 'admin']).optional(),
});

// ── Compliance Findings ──
export const findingCreateSchema = z.object({
  findingRef: z.string().min(1).max(100),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum(['open', 'in_progress', 'remediated', 'accepted_risk', 'closed']),
  riskCategory: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  affectedSystem: z.string().max(100).optional(),
  affectedTable: z.string().max(100).optional(),
  affectedRowCount: z.number().int().nonnegative().optional(),
});

// ── Remediation ──
export const remediateSchema = z.object({
  findingRef: z.string().min(1, 'Finding reference is required'),
  action: z.enum(['dry_run', 'apply']),
  note: z.string().max(2000).optional(),
});

// ── Anonymisation ──
export const anonymiseSchema = z.object({
  targetTable: z.string().min(1, 'Target table is required'),
  fields: z.array(z.string()).min(1, 'At least one field is required'),
  dryRun: z.boolean().default(true),
  retentionDays: z.number().int().positive().optional(),
});

// ── EDI Profiles ──
export const profileCreateSchema = z.object({
  partnerName: z.string().min(1).max(200),
  ediStandard: z.enum(['EDIFACT', 'ANSI_X12', 'XML']),
  connectionType: z.enum(['SFTP', 'AS2', 'FTPS', 'API']),
  endpoint: z.string().url('Invalid endpoint URL').optional(),
  enabled: z.boolean().default(true),
});

// ── Policies ──
export const policyCreateSchema = z.object({
  name: z.string().min(1).max(200),
  dataType: z.enum(['PII', 'PHI', 'financial', 'operational']),
  maskingRule: z.enum(['redact', 'hash', 'tokenize', 'truncate', 'generalize']),
  fields: z.array(z.string()).min(1),
  enabled: z.boolean().default(true),
});

// ── Ep-Trace (observability) ──
export const epTraceSchema = z.object({
  traceId: z.string().min(1).max(100),
  initiatedBy: z.enum(['manual', 'auto_page_load', 'auto_interval']).default('manual'),
  spans: z.array(z.object({
    endpoint: z.string(),
    method: z.string(),
    statusCode: z.number().int(),
    clientDnsMs: z.number().optional(),
    clientTcpMs: z.number().optional(),
    clientSslMs: z.number().optional(),
    clientTtfbMs: z.number().optional(),
    clientResponseMs: z.number().optional(),
    clientRoundTripMs: z.number().optional(),
    clientJsonParseMs: z.number().optional(),
    clientTransferSize: z.number().optional(),
    clientEncodedSize: z.number().optional(),
    clientDecodedSize: z.number().optional(),
    clientProtocol: z.string().optional(),
    serverMiddlewareMs: z.number().optional(),
    serverHandlerMs: z.number().optional(),
    serverDbWriteMs: z.number().optional(),
    serverDbReadMs: z.number().optional(),
    error: z.string().optional(),
  })).default([]),
  browserMetrics: z.object({
    ttfbAvgMs: z.number().optional(),
    roundTripAvgMs: z.number().optional(),
    longTaskCount: z.number().optional(),
    longTaskTotalMs: z.number().optional(),
    memoryUsedMb: z.number().optional(),
    memoryLimitMb: z.number().optional(),
    domNodes: z.number().optional(),
    resourceCount: z.number().optional(),
  }).optional(),
  navigationType: z.string().optional(),
  connectionType: z.string().optional(),
  pageUrl: z.string().optional(),
});

// ── Auth Observability ──
export const authTraceSchema = z.object({
  frontendLoginMs: z.number().nonnegative().optional(),
  frontendTokenStorageMs: z.number().nonnegative().optional(),
  frontendAuthHeaderInjectMs: z.number().nonnegative().optional(),
  frontendTotalAuthFlowMs: z.number().nonnegative().optional(),
  loginMethod: z.string().optional(),
  loginSuccess: z.boolean().optional(),
  loginError: z.string().optional(),
});

// ── Utility: validate and return parsed body or throw 400 ──
export function parseAndValidate<T>(schema: z.ZodSchema<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstError = result.error.issues[0];
    throw new ValidationError(
      `Validation failed: ${firstError.message}`,
      400,
      result.error.issues.map(e => ({ field: e.path.join('.'), message: e.message })),
    );
  }
  return result.data;
}

export class ValidationError extends Error {
  statusCode: number;
  details: Array<{ field: string; message: string }>;
  constructor(message: string, statusCode: number = 400, details?: Array<{ field: string; message: string }>) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ValidationError';
    this.details = details ?? [];
  }
}
