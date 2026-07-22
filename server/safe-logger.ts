import { createHash } from "node:crypto";

type LogLevel = "error" | "info" | "warn";

export type SafeLogContext = {
  paymentIntentHash?: unknown;
  refundHash?: unknown;
  status?: unknown;
};

type SafeErrorMetadata = {
  error_class?: string;
  error_code?: string | number;
  request_id?: string;
  status?: number;
  trace_id?: string;
};

const EVENT_PATTERN = /^[a-z][a-z0-9_]{0,79}$/;
const DIAGNOSTIC_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/;
const ERROR_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const HASH_PATTERN = /^[a-f0-9]{16}$/;
const SENSITIVE_VALUE_PATTERN = /^(?:ch|cs|cus|pi|pk|pm|re|rk|seti|sk|src|sub|tok|whsec)_[A-Za-z0-9_-]+$/i;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Create a correlation-safe, irreversible digest for a high-entropy provider
 * identifier such as a Stripe PaymentIntent or Refund ID.
 *
 * Do not use this helper for low-entropy personal data such as an email address:
 * deterministic hashes of guessable PII are still vulnerable to enumeration.
 */
export function hashProviderIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return createHash("sha256")
    .update("airco-provider-log-id\n", "utf8")
    .update(value.trim(), "utf8")
    .digest("hex")
    .slice(0, 16);
}

export function logError(event: string, error?: unknown, context?: SafeLogContext): void {
  emit("error", event, error, context);
}

export function logWarn(event: string, error?: unknown, context?: SafeLogContext): void {
  emit("warn", event, error, context);
}

export function logInfo(event: string, context?: SafeLogContext): void {
  emit("info", event, undefined, context);
}

function emit(level: LogLevel, event: string, error?: unknown, context?: SafeLogContext): void {
  const safeEvent = EVENT_PATTERN.test(event) ? event : "application_event";
  const record = {
    level,
    event: safeEvent,
    ...safeErrorMetadata(error),
    ...safeContext(context),
  };
  // Emit exactly one serialized object. Never pass the original Error to the
  // console: Azure/Stripe SDK errors can contain URLs, entity RowKeys, tokens,
  // request bodies or other customer/payment identifiers in messages/stacks.
  const serialized = JSON.stringify(record);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.info(serialized);
}

function safeErrorMetadata(error: unknown): SafeErrorMetadata {
  if (!error || (typeof error !== "object" && typeof error !== "function")) {
    return error === undefined ? {} : { error_class: primitiveClass(error) };
  }

  const metadata: SafeErrorMetadata = {};
  const errorClass = safeClassName(error);
  if (errorClass) metadata.error_class = errorClass;

  const code = safeGet(error, "code");
  if (typeof code === "number" && Number.isSafeInteger(code)) metadata.error_code = code;
  else if (typeof code === "string" && safeErrorCode(code)) metadata.error_code = code;

  const status = numericStatus(safeGet(error, "statusCode")) ?? numericStatus(safeGet(error, "status"));
  if (status !== undefined) metadata.status = status;

  const requestId = firstSafeDiagnosticToken(error, ["requestId", "request_id", "clientRequestId"]);
  if (requestId) metadata.request_id = requestId;
  const traceId = firstSafeDiagnosticToken(error, ["traceId", "trace_id"]);
  if (traceId) metadata.trace_id = traceId;
  return metadata;
}

function safeContext(context: SafeLogContext | undefined): Record<string, string | number> {
  if (!context) return {};
  const result: Record<string, string | number> = {};
  const status = context.status;
  if (typeof status === "number" && Number.isSafeInteger(status)) result.context_status = status;
  else if (typeof status === "string" && safeDiagnosticToken(status)) result.context_status = status;
  for (const key of ["paymentIntentHash", "refundHash"] as const) {
    const value = context[key];
    if (typeof value === "string" && HASH_PATTERN.test(value)) result[snakeCase(key)] = value;
  }
  return result;
}

function safeClassName(value: object | Function): string | undefined {
  try {
    const name = Object.getPrototypeOf(value)?.constructor?.name;
    return typeof name === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name)
      ? name
      : undefined;
  } catch {
    return undefined;
  }
}

function safeGet(value: object | Function, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function firstSafeDiagnosticToken(value: object | Function, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = safeGet(value, key);
    if (typeof candidate === "string" && safeDiagnosticToken(candidate)) return candidate;
  }
  return undefined;
}

function safeErrorCode(value: string): boolean {
  return ERROR_CODE_PATTERN.test(value) && !looksSensitive(value);
}

function safeDiagnosticToken(value: string): boolean {
  return DIAGNOSTIC_TOKEN_PATTERN.test(value) && !looksSensitive(value);
}

function looksSensitive(value: string): boolean {
  return SENSITIVE_VALUE_PATTERN.test(value) || JWT_PATTERN.test(value);
}

function numericStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

function primitiveClass(value: unknown): string {
  if (value === null) return "Null";
  const name = typeof value;
  return name.slice(0, 1).toUpperCase() + name.slice(1);
}

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}
