const systemEl = document.getElementById("system-prompt");
const webSearchEl = document.getElementById("web-search");
const nomaskPromptEl = document.getElementById("nomask-prompt");
const streamEl = document.getElementById("stream");
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const errorEl = document.getElementById("error");

const messages = [];
let loading = false;

function showError(msg) {
  errorEl.hidden = !msg;
  errorEl.textContent = msg || "";
}

function appendMessage(role, content) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = content;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function resizeInput() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || loading) return;

  showError("");
  messages.push({ role: "user", content: text });
  appendMessage("user", text);
  inputEl.value = "";
  resizeInput();

  loading = true;
  sendBtn.disabled = true;

  const assistantEl = appendMessage("assistant", "");
  let full = "";

  const body = {
    messages,
    systemPrompt: systemEl.value,
    webSearch: webSearchEl.checked,
    nomaskPrompt: nomaskPromptEl.checked,
    stream: streamEl.checked,
  };

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!streamEl.checked) {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      full = data.content || "";
      assistantEl.textContent = full;
      messages.push({ role: "assistant", content: full });
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Error ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        let evt;
        try {
          evt = JSON.parse(raw);
        } catch {
          continue;
        }
        if (evt.type === "content" && evt.delta) {
          full += evt.delta;
          assistantEl.textContent = full;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        } else if (evt.type === "error") {
          throw new Error(evt.error || "Chat failed");
        }
      }
    }

    messages.push({ role: "assistant", content: full });
    if (!full) showError("Empty response");
  } catch (err) {
    if (!full) assistantEl.remove();
    showError(err.message || "Request failed");
  } finally {
    loading = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

sendBtn.addEventListener("click", sendMessage);
inputEl.addEventListener("input", resizeInput);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

try {
  const saved = localStorage.getItem("kelvinoz_system_prompt");
  if (saved != null) systemEl.value = saved;
} catch {}

systemEl.addEventListener("input", () => {
  try {
    localStorage.setItem("kelvinoz_system_prompt", systemEl.value);
  } catch {}
});

inputEl.focus();
