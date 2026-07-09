import OpenAI from "openai";

export function createQwenClient(): OpenAI {
  const apiKey = process.env.QWEN_API_KEY;

  if (!apiKey) {
    throw new Error("QWEN_API_KEY 未配置，请在 .env.local 中设置 QWEN_API_KEY");
  }

  return new OpenAI({
    apiKey,
    baseURL:
      process.env.QWEN_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    timeout: 60000,
    maxRetries: 0,
  });
}

export function getQwenModel(): string {
  return process.env.QWEN_MODEL || "qwen3-vl-plus";
}

export function getQwenBaseUrl(): string {
  return (
    process.env.QWEN_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  );
}

export function getQwenErrorDetails(error: unknown): {
  name: string;
  message: string;
  status?: number;
  code?: string | null;
  type?: string;
} {
  if (error instanceof OpenAI.APIError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.type,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

export function formatQwenError(error: unknown): string {
  const details = getQwenErrorDetails(error);
  const parts = [details.message];
  if (details.status) parts.push(`HTTP ${details.status}`);
  if (details.code) parts.push(`code=${details.code}`);
  if (details.type) parts.push(`type=${details.type}`);
  return parts.join(" | ");
}

export function isQwenTimeoutError(error: unknown): boolean {
  const message = formatQwenError(error).toLowerCase();
  return message.includes("timeout") || message.includes("timed out");
}

export const QWEN_UNAVAILABLE_RECOMMENDATION =
  "Qwen 暂时无法生成穿搭，请稍后再试。" as const;
