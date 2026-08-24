import { ChatSettings, Message } from "@/types/chat";

export async function streamChatResponse(
  messages: Message[],
  settings: ChatSettings,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const payload = {
    messages: messages.map(({ role, content }) => ({ role, content })),
    apiKey: settings.apiKey || undefined,
    baseUrl: settings.baseUrl,
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    stream: settings.stream,
  };

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  if (!settings.stream) {
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content || "";
    onChunk(text);
    return text;
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream available");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const chunk = parsed.choices?.[0]?.delta?.content || "";
        if (chunk) {
          fullText += chunk;
          onChunk(fullText);
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  return fullText;
}

export function generateTitle(firstMessage: string): string {
  const cleaned = firstMessage.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 48) return cleaned || "New conversation";
  return `${cleaned.slice(0, 48)}…`;
}
