"use client";

import { useState, useTransition } from "react";
import {
  toggleProductRecommendationActive,
  updateProductRecommendation,
} from "@/lib/actions/product-recommendations";
import { formatProductPriceRange } from "@/lib/commerce/product-recommendations";
import type { ProductRecommendationRow } from "@/types/database";

const inputClassName =
  "w-full rounded-2xl bg-background px-3 py-2.5 text-sm text-foreground ring-1 ring-border/60 outline-none placeholder:text-muted focus:ring-foreground/30";

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProductCard({ product }: { product: ProductRecommendationRow }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await toggleProductRecommendationActive(
        product.id,
        !product.is_active
      );
      if (!result.success) {
        setError(result.error);
      }
    });
  };

  const handleUpdate = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await updateProductRecommendation(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  };

  return (
    <article className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{product.title}</p>
          <p className="mt-1 text-xs text-muted">
            {[product.merchant, product.category, product.color]
              .filter(Boolean)
              .join(" · ") || "未填写商家/分类"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {formatProductPriceRange(
              product.price_min === null ? null : Number(product.price_min),
              product.price_max === null ? null : Number(product.price_max)
            )}
            {" · "}
            {product.is_active ? "启用中" : "已停用"}
            {" · "}
            {formatCreatedAt(product.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            className="rounded-full bg-background px-3 py-1.5 text-xs text-foreground ring-1 ring-border/80 disabled:opacity-60"
          >
            {product.is_active ? "停用" : "启用"}
          </button>
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="rounded-full bg-background px-3 py-1.5 text-xs text-foreground ring-1 ring-border/80"
          >
            {editing ? "收起" : "编辑"}
          </button>
        </div>
      </div>

      {editing && (
        <form action={handleUpdate} className="mt-4 space-y-2">
          <input type="hidden" name="id" value={product.id} />
          <input
            name="title"
            required
            defaultValue={product.title}
            className={inputClassName}
          />
          <input
            name="product_url"
            required
            defaultValue={product.product_url}
            className={inputClassName}
          />
          <input
            name="affiliate_url"
            defaultValue={product.affiliate_url ?? ""}
            placeholder="affiliate_url"
            className={inputClassName}
          />
          <input
            name="image_url"
            defaultValue={product.image_url ?? ""}
            placeholder="image_url"
            className={inputClassName}
          />
          <input
            name="merchant"
            defaultValue={product.merchant ?? ""}
            placeholder="商家"
            className={inputClassName}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              name="price_min"
              type="number"
              step="0.01"
              defaultValue={product.price_min ?? ""}
              placeholder="最低价"
              className={inputClassName}
            />
            <input
              name="price_max"
              type="number"
              step="0.01"
              defaultValue={product.price_max ?? ""}
              placeholder="最高价"
              className={inputClassName}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="is_active"
              value="true"
              defaultChecked={product.is_active}
            />
            启用
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-2xl bg-foreground py-2.5 text-sm font-medium text-background disabled:opacity-60"
          >
            {isPending ? "保存中..." : "保存修改"}
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </article>
  );
}

export function ProductRecommendationList({
  products,
}: {
  products: ProductRecommendationRow[];
}) {
  if (products.length === 0) {
    return (
      <p className="rounded-2xl bg-card px-5 py-8 text-center text-sm text-muted ring-1 ring-border/60">
        暂无商品。可先运行 seed-products.sql，或在上方新增。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
