"use client";

import { useState } from "react";
import { deleteClosetItem } from "@/lib/actions/closet";

const CONFIRM_MESSAGE =
  "确认删除这件衣服？\n\n删除后无法恢复，相关图片也会一起删除。";

export function DeleteClothingButton({ itemId }: { itemId: string }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    const confirmed = window.confirm(CONFIRM_MESSAGE);
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);

    try {
      const result = await deleteClosetItem(itemId);
      if (result?.error) {
        setError(result.error);
        setIsDeleting(false);
      }
    } catch {
      setError("删除失败，请稍后重试");
      setIsDeleting(false);
    }
  };

  return (
    <div className="mt-8 border-t border-border/50 pt-6">
      {error && (
        <p className="mb-3 text-center text-sm text-red-600">{error}</p>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="w-full rounded-2xl py-3 text-sm text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
      >
        {isDeleting ? "删除中…" : "删除衣服"}
      </button>
    </div>
  );
}
