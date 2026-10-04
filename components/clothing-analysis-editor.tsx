"use client";

import { useId, useRef, useState } from "react";
import {
  addCustomTag,
  CUSTOM_TAG_MAX_COUNT,
  CUSTOM_TAG_MAX_LENGTH,
  type CustomTagKind,
} from "@/lib/closet/custom-tags";
import type { ClosetItemFormValues, ClothingOptions } from "@/types/closet";

/**
 * 自定义标签输入：点击“＋ 自定义…”展开输入框，Enter 或“添加”按钮添加；
 * 中文输入法组字期间按 Enter 不会提交；错误就近展示；Chip 可单独删除。
 */
function CustomTagInput({
  kind,
  name,
  addLabel,
  placeholder,
  tags,
  onChange,
  disabled,
  includeHiddenInputs,
}: {
  kind: CustomTagKind;
  name: string;
  addLabel: string;
  placeholder: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  includeHiddenInputs?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const composingRef = useRef(false);
  const inputId = useId();
  const errorId = `${inputId}-error`;

  const commit = () => {
    if (disabled) return;
    const result = addCustomTag(tags, draft, kind);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onChange(result.tags);
    setDraft("");
    setError(null);
  };

  const remove = (tag: string) => {
    if (disabled) return;
    onChange(tags.filter((item) => item !== tag));
    setError(null);
  };

  const reachedLimit = tags.length >= CUSTOM_TAG_MAX_COUNT;

  return (
    <div className="mt-2">
      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2" data-custom-tags={kind}>
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-foreground/40 bg-card py-1 pl-3 pr-1 text-sm text-foreground"
            >
              {tag}
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(tag)}
                aria-label={`删除 ${tag}`}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {!open ? (
        <button
          type="button"
          disabled={disabled || reachedLimit}
          onClick={() => setOpen(true)}
          className="min-h-11 rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          ＋ {addLabel}
        </button>
      ) : (
        <div>
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="text"
              value={draft}
              disabled={disabled}
              maxLength={CUSTOM_TAG_MAX_LENGTH * 4}
              placeholder={placeholder}
              aria-label={addLabel}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              enterKeyHint="done"
              autoComplete="off"
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                // 输入法组字中的 Enter 用于确认候选词，不能提交
                if (event.nativeEvent.isComposing || composingRef.current || event.keyCode === 229) {
                  return;
                }
                // 阻止外层表单提交
                event.preventDefault();
                commit();
              }}
              className="min-w-0 flex-1 rounded-2xl border border-border bg-card px-3.5 py-2 text-base text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-60"
            />
            <button
              type="button"
              disabled={disabled || !draft.trim() || reachedLimit}
              onClick={commit}
              className="min-h-11 shrink-0 rounded-2xl bg-foreground px-3.5 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              添加
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                setDraft("");
                setError(null);
              }}
              className="min-h-11 shrink-0 rounded-2xl px-2.5 text-sm text-muted hover:text-foreground"
            >
              收起
            </button>
          </div>
          {error ? (
            <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-600">
              {error}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-muted">
              {`2～${CUSTOM_TAG_MAX_LENGTH} 个字，最多 ${CUSTOM_TAG_MAX_COUNT} 个`}
            </p>
          )}
        </div>
      )}

      {includeHiddenInputs &&
        tags.map((tag) => <input key={tag} type="hidden" name={name} value={tag} />)}
    </div>
  );
}

function TagSelector({
  name,
  label,
  options,
  selected,
  onChange,
  disabled,
  includeHiddenInputs,
  children,
}: {
  name: string;
  label: string;
  options: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  includeHiddenInputs?: boolean;
  children?: React.ReactNode;
}) {
  const toggle = (tag: string) => {
    if (disabled) return;
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
              disabled={disabled}
              onClick={() => toggle(tag)}
              className={`min-h-11 rounded-full px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ${
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
      {includeHiddenInputs &&
        selected.map((tag) => (
          <input key={tag} type="hidden" name={name} value={tag} />
        ))}
      {children}
    </div>
  );
}

export function ClothingAnalysisEditor({
  idPrefix,
  values,
  options,
  onChange,
  disabled = false,
  readOnly = false,
  includeHiddenInputs = false,
}: {
  idPrefix: string;
  values: ClosetItemFormValues;
  options: ClothingOptions;
  onChange?: (values: ClosetItemFormValues) => void;
  disabled?: boolean;
  readOnly?: boolean;
  includeHiddenInputs?: boolean;
}) {
  const isLocked = disabled || readOnly;

  const update = (patch: Partial<ClosetItemFormValues>) => {
    if (!onChange || isLocked) return;
    onChange({ ...values, ...patch });
  };

  if (readOnly) {
    return (
      <div className="space-y-2 rounded-2xl bg-accent/50 px-3 py-3 text-sm text-foreground">
        <p className="font-medium">{values.name || "未命名"}</p>
        <p className="text-muted">
          {[values.category, values.color, values.material]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
        {(values.style_tags.length > 0 ||
          values.season_tags.length > 0 ||
          values.occasion_tags.length > 0 ||
          (values.custom_style_tags ?? []).length > 0 ||
          (values.custom_occasion_tags ?? []).length > 0) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[
              ...values.style_tags,
              ...values.season_tags,
              ...values.occasion_tags,
            ].map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-card px-2.5 py-1 text-xs text-foreground ring-1 ring-border/60"
              >
                {tag}
              </span>
            ))}
            {[
              ...(values.custom_style_tags ?? []),
              ...(values.custom_occasion_tags ?? []),
            ].map((tag) => (
              <span
                key={`custom-${tag}`}
                className="rounded-full border border-dashed border-foreground/40 bg-card px-2.5 py-1 text-xs text-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {values.notes && (
          <p className="pt-1 text-xs leading-relaxed text-muted">{values.notes}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor={`${idPrefix}-name`}
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          名称
        </label>
        <input
          id={`${idPrefix}-name`}
          name={includeHiddenInputs ? "name" : undefined}
          type="text"
          required
          disabled={isLocked}
          value={values.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="例如：白色棉质 T 恤"
          className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-60 sm:text-sm"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-category`}
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          分类
        </label>
        <select
          id={`${idPrefix}-category`}
          name={includeHiddenInputs ? "category" : undefined}
          required
          disabled={isLocked}
          value={values.category}
          onChange={(e) => update({ category: e.target.value })}
          className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-60 sm:text-sm"
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
          <label
            htmlFor={`${idPrefix}-color`}
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            颜色
          </label>
          <input
            id={`${idPrefix}-color`}
            name={includeHiddenInputs ? "color" : undefined}
            type="text"
            disabled={isLocked}
            value={values.color}
            onChange={(e) => update({ color: e.target.value })}
            placeholder="白色"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-60 sm:text-sm"
          />
        </div>
        <div>
          <label
            htmlFor={`${idPrefix}-material`}
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            材质
          </label>
          <input
            id={`${idPrefix}-material`}
            name={includeHiddenInputs ? "material" : undefined}
            type="text"
            disabled={isLocked}
            value={values.material}
            onChange={(e) => update({ material: e.target.value })}
            placeholder="棉"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-60 sm:text-sm"
          />
        </div>
      </div>

      <TagSelector
        name="style_tags"
        label="风格标签"
        options={options.styleTags}
        selected={values.style_tags}
        onChange={(style_tags) => update({ style_tags })}
        disabled={isLocked}
        includeHiddenInputs={includeHiddenInputs}
      >
        <CustomTagInput
          kind="style"
          name="custom_style_tags"
          addLabel="自定义标签"
          placeholder="例如：法式松弛感"
          tags={values.custom_style_tags ?? []}
          onChange={(custom_style_tags) => update({ custom_style_tags })}
          disabled={isLocked}
          includeHiddenInputs={includeHiddenInputs}
        />
      </TagSelector>
      <TagSelector
        name="season_tags"
        label="季节"
        options={options.seasonTags}
        selected={values.season_tags}
        onChange={(season_tags) => update({ season_tags })}
        disabled={isLocked}
        includeHiddenInputs={includeHiddenInputs}
      />
      <TagSelector
        name="occasion_tags"
        label="适合场景"
        options={options.occasionTags}
        selected={values.occasion_tags}
        onChange={(occasion_tags) => update({ occasion_tags })}
        disabled={isLocked}
        includeHiddenInputs={includeHiddenInputs}
      >
        <CustomTagInput
          kind="occasion"
          name="custom_occasion_tags"
          addLabel="自定义场景"
          placeholder="例如：咖啡馆拍照"
          tags={values.custom_occasion_tags ?? []}
          onChange={(custom_occasion_tags) => update({ custom_occasion_tags })}
          disabled={isLocked}
          includeHiddenInputs={includeHiddenInputs}
        />
      </TagSelector>

      <div>
        <label
          htmlFor={`${idPrefix}-notes`}
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          备注
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          name={includeHiddenInputs ? "notes" : undefined}
          rows={3}
          disabled={isLocked}
          value={values.notes}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder="例如：偏宽松，适合叠穿"
          className="w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-60 sm:text-sm"
        />
      </div>
    </div>
  );
}
