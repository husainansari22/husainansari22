"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Menu, Sparkles, Code, PenLine, Lightbulb, Globe } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { SettingsPanel } from "./SettingsPanel";
import { ChatSettings, Conversation, DEFAULT_SETTINGS, Message } from "@/types/chat";
import { loadConversations, loadSettings, saveConversations, saveSettings } from "@/lib/storage";
import { generateTitle, streamChatResponse } from "@/lib/chat-client";

const SUGGESTIONS = [
  { icon: Code, text: "Write a Python web scraper for news headlines" },
  { icon: PenLine, text: "Help me draft a compelling product launch email" },
  { icon: Lightbulb, text: "Explain quantum computing like I'm 12" },
  { icon: Globe, text: "Plan a 2-week trip to Japan on a budget" },
];

export function ChatApp() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConversations(loadConversations());
    setSettings(loadSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveConversations(conversations);
  }, [conversations, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveSettings(settings);
  }, [settings, hydrated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, activeId, isLoading]);

  const activeConversation = conversations.find((c) => c.id === activeId) || null;
  const visibleMessages = activeConversation?.messages.filter((m) => m.role !== "system") || [];

  const updateConversation = useCallback(
    (id: string, updater: (conv: Conversation) => Conversation) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
    },
    []
  );

  const createConversation = useCallback((): Conversation => {
    const conv: Conversation = {
      id: uuidv4(),
      title: "New conversation",
      messages: settings.systemPrompt
        ? [{ id: uuidv4(), role: "system", content: settings.systemPrompt, createdAt: Date.now() }]
        : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    return conv;
  }, [settings.systemPrompt]);

  const handleNewChat = () => {
    createConversation();
    setInput("");
    setError(null);
  };

  const handleDelete = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    let conv = activeConversation;
    if (!conv) conv = createConversation();

    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };

    const assistantId = uuidv4();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };

    const convId = conv.id;
    const isFirstUserMessage = conv.messages.filter((m) => m.role === "user").length === 0;

    updateConversation(convId, (c) => ({
      ...c,
      title: isFirstUserMessage ? generateTitle(trimmed) : c.title,
      messages: [...c.messages, userMessage, assistantMessage],
      updatedAt: Date.now(),
    }));

    setInput("");
    setIsLoading(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const currentConv = conversations.find((c) => c.id === convId) || conv;
      const allMessages = [
        ...currentConv.messages.filter((m) => m.role === "system"),
        ...(settings.systemPrompt && !currentConv.messages.some((m) => m.role === "system")
          ? [{ id: uuidv4(), role: "system" as const, content: settings.systemPrompt, createdAt: Date.now() }]
          : []),
        ...currentConv.messages.filter((m) => m.role !== "system"),
        userMessage,
      ];

      await streamChatResponse(
        allMessages,
        settings,
        (content) => {
          updateConversation(convId, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantId ? { ...m, content } : m
            ),
            updatedAt: Date.now(),
          }));
        },
        abortRef.current.signal
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      updateConversation(convId, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== assistantId),
      }));
    } finally {
      setIsLoading(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="flex items-center gap-3 text-zinc-400">
          <Sparkles className="animate-pulse text-violet-400" size={24} />
          Loading Unbound AI…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={handleNewChat}
        onDelete={handleDelete}
        onOpenSettings={() => setShowSettings(true)}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 lg:hidden"
            aria-label="Open sidebar"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-medium text-white">
              {activeConversation?.title || "Unbound AI"}
            </h2>
            <p className="text-xs text-zinc-500">
              {settings.model} · {settings.baseUrl.replace(/^https?:\/\//, "").split("/")[0]}
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          {visibleMessages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600/20 ring-1 ring-violet-500/30">
                <Sparkles size={32} className="text-violet-400" />
              </div>
              <h1 className="mb-2 text-3xl font-bold tracking-tight text-white">
                Ask anything.
              </h1>
              <p className="mb-10 max-w-md text-zinc-400">
                Unbound AI connects to any OpenAI-compatible model. No message caps, no topic
                blocks — just pure conversation powered by your API key.
              </p>
              <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                {SUGGESTIONS.map(({ icon: Icon, text }) => (
                  <button
                    key={text}
                    onClick={() => sendMessage(text)}
                    className="flex items-start gap-3 rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-left text-sm text-zinc-300 transition hover:border-violet-500/30 hover:bg-violet-600/10 hover:text-white"
                  >
                    <Icon size={18} className="mt-0.5 shrink-0 text-violet-400" />
                    {text}
                  </button>
                ))}
              </div>
              {!settings.apiKey && !process.env.NEXT_PUBLIC_HAS_SERVER_KEY && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="mt-8 text-sm text-violet-400 underline underline-offset-2 hover:text-violet-300"
                >
                  Add your API key in Settings to get started →
                </button>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {visibleMessages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isStreaming={
                    isLoading &&
                    message.role === "assistant" &&
                    message.id === visibleMessages[visibleMessages.length - 1]?.id
                  }
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {error && (
          <div className="mx-auto mb-2 max-w-3xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="border-t border-white/10 bg-zinc-950/80 px-4 py-4 backdrop-blur lg:px-8">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={() => sendMessage(input)}
            isLoading={isLoading}
          />
        </div>
      </main>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
