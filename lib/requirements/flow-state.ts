/**
 * 需求确认流程状态机（纯 reducer，客户端使用，便于测试竞态）。
 *
 * idle → extracting → needs_clarification ⇄ extracting → ready_for_confirmation
 *      → validating → generating → idle
 * 任一步失败 → 回到上一个稳定状态（或 error）
 *
 * 每个异步操作携带 requestId；只有与 activeRequestId 一致的结果生效，
 * 取消 / 重置 / 切换账号会作废进行中的请求。
 */
import type {
  ClarificationQuestion,
  OutfitRequirement,
  RequirementAnalysisResult,
  RequirementWeatherPreview,
} from "@/types/requirement";

export type RequirementFlowStatus =
  | "idle"
  | "extracting"
  | "validating"
  | "needs_clarification"
  | "ready_for_confirmation"
  | "generating"
  | "error";

type StableStatus = "idle" | "needs_clarification" | "ready_for_confirmation";

export type RequirementFlowState = {
  status: RequirementFlowStatus;
  requirement: OutfitRequirement | null;
  questions: ClarificationQuestion[];
  round: number;
  weather: RequirementWeatherPreview | null;
  usedFallback: boolean;
  /** 面向用户的提示（错误或说明） */
  message: string | null;
  /** 用户点击“修改需求”后，下一条输入作为修改内容合并 */
  modifying: boolean;
  activeRequestId: number | null;
  /** 异步失败时回退到的稳定状态 */
  lastStable: StableStatus;
};

export type RestorableDraft = {
  status: "needs_clarification" | "ready_for_confirmation";
  requirement: OutfitRequirement;
  questions: ClarificationQuestion[];
  round: number;
  weather: RequirementWeatherPreview | null;
  usedFallback: boolean;
};

export type RequirementFlowAction =
  | { type: "reset"; draft?: RestorableDraft | null }
  | { type: "analyze_start"; requestId: number }
  | { type: "analyze_result"; requestId: number; result: RequirementAnalysisResult }
  | { type: "request_failed"; requestId: number; message: string }
  | { type: "validate_start"; requestId: number }
  | { type: "validate_ok"; requestId: number; requirement: OutfitRequirement }
  | { type: "generate_done"; requestId: number }
  | { type: "modify" }
  | { type: "cancel" };

export function createInitialRequirementFlowState(draft?: RestorableDraft | null): RequirementFlowState {
  if (draft) {
    return {
      status: draft.status,
      requirement: draft.requirement,
      questions: draft.status === "needs_clarification" ? draft.questions : [],
      round: draft.round,
      weather: draft.weather,
      usedFallback: draft.usedFallback,
      message: null,
      modifying: false,
      activeRequestId: null,
      lastStable: draft.status,
    };
  }
  return {
    status: "idle",
    requirement: null,
    questions: [],
    round: 0,
    weather: null,
    usedFallback: false,
    message: null,
    modifying: false,
    activeRequestId: null,
    lastStable: "idle",
  };
}

export function isRequirementFlowBusy(state: RequirementFlowState): boolean {
  return state.status === "extracting" || state.status === "validating" || state.status === "generating";
}

/** 是否把下一条聊天输入当作对当前需求的补充 / 修改 */
export function isAwaitingRequirementInput(state: RequirementFlowState): boolean {
  return state.status === "needs_clarification" || (state.status === "ready_for_confirmation" && state.modifying);
}

function matches(state: RequirementFlowState, requestId: number): boolean {
  return state.activeRequestId === requestId;
}

export function requirementFlowReducer(
  state: RequirementFlowState,
  action: RequirementFlowAction
): RequirementFlowState {
  switch (action.type) {
    case "reset":
      return createInitialRequirementFlowState(action.draft ?? null);

    case "analyze_start":
      if (isRequirementFlowBusy(state)) return state;
      return {
        ...state,
        status: "extracting",
        message: null,
        activeRequestId: action.requestId,
        lastStable:
          state.status === "needs_clarification" || state.status === "ready_for_confirmation"
            ? state.status
            : "idle",
      };

    case "analyze_result": {
      if (state.status !== "extracting" || !matches(state, action.requestId)) return state;
      const result = action.result;
      if (result.status === "error") {
        const fallback = state.lastStable;
        return {
          ...state,
          status: fallback === "idle" ? "error" : fallback,
          message: result.message,
          activeRequestId: null,
        };
      }
      return {
        ...state,
        status: result.status,
        requirement: result.requirement,
        questions: result.status === "needs_clarification" ? result.questions : [],
        round: result.round,
        weather: result.weather,
        usedFallback: result.usedFallback,
        message: null,
        modifying: false,
        activeRequestId: null,
        lastStable: result.status,
      };
    }

    case "request_failed": {
      if (!isRequirementFlowBusy(state) || !matches(state, action.requestId)) return state;
      const fallback = state.status === "generating" || state.status === "validating"
        ? "ready_for_confirmation"
        : state.lastStable;
      return {
        ...state,
        status: fallback === "idle" ? "error" : fallback,
        message: action.message,
        activeRequestId: null,
      };
    }

    case "validate_start":
      // 只能从确认卡进入；generating 中重复点击会被忽略，避免重复生成
      if (state.status !== "ready_for_confirmation" || !state.requirement) return state;
      return {
        ...state,
        status: "validating",
        message: null,
        modifying: false,
        activeRequestId: action.requestId,
        lastStable: "ready_for_confirmation",
      };

    case "validate_ok":
      if (state.status !== "validating" || !matches(state, action.requestId)) return state;
      return { ...state, status: "generating", requirement: action.requirement };

    case "generate_done":
      if (state.status !== "generating" || !matches(state, action.requestId)) return state;
      return createInitialRequirementFlowState(null);

    case "modify":
      if (state.status !== "ready_for_confirmation") return state;
      return { ...state, modifying: true, message: null };

    case "cancel":
      // 生成中不可取消（服务端已在执行）；其它状态取消并作废进行中的请求
      if (state.status === "generating") return state;
      return createInitialRequirementFlowState(null);

    default:
      return state;
  }
}
