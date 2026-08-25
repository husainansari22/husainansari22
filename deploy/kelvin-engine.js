/**
 * Kelvin Engine client — talks ONLY to an engine you control
 * (Ollama, vLLM, LM Studio, llama.cpp server, etc. with OpenAI-compatible /v1).
 * No third-party AI vendors.
 */

function loadRuntimeConfig() {
  try {
    return require("./runtime-config.json");
  } catch {
    return {};
  }
}

const RUNTIME = loadRuntimeConfig();

const ENGINE_BASE = (
  process.env.KELVIN_ENGINE_BASE_URL ||
  RUNTIME.kelvinEngineBaseUrl ||
  ""
).replace(/\/$/, "");

const ENGINE_KEY =
  process.env.KELVIN_ENGINE_API_KEY || RUNTIME.kelvinEngineApiKey || "";

const ENGINE_MODEL =
  process.env.KELVIN_ENGINE_MODEL || RUNTIME.kelvinEngineModel || "llama3.2";

const IMAGE_ENGINE_BASE = (
  process.env.KELVIN_IMAGE_ENGINE_URL ||
  RUNTIME.kelvinImageEngineUrl ||
  ""
).replace(/\/$/, "");

function engineConfigured() {
  return Boolean(ENGINE_BASE);
}

function imageEngineConfigured() {
  return Boolean(IMAGE_ENGINE_BASE);
}

function engineHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (ENGINE_KEY) headers.Authorization = `Bearer ${ENGINE_KEY}`;
  return headers;
}

async function chatCompletions({ model, messages, stream = false, tools, tool_choice }) {
  if (!ENGINE_BASE) {
    const err = new Error(
      "Kelvin Engine is not configured. Set KELVIN_ENGINE_BASE_URL to your own model server (Ollama/vLLM/LM Studio OpenAI-compatible URL), e.g. http://YOUR_VPS:11434/v1"
    );
    err.status = 503;
    throw err;
  }

  const body = {
    model: model || ENGINE_MODEL,
    messages,
    stream: Boolean(stream),
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = tool_choice || "auto";
  }

  const res = await fetch(`${ENGINE_BASE}/chat/completions`, {
    method: "POST",
    headers: engineHeaders(),
    body: JSON.stringify(body),
  });

  return res;
}

async function listModels() {
  if (!ENGINE_BASE) {
    return {
      object: "list",
      data: [
        {
          id: ENGINE_MODEL,
          object: "model",
          owned_by: "kelvin",
        },
      ],
    };
  }

  try {
    const res = await fetch(`${ENGINE_BASE}/models`, { headers: engineHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data?.data)) return data;
  } catch {
    /* fall through */
  }

  return {
    object: "list",
    data: [{ id: ENGINE_MODEL, object: "model", owned_by: "kelvin" }],
  };
}

/**
 * Image engines you host yourself (AUTOMATIC1111 / Forge / ComfyUI OpenAI-like adapters).
 * Expected: POST {prompt, width, height} → { url } or { data:[{url|b64_json}] }
 */
async function generateImage({ prompt, width = 1024, height = 1024 }) {
  if (!IMAGE_ENGINE_BASE) {
    const err = new Error(
      "Kelvin Image Engine is not configured. Set KELVIN_IMAGE_ENGINE_URL to your own image server."
    );
    err.status = 503;
    throw err;
  }

  const res = await fetch(`${IMAGE_ENGINE_BASE}/images/generations`, {
    method: "POST",
    headers: engineHeaders(),
    body: JSON.stringify({
      prompt,
      width,
      height,
      size: `${width}x${height}`,
      n: 1,
      response_format: "url",
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error(text.slice(0, 300) || "Image engine error");
    err.status = res.status || 502;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(data.error?.message || data.message || `Image HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const url = data.data?.[0]?.url || data.url;
  const b64 = data.data?.[0]?.b64_json;
  return {
    url: url || (b64 ? `data:image/png;base64,${b64}` : ""),
    dataUrl: url || (b64 ? `data:image/png;base64,${b64}` : ""),
    prompt,
    width,
    height,
  };
}

module.exports = {
  ENGINE_BASE,
  ENGINE_MODEL,
  engineConfigured,
  imageEngineConfigured,
  chatCompletions,
  listModels,
  generateImage,
};
