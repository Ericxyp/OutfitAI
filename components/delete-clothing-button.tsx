"use client";

import { deleteClosetItem } from "@/lib/actions/closet";

export function DeleteClothingButton({ itemId }: { itemId: string }) {
  const handleDelete = async () => {
    const confirmed = window.confirm("确定要删除这件衣服吗？此操作不可撤销。");
    if (!confirmed) return;
    await deleteClosetItem(itemId);
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="w-full rounded-2xl border border-red-200 bg-card py-3.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
    >
      删除这件衣服
    </button>
  );
}
