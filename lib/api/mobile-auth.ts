import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createBearerClient } from "@/lib/supabase/bearer";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MobileAuthSuccess = {
  supabase: SupabaseClient<Database>;
  user: User;
  accessToken: string;
};

export type MobileAuthResult =
  | { ok: true; auth: MobileAuthSuccess }
  | { ok: false; response: NextResponse };

export function mobileErrorResponse(
  error: string,
  status = 400
): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function authenticateMobileRequest(
  request: Request
): Promise<MobileAuthResult> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: mobileErrorResponse("未授权，请先登录", 401),
    };
  }

  const accessToken = authHeader.slice(7).trim();

  if (!accessToken) {
    return {
      ok: false,
      response: mobileErrorResponse("未授权，请先登录", 401),
    };
  }

  try {
    const supabase = createBearerClient(accessToken);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return {
        ok: false,
        response: mobileErrorResponse("登录已失效，请重新登录", 401),
      };
    }

    return {
      ok: true,
      auth: { supabase, user, accessToken },
    };
  } catch {
    return {
      ok: false,
      response: mobileErrorResponse("鉴权失败，请稍后重试", 500),
    };
  }
}
