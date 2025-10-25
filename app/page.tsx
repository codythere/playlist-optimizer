// VERSION 1 (formal version)
import HomeClient from "./HomeClient";

export default function Page() {
  return <HomeClient />;
}

// VERSION 2 (Reduced version)
// "use client";

// import * as React from "react";
// import { useQuery } from "@tanstack/react-query";

// type AuthMe = { loggedIn?: boolean; userId?: string } | undefined;
// type PlaylistsResponse = {
//   usingMock: boolean;
//   items: Array<{
//     id: string;
//     title: string;
//     channelTitle: string;
//     itemCount: number;
//     thumb: string | null;
//   }>;
// };
// type Playlist = {
//   id: string;
//   title: string;
//   itemCount?: number;
//   thumbnailUrl?: string | null;
//   channelTitle?: string;
// };

// async function fetchJSON<T>(url: string): Promise<T> {
//   const res = await fetch(url, {
//     method: "GET",
//     credentials: "include",
//     cache: "no-store",
//   });
//   const data = await res.json().catch(() => ({}));
//   if (!res.ok) {
//     const msg =
//       (data as any)?.message || (data as any)?.error || `HTTP ${res.status}`;
//     throw new Error(msg);
//   }
//   return data as T;
// }

// export default function HomeClient() {
//   // 先呼叫「所有」 hooks（保持次序固定）
//   const authQ = useQuery({
//     queryKey: ["auth/me"],
//     queryFn: () => fetchJSON<AuthMe>("/api/auth/me"),
//     retry: false,
//     refetchOnWindowFocus: false,
//     staleTime: 0,
//   });

//   const playlistsQ = useQuery<PlaylistsResponse>({
//     queryKey: ["playlists"],
//     queryFn: () => fetchJSON<PlaylistsResponse>("/api/playlists"),
//     enabled: !!authQ.data?.loggedIn, // 只有登入後才執行
//     retry: false,
//     refetchOnWindowFocus: false,
//     staleTime: 0,
//   });

//   // ---- UI 分支（不再新增 hooks） ----
//   if (authQ.isLoading) return <div className="p-4">Loading auth…</div>;

//   if (authQ.isError || !authQ.data?.loggedIn) {
//     const err = (authQ.error as Error)?.message;
//     return (
//       <div className="p-6 space-y-3">
//         {authQ.isError && <div className="text-red-600">Auth error: {err}</div>}
//         <button
//           onClick={() => (window.location.href = "/api/auth/login")}
//           className="px-3 py-2 rounded bg-black text-white"
//         >
//           Login with Google
//         </button>
//       </div>
//     );
//   }

//   // 已登入：等 playlists 啟動／載入
//   if (!playlistsQ.isSuccess) {
//     // 可能是 enabled=false 尚未啟動、或載入中
//     return <div className="p-4">Loading playlists…</div>;
//   }

//   if (playlistsQ.data.usingMock) {
//     return <div className="p-6">目前使用 Mock 資料，請先完成登入與授權。</div>;
//   }

//   const items: Playlist[] = playlistsQ.data.items.map((p) => ({
//     id: p.id,
//     title: p.title,
//     itemCount: p.itemCount,
//     thumbnailUrl: p.thumb,
//     channelTitle: p.channelTitle,
//   }));

//   return (
//     <div className="p-6 space-y-4">
//       <h1 className="text-xl font-bold">Playlists</h1>
//       {items.length === 0 ? (
//         <div>沒有播放清單</div>
//       ) : (
//         <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
//           {items.map((p) => (
//             <li
//               key={p.id}
//               className="p-3 rounded-2xl border shadow-sm hover:shadow transition"
//             >
//               <div className="aspect-video w-full overflow-hidden rounded-xl bg-gray-100">
//                 {p.thumbnailUrl && (
//                   <img
//                     src={p.thumbnailUrl}
//                     alt={p.title}
//                     className="w-full h-full object-cover"
//                   />
//                 )}
//               </div>
//               <div className="mt-3 font-medium line-clamp-2">{p.title}</div>
//               <div className="text-xs mt-1 opacity-70">{p.channelTitle}</div>
//               <div className="text-xs mt-1 opacity-70">
//                 {p.itemCount ?? 0} videos
//               </div>
//             </li>
//           ))}
//         </ul>
//       )}
//     </div>
//   );
// }
