import { redirect } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui/page-states";
import {
  getEventLabel,
  getFailureReasonLabel,
  normalizeFailureReason,
} from "@/lib/analytics/event-schema";
import { getUserMetrics } from "@/lib/analytics/get-metrics";
import { createClient } from "@/lib/supabase/server";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatScore(value: number | null, digits = 0) {
  if (value === null) return "—";
  if (digits > 0) {
    return value.toFixed(digits);
  }
  return `${Math.round(value)}%`;
}

function formatDateLabel(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEventDetail(metadata: Record<string, unknown>) {
  const parts: string[] = [];

  if (typeof metadata.feedbackType === "string") {
    const labels: Record<string, string> = {
      like: "喜欢",
      dislike: "不喜欢",
      save: "收藏",
    };
    parts.push(labels[metadata.feedbackType] ?? metadata.feedbackType);
  }

  if (typeof metadata.reason === "string") {
    parts.push(getFailureReasonLabel(normalizeFailureReason(metadata.reason)));
  }

  if (typeof metadata.destination === "string") {
    parts.push(metadata.destination);
  }

  if (typeof metadata.rating === "number") {
    parts.push(`${metadata.rating} 分`);
  }

  if (typeof metadata.compatibilityScore === "number") {
    parts.push(`匹配度 ${metadata.compatibilityScore}%`);
  }

  if (typeof metadata.category === "string") {
    parts.push(metadata.category);
  }

  return parts.length > 0 ? parts.join(" · ") : "已完成";
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl bg-background px-3 py-4 text-center">
      <p className="text-lg font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

export default async function MetricsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile/metrics");
  }

  const metrics = await getUserMetrics(user.id);

  const hasData =
    metrics.recentEvents.length > 0 ||
    metrics.totalClosetItems > 0 ||
    metrics.totalOutfitGenerated > 0;

  const hasTrendData = metrics.acceptanceTrend.some(
    (point) => point.generated > 0 || point.accepted > 0
  );

  const statItems = [
    { label: "衣橱总数", value: metrics.totalClosetItems },
    { label: "推荐生成", value: metrics.totalOutfitGenerated },
    { label: "喜欢", value: metrics.totalLiked },
    { label: "收藏", value: metrics.totalSaved },
    { label: "不喜欢", value: metrics.totalDisliked },
    {
      label: "推荐接受率",
      value: formatPercent(metrics.acceptanceRate),
    },
    { label: "旅行规划", value: metrics.totalTravelPlans },
    { label: "购物分析", value: metrics.totalShoppingChecks },
    { label: "失败次数", value: metrics.totalFailures },
  ];

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pt-6 pb-6">
      <PageHeader
        title="产品数据"
        subtitle="基于 Supabase 事件日志的使用、满意度与推荐质量概览。"
        backHref="/profile"
        backLabel="返回我的"
      />

      {!hasData ? (
        <EmptyState
          icon={
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 19V5m0 14h16M8 15l3-3 3 2 4-5"
                stroke="#111111"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          title="还没有产品数据"
          description="添加衣服、生成推荐或使用旅行/购物功能后，这里会展示你的使用统计。"
          actionLabel="去添加衣服"
          actionHref="/closet/new"
        />
      ) : (
        <div className="space-y-4">
          <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
            <h2 className="text-sm font-medium text-foreground">满意度与反馈</h2>
            <p className="mt-1 text-xs text-muted">
              满意度 = (喜欢 + 收藏) / 总反馈；接受率 = (喜欢 + 收藏) / 推荐生成数
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="满意度" value={formatScore(metrics.satisfactionScore)} />
              <StatCard
                label="正向反馈"
                value={metrics.positiveFeedbackCount}
              />
              <StatCard
                label="负向反馈"
                value={metrics.negativeFeedbackCount}
              />
              <StatCard
                label="推荐接受率"
                value={formatPercent(metrics.acceptanceRate)}
              />
            </div>

            {(metrics.topPositiveReasons.length > 0 ||
              metrics.topNegativeReasons.length > 0) && (
              <div className="mt-4 space-y-3">
                {metrics.topPositiveReasons.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-muted">常见正向原因</p>
                    <div className="flex flex-wrap gap-1.5">
                      {metrics.topPositiveReasons.map((item) => (
                        <span
                          key={item.tag}
                          className="rounded-full bg-background px-2.5 py-1 text-xs text-foreground ring-1 ring-border/80"
                        >
                          {item.tag} · {item.count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {metrics.topNegativeReasons.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-muted">常见负向原因</p>
                    <div className="flex flex-wrap gap-1.5">
                      {metrics.topNegativeReasons.map((item) => (
                        <span
                          key={item.tag}
                          className="rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-600 ring-1 ring-red-100"
                        >
                          {item.tag} · {item.count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
            <h2 className="text-sm font-medium text-foreground">
              近 7 日推荐接受率趋势
            </h2>

            {!hasTrendData ? (
              <p className="mt-4 text-sm leading-relaxed text-muted">
                暂无趋势数据。生成推荐并提交反馈后，这里会展示每日接受情况。
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {metrics.acceptanceTrend.map((point) => (
                  <div
                    key={point.date}
                    className="rounded-2xl bg-background px-4 py-3 ring-1 ring-border/60"
                  >
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-foreground">
                        {formatDateLabel(point.date)}
                      </span>
                      <span className="text-xs text-muted">
                        生成 {point.generated} · 接受 {point.accepted}
                      </span>
                      <span className="shrink-0 text-sm font-medium text-foreground">
                        {formatPercent(point.acceptanceRate)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent">
                      <div
                        className="h-full rounded-full bg-foreground/70 transition-all"
                        style={{
                          width: `${Math.round(point.acceptanceRate * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
            <h2 className="text-sm font-medium text-foreground">用户效果</h2>
            <p className="mt-1 text-xs text-muted">
              实际穿着率 = 确认穿着的去重推荐数 / 推荐生成数；重新生成率 =
              重新生成事件数 / 推荐生成数；高分推荐率 = 评分 ≥ 4 / 总评分；低分推荐率 =
              评分 ≤ 2 / 总评分
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard
                label="实际穿着次数"
                value={metrics.totalWearConfirmations}
              />
              <StatCard
                label="实际穿着率"
                value={formatPercent(metrics.wearRate)}
              />
              <StatCard
                label="重新生成次数"
                value={metrics.totalRegenerations}
              />
              <StatCard
                label="重新生成率"
                value={formatPercent(metrics.regenerationRate)}
              />
              <StatCard
                label="平均推荐评分"
                value={formatScore(metrics.averageRating, 1)}
              />
              <StatCard label="评分总数" value={metrics.totalRatings} />
              <StatCard
                label="高分推荐率"
                value={formatPercent(metrics.highRatingRate)}
              />
              <StatCard
                label="低分推荐率"
                value={formatPercent(metrics.lowRatingRate)}
              />
            </div>

            {metrics.totalOutfitGenerated === 0 &&
              metrics.totalRatings === 0 &&
              metrics.totalWearConfirmations === 0 && (
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  暂无用户效果数据。生成推荐、确认穿着或提交评分后会在这里展示。
                </p>
              )}
          </section>

          <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
            <h2 className="text-sm font-medium text-foreground">购物转化</h2>
            <p className="mt-1 text-xs text-muted">
              点击率 = 商品点击次数 / 购物分析次数（仅统计点击跳转，不含成交）
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="购物分析" value={metrics.totalShoppingChecks} />
              <StatCard label="商品点击" value={metrics.totalCommerceClicks} />
              <StatCard
                label="点击率"
                value={formatPercent(metrics.shoppingToClickRate)}
              />
              <StatCard
                label="热门商品数"
                value={metrics.topClickedProducts.length}
              />
            </div>

            {metrics.topClickedProducts.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-muted">热门点击商品</p>
                <div className="space-y-2">
                  {metrics.topClickedProducts.map((item) => (
                    <div
                      key={item.productId}
                      className="rounded-2xl bg-background px-4 py-3 ring-1 ring-border/60"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-foreground">{item.title}</p>
                        <p className="shrink-0 text-xs text-muted">
                          {item.count} 次
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {metrics.topMerchants.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-muted">热门商家</p>
                <div className="flex flex-wrap gap-2">
                  {metrics.topMerchants.map((item) => (
                    <span
                      key={item.merchant}
                      className="rounded-full bg-background px-3 py-1.5 text-xs text-foreground ring-1 ring-border/80"
                    >
                      {item.merchant} · {item.count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {metrics.totalCommerceClicks === 0 &&
              metrics.topClickedProducts.length === 0 &&
              metrics.topMerchants.length === 0 && (
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  暂无购物点击数据
                </p>
              )}
          </section>

          <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
            <h2 className="text-sm font-medium text-foreground">失败原因 Top 6</h2>

            {metrics.failureReasons.length === 0 ? (
              <p className="mt-4 text-sm leading-relaxed text-muted">
                暂无失败记录。
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {metrics.failureReasons.map((item) => (
                  <span
                    key={item.reason}
                    className="rounded-full bg-background px-3 py-1.5 text-xs text-foreground ring-1 ring-border/80"
                  >
                    {item.label} · {item.count}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
            <h2 className="text-sm font-medium text-foreground">关键指标</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {statItems.map((item) => (
                <StatCard key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </section>

          {metrics.mostUsedFeatures.length > 0 && (
            <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
              <h2 className="text-sm font-medium text-foreground">常用功能</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {metrics.mostUsedFeatures.map((feature) => (
                  <span
                    key={feature.eventName}
                    className="rounded-full bg-background px-3 py-1.5 text-xs text-foreground ring-1 ring-border/80"
                  >
                    {feature.label} · {feature.count}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
            <h2 className="text-sm font-medium text-foreground">最近事件</h2>

            {metrics.recentEvents.length === 0 ? (
              <p className="mt-4 text-sm leading-relaxed text-muted">
                暂无事件记录。
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {metrics.recentEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-2xl bg-background px-4 py-3 ring-1 ring-border/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {getEventLabel(event.eventName)}
                      </p>
                      <p className="shrink-0 text-xs text-muted">
                        {formatDateTime(event.createdAt)}
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                      {formatEventDetail(event.metadata)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
