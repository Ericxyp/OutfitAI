/**
 * 聊天消息的本地持久化（localStorage），按 Supabase user.id 隔离。
 *
 * - 登录用户：outfitai.chat.messages:${userId}
 * - 未登录：outfitai.chat.messages:anonymous（与任何登录账号都不共享）
 * - 旧版全局 key outfitai.chat.messages：读取时直接删除，绝不迁移到任何账号
 * - 只持久化通过运行时结构校验的消息；非法数据删除
 */
import type { RecommendationResult } from "@/types/recommendation";

export type ChatMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      isError?: boolean;
      actionHref?: string;
      actionLabel?: string;
    }
  | {
      id: string;
      role: "recommendation";
      recommendation: RecommendationResult;
    };

/** 旧版全局 key（所有账号共用，存在跨账号泄漏风险）：只删除，不迁移 */
export const CHAT_MESSAGES_STORAGE_KEY = "outfitai.chat.messages";

function isValidRecommendation(value: unknown): value is RecommendationResult {
  if (!value || typeof value !== "object") return false;

  const rec = value as Record<string, unknown>;

  return (
    typeof rec.id === "string" &&
    typeof rec.requestText === "string" &&
    typeof rec.title === "string" &&
    Array.isArray(rec.selectedItemIds) &&
    rec.selectedItemIds.every((id) => typeof id === "string") &&
    typeof rec.summary === "string" &&
    typeof rec.reasoning === "string" &&
    Array.isArray(rec.styleTags) &&
    rec.styleTags.every((tag) => typeof tag === "string") &&
    typeof rec.occasion === "string" &&
    Array.isArray(rec.alternatives) &&
    rec.alternatives.every((alt) => typeof alt === "string") &&
    Array.isArray(rec.items)
  );
}

export function isValidChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;

  const message = value as Record<string, unknown>;

  if (typeof message.id !== "string" || typeof message.role !== "string") {
    return false;
  }

  if (message.role === "user") {
    return typeof message.content === "string";
  }

  if (message.role === "assistant") {
    if (typeof message.content !== "string") {
      return false;
    }

    if (message.isError !== undefined && typeof message.isError !== "boolean") {
      return false;
    }

    if (message.actionHref !== undefined) {
      if (
        typeof message.actionHref !== "string" ||
        !message.actionHref.startsWith("/")
      ) {
        return false;
      }
    }

    if (
      message.actionLabel !== undefined &&
      typeof message.actionLabel !== "string"
    ) {
      return false;
    }

    return true;
  }

  if (message.role === "recommendation") {
    return isValidRecommendation(message.recommendation);
  }

  return false;
}

export function parseStoredChatMessages(raw: string): ChatMessage[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  return parsed.filter(isValidChatMessage);
}


export const CHAT_MESSAGES_STORAGE_PREFIX = "outfitai.chat.messages:";
export const ANONYMOUS_CHAT_OWNER = "anonymous";
/** 只保留最近的消息，避免 localStorage 超额 */
export const MAX_STORED_CHAT_MESSAGES = 200;

export type ChatStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isValidUserId(userId: string): boolean {
  return userId.length > 0 && userId.length <= 128 && !/\s/.test(userId) && userId !== ANONYMOUS_CHAT_OWNER;
}

export function getChatMessagesStorageKey(userId: string | null | undefined): string {
  if (typeof userId === "string" && isValidUserId(userId.trim())) {
    return `${CHAT_MESSAGES_STORAGE_PREFIX}${userId.trim()}`;
  }
  return `${CHAT_MESSAGES_STORAGE_PREFIX}${ANONYMOUS_CHAT_OWNER}`;
}

function removeLegacyKey(storage: ChatStorageLike): void {
  try {
    storage.removeItem(CHAT_MESSAGES_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function readChatMessages(
  storage: ChatStorageLike | null | undefined,
  userId: string | null | undefined
): ChatMessage[] {
  if (!storage) return [];
  removeLegacyKey(storage);
  const key = getChatMessagesStorageKey(userId);
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return [];
  }
  if (!raw) return [];
  const restored = parseStoredChatMessages(raw);
  if (restored === null) {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
    return [];
  }
  return restored.slice(-MAX_STORED_CHAT_MESSAGES);
}

export function writeChatMessages(
  storage: ChatStorageLike | null | undefined,
  userId: string | null | undefined,
  messages: ChatMessage[]
): void {
  if (!storage) return;
  const key = getChatMessagesStorageKey(userId);
  try {
    const valid = messages.filter(isValidChatMessage).slice(-MAX_STORED_CHAT_MESSAGES);
    if (valid.length === 0) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, JSON.stringify(valid));
  } catch (error) {
    console.error("Failed to persist chat messages:", error);
  }
}

export function clearChatMessages(
  storage: ChatStorageLike | null | undefined,
  userId: string | null | undefined
): void {
  if (!storage) return;
  try {
    storage.removeItem(getChatMessagesStorageKey(userId));
  } catch {
    // ignore
  }
}

export function getBrowserLocalStorage(): ChatStorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}
