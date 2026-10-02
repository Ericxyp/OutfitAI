import { ChatBox } from "@/components/chat-box";
import { createClient } from "@/lib/supabase/server";

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

export default async function HomePage() {
  // 只把 user.id 传给客户端，用于按账号隔离本地天气位置记忆
  const userId = await getCurrentUserId();

  return (
    <div className="h-full min-h-0">
      <ChatBox key={userId ?? "anonymous"} userId={userId} />
    </div>
  );
}
