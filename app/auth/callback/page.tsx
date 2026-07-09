"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const handled = useRef(false);
  const [message, setMessage] = useState("正在登录…");

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    async function completeAuth() {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type") as EmailOtpType | null;
      const code = params.get("code");
      const next = params.get("next") ?? "/";

      const supabase = createClient();

      if (tokenHash && type) {
        setMessage("正在验证登录链接…");
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        });

        if (error) {
          router.replace(
            `/login?error=otp_verify_failed&msg=${encodeURIComponent(error.message)}`
          );
          return;
        }

        router.replace(next);
        router.refresh();
        return;
      }

      if (code) {
        setMessage("正在完成登录…");
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          router.replace(
            `/login?error=auth_callback_failed&msg=${encodeURIComponent(error.message)}`
          );
          return;
        }

        router.replace(next);
        router.refresh();
        return;
      }

      router.replace(
        `/login?error=auth_callback_failed&msg=${encodeURIComponent(
          "缺少 token_hash 或 code 参数，请检查 Supabase 邮件模板与 Redirect URLs"
        )}`
      );
    }

    void completeAuth();
  }, [router]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}
