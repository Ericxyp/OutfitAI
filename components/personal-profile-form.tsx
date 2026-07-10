"use client";

import { useState } from "react";
import { savePersonalProfile } from "@/lib/actions/personal-profile";
import {
  AVOID_BODY_FOCUS_OPTIONS,
  FIT_GOAL_OPTIONS,
  type PersonalProfileContext,
} from "@/lib/memory/personal-profile-shared";

function TagSelector({
  name,
  label,
  options,
  selected,
  onChange,
  disabled,
}: {
  name: string;
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (tag: string) => {
    onChange(
      selected.includes(tag)
        ? selected.filter((item) => item !== tag)
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
              disabled={disabled}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ${
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

type PersonalProfileFormProps = {
  initialProfile: PersonalProfileContext | null;
};

export function PersonalProfileForm({
  initialProfile,
}: PersonalProfileFormProps) {
  const [heightCm, setHeightCm] = useState(
    initialProfile?.heightCm?.toString() ?? ""
  );
  const [weightKg, setWeightKg] = useState(
    initialProfile?.weightKg?.toString() ?? ""
  );
  const [age, setAge] = useState(initialProfile?.age?.toString() ?? "");
  const [gender, setGender] = useState(initialProfile?.gender ?? "");
  const [bodyNotes, setBodyNotes] = useState(initialProfile?.bodyNotes ?? "");
  const [fitGoals, setFitGoals] = useState<string[]>(
    initialProfile?.fitGoals ?? []
  );
  const [sizeNotes, setSizeNotes] = useState(initialProfile?.sizeNotes ?? "");
  const [avoidBodyFocus, setAvoidBodyFocus] = useState<string[]>(
    initialProfile?.avoidBodyFocus ?? []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    const result = await savePersonalProfile(formData);

    setIsLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setSuccess("个人信息已保存，后续推荐会参考这些信息。");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60"
    >
      <p className="text-sm leading-relaxed text-muted">
        这些信息会帮助 AI 给出更贴合你的搭配建议。所有字段均为可选。
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-xs text-muted">身高（cm）</label>
          <input
            name="height_cm"
            type="number"
            min={100}
            max={230}
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            placeholder="例如 165"
            disabled={isLoading}
            className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none disabled:opacity-60"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-muted">体重（kg）</label>
          <input
            name="weight_kg"
            type="number"
            min={30}
            max={200}
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="例如 55"
            disabled={isLoading}
            className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none disabled:opacity-60"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-xs text-muted">年龄</label>
          <input
            name="age"
            type="number"
            min={10}
            max={100}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="例如 28"
            disabled={isLoading}
            className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none disabled:opacity-60"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-muted">性别/表达</label>
          <input
            name="gender"
            type="text"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            placeholder="例如 女性 / 中性表达"
            disabled={isLoading}
            className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none disabled:opacity-60"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs text-muted">体型备注</label>
        <textarea
          name="body_notes"
          value={bodyNotes}
          onChange={(e) => setBodyNotes(e.target.value)}
          placeholder="例如：肩偏宽、偏好宽松上身"
          rows={3}
          disabled={isLoading}
          className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none disabled:opacity-60"
        />
      </div>

      <TagSelector
        name="fit_goals"
        label="穿衣目标"
        options={FIT_GOAL_OPTIONS}
        selected={fitGoals}
        onChange={setFitGoals}
        disabled={isLoading}
      />

      <div>
        <label className="mb-1.5 block text-xs text-muted">尺码备注</label>
        <input
          name="size_notes"
          type="text"
          value={sizeNotes}
          onChange={(e) => setSizeNotes(e.target.value)}
          placeholder="例如：上衣 M，裤子 27"
          disabled={isLoading}
          className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none disabled:opacity-60"
        />
      </div>

      <TagSelector
        name="avoid_body_focus"
        label="不想强调的部位"
        options={AVOID_BODY_FOCUS_OPTIONS}
        selected={avoidBodyFocus}
        onChange={setAvoidBodyFocus}
        disabled={isLoading}
      />

      {error && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 ring-1 ring-red-100">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-2xl bg-accent px-4 py-3 ring-1 ring-border/60">
          <p className="text-sm text-foreground">{success}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-2xl bg-foreground py-3.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isLoading ? "保存中…" : "保存个人信息"}
      </button>
    </form>
  );
}
