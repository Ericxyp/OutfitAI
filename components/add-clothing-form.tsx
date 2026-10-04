"use client";

import { useActionState, useRef, useState } from "react";
import { ClothingAnalysisEditor } from "@/components/clothing-analysis-editor";
import { PAGE_COPY } from "@/lib/constants";
import {
  analyzeClothingFromImage,
  createClosetItem,
  type ClosetActionState,
} from "@/lib/actions/closet";
import { compressImageToBase64 } from "@/lib/closet/compress-image";
import type {
  ClosetItemFormValues,
  ClothingAnalysis,
  ClothingOptions,
} from "@/types/closet";

const initialState: ClosetActionState = {};

const EMPTY_FORM: ClosetItemFormValues = {
  name: "",
  category: "",
  color: "",
  material: "",
  style_tags: [],
  season_tags: [],
  occasion_tags: [],
  custom_style_tags: [],
  custom_occasion_tags: [],
  notes: "",
};

function analysisToFormValues(
  data: ClothingAnalysis,
  previous: ClosetItemFormValues
): ClosetItemFormValues {
  return {
    name: data.name,
    category: data.category,
    color: data.color,
    material: data.material,
    style_tags: data.style_tags,
    season_tags: data.season_tags,
    occasion_tags: data.occasion_tags,
    // AI 不生成自定义标签；保留用户已手动添加的内容
    custom_style_tags: previous.custom_style_tags,
    custom_occasion_tags: previous.custom_occasion_tags,
    notes: data.notes,
  };
}

export function AddClothingForm({ options }: { options: ClothingOptions }) {
  const [state, formAction, pending] = useActionState(
    createClosetItem,
    initialState
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formValues, setFormValues] = useState<ClosetItemFormValues>(EMPTY_FORM);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isNonClothing, setIsNonClothing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const resetImageState = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    setSelectedFile(null);
    setAiStatus(null);
    setIsNonClothing(false);
    setFormValues(EMPTY_FORM);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setPreview(url);
      setSelectedFile(file);
      setAiStatus(null);
      setIsNonClothing(false);
    } else {
      resetImageState();
    }
  };

  const handleReupload = () => {
    resetImageState();
    fileInputRef.current?.click();
  };

  const handleAiRecognize = async () => {
    if (!selectedFile || isAnalyzing) return;

    setIsAnalyzing(true);
    setAiStatus(PAGE_COPY.addClothing.aiAnalyzing);

    try {
      const { base64, mimeType } = await compressImageToBase64(selectedFile);
      const formData = new FormData();
      formData.set("image_base64", base64);
      formData.set("mime_type", mimeType);

      const result = await analyzeClothingFromImage(formData);

      if (!result.success) {
        setAiStatus(result.error);
        setIsNonClothing(false);
        return;
      }

      if (!result.data.is_clothing) {
        setIsNonClothing(true);
        setAiStatus(PAGE_COPY.addClothing.notClothing);
        return;
      }

      setIsNonClothing(false);
      setFormValues((previous) => analysisToFormValues(result.data, previous));
      setAiStatus(PAGE_COPY.addClothing.aiSuccess);
    } catch (error) {
      console.error("handleAiRecognize error:", error);
      const message =
        error instanceof Error ? error.message : PAGE_COPY.addClothing.aiFailed;
      setAiStatus(
        message.startsWith("Qwen ") ? message : `Qwen 识别失败：${message}`
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const aiStatusTone =
    aiStatus === PAGE_COPY.addClothing.aiSuccess
      ? "text-muted"
      : aiStatus === PAGE_COPY.addClothing.aiAnalyzing
        ? "text-muted"
        : aiStatus === PAGE_COPY.addClothing.notClothing
          ? "text-amber-700"
          : aiStatus?.startsWith("Qwen 识别") ||
              aiStatus?.startsWith("Qwen 识别失败")
            ? "text-red-500"
            : aiStatus
              ? "text-amber-600"
              : "text-muted";

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">衣服图片</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-2xl bg-accent ring-1 ring-border/60"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="预览"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-card">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="#111111"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <p className="text-sm text-muted">{PAGE_COPY.addClothing.uploadHint}</p>
            </div>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp,image/heic"
          required
          className="hidden"
          onChange={handleImageChange}
        />

        {preview && (
          <button
            type="button"
            onClick={() => void handleAiRecognize()}
            disabled={isAnalyzing || pending}
            className="mt-3 w-full rounded-2xl border border-border bg-card py-3 text-sm font-medium text-foreground transition-opacity hover:bg-accent disabled:opacity-60"
          >
            {isAnalyzing
              ? PAGE_COPY.addClothing.aiAnalyzing
              : PAGE_COPY.addClothing.aiRecognize}
          </button>
        )}

        {aiStatus && (
          <p className={`mt-2 text-xs ${aiStatusTone}`}>{aiStatus}</p>
        )}

        {isNonClothing && (
          <button
            type="button"
            onClick={handleReupload}
            className="mt-3 w-full rounded-2xl border border-border bg-card py-3 text-sm font-medium text-foreground transition-opacity hover:bg-accent"
          >
            {PAGE_COPY.addClothing.reupload}
          </button>
        )}
      </div>

      {!isNonClothing && (
        <>
          <ClothingAnalysisEditor
            idPrefix="single-add"
            values={formValues}
            options={options}
            onChange={setFormValues}
            includeHiddenInputs
            disabled={pending}
          />

          {state.error && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-2xl bg-foreground py-3.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? PAGE_COPY.addClothing.saving : PAGE_COPY.addClothing.save}
          </button>
        </>
      )}
    </form>
  );
}
