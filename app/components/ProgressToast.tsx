"use client";

import * as React from "react";
import { useToast } from "@/app/components/ui/use-toast";

interface ProgressToastProps {
  status: "idle" | "loading" | "success" | "error";
  actionLabel: string;
  successMessage?: string;
  errorMessage?: string;
}

export function ProgressToast({
  status,
  actionLabel,
  successMessage,
  errorMessage,
}: ProgressToastProps) {
  const { toast, dismiss } = useToast();
  const toastId = React.useRef<string | null>(null);

  React.useEffect(() => {
    // 顯示「處理中」：不設定 duration，直到被關閉
    if (status === "loading") {
      const result = toast({
        title: `${actionLabel} 進行中…`,
        description: "這可能需要一點時間，正在與 YouTube 通訊。",
        duration: undefined,
      });
      toastId.current = result.id;
      return; // 本輪結束
    }

    // 成功：先關掉 loading，再顯示成功
    if (status === "success") {
      if (toastId.current) dismiss(toastId.current);
      toast({
        title: successMessage ?? `${actionLabel} 完成`,
        duration: 4000,
      });
      toastId.current = null;
      return;
    }

    // 失敗：先關掉 loading，再顯示失敗
    if (status === "error") {
      if (toastId.current) dismiss(toastId.current);
      toast({
        title: `${actionLabel} 失敗`,
        description: errorMessage ?? "可至『事件追蹤』查看詳細錯誤。",
        duration: 5000,
      });
      toastId.current = null;
      return;
    }
  }, [status, actionLabel, successMessage, errorMessage, toast, dismiss]);

  return null;
}
