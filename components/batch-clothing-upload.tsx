"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BatchUploadItemCard } from "@/components/batch-upload-item-card";
import {
  analyzeBatchClothingImage,
  saveBatchClosetItem,
  trackClosetBatchEvent,
} from "@/lib/actions/closet-batch";
import { runWithConcurrencyLimit } from "@/lib/batch/concurrency";
import {
  MAX_ANALYSIS_CONCURRENCY,
  MAX_BATCH_UPLOAD_COUNT,
  MAX_SAVE_CONCURRENCY,
  analysisToFormValues,
  hasUnfinishedBatchWork,
  mergeSelectedFiles,
  type BatchUploadItem,
} from "@/lib/batch/file-validation";
import { compressImageToBase64 } from "@/lib/closet/compress-image";
import { formatBatchAnalysisError } from "@/lib/closet/form-validation";
import { createClientId } from "@/lib/client-id";
import type { ClosetItemFormValues, ClothingOptions } from "@/types/closet";

function updateItemById(
  items: BatchUploadItem[],
  clientId: string,
  updater: (item: BatchUploadItem) => BatchUploadItem
): BatchUploadItem[] {
  return items.map((item) =>
    item.clientId === clientId ? updater(item) : item
  );
}

export function BatchClothingUpload({ options }: { options: ClothingOptions }) {
  const [items, setItems] = useState<BatchUploadItem[]>([]);
  const [selectionHints, setSelectionHints] = useState<string[]>([]);
  const [isAnalyzingBatch, setIsAnalyzingBatch] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [saveProgress, setSaveProgress] = useState<string | null>(null);
  const [batchSummary, setBatchSummary] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  const mountedRef = useRef(true);
  const analyzingIdsRef = useRef(new Set<string>());
  const savingIdsRef = useRef(new Set<string>());
  const analysisRunIdRef = useRef(0);
  const batchIdRef = useRef(createClientId());
  const analysisCompletedTrackedRef = useRef(false);
  const batchCompletedTrackedRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      analysisRunIdRef.current += 1;
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const unfinished = hasUnfinishedBatchWork(items);

  useEffect(() => {
    if (!unfinished) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [unfinished]);

  const handleSelectFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const existingFiles = itemsRef.current.map((item) => item.file);
    const merge = mergeSelectedFiles({
      existing: existingFiles,
      incoming: Array.from(fileList),
      maxCount: MAX_BATCH_UPLOAD_COUNT,
    });

    const hints: string[] = [];
    if (merge.truncated) {
      hints.push("最多选择 10 张，超出的文件未添加");
    }
    if (merge.duplicateCount > 0) {
      hints.push(`已跳过 ${merge.duplicateCount} 个重复文件`);
    }
    for (const rejected of merge.rejected.slice(0, 3)) {
      hints.push(`${rejected.fileName}：${rejected.error}`);
    }
    if (merge.rejected.length > 3) {
      hints.push(`另有 ${merge.rejected.length - 3} 个文件未通过校验`);
    }
    setSelectionHints(hints);
    setBatchSummary(null);

    if (merge.accepted.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const nextItems: BatchUploadItem[] = merge.accepted.map((file) => ({
      clientId: createClientId(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "queued",
      attempts: 0,
    }));

    setItems((current) => [...current, ...nextItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeItem = (clientId: string) => {
    setItems((current) => {
      const target = current.find((item) => item.clientId === clientId);
      if (!target) return current;
      if (
        target.status === "analyzing" ||
        target.status === "saving" ||
        target.status === "completed"
      ) {
        return current;
      }
      URL.revokeObjectURL(target.previewUrl);
      const next = current.filter((item) => item.clientId !== clientId);
      itemsRef.current = next;
      return next;
    });
  };

  const handleFormChange = (clientId: string, values: ClosetItemFormValues) => {
    setItems((current) => {
      const next = updateItemById(current, clientId, (item) => {
        if (item.status !== "needs_review") return item;
        return { ...item, formValues: values };
      });
      itemsRef.current = next;
      return next;
    });
  };

  const analyzeOne = useCallback(async (clientId: string, runId: number) => {
    if (!mountedRef.current || runId !== analysisRunIdRef.current) return;
    if (analyzingIdsRef.current.has(clientId)) return;

    const currentItem = itemsRef.current.find(
      (item) => item.clientId === clientId
    );
    if (!currentItem) return;
    if (
      currentItem.status !== "queued" &&
      !(
        currentItem.status === "failed" &&
        (currentItem.failureStage === "analysis" ||
          currentItem.failureStage === "validation")
      )
    ) {
      return;
    }

    analyzingIdsRef.current.add(clientId);

    setItems((current) => {
      const next = updateItemById(current, clientId, (item) => ({
        ...item,
        status: "analyzing",
        error: undefined,
        failureStage: undefined,
        attempts: item.attempts + 1,
      }));
      itemsRef.current = next;
      return next;
    });

    try {
      const { base64, mimeType } = await compressImageToBase64(currentItem.file);
      const formData = new FormData();
      formData.set("image_base64", base64);
      formData.set("mime_type", mimeType);

      const result = await analyzeBatchClothingImage(formData);

      if (!mountedRef.current || runId !== analysisRunIdRef.current) return;

      if (!result.success) {
        setItems((current) => {
          const next = updateItemById(current, clientId, (item) => ({
            ...item,
            status: "failed",
            failureStage: "analysis",
            error: result.error,
            analysis: undefined,
            formValues: undefined,
          }));
          itemsRef.current = next;
          return next;
        });
        return;
      }

      const formValues = analysisToFormValues(result.data);
      setItems((current) => {
        const next = updateItemById(current, clientId, (item) => ({
          ...item,
          status: "needs_review",
          analysis: result.data,
          formValues,
          error: undefined,
          failureStage: undefined,
        }));
        itemsRef.current = next;
        return next;
      });
    } catch (error) {
      if (!mountedRef.current || runId !== analysisRunIdRef.current) return;
      setItems((current) => {
        const next = updateItemById(current, clientId, (item) => ({
          ...item,
          status: "failed",
          failureStage: "analysis",
          error: formatBatchAnalysisError(error),
        }));
        itemsRef.current = next;
        return next;
      });
    } finally {
      analyzingIdsRef.current.delete(clientId);
    }
  }, []);

  const startAnalysis = async () => {
    if (isAnalyzingBatch || isSavingBatch) return;

    const queued = itemsRef.current.filter(
      (item) =>
        item.status === "queued" ||
        (item.status === "failed" &&
          (item.failureStage === "analysis" ||
            item.failureStage === "validation"))
    );

    if (queued.length === 0) return;

    const runId = analysisRunIdRef.current + 1;
    analysisRunIdRef.current = runId;
    analysisCompletedTrackedRef.current = false;
    setIsAnalyzingBatch(true);
    setBatchSummary(null);

    void trackClosetBatchEvent({
      eventName: "closet_batch_started",
      metadata: {
        batchId: batchIdRef.current,
        totalCount: itemsRef.current.length,
      },
    });

    const tasks = queued.map(
      (item) => () => analyzeOne(item.clientId, runId)
    );

    await runWithConcurrencyLimit(tasks, MAX_ANALYSIS_CONCURRENCY, {
      isCancelled: () =>
        !mountedRef.current || runId !== analysisRunIdRef.current,
    });

    if (!mountedRef.current || runId !== analysisRunIdRef.current) return;

    setIsAnalyzingBatch(false);

    const snapshot = itemsRef.current;
    const recognizedCount = snapshot.filter(
      (item) => item.status === "needs_review" || item.status === "completed"
    ).length;
    const failedCount = snapshot.filter(
      (item) => item.status === "failed"
    ).length;

    if (!analysisCompletedTrackedRef.current) {
      analysisCompletedTrackedRef.current = true;
      void trackClosetBatchEvent({
        eventName: "closet_batch_analysis_completed",
        metadata: {
          batchId: batchIdRef.current,
          totalCount: snapshot.length,
          recognizedCount,
          failedCount,
        },
      });
    }
  };

  const saveOne = useCallback(async (clientId: string): Promise<boolean> => {
    if (savingIdsRef.current.has(clientId)) return false;

    const currentItem = itemsRef.current.find(
      (item) => item.clientId === clientId
    );
    if (!currentItem || !currentItem.formValues) return false;
    if (
      currentItem.status !== "needs_review" &&
      !(currentItem.status === "failed" && currentItem.failureStage === "save")
    ) {
      return false;
    }

    savingIdsRef.current.add(clientId);

    setItems((current) => {
      const next = updateItemById(current, clientId, (item) => ({
        ...item,
        status: "saving",
        error: undefined,
        failureStage: undefined,
        attempts: item.attempts + 1,
      }));
      itemsRef.current = next;
      return next;
    });

    try {
      const formData = new FormData();
      formData.set("image", currentItem.file);
      formData.set("name", currentItem.formValues.name);
      formData.set("category", currentItem.formValues.category);
      formData.set("color", currentItem.formValues.color);
      formData.set("material", currentItem.formValues.material);
      formData.set("notes", currentItem.formValues.notes);
      for (const tag of currentItem.formValues.style_tags) {
        formData.append("style_tags", tag);
      }
      for (const tag of currentItem.formValues.season_tags) {
        formData.append("season_tags", tag);
      }
      for (const tag of currentItem.formValues.occasion_tags) {
        formData.append("occasion_tags", tag);
      }

      const result = await saveBatchClosetItem(formData);

      if (!mountedRef.current) return false;

      if (!result.success) {
        setItems((current) => {
          const next = updateItemById(current, clientId, (item) => ({
            ...item,
            status: "failed",
            failureStage: "save",
            error: result.error,
          }));
          itemsRef.current = next;
          return next;
        });
        return false;
      }

      setItems((current) => {
        const next = updateItemById(current, clientId, (item) => ({
          ...item,
          status: "completed",
          savedClosetItemId: result.closetItemId,
          error: undefined,
          failureStage: undefined,
        }));
        itemsRef.current = next;
        return next;
      });
      return true;
    } catch {
      if (!mountedRef.current) return false;
      setItems((current) => {
        const next = updateItemById(current, clientId, (item) => ({
          ...item,
          status: "failed",
          failureStage: "save",
          error: "保存失败，请稍后重试",
        }));
        itemsRef.current = next;
        return next;
      });
      return false;
    } finally {
      savingIdsRef.current.delete(clientId);
    }
  }, []);

  const saveAllConfirmed = async () => {
    if (isSavingBatch || isAnalyzingBatch) return;

    const targets = itemsRef.current.filter(
      (item) =>
        item.status === "needs_review" ||
        (item.status === "failed" && item.failureStage === "save")
    );

    if (targets.length === 0) return;

    setIsSavingBatch(true);
    setBatchSummary(null);

    let done = 0;
    setSaveProgress(`正在保存 0/${targets.length}`);

    const tasks = targets.map((item) => async () => {
      const ok = await saveOne(item.clientId);
      done += 1;
      if (mountedRef.current) {
        setSaveProgress(`正在保存 ${done}/${targets.length}`);
      }
      return ok;
    });

    const results = await runWithConcurrencyLimit(tasks, MAX_SAVE_CONCURRENCY, {
      isCancelled: () => !mountedRef.current,
    });

    if (!mountedRef.current) return;

    const successCount = results.filter(
      (result) => result.status === "fulfilled" && result.value
    ).length;
    const failedCount = targets.length - successCount;

    setIsSavingBatch(false);
    setSaveProgress(null);
    setBatchSummary(`成功保存 ${successCount} 件，${failedCount} 件失败`);

    if (!batchCompletedTrackedRef.current) {
      batchCompletedTrackedRef.current = true;
      const eventName =
        failedCount > 0 && successCount === 0
          ? "closet_batch_failed"
          : "closet_batch_completed";
      void trackClosetBatchEvent({
        eventName,
        metadata: {
          batchId: batchIdRef.current,
          totalCount: itemsRef.current.length,
          successCount,
          failedCount,
        },
      });
    }
  };

  const handleBackClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!hasUnfinishedBatchWork(itemsRef.current)) return;
    const confirmed = window.confirm(
      "还有未完成的批量任务，离开后未保存的图片会丢失。确定返回衣橱？"
    );
    if (!confirmed) {
      event.preventDefault();
    }
  };

  const totalCount = items.length;
  const analyzingCount = items.filter((item) => item.status === "analyzing").length;
  const reviewedCount = items.filter(
    (item) =>
      item.status === "needs_review" ||
      item.status === "completed" ||
      item.status === "saving"
  ).length;
  const completedCount = items.filter((item) => item.status === "completed").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const savableCount = items.filter(
    (item) =>
      item.status === "needs_review" ||
      (item.status === "failed" && item.failureStage === "save")
  ).length;
  const queuedForAnalysis = items.filter(
    (item) =>
      item.status === "queued" ||
      (item.status === "failed" &&
        (item.failureStage === "analysis" || item.failureStage === "validation"))
  ).length;

  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-accent/60 px-4 py-3 text-sm leading-relaxed text-muted">
        一次最多选择 10 张照片，每张照片请只包含一件衣物。刷新页面会丢失尚未保存的批量任务，已保存衣物不会丢失。
      </p>

      <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/60">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleSelectFiles(e.target.files)}
        />
        <button
          type="button"
          disabled={
            isAnalyzingBatch ||
            isSavingBatch ||
            totalCount >= MAX_BATCH_UPLOAD_COUNT
          }
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {totalCount >= MAX_BATCH_UPLOAD_COUNT
            ? "已达 10 张上限"
            : "选择照片"}
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          支持 JPG / PNG / WebP，单张 ≤ 5MB；可继续追加直到 10 张
        </p>

        {selectionHints.length > 0 && (
          <div className="mt-3 space-y-1" role="alert">
            {selectionHints.map((hint) => (
              <p key={hint} className="text-xs text-amber-700">
                {hint}
              </p>
            ))}
          </div>
        )}
      </div>

      {totalCount > 0 && (
        <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/60">
          <h2 className="text-sm font-medium text-foreground">任务概览</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <OverviewStat label="总数" value={totalCount} />
            <OverviewStat label="已识别" value={reviewedCount} />
            <OverviewStat label="识别中" value={analyzingCount} />
            <OverviewStat label="失败" value={failedCount} />
          </div>
          <p className="mt-3 text-xs text-muted">
            已保存 {completedCount} 件 · 可保存 {savableCount} 件
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={
                isAnalyzingBatch ||
                isSavingBatch ||
                queuedForAnalysis === 0
              }
              onClick={() => void startAnalysis()}
              className="min-h-11 flex-1 rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {isAnalyzingBatch ? "识别中…" : "开始识别"}
            </button>
            <button
              type="button"
              disabled={isAnalyzingBatch || isSavingBatch || savableCount === 0}
              onClick={() => void saveAllConfirmed()}
              className="min-h-11 flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-opacity hover:bg-accent disabled:opacity-60"
            >
              {isSavingBatch
                ? saveProgress ?? "保存中…"
                : "保存全部已确认"}
            </button>
          </div>

          {batchSummary && (
            <p className="mt-3 text-sm text-foreground" role="status">
              {batchSummary}
            </p>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <BatchUploadItemCard
              key={item.clientId}
              item={item}
              options={options}
              onRemove={removeItem}
              onRetryAnalysis={(clientId) => {
                setItems((current) => {
                  const next = updateItemById(current, clientId, (entry) => ({
                    ...entry,
                    status: "queued",
                    error: undefined,
                    failureStage: undefined,
                  }));
                  itemsRef.current = next;
                  return next;
                });
                void analyzeOne(clientId, analysisRunIdRef.current);
              }}
              onRetrySave={(clientId) => void saveOne(clientId)}
              onSave={(clientId) => void saveOne(clientId)}
              onFormChange={handleFormChange}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/closet"
          onClick={handleBackClick}
          className="flex min-h-11 items-center justify-center rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-opacity hover:bg-accent"
        >
          查看衣橱
        </Link>
        <Link
          href="/closet/new"
          className="flex min-h-11 items-center justify-center rounded-2xl bg-accent px-4 py-3 text-sm text-foreground transition-opacity hover:opacity-80"
        >
          改为添加单件
        </Link>
      </div>
    </div>
  );
}

function OverviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-background px-3 py-3 text-center">
      <p className="text-lg font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
