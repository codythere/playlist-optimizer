import { NextResponse } from "next/server";

export interface ApiMeta {
  estimatedQuota?: number;
  cursor?: string | null;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function jsonOk<T>(data: T, init?: { status?: number; meta?: ApiMeta }) {
  const payload: ApiSuccess<T> = {
    ok: true,
    data,
    ...(init?.meta ? { meta: init.meta } : {}),
  };
  return NextResponse.json(payload, { status: init?.status ?? 200 });
}

export function jsonError(
  code: string,
  message: string,
  init?: { status?: number; details?: unknown }
) {
  const payload: ApiError = {
    ok: false,
    error: {
      code,
      message,
      ...(init?.details !== undefined ? { details: init.details } : {}),
    },
  };

  return NextResponse.json(payload, { status: init?.status ?? 400 });
}