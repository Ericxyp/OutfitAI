import Link from "next/link";
import { redirect } from "next/navigation";
import {
  PAGE_COPY,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { DemoBanner, PageHeader } from "@/components/ui/page-states";

const MENU_ITEMS = [
  { label: "演示指南", href: "/demo" },
  { label: PAGE_COPY.profile.preferences, href: "#" },
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
