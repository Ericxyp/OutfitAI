import { trackEvent } from "@/lib/analytics/track-event";
import {
  buildFailureMetadata,
  type AnalyticsFailureEventName,
  type AnalyticsFeature,
  type FailureReason,
} from "@/lib/analytics/event-schema";

export async function trackFailureEvent(input: {
  userId: string;
  eventName: AnalyticsFailureEventName;
  feature: AnalyticsFeature;
  reason: FailureReason;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await trackEvent({
    userId: input.userId,
    eventName: input.eventName,
    metadata: buildFailureMetadata(input.feature, input.reason, input.metadata),
  });
}
