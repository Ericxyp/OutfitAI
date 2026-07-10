import { createClient } from "@/lib/supabase/server";
import type { UserPersonalProfile } from "@/types/database";

export {
  AVOID_BODY_FOCUS_OPTIONS,
  FIT_GOAL_OPTIONS,
  formatPersonalProfileForPrompt,
  hasPersonalProfileData,
  PERSONAL_PROFILE_SAFETY_RULES,
  type AvoidBodyFocus,
  type FitGoal,
  type PersonalProfileContext,
  type PersonalProfileInput,
} from "@/lib/memory/personal-profile-shared";

import type { PersonalProfileContext, PersonalProfileInput } from "@/lib/memory/personal-profile-shared";

function mapRowToContext(row: UserPersonalProfile): PersonalProfileContext {
  return {
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    age: row.age,
    gender: row.gender,
    bodyNotes: row.body_notes,
    fitGoals: row.fit_goals ?? [],
    sizeNotes: row.size_notes,
    avoidBodyFocus: row.avoid_body_focus ?? [],
  };
}

export async function getUserPersonalProfile(
  userId: string
): Promise<PersonalProfileContext | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_personal_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapRowToContext(data);
  } catch (error) {
    console.error("[personalProfile] getUserPersonalProfile failed:", error);
    return null;
  }
}

export async function upsertUserPersonalProfile(
  userId: string,
  input: PersonalProfileInput
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();

  const { error } = await supabase.from("user_personal_profiles").upsert(
    {
      user_id: userId,
      height_cm: input.heightCm ?? null,
      weight_kg: input.weightKg ?? null,
      age: input.age ?? null,
      gender: input.gender?.trim() || null,
      body_notes: input.bodyNotes?.trim() || null,
      fit_goals: input.fitGoals ?? [],
      size_notes: input.sizeNotes?.trim() || null,
      avoid_body_focus: input.avoidBodyFocus ?? [],
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("[personalProfile] upsert failed:", error);
    return { success: false, error: "保存个人信息失败，请稍后重试" };
  }

  return { success: true };
}
