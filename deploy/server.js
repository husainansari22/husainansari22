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

async function promptFromSystem(systemPrompt, userRequest, options = {}) {
  const system = String(systemPrompt || "").trim();
  const user = String(userRequest || "").trim();
  if (!user) throw new Error("Image prompt is required");
  if (!system) return user;

  const model = String(options.model || MODEL || "deepseek-v4-flash").trim();
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];

  const res = await fetch(`${NOMASK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${NOMASK_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      web_search: "off",
      nomask_roleplay: options.nomaskPrompt !== false,
      messages,
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 200) || "Image prompt request failed");
  }
  if (!res.ok) {
    throw new Error(data.error?.message || data.message || `HTTP ${res.status}`);
  }

  const out = String(data.choices?.[0]?.message?.content || "").trim();
  if (!out) throw new Error("Empty response from system prompt");
  return out.slice(0, 1000);
}

async function generateImage(prompt, width = 1024, height = 1024, systemPrompt = "", options = {}) {
  const user = String(prompt || "").trim();
  if (!user) throw new Error("Image prompt is required");

  const finalPrompt =
    options.useSystemPrompt && String(systemPrompt || "").trim()
      ? await promptFromSystem(systemPrompt, user, options)
      : user;

  const w = Math.min(1280, Math.max(256, Number(width) || 1024));
  const h = Math.min(1280, Math.max(256, Number(height) || 1024));
  const seed = Date.now() % 100000;
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}` +
    `?width=${w}&height=${h}&nologo=true&model=flux&seed=${seed}`;

  // Return URL immediately — Hostinger gateways time out if we wait to download.
  // Browser loads the image from Pollinations directly.
  return {
    url,
    dataUrl: url,
    prompt: finalPrompt,
    userPrompt: user,
    width: w,
    height: h,
  };
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function readBody(req, maxBytes = 25 * 1024 * 1024) {
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

const HOSTINGER_API_KEY =
  process.env.HOSTINGER_API_KEY || RUNTIME.hostingerApiKey || "";
const HOSTINGER_USERNAME = process.env.HOSTINGER_USERNAME || RUNTIME.hostingerUsername || "u343769360";
const HOSTINGER_BASE = "https://developers.hostinger.com";

const HOSTINGER_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_hostinger_domains",
      description: "List domains/websites on the Hostinger account.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "deploy_to_hostinger",
      description: "Deploy this KelvinOz app to a Hostinger domain the user owns.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Target domain, e.g. kelvinoz.com" },
        },
        required: ["domain"],
      },
    },
  },
];

async function hostingerApi(endpoint, options = {}) {
  const res = await fetch(`${HOSTINGER_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${HOSTINGER_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text };
  }
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

async function runHostingerTool(name, args) {
  if (!HOSTINGER_API_KEY) return JSON.stringify({ ok: false, error: "HOSTINGER_API_KEY not configured" });
  if (name === "list_hostinger_domains") {
    const data = await hostingerApi(`/api/hosting/v1/websites?username=${encodeURIComponent(HOSTINGER_USERNAME)}`);
    const list = (data.data || []).map((w) => ({
      domain: w.domain,
      type: w.website_type,
      root: w.root_directory,
    }));
    return JSON.stringify({ ok: true, domains: list });
  }
  if (name === "deploy_to_hostinger") {
    const domain = String(args.domain || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!domain) return JSON.stringify({ ok: false, error: "domain is required" });
    return JSON.stringify({
      ok: true,
      message: `Hostinger plugin is ready for ${domain}. Ask the site owner to run a Hostinger deploy from the dashboard/scripts, or provide deploy credentials in chat for guided steps.`,
      domain,
    });
  }
  return JSON.stringify({ ok: false, error: "Unknown tool" });
}

function buildSystemPrompt(userPrompt, plugins) {
  const parts = [];
  if (userPrompt) parts.push(userPrompt);
  const list = Array.isArray(plugins) ? plugins : [];
  if (list.length) {
    parts.push("Enabled plugins:");
    for (const p of list) {
      parts.push(`- ${p.name || p.id}: ${p.instruction || "Assist with this plugin."}`);
    }
  }
  return parts.join("\n\n");
}

async function handleChat(req, res, body) {
  const apiKey = NOMASK_API_KEY;
  if (!apiKey) return sendJson(res, 401, { error: "Missing NoMask API key" });

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const systemPrompt = typeof body?.systemPrompt === "string" ? body.systemPrompt.trim() : "";
  const plugins = Array.isArray(body?.plugins) ? body.plugins : [];
  const webSearch = body?.webSearch ? "on" : "off";
  const nomaskPrompt = Boolean(body?.nomaskPrompt);
  const stream = body?.stream !== false;
  const hostingerEnabled = plugins.some((p) => String(p.id || "").startsWith("hostinger"));
  const hostingerKey = String(body?.hostingerApiKey || HOSTINGER_API_KEY || "").trim();
  const model = String(body?.model || MODEL).trim() || MODEL;
  // Image creation is /api/image only — do not attach image tools on every chat
  // (that caused Hostinger 504s from slow tool pre-rounds).
  const tools = hostingerEnabled ? [...HOSTINGER_TOOLS] : [];

  function startSse() {
    if (res.headersSent) return;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    if (typeof res.flushHeaders === "function") res.flushHeaders();
  }

  function sse(obj) {
    startSse();
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  }

  async function hostingerApiAuthed(endpoint, options = {}) {
    if (!hostingerKey) throw new Error("Connect Hostinger with an API token first");
    const res = await fetch(`${HOSTINGER_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${hostingerKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }

  async function runHostingerToolAuthed(name, args) {
    if (name === "list_hostinger_domains") {
      const data = await hostingerApiAuthed(
        `/api/hosting/v1/websites?username=${encodeURIComponent(HOSTINGER_USERNAME)}`
      );
      const list = (data.data || []).map((w) => ({
        domain: w.domain,
        type: w.website_type,
        root: w.root_directory,
      }));
      return JSON.stringify({ ok: true, domains: list });
    }
    if (name === "deploy_to_hostinger") {
      const domain = String(args.domain || "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "");
      if (!domain) return JSON.stringify({ ok: false, error: "domain is required" });
      return JSON.stringify({
        ok: true,
        connected: true,
        message: `Hostinger is connected. Domain target accepted: ${domain}. I can list websites and guide deploy steps with direct Hostinger API access.`,
        domain,
      });
    }
    return JSON.stringify({ ok: false, error: "Unknown tool" });
  }

  const conversation = [];
  const mergedSystem = buildSystemPrompt(systemPrompt, plugins);
  if (mergedSystem) {
    conversation.push({ role: "system", content: mergedSystem });
  }
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant" && m.role !== "tool")) continue;
    if (m.content == null || m.content === "") continue;
    if (typeof m.content === "string" || Array.isArray(m.content)) {
      const msg = { role: m.role, content: m.content };
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.tool_calls) msg.tool_calls = m.tool_calls;
      conversation.push(msg);
    }
  }

  async function runAnyTool(name, args, emit) {
    return runHostingerToolAuthed(name, args);
  }

  async function callNomask({ streamMode, withTools }) {
    return fetch(`${NOMASK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: conversation,
        web_search: webSearch,
        nomask_roleplay: nomaskPrompt,
        stream: streamMode,
        ...(withTools && tools.length ? { tools, tool_choice: "auto" } : {}),
      }),
    });
  }

  // Non-stream path
  if (!stream) {
    const collectedImages = [];
    let rounds = 0;
    while (rounds < 4) {
      rounds += 1;
      const upstream = await callNomask({ streamMode: false, withTools: tools.length > 0 });
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
      const message = data.choices?.[0]?.message || {};
      const toolCalls = tools.length ? message.tool_calls || [] : [];
      if (toolCalls.length) {
        conversation.push({
          role: "assistant",
          content: message.content || null,
          tool_calls: toolCalls,
        });
        for (const tc of toolCalls) {
          let args = {};
          try {
            args = JSON.parse(tc.function?.arguments || "{}");
          } catch {}
          const result = await runAnyTool(tc.function?.name, args);
          conversation.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
        continue;
      }
      return sendJson(res, 200, {
        content: message.content || "",
        images: collectedImages,
      });
    }
    return sendJson(res, 200, { content: "", images: collectedImages });
  }

  // Stream path — open SSE immediately so Hostinger does not 504
  startSse();
  sse({ type: "status", message: "thinking" });

  const pendingImages = [];
  if (tools.length) {
    for (let round = 0; round < 3; round++) {
      const upstreamTools = await callNomask({ streamMode: false, withTools: true });
      const text = await upstreamTools.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        break;
      }
      if (!upstreamTools.ok) {
        sse({ type: "error", error: data.error?.message || data.message || `HTTP ${upstreamTools.status}` });
        sse({ type: "done" });
        return res.end();
      }
      const message = data.choices?.[0]?.message || {};
      const toolCalls = message.tool_calls || [];
      if (!toolCalls.length) {
        if (message.content) {
          for (const image of pendingImages) sse({ type: "image", image });
          sse({ type: "content", delta: message.content });
          sse({ type: "done" });
          return res.end();
        }
        break;
      }
      conversation.push({
        role: "assistant",
        content: message.content || null,
        tool_calls: toolCalls,
      });
      for (const tc of toolCalls) {
        let args = {};
        try {
          args = JSON.parse(tc.function?.arguments || "{}");
        } catch {}
        const result = await runAnyTool(tc.function?.name, args);
        conversation.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
    }
  }

  const upstream = await callNomask({ streamMode: true, withTools: false });

  if (!upstream.ok) {
    const text = await upstream.text();
    let friendly = text.slice(0, 800);
    try {
      const parsed = JSON.parse(text);
      friendly = parsed.error?.message || parsed.message || friendly;
    } catch {}
    sse({ type: "error", error: friendly });
    sse({ type: "done" });
    return res.end();
  }

  for (const image of pendingImages) {
    sse({ type: "image", image });
  }

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

  if (req.method === "POST" && pathname === "/api/image") {
    try {
      const body = await readBody(req);
      const systemPrompt = typeof body?.systemPrompt === "string" ? body.systemPrompt.trim() : "";
      const model = String(body?.model || MODEL).trim() || MODEL;
      const nomaskPrompt = body?.nomaskPrompt !== false;
      const img = await generateImage(body?.prompt, body?.width, body?.height, systemPrompt, {
        model,
        nomaskPrompt,
        useSystemPrompt: !!systemPrompt,
      });
      return sendJson(res, 200, img);
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
