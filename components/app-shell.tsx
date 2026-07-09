"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";

const HIDE_NAV_PATHS = ["/login", "/auth/callback"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNav = HIDE_NAV_PATHS.some((path) => pathname.startsWith(path));

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col overflow-hidden bg-background">
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
