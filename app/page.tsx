import { ChatBox } from "@/components/chat-box";

export default function HomePage() {
  // 当前用户由根布局读取并交给 ChatProvider；ChatBox 只负责展示
  return (
    <div className="h-full min-h-0">
      <ChatBox />
    </div>
  );
}
