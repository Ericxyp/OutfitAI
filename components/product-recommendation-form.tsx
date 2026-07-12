"use client";

import { useState, useTransition } from "react";
import { createProductRecommendation } from "@/lib/actions/product-recommendations";

const inputClassName =
  "w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-border/60 outline-none placeholder:text-muted focus:ring-foreground/30";

export function ProductRecommendationForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await createProductRecommendation(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSuccess("商品已新增");
      const form = document.getElementById(
        "product-create-form"
      ) as HTMLFormElement | null;
      form?.reset();
    });
  };

  return (
    <form
      id="product-create-form"
      action={handleSubmit}
      className="space-y-3 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60"
    >
      <div>
        <h2 className="text-sm font-medium text-foreground">新增商品</h2>
        <p className="mt-1 text-xs text-muted">
          Demo 管理页：登录即可维护商品库，不接真实电商后台。
        </p>
      </div>

      <input
        name="title"
        required
        placeholder="标题（必填）"
        className={inputClassName}
      />
      <input
        name="product_url"
        required
        placeholder="商品链接 product_url（必填）"
        className={inputClassName}
      />
      <input
        name="affiliate_url"
        placeholder="联盟链接 affiliate_url（可选）"
        className={inputClassName}
      />
      <input
        name="image_url"
        placeholder="图片链接 image_url（可选）"
        className={inputClassName}
      />
      <div className="grid grid-cols-2 gap-2">
        <input name="brand" placeholder="品牌" className={inputClassName} />
        <input name="merchant" placeholder="商家" className={inputClassName} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="category" placeholder="分类" className={inputClassName} />
        <input name="color" placeholder="颜色" className={inputClassName} />
      </div>
      <input
        name="style_tags"
        placeholder="风格标签，逗号分隔"
        className={inputClassName}
      />
      <input
        name="occasion_tags"
        placeholder="场景标签，逗号分隔"
        className={inputClassName}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          name="price_min"
          type="number"
          step="0.01"
          placeholder="最低价"
          className={inputClassName}
        />
        <input
          name="price_max"
          type="number"
          step="0.01"
          placeholder="最高价"
          className={inputClassName}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-foreground">{success}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-foreground py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isPending ? "保存中..." : "新增商品"}
      </button>
    </form>
  );
}
