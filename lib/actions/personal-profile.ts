"use server";

import type { PersonalProfileInput } from "@/lib/memory/personal-profile-shared";
import { upsertUserPersonalProfile } from "@/lib/memory/personal-profile";
import { createClient } from "@/lib/supabase/server";

export type SavePersonalProfileResponse =
  | { success: true }
  | { success: false; error: string };

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStringArray(formData: FormData, key: string): string[] {
  return formData.getAll(key).map(String).filter(Boolean);
}

export async function savePersonalProfile(
  formData: FormData
): Promise<SavePersonalProfileResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "请先登录" };
  }

  const input: PersonalProfileInput = {
    heightCm: parseOptionalInt(formData.get("height_cm")),
    weightKg: parseOptionalInt(formData.get("weight_kg")),
    age: parseOptionalInt(formData.get("age")),
    gender: formData.get("gender")?.toString() ?? null,
    bodyNotes: formData.get("body_notes")?.toString() ?? null,
    fitGoals: parseStringArray(formData, "fit_goals"),
    sizeNotes: formData.get("size_notes")?.toString() ?? null,
    avoidBodyFocus: parseStringArray(formData, "avoid_body_focus"),
  };

  return upsertUserPersonalProfile(user.id, input);
}
