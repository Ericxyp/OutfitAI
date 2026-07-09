"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const URL_ERROR_MESSAGES: Record<string, string> = {
  auth_callback_failed: "登录链接已失效或已使用，请重新获取登录链接。",
  otp_verify_failed: "登录链接验证失败，请重新获取登录链接。",
};

export function LoginForm({
  urlError,
  urlErrorDetail,
}: {
  urlError?: string;
  urlErrorDetail?: string;
}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const urlErrorMessage = urlError ? URL_ERROR_MESSAGES[urlError] : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError("请输入邮箱地址");
      return;
    }

    setPending(true);

    const supabase = createClient();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3000");

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
        shouldCreateUser: true,
      },
    });

    setPending(false);

    if (otpError) {
      setError(`发送失败：${otpError.message}`);
      return;
    }

    setSuccess("登录邮件已发送，请查收邮箱并点击 Sign in 完成登录。");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10"
        />
      </div>

      {urlErrorMessage && (
        <div className="space-y-1">
          <p className="text-sm text-red-500">{urlErrorMessage}</p>
          {urlErrorDetail && (
            <p className="text-xs text-red-400">详情：{urlErrorDetail}</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {success && (
        <p className="rounded-2xl bg-accent px-4 py-3 text-sm leading-relaxed text-foreground">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-foreground py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "发送中…" : "获取登录链接"}
      </button>
    </form>
  );
}
