"use client";
import { useQuery } from "@tanstack/react-query";

export function useVideoOps() {
  return useQuery({
    queryKey: ["videoOps"],
    queryFn: async (): Promise<{ total: number }> => {
      const res = await fetch("/api/video-ops", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json?.ok === false)
        throw new Error(json?.error?.message || "Failed");
      return json.data as { total: number };
    },
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
}
