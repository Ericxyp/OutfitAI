import { Suspense } from "react";
import { APP_NAME } from "@/lib/constants";
import { LoginForm } from "@/components/login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; msg?: string }>;
}) {
  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <header className="mb-8 text-center">
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted">
          {APP_NAME}
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          登录 / 注册 OutfitAI
        </h1>
      </header>

      <div className="mx-auto w-full max-w-sm rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60">
        <p className="mb-6 text-sm leading-relaxed text-muted">
          输入邮箱后，我们会发送登录邮件。点击邮件中的 Sign in 即可完成登录或注册。
        </p>

        <Suspense
          fallback={<div className="h-32 animate-pulse rounded-2xl bg-accent" />}
        >
          <LoginFormWrapper searchParams={searchParams} />
        </Suspense>
      </div>

      <aside className="mx-auto mt-6 max-w-sm space-y-3 rounded-2xl bg-accent/50 px-4 py-3 ring-1 ring-border/40">
        <div>
          <p className="mb-1 text-xs font-medium text-foreground">
            Supabase 邮件模板（必改一次）
          </p>
          <p className="text-xs leading-relaxed text-muted">
            默认模板经 Supabase 中转并使用 PKCE，容易在邮件客户端里登录失败。请把 Magic
            Link 模板改为直接跳转到本应用的 token 链接。
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-foreground">操作步骤</p>
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted">
            <li>
              Supabase → Authentication → Email Templates →{" "}
              <strong className="text-foreground">Magic Link</strong>
            </li>
            <li>
              Authentication → URL Configuration：Site URL 设为{" "}
              <code className="rounded bg-background px-1">http://localhost:3000</code>
            </li>
            <li>Body 替换为下方模板，Save 后重新获取登录链接</li>
          </ol>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-foreground">Body 模板（复制粘贴）</p>
          <pre className="overflow-x-auto rounded-xl bg-background p-3 text-[11px] leading-relaxed text-foreground ring-1 ring-border/60">
{`<h2>登录 OutfitAI</h2>
<p>点击下方按钮登录，链接仅可使用一次。</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink">Sign in</a></p>`}
          </pre>
        </div>
      </aside>
    </div>
  );
}

async function LoginFormWrapper({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; msg?: string }>;
}) {
  const params = await searchParams;
  return (
    <LoginForm urlError={params.error} urlErrorDetail={params.msg} />
  );
}
