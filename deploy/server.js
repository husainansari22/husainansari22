const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

function loadRuntimeConfig() {
  try {
    return require("./runtime-config.json");
  } catch {
    return {};
  }
}

const RUNTIME = loadRuntimeConfig();
const NOMASK_API_KEY =
  process.env.NOMASK_API_KEY ||
  RUNTIME.nomaskApiKey ||
  "nmk_live_4bggckaynPfpt0DXwppv8PlQb7T824vfXHEUlJwJ";
const NOMASK_BASE_URL = (
  process.env.NOMASK_BASE_URL ||
  RUNTIME.nomaskBaseUrl ||
  "https://nomask.ai/api/v1"
).replace(/\/$/, "");
const MODEL = process.env.NOMASK_MODEL || RUNTIME.nomaskModel || "deepseek-v4-pro";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function readBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    if (ext === ".html" || ext === ".js" || ext === ".css") {
      headers["Cache-Control"] = "no-store";
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

async function handleChat(req, res, body) {
  const apiKey = NOMASK_API_KEY;
  if (!apiKey) return sendJson(res, 401, { error: "Missing NoMask API key" });

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const systemPrompt = typeof body?.systemPrompt === "string" ? body.systemPrompt.trim() : "";
  const webSearch = body?.webSearch ? "on" : "off";
  const nomaskPrompt = Boolean(body?.nomaskPrompt);
  const stream = body?.stream !== false;

  const conversation = [];
  if (systemPrompt) {
    conversation.push({ role: "system", content: systemPrompt });
  }
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    if (m.content == null || m.content === "") continue;
    conversation.push({ role: m.role, content: String(m.content) });
  }

  const payload = {
    model: MODEL,
    messages: conversation,
    web_search: webSearch,
    nomask_roleplay: nomaskPrompt,
    stream,
  };

  const upstream = await fetch(`${NOMASK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!stream) {
    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return sendJson(res, 502, { error: text.slice(0, 500) || `HTTP ${upstream.status}` });
    }
    if (!upstream.ok) {
      return sendJson(res, upstream.status, {
        error: data.error?.message || data.message || `HTTP ${upstream.status}`,
      });
    }
    return sendJson(res, 200, {
      content: data.choices?.[0]?.message?.content || "",
    });
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    let friendly = text.slice(0, 800);
    try {
      const parsed = JSON.parse(text);
      friendly = parsed.error?.message || parsed.message || friendly;
    } catch {}
    return sendJson(res, upstream.status, { error: friendly });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") {
          res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            res.write(
              `data: ${JSON.stringify({
                type: "error",
                error: parsed.error.message || JSON.stringify(parsed.error),
              })}\n\n`
            );
            continue;
          }
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            res.write(`data: ${JSON.stringify({ type: "content", delta })}\n\n`);
          }
        } catch {}
      }
    }
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  }

  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === "POST" && pathname === "/api/chat") {
    try {
      const body = await readBody(req);
      return await handleChat(req, res, body);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname.startsWith("/")) {
    const assetPath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
    if (assetPath.startsWith(PUBLIC_DIR) && fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
      return serveFile(res, assetPath);
    }
  }

  return serveFile(res, path.join(PUBLIC_DIR, "index.html"));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`KelvinOz AI on ${PORT}`);
});
