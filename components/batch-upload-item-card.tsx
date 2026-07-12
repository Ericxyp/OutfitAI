"use client";

import { ClothingAnalysisEditor } from "@/components/clothing-analysis-editor";
import {
  formatFileSize,
  type BatchUploadItem,
} from "@/lib/batch/file-validation";
import type { ClosetItemFormValues, ClothingOptions } from "@/types/closet";

const STATUS_LABELS: Record<BatchUploadItem["status"], string> = {
  queued: "待识别",
  analyzing: "识别中…",
  needs_review: "待确认",
  saving: "保存中…",
  completed: "已保存",
  failed: "失败",
};

export function BatchUploadItemCard({
  item,
  options,
  onRemove,
  onRetryAnalysis,
  onRetrySave,
  onSave,
  onFormChange,
}: {
  item: BatchUploadItem;
  options: ClothingOptions;
  onRemove: (clientId: string) => void;
  onRetryAnalysis: (clientId: string) => void;
  onRetrySave: (clientId: string) => void;
  onSave: (clientId: string) => void;
  onFormChange: (clientId: string, values: ClosetItemFormValues) => void;
}) {
  const canRemove =
    item.status === "queued" ||
    item.status === "needs_review" ||
    (item.status === "failed" && item.failureStage !== undefined);

  const canEdit = item.status === "needs_review";
  const showEditor =
    item.formValues &&
    (item.status === "needs_review" ||
      item.status === "saving" ||
      item.status === "completed" ||
      (item.status === "failed" && item.failureStage === "save"));

  const showSave =
    item.status === "needs_review" ||
    (item.status === "failed" && item.failureStage === "save");

  const showRetryAnalysis =
    item.status === "failed" &&
    (item.failureStage === "analysis" || item.failureStage === "validation");

  const isNotClothing =
    item.status === "failed" &&
    item.failureStage === "analysis" &&
    (item.error?.includes("不是衣物") ||
      item.error?.includes("未识别为可穿戴") ||
      item.error?.includes("穿戴类"));

  return (
    <article className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60">
      <div className="flex gap-3 p-3 sm:p-4">
        <div className="h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-accent ring-1 ring-border/40 sm:h-32 sm:w-28">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.previewUrl}
            alt={item.file.name || "衣物预览"}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {item.file.name}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {formatFileSize(item.file.size)}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                item.status === "completed"
                  ? "bg-foreground/10 text-foreground"
                  : item.status === "failed"
                    ? "bg-red-50 text-red-600"
                    : "bg-accent text-muted"
              }`}
            >
              {STATUS_LABELS[item.status]}
            </span>
          </div>

          {item.error && (
            <p className="mt-2 text-xs leading-relaxed text-red-600" role="alert">
              {isNotClothing
                ? `未识别为可穿戴衣物：${item.error}`
                : item.error}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {canRemove && (
              <button
                type="button"
                onClick={() => onRemove(item.clientId)}
                className="min-h-11 rounded-xl bg-accent px-3 py-2 text-xs text-foreground transition-opacity hover:opacity-80"
              >
                移除
              </button>
            )}

            {showRetryAnalysis && (
              <button
                type="button"
                onClick={() => onRetryAnalysis(item.clientId)}
                className="min-h-11 rounded-xl bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
              >
                重新识别
              </button>
            )}

            {showSave && (
              <button
                type="button"
                onClick={() =>
                  item.status === "failed"
                    ? onRetrySave(item.clientId)
                    : onSave(item.clientId)
                }
                disabled={item.status === "saving"}
                className="min-h-11 rounded-xl bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {item.status === "failed" ? "重新保存" : "保存此件"}
              </button>
            )}

            {item.status === "completed" && (
              <span className="min-h-11 inline-flex items-center rounded-xl bg-accent px-3 py-2 text-xs text-muted">
                已写入衣橱
              </span>
            )}
          </div>
        </div>
      </div>

      {showEditor && item.formValues && (
        <div className="border-t border-border/50 px-3 py-3 sm:px-4">
          <ClothingAnalysisEditor
            idPrefix={item.clientId}
            values={item.formValues}
            options={options}
            disabled={!canEdit}
            readOnly={item.status === "completed"}
            onChange={(values) => onFormChange(item.clientId, values)}
          />
        </div>
      )}
    </article>
  );
}
