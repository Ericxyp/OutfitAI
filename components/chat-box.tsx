"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MIN_CLOSET_FOR_AI,
  PAGE_COPY,
  QUICK_QUESTIONS,
} from "@/lib/constants";
import { MessageList } from "@/components/message-list";
import { useWeatherLocation } from "@/components/use-weather-location";
import { WeatherLocationPicker } from "@/components/weather-location-picker";
import { RequirementPanel } from "@/components/requirement-panel";
import { useChat } from "@/components/use-chat";

/**
 * 首页对话展示组件：只负责输入框、滚动与 UI。
 * 对话消息、需求确认与推荐生成等异步任务都在根布局的 ChatProvider 中，
 * 本组件卸载（站内切到衣橱 / 我的）不会中断任务。
 */
export function ChatBox() {
  const {
    userId,
    messages,
    isHydrated,
    requirementState,
    isWorking,
    isRegenerating,
    isAwaitingRequirementInput,
    sendMessage,
    answerRequirementOption,
    skipRequirementClarification,
    confirmRequirement,
    cancelRequirement,
    modifyRequirement,
    regenerateRecommendation,
    clearChat,
    setContextLocation,
  } = useChat();
  const [input, setInput] = useState("");
  const weatherLocation = useWeatherLocation(userId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 首页已选天气位置作为需求解析上下文（Provider 保存最新值，ChatBox 卸载后仍可用）
  useEffect(() => {
    setContextLocation(weatherLocation.requestLocation);
  }, [setContextLocation, weatherLocation.requestLocation]);

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
    if (!isHydrated || messages.length === 0) return;
    scrollToBottom();
  }, [isHydrated, messages.length, scrollToBottom]);

  const handleSend = (text: string) => {
    if (!text.trim() || isWorking) return;
    setInput("");
    void sendMessage(text);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(input);
  };

  const handleQuickQuestion = (question: string) => {
    handleSend(question);
  };

  const handleRequirementModify = () => {
    modifyRequirement();
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const flowStatus = requirementState.status;
  const inputPlaceholder =
    flowStatus === "needs_clarification"
      ? "也可以直接输入你的回答…"
      : isAwaitingRequirementInput
        ? "输入要修改的内容，例如：改成后天"
        : PAGE_COPY.home.placeholder;

  // 需求面板变化时滚到底部，确保追问 / 确认卡可见
  useEffect(() => {
    if (flowStatus === "idle") return;
    scrollToBottom();
  }, [flowStatus, scrollToBottom]);

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
              onClick={clearChat}
              disabled={isWorking}
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
          isLoading={isRegenerating || flowStatus === "generating"}
          onRegenerate={(recommendation) => void regenerateRecommendation(recommendation)}
        />
        {flowStatus !== "idle" && (
          <div className="pb-2 pt-1">
            <RequirementPanel
              state={requirementState}
              onOption={answerRequirementOption}
              onSkip={skipRequirementClarification}
              onConfirm={() => void confirmRequirement()}
              onModify={handleRequirementModify}
              onCancel={cancelRequirement}
            />
          </div>
        )}
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

        {messages.length === 0 && !isWorking && flowStatus === "idle" && (
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
                disabled={isWorking}
                className="shrink-0 rounded-full bg-card px-3.5 py-2 text-sm text-foreground ring-1 ring-border/80 transition-colors hover:bg-accent disabled:opacity-60"
              >
                {question}
              </button>
            ))}
            </div>
          </>
        )}

        <WeatherLocationPicker
          controller={weatherLocation}
          disabled={isWorking}
        />

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div className="min-w-0 flex-1 rounded-2xl bg-card px-4 py-2.5 ring-1 ring-border/80">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={inputPlaceholder}
              rows={1}
              enterKeyHint="send"
              disabled={isWorking}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                }
              }}
              className="w-full resize-none bg-transparent text-base leading-relaxed sm:text-sm text-foreground placeholder:text-muted focus:outline-none disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={isWorking || !input.trim()}
            aria-label={PAGE_COPY.home.sendAria}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isWorking ? (
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
