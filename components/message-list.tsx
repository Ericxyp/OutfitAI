import Link from "next/link";
import { PAGE_COPY } from "@/lib/constants";
import type { RecommendationResult } from "@/lib/actions/recommendation";
import { OutfitResultCard } from "@/components/outfit-result-card";

export {
  CHAT_MESSAGES_STORAGE_KEY,
  isValidChatMessage,
  parseStoredChatMessages,
  type ChatMessage,
} from "@/lib/chat/message-storage";
import type { ChatMessage } from "@/lib/chat/message-storage";

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end pl-8">
      <div className="max-w-[88%] rounded-2xl rounded-br-sm bg-foreground px-4 py-2.5 text-sm leading-relaxed text-background">
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  isError,
  actionHref,
  actionLabel,
}: {
  content: string;
  isError?: boolean;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex justify-start pr-8">
      <div
        className={`max-w-[88%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm ring-1 ${
          isError
            ? "bg-red-50 text-red-800 ring-red-100"
            : "bg-card text-foreground ring-border/60"
        }`}
      >
        <p>{content}</p>
        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="mt-3 inline-flex rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
          >
            {actionLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

function LoadingBubble() {
  return (
    <div className="flex justify-start pr-8">
      <div className="rounded-2xl rounded-bl-sm bg-card px-4 py-3 shadow-sm ring-1 ring-border/60">
        <div className="flex items-center gap-2.5 text-sm text-muted">
          <span className="inline-flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/80 [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/80 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted/80 [animation-delay:300ms]" />
          </span>
          {PAGE_COPY.home.loading}
        </div>
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  isLoading,
  onRegenerate,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
  onRegenerate: (recommendation: RecommendationResult) => void;
}) {
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center py-6">
        <div className="w-full rounded-2xl bg-card/80 px-5 py-8 text-center ring-1 ring-border/50">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3c-1.5 2.5-4 4.5-4 8a4 4 0 0 0 8 0c0-3.5-2.5-5.5-4-8z"
                stroke="#111111"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 18.5h5"
                stroke="#111111"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            {PAGE_COPY.home.emptyHint}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-2">
      {messages.map((message) => {
        if (message.role === "user") {
          return <UserBubble key={message.id} content={message.content} />;
        }

        if (message.role === "assistant") {
          return (
            <AssistantBubble
              key={message.id}
              content={message.content}
              isError={message.isError}
              actionHref={message.actionHref}
              actionLabel={message.actionLabel}
            />
          );
        }

        return (
          <div key={message.id} className="w-full min-w-0">
            <OutfitResultCard
              recommendation={message.recommendation}
              onRegenerate={() => onRegenerate(message.recommendation)}
            />
          </div>
        );
      })}
      {isLoading && <LoadingBubble />}
    </div>
  );
}
