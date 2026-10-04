import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { ChatProvider } from "@/components/chat-provider";
import { createClient } from "@/lib/supabase/server";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#FAFAF8",
};

/** 服务端读取当前登录用户的 id（只传 id 给客户端，用于本地存储按账号隔离） */
async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userId = await getCurrentUserId();

  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} antialiased`}>
        {/*
          ChatProvider 位于根布局：首页 / 衣橱 / 我的 之间的站内切换不会卸载它，
          首页的需求解析与推荐生成在切页后继续运行。不要给它加随路由变化的 key。
          登录 / 退出后 router.refresh() 或 Server Action redirect 会刷新 userId。
        */}
        <ChatProvider userId={userId}>
          <AppShell>{children}</AppShell>
        </ChatProvider>
      </body>
    </html>
  );
}
