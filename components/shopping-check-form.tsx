"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  createShoppingCheck,
  type ShoppingCheckResult,
} from "@/lib/actions/shopping";
import { formatProductPriceRange } from "@/lib/commerce/product-recommendations";
import { sanitizeVisibleAiText } from "@/lib/text/sanitize-visible-ai-text";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const PURCHASE_LABELS: Record<
  ShoppingCheckResult["purchaseRecommendation"],
  { label: string; className: string }
> = {
  buy: {
    label: "推荐购买",
    className: "bg-emerald-50 text-emerald-800 ring-emerald-100",
  },
  consider: {
    label: "谨慎考虑",
    className: "bg-amber-50 text-amber-800 ring-amber-100",
  },
  skip: {
    label: "不建议购买",
    className: "bg-red-50 text-red-800 ring-red-100",
  },
};

function OutfitIdeaCard({
  idea,
}: {
  idea: ShoppingCheckResult["outfitIdeas"][number];
}) {
  const title = sanitizeVisibleAiText(idea.title);
  const summary = sanitizeVisibleAiText(idea.summary);

  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/60">
      <p className="text-sm font-medium text-foreground">{title}</p>

      {idea.items.length > 0 && (
        <div className="mt-3 flex gap-2.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {idea.items.map((item) => (
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
      )}

      <p className="mt-3 text-sm leading-relaxed text-foreground">{summary}</p>
    </div>
  );
}

function RecommendedProductCard({
  product,
  shoppingCheckId,
}: {
  product: ShoppingCheckResult["recommendedProducts"][number];
  shoppingCheckId: string;
}) {
  const [isClicking, setIsClicking] = useState(false);
  const [clickError, setClickError] = useState<string | null>(null);

  const handlePurchaseClick = async () => {
    if (isClicking) return;

    setIsClicking(true);
    setClickError(null);
    try {
      const response = await fetch("/api/commerce/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productRecommendationId: product.id,
          shoppingCheckId,
          targetUrl: product.productUrl,
          source: "shopping_check",
        }),
      });

      const data = (await response.json()) as
        | { success: true; redirectUrl: string }
        | { success: false; error: string };

      if (!response.ok || !data.success) {
        throw new Error(
          "success" in data && !data.success
            ? data.error
            : "跳转失败，请稍后重试"
        );
      }

      window.open(data.redirectUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setClickError(
        error instanceof Error ? error.message : "跳转失败，请稍后重试"
      );
    } finally {
      setIsClicking(false);
    }
  };

  return (
    <div className="rounded-2xl bg-background p-4 ring-1 ring-border/60">
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-accent ring-1 ring-border/40">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted">
              暂无图片
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{product.title}</p>
          <p className="mt-1 text-xs text-muted">
            {[product.brand, product.merchant].filter(Boolean).join(" · ") ||
              "合作商品"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {[product.category, product.color].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-xs text-muted">
            {formatProductPriceRange(product.priceMin, product.priceMax)}
          </p>
        </div>
      </div>

      {product.matchReasons && product.matchReasons.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          推荐原因：{product.matchReasons.slice(0, 2).join("；")}
        </p>
      )}

      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          void handlePurchaseClick();
        }}
        disabled={isClicking}
        className="mt-3 w-full rounded-2xl bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isClicking ? "跳转中..." : "去购买"}
      </button>

      {clickError && (
        <p className="mt-2 text-xs text-red-600">{clickError}</p>
      )}
    </div>
  );
}

export function ShoppingCheckForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [brand, setBrand] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsMoreClothes, setNeedsMoreClothes] = useState(false);
  const [result, setResult] = useState<ShoppingCheckResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setError("图片超过 5MB");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
    setResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || !selectedFile) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setNeedsMoreClothes(false);

    const formData = new FormData();
    formData.append("image", selectedFile);
    if (productName.trim()) {
      formData.append("productName", productName.trim());
    }
    if (price.trim()) {
      formData.append("price", price.trim());
    }
    if (brand.trim()) {
      formData.append("brand", brand.trim());
    }
    if (productUrl.trim()) {
      formData.append("productUrl", productUrl.trim());
    }
    if (question.trim()) {
      formData.append("question", question.trim());
    }

    const response = await createShoppingCheck(formData);
    setIsLoading(false);

    if (!response.success) {
      setError(response.error);
      setNeedsMoreClothes(Boolean(response.needsMoreClothes));
      return;
    }

    setResult(response.result);
  };

  const purchaseMeta = result
    ? PURCHASE_LABELS[result.purchaseRecommendation]
    : null;

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60"
      >
        <div>
          <label className="mb-1.5 block text-xs text-muted">商品图片</label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-background px-4 py-8 transition-colors hover:bg-accent disabled:opacity-60"
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="商品预览"
                className="max-h-56 w-full rounded-xl object-contain"
              />
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">
                  点击上传商品图片
                </p>
                <p className="mt-1 text-xs text-muted">
                  支持常见图片格式，最大 5MB
                </p>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-muted">
            商品名称（可选）
          </label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="例如：米色针织开衫"
            disabled={isLoading}
            className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none disabled:opacity-60"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs text-muted">
              价格（可选）
            </label>
            <input
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="¥299"
              disabled={isLoading}
              className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted">
              品牌（可选）
            </label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="品牌名"
              disabled={isLoading}
              className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none disabled:opacity-60"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-muted">
            商品链接（可选，仅备注）
          </label>
          <input
            type="text"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            placeholder="商品页面链接或购买渠道"
            disabled={isLoading}
            className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none disabled:opacity-60"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-muted">
            我想知道（可选）
          </label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="适合我买吗？"
            disabled={isLoading}
            className="w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/80 placeholder:text-muted focus:outline-none disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !selectedFile}
          className="w-full rounded-2xl bg-foreground py-3.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isLoading ? "分析中…" : "分析是否值得买"}
        </button>
      </form>

      {error && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 ring-1 ring-red-100">
          <p className="text-sm text-red-700">{error}</p>
          {needsMoreClothes && (
            <Link
              href="/closet/new"
              className="mt-2 inline-block text-sm font-medium text-red-800 underline-offset-2 hover:underline"
            >
              去添加衣服 →
            </Link>
          )}
        </div>
      )}

      {result && purchaseMeta && (
        <div className="space-y-4">
          <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
            <h2 className="text-sm font-medium text-foreground">商品分析</h2>
            <div className="mt-3 flex gap-4">
              {result.productImageUrl && (
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-accent ring-1 ring-border/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.productImageUrl}
                    alt={result.product.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium text-foreground">
                  {sanitizeVisibleAiText(result.product.name)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {result.product.category}
                  {result.product.color ? ` · ${result.product.color}` : ""}
                  {result.product.material
                    ? ` · ${result.product.material}`
                    : ""}
                  {result.product.season
                    ? ` · ${result.product.season}`
                    : ""}
                  {result.product.silhouette
                    ? ` · ${result.product.silhouette}`
                    : ""}
                </p>
                {result.product.style_tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {result.product.style_tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-accent px-2.5 py-1 text-xs text-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-card p-5 text-center shadow-sm ring-1 ring-border/60">
            <p className="text-xs text-muted">推荐指数</p>
            <p className="mt-1 text-5xl font-semibold tracking-tight text-foreground">
              {result.compatibilityScore}
            </p>
            <p className="mt-2 text-sm text-muted">满分 100</p>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div
              className={`rounded-2xl px-4 py-3 text-center shadow-sm ring-1 ${purchaseMeta.className}`}
            >
              <p className="text-xs opacity-80">推荐购买</p>
              <p className="mt-1 text-sm font-semibold">{purchaseMeta.label}</p>
            </div>
            <div className="rounded-2xl bg-card px-4 py-3 text-center shadow-sm ring-1 ring-border/60">
              <p className="text-xs text-muted">可以搭配</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                预计可搭配 {result.matchCount} 套
              </p>
            </div>
          </section>

          {result.suitableStyles.length > 0 && (
            <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
              <h2 className="mb-3 text-sm font-medium text-foreground">
                适合风格
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {result.suitableStyles.map((style, index) => (
                  <span
                    key={`${style}-${index}`}
                    className="rounded-full bg-accent px-2.5 py-1 text-xs text-foreground"
                  >
                    {sanitizeVisibleAiText(style)}
                  </span>
                ))}
              </div>
            </section>
          )}

          {result.reasons.length > 0 && (
            <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
              <h2 className="mb-3 text-sm font-medium text-foreground">原因</h2>
              <ul className="space-y-2">
                {result.reasons.map((reason, index) => (
                  <li
                    key={`reason-${index}`}
                    className="text-sm leading-relaxed text-foreground"
                  >
                    · {sanitizeVisibleAiText(reason)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.risks.length > 0 && (
            <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
              <h2 className="mb-3 text-sm font-medium text-foreground">风险</h2>
              <ul className="space-y-2">
                {result.risks.map((risk, index) => (
                  <li
                    key={`risk-${index}`}
                    className="text-sm leading-relaxed text-foreground/90"
                  >
                    · {sanitizeVisibleAiText(risk)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.outfitIdeas.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">
                可搭配组合
              </h2>
              {result.outfitIdeas.map((idea, index) => (
                <OutfitIdeaCard key={`idea-${index}`} idea={idea} />
              ))}
            </section>
          )}

          {result.recommendedProducts.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">
                可以看看这些单品
              </h2>
              <p className="text-xs text-muted">
                基于本次商品分析与你的风格偏好，从商品库中为你挑选了可进一步了解的外部单品。
              </p>
              {result.recommendedProducts.map((product) => (
                <RecommendedProductCard
                  key={product.id}
                  product={product}
                  shoppingCheckId={result.id}
                />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
