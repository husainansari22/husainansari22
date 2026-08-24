"use client";

import { Bot, User } from "lucide-react";
import { Message } from "@/types/chat";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} animate-fade-in`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          isUser
            ? "bg-violet-600 text-white"
            : "bg-zinc-800 text-violet-300 ring-1 ring-white/10"
        }`}
      >
        {isUser ? <User size={18} /> : <Bot size={18} />}
      </div>

      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-violet-600/90 text-white"
            : "bg-zinc-900/80 text-zinc-100 ring-1 ring-white/10 backdrop-blur"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-7">{message.content}</p>
        ) : (
          <div className="prose-invert text-[15px]">
            {message.content ? (
              <MarkdownRenderer content={message.content} />
            ) : isStreaming ? (
              <span className="inline-flex items-center gap-1 text-zinc-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400 [animation-delay:300ms]" />
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
