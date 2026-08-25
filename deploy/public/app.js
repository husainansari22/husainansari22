const overlay = document.getElementById("overlay");
const sidebar = document.getElementById("sidebar");
const recentsEl = document.getElementById("recents");
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const errorEl = document.getElementById("error");
const settingsEl = document.getElementById("settings");
const systemEl = document.getElementById("system-prompt");
const webSearchEl = document.getElementById("web-search");
const nomaskPromptEl = document.getElementById("nomask-prompt");
const streamEl = document.getElementById("stream");

const STORE_KEY = "kelvinoz_chats_v2";
const SETTINGS_KEY = "kelvinoz_settings_v2";

let conversations = [];
let activeId = null;
let loading = false;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    conversations = Array.isArray(raw) ? raw : [];
  } catch {
    conversations = [];
  }
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (typeof s.systemPrompt === "string") systemEl.value = s.systemPrompt;
    if (typeof s.webSearch === "boolean") webSearchEl.checked = s.webSearch;
    if (typeof s.nomaskPrompt === "boolean") nomaskPromptEl.checked = s.nomaskPrompt;
    if (typeof s.stream === "boolean") streamEl.checked = s.stream;
  } catch {}
  if (!conversations.length) newChat(false);
  else activeId = conversations[0].id;
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(conversations));
}

function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      systemPrompt: systemEl.value,
      webSearch: webSearchEl.checked,
      nomaskPrompt: nomaskPromptEl.checked,
      stream: streamEl.checked,
    })
  );
}

function getActive() {
  return conversations.find((c) => c.id === activeId) || null;
}

function showError(msg) {
  errorEl.hidden = !msg;
  errorEl.textContent = msg || "";
}

function openSidebar() {
  sidebar.classList.add("open");
  sidebar.setAttribute("aria-hidden", "false");
  overlay.hidden = false;
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebar.setAttribute("aria-hidden", "true");
  overlay.hidden = true;
}

function openSettings() {
  closeSidebar();
  settingsEl.hidden = false;
}

function closeSettings() {
  settingsEl.hidden = true;
  saveSettings();
}

function newChat(close = true) {
  const chat = { id: uid(), title: "New chat", messages: [], createdAt: Date.now() };
  conversations.unshift(chat);
  activeId = chat.id;
  save();
  render();
  if (close) closeSidebar();
  inputEl.focus();
}

function setActive(id) {
  activeId = id;
  render();
  closeSidebar();
}

function iconBtn(label, path) {
  return `<button type="button" class="msg-action" aria-label="${label}">${path}</button>`;
}

function renderMessages() {
  const conv = getActive();
  messagesEl.innerHTML = "";
  if (!conv || !conv.messages.length) return;

  for (const m of conv.messages) {
    const el = document.createElement("div");
    el.className = `msg ${m.role}`;
    if (m.role === "user") {
      el.textContent = m.content || "";
    } else {
      const text = document.createElement("div");
      text.textContent = m.content || "";
      el.appendChild(text);
      if (m.content) {
        const actions = document.createElement("div");
        actions.className = "msg-actions";
        actions.innerHTML = [
          iconBtn("Copy", '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/></svg>'),
          iconBtn("Speak", '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10v4h4l5 4V6L7 10H3z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>'),
          iconBtn("Dislike", '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 15v5a2 2 0 0 0 2 2l5-6V3H7.5a2 2 0 0 0-2 1.7l-1 7A2 2 0 0 0 6.5 14H10z"/><path d="M17 3h3v10h-3"/></svg>'),
          iconBtn("Share", '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>'),
          iconBtn("More", '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/></svg>'),
        ].join("");
        const copyBtn = actions.querySelector('[aria-label="Copy"]');
        if (copyBtn) {
          copyBtn.addEventListener("click", () => navigator.clipboard?.writeText(m.content || ""));
        }
        el.appendChild(actions);
      }
    }
    messagesEl.appendChild(el);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderRecents() {
  recentsEl.innerHTML = conversations
    .map(
      (c) =>
        `<button type="button" class="recent-item ${c.id === activeId ? "active" : ""}" data-id="${c.id}">${escapeHtml(
          c.title || "New chat"
        )}</button>`
    )
    .join("");

  recentsEl.querySelectorAll(".recent-item").forEach((btn) => {
    btn.addEventListener("click", () => setActive(btn.dataset.id));
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render() {
  renderRecents();
  renderMessages();
}

function resizeInput() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
}

function pinApp() {
  const vv = window.visualViewport;
  if (!vv) return;
  const app = document.getElementById("app");
  app.style.height = vv.height + "px";
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || loading) return;

  showError("");
  let conv = getActive();
  if (!conv) {
    newChat(false);
    conv = getActive();
  }

  conv.messages.push({ role: "user", content: text });
  if (conv.messages.filter((m) => m.role === "user").length === 1) {
    conv.title = text.slice(0, 48);
  }
  conv.messages.push({ role: "assistant", content: "" });
  save();
  render();

  inputEl.value = "";
  resizeInput();
  loading = true;
  sendBtn.disabled = true;

  const assistantIndex = conv.messages.length - 1;
  let full = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: conv.messages
          .slice(0, -1)
          .filter((m) => m.role === "user" || (m.role === "assistant" && m.content))
          .map((m) => ({ role: m.role, content: m.content })),
        systemPrompt: systemEl.value,
        webSearch: webSearchEl.checked,
        nomaskPrompt: nomaskPromptEl.checked,
        stream: streamEl.checked,
      }),
    });

    if (!streamEl.checked) {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      full = data.content || "";
      conv.messages[assistantIndex].content = full;
      save();
      render();
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
          conv.messages[assistantIndex].content = full;
          renderMessages();
        } else if (evt.type === "error") {
          throw new Error(evt.error || "Chat failed");
        }
      }
    }

    conv.messages[assistantIndex].content = full;
    save();
    render();
    if (!full) showError("Empty response");
  } catch (err) {
    if (!full) {
      conv.messages.pop();
      if (conv.messages.length && conv.messages[conv.messages.length - 1].role === "user") {
        // keep user message visible
      }
      save();
      render();
    }
    showError(err.message || "Request failed");
  } finally {
    loading = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

document.getElementById("menu-btn").addEventListener("click", openSidebar);
overlay.addEventListener("click", closeSidebar);
document.getElementById("new-chat").addEventListener("click", () => newChat(true));
document.getElementById("new-chat-top").addEventListener("click", () => newChat(true));
document.getElementById("open-settings").addEventListener("click", openSettings);
document.getElementById("settings-back").addEventListener("click", closeSettings);
document.getElementById("more-btn").addEventListener("click", openSettings);

sendBtn.addEventListener("click", sendMessage);
inputEl.addEventListener("input", resizeInput);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

[systemEl, webSearchEl, nomaskPromptEl, streamEl].forEach((el) => {
  el.addEventListener("change", saveSettings);
  el.addEventListener("input", saveSettings);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", pinApp);
  window.visualViewport.addEventListener("scroll", pinApp);
  pinApp();
}

load();
render();
inputEl.focus();
