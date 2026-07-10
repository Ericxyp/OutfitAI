"use client";

import type { RecommendationResult } from "@/lib/actions/recommendation";
import { PAGE_COPY } from "@/lib/constants";
import { FeedbackButtons } from "@/components/feedback-buttons";
import { sanitizeVisibleAiText } from "@/lib/text/sanitize-visible-ai-text";

export function OutfitResultCard({
  recommendation,
  onRegenerate,
  isRegenerating,
}: {
  recommendation: RecommendationResult;
  onRegenerate: () => void;
  isRegenerating?: boolean;
}) {
  const title = sanitizeVisibleAiText(recommendation.title);
  const occasion = sanitizeVisibleAiText(recommendation.occasion);
  const summary = sanitizeVisibleAiText(recommendation.summary);
  const reasoning = sanitizeVisibleAiText(recommendation.reasoning);
  const styleTags = recommendation.styleTags.map(sanitizeVisibleAiText);
  const alternatives = recommendation.alternatives.map(sanitizeVisibleAiText);

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60">
      <div className="px-4 pt-4 pb-3">
        <p className="text-base font-semibold leading-snug text-foreground">
          {title}
        </p>
        <p className="mt-1 text-xs text-muted">
          {PAGE_COPY.outfit.occasion} · {occasion}
        </p>
      </div>

      {recommendation.items.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex gap-2.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {recommendation.items.map((item) => (
              <div key={item.id} className="w-[5.5rem] shrink-0">
                <div className="aspect-[3/4] overflow-hidden rounded-xl bg-accent ring-1 ring-border/40">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.name ?? "衣服"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">
                      暂无图片
                    </div>
                  )}
                </div>
                <p className="mt-1.5 truncate text-xs text-foreground">
                  {item.name ?? "未命名"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 border-t border-border/50 px-4 py-3">
        <div>
          <p className="mb-1 text-xs text-muted">{PAGE_COPY.outfit.summary}</p>
          <p className="text-sm leading-relaxed text-foreground">
            {summary}
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs text-muted">{PAGE_COPY.outfit.reasoning}</p>
          <p className="text-sm leading-relaxed text-foreground/90">
            {reasoning}
          </p>
        </div>

        {styleTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {styleTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-accent px-2.5 py-1 text-xs text-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {alternatives.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-muted">
              {PAGE_COPY.outfit.alternatives}
            </p>
            <ul className="space-y-1">
              {alternatives.map((alt, i) => (
                <li key={i} className="text-sm leading-relaxed text-foreground/90">
                  · {alt}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <FeedbackButtons recommendationId={recommendation.id} />

      <div className="border-t border-border/50 p-3">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="w-full rounded-xl py-2.5 text-sm text-muted transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {isRegenerating ? "搭配中…" : PAGE_COPY.outfit.regenerate}
        </button>
      </div>
    </div>
  );
}
