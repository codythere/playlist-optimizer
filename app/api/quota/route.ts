// /app/api/quota/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getTodayQuota } from "@/lib/quota";

export const dynamic = "force-dynamic";

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET() {
  try {
    const jar = await cookies();
    const raw = jar.get("ytpm_session")?.value;
    const userId = raw
      ? (JSON.parse(raw).userId as string | undefined)
      : undefined;

    // ✅ 用真正的 userId（或 undefined），不要硬塞 "guest"
    const q = await getTodayQuota(userId);

    // 把任何可能是 Number 物件 / Decimal / Big 的東西，統一轉成原生 number
    const budget = toNum((q as any)?.budget, 10000);
    const used = toNum((q as any)?.used, 0);

    // remain 若上游沒給或不是 number，就自己算
    const remainRaw = (q as any)?.remain;
    const remain = Number.isFinite(Number(remainRaw))
      ? Number(remainRaw)
      : Math.max(0, budget - used);

    // resetAtISO 統一成字串
    const resetAtISO =
      typeof (q as any)?.resetAtISO === "string"
        ? (q as any).resetAtISO
        : new Date().toISOString();

    return NextResponse.json({
      ok: true,
      data: {
        todayUsed: used,
        todayRemaining: remain,
        todayBudget: budget,
        resetAtISO,
        // 若你之後前端想用也可以拿 q.mode / q.globalUsed / q.userUsed
        // quotaMode: (q as any)?.mode,
        // todayGlobalUsed: toNum((q as any)?.globalUsed, 0),
        // todayUserUsed: toNum((q as any)?.userUsed, 0),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: true,
        error: { code: "internal_error", message: e?.message ?? "failed" },
      },
      { status: 500 }
    );
  }
}
