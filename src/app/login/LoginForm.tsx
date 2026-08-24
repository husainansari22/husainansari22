"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Sparkles } from "lucide-react";

export default function LoginForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        setError("Wrong access code.");
        return;
      }

      router.push(from);
      router.refresh();
    } catch {
      setError("Connection failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/20 ring-1 ring-violet-500/30">
            <Sparkles size={28} className="text-violet-400" />
          </div>
          <p className="text-sm font-medium uppercase tracking-widest text-violet-400">
            KelvinOz AI
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">Private studio</h1>
          <p className="mt-2 text-zinc-400">Enter your access code to continue.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-zinc-900/80 p-6 shadow-2xl backdrop-blur-xl"
        >
          <label htmlFor="code" className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <Lock size={14} className="text-violet-400" />
            Access code
          </label>
          <input
            id="code"
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="current-password"
            required
            autoFocus
            className="input-field mb-4"
            placeholder="Enter access code"
          />
          {error && (
            <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full rounded-xl bg-violet-600 py-3 font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Enter"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-600">kelvinoz.com · Unrestricted AI</p>
      </div>
    </div>
  );
}
