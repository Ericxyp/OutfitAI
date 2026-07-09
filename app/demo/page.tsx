import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

const STEPS = [
  {
    step: 1,
    title: "登录账号",
    desc: "输入邮箱，点击邮件中的链接完成登录。",
    href: "/login",
    action: "去登录",
  },
  {
    step: 2,
    title: "添加 3 件衣服",
    desc: "在衣橱页上传照片，AI 会自动识别并填充名称、分类和标签，你也可以手动修改。",
    href: "/closet/new",
    action: "去添加",
  },
  {
    step: 3,
    title: "获取 AI 推荐",
    desc: "回到首页，说说今天的场合和感觉，例如「约会想温柔一点」。",
    href: "/",
    action: "去首页",
  },
  {
    step: 4,
    title: "收藏喜欢的搭配",
    desc: "在推荐卡片下方点击「收藏」，之后可在「我的」中查看。",
    href: "/profile",
    action: "去我的",
  },
] as const;

export default function DemoPage() {
  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-8">
      <header className="mb-6 text-center">
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted">
          {APP_NAME}
        </p>
        <h1 className="text-xl font-semibold text-foreground">演示指南</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          约 3 分钟体验完整流程：登录 → 建衣橱 → AI 搭配 → 收藏
        </p>
      </header>

      <section className="mb-6 rounded-2xl bg-accent/60 px-4 py-4 ring-1 ring-border/50">
        <p className="text-sm leading-relaxed text-foreground">
          <strong>关于 AI：</strong>
          MVP 使用 Qwen3-VL-Plus 生成穿搭推荐，并识别上传的衣服图片。
        </p>
      </section>

      <ol className="mb-6 space-y-3">
        {STEPS.map((item) => (
          <li
            key={item.step}
            className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60"
          >
            <div className="flex gap-4 p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background">
                {item.step}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {item.desc}
                </p>
                <Link
                  href={item.href}
                  className="mt-3 inline-block text-sm font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {item.action} →
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/60">
        <h2 className="mb-2 text-sm font-medium text-foreground">
          快捷 Demo（Seed 数据）
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          若已在 Supabase 执行{" "}
          <code className="rounded bg-accent px-1 py-0.5 text-xs">seed.sql</code>
          ，登录对应账号后衣橱已有 5 件示例衣服，可直接从步骤 3 开始演示。
        </p>
        <p className="mt-2 text-sm text-muted">
          详见项目根目录{" "}
          <code className="rounded bg-accent px-1 py-0.5 text-xs">README.md</code>
        </p>
      </section>

      <div className="mt-6 text-center">
        <Link
          href="/"
          className="inline-block rounded-2xl bg-foreground px-8 py-3 text-sm font-medium text-background"
        >
          开始体验
        </Link>
      </div>
    </div>
  );
}
