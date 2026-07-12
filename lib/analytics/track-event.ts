import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type TrackEventInput = {
  userId: string;
  eventName: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

const BLOCKED_KEY_PATTERN =
  /image_url|api[_-]?key|token|base64|authorization|password/i;
const REQUEST_TEXT_KEYS = new Set([
  "requestText",
  "request_text",
  "destination",
  "errorMessage",
  "message",
  "error",
]);
const ERROR_MESSAGE_KEYS = new Set(["stack", "stackTrace"]);

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
}

function looksLikeBase64(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(trimmed);
}

function redactSensitiveString(value: string): string {
  if (looksLikeBase64(value)) {
    return "[redacted]";
  }

  if (/https?:\/\//i.test(value) && /image|storage|supabase/i.test(value)) {
    return "[redacted]";
  }

  if (/sk-[a-z0-9]/i.test(value) || /qwen_api_key/i.test(value)) {
    return "[redacted]";
  }

  return value;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    let sanitized = redactSensitiveString(value);

    if (REQUEST_TEXT_KEYS.has(key)) {
      sanitized = truncateString(sanitized, 120);
    }

    if (ERROR_MESSAGE_KEYS.has(key)) {
      sanitized = truncateString(sanitized, 200);
    }

    return sanitized;
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        return sanitizeMetadata(item as Record<string, unknown>);
      }
      return item;
    });
  }

  if (typeof value === "object") {
    return sanitizeMetadata(value as Record<string, unknown>);
  }

  return value;
}

export function sanitizeMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (BLOCKED_KEY_PATTERN.test(key)) {
      continue;
    }

    result[key] = sanitizeValue(key, value);
  }

  return result;
}

export async function trackEvent(input: TrackEventInput): Promise<void> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.from("event_logs").insert({
      user_id: input.userId,
      event_name: input.eventName,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata: sanitizeMetadata(input.metadata ?? {}) as Json,
    });

    if (error) {
      console.warn("[analytics] trackEvent failed:", {
        eventName: input.eventName,
        message: error.message,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[analytics] trackEvent failed:", {
      eventName: input.eventName,
      message,
    });
  }
}
