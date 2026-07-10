export type ShoppingIntent = {
  isShoppingCheck: boolean;
};

const SHOPPING_KEYWORDS = [
  "值得买吗",
  "买不买",
  "该不该买",
  "要不要买",
  "适合我买吗",
  "帮我看看商品",
  "看看这件商品",
  "购物搭配",
  "购物助手",
  "想买这件",
  "这件值得买",
  "买这件",
  "能不能搭我的衣橱",
  "能搭我的衣橱",
] as const;

const SHOPPING_PATTERNS = [
  /值得买吗/,
  /买不买/,
  /该不该买/,
  /要不要买/,
  /适合我买吗/,
  /帮我看看.{0,8}商品/,
  /看看.{0,8}商品/,
  /这件.{0,12}买/,
  /商品.{0,6}值得买/,
  /能不能搭.{0,6}衣橱/,
  /能搭.{0,6}衣橱/,
] as const;

export function detectShoppingIntent(text: string): ShoppingIntent {
  const normalized = text.trim();
  if (!normalized) {
    return { isShoppingCheck: false };
  }

  const hasKeyword = SHOPPING_KEYWORDS.some((keyword) =>
    normalized.includes(keyword)
  );
  const hasPattern = SHOPPING_PATTERNS.some((pattern) =>
    pattern.test(normalized)
  );

  return { isShoppingCheck: hasKeyword || hasPattern };
}

export function buildShoppingGuideMessage(): {
  content: string;
  actionHref: string;
} {
  return {
    content:
      "我可以帮你分析商品是否值得买，请前往购物助手上传商品图片。",
    actionHref: "/shopping",
  };
}
