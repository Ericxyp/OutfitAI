"use client";

import { formatDateLabel } from "@/lib/requirements/date";
import type { RequirementFlowState } from "@/lib/requirements/flow-state";
import {
  ACTIVITY_LABELS,
  DURATION_LABELS,
  FORMALITY_LABELS,
  OCCASION_LABELS,
  SPECIAL_REQUIREMENT_LABELS,
} from "@/lib/requirements/schema";
import type { ClarificationOption, OutfitRequirement } from "@/types/requirement";

type RequirementPanelProps = {
  state: RequirementFlowState;
  onOption: (option: ClarificationOption) => void;
  onSkip: () => void;
  onConfirm: () => void;
  onModify: () => void;
  onCancel: () => void;
};

const cardClass =
  "w-full rounded-2xl bg-card px-4 py-3.5 text-sm text-foreground shadow-sm ring-1 ring-border/60";
const chipClass =
  "rounded-full bg-background px-3 py-1.5 text-sm text-foreground ring-1 ring-border/80 transition-colors hover:bg-accent disabled:opacity-50";
const ghostButtonClass =
  "rounded-full px-3 py-1.5 text-xs text-muted transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50";

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1">
      <dt className="w-16 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{value}</dd>
    </div>
  );
}

function describeStyle(req: OutfitRequirement): string | null {
  const parts: string[] = [...req.style];
  if (req.formality) parts.push(FORMALITY_LABELS[req.formality]);
  return parts.length ? [...new Set(parts)].join("、") : null;
}

function describeLocation(req: OutfitRequirement): string {
  if (!req.location) return "未指定";
  if (req.location.source === "none") {
    return req.location.placeName ? `${req.location.placeName}（不考虑天气）` : "未指定（不考虑天气）";
  }
  return req.location.displayName;
}

export function RequirementPanel({
  state,
  onOption,
  onSkip,
  onConfirm,
  onModify,
  onCancel,
}: RequirementPanelProps) {
  const { status, requirement, questions, weather, message } = state;

  if (status === "idle") return null;

  if (status === "error") {
    return (
      <div className="flex justify-start pr-8" role="status">
        <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-red-50 px-4 py-2.5 text-sm text-red-800 ring-1 ring-red-100">
          {message ?? "需求解析失败，请换个说法再试。"}
        </div>
      </div>
    );
  }

  if (status === "extracting" && !requirement) {
    return (
      <div className="flex justify-start pr-8" role="status">
        <div className="rounded-2xl rounded-bl-sm bg-card px-4 py-2.5 text-sm text-muted ring-1 ring-border/60">
          正在理解你的需求…
        </div>
      </div>
    );
  }

  const isBusy = status === "extracting" || status === "validating" || status === "generating";

  if ((status === "needs_clarification" || (status === "extracting" && state.lastStable === "needs_clarification")) && questions.length > 0) {
    return (
      <section className={cardClass} aria-label="补充穿搭需求">
        <div className="space-y-3">
          {questions.map((question) => (
            <div key={question.field}>
              <p className="font-medium">{question.question}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {question.options.map((option) => (
                  <button
                    key={`${option.field}-${option.value}`}
                    type="button"
                    disabled={isBusy}
                    onClick={() => onOption(option)}
                    className={chipClass}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          {status === "extracting" ? "正在合并你的补充…" : "也可以直接在下方输入框回答。"}
        </p>
        {message && <p className="mt-2 text-xs text-red-700" role="alert">{message}</p>}
        <div className="mt-2 flex justify-end gap-1">
          <button type="button" onClick={onSkip} disabled={isBusy} className={ghostButtonClass}>
            跳过，直接确认
          </button>
          <button type="button" onClick={onCancel} disabled={isBusy} className={ghostButtonClass}>
            取消
          </button>
        </div>
      </section>
    );
  }

  if (!requirement) return null;

  const confirmLabel =
    status === "validating" ? "校验中…" : status === "generating" ? "生成中…" : "确认生成";

  const weatherText = weather?.summary
    ? `${weather.summary.locationName ?? ""}${weather.summary.locationName ? " · " : ""}${weather.summary.condition} · ${Math.round(weather.summary.temperatureC)}°C`
    : weather?.note ?? null;

  return (
    <section className={cardClass} aria-label="需求确认">
      <p className="font-medium">我理解的需求是：</p>
      <dl className="mt-2 text-sm">
        <Row label="地点" value={describeLocation(requirement)} />
        <Row label="日期" value={requirement.date ? formatDateLabel(requirement.date) : "未指定"} />
        <Row label="场景" value={requirement.occasion ? OCCASION_LABELS[requirement.occasion] : "未指定"} />
        <Row label="活动" value={requirement.activity ? ACTIVITY_LABELS[requirement.activity] : null} />
        <Row label="风格" value={describeStyle(requirement)} />
        <Row label="时长" value={requirement.duration ? DURATION_LABELS[requirement.duration] : null} />
        <Row
          label="特殊需求"
          value={
            requirement.specialRequirements.length
              ? requirement.specialRequirements.map((s) => SPECIAL_REQUIREMENT_LABELS[s]).join("、")
              : null
          }
        />
        <Row label="避免" value={requirement.dislikedStyles.length ? requirement.dislikedStyles.join("、") : null} />
        <Row
          label="其他偏好"
          value={requirement.semanticPreferences?.length ? requirement.semanticPreferences.join("、") : null}
        />
        <Row
          label="排除单品"
          value={requirement.dislikedItemIds.length ? `${requirement.dislikedItemIds.length} 件` : null}
        />
        <Row label="天气" value={weatherText} />
      </dl>

      {requirement.assumptions.length > 0 && (
        <div className="mt-2 rounded-xl bg-accent/60 px-3 py-2 text-xs text-muted">
          <p className="mb-1 font-medium text-foreground/80">我做了这些假设：</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {requirement.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
      )}

      {state.modifying && (
        <p className="mt-2 text-xs text-muted" role="status">
          请在下方输入要修改的内容，例如：改成后天、要防雨、去看展。
        </p>
      )}
      {message && <p className="mt-2 text-xs text-red-700" role="alert">{message}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={isBusy} className={ghostButtonClass}>
          取消
        </button>
        <button
          type="button"
          onClick={onModify}
          disabled={isBusy || state.modifying}
          className="rounded-full px-3.5 py-2 text-sm text-foreground ring-1 ring-border/80 transition-colors hover:bg-accent disabled:opacity-50"
        >
          修改需求
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isBusy}
          aria-busy={status === "validating" || status === "generating"}
          className="rounded-full bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </section>
  );
}
