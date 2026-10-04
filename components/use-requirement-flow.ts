"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  analyzeOutfitRequirement,
  confirmOutfitRequirement,
  trackRequirementAction,
  validateOutfitRequirement,
  type ConfirmRequirementResponse,
} from "@/lib/actions/requirement";
import {
  createInitialRequirementFlowState,
  isAwaitingRequirementInput,
  isRequirementFlowBusy,
  requirementFlowReducer,
} from "@/lib/requirements/flow-state";
import {
  clearRequirementDraft,
  getSessionStorage,
  readRequirementDraft,
  writeRequirementDraft,
} from "@/lib/requirements/storage";
import type { ClarificationOption } from "@/types/requirement";
import type { WeatherLocationInput } from "@/types/weather";

const NETWORK_ERROR = "网络开小差了，请稍后重试。";

function getTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export type ConfirmOutcome =
  | ConfirmRequirementResponse
  | { success: false; error: string; ignored: true };

export function useRequirementFlow(
  userId: string | null,
  getContextLocation: () => WeatherLocationInput | undefined
) {
  const [state, dispatch] = useReducer(requirementFlowReducer, undefined, () =>
    createInitialRequirementFlowState(null)
  );

  const mountedRef = useRef(true);
  const nextIdRef = useRef(0);
  const activeIdRef = useRef<number | null>(null);
  const userIdRef = useRef(userId);
  const stateRef = useRef(state);
  stateRef.current = state;
  const hydratedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeIdRef.current = null;
    };
  }, []);

  // 账号切换：作废进行中的请求，只恢复该 user.id 自己的草稿
  useEffect(() => {
    userIdRef.current = userId;
    activeIdRef.current = null;
    hydratedRef.current = false;
    dispatch({
      type: "reset",
      draft: readRequirementDraft(getSessionStorage(), userId, { now: new Date(), timeZone: getTimeZone() }),
    });
    hydratedRef.current = true;
  }, [userId]);

  // 只持久化稳定状态；生成完成 / 取消后清除
  useEffect(() => {
    if (!hydratedRef.current) return;
    const storage = getSessionStorage();
    const owner = userIdRef.current;
    if ((state.status === "needs_clarification" || state.status === "ready_for_confirmation") && state.requirement) {
      writeRequirementDraft(
        storage,
        owner,
        {
          status: state.status,
          requirement: state.requirement,
          questions: state.questions,
          round: state.round,
          weather: state.weather,
          usedFallback: state.usedFallback,
        },
        new Date()
      );
    } else if (state.status === "idle" || state.status === "error") {
      clearRequirementDraft(storage, owner);
    }
  }, [state]);

  const begin = useCallback(() => {
    nextIdRef.current += 1;
    const id = nextIdRef.current;
    activeIdRef.current = id;
    return { id, owner: userIdRef.current };
  }, []);

  const isCurrent = useCallback(
    (id: number, owner: string | null) =>
      mountedRef.current && activeIdRef.current === id && userIdRef.current === owner,
    []
  );

  const runAnalyze = useCallback(
    async (payload: Record<string, unknown>) => {
      // 同步守卫：activeIdRef 在发起时立即设置，快速连续提交只会生效一次
      if (activeIdRef.current !== null || isRequirementFlowBusy(stateRef.current)) return;
      const { id, owner } = begin();
      dispatch({ type: "analyze_start", requestId: id });
      try {
        const result = await analyzeOutfitRequirement({
          ...payload,
          contextLocation: getContextLocation() ?? null,
          timeZone: getTimeZone(),
        });
        if (!isCurrent(id, owner)) return;
        activeIdRef.current = null;
        dispatch({ type: "analyze_result", requestId: id, result });
      } catch {
        if (!isCurrent(id, owner)) return;
        activeIdRef.current = null;
        dispatch({ type: "request_failed", requestId: id, message: NETWORK_ERROR });
      }
    },
    [begin, getContextLocation, isCurrent]
  );

  /** 新需求（会覆盖当前未确认的草稿） */
  const start = useCallback(
    (text: string) => runAnalyze({ text }),
    [runAnalyze]
  );

  const answerOption = useCallback(
    (option: ClarificationOption) => {
      const current = stateRef.current;
      if (!current.requirement) return;
      return runAnalyze({
        previous: current.requirement,
        answer: { kind: "option", field: option.field, value: option.value },
        pendingFields: current.questions.map((q) => q.field),
        round: current.round,
      });
    },
    [runAnalyze]
  );

  /** 追问回答或“修改需求”的自由输入：合并到原需求 */
  const answerText = useCallback(
    (text: string) => {
      const current = stateRef.current;
      if (!current.requirement) return;
      return runAnalyze({
        previous: current.requirement,
        answer: { kind: "text", text },
        pendingFields: current.questions.map((q) => q.field),
        // 修改需求时不再追问轮数外的问题：沿用已有轮数
        round: current.round,
      });
    },
    [runAnalyze]
  );

  /** 用户拒绝补充：使用当前假设直接进入确认卡 */
  const skipClarification = useCallback(() => {
    const current = stateRef.current;
    if (!current.requirement) return;
    return runAnalyze({
      previous: current.requirement,
      skipClarification: true,
      round: current.round,
    });
  }, [runAnalyze]);

  const modify = useCallback(() => {
    if (stateRef.current.status !== "ready_for_confirmation") return;
    dispatch({ type: "modify" });
    trackRequirementAction({ event: "requirement_modified", stage: "confirmation", round: stateRef.current.round }).catch(() => {});
  }, []);

  const cancel = useCallback(() => {
    const current = stateRef.current;
    if (current.status === "generating" || current.status === "idle") return;
    activeIdRef.current = null;
    clearRequirementDraft(getSessionStorage(), userIdRef.current);
    dispatch({ type: "cancel" });
    trackRequirementAction({
      event: "requirement_cancelled",
      stage: current.status === "needs_clarification" ? "clarification" : "confirmation",
      round: current.round,
    }).catch(() => {});
  }, []);

  /**
   * 用户确认后：validating（服务端最终校验）→ generating（调用现有推荐工作流）。
   * 未确认前不会调用推荐生成；重复点击会被状态机忽略。
   */
  const confirm = useCallback(async (): Promise<ConfirmOutcome> => {
    const current = stateRef.current;
    if (activeIdRef.current !== null || current.status !== "ready_for_confirmation" || !current.requirement) {
      return { success: false, error: "", ignored: true };
    }
    const { id, owner } = begin();
    dispatch({ type: "validate_start", requestId: id });
    const timeZone = getTimeZone();

    try {
      const validated = await validateOutfitRequirement({ requirement: current.requirement, timeZone });
      if (!isCurrent(id, owner)) return { success: false, error: "", ignored: true };
      if (validated.status !== "valid") {
        activeIdRef.current = null;
        dispatch({ type: "request_failed", requestId: id, message: validated.message });
        return { success: false, error: validated.message, needsLogin: validated.status === "unauthorized" };
      }

      dispatch({ type: "validate_ok", requestId: id, requirement: validated.requirement });
      const response = await confirmOutfitRequirement({
        requirement: validated.requirement,
        timeZone,
        round: current.round,
      });
      if (!isCurrent(id, owner)) return { success: false, error: "", ignored: true };
      activeIdRef.current = null;

      if (!response.success) {
        dispatch({ type: "request_failed", requestId: id, message: response.error });
        return response;
      }
      dispatch({ type: "generate_done", requestId: id });
      clearRequirementDraft(getSessionStorage(), owner);
      return response;
    } catch {
      if (!isCurrent(id, owner)) return { success: false, error: "", ignored: true };
      activeIdRef.current = null;
      dispatch({ type: "request_failed", requestId: id, message: NETWORK_ERROR });
      return { success: false, error: NETWORK_ERROR };
    }
  }, [begin, isCurrent]);

  const reset = useCallback(() => {
    activeIdRef.current = null;
    clearRequirementDraft(getSessionStorage(), userIdRef.current);
    dispatch({ type: "reset", draft: null });
  }, []);

  /** 同步判断是否有进行中的请求（不依赖下一次渲染），用于防止快速重复提交 */
  const hasActiveRequest = useCallback(() => activeIdRef.current !== null, []);

  return {
    state,
    hasActiveRequest,
    isBusy: isRequirementFlowBusy(state),
    isAwaitingInput: isAwaitingRequirementInput(state),
    start,
    answerOption,
    answerText,
    skipClarification,
    modify,
    cancel,
    confirm,
    reset,
  };
}
