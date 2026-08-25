const overlay = document.getElementById("overlay");
const sidebar = document.getElementById("sidebar");
const recentsEl = document.getElementById("recents");
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const errorEl = document.getElementById("error");
const settingsEl = document.getElementById("settings");
const systemEl = document.getElementById("system-prompt");
const promptNameEl = document.getElementById("prompt-name");
const promptSaveBtn = document.getElementById("prompt-save");
const promptHintEl = document.getElementById("prompt-hint");
const savedPromptsEl = document.getElementById("saved-prompts");
const webSearchEl = document.getElementById("web-search");
const nomaskPromptEl = document.getElementById("nomask-prompt");
const streamEl = document.getElementById("stream");
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");
const attachPreviews = document.getElementById("attach-previews");

const STORE_KEY = "kelvinoz_chats_v2";
const SETTINGS_KEY = "kelvinoz_settings_v2";
const PROMPTS_KEY = "kelvinoz_saved_prompts_v1";

let conversations = [];
let activeId = null;
let loading = false;
let savedPrompts = [];
let editingPromptId = null;
let activePromptId = null;
let pendingAttachments = [];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadPrompts() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROMPTS_KEY) || "[]");
    savedPrompts = Array.isArray(raw) ? raw : [];
  } catch {
    savedPrompts = [];
  }
}

function persistPrompts() {
  localStorage.setItem(PROMPTS_KEY, JSON.stringify(savedPrompts));
}

function showPromptHint(msg) {
  promptHintEl.hidden = !msg;
  promptHintEl.textContent = msg || "";
  if (msg) setTimeout(() => {
    if (promptHintEl.textContent === msg) {
      promptHintEl.hidden = true;
    }
  }, 2000);
}

function updateSaveButton() {
  promptSaveBtn.textContent = editingPromptId ? "Update" : "Save";
}

function renderSavedPrompts() {
  if (!savedPrompts.length) {
    savedPromptsEl.innerHTML = `<p class="saved-prompts-empty">No saved prompts yet</p>`;
    return;
  }

  savedPromptsEl.innerHTML = savedPrompts
    .map((p) => {
      const preview = (p.content || "").replace(/\s+/g, " ").trim();
      return `
      <div class="saved-prompt ${p.id === activePromptId ? "active" : ""}" data-id="${p.id}">
        <button type="button" class="saved-prompt-main" data-action="use" data-id="${p.id}">
          <span class="saved-prompt-name">${escapeHtml(p.name || "Untitled")}</span>
          <span class="saved-prompt-preview">${escapeHtml(preview.slice(0, 80) || "Empty")}</span>
        </button>
        <div class="saved-prompt-actions">
          <button type="button" data-action="edit" data-id="${p.id}" aria-label="Edit prompt" title="Edit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button type="button" class="prompt-del" data-action="delete" data-id="${p.id}" aria-label="Delete prompt" title="Delete">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </div>`;
    })
    .join("");

  savedPromptsEl.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === "use") useSavedPrompt(id);
      if (action === "edit") editSavedPrompt(id);
      if (action === "delete") deleteSavedPrompt(id);
    });
  });
}

function useSavedPrompt(id) {
  const p = savedPrompts.find((x) => x.id === id);
  if (!p) return;
  systemEl.value = p.content || "";
  promptNameEl.value = p.name || "";
  editingPromptId = null;
  activePromptId = id;
  updateSaveButton();
  saveSettings();
  renderSavedPrompts();
  showPromptHint("Prompt selected");
}

function editSavedPrompt(id) {
  const p = savedPrompts.find((x) => x.id === id);
  if (!p) return;
  systemEl.value = p.content || "";
  promptNameEl.value = p.name || "";
  editingPromptId = id;
  activePromptId = id;
  updateSaveButton();
  saveSettings();
  renderSavedPrompts();
  systemEl.focus();
  showPromptHint("Editing — tap Update to save changes");
}

function deleteSavedPrompt(id) {
  savedPrompts = savedPrompts.filter((x) => x.id !== id);
  if (editingPromptId === id) {
    editingPromptId = null;
    updateSaveButton();
  }
  if (activePromptId === id) activePromptId = null;
  persistPrompts();
  renderSavedPrompts();
  showPromptHint("Prompt deleted");
}

function saveCurrentPrompt() {
  const content = systemEl.value.trim();
  if (!content) {
    showPromptHint("Write a system prompt first");
    return;
  }
  const name =
    promptNameEl.value.trim() ||
    content.split("\n").find((l) => l.trim())?.trim().slice(0, 48) ||
    "Untitled";

  if (editingPromptId) {
    const p = savedPrompts.find((x) => x.id === editingPromptId);
    if (p) {
      p.name = name;
      p.content = systemEl.value;
      p.updatedAt = Date.now();
    }
    activePromptId = editingPromptId;
    editingPromptId = null;
    updateSaveButton();
    showPromptHint("Prompt updated");
  } else {
    const item = {
      id: uid(),
      name,
      content: systemEl.value,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    savedPrompts.unshift(item);
    activePromptId = item.id;
    showPromptHint("Prompt saved");
  }

  persistPrompts();
  saveSettings();
  renderSavedPrompts();
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    conversations = Array.isArray(raw) ? raw : [];
  } catch {
    conversations = [];
  }
  loadPrompts();
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (typeof s.systemPrompt === "string") systemEl.value = s.systemPrompt;
    if (typeof s.webSearch === "boolean") webSearchEl.checked = s.webSearch;
    if (typeof s.nomaskPrompt === "boolean") nomaskPromptEl.checked = s.nomaskPrompt;
    if (typeof s.stream === "boolean") streamEl.checked = s.stream;
    if (typeof s.activePromptId === "string") activePromptId = s.activePromptId;
  } catch {}
  if (!conversations.length) newChat(false);
  else activeId = conversations[0].id;
  updateSaveButton();
  renderSavedPrompts();
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
      activePromptId,
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
  closeSection();
  settingsEl.classList.add("is-open");
  settingsEl.setAttribute("aria-hidden", "false");
  renderSavedPrompts();
  systemEl.focus();
}

function closeSettings() {
  settingsEl.classList.remove("is-open");
  settingsEl.setAttribute("aria-hidden", "true");
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
  closeSection();
}

function deleteChat(id, e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  conversations = conversations.filter((c) => c.id !== id);
  if (!conversations.length) {
    newChat(false);
  } else if (activeId === id) {
    activeId = conversations[0].id;
  }
  save();
  render();
}

function openSection(title) {
  closeSidebar();
  closeSettings();
  const page = document.getElementById("section-page");
  document.getElementById("section-title").textContent = title;
  document.getElementById("section-body").textContent = `${title} — coming soon.`;
  page.classList.add("is-open");
  page.setAttribute("aria-hidden", "false");
}

function closeSection() {
  const page = document.getElementById("section-page");
  if (!page) return;
  page.classList.remove("is-open");
  page.setAttribute("aria-hidden", "true");
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
      if (m.attachments?.length) {
        const files = document.createElement("div");
        files.className = "msg-files";
        for (const f of m.attachments) {
          if (f.kind === "image" && f.dataUrl) {
            const img = document.createElement("img");
            img.className = "msg-file-thumb";
            img.src = f.dataUrl;
            img.alt = f.name || "image";
            files.appendChild(img);
          } else if (f.kind === "video" && f.dataUrl) {
            const vid = document.createElement("video");
            vid.className = "msg-file-thumb";
            vid.src = f.dataUrl;
            vid.muted = true;
            files.appendChild(vid);
          } else {
            const label = document.createElement("div");
            label.className = "msg-file-label";
            label.textContent = f.name || "file";
            files.appendChild(label);
          }
        }
        el.appendChild(files);
      }
      if (m.content) {
        const text = document.createElement("div");
        text.textContent = m.content;
        el.appendChild(text);
      }
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

function renderAttachPreviews() {
  if (!pendingAttachments.length) {
    attachPreviews.hidden = true;
    attachPreviews.innerHTML = "";
    return;
  }
  attachPreviews.hidden = false;
  attachPreviews.innerHTML = pendingAttachments
    .map((f, i) => {
      if (f.kind === "image") {
        return `<div class="attach-chip"><img src="${f.dataUrl}" alt=""/><button type="button" class="attach-remove" data-i="${i}" aria-label="Remove">×</button></div>`;
      }
      if (f.kind === "video") {
        return `<div class="attach-chip"><video src="${f.dataUrl}" muted></video><button type="button" class="attach-remove" data-i="${i}" aria-label="Remove">×</button></div>`;
      }
      return `<div class="attach-chip"><span class="attach-name">${escapeHtml(f.name)}</span><button type="button" class="attach-remove" data-i="${i}" aria-label="Remove">×</button></div>`;
    })
    .join("");
  attachPreviews.querySelectorAll(".attach-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      pendingAttachments.splice(Number(btn.dataset.i), 1);
      renderAttachPreviews();
    });
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function addFiles(fileList) {
  const files = [...(fileList || [])];
  for (const file of files) {
    if (pendingAttachments.length >= 6) {
      showError("Max 6 attachments");
      break;
    }
    if (file.size > 12 * 1024 * 1024) {
      showError(`${file.name} is too large (max 12MB)`);
      continue;
    }
    const item = {
      id: uid(),
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      kind: file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "file",
    };
    if (item.kind === "image" || item.kind === "video") {
      item.dataUrl = await readFileAsDataUrl(file);
    } else if (
      file.type.startsWith("text/") ||
      /\.(txt|md|json|js|ts|tsx|jsx|py|css|html|csv)$/i.test(file.name)
    ) {
      item.text = await readFileAsText(file);
      item.kind = "text";
    } else {
      item.dataUrl = await readFileAsDataUrl(file);
    }
    pendingAttachments.push(item);
  }
  renderAttachPreviews();
  fileInput.value = "";
}

function buildApiContent(text, attachments) {
  const parts = [];
  let body = text || "";
  for (const f of attachments || []) {
    if (f.kind === "image" && f.dataUrl) {
      parts.push({ type: "image_url", image_url: { url: f.dataUrl } });
    } else if (f.kind === "text" && f.text != null) {
      body += `\n\n[Attached file: ${f.name}]\n${f.text}`;
    } else if (f.kind === "video") {
      body += `\n\n[Attached video: ${f.name}]`;
    } else {
      body += `\n\n[Attached file: ${f.name}]`;
    }
  }
  if (parts.length) {
    const content = [];
    if (body.trim()) content.push({ type: "text", text: body.trim() });
    content.push(...parts);
    return content;
  }
  return body;
}

function toApiMessages(conv) {
  return conv.messages
    .filter((m) => m.role === "user" || (m.role === "assistant" && m.content))
    .slice(0, -1)
    .map((m) => {
      if (m.role === "user" && m.attachments?.length) {
        return { role: "user", content: buildApiContent(m.content || "", m.attachments) };
      }
      return { role: m.role, content: m.content || "" };
    })
    .filter((m) => {
      if (typeof m.content === "string") return m.content !== "";
      return Array.isArray(m.content) && m.content.length > 0;
    });
}

function renderRecents() {
  recentsEl.innerHTML = conversations
    .map(
      (c) => `
      <div class="recent-item ${c.id === activeId ? "active" : ""}" data-id="${c.id}">
        <button type="button" class="recent-open" data-id="${c.id}">${escapeHtml(c.title || "New chat")}</button>
        <button type="button" class="recent-delete" data-id="${c.id}" aria-label="Delete chat" title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>
          </svg>
        </button>
      </div>`
    )
    .join("");

  recentsEl.querySelectorAll(".recent-open").forEach((btn) => {
    btn.addEventListener("click", () => setActive(btn.dataset.id));
  });
  recentsEl.querySelectorAll(".recent-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => deleteChat(btn.dataset.id, e));
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
  const attachments = [...pendingAttachments];
  if ((!text && !attachments.length) || loading) return;

  showError("");
  let conv = getActive();
  if (!conv) {
    newChat(false);
    conv = getActive();
  }

  const displayText =
    text ||
    (attachments.length === 1 ? `Sent ${attachments[0].name}` : `Sent ${attachments.length} files`);

  // Store lighter attachment copies in chat history (keep dataUrl for images/videos preview)
  const storedAttachments = attachments.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    kind: f.kind,
    dataUrl: f.kind === "image" || f.kind === "video" ? f.dataUrl : undefined,
  }));

  conv.messages.push({
    role: "user",
    content: text,
    attachments: storedAttachments,
    apiAttachments: attachments,
  });
  if (conv.messages.filter((m) => m.role === "user").length === 1) {
    conv.title = displayText.slice(0, 48);
  }
  conv.messages.push({ role: "assistant", content: "" });
  pendingAttachments = [];
  renderAttachPreviews();
  save();
  render();

  inputEl.value = "";
  resizeInput();
  loading = true;
  sendBtn.disabled = true;

  const assistantIndex = conv.messages.length - 1;
  let full = "";

  const apiMessages = conv.messages
    .slice(0, -1)
    .filter((m) => m.role === "user" || (m.role === "assistant" && m.content))
    .map((m) => {
      if (m.role === "user") {
        const files = m.apiAttachments || m.attachments || [];
        return { role: "user", content: buildApiContent(m.content || "", files) };
      }
      return { role: "assistant", content: m.content || "" };
    });

  // Drop heavy apiAttachments after building request payload copy
  for (const m of conv.messages) {
    if (m.apiAttachments) delete m.apiAttachments;
  }
  save();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: apiMessages,
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
document.getElementById("nav-system-prompt").addEventListener("click", openSettings);
document.getElementById("settings-back").addEventListener("click", closeSettings);
document.getElementById("section-back").addEventListener("click", closeSection);
document.getElementById("more-btn").addEventListener("click", openSettings);

document.querySelectorAll(".nav-item[data-nav]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const labels = {
      library: "Library",
      projects: "Projects",
      plugins: "Plugins",
      codex: "Codex",
      images: "Images",
    };
    openSection(labels[btn.dataset.nav] || btn.dataset.nav);
  });
});

sendBtn.addEventListener("click", sendMessage);
attachBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  fileInput.click();
});
fileInput.addEventListener("change", () => addFiles(fileInput.files));
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

promptSaveBtn.addEventListener("click", saveCurrentPrompt);
promptNameEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveCurrentPrompt();
  }
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", pinApp);
  window.visualViewport.addEventListener("scroll", pinApp);
  pinApp();
}

load();
render();
inputEl.focus();
