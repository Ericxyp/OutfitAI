/**
 * 轻量服务端日志：开发环境输出 debug/info，生产默认仅 warn/error。
 * 调用方勿传入 API key、完整 base64、完整用户输入或 error.stack。
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, string | number | boolean | null | undefined>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function minLevel(): LogLevel {
  return isProduction() ? "warn" : "debug";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel()];
}

function write(
  level: LogLevel,
  message: string,
  meta?: LogMeta
): void {
  if (!shouldLog(level)) return;

  const payload =
    meta && Object.keys(meta).length > 0 ? { message, ...meta } : message;

  switch (level) {
    case "debug":
    case "info":
      console.log(payload);
      break;
    case "warn":
      console.warn(payload);
      break;
    case "error":
      console.error(payload);
      break;
  }
}

/** 从未知错误提取可安全记录的 name/message（不含 stack） */
export function safeErrorFields(error: unknown): {
  errorName: string;
  errorMessage: string;
} {
  if (error instanceof Error) {
    return {
      errorName: error.name || "Error",
      errorMessage: error.message.slice(0, 200),
    };
  }
  return {
    errorName: "UnknownError",
    errorMessage: String(error).slice(0, 200),
  };
}

export const logger = {
  debug(message: string, meta?: LogMeta) {
    write("debug", message, meta);
  },
  info(message: string, meta?: LogMeta) {
    write("info", message, meta);
  },
  warn(message: string, meta?: LogMeta) {
    write("warn", message, meta);
  },
  error(message: string, meta?: LogMeta) {
    write("error", message, meta);
  },
};
