export const FIT_GOAL_OPTIONS = [
  "显高",
  "显瘦",
  "遮肉",
  "舒适",
  "通勤",
  "减龄",
  "成熟",
] as const;

export const AVOID_BODY_FOCUS_OPTIONS = [
  "手臂",
  "腰腹",
  "腿部",
  "肩颈",
] as const;

export type FitGoal = (typeof FIT_GOAL_OPTIONS)[number];
export type AvoidBodyFocus = (typeof AVOID_BODY_FOCUS_OPTIONS)[number];

export type PersonalProfileContext = {
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  gender: string | null;
  bodyNotes: string | null;
  fitGoals: string[];
  sizeNotes: string | null;
  avoidBodyFocus: string[];
};

export type PersonalProfileInput = {
  heightCm?: number | null;
  weightKg?: number | null;
  age?: number | null;
  gender?: string | null;
  bodyNotes?: string | null;
  fitGoals?: string[];
  sizeNotes?: string | null;
  avoidBodyFocus?: string[];
};

export const PERSONAL_PROFILE_SAFETY_RULES = `个人信息使用规范：
- 可参考用户身高、穿衣目标等信息优化搭配建议
- 不要评价用户身材好坏
- 禁止使用羞辱性表达
- 禁止直接使用「胖、矮、腿短」等负面词
- 改用「修饰比例、提升利落感、更舒适、更适合活动量」等中性正向表达`;

function formatTagList(label: string, tags: string[]): string | null {
  if (tags.length === 0) {
    return null;
  }
  return `${label}：${tags.join("、")}`;
}

export function hasPersonalProfileData(
  profile: PersonalProfileContext | null
): profile is PersonalProfileContext {
  if (!profile) {
    return false;
  }

  return (
    profile.heightCm !== null ||
    profile.weightKg !== null ||
    profile.age !== null ||
    Boolean(profile.gender?.trim()) ||
    Boolean(profile.bodyNotes?.trim()) ||
    Boolean(profile.sizeNotes?.trim()) ||
    profile.fitGoals.length > 0 ||
    profile.avoidBodyFocus.length > 0
  );
}

export function formatPersonalProfileForPrompt(
  profile: PersonalProfileContext | null
): string {
  if (!hasPersonalProfileData(profile)) {
    return "";
  }

  const lines = ["用户个人信息："];

  if (profile.heightCm !== null) {
    lines.push(`身高：${profile.heightCm} cm`);
  }

  if (profile.weightKg !== null) {
    lines.push(`体重：${profile.weightKg} kg`);
  }

  if (profile.age !== null) {
    lines.push(`年龄：${profile.age}`);
  }

  if (profile.gender?.trim()) {
    lines.push(`性别/表达：${profile.gender.trim()}`);
  }

  if (profile.bodyNotes?.trim()) {
    lines.push(`体型备注：${profile.bodyNotes.trim()}`);
  }

  const fitGoals = formatTagList("穿衣目标", profile.fitGoals);
  if (fitGoals) {
    lines.push(fitGoals);
  }

  if (profile.sizeNotes?.trim()) {
    lines.push(`尺码备注：${profile.sizeNotes.trim()}`);
  }

  const avoidFocus = formatTagList("不想强调的部位", profile.avoidBodyFocus);
  if (avoidFocus) {
    lines.push(avoidFocus);
  }

  if (lines.length === 1) {
    return "";
  }

  return lines.join("\n");
}
