import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isGoogleConfigured } from "@/lib/google";

export async function GET() {
  const session = getSession();
  return NextResponse.json({
    authenticated: Boolean(session),
    userId: session?.userId ?? null,
    usingMock: !isGoogleConfigured(),
  });
}
