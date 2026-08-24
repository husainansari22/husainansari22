"use client";

import { Plus, MessageSquare, Trash2, Settings, Sparkles, LogOut } from "lucide-react";
import { Conversation } from "@/types/chat";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
  onLogout,
  isOpen,
  onClose,
}: SidebarProps) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/10 bg-zinc-950/95 backdrop-blur-xl transition-transform lg:static lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-white/10 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-white">KelvinOz AI</h1>
            <p className="text-xs text-zinc-500">kelvinoz.com · Uncensored</p>
          </div>
        </div>

        <div className="p-3">
          <button
            onClick={onNew}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600/20 py-2.5 text-sm font-medium text-violet-200 ring-1 ring-violet-500/30 transition hover:bg-violet-600/30"
          >
            <Plus size={16} />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {sorted.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500">
              No conversations yet
            </p>
          ) : (
            <ul className="space-y-1">
              {sorted.map((conv) => (
                <li key={conv.id}>
                  <div
                    className={`group flex items-center gap-2 rounded-xl px-3 py-2.5 transition ${
                      activeId === conv.id
                        ? "bg-violet-600/20 text-violet-100 ring-1 ring-violet-500/30"
                        : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                    }`}
                  >
                    <button
                      onClick={() => {
                        onSelect(conv.id);
                        onClose();
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <MessageSquare size={14} className="shrink-0" />
                      <span className="truncate text-sm">{conv.title}</span>
                    </button>
                    <button
                      onClick={() => onDelete(conv.id)}
                      className="shrink-0 rounded-lg p-1 opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                      aria-label="Delete conversation"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1 border-t border-white/10 p-3">
          <button
            onClick={onOpenSettings}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
          >
            <Settings size={16} />
            Settings
          </button>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-red-400"
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}
