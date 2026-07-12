export function isAcceptableClothing(analysis: {
  is_clothing: boolean;
}): boolean {
  return analysis.is_clothing === true;
}

export const NON_CLOTHING_REJECTION_MESSAGE =
  "这张图片看起来不是衣物、鞋包或配饰，暂时不能加入衣橱。";

export function getClothingRejectionError(analysis: {
  rejection_reason?: string;
}): string {
  const reason = analysis.rejection_reason?.trim();
  return reason || NON_CLOTHING_REJECTION_MESSAGE;
}
