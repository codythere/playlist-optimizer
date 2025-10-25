export interface ParsedError {
  code: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parseYouTubeError(error: unknown): ParsedError {
  if (!error) {
    return { code: "unknown_error", message: "Unknown error" };
  }

  const errorRecord = isRecord(error) ? error : {};
  const responseRecord = isRecord(errorRecord.response) ? (errorRecord.response as Record<string, unknown>) : undefined;
  const dataRecord = responseRecord && isRecord(responseRecord.data) ? (responseRecord.data as Record<string, unknown>) : undefined;
  const apiError = dataRecord && isRecord(dataRecord.error) ? (dataRecord.error as Record<string, unknown>) : undefined;
  const firstErrorEntry = Array.isArray(apiError?.errors) ? apiError?.errors[0] : undefined;
  const firstError = isRecord(firstErrorEntry) ? (firstErrorEntry as Record<string, unknown>) : undefined;

  const code =
    asString(errorRecord.code) ??
    asString(apiError?.code) ??
    asString(firstError?.reason) ??
    asString(firstError?.domain) ??
    "unknown_error";

  const message =
    asString(firstError?.message) ??
    asString(apiError?.message) ??
    asString((errorRecord as { message?: unknown }).message) ??
    "Unknown error";

  return { code, message };
}

export class GoogleApiError extends Error {
  constructor(public readonly errorCode: string, message: string) {
    super(message);
    this.name = "GoogleApiError";
  }
}
