export interface ParsedError {
  code: string;
  message: string;
}

export function parseYouTubeError(error: unknown): ParsedError {
  if (!error) {
    return { code: "unknown_error", message: "Unknown error" };
  }
  const anyError = error as any;
  const responseError = anyError?.response?.data?.error;
  const firstError = Array.isArray(responseError?.errors) ? responseError.errors[0] : undefined;

  const code = String(
    anyError?.code ??
      responseError?.code ??
      firstError?.reason ??
      firstError?.domain ??
      "unknown_error"
  );
  const message =
    firstError?.message ??
    responseError?.message ??
    anyError?.message ??
    "Unknown error";

  return { code, message };
}