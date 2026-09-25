"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useStore } from "@/context/store-context";

export function BackendStatus() {
  const { backendError, isLiveBackend, refresh } = useStore();
  const [retrying, setRetrying] = useState(false);
  if (!isLiveBackend || !backendError) return null;

  const retry = async () => {
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      className="border-b border-warn/30 bg-warn-bg px-4 py-2 text-xs text-warn"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{backendError}</span>
        </span>
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying}
          className="inline-flex shrink-0 items-center gap-1 font-semibold underline underline-offset-2 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
          <span>{retrying ? "Memuat..." : "Coba lagi"}</span>
        </button>
      </div>
    </div>
  );
}
