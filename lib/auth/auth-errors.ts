type AuthMode = "login" | "signup";

type AuthErrorLike = {
  code?: string;
  message?: string;
  name?: string;
  status?: number;
};

function getErrorCode(error: AuthErrorLike): string {
  return (error.code ?? "").toLowerCase();
}

function getErrorMessage(error: AuthErrorLike): string {
  return (error.message ?? "").toLowerCase();
}

/**
 * 将 Supabase Auth 错误转换为简洁中文提示，不暴露内部细节。
 */
export function mapAuthError(
  error: unknown,
  mode: AuthMode
): string {
  if (!error || typeof error !== "object") {
    return mode === "signup"
      ? "注册失败，请稍后重试。"
      : "登录失败，请检查邮箱和密码。";
  }

  const authError = error as AuthErrorLike;
  const code = getErrorCode(authError);
  const message = getErrorMessage(authError);

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials")
  ) {
    return "登录失败，请检查邮箱和密码。";
  }

  if (
    code === "user_already_exists" ||
    message.includes("user already registered") ||
    message.includes("already been registered")
  ) {
    return "该邮箱可能已经注册，请返回登录。";
  }

  if (code === "signup_disabled" || message.includes("signups not allowed")) {
    return "当前暂未开放注册，请稍后再试。";
  }

  if (
    code === "weak_password" ||
    message.includes("password should be at least") ||
    message.includes("password is known")
  ) {
    return "密码强度不足，请使用至少 8 位更安全的密码。";
  }

  if (
    code === "over_email_send_rate_limit" ||
    message.includes("rate limit") ||
    message.includes("email rate")
  ) {
    return "操作过于频繁，请稍后再试。";
  }

  if (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed")
  ) {
    return "账号已创建，但尚未建立登录会话。请联系管理员检查邮箱确认设置。";
  }

  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    authError.name === "AuthRetryableFetchError"
  ) {
    return "暂时无法连接登录服务，请稍后重试。";
  }

  if (process.env.NODE_ENV === "development") {
    console.error("[auth]", {
      mode,
      code: authError.code ?? null,
      message: authError.message ?? null,
      status: authError.status ?? null,
    });
  }

  return mode === "signup"
    ? "注册失败，请稍后重试。"
    : "登录失败，请检查邮箱和密码。";
}

export function isLikelyNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const authError = error as AuthErrorLike;
  const message = getErrorMessage(authError);
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    authError.name === "AuthRetryableFetchError"
  );
}
