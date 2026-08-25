/**
 * Kelvin API — your personal OpenAI-compatible API.
 * Website and clients talk ONLY to Kelvin API.
 * No NoMask / OpenAI / Pollinations vendor SDKs or keys.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const engine = require("./kelvin-engine");

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

const KELVIN_API_KEY =
  process.env.KELVIN_API_KEY ||
  RUNTIME.kelvinApiKey ||
  "";

const DEFAULT_MODEL =
  process.env.KELVIN_ENGINE_MODEL || RUNTIME.kelvinEngineModel || engine.ENGINE_MODEL;

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
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function extractBearer(req) {
  const auth = String(req.headers.authorization || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

/** Personal API key required for external clients; same-origin website allowed. */
function authorizeKelvin(req) {
  if (!KELVIN_API_KEY) {
    // Dev/misconfig: still allow so local testing works, but warn via header path
    return { ok: true, mode: "open" };
  }
  const token = extractBearer(req);
  if (token && token === KELVIN_API_KEY) return { ok: true, mode: "key" };

  const host = String(req.headers.host || "");
  const referer = String(req.headers.referer || "");
  const origin = String(req.headers.origin || "");
  const same =
    (referer && host && referer.includes(host)) ||
    (origin && host && origin.includes(host.replace(/:\d+$/, "")));
  if (same) return { ok: true, mode: "site" };

  return { ok: false, mode: "denied" };
}

function requireAuth(req, res) {
  const authz = authorizeKelvin(req);
  if (authz.ok) return true;
  sendJson(res, 401, {
    error: {
      message: "Invalid Kelvin API key. Use Authorization: Bearer <KELVIN_API_KEY>",
      type: "invalid_request_error",
      code: "invalid_api_key",
    },
  });
  return false;
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function corsPreflight(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  });
  res.end();
}

async function handleModels(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const data = await engine.listModels();
    return sendJson(res, 200, data);
  } catch (err) {
    return sendJson(res, err.status || 500, {
      error: { message: err.message, type: "kelvin_error" },
    });
  }
}

async function handleChatCompletions(req, res, body) {
  if (!requireAuth(req, res)) return;

  const model = String(body.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const stream = body.stream === true;
  const tools = Array.isArray(body.tools) ? body.tools : undefined;

  // Inject system prompt helper from Kelvin website extras
  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
  const conversation = [];
  if (systemPrompt) conversation.push({ role: "system", content: systemPrompt });
  for (const m of messages) {
    if (!m || !m.role) continue;
    conversation.push(m);
  }

  let upstream;
  try {
    upstream = await engine.chatCompletions({
      model,
      messages: conversation,
      stream,
      tools,
      tool_choice: body.tool_choice,
    });
  } catch (err) {
    return sendJson(res, err.status || 503, {
      error: { message: err.message, type: "kelvin_engine_error" },
    });
  }

  if (!stream) {
    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return sendJson(res, 502, {
        error: { message: text.slice(0, 400) || `Engine HTTP ${upstream.status}`, type: "kelvin_engine_error" },
      });
    }
    if (!upstream.ok) {
      return sendJson(res, upstream.status, {
        error: {
          message: data.error?.message || data.message || `Engine HTTP ${upstream.status}`,
          type: "kelvin_engine_error",
        },
      });
    }
    // Normalize id branding
    if (!data.id) data.id = newId("chatcmpl");
    data.object = data.object || "chat.completion";
    return sendJson(res, 200, data);
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    let friendly = text.slice(0, 400);
    try {
      friendly = JSON.parse(text).error?.message || friendly;
    } catch {}
    return sendJson(res, upstream.status, {
      error: { message: friendly, type: "kelvin_engine_error" },
    });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  });
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    res.write(
      `data: ${JSON.stringify({
        error: { message: err.message },
      })}\n\n`
    );
  }
  res.end();
}

async function handleImageGenerations(req, res, body) {
  if (!requireAuth(req, res)) return;
  try {
    const prompt = String(body.prompt || "").trim();
    if (!prompt) {
      return sendJson(res, 400, {
        error: { message: "prompt is required", type: "invalid_request_error" },
      });
    }
    let width = 1024;
    let height = 1024;
    if (typeof body.size === "string" && /^\d+x\d+$/.test(body.size)) {
      const [w, h] = body.size.split("x").map(Number);
      width = w;
      height = h;
    }
    if (body.width) width = Number(body.width) || width;
    if (body.height) height = Number(body.height) || height;

    // Optional: rewrite prompt via chat engine using caller's systemPrompt
    let finalPrompt = prompt;
    const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
    if (systemPrompt && engine.engineConfigured()) {
      try {
        const upstream = await engine.chatCompletions({
          model: body.model || DEFAULT_MODEL,
          stream: false,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        });
        const raw = await upstream.text();
        const parsed = JSON.parse(raw);
        const out = parsed.choices?.[0]?.message?.content;
        if (upstream.ok && out) finalPrompt = String(out).trim().slice(0, 1000);
      } catch {
        /* use original prompt */
      }
    }

    const img = await engine.generateImage({ prompt: finalPrompt, width, height });
    return sendJson(res, 200, {
      created: Math.floor(Date.now() / 1000),
      data: [{ url: img.url || img.dataUrl, revised_prompt: finalPrompt }],
      // Kelvin extras for the website
      url: img.url || img.dataUrl,
      dataUrl: img.dataUrl || img.url,
      prompt: finalPrompt,
      userPrompt: prompt,
    });
  } catch (err) {
    return sendJson(res, err.status || 500, {
      error: { message: err.message, type: "kelvin_image_error" },
    });
  }
}

function handleStatus(req, res) {
  return sendJson(res, 200, {
    name: "Kelvin API",
    version: "1.0.0",
    engine: engine.engineConfigured() ? "connected" : "not_configured",
    image_engine: engine.imageEngineConfigured() ? "connected" : "not_configured",
    default_model: DEFAULT_MODEL,
    auth: KELVIN_API_KEY ? "api_key_required" : "open_dev_mode",
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);

  if (req.method === "OPTIONS") return corsPreflight(res);

  try {
    if (req.method === "GET" && (pathname === "/v1" || pathname === "/v1/status")) {
      return handleStatus(req, res);
    }

    if (req.method === "GET" && pathname === "/v1/models") {
      return handleModels(req, res);
    }

    if (req.method === "POST" && pathname === "/v1/chat/completions") {
      const body = await readBody(req);
      return handleChatCompletions(req, res, body);
    }

    if (req.method === "POST" && pathname === "/v1/images/generations") {
      const body = await readBody(req);
      return handleImageGenerations(req, res, body);
    }

    // Back-compat aliases so old bookmarks don't hit vendor names — still Kelvin only
    if (req.method === "POST" && pathname === "/api/chat") {
      const body = await readBody(req);
      // Translate legacy website payload → OpenAI chat, then map stream to Kelvin site events
      return handleLegacySiteChat(req, res, body);
    }

    if (req.method === "POST" && pathname === "/api/image") {
      const body = await readBody(req);
      return handleImageGenerations(req, res, body);
    }
  } catch (err) {
    return sendJson(res, 500, { error: { message: err.message, type: "kelvin_error" } });
  }

  const assetPath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  if (assetPath.startsWith(PUBLIC_DIR) && fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
    return serveFile(res, assetPath);
  }
  return serveFile(res, path.join(PUBLIC_DIR, "index.html"));
});

/**
 * Legacy site chat format (SSE {type:content|image|done}) so the website
 * only depends on Kelvin routes — no vendor APIs in the browser.
 */
async function handleLegacySiteChat(req, res, body) {
  if (!requireAuth(req, res)) return;

  const model = String(body.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const stream = body.stream !== false;
  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const conversation = [];
  if (systemPrompt) {
    conversation.push({
      role: "system",
      content:
        systemPrompt +
        "\n\nWhen the user asks for an image, reply with a single line: IMAGE_PROMPT: <prompt>. Otherwise answer normally.",
    });
  } else {
    conversation.push({
      role: "system",
      content:
        "You are Kelvin AI. When the user asks for an image, reply with a single line: IMAGE_PROMPT: <prompt>. Otherwise answer normally.",
    });
  }
  for (const m of messages) {
    if (!m || !m.role) continue;
    conversation.push({ role: m.role, content: m.content });
  }

  function startSse() {
    if (res.headersSent) return;
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
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

  let upstream;
  try {
    upstream = await engine.chatCompletions({ model, messages: conversation, stream: false });
  } catch (err) {
    if (stream) {
      sse({ type: "error", error: err.message });
      sse({ type: "done" });
      return res.end();
    }
    return sendJson(res, err.status || 503, { error: err.message });
  }

  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const msg = text.slice(0, 400) || `Engine HTTP ${upstream.status}`;
    if (stream) {
      sse({ type: "error", error: msg });
      sse({ type: "done" });
      return res.end();
    }
    return sendJson(res, 502, { error: msg });
  }

  if (!upstream.ok) {
    const msg = data.error?.message || data.message || `Engine HTTP ${upstream.status}`;
    if (stream) {
      sse({ type: "error", error: msg });
      sse({ type: "done" });
      return res.end();
    }
    return sendJson(res, upstream.status, { error: msg });
  }

  let content = String(data.choices?.[0]?.message?.content || "");
  const imageMatch = content.match(/IMAGE_PROMPT:\s*(.+)$/im);
  if (imageMatch && engine.imageEngineConfigured()) {
    try {
      const img = await engine.generateImage({ prompt: imageMatch[1].trim() });
      content = content.replace(imageMatch[0], "").trim() || "Here you go.";
      if (stream) {
        sse({ type: "status", message: "thinking" });
        sse({
          type: "image",
          image: { url: img.url, dataUrl: img.dataUrl || img.url, prompt: img.prompt },
        });
        sse({ type: "content", delta: content });
        sse({ type: "done" });
        return res.end();
      }
      return sendJson(res, 200, {
        content,
        images: [{ url: img.url, dataUrl: img.dataUrl || img.url, prompt: img.prompt }],
      });
    } catch (err) {
      content = `Image engine error: ${err.message}`;
    }
  }

  if (!stream) return sendJson(res, 200, { content, images: [] });

  sse({ type: "status", message: "thinking" });
  // Stream in chunks for nicer UX
  const chunkSize = 24;
  for (let i = 0; i < content.length; i += chunkSize) {
    sse({ type: "content", delta: content.slice(i, i + chunkSize) });
  }
  sse({ type: "done" });
  res.end();
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Kelvin API on ${PORT}`);
  console.log(`  engine: ${engine.engineConfigured() ? engine.ENGINE_BASE : "NOT CONFIGURED"}`);
  console.log(`  auth: ${KELVIN_API_KEY ? "Kelvin API key enabled" : "open (set KELVIN_API_KEY)"}`);
});
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
