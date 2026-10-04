"use client";

import { useContext } from "react";
import { ChatContext, type ChatContextValue } from "@/components/chat-provider";

/** 安全读取首页对话 Context；必须在根布局的 ChatProvider 内使用 */
export function useChat(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) {
    throw new Error("useChat 必须在 <ChatProvider> 内使用（见 app/layout.tsx）");
  }
  return value;
}
