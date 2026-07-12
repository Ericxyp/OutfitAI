import Link from "next/link";
import { redirect } from "next/navigation";
import {
  PAGE_COPY,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { DemoBanner, PageHeader } from "@/components/ui/page-states";

const MENU_ITEMS = [
  { label: "历史记录", href: "/history" },
  { label: "产品数据", href: "/profile/metrics" },
  { label: "演示指南", href: "/demo" },
  { label: "旅行穿搭规划", href: "/travel" },
  { label: "购物助手", href: "/shopping" },
  { label: "个人信息", href: "/profile/personal" },
  { label: PAGE_COPY.profile.preferences, href: "/profile/style" },
  { label: PAGE_COPY.profile.settings, href: "#" },
] as const;

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(PAGE_COPY.errors.loadFailed);
  }

  const { count: closetCount } = await supabase
    .from("closet_items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { count: savedOutfitCount } = await supabase
    .from("feedback")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("rating", "save");

  const { count: likeCount } = await supabase
    .from("feedback")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("rating", "like");

  const { data: styleProfile } = await supabase
    .from("user_style_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const displayName =
    profile?.display_name ||
    user.user_metadata?.display_name ||
    user.email?.split("@")[0] ||
    "用户";

  const avatarInitial = displayName.slice(0, 1).toUpperCase();
  const email = profile?.email || user.email || "";
  const closetTotal = closetCount ?? 0;

  const stats = [
    { label: "衣橱", value: closetTotal },
    { label: "收藏", value: savedOutfitCount ?? 0 },
    { label: "喜欢", value: likeCount ?? 0 },
  ];

  const demoHint = PAGE_COPY.profile.demoHint(closetTotal);

  const hasStyleProfile =
    styleProfile !== null && styleProfile.feedback_count > 0;

  function renderTagList(tags: string[]) {
    if (tags.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-background px-2.5 py-1 text-xs text-foreground ring-1 ring-border/80"
          >
            {tag}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-4">
      <PageHeader
        title={PAGE_COPY.profile.title}
        subtitle={PAGE_COPY.profile.subtitle}
      />

      {demoHint && (
        <DemoBanner
          message={demoHint}
          href="/closet/new"
          linkText="去添加"
        />
      )}

      <section className="mb-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <div className="flex items-center gap-4">
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="h-14 w-14 rounded-full object-cover ring-2 ring-border/40"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-lg font-medium text-foreground">
              {avatarInitial}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-foreground">
              {displayName}
            </p>
            <p className="mt-0.5 truncate text-sm text-muted">{email}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl bg-background px-2 py-3 text-center"
            >
              <p className="text-lg font-semibold text-foreground">{stat.value}</p>
              <p className="mt-0.5 text-xs text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
        <h2 className="text-sm font-medium text-foreground">我的风格画像</h2>
        {hasStyleProfile ? (
          <div className="mt-4 space-y-4">
            {styleProfile.preferred_styles.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted">偏好风格</p>
                {renderTagList(styleProfile.preferred_styles)}
              </div>
            )}
            {styleProfile.preferred_colors.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted">偏好颜色</p>
                {renderTagList(styleProfile.preferred_colors)}
              </div>
            )}
            {styleProfile.preferred_occasions.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted">常用场景</p>
                {renderTagList(styleProfile.preferred_occasions)}
              </div>
            )}
            {(styleProfile.avoid_styles.length > 0 ||
              styleProfile.avoid_colors.length > 0) && (
              <div>
                <p className="mb-2 text-xs text-muted">避免元素</p>
                <div className="space-y-2">
                  {styleProfile.avoid_styles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {styleProfile.avoid_styles.map((tag) => (
                        <span
                          key={`avoid-style-${tag}`}
                          className="rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-600 ring-1 ring-red-100"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {styleProfile.avoid_colors.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {styleProfile.avoid_colors.map((tag) => (
                        <span
                          key={`avoid-color-${tag}`}
                          className="rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-600 ring-1 ring-red-100"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <p className="text-xs text-muted">
              已根据 {styleProfile.feedback_count} 次反馈学习你的风格偏好
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            多收藏或反馈几套穿搭后，我会逐渐了解你的风格。
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60">
        <Link
          href="/saved"
          className="flex items-center justify-between border-b border-border px-5 py-4 text-sm text-foreground transition-colors hover:bg-accent/50"
        >
          <span>{PAGE_COPY.profile.savedLink}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>

        {MENU_ITEMS.map((item) =>
          item.href.startsWith("/") ? (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center justify-between border-b border-border px-5 py-4 text-sm text-foreground transition-colors hover:bg-accent/50"
            >
              <span>{item.label}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M9 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          ) : (
            <a
              key={item.label}
              href={item.href}
              className="flex items-center justify-between border-b border-border px-5 py-4 text-sm text-foreground transition-colors hover:bg-accent/50"
            >
              <span>{item.label}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M9 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          )
        )}

        <SignOutButton />
      </section>
    </div>
  );
}
