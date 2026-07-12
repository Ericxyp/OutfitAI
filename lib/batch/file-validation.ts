export const MAX_BATCH_UPLOAD_COUNT = 10;
export const MAX_BATCH_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_ANALYSIS_CONCURRENCY = 2;
export const MAX_SAVE_CONCURRENCY = 2;

export const BATCH_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type BatchItemStatus =
  | "queued"
  | "analyzing"
  | "needs_review"
  | "saving"
  | "completed"
  | "failed";

export type BatchFailureStage = "validation" | "analysis" | "save";

export type BatchUploadItem = {
  clientId: string;
  file: File;
  previewUrl: string;
  status: BatchItemStatus;
  analysis?: import("@/types/closet").ClothingAnalysis;
  formValues?: import("@/types/closet").ClosetItemFormValues;
  error?: string;
  failureStage?: BatchFailureStage;
  savedClosetItemId?: string;
  attempts: number;
};

export type FileValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function getFileFingerprint(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateBatchImageFile(file: File): FileValidationResult {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();

  if (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  ) {
    return {
      ok: false,
      error: "暂不支持 HEIC，请在相册中转换为 JPG 后重试。",
    };
  }

  if (type === "image/gif" || name.endsWith(".gif")) {
    return { ok: false, error: "不支持 GIF，请使用 JPG、PNG 或 WebP。" };
  }

  if (type === "image/svg+xml" || name.endsWith(".svg")) {
    return { ok: false, error: "不支持 SVG，请使用 JPG、PNG 或 WebP。" };
  }

  if (!BATCH_ALLOWED_MIME_TYPES.has(type)) {
    return { ok: false, error: "不支持的图片格式，请使用 JPG、PNG 或 WebP。" };
  }

  if (file.size <= 0) {
    return { ok: false, error: "文件无效，请重新选择。" };
  }

  if (file.size > MAX_BATCH_IMAGE_SIZE) {
    return { ok: false, error: "图片超过 5MB，请换一张更小的图片。" };
  }

  return { ok: true };
}

export type MergeSelectedFilesResult = {
  accepted: File[];
  rejected: Array<{ fileName: string; error: string }>;
  truncated: boolean;
  duplicateCount: number;
};

/**
 * 将新选择的文件合并进现有队列（最多 maxCount 张）。
 * 策略：保留前 N 张，超出提示未添加；重复与非法文件不进入队列。
 */
export function mergeSelectedFiles(input: {
  existing: File[];
  incoming: File[];
  maxCount?: number;
}): MergeSelectedFilesResult {
  const maxCount = input.maxCount ?? MAX_BATCH_UPLOAD_COUNT;
  const fingerprints = new Set(input.existing.map(getFileFingerprint));
  const accepted: File[] = [];
  const rejected: Array<{ fileName: string; error: string }> = [];
  let duplicateCount = 0;
  let truncated = false;

  const remainingSlots = Math.max(0, maxCount - input.existing.length);

  for (const file of input.incoming) {
    if (accepted.length >= remainingSlots) {
      truncated = true;
      break;
    }

    const fingerprint = getFileFingerprint(file);
    if (fingerprints.has(fingerprint)) {
      duplicateCount += 1;
      continue;
    }

    const validation = validateBatchImageFile(file);
    if (!validation.ok) {
      rejected.push({ fileName: file.name, error: validation.error });
      continue;
    }

    fingerprints.add(fingerprint);
    accepted.push(file);
  }

  if (
    input.incoming.length >
    accepted.length + rejected.length + duplicateCount
  ) {
    truncated = true;
  }

  return { accepted, rejected, truncated, duplicateCount };
}

export function hasUnfinishedBatchWork(items: BatchUploadItem[]): boolean {
  return items.some(
    (item) =>
      item.status === "queued" ||
      item.status === "analyzing" ||
      item.status === "needs_review" ||
      item.status === "saving" ||
      (item.status === "failed" && Boolean(item.file))
  );
}

export function analysisToFormValues(
  analysis: import("@/types/closet").ClothingAnalysis
): import("@/types/closet").ClosetItemFormValues {
  return {
    name: analysis.name ?? "",
    category: analysis.category ?? "",
    color: analysis.color ?? "",
    material: analysis.material ?? "",
    style_tags: [...(analysis.style_tags ?? [])],
    season_tags: [...(analysis.season_tags ?? [])],
    occasion_tags: [...(analysis.occasion_tags ?? [])],
    notes: analysis.notes ?? "",
  };
}
