"use client";

import { useActionState, useState } from "react";
import { ClothingAnalysisEditor } from "@/components/clothing-analysis-editor";
import { updateClosetItem, type ClosetActionState } from "@/lib/actions/closet";
import type { ClosetItemFormValues, ClothingOptions } from "@/types/closet";

const initialState: ClosetActionState = {};

/** 编辑衣物信息（含自定义风格 / 场景标签），不修改图片 */
export function EditClothingForm({
  itemId,
  initialValues,
  options,
}: {
  itemId: string;
  initialValues: ClosetItemFormValues;
  options: ClothingOptions;
}) {
  const [state, formAction, pending] = useActionState(updateClosetItem, initialState);
  const [values, setValues] = useState<ClosetItemFormValues>(initialValues);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={itemId} />
      <ClothingAnalysisEditor
        idPrefix={`edit-${itemId.slice(0, 8)}`}
        values={values}
        options={options}
        onChange={setValues}
        includeHiddenInputs
        disabled={pending}
      />

      {state.error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-foreground py-3.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "保存中…" : "保存修改"}
      </button>
    </form>
  );
}
