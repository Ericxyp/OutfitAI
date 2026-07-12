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
          使用邮箱和密码登录；首次使用请先创建账号。
        </p>

        <Suspense
          fallback={<div className="h-32 animate-pulse rounded-2xl bg-accent" />}
        >
          <LoginFormWrapper searchParams={searchParams} />
        </Suspense>
      </div>
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
    <LoginForm
      next={params.next}
      urlError={params.error}
      urlErrorDetail={params.msg}
    />
  );
}
