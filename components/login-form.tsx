"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mapAuthError, isLikelyNetworkError } from "@/lib/auth/auth-errors";
import { getSafeNextPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

const URL_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: "登录链接已失效或已使用，请返回登录页重新登录。",
  otp_verify_failed: "登录链接验证失败，请返回登录页重新登录。",
};

type AuthMode = "login" | "signup";

export function LoginForm({
  next,
  urlError,
  urlErrorDetail,
}: {
  next?: string;
  urlError?: string;
  urlErrorDetail?: string;
}) {
  const router = useRouter();
  const safeNext = getSafeNextPath(next);

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const urlErrorMessage = urlError ? URL_ERROR_MESSAGES[urlError] : null;

  const switchMode = (nextMode: AuthMode) => {
    if (pending || nextMode === mode) return;
    setMode(nextMode);
    setError(null);
    setSuccess(null);
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;

    setError(null);
    setSuccess(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("请输入邮箱地址");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`密码至少需要 ${MIN_PASSWORD_LENGTH} 位`);
      return;
    }

    setPending(true);

    try {
      const supabase = createClient();

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });

        if (signUpError) {
          setError(mapAuthError(signUpError, "signup"));
          return;
        }

        if (!data.session) {
          setSuccess(
            "账号已创建，但尚未建立登录会话。请联系管理员检查邮箱确认设置。"
          );
          return;
        }

        router.replace(safeNext);
        router.refresh();
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        setError(mapAuthError(signInError, "login"));
        return;
      }

      router.replace(safeNext);
      router.refresh();
    } catch (caught) {
      if (isLikelyNetworkError(caught)) {
        setError("暂时无法连接登录服务，请稍后重试。");
      } else {
        if (process.env.NODE_ENV === "development") {
          console.error("[auth] unexpected error", caught);
        }
        setError(
          mode === "signup"
            ? "注册失败，请稍后重试。"
            : "登录失败，请检查邮箱和密码。"
        );
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-foreground">
          {mode === "login" ? "登录 OutfitAI" : "创建 OutfitAI 账号"}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {mode === "login"
            ? "使用邮箱和密码登录。"
            : "注册后即可开始建立你的数字衣橱。"}
        </p>
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm text-foreground">
          邮箱
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          disabled={pending}
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-60"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm text-foreground"
        >
          密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete={
            mode === "login" ? "current-password" : "new-password"
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`至少 ${MIN_PASSWORD_LENGTH} 位`}
          disabled={pending}
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-60"
        />
      </div>

      {urlErrorMessage && (
        <div className="space-y-1" role="alert">
          <p className="text-sm text-red-500">{urlErrorMessage}</p>
          {urlErrorDetail && process.env.NODE_ENV === "development" && (
            <p className="text-xs text-red-400">详情：{urlErrorDetail}</p>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      {success && (
        <p
          className="rounded-2xl bg-accent px-4 py-3 text-sm leading-relaxed text-foreground"
          role="status"
        >
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-foreground py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {mode === "login"
          ? pending
            ? "登录中…"
            : "登录"
          : pending
            ? "注册中…"
            : "创建账号"}
      </button>

      <button
        type="button"
        disabled={pending}
        onClick={() => switchMode(mode === "login" ? "signup" : "login")}
        className="w-full py-1 text-center text-sm text-muted transition-opacity hover:text-foreground disabled:opacity-60"
      >
        {mode === "login" ? "没有账号？创建账号" : "已有账号？返回登录"}
      </button>
    </form>
  );
}
