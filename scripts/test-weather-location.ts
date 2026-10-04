/**
 * 天气位置（浏览器定位 + 手动城市）测试。
 * 运行：npm run test:weather-location
 *
 * 全部使用 mock fetch，不会请求真实 WeatherAPI，也不需要真实 Key。
 */
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import path from "path";
import {
  buildCityQueryCandidates,
  getWeatherByCity,
  getWeatherByCoordinates,
  lookupWeatherByCity,
  lookupWeatherByCoordinates,
} from "@/lib/weather";
import {
  buildWeatherLocationEventMetadata,
  CITY_INPUT_MAX_LENGTH,
  formatWeatherSummary,
  mapGeolocationErrorCode,
  normalizeWeatherLocationInput,
  validateCityInput,
  WEATHER_LOCATION_MESSAGES,
} from "@/lib/weather-location";
import {
  clearStoredWeatherLocation,
  createStoredWeatherLocation,
  getWeatherLocationStorageKey,
  readStoredWeatherLocation,
  toRequestLocation,
  writeStoredWeatherLocation,
  type StorageLike,
} from "@/lib/weather-location-storage";
import {
  createInitialWeatherLocationState,
  weatherLocationReducer,
  type WeatherLocationState,
} from "@/lib/weather-location-state";
import { resolveWeatherContext } from "@/lib/ai/workflows/outfit-workflow";
import { scoreWeatherMatch } from "@/lib/recommendation/rule-engine";
import { formatWeatherContextBlock } from "@/lib/weather-guidance";
import { sanitizeMetadata } from "@/lib/analytics/track-event";
import type { ClosetItem } from "@/types/database";

const TEST_KEY = "TEST_SECRET_WEATHER_KEY_9f8e7d";
const ROOT = path.resolve(__dirname, "..");

// ---------- 测试基础设施 ----------

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const capturedLogs: string[] = [];
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};
for (const level of ["log", "warn", "error"] as const) {
  console[level] = (...args: unknown[]) => {
    capturedLogs.push(
      args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ")
    );
  };
}
function pass(name: string) {
  originalConsole.log(`[PASS] ${name}`);
}

type MockHandler = (url: URL) => Response | Promise<Response>;
const fetchCalls: URL[] = [];
let mockHandler: MockHandler = () => {
  throw new Error("fetch handler not configured");
};
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(typeof input === "string" ? input : input.toString());
  fetchCalls.push(url);
  return mockHandler(url);
}) as typeof fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function weatherBody(name: string, country: string, condition = "小雨", temp = 21) {
  return {
    location: { name, region: name, country, lat: 31.23, lon: 121.47 },
    current: {
      temp_c: temp,
      feelslike_c: temp,
      humidity: 85,
      wind_kph: 12,
      last_updated: "2026-10-02 12:00",
      condition: { text: condition },
    },
  };
}

const NOT_FOUND = jsonResponse.bind(null, 400, {
  error: { code: 1006, message: "No matching location found." },
});

/** 模拟 WeatherAPI：只识别英文城市名与坐标 */
const realisticHandler: MockHandler = (url) => {
  const q = url.searchParams.get("q") ?? "";
  if (url.searchParams.get("key") !== TEST_KEY) {
    return jsonResponse(401, { error: { code: 2006, message: "API key is invalid." } });
  }
  const known: Record<string, [string, string]> = {
    Shanghai: ["Shanghai", "China"],
    Sydney: ["Sydney", "Australia"],
    绍兴: ["Shaoxing", "China"],
  };
  if (known[q]) return jsonResponse(200, weatherBody(...known[q]));
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(q)) {
    return jsonResponse(200, weatherBody("Shanghai", "China", "晴", 25));
  }
  return NOT_FOUND();
};

function resetMocks(handler: MockHandler = realisticHandler) {
  fetchCalls.length = 0;
  mockHandler = handler;
  process.env.WEATHER_API_KEY = TEST_KEY;
  process.env.WEATHER_API_BASE_URL = "https://api.weatherapi.test/v1";
}

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const allResults: unknown[] = [];

// ---------- 1. 中文城市 ----------
async function testChineseCity() {
  resetMocks();
  for (const input of ["上海", "上海市", "  上海  "]) {
    const result = await lookupWeatherByCity(input);
    allResults.push(result);
    assert(result.status === "success", `${input} should succeed`);
    assert(result.displayName === "Shanghai, China", "standard name");
    assert(result.query === "Shanghai", "alias query used");
    assert(result.weather.condition === "小雨", "condition mapped");
  }

  // 不在别名表中的中文城市：原文经 encodeURIComponent 后直接查询
  resetMocks();
  const shaoxing = await lookupWeatherByCity("绍兴");
  assert(shaoxing.status === "success", "绍兴 succeeds via raw query");
  const rawUrl = fetchCalls[0].toString();
  assert(rawUrl.includes(`q=${encodeURIComponent("绍兴")}`), "chinese query encoded");
  assert(!rawUrl.includes("q=绍兴"), "no raw unicode in url");
  assert(fetchCalls[0].searchParams.get("lang") === "zh", "lang=zh requested");
  pass("中文城市输入成功（上海 / 上海市 / 未收录城市）");
}

// ---------- 2. 英文城市 ----------
async function testEnglishCity() {
  resetMocks();
  for (const input of ["Shanghai", "Sydney"]) {
    const result = await lookupWeatherByCity(input);
    allResults.push(result);
    assert(result.status === "success", `${input} should succeed`);
  }
  const sydney = await lookupWeatherByCity("Sydney");
  assert(sydney.status === "success" && sydney.displayName === "Sydney, Australia", "sydney name");

  resetMocks();
  await lookupWeatherByCity("New York & <script>");
  assert(
    fetchCalls[0].toString().includes(encodeURIComponent("New York & <script>")),
    "special chars are encoded, not injected as extra params"
  );
  assert(fetchCalls[0].searchParams.get("key") === TEST_KEY, "key param not overridden");
  pass("英文城市输入成功，特殊字符经过编码");
}

// ---------- 3/4/5. 输入校验 ----------
async function testInvalidInputs() {
  resetMocks();
  const invalid: unknown[] = [
    "",
    "   ",
    "a".repeat(CITY_INPUT_MAX_LENGTH + 1),
    "上".repeat(CITY_INPUT_MAX_LENGTH + 1),
    "Shang\nhai",
    "Shanghai\n",
    "Shang\u0000hai",
    "Shang\thai",
    "Shang‮hai",
    "!!!",
    null,
    123,
    { city: "Shanghai" },
  ];
  for (const input of invalid) {
    assert(!validateCityInput(input).ok, `client validation rejects ${JSON.stringify(input)}`);
    const result = await lookupWeatherByCity(input);
    allResults.push(result);
    assert(result.status === "invalid_input", `server rejects ${JSON.stringify(input)}`);
  }
  assert(fetchCalls.length === 0, "invalid input never reaches WeatherAPI");
  assert(validateCityInput("a".repeat(CITY_INPUT_MAX_LENGTH)).ok, "80 chars accepted");
  assert(
    WEATHER_LOCATION_MESSAGES.invalid_input === "请输入有效的城市名称。",
    "invalid message"
  );
  pass("空城市 / 超长城市 / 换行与控制字符被拒绝，且不请求上游");
}

// ---------- 6. not_found ----------
async function testNotFound() {
  resetMocks();
  const result = await lookupWeatherByCity("Xyzzyqwertyville");
  assert(result.status === "not_found", "unknown city → not_found");
  assert(fetchCalls.length === 1, "single attempt for unknown english city");

  resetMocks();
  const cn = await lookupWeatherByCity("不存在市");
  assert(cn.status === "not_found", "unknown chinese city → not_found");
  assert(fetchCalls.length <= 2, "at most 2 upstream attempts");
  assert(
    WEATHER_LOCATION_MESSAGES.not_found === "没有找到这个城市，请检查名称后重试。",
    "not_found message"
  );
  assert(
    JSON.stringify(buildCityQueryCandidates("上海市")) === JSON.stringify(["Shanghai", "上海市"]),
    "candidates for 上海市"
  );
  pass("城市不存在时返回 not_found");
}

// ---------- 7. 超时降级 ----------
async function testTimeoutFallback() {
  resetMocks(() => {
    const error = new Error(
      `The operation was aborted. url=https://api.weatherapi.test/v1/current.json?key=${TEST_KEY}&q=Shanghai`
    );
    error.name = "AbortError";
    throw error;
  });
  const result = await lookupWeatherByCity("Shanghai");
  assert(result.status === "unavailable", "timeout → unavailable");

  const weather = await resolveWeatherContext({ type: "city", city: "Shanghai" });
  assert(weather === null, "workflow weather resolves to null on timeout");

  const coordWeather = await resolveWeatherContext({ type: "coordinates", latitude: 31.23, longitude: 121.47 });
  assert(coordWeather === null, "coordinates timeout resolves to null");

  // 无天气时规则引擎走中性分（原无天气推荐路径）
  const neutral = scoreWeatherMatch(sampleItem("防水风衣"), null);
  assert(neutral.score === 50, "neutral weather score without weather");

  // 5xx / 非 JSON 也降级
  resetMocks(() => new Response("upstream down", { status: 503 }));
  assert((await lookupWeatherByCity("Shanghai")).status === "unavailable", "503 → unavailable");
  resetMocks(() => jsonResponse(200, { unexpected: true }));
  assert((await lookupWeatherByCity("Shanghai")).status === "unavailable", "bad payload → unavailable");
  // 服务不可用时不应再尝试第二个候选
  resetMocks(() => new Response("down", { status: 500 }));
  await lookupWeatherByCity("上海");
  assert(fetchCalls.length === 1, "no retry amplification on unavailable");
  pass("WeatherAPI 超时 / 5xx / 异常响应时降级为无天气推荐");
}

// ---------- 8. 缺少 Key ----------
async function testMissingKey() {
  resetMocks();
  delete process.env.WEATHER_API_KEY;
  const result = await lookupWeatherByCity("Shanghai");
  assert(result.status === "unavailable", "missing key → unavailable");
  assert((await getWeatherByCity("Shanghai")) === null, "getWeatherByCity null");
  assert(
    (await resolveWeatherContext({ type: "city", city: "Shanghai" })) === null,
    "workflow continues without weather"
  );
  assert(
    (await resolveWeatherContext({ latitude: 31.2, longitude: 121.4 })) === null,
    "legacy coordinates continue without weather"
  );
  assert(fetchCalls.length === 0, "no upstream call without key");
  pass("没有 WEATHER_API_KEY 时不阻断普通推荐");
}

// ---------- 9. 浏览器拒绝定位 → 展开手动输入 ----------
async function testGeolocationDenied() {
  let state = createInitialWeatherLocationState(null);
  state = weatherLocationReducer(state, { type: "locate_start", requestId: 1 });
  assert(state.status === "locating", "locating");
  state = weatherLocationReducer(state, { type: "locate_failed", requestId: 1 });
  assert(state.status === "error", "error status");
  assert(state.isCityInputOpen, "city input auto expanded");
  assert(state.message === "无法获取当前位置，你可以手动输入城市。", "friendly message");
  assert(toRequestLocation(state.location) === undefined, "no location sent, recommendation still allowed");
  assert(mapGeolocationErrorCode(1) === "permission_denied", "code 1");
  assert(mapGeolocationErrorCode(3) === "timeout", "code 3");
  assert(mapGeolocationErrorCode(2) === "unavailable", "code 2");
  assert(mapGeolocationErrorCode(undefined) === "unavailable", "unsupported device");

  // 之后可以直接手动输入城市
  state = weatherLocationReducer(state, { type: "city_query_start", requestId: 2 });
  state = weatherLocationReducer(state, {
    type: "city_query_succeeded",
    requestId: 2,
    location: createStoredWeatherLocation({ type: "city", city: "Shanghai" }, "Shanghai, China"),
    weather: { locationName: "Shanghai", temperatureC: 21, condition: "小雨" },
  });
  assert(state.status === "success" && !state.isCityInputOpen, "manual city after denial");
  assert(
    formatWeatherSummary(state.weather!, state.location!.displayName) === "Shanghai · 小雨 · 21°C",
    "weather summary text"
  );
  pass("浏览器拒绝定位后自动展开手动输入，且可继续选择城市");
}

// ---------- 并发 / 竞态 ----------
async function testConcurrency() {
  const shanghai = createStoredWeatherLocation({ type: "city", city: "Shanghai" }, "Shanghai, China");
  const sydney = createStoredWeatherLocation({ type: "city", city: "Sydney" }, "Sydney, Australia");

  let state: WeatherLocationState = createInitialWeatherLocationState(null);
  state = weatherLocationReducer(state, { type: "city_query_start", requestId: 1 });
  // 查询中不能再开始定位或另一次查询
  const blocked = weatherLocationReducer(state, { type: "locate_start", requestId: 2 });
  assert(blocked === state, "cannot locate while querying city");
  const blocked2 = weatherLocationReducer(state, { type: "city_query_start", requestId: 3 });
  assert(blocked2.activeRequestId === 1, "cannot start second query concurrently");

  // 取消后旧请求晚到：被忽略
  state = weatherLocationReducer(state, { type: "city_input_cancel" });
  state = weatherLocationReducer(state, { type: "city_query_succeeded", requestId: 1, location: shanghai, weather: null });
  assert(state.location === null, "stale result after cancel ignored");

  // 后发请求覆盖先发请求
  state = weatherLocationReducer(state, { type: "city_query_start", requestId: 4 });
  state = weatherLocationReducer(state, { type: "city_input_cancel" });
  state = weatherLocationReducer(state, { type: "city_query_start", requestId: 5 });
  state = weatherLocationReducer(state, { type: "city_query_succeeded", requestId: 4, location: shanghai, weather: null });
  assert(state.location === null && state.status === "querying_city", "older response ignored");
  state = weatherLocationReducer(state, { type: "city_query_succeeded", requestId: 5, location: sydney, weather: null });
  assert(state.location?.displayName === "Sydney, Australia", "latest response wins");

  // 失败不会覆盖已有位置
  state = weatherLocationReducer(state, { type: "city_query_start", requestId: 6 });
  state = weatherLocationReducer(state, { type: "city_query_failed", requestId: 6, status: "not_found" });
  assert(state.location?.displayName === "Sydney, Australia", "failed query keeps previous location");
  assert(state.message === WEATHER_LOCATION_MESSAGES.not_found, "not_found message shown");
  pass("定位与查询互斥；取消/后发请求可正确作废旧请求");
}

// ---------- 10/11. localStorage 隔离与校验 ----------
async function testStorageIsolation() {
  const storage = new MemoryStorage();
  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "22222222-2222-4222-8222-222222222222";

  assert(
    getWeatherLocationStorageKey(userA) === `outfitai.weather.location:${userA}`,
    "key format"
  );
  assert(getWeatherLocationStorageKey(null) === null, "no key for anonymous");
  assert(getWeatherLocationStorageKey("") === null, "no key for empty id");

  writeStoredWeatherLocation(
    storage,
    userA,
    createStoredWeatherLocation({ type: "city", city: "Shanghai" }, "Shanghai, China")
  );
  writeStoredWeatherLocation(
    storage,
    userB,
    createStoredWeatherLocation({ type: "coordinates", latitude: -33.87, longitude: 151.21 }, "Sydney")
  );
  assert(!writeStoredWeatherLocation(storage, null, createStoredWeatherLocation({ type: "city", city: "X" }, "X")), "anonymous not persisted");

  const a = readStoredWeatherLocation(storage, userA);
  const b = readStoredWeatherLocation(storage, userB);
  assert(a?.type === "city" && a.city === "Shanghai", "user A reads own city");
  assert(b?.type === "coordinates" && b.latitude === -33.87, "user B reads own coords");

  const stored = JSON.parse(storage.getItem(`outfitai.weather.location:${userA}`)!);
  assert(
    JSON.stringify(Object.keys(stored).sort()) === JSON.stringify(["city", "displayName", "type", "version"]),
    "only minimal fields stored"
  );

  clearStoredWeatherLocation(storage, userA);
  assert(readStoredWeatherLocation(storage, userA) === null, "A cleared");
  assert(readStoredWeatherLocation(storage, userB) !== null, "B untouched by A's clear");
  assert(storage.data.size === 1, "only one key remains");
  pass("localStorage 按 user.id 隔离，清除只影响当前用户");
}

async function testInvalidCache() {
  const storage = new MemoryStorage();
  const user = "33333333-3333-4333-8333-333333333333";
  const key = getWeatherLocationStorageKey(user)!;
  const badValues = [
    "not json{",
    "null",
    "[]",
    JSON.stringify({ type: "city", city: "Shanghai", displayName: "Shanghai" }), // 旧结构，无 version
    JSON.stringify({ version: 2, type: "city", city: "Shanghai", displayName: "S" }),
    JSON.stringify({ version: 1, type: "city", city: "Shang\nhai", displayName: "S" }),
    JSON.stringify({ version: 1, type: "city", city: "a".repeat(200), displayName: "S" }),
    JSON.stringify({ version: 1, type: "coordinates", latitude: 999, longitude: 0, displayName: "X" }),
    JSON.stringify({ version: 1, type: "coordinates", latitude: "31", longitude: 121, displayName: "X" }),
    JSON.stringify({ version: 1, type: "city", city: "Shanghai", displayName: "" }),
    JSON.stringify({ version: 1, type: "weird" }),
  ];
  for (const value of badValues) {
    storage.setItem(key, value);
    const result = readStoredWeatherLocation(storage, user);
    assert(result === null, `invalid cache rejected: ${value.slice(0, 40)}`);
    assert(storage.getItem(key) === null, "invalid cache deleted");
  }

  const throwing: StorageLike = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceeded");
    },
    removeItem() {
      throw new Error("SecurityError");
    },
  };
  assert(readStoredWeatherLocation(throwing, user) === null, "throwing storage read safe");
  assert(
    writeStoredWeatherLocation(throwing, user, createStoredWeatherLocation({ type: "city", city: "Shanghai" }, "S")) === false,
    "throwing storage write safe"
  );
  clearStoredWeatherLocation(throwing, user);
  assert(readStoredWeatherLocation(null, user) === null, "no storage safe");
  pass("非法 / 过期缓存被删除，存储异常不会导致崩溃");
}

// ---------- 12. 清除后不再发送旧位置 ----------
async function testClearStopsSending() {
  let state = createInitialWeatherLocationState(
    createStoredWeatherLocation({ type: "city", city: "Shanghai" }, "Shanghai, China")
  );
  assert(toRequestLocation(state.location)?.type === "city", "city sent before clear");

  // 清除时有进行中的定位请求
  state = weatherLocationReducer(state, { type: "locate_start", requestId: 9 });
  state = weatherLocationReducer(state, { type: "clear" });
  assert(toRequestLocation(state.location) === undefined, "nothing sent after clear");
  state = weatherLocationReducer(state, {
    type: "locate_succeeded",
    requestId: 9,
    location: createStoredWeatherLocation({ type: "coordinates", latitude: 1, longitude: 2 }, "X"),
    weather: null,
  });
  assert(state.location === null, "late geolocation result does not restore old location");
  assert(state.status === "idle", "idle after clear");

  // 切换账号（reset）同样作废旧请求
  state = weatherLocationReducer(state, { type: "city_query_start", requestId: 10 });
  state = weatherLocationReducer(state, { type: "reset", location: null });
  state = weatherLocationReducer(state, {
    type: "city_query_succeeded",
    requestId: 10,
    location: createStoredWeatherLocation({ type: "city", city: "Shanghai" }, "Shanghai, China"),
    weather: null,
  });
  assert(state.location === null, "account switch drops in-flight result");
  pass("清除位置 / 切换账号后推荐不再发送旧位置，旧请求不会写回");
}

// ---------- 13. API Key 不泄露 ----------
function collectLocalImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  // 跳过 `import type` / `export type`：仅类型引用会在编译期擦除，不进入 bundle
  const specs = [...source.matchAll(/(?:import|export)(?!\s+type\b)[^'"]*?from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g)]
    .map((match) => match[1] ?? match[2])
    .filter((spec) => spec.startsWith("@/") || spec.startsWith("."));
  const resolved: string[] = [];
  for (const spec of specs) {
    const base = spec.startsWith("@/")
      ? path.join(ROOT, spec.slice(2))
      : path.resolve(path.dirname(file), spec);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        resolved.push(candidate);
        break;
      }
    }
  }
  return resolved;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

async function testApiKeyNotLeaked() {
  // 返回值
  const serialized = JSON.stringify(allResults);
  assert(!serialized.includes(TEST_KEY), "key not in any lookup result");
  assert(!serialized.includes("api.weatherapi.test"), "request url not in results");

  // 日志（包括故意带 key 的上游错误）
  resetMocks(() => {
    throw new TypeError(`fetch failed for https://x/current.json?key=${TEST_KEY}&q=1`);
  });
  await lookupWeatherByCity("Shanghai");
  resetMocks(() => new Response(`bad key ${TEST_KEY}`, { status: 403 }));
  await lookupWeatherByCity("Shanghai");
  const logs = capturedLogs.join("\n");
  assert(capturedLogs.length > 0, "logs were captured");
  assert(!logs.includes(TEST_KEY), "key never logged");
  assert(!logs.includes("current.json?key="), "full url never logged");
  assert(!logs.includes("31.23,121.47"), "precise coordinates never logged");

  // 埋点 metadata
  const metadata = sanitizeMetadata(
    buildWeatherLocationEventMetadata({ source: "manual_city", reason: "not_found", hasWeather: false })
  );
  assert(
    JSON.stringify(Object.keys(metadata).sort()) === JSON.stringify(["hasWeather", "reason", "source"]),
    "metadata contains only whitelisted keys"
  );

  // 客户端 bundle：所有 "use client" 文件的本地依赖闭包（遇到 "use server" 停止）
  const clientEntries = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components"))].filter(
    (file) => /^\s*["']use client["']/.test(readFileSync(file, "utf8"))
  );
  assert(clientEntries.some((f) => f.endsWith("chat-box.tsx")), "chat-box is a client entry");
  const visited = new Set<string>();
  const queue = [...clientEntries];
  while (queue.length) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    if (/^\s*["']use server["']/.test(source)) continue; // Server Action 边界：只打包引用
    assert(!source.includes("WEATHER_API_KEY"), `client graph must not read WEATHER_API_KEY: ${path.relative(ROOT, file)}`);
    assert(!file.endsWith(path.join("lib", "weather.ts")), `client graph must not import lib/weather.ts (via ${path.relative(ROOT, file)})`);
    queue.push(...collectLocalImports(file));
  }
  assert(
    [...visited].some((f) => f.endsWith(path.join("lib", "actions", "weather.ts"))),
    "server action reached as boundary"
  );
  const publicLeak = walk(ROOT + "/lib").concat(walk(ROOT + "/components"), walk(ROOT + "/app"))
    .some((f) => readFileSync(f, "utf8").includes("NEXT_PUBLIC_WEATHER"));
  assert(!publicLeak, "no NEXT_PUBLIC_ weather key");
  pass("API Key 不出现在返回值、日志、埋点与客户端依赖图中");
}

// ---------- 14. 原经纬度流程 ----------
async function testCoordinatesFlow() {
  resetMocks();
  const result = await lookupWeatherByCoordinates({ latitude: 31.23, longitude: 121.47 });
  assert(result.status === "success", "coordinates success");
  assert(fetchCalls[0].searchParams.get("q") === "31.23,121.47", "coordinates query");
  assert(fetchCalls[0].toString().includes(`q=${encodeURIComponent("31.23,121.47")}`), "coordinates encoded");

  const legacy = await getWeatherByCoordinates({ latitude: 31.23, longitude: 121.47 });
  assert(legacy?.temperatureC === 25 && legacy.source === "weatherapi.com", "getWeatherByCoordinates still returns WeatherContext");

  const viaWorkflowLegacy = await resolveWeatherContext({ latitude: 31.23, longitude: 121.47 });
  assert(viaWorkflowLegacy?.condition === "晴", "legacy LocationInput still supported in workflow");
  const viaWorkflowNew = await resolveWeatherContext({ type: "coordinates", latitude: 31.23, longitude: 121.47 });
  assert(viaWorkflowNew !== null, "new coordinates input supported");
  assert((await resolveWeatherContext(undefined)) === null, "undefined → no weather");

  assert(normalizeWeatherLocationInput({ latitude: 91, longitude: 0 }) === null, "invalid lat rejected");
  assert(normalizeWeatherLocationInput({ type: "coordinates", latitude: NaN, longitude: 0 }) === null, "NaN rejected");
  assert(normalizeWeatherLocationInput({ type: "other" }) === null, "unknown type rejected");
  assert((await lookupWeatherByCoordinates({ latitude: 200, longitude: 0 })).status === "invalid_input", "invalid coords");
  pass("原有经纬度定位流程（含旧版 { latitude, longitude }）仍可用");
}

// ---------- 手动城市参与规则评分与提示词 ----------
function sampleItem(name: string): ClosetItem {
  return {
    id: "item-1",
    user_id: "u",
    image_url: null,
    name,
    category: "外套",
    color: "深色",
    material: "防水面料",
    style_tags: [],
    season_tags: [],
    occasion_tags: [],
    custom_style_tags: [],
    custom_occasion_tags: [],
    notes: null,
    status: "ready",
    embedding: null,
    embedding_text: null,
    embedding_updated_at: null,
    created_at: "",
    updated_at: "",
  } as ClosetItem;
}

async function testCityParticipatesInRecommendation() {
  resetMocks();
  const weather = await resolveWeatherContext({ type: "city", city: "上海" });
  assert(weather !== null, "city weather resolved in workflow");
  const scored = scoreWeatherMatch(sampleItem("防水风衣"), weather);
  assert(scored.score > 50, "rain weather boosts waterproof item");
  assert(scored.reasons.some((r) => r.includes("雨天")), "rain reason present");
  const block = formatWeatherContextBlock(weather);
  assert(block.includes("Shanghai") && block.includes("小雨"), "prompt block contains city weather");
  pass("手动城市天气参与规则评分与 AI 提示词");
}

async function main() {
  const tests = [
    testChineseCity,
    testEnglishCity,
    testInvalidInputs,
    testNotFound,
    testTimeoutFallback,
    testMissingKey,
    testGeolocationDenied,
    testConcurrency,
    testStorageIsolation,
    testInvalidCache,
    testClearStopsSending,
    testCoordinatesFlow,
    testCityParticipatesInRecommendation,
    testApiKeyNotLeaked,
  ];
  for (const test of tests) {
    await test();
  }
  originalConsole.log("\nAll weather location tests passed.");
}

main().catch((error) => {
  originalConsole.error(error);
  process.exit(1);
});
