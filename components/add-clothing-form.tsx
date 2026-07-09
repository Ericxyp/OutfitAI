"use client";

import { useActionState, useRef, useState } from "react";
import { PAGE_COPY } from "@/lib/constants";
import {
  analyzeClothingFromImage,
  createClosetItem,
  type ClosetActionState,
} from "@/lib/actions/closet";
import type { ClothingAnalysis, ClothingOptions } from "@/types/closet";

const initialState: ClosetActionState = {};

function TagSelector({
  name,
  label,
  options,
  selected,
  onChange,
}: {
  name: string;
  label: string;
  options: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const toggle = (tag: string) => {
    onChange(
      selected.includes(tag)
        ? selected.filter((t) => t !== tag)
        : [...selected, tag]
    );
  };

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((tag) => {
          const active = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "bg-accent text-foreground hover:bg-accent/80"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
      {selected.map((tag) => (
        <input key={tag} type="hidden" name={name} value={tag} />
      ))}
    </div>
  );
}

const MAX_IMAGE_DIMENSION = 768;
const MAX_BASE64_SIZE = 900 * 1024;
const JPEG_QUALITY_INITIAL = 0.7;
const JPEG_QUALITY_REDUCED = 0.6;

function encodeCanvasToBase64(
  canvas: HTMLCanvasElement,
  quality: number
): string {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const base64 = dataUrl.split(",")[1];
  if (!base64) {
    throw new Error(PAGE_COPY.addClothing.imageProcessFailed);
  }
  return base64;
}

async function compressImageToBase64(
  file: File
): Promise<{ base64: string; mimeType: "image/jpeg" }> {
  const processError = PAGE_COPY.addClothing.imageProcessFailed;
  const tooLargeError = PAGE_COPY.addClothing.imageTooLarge;
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(processError));
      image.src = objectUrl;
    });

    let width = img.naturalWidth;
    let height = img.naturalHeight;
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error(processError);
    }

    ctx.drawImage(img, 0, 0, width, height);

    let base64 = encodeCanvasToBase64(canvas, JPEG_QUALITY_INITIAL);
    if (base64.length > MAX_BASE64_SIZE) {
      base64 = encodeCanvasToBase64(canvas, JPEG_QUALITY_REDUCED);
    }
    if (base64.length > MAX_BASE64_SIZE) {
      throw new Error(tooLargeError);
    }

    return { base64, mimeType: "image/jpeg" };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === processError || error.message === tooLargeError)
    ) {
      throw error;
    }
    throw new Error(processError);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function applyAnalysis(
  data: ClothingAnalysis,
  setters: {
    setName: (v: string) => void;
    setCategory: (v: string) => void;
    setColor: (v: string) => void;
    setMaterial: (v: string) => void;
    setNotes: (v: string) => void;
    setStyleTags: (v: string[]) => void;
    setSeasonTags: (v: string[]) => void;
    setOccasionTags: (v: string[]) => void;
  }
) {
  setters.setName(data.name);
  setters.setCategory(data.category);
  setters.setColor(data.color);
  setters.setMaterial(data.material);
  setters.setNotes(data.notes);
  setters.setStyleTags(data.style_tags);
  setters.setSeasonTags(data.season_tags);
  setters.setOccasionTags(data.occasion_tags);
}

export function AddClothingForm({ options }: { options: ClothingOptions }) {
  const [state, formAction, pending] = useActionState(
    createClosetItem,
    initialState
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");
  const [notes, setNotes] = useState("");
  const [styleTags, setStyleTags] = useState<string[]>([]);
  const [seasonTags, setSeasonTags] = useState<string[]>([]);
  const [occasionTags, setOccasionTags] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      setSelectedFile(file);
      setAiStatus(null);
    } else {
      setPreview(null);
      setSelectedFile(null);
      setAiStatus(null);
    }
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
        return;
      }

      applyAnalysis(result.data, {
        setName,
        setCategory,
        setColor,
        setMaterial,
        setNotes,
        setStyleTags,
        setSeasonTags,
        setOccasionTags,
      });
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
      </div>

      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-foreground">
          名称
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：白色棉质 T 恤"
          className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
        />
      </div>

      <div>
        <label htmlFor="category" className="mb-1.5 block text-sm font-medium text-foreground">
          分类
        </label>
        <select
          id="category"
          name="category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
        >
          <option value="" disabled>
            选择分类
          </option>
          {options.categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="color" className="mb-1.5 block text-sm font-medium text-foreground">
            颜色
          </label>
          <input
            id="color"
            name="color"
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="白色"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
          />
        </div>
        <div>
          <label htmlFor="material" className="mb-1.5 block text-sm font-medium text-foreground">
            材质
          </label>
          <input
            id="material"
            name="material"
            type="text"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder="棉"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
          />
        </div>
      </div>

      <TagSelector
        name="style_tags"
        label="风格标签"
        options={options.styleTags}
        selected={styleTags}
        onChange={setStyleTags}
      />
      <TagSelector
        name="season_tags"
        label="季节"
        options={options.seasonTags}
        selected={seasonTags}
        onChange={setSeasonTags}
      />
      <TagSelector
        name="occasion_tags"
        label="适合场景"
        options={options.occasionTags}
        selected={occasionTags}
        onChange={setOccasionTags}
      />

      <div>
        <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-foreground">
          备注
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="例如：偏宽松，适合叠穿"
          className="w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
        />
      </div>

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
    </form>
  );
}
