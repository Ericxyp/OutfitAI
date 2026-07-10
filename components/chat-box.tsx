"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MIN_CLOSET_FOR_AI,
  PAGE_COPY,
  QUICK_QUESTIONS,
} from "@/lib/constants";
import {
  generateRecommendation,
  regenerateRecommendation,
  type RecommendationResult,
} from "@/lib/actions/recommendation";
import {
  CHAT_MESSAGES_STORAGE_KEY,
  MessageList,
  parseStoredChatMessages,
  type ChatMessage,
} from "@/components/message-list";
import {
  buildShoppingGuideMessage,
  detectShoppingIntent,
} from "@/lib/shopping-intent";
import {
  buildTravelGuideMessage,
  detectTravelIntent,
} from "@/lib/travel-intent";
import type { LocationInput } from "@/types/weather";

function createId() {
  return crypto.randomUUID();
}

type LocationStatus = "idle" | "loading" | "success" | "error";

function getLocationButtonLabel(status: LocationStatus): string {
  switch (status) {
    case "loading":
      return "定位中...";
    case "success":
      return "已使用当前位置";
    case "error":
      return "定位失败，仍可继续推荐";
    default:
      return "使用当前位置";
  }
}

export function ChatBox() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [location, setLocation] = useState<LocationInput | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_MESSAGES_STORAGE_KEY);
      if (!raw) return;

      const restored = parseStoredChatMessages(raw);
      if (restored === null) {
        localStorage.removeItem(CHAT_MESSAGES_STORAGE_KEY);
        return;
      }

      setMessages(restored);
    } catch {
      localStorage.removeItem(CHAT_MESSAGES_STORAGE_KEY);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      if (messages.length === 0) {
        localStorage.removeItem(CHAT_MESSAGES_STORAGE_KEY);
        return;
      }

      localStorage.setItem(
        CHAT_MESSAGES_STORAGE_KEY,
        JSON.stringify(messages)
      );
    } catch (error) {
      console.error("Failed to persist chat messages:", error);
    }
  }, [messages, isHydrated]);

  useEffect(() => {
    if (!isHydrated || messages.length === 0) return;
    scrollToBottom();
  }, [isHydrated, messages.length, scrollToBottom]);

  const appendAssistantMessage = (content: string, isError = false) => {
    setMessages((prev) => [
      ...prev,
      { id: createId(), role: "assistant", content, isError },
    ]);
    scrollToBottom();
  };

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const hasLocation =
      location !== null &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude);

    console.log("[ChatBox] send recommendation", {
      hasLocation,
      locationStatus,
    });

    setMessages((prev) => [
      ...prev,
      { id: createId(), role: "user", content: trimmed },
    ]);
    setInput("");
    scrollToBottom();

    const travelIntent = detectTravelIntent(trimmed);
    if (travelIntent.isTravelPlan) {
      const { content, actionHref } = buildTravelGuideMessage(travelIntent);
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: "assistant",
          content,
          actionHref,
          actionLabel: "去旅行穿搭规划",
        },
      ]);
      scrollToBottom();
      return;
    }

    const shoppingIntent = detectShoppingIntent(trimmed);
    if (shoppingIntent.isShoppingCheck) {
      const { content, actionHref } = buildShoppingGuideMessage();
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: "assistant",
          content,
          actionHref,
          actionLabel: "去购物助手",
        },
      ]);
      scrollToBottom();
      return;
    }

    setIsLoading(true);

    const result = await generateRecommendation(trimmed, {
      location: location ?? undefined,
    });

    setIsLoading(false);

    if (!result.success) {
      appendAssistantMessage(result.error, true);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: "recommendation",
        recommendation: result.recommendation,
      },
    ]);
    scrollToBottom();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(input);
  };

  const handleRegenerate = async (recommendation: RecommendationResult) => {
    if (isLoading) return;

    setIsLoading(true);
    scrollToBottom();

    const result = await regenerateRecommendation(
      recommendation.requestText,
      recommendation.selectedItemIds,
      { location: location ?? undefined }
    );

    setIsLoading(false);

    if (!result.success) {
      appendAssistantMessage(result.error, true);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: "recommendation",
        recommendation: result.recommendation,
      },
    ]);
    scrollToBottom();
  };

  const handleQuickQuestion = (question: string) => {
    handleSend(question);
  };

  const handleUseLocation = () => {
    if (locationStatus === "loading" || isLoading) return;

    if (!navigator.geolocation) {
      setLocation(null);
      setLocationStatus("error");
      return;
    }

    setLocationStatus("loading");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("success");
        console.log("[ChatBox] location acquired", { hasLocation: true });
      },
      () => {
        setLocation(null);
        setLocationStatus("error");
        console.log("[ChatBox] location failed", { hasLocation: false });
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  };

  const handleClearChat = () => {
    setMessages([]);
    try {
      localStorage.removeItem(CHAT_MESSAGES_STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear chat messages:", error);
    }
  };

  const showClosetHint = messages.some(
    (m) =>
      m.role === "assistant" &&
      m.content.includes("衣橱还不够")
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border/50 px-4 py-4 text-center">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-center">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              {PAGE_COPY.home.headline}
            </h1>
            <p className="mt-1 text-sm text-muted">{PAGE_COPY.home.subtitle}</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              disabled={isLoading}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs text-muted transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              清空对话
            </button>
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >
        <MessageList
          messages={messages}
          isLoading={isLoading}
          onRegenerate={handleRegenerate}
        />
      </div>

      <div className="shrink-0 border-t border-border/50 bg-background/95 px-4 pb-3 pt-3 backdrop-blur-sm">
        {showClosetHint && (
          <Link
            href="/closet/new"
            className="mb-3 flex items-center justify-between rounded-2xl bg-accent px-4 py-3 ring-1 ring-border/40"
          >
            <span className="text-sm text-foreground">
              先添加 {MIN_CLOSET_FOR_AI} 件衣服，我才能帮你搭
            </span>
            <span className="shrink-0 text-sm font-medium">去添加 →</span>
          </Link>
        )}

        {messages.length === 0 && !isLoading && (
          <>
            <Link
              href="/shopping"
              className="mb-3 flex items-center justify-between rounded-2xl bg-card px-4 py-3 ring-1 ring-border/60 transition-colors hover:bg-accent"
            >
              <span className="text-sm text-foreground">
                想买一件衣服？上传商品图，帮你看值不值得买
              </span>
              <span className="shrink-0 text-sm font-medium">去购物助手 →</span>
            </Link>
            <div className="mb-3 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {QUICK_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => handleQuickQuestion(question)}
                disabled={isLoading}
                className="shrink-0 rounded-full bg-card px-3.5 py-2 text-sm text-foreground ring-1 ring-border/80 transition-colors hover:bg-accent disabled:opacity-60"
              >
                {question}
              </button>
            ))}
            </div>
          </>
        )}

        <div className="mb-3">
          <button
            type="button"
            onClick={handleUseLocation}
            disabled={isLoading || locationStatus === "loading"}
            className={`rounded-full px-3.5 py-2 text-sm ring-1 transition-colors disabled:opacity-60 ${
              locationStatus === "success"
                ? "bg-accent text-foreground ring-border/80"
                : locationStatus === "error"
                  ? "bg-card text-muted ring-border/80 hover:bg-accent hover:text-foreground"
                  : "bg-card text-foreground ring-border/80 hover:bg-accent"
            }`}
          >
            {getLocationButtonLabel(locationStatus)}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div className="min-w-0 flex-1 rounded-2xl bg-card px-4 py-2.5 ring-1 ring-border/80">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={PAGE_COPY.home.placeholder}
              rows={1}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                }
              }}
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted focus:outline-none disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            aria-label={PAGE_COPY.home.sendAria}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 19V5M5 12l7-7 7 7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
