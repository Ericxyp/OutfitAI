/**
 * ChatProvider 浏览器集成测试的页面入口（由 scripts/e2e/chat-provider.e2e.mjs 打包）。
 *
 * - 真实挂载 ChatProvider + ChatBox，并用 React StrictMode 包裹；
 * - 用一个极简“路由”模拟 Next.js App Router 的页面段切换：
 *   Provider 在根部常驻，切到“衣橱 / 我的”时首页 ChatBox 会真实卸载；
 * - 所有 Server Action 在打包时被替换为 window.__serverActions 中的 mock，
 *   需求解析使用真实的 analyzeRequirement（模型关闭、天气 / 衣橱 mock），不消耗任何额度。
 */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatBox } from "@/components/chat-box";
import { ChatProvider } from "@/components/chat-provider";
import {
  analyzeRequirement,
  validateRequirementForGeneration,
  type RequirementAgentDeps,
} from "@/lib/requirements/agent";

type Gate = { promise: Promise<void>; release: () => void };
type Harness = {
  calls: Record<string, number>;
  args: Record<string, unknown[]>;
  holds: Record<string, Gate | undefined>;
  hold: (kind: string) => void;
  release: (kind: string) => void;
  recCount: number;
};

declare global {
  interface Window {
    __serverActions: Record<string, Record<string, (...args: unknown[]) => unknown>>;
    __harness: Harness;
  }
}

const harness: Harness = {
  calls: {},
  args: {},
  holds: {},
  hold(kind) {
    let release = () => {};
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    harness.holds[kind] = { promise, release };
  },
  release(kind) {
    harness.holds[kind]?.release();
    harness.holds[kind] = undefined;
  },
  recCount: 0,
};
window.__harness = harness;

async function track(kind: string, args: unknown[]) {
  harness.calls[kind] = (harness.calls[kind] ?? 0) + 1;
  harness.args[kind] = args;
  const gate = harness.holds[kind];
  if (gate) await gate.promise;
}

const CITY: Record<string, string> = { 北京: "Beijing", Beijing: "Beijing", 上海: "Shanghai", Shanghai: "Shanghai" };
const deps: RequirementAgentDeps = {
  modelClient: null,
  lookupWeather: async (location) => {
    const query = location.type === "city" ? CITY[location.city] : "Shanghai";
    if (!query) return { status: "not_found" };
    return {
      status: "success",
      weather: { source: "mock", locationName: query, temperatureC: 19, condition: "小雨" },
      displayName: `${query}, China`,
      query,
    };
  },
  loadClosetItems: async () => [],
  now: () => new Date(),
};

function fakeRecommendation(title: string) {
  harness.recCount += 1;
  return {
    id: `rec-${harness.recCount}`,
    requestText: "明天去朝阳公园穿什么\n\n已确认需求：场景：户外休闲",
    title,
    selectedItemIds: ["item-1"],
    summary: "摘要",
    reasoning: "理由",
    styleTags: [],
    occasion: "户外休闲",
    alternatives: [],
    items: [],
  };
}

const GENERATION_OPTIONS = {
  location: { type: "city", city: "Beijing" },
  targetDate: "2026-10-04",
  requirementNotes: "避免：花哨",
};

window.__serverActions = {
  "lib/actions/requirement.ts": {
    analyzeOutfitRequirement: async (...args) => {
      await track("analyze", args);
      return (await analyzeRequirement(args[0] as Record<string, unknown>, deps)).result;
    },
    validateOutfitRequirement: async (...args) => {
      await track("validate", args);
      const input = args[0] as { requirement: unknown; timeZone?: string };
      const outcome = await validateRequirementForGeneration(input.requirement, input, deps);
      return outcome.status === "valid"
        ? { status: "valid", requirement: outcome.requirement }
        : { status: "invalid", message: outcome.message };
    },
    confirmOutfitRequirement: async (...args) => {
      await track("confirm", args);
      return {
        success: true,
        recommendation: fakeRecommendation(`测试推荐 #${harness.recCount + 1}`),
        generationOptions: GENERATION_OPTIONS,
      };
    },
    trackRequirementAction: async (...args) => {
      await track("trackAction", args);
    },
  },
  "lib/actions/recommendation.ts": {
    generateRecommendation: async (...args) => {
      await track("generateRecommendation", args);
      return { success: false, error: "should not be called" };
    },
    regenerateRecommendation: async (...args) => {
      await track("regenerate", args);
      return { success: true, recommendation: fakeRecommendation(`换一套结果 #${harness.recCount + 1}`) };
    },
  },
  "lib/actions/weather.ts": {
    resolveWeatherLocation: async () => ({
      status: "success",
      location: { type: "city", city: "Shanghai" },
      displayName: "Shanghai, China",
      weather: null,
    }),
    reportGeolocationFailure: async () => {},
  },
};

const USERS: Record<string, string | null> = {
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
  anon: null,
};

function App() {
  const [route, setRoute] = useState("/");
  const [userKey, setUserKey] = useState("a");
  const userId = USERS[userKey];

  return (
    // 模拟根布局：Provider 常驻，只随真实账号变化更新 userId，不随路由变化重建
    <ChatProvider userId={userId}>
      <nav style={{ display: "flex", gap: 8, padding: 4, fontSize: 12 }}>
        <button id="nav-home" onClick={() => setRoute("/")}>首页</button>
        <button id="nav-closet" onClick={() => setRoute("/closet")}>衣橱</button>
        <button id="nav-profile" onClick={() => setRoute("/profile")}>我的</button>
        <button id="user-a" onClick={() => setUserKey("a")}>A</button>
        <button id="user-b" onClick={() => setUserKey("b")}>B</button>
        <button id="user-anon" onClick={() => setUserKey("anon")}>匿名</button>
        <span id="route">{route}</span>
      </nav>
      <div style={{ height: "640px" }}>
        {route === "/" ? (
          <ChatBox />
        ) : (
          <div id="other-page">{route === "/closet" ? "衣橱页面" : "我的页面"}</div>
        )}
      </div>
    </ChatProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
