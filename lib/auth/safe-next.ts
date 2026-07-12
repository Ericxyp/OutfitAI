/**
 * 仅允许站内相对路径，防止开放重定向。
 */
export function getSafeNextPath(next?: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}
