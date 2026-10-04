/**
 * 测试辅助：拦截 OpenAI SDK（DashScope 兼容接口）的 fetch，
 * 模拟 chat.completions 与 embeddings，记录请求体。不访问网络、不消耗额度。
 */
export type ChatRequest = {
  model: string;
  messages: Array<{ role: string; content: string }>;
};

export type QwenMock = {
  chatRequests: ChatRequest[];
  embeddingInputs: string[];
  /** 根据请求返回模型输出（JSON 字符串） */
  chatHandler: (request: ChatRequest, index: number) => string;
  embeddingMode: "ok" | "fail";
  restore: () => void;
};

export function installQwenFetchMock(): QwenMock {
  process.env.QWEN_API_KEY = "test-qwen-key";
  process.env.QWEN_BASE_URL = "https://qwen.test/v1";
  const original = globalThis.fetch;
  const mock: QwenMock = {
    chatRequests: [],
    embeddingInputs: [],
    chatHandler: () => "{}",
    embeddingMode: "ok",
    restore: () => {
      globalThis.fetch = original;
    },
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const json = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

    if (url.endsWith("/embeddings")) {
      mock.embeddingInputs.push(String(body.input));
      if (mock.embeddingMode === "fail") return json(500, { error: { message: "embedding service down" } });
      const vector = [0.1, 0.2, 0.3];
      // OpenAI SDK 默认请求 base64 编码并在客户端解码
      const embedding =
        body.encoding_format === "base64"
          ? Buffer.from(new Float32Array(vector).buffer).toString("base64")
          : vector;
      return json(200, { object: "list", data: [{ object: "embedding", index: 0, embedding }], model: "mock" });
    }

    if (url.endsWith("/chat/completions")) {
      const request = body as ChatRequest;
      mock.chatRequests.push(request);
      const content = mock.chatHandler(request, mock.chatRequests.length - 1);
      return json(200, {
        id: "chatcmpl-mock",
        object: "chat.completion",
        created: 0,
        model: request.model,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
      });
    }

    return json(404, { error: { message: "unexpected url" } });
  }) as typeof fetch;

  return mock;
}
