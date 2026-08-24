let conversations = JSON.parse(localStorage.getItem("kelvinoz_chats") || "[]");
let activeId = conversations[0]?.id || null;
let isLoading = false;
let pendingAttachments = [];

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");
const attachmentsEl = document.getElementById("attachments");
const errorEl = document.getElementById("error");
const welcomeEl = document.getElementById("welcome");
const convListEl = document.getElementById("conversations");
const sidebarEl = document.getElementById("sidebar");
const overlayEl = document.getElementById("overlay");
const filesPanel = document.getElementById("files-panel");
const filesList = document.getElementById("files-list");
const filesToggle = document.getElementById("files-toggle");
const filesCount = document.getElementById("files-count");
const menuBtn = document.getElementById("menu-btn");

function save() {
  try {
    localStorage.setItem("kelvinoz_chats", JSON.stringify(conversations));
  } catch {
    conversations = conversations.map((c) => ({
      ...c,
      messages: (c.messages || []).map((m) => ({
        ...m,
        attachments: (m.attachments || []).map(({ name, type, size }) => ({ name, type, size })),
      })),
    }));
    localStorage.setItem("kelvinoz_chats", JSON.stringify(conversations));
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getActive() {
  return conversations.find((c) => c.id === activeId);
}

function ensureConvFields(conv) {
  if (!conv.files) conv.files = [];
  if (!conv.deployments) conv.deployments = [];
  if (!conv.messages) conv.messages = [];
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text == null ? "" : String(text);
  return d.innerHTML;
}

function formatMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\n/g, "<br>");
  return html;
}

function extractFilesFromContent(content) {
  const files = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  let i = 0;
  while ((match = regex.exec(content || "")) !== null) {
    const lang = match[1] || "txt";
    const code = match[2].trim();
    if (code.length < 10) continue;
    files.push({
      id: uid(),
      filename: `file-${++i}.${lang || "txt"}`,
      content: code,
      language: lang,
      createdAt: Date.now(),
      lines: code.split("\n").length,
    });
  }
  return files;
}

function mergeFiles(conv, newFiles) {
  ensureConvFields(conv);
  for (const f of newFiles) {
    const existing = conv.files.findIndex((x) => x.filename === f.filename);
    if (existing >= 0) conv.files[existing] = { ...conv.files[existing], ...f, updatedAt: Date.now() };
    else conv.files.push(f);
  }
}

function openSidebar() {
  sidebarEl.classList.add("open");
  overlayEl.classList.add("show");
}

function closeSidebar() {
  sidebarEl.classList.remove("open");
  overlayEl.classList.remove("show");
}

function startNewChat() {
  activeId = null;
  closeSidebar();
  filesPanel.hidden = true;
  render();
  inputEl.focus();
}

function renderFilesPanel() {
  const conv = getActive();
  if (!conv) {
    filesToggle.hidden = true;
    return;
  }
  ensureConvFields(conv);
  filesToggle.hidden = conv.files.length === 0;
  filesCount.textContent = String(conv.files.length);

  filesList.innerHTML = conv.files.length
    ? conv.files
        .map(
          (f) => `
      <div class="file-item" data-id="${f.id}">
        <div class="file-icon">${(f.language || "f").slice(0, 2).toUpperCase()}</div>
        <div class="file-info">
          <span class="file-name">${escapeHtml(f.filename)}</span>
          <span class="file-meta">${f.lines || (f.content || "").split("\n").length} lines</span>
        </div>
        <button type="button" class="file-dl" data-id="${f.id}">↓</button>
      </div>`
        )
        .join("")
    : `<p class="files-empty">No files in this chat yet</p>`;

  filesList.querySelectorAll(".file-dl").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const file = conv.files.find((f) => f.id === btn.dataset.id);
      if (!file) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([file.content || ""], { type: "text/plain" }));
      a.download = (file.filename || "file").split("/").pop();
      a.click();
    });
  });
}

function renderConversations() {
  convListEl.innerHTML = conversations
    .map(
      (c) => `
    <div class="conv-row ${c.id === activeId ? "active" : ""}" data-id="${c.id}">
      <button type="button" class="conv-item" data-id="${c.id}">
        <span class="conv-title">${escapeHtml(c.title || "New chat")}</span>
        ${c.files?.length ? `<span class="conv-files">${c.files.length}</span>` : ""}
      </button>
      <button type="button" class="conv-delete" data-id="${c.id}" aria-label="Delete chat" title="Delete chat">🗑</button>
    </div>`
    )
    .join("");

  convListEl.querySelectorAll(".conv-item").forEach((el) => {
    el.addEventListener("click", () => {
      activeId = el.dataset.id;
      closeSidebar();
      render();
    });
  });

  convListEl.querySelectorAll(".conv-delete").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = el.dataset.id;
      const conv = conversations.find((c) => c.id === id);
      const label = (conv?.title || "this chat").slice(0, 40);
      if (!confirm(`Delete “${label}”?`)) return;
      conversations = conversations.filter((c) => c.id !== id);
      if (activeId === id) activeId = conversations[0]?.id || null;
      save();
      render();
    });
  });
}

function actionIcons() {
  return `
    <div class="msg-actions">
      <button type="button" class="act-copy" title="Copy">⧉</button>
      <button type="button" title="Share">↗</button>
      <button type="button" title="Listen">🔊</button>
      <button type="button" title="Good">👍</button>
      <button type="button" title="Bad">👎</button>
      <button type="button" title="More">⋯</button>
    </div>`;
}

function renderMessages() {
  const conv = getActive();
  messagesEl.querySelectorAll(".msg, .deploy-log").forEach((m) => m.remove());

  if (!conv || !conv.messages.length) {
    welcomeEl.hidden = false;
    return;
  }
  welcomeEl.hidden = true;

  conv.messages.forEach((m, idx) => {
    if (m.role === "system") return;
    const div = document.createElement("div");
    div.className = `msg ${m.role}`;

    let inner = "";
    if (m.attachments?.length) {
      inner += m.attachments
        .map((a) => {
          if (a.dataUrl && String(a.type || "").startsWith("image/"))
            return `<img class="msg-image" src="${a.dataUrl}" alt="" />`;
          return `<div class="msg-file-tag">📎 ${escapeHtml(a.name || "file")}</div>`;
        })
        .join("");
    }
    if (m.content) {
      inner += m.role === "assistant" ? formatMarkdown(m.content) : escapeHtml(m.content).replace(/\n/g, "<br>");
    }

    if (m.role === "assistant") {
      div.innerHTML = `
        <div class="msg-content">${inner || '<span class="typing"><span></span><span></span><span></span></span>'}</div>
        ${m.content ? actionIcons() : ""}`;
      const copyBtn = div.querySelector(".act-copy");
      if (copyBtn) {
        copyBtn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(m.content || "");
            copyBtn.textContent = "✓";
            setTimeout(() => (copyBtn.textContent = "⧉"), 1000);
          } catch {}
        });
      }
    } else {
      div.innerHTML = `<div class="msg-content">${inner}</div>`;
    }

    messagesEl.appendChild(div);
  });

  if (conv.deployments?.length) {
    const last = conv.deployments[conv.deployments.length - 1];
    const log = document.createElement("div");
    log.className = "deploy-log";
    log.textContent = `Deploy · ${last.status} · ${last.message || ""}`;
    messagesEl.appendChild(log);
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function render() {
  renderConversations();
  renderMessages();
  renderFilesPanel();
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}
function hideError() {
  errorEl.hidden = true;
}

function renderAttachmentPreviews() {
  if (!pendingAttachments.length) {
    attachmentsEl.hidden = true;
    attachmentsEl.innerHTML = "";
    return;
  }
  attachmentsEl.hidden = false;
  attachmentsEl.innerHTML = pendingAttachments
    .map(
      (a, i) => `
    <div class="att-preview">
      ${String(a.type || "").startsWith("image/") && a.dataUrl ? `<img src="${a.dataUrl}" alt="" />` : `<span>📎 ${escapeHtml(a.name)}</span>`}
      <button type="button" data-i="${i}" class="att-remove">✕</button>
    </div>`
    )
    .join("");
  attachmentsEl.querySelectorAll(".att-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      pendingAttachments.splice(Number(btn.dataset.i), 1);
      renderAttachmentPreviews();
    });
  });
}

function readFileAsAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const isText =
        String(file.type || "").startsWith("text/") ||
        /\.(js|ts|tsx|jsx|py|json|md|css|html|txt|csv|xml|yaml|yml)$/i.test(file.name);
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: typeof reader.result === "string" && reader.result.startsWith("data:") ? reader.result : null,
        text: isText && typeof reader.result === "string" && !reader.result.startsWith("data:") ? reader.result : null,
      });
    };
    reader.onerror = reject;
    if (String(file.type || "").startsWith("image/") || String(file.type || "").startsWith("video/")) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

function buildApiMessages(conv, userText, attachments) {
  const prior = conv.messages
    .slice(0, -2)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => typeof m.content === "string" && m.content.trim())
    .map(({ role, content }) => ({ role, content }));

  const hasImages = attachments.some((a) => String(a.type || "").startsWith("image/") && a.dataUrl);
  if (!hasImages) {
    let text = userText;
    for (const a of attachments) {
      if (a.text) text += `\n\n[File: ${a.name}]\n${a.text.slice(0, 12000)}`;
      else text += `\n\n[Attached: ${a.name}]`;
    }
    return [...prior, { role: "user", content: text }];
  }

  const parts = [{ type: "text", text: userText }];
  for (const a of attachments) {
    if (String(a.type || "").startsWith("image/") && a.dataUrl) parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
    else if (a.text) parts.push({ type: "text", text: `\n\n[File: ${a.name}]\n${a.text.slice(0, 12000)}` });
    else parts.push({ type: "text", text: `\n\n[Attached: ${a.name}]` });
  }
  return [...prior, { role: "user", content: parts }];
}

function applyStreamEvent(evt, conv, state) {
  if (evt.type === "content" && evt.delta) {
    state.full += evt.delta;
    conv.messages[conv.messages.length - 1].content = state.full;
    renderMessages();
    return;
  }
  if (evt.choices?.[0]?.delta?.content) {
    state.full += evt.choices[0].delta.content;
    conv.messages[conv.messages.length - 1].content = state.full;
    renderMessages();
    return;
  }
  if (evt.type === "file" && evt.file) {
    mergeFiles(conv, [evt.file]);
    renderFilesPanel();
    save();
    return;
  }
  if (evt.type === "deploy") {
    ensureConvFields(conv);
    conv.deployments.push({ status: evt.status, message: evt.message, domain: evt.domain, at: Date.now() });
    save();
    renderMessages();
    return;
  }
  if (evt.type === "error") throw new Error(typeof evt.error === "string" ? evt.error : JSON.stringify(evt.error));
}

async function sendMessage(text) {
  const trimmed = (text || "").trim();
  if ((!trimmed && !pendingAttachments.length) || isLoading) return;
  hideError();

  if (!activeId) {
    conversations.unshift({ id: uid(), title: "New chat", messages: [], files: [], deployments: [] });
    activeId = conversations[0].id;
  }

  const conv = getActive();
  ensureConvFields(conv);
  const attachments = [...pendingAttachments];
  pendingAttachments = [];
  renderAttachmentPreviews();

  const displayText = trimmed || (attachments.length === 1 ? `Sent ${attachments[0].name}` : `Sent ${attachments.length} files`);
  conv.messages.push({ role: "user", content: displayText, attachments, createdAt: Date.now() });
  conv.messages.push({ role: "assistant", content: "", createdAt: Date.now() });
  if (conv.messages.filter((m) => m.role === "user").length === 1) conv.title = displayText.slice(0, 48);
  save();
  render();

  inputEl.value = "";
  inputEl.style.height = "auto";
  isLoading = true;
  sendBtn.disabled = true;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: buildApiMessages(conv, displayText, attachments) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Error ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const state = { full: "" };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        let evt;
        try {
          evt = JSON.parse(raw);
        } catch {
          continue;
        }
        applyStreamEvent(evt, conv, state);
      }
    }

    if (!state.full.trim()) throw new Error("No response from AI. Try again.");
    const extracted = extractFilesFromContent(state.full);
    if (extracted.length) mergeFiles(conv, extracted);
    save();
    render();
  } catch (err) {
    showError(err.message || "Chat failed");
    if (!conv.messages[conv.messages.length - 1]?.content) {
      conv.messages.pop();
      conv.messages.pop();
      save();
      render();
    }
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
  }
}

function onTap(el, handler) {
  if (!el) return;
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handler(e);
  });
}

onTap(menuBtn, openSidebar);
onTap(document.getElementById("sidebar-close"), closeSidebar);
onTap(overlayEl, closeSidebar);
onTap(document.getElementById("new-chat"), startNewChat);
onTap(document.getElementById("new-chat-side"), startNewChat);
onTap(document.getElementById("logout"), async () => {
  await fetch("/api/logout", { method: "POST" });
  location.href = "/login";
});
onTap(filesToggle, () => {
  filesPanel.hidden = !filesPanel.hidden;
});
onTap(document.getElementById("files-close"), () => {
  filesPanel.hidden = true;
});
onTap(attachBtn, () => fileInput.click());
onTap(sendBtn, () => sendMessage(inputEl.value));

fileInput.addEventListener("change", async (e) => {
  for (const file of e.target.files || []) {
    try {
      pendingAttachments.push(await readFileAsAttachment(file));
    } catch {}
  }
  fileInput.value = "";
  renderAttachmentPreviews();
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});
inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
});

document.querySelectorAll(".chip").forEach((btn) => {
  onTap(btn, () => sendMessage(btn.dataset.prompt));
});

render();
