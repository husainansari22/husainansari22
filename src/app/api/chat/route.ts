import { NextRequest } from "next/server";

export const runtime = "nodejs";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const {
      messages,
      apiKey,
      baseUrl = "https://api.openai.com/v1",
      model = "gpt-4o-mini",
      temperature = 0.7,
      maxTokens = 4096,
      stream = true,
    } = body;

    if (!messages?.length) {
      return Response.json({ error: "Messages are required" }, { status: 400 });
    }

    const serverApiKey = process.env.OPENAI_API_KEY;
    const resolvedKey = apiKey || serverApiKey;

    if (!resolvedKey) {
      return Response.json(
        {
          error:
            "No API key configured. Add your key in Settings or set OPENAI_API_KEY on the server.",
        },
        { status: 401 }
      );
    }

    const normalizedBase = baseUrl.replace(/\/$/, "");
    const url = `${normalizedBase}/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resolvedKey}`,
    };

    if (normalizedBase.includes("openrouter.ai")) {
      headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_APP_URL || "https://unbound-ai.app";
      headers["X-Title"] = "Unbound AI";
    }

    const upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream,
      }),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      let message = errorText;
      try {
        const parsed = JSON.parse(errorText) as { error?: { message?: string } };
        message = parsed.error?.message || errorText;
      } catch {
        // keep raw text
      }
      return Response.json({ error: message }, { status: upstream.status });
    }

    if (!stream) {
      const data = await upstream.json();
      return Response.json(data);
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
