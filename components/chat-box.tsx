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
import { MessageList, type ChatMessage } from "@/components/message-list";

function createId() {
  return crypto.randomUUID();
}

export function ChatBox() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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

    setMessages((prev) => [
      ...prev,
      { id: createId(), role: "user", content: trimmed },
    ]);
    setInput("");
    setIsLoading(true);
    scrollToBottom();

    const result = await generateRecommendation(trimmed);

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

  const handleQuickQuestion = (question: string) => {
    handleSend(question);
  };

  const handleRegenerate = async (recommendation: RecommendationResult) => {
    if (isLoading) return;

    setIsLoading(true);
    scrollToBottom();

    const result = await regenerateRecommendation(
      recommendation.requestText,
      recommendation.selectedItemIds
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

  const showClosetHint = messages.some(
    (m) =>
      m.role === "assistant" &&
      m.content.includes("衣橱还不够")
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border/50 px-4 py-4 text-center">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {PAGE_COPY.home.headline}
        </h1>
        <p className="mt-1 text-sm text-muted">{PAGE_COPY.home.subtitle}</p>
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
        )}

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
