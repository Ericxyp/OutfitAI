/**
 * 测试辅助：在 Next.js 请求上下文之外运行工作流时，next/cache 的 revalidatePath 会抛错。
 * 本模块必须在被测模块之前 import，用空实现替换 require 缓存中的 next/cache。
 */
const resolved = require.resolve("next/cache");
const stub = {
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: <T>(fn: T) => fn,
  unstable_noStore: () => {},
};
require.cache[resolved] = {
  id: resolved,
  filename: resolved,
  loaded: true,
  exports: stub,
} as unknown as NodeJS.Module;

export {};
