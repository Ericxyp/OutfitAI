"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { regenerateStyleSummary } from "@/lib/actions/style-profile";

export function RegenerateStyleSummaryButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleClick = async () => {
    setIsPending(true);
    setError(null);
    setSuccess(false);

    const result = await regenerateStyleSummary();
    setIsPending(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setSuccess(true);
    router.refresh();
  };

  return (
    <div>
      {error && (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      )}
      {success && (
        <p className="mb-3 text-sm text-foreground">风格总结已更新</p>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="w-full rounded-2xl bg-foreground py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "生成中…" : "重新生成我的风格总结"}
      </button>
    </div>
  );
}
