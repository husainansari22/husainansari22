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
const titleEl = document.getElementById("chat-title");
const sidebarEl = document.getElementById("sidebar");
const overlayEl = document.getElementById("overlay");
const filesPanel = document.getElementById("files-panel");
const filesList = document.getElementById("files-list");
const filesToggle = document.getElementById("files-toggle");
const filesCount = document.getElementById("files-count");

function save() {
  localStorage.setItem("kelvinoz_chats", JSON.stringify(conversations));
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
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function formatMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });
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
  while ((match = regex.exec(content)) !== null) {
    const lang = match[1] || "txt";
    const code = match[2].trim();
    if (code.length < 10) continue;
    const firstLine = code.split("\n")[0];
    let filename = `file-${++i}.${lang || "txt"}`;
    if (/^(?:\/[\w.-]+)+|\w+\.\w+/.test(firstLine) && firstLine.length < 80) {
      filename = firstLine.replace(/^\/+/, "");
    }
    files.push({
      id: uid(),
      filename,
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

function renderFilesPanel() {
  const conv = getActive();
  if (!conv) {
    filesPanel.hidden = true;
    filesToggle.hidden = true;
    return;
  }
  ensureConvFields(conv);
  const count = conv.files.length;
  filesToggle.hidden = count === 0;
  filesCount.textContent = count;

  filesList.innerHTML = conv.files.length
    ? conv.files
        .map(
          (f) => `
      <div class="file-item" data-id="${f.id}">
        <div class="file-icon">${(f.language || "file").slice(0, 2).toUpperCase()}</div>
        <div class="file-info">
          <span class="file-name">${escapeHtml(f.filename)}</span>
          <span class="file-meta">${f.lines || f.content.split("\n").length} lines</span>
        </div>
        <button class="file-dl" data-id="${f.id}" title="Download">↓</button>
      </div>`
        )
        .join("")
    : `<p class="files-empty">No files yet — ask the AI to build something</p>`;

  filesList.querySelectorAll(".file-dl").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const file = conv.files.find((f) => f.id === btn.dataset.id);
      if (!file) return;
      const blob = new Blob([file.content], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.filename.split("/").pop();
      a.click();
    };
  });

  filesList.querySelectorAll(".file-item").forEach((el) => {
    el.onclick = () => {
      const file = conv.files.find((f) => f.id === el.dataset.id);
      if (file) alert(file.content.slice(0, 8000) + (file.content.length > 8000 ? "\n…" : ""));
    };
  });
}

function renderConversations() {
  convListEl.innerHTML = conversations
    .map(
      (c) =>
        `<div class="conv-item ${c.id === activeId ? "active" : ""}" data-id="${c.id}">
          <span class="conv-title">${escapeHtml(c.title)}</span>
          ${c.files?.length ? `<span class="conv-files">${c.files.length}</span>` : ""}
        </div>`
    )
    .join("");
  convListEl.querySelectorAll(".conv-item").forEach((el) => {
    el.onclick = () => {
      activeId = el.dataset.id;
      closeSidebar();
      render();
    };
  });
}

function renderMessages() {
  const conv = getActive();
  messagesEl.querySelectorAll(".msg, .deploy-log").forEach((m) => m.remove());

  if (!conv || !conv.messages.length) {
    welcomeEl.hidden = false;
    return;
  }
  welcomeEl.hidden = true;

  conv.messages.forEach((m) => {
    if (m.role === "system") return;
    const div = document.createElement("div");
    div.className = `msg ${m.role}`;

    let inner = "";
    if (m.attachments?.length) {
      inner += m.attachments
        .map((a) => {
          if (a.type.startsWith("image/"))
            return `<img class="msg-image" src="${a.dataUrl}" alt="${escapeHtml(a.name)}" />`;
          return `<div class="msg-file-tag">📎 ${escapeHtml(a.name)}</div>`;
        })
        .join("");
    }

    if (m.content) {
      inner += m.role === "assistant" ? formatMarkdown(m.content) : escapeHtml(m.content).replace(/\n/g, "<br>");
    }

    div.innerHTML = `
      <div class="msg-avatar">${m.role === "user" ? "You" : "AI"}</div>
      <div class="msg-content">${inner || '<span class="typing"><span></span><span></span><span></span></span>'}</div>
    `;
    messagesEl.appendChild(div);
  });

  if (conv.deployments?.length) {
    const last = conv.deployments[conv.deployments.length - 1];
    const log = document.createElement("div");
    log.className = "deploy-log";
    log.innerHTML = `<strong>Deploy</strong> · ${escapeHtml(last.status)} · ${escapeHtml(last.message || "")}`;
    messagesEl.appendChild(log);
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function render() {
  const conv = getActive();
  titleEl.textContent = conv?.title || "KelvinOz AI";
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

function openSidebar() {
  sidebarEl.classList.add("open");
  overlayEl.hidden = false;
}

function closeSidebar() {
  sidebarEl.classList.remove("open");
  overlayEl.hidden = true;
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
      ${a.type.startsWith("image/") ? `<img src="${a.dataUrl}" alt="" />` : `<span>📎 ${escapeHtml(a.name)}</span>`}
      <button data-i="${i}" class="att-remove">✕</button>
    </div>`
    )
    .join("");
  attachmentsEl.querySelectorAll(".att-remove").forEach((btn) => {
    btn.onclick = () => {
      pendingAttachments.splice(Number(btn.dataset.i), 1);
      renderAttachmentPreviews();
    };
  });
}

async function readFileAsAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: reader.result,
        text: file.type.startsWith("text/") || /\.(js|ts|tsx|jsx|py|json|md|css|html|txt|csv|xml|yaml|yml)$/i.test(file.name)
          ? reader.result
          : null,
      });
    };
    reader.onerror = reject;
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

function buildApiMessages(conv, userText, attachments) {
  const prior = conv.messages.slice(0, -2).filter((m) => m.role !== "system");
  const history = prior.map(({ role, content, attachments: att }) => {
    if (role === "user" && att?.length) {
      const parts = [{ type: "text", text: content }];
      for (const a of att) {
        if (a.type.startsWith("image/")) parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
        else if (a.text) parts.push({ type: "text", text: `\n\n[File: ${a.name}]\n${a.text.slice(0, 12000)}` });
        else parts.push({ type: "text", text: `\n\n[Attached: ${a.name}]` });
      }
      return { role, content: parts };
    }
    return { role, content };
  });

  const parts = [{ type: "text", text: userText }];
  for (const a of attachments) {
    if (a.type.startsWith("image/")) {
      parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
    } else if (a.text) {
      parts.push({ type: "text", text: `\n\n[File: ${a.name}]\n${a.text.slice(0, 12000)}` });
    } else if (a.type.startsWith("video/")) {
      parts.push({ type: "text", text: `\n\n[Video attached: ${a.name} — describe or analyze based on filename/context]` });
    } else {
      parts.push({ type: "text", text: `\n\n[File attached: ${a.name}]` });
    }
  }

  return [...history, { role: "user", content: parts.length === 1 ? userText : parts }];
}

async function sendMessage(text) {
  const trimmed = text.trim();
  if ((!trimmed && !pendingAttachments.length) || isLoading) return;
  hideError();

  if (!activeId) {
    const conv = { id: uid(), title: "New chat", messages: [], files: [], deployments: [] };
    conversations.unshift(conv);
    activeId = conv.id;
  }

  const conv = getActive();
  ensureConvFields(conv);
  const attachments = [...pendingAttachments];
  pendingAttachments = [];
  renderAttachmentPreviews();

  const displayText = trimmed || (attachments.length === 1 ? `Sent ${attachments[0].name}` : `Sent ${attachments.length} files`);
  conv.messages.push({ role: "user", content: displayText, attachments, createdAt: Date.now() });
  conv.messages.push({ role: "assistant", content: "", createdAt: Date.now() });

  if (conv.messages.filter((m) => m.role === "user").length === 1) {
    conv.title = displayText.slice(0, 48);
  }
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
    let full = "";

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
        try {
          const evt = JSON.parse(raw);
          if (evt.type === "content" && evt.delta) {
            full += evt.delta;
            conv.messages[conv.messages.length - 1].content = full;
            renderMessages();
          }
          if (evt.type === "file" && evt.file) {
            mergeFiles(conv, [evt.file]);
            renderFilesPanel();
            save();
          }
          if (evt.type === "deploy") {
            conv.deployments.push({ status: evt.status, message: evt.message, at: Date.now() });
            save();
            renderMessages();
          }
          if (evt.type === "error") throw new Error(evt.error);
        } catch (e) {
          if (e.message && !e.message.includes("JSON")) throw e;
        }
      }
    }

    const extracted = extractFilesFromContent(full);
    if (extracted.length) mergeFiles(conv, extracted);
    save();
    render();
  } catch (err) {
    showError(err.message);
    conv.messages.pop();
    conv.messages.pop();
    save();
    render();
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
  }
}

async function runDeploy() {
  if (isLoading) return;
  hideError();
  isLoading = true;
  showError("Deploying to kelvinoz.com…");
  errorEl.style.background = "rgba(124, 58, 237, 0.15)";
  errorEl.style.borderColor = "rgba(124, 58, 237, 0.4)";
  errorEl.style.color = "#c4b5fd";

  try {
    const res = await fetch("/api/deploy", { method: "POST" });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Deploy failed");

    const conv = getActive();
    if (conv) {
      ensureConvFields(conv);
      conv.deployments.push({ status: "completed", message: "Live at https://kelvinoz.com", at: Date.now() });
      save();
    }
    hideError();
    alert("Deployed! Live at https://kelvinoz.com");
    render();
  } catch (err) {
    showError(err.message);
    errorEl.style.background = "";
    errorEl.style.borderColor = "";
    errorEl.style.color = "";
  } finally {
    isLoading = false;
  }
}

document.getElementById("new-chat").onclick = () => {
  activeId = null;
  closeSidebar();
  render();
};

document.getElementById("logout").onclick = async () => {
  await fetch("/api/logout", { method: "POST" });
  location.href = "/login";
};

document.getElementById("deploy-btn").onclick = () => {
  closeSidebar();
  runDeploy();
};

document.getElementById("menu-btn").onclick = openSidebar;
overlayEl.onclick = closeSidebar;

filesToggle.onclick = () => {
  filesPanel.hidden = !filesPanel.hidden;
};
document.getElementById("files-close").onclick = () => {
  filesPanel.hidden = true;
};

attachBtn.onclick = () => fileInput.click();
fileInput.onchange = async (e) => {
  for (const file of e.target.files) {
    try {
      pendingAttachments.push(await readFileAsAttachment(file));
    } catch {}
  }
  fileInput.value = "";
  renderAttachmentPreviews();
};

sendBtn.onclick = () => sendMessage(inputEl.value);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});
inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
});

document.querySelectorAll(".suggestion").forEach((btn) => {
  btn.onclick = () => sendMessage(btn.dataset.prompt);
});

render();
