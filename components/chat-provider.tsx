"use client";

/**
 * 首页对话的任务与状态 Provider。
 *
 * 放在根布局（app/layout.tsx）中，首页 / 衣橱 / 我的 等页面之间的站内切换不会卸载它，
 * 因此需求解析、推荐生成等 Server Action 在用户离开首页后仍会继续等待并写回结果；
 * 首页 ChatBox 只是展示与触发操作的组件，卸载它不会取消任何任务。
 *
 * 只有 Provider 真正卸载或登录账号变化时，旧任务的结果才会被作废。
 */
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  regenerateRecommendation as regenerateRecommendationAction,
  type RecommendationResult,
} from "@/lib/actions/recommendation";
import {
  clearChatMessages,
  getBrowserLocalStorage,
  readChatMessages,
  writeChatMessages,
  type ChatMessage,
} from "@/lib/chat/message-storage";
import { createClientId } from "@/lib/client-id";
import type { RequirementFlowState } from "@/lib/requirements/flow-state";
import {
  buildShoppingGuideMessage,
  detectShoppingIntent,
} from "@/lib/shopping-intent";
import {
  buildTravelGuideMessage,
  detectTravelIntent,
} from "@/lib/travel-intent";
import { useRequirementFlow } from "@/components/use-requirement-flow";
import type { ClarificationOption } from "@/types/requirement";
import type {
  GenerateRecommendationOptions,
  WeatherLocationInput,
} from "@/types/weather";

export type RegenerateOptions = Pick<
  GenerateRecommendationOptions,
  "location" | "targetDate" | "excludeClosetItemIds" | "requirementNotes" | "requirementTerms"
>;

export type ChatContextValue = {
  /** 当前登录用户的 Supabase user.id（仅用于本地存储隔离，不用于权限判断） */
  userId: string | null;
  messages: ChatMessage[];
  /** 当前账号的本地消息是否已加载 */
  isHydrated: boolean;
  requirementState: RequirementFlowState;
  /** 需求解析 / 校验 / 生成 / 换一套 任一进行中 */
  isWorking: boolean;
  /** “换一套”进行中（展示加载气泡） */
  isRegenerating: boolean;
  /** 下一条输入是否作为追问回答 / 需求修改合并 */
  isAwaitingRequirementInput: boolean;
  sendMessage: (text: string) => Promise<void>;
  answerRequirementOption: (option: ClarificationOption) => void;
  skipRequirementClarification: () => void;
  confirmRequirement: () => Promise<void>;
  cancelRequirement: () => void;
  modifyRequirement: () => void;
  regenerateRecommendation: (recommendation: RecommendationResult) => Promise<void>;
  clearChat: () => void;
  /** 首页天气位置（由 ChatBox 同步），作为需求解析的上下文 */
  setContextLocation: (location: WeatherLocationInput | undefined) => void;
};

export const ChatContext = createContext<ChatContextValue | null>(null);

type ChatState = {
  /** 当前消息所属账号；与 userId 不一致时表示尚未切换完成 */
  owner: string | null;
  messages: ChatMessage[];
  hydrated: boolean;
};

const EMPTY_MESSAGES: ChatMessage[] = [];

function createId() {
  return createClientId();
}

export function ChatProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const [chat, setChat] = useState<ChatState>({ owner: userId, messages: [], hydrated: false });
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const userIdRef = useRef(userId);
  const contextLocationRef = useRef<WeatherLocationInput | undefined>(undefined);
  /** 每条推荐对应的生成参数，供“换一套”复用（仅内存，随账号切换清空） */
  const generationOptionsRef = useRef(new Map<string, RegenerateOptions>());
  const nextRegenerateIdRef = useRef(0);
  const activeRegenerateIdRef = useRef<number | null>(null);

  const getContextLocation = useCallback(() => contextLocationRef.current, []);
  const requirementFlow = useRequirementFlow(userId, getContextLocation);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // Provider 真正卸载：作废所有未完成任务的结果
      mountedRef.current = false;
      activeRegenerateIdRef.current = null;
    };
  }, []);

  // 账号变化（含首次挂载）：作废旧账号任务，只加载当前账号自己的消息
  useEffect(() => {
    userIdRef.current = userId;
    activeRegenerateIdRef.current = null;
    setRegeneratingId(null);
    generationOptionsRef.current.clear();
    setChat({
      owner: userId,
      messages: readChatMessages(getBrowserLocalStorage(), userId),
      hydrated: true,
    });
  }, [userId]);

  // 持久化：只写入消息所属账号的 key，避免切换账号瞬间串号
  useEffect(() => {
    if (!chat.hydrated || chat.owner !== userIdRef.current) return;
    writeChatMessages(getBrowserLocalStorage(), chat.owner, chat.messages);
  }, [chat]);

  /** 只向发起时的账号追加消息；账号已变化或 Provider 已卸载则丢弃 */
  const appendMessages = useCallback((owner: string | null, newMessages: ChatMessage[]) => {
    if (!mountedRef.current || userIdRef.current !== owner) return;
    setChat((prev) =>
      prev.owner === owner ? { ...prev, messages: [...prev.messages, ...newMessages] } : prev
    );
  }, []);

  const appendRecommendation = useCallback(
    (owner: string | null, recommendation: RecommendationResult, options: RegenerateOptions) => {
      if (!mountedRef.current || userIdRef.current !== owner) return;
      generationOptionsRef.current.set(recommendation.id, options);
      appendMessages(owner, [{ id: createId(), role: "recommendation", recommendation }]);
    },
    [appendMessages]
  );

  const isBusyNow = useCallback(
    () => requirementFlow.hasActiveRequest() || activeRegenerateIdRef.current !== null,
    [requirementFlow]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isBusyNow() || requirementFlow.isBusy) return;
      const owner = userIdRef.current;

      appendMessages(owner, [{ id: createId(), role: "user", content: trimmed }]);

      // 正在追问或修改需求：作为补充合并到原需求，不丢失已确认信息
      if (requirementFlow.isAwaitingInput) {
        await requirementFlow.answerText(trimmed);
        return;
      }

      const travelIntent = detectTravelIntent(trimmed);
      if (travelIntent.isTravelPlan) {
        const { content, actionHref } = buildTravelGuideMessage(travelIntent);
        appendMessages(owner, [
          { id: createId(), role: "assistant", content, actionHref, actionLabel: "去旅行穿搭规划" },
        ]);
        return;
      }

      const shoppingIntent = detectShoppingIntent(trimmed);
      if (shoppingIntent.isShoppingCheck) {
        const { content, actionHref } = buildShoppingGuideMessage();
        appendMessages(owner, [
          { id: createId(), role: "assistant", content, actionHref, actionLabel: "去购物助手" },
        ]);
        return;
      }

      console.log("[ChatProvider] analyze requirement", {
        hasLocation: Boolean(contextLocationRef.current),
        locationType: contextLocationRef.current?.type ?? "none",
      });

      // 先进入需求确认，用户确认前不会调用推荐生成
      await requirementFlow.start(trimmed);
    },
    [appendMessages, isBusyNow, requirementFlow]
  );

  const answerRequirementOption = useCallback(
    (option: ClarificationOption) => {
      if (isBusyNow() || requirementFlow.isBusy) return;
      appendMessages(userIdRef.current, [{ id: createId(), role: "user", content: option.label }]);
      void requirementFlow.answerOption(option);
    },
    [appendMessages, isBusyNow, requirementFlow]
  );

  const skipRequirementClarification = useCallback(() => {
    void requirementFlow.skipClarification();
  }, [requirementFlow]);

  const confirmRequirement = useCallback(async () => {
    if (activeRegenerateIdRef.current !== null) return;
    const owner = userIdRef.current;
    const outcome = await requirementFlow.confirm();
    if ("ignored" in outcome) return;

    if (!outcome.success) {
      // 衣橱不足 / 登录失效需要在对话中保留提示（衣橱提示会显示“去添加”入口）
      if (outcome.needsMoreClothes || outcome.needsLogin) {
        appendMessages(owner, [
          { id: createId(), role: "assistant", content: outcome.error, isError: true },
        ]);
      }
      return;
    }

    appendRecommendation(owner, outcome.recommendation, outcome.generationOptions);
  }, [appendMessages, appendRecommendation, requirementFlow]);

  const cancelRequirement = useCallback(() => {
    const status = requirementFlow.state.status;
    if (status === "idle" || status === "generating") return;
    requirementFlow.cancel();
    appendMessages(userIdRef.current, [
      { id: createId(), role: "assistant", content: "好的，已取消这次需求，不会生成推荐。" },
    ]);
  }, [appendMessages, requirementFlow]);

  const modifyRequirement = useCallback(() => {
    requirementFlow.modify();
  }, [requirementFlow]);

  const regenerateRecommendation = useCallback(
    async (recommendation: RecommendationResult) => {
      if (isBusyNow() || requirementFlow.isBusy) return;
      const owner = userIdRef.current;
      const options: RegenerateOptions = generationOptionsRef.current.get(recommendation.id) ?? {
        location: contextLocationRef.current,
      };

      nextRegenerateIdRef.current += 1;
      const requestId = nextRegenerateIdRef.current;
      activeRegenerateIdRef.current = requestId;
      setRegeneratingId(requestId);

      const isCurrent = () =>
        mountedRef.current &&
        activeRegenerateIdRef.current === requestId &&
        userIdRef.current === owner;

      let result: Awaited<ReturnType<typeof regenerateRecommendationAction>>;
      try {
        result = await regenerateRecommendationAction(
          recommendation.requestText,
          recommendation.selectedItemIds,
          options
        );
      } catch {
        result = { success: false, error: "网络开小差了，请稍后重试。" };
      }

      if (!isCurrent()) return;
      activeRegenerateIdRef.current = null;
      setRegeneratingId(null);

      if (!result.success) {
        appendMessages(owner, [{ id: createId(), role: "assistant", content: result.error, isError: true }]);
        return;
      }
      appendRecommendation(owner, result.recommendation, options);
    },
    [appendMessages, appendRecommendation, isBusyNow, requirementFlow]
  );

  const clearChat = useCallback(() => {
    if (isBusyNow() || requirementFlow.isBusy) return;
    const owner = userIdRef.current;
    clearChatMessages(getBrowserLocalStorage(), owner);
    generationOptionsRef.current.clear();
    requirementFlow.reset();
    setChat((prev) => (prev.owner === owner ? { ...prev, messages: [] } : prev));
  }, [isBusyNow, requirementFlow]);

  const setContextLocation = useCallback((location: WeatherLocationInput | undefined) => {
    contextLocationRef.current = location;
  }, []);

  const isRegenerating = regeneratingId !== null;
  const messages = useMemo(
    () => (chat.owner === userId ? chat.messages : EMPTY_MESSAGES),
    [chat.owner, chat.messages, userId]
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      userId,
      messages,
      isHydrated: chat.hydrated && chat.owner === userId,
      requirementState: requirementFlow.state,
      isWorking: isRegenerating || requirementFlow.isBusy,
      isRegenerating,
      isAwaitingRequirementInput: requirementFlow.isAwaitingInput,
      sendMessage,
      answerRequirementOption,
      skipRequirementClarification,
      confirmRequirement,
      cancelRequirement,
      modifyRequirement,
      regenerateRecommendation,
      clearChat,
      setContextLocation,
    }),
    [
      userId,
      messages,
      chat.hydrated,
      chat.owner,
      requirementFlow.state,
      requirementFlow.isBusy,
      requirementFlow.isAwaitingInput,
      isRegenerating,
      sendMessage,
      answerRequirementOption,
      skipRequirementClarification,
      confirmRequirement,
      cancelRequirement,
      modifyRequirement,
      regenerateRecommendation,
      clearChat,
      setContextLocation,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
