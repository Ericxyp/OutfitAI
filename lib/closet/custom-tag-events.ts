/**
 * 自定义标签埋点（服务端内部使用，不是 Server Action，客户端无法直接调用）。
 */
import { trackEvent } from "@/lib/analytics/track-event";
import {
  buildCustomTagEventMetadata,
  type CustomTagErrorType,
  type CustomTagEventSource,
} from "@/lib/closet/custom-tags";

/** 自定义标签埋点：只记录数量与枚举，不记录标签原文 */
export async function trackCustomTagChange(input: {
  userId: string;
  itemId: string;
  source: CustomTagEventSource;
  previousCount: number;
  customStyleTags: string[];
  customOccasionTags: string[];
  embeddingUpdated: boolean;
  validationErrorType: CustomTagErrorType | null;
}): Promise<void> {
  const currentCount = input.customStyleTags.length + input.customOccasionTags.length;
  const metadata = buildCustomTagEventMetadata({
    customStyleTags: input.customStyleTags,
    customOccasionTags: input.customOccasionTags,
    source: input.source,
    embeddingUpdated: input.embeddingUpdated,
    validationErrorType: input.validationErrorType,
  });
  if (currentCount > 0 && currentCount >= input.previousCount) {
    await trackEvent({
      userId: input.userId,
      eventName: "closet_custom_tags_saved",
      entityType: "closet_item",
      entityId: input.itemId,
      metadata,
    });
  } else if (currentCount < input.previousCount) {
    await trackEvent({
      userId: input.userId,
      eventName: "closet_custom_tags_removed",
      entityType: "closet_item",
      entityId: input.itemId,
      metadata,
    });
  }
}

