"use client";

import type { ClosetItemFormValues, ClothingOptions } from "@/types/closet";

function TagSelector({
  name,
  label,
  options,
  selected,
  onChange,
  disabled,
  includeHiddenInputs,
}: {
  name: string;
  label: string;
  options: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  includeHiddenInputs?: boolean;
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
          values.occasion_tags.length > 0) && (
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
      />
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
      />

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
