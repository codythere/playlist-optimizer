// app/api/video-ops/route.ts
import { NextResponse } from "next/server";
import { getGlobalVideoOps } from "@/lib/video-ops";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const total = await getGlobalVideoOps();
    return NextResponse.json({ ok: true, data: { total } });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "internal_error", message: e?.message ?? "failed" },
      },
      { status: 500 },
    );
  }
}
