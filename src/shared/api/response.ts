import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
  headers?: HeadersInit,
) {
  const errorHeaders = new Headers(headers);
  errorHeaders.set("Cache-Control", "no-store");
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details,
      },
    },
    { status, headers: errorHeaders },
  );
}
