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
const modelSelect = document.getElementById("model-select");
const imageBtn = document.getElementById("image-btn");
const welcomeEl = document.getElementById("welcome");

const STORE_KEY = "kelvinoz_chats_v2";
const SETTINGS_KEY = "kelvinoz_settings_v2";
const PROMPTS_KEY = "kelvinoz_saved_prompts_v1";
const PLUGINS_KEY = "kelvinoz_connected_plugins_v2";
const PROJECTS_KEY = "kelvinoz_projects_v1";
const MODEL_KEY = "kelvinoz_model_v1";

let conversations = [];
let activeId = null;
let loading = false;
let savedPrompts = [];
let editingPromptId = null;
let activePromptId = null;
let pendingAttachments = [];
let connectedPlugins = []; // [{id, connectedAt, apiKey?}]
let projects = [];
let currentSection = null;
let pluginQuery = "";
let pendingConnectId = null;
let imageMode = false;

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
  const savedModel = localStorage.getItem(MODEL_KEY);
  if (modelSelect && savedModel) {
    if (![...modelSelect.options].some((o) => o.value === savedModel)) {
      const opt = document.createElement("option");
      opt.value = savedModel;
      opt.textContent = savedModel;
      modelSelect.appendChild(opt);
    }
    modelSelect.value = savedModel;
  }
  if (!conversations.length) newChat(false);
  else activeId = conversations[0].id;
  loadExtra();
  updateSaveButton();
  renderSavedPrompts();
}

function slimForStorage(convs) {
  return convs.map((c) => ({
    ...c,
    messages: (c.messages || []).map((m) => {
      const next = { ...m };
      if (next.images?.length) {
        next.images = next.images.map((img) => ({
          url: img.url,
          prompt: img.prompt,
          // Keep tiny data URLs only; drop huge base64 to avoid quota blowups
          dataUrl:
            typeof img.dataUrl === "string" && img.dataUrl.length < 8000 ? img.dataUrl : undefined,
        }));
      }
      if (next.attachments?.length) {
        next.attachments = next.attachments.map((f) => {
          if (f.kind === "image" || f.kind === "video") return f;
          const { dataUrl, ...rest } = f;
          return rest;
        });
      }
      delete next.apiAttachments;
      return next;
    }),
  }));
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(slimForStorage(conversations)));
  } catch {
    // Quota exceeded — drop generated dataUrls and retry once
    for (const c of conversations) {
      for (const m of c.messages || []) {
        if (m.images) {
          m.images = m.images.map((img) => ({ url: img.url, prompt: img.prompt }));
        }
      }
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(slimForStorage(conversations)));
  }
}

function setImageMode(on) {
  imageMode = !!on;
  if (imageBtn) imageBtn.classList.toggle("active", imageMode);
  inputEl.placeholder = imageMode ? "Describe what to create…" : "Ask KelvinOz AI";
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

function httpErrorMessage(res, data) {
  const status = res.status;
  if (status === 504 || status === 408) {
    return "Request timed out (504). Try Stream ON, or a faster model like DeepSeek Flash / Qwen.";
  }
  if (status === 502 || status === 503) {
    return data?.error || "Upstream AI is briefly unavailable. Try again.";
  }
  return data?.error || data?.message || `Error ${status}`;
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

function loadExtra() {
  try {
    const raw = JSON.parse(localStorage.getItem(PLUGINS_KEY) || "[]");
    // migrate old string[] installs
    if (Array.isArray(raw)) {
      connectedPlugins = raw.map((item) =>
        typeof item === "string" ? { id: item, connectedAt: Date.now() } : item
      );
    } else connectedPlugins = [];
  } catch {
    connectedPlugins = [];
  }
  try {
    projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]");
    if (!Array.isArray(projects)) projects = [];
  } catch {
    projects = [];
  }
}

function persistPlugins() {
  localStorage.setItem(PLUGINS_KEY, JSON.stringify(connectedPlugins));
}

function persistProjects() {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function pluginCatalog() {
  return Array.isArray(window.KELVINOZ_PLUGINS) ? window.KELVINOZ_PLUGINS : [];
}

function isPluginConnected(id) {
  return connectedPlugins.some((p) => p.id === id);
}

function getConnectedPlugin(id) {
  return connectedPlugins.find((p) => p.id === id) || null;
}

function getInstalledPluginObjects() {
  const map = new Map(pluginCatalog().map((p) => [p.id, p]));
  return connectedPlugins.map((c) => {
    const meta = map.get(c.id);
    return meta ? { ...meta, apiKey: c.apiKey || "" } : null;
  }).filter(Boolean);
}

function needsApiKey(plugin) {
  return String(plugin.id || "").startsWith("hostinger");
}

function openSection(key) {
  const titles = {
    library: "Library",
    projects: "Projects",
    plugins: "Plugins",
    codex: "Codex",
    images: "Images",
  };
  currentSection = key;
  closeSidebar();
  closeSettings();
  const page = document.getElementById("section-page");
  document.getElementById("section-title").textContent = titles[key] || key;
  page.classList.add("is-open");
  page.setAttribute("aria-hidden", "false");
  renderSection();
}

function closeSection() {
  const page = document.getElementById("section-page");
  if (!page) return;
  page.classList.remove("is-open");
  page.setAttribute("aria-hidden", "true");
  currentSection = null;
}

function renderSection() {
  const body = document.getElementById("section-body");
  if (!body || !currentSection) return;
  if (currentSection === "library") return renderLibrary(body);
  if (currentSection === "projects") return renderProjects(body);
  if (currentSection === "plugins") return renderPlugins(body);
  if (currentSection === "codex") return renderCodex(body);
  if (currentSection === "images") return renderImages(body);
  body.innerHTML = `<p class="section-empty">Unknown section</p>`;
}

function renderLibrary(body) {
  const q = (pluginQuery || "").toLowerCase();
  const list = conversations.filter((c) => !q || (c.title || "").toLowerCase().includes(q));
  body.innerHTML = `
    <input class="section-search" id="section-search" placeholder="Search chats" value="${escapeHtml(pluginQuery)}" />
    <div class="section-group">Your chats</div>
    <div id="section-list"></div>
  `;
  const listEl = body.querySelector("#section-list");
  if (!list.length) {
    listEl.innerHTML = `<p class="section-empty">No chats yet</p>`;
  } else {
    listEl.innerHTML = list
      .map(
        (c) => `
      <div class="list-row">
        <button type="button" class="open-row" data-open="${c.id}">
          <div class="list-meta">
            <strong>${escapeHtml(c.title || "New chat")}</strong>
            <span>${(c.messages || []).length} messages</span>
          </div>
        </button>
        <div class="list-actions">
          <button type="button" class="recent-delete" data-del="${c.id}" aria-label="Delete">🗑</button>
        </div>
      </div>`
      )
      .join("");
  }
  body.querySelector("#section-search").addEventListener("input", (e) => {
    pluginQuery = e.target.value;
    renderSection();
  });
  listEl.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActive(btn.dataset.open);
      closeSection();
    });
  });
  listEl.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      deleteChat(btn.dataset.del);
      renderSection();
    });
  });
}

function renderProjects(body) {
  body.innerHTML = `
    <div class="project-form">
      <input id="project-name" placeholder="New project name" />
      <button type="button" id="project-add">Add</button>
    </div>
    <div class="section-group">Projects</div>
    <div id="section-list"></div>
  `;
  const listEl = body.querySelector("#section-list");
  if (!projects.length) {
    listEl.innerHTML = `<p class="section-empty">No projects yet. Create one, then open a chat from Library.</p>`;
  } else {
    listEl.innerHTML = projects
      .map((p) => {
        const count = conversations.filter((c) => c.projectId === p.id).length;
        return `
        <div class="list-row">
          <div class="list-meta">
            <strong>${escapeHtml(p.name)}</strong>
            <span>${count} chats</span>
          </div>
          <div class="list-actions">
            <button type="button" class="plugin-add" data-assign="${p.id}" title="Add current chat">+</button>
            <button type="button" class="recent-delete" data-del-project="${p.id}" aria-label="Delete">🗑</button>
          </div>
        </div>`;
      })
      .join("");
  }
  body.querySelector("#project-add").addEventListener("click", () => {
    const name = body.querySelector("#project-name").value.trim();
    if (!name) return;
    projects.unshift({ id: uid(), name, createdAt: Date.now() });
    persistProjects();
    renderSection();
  });
  listEl.querySelectorAll("[data-assign]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const conv = getActive();
      if (!conv) return;
      conv.projectId = btn.dataset.assign;
      save();
      renderSection();
    });
  });
  listEl.querySelectorAll("[data-del-project]").forEach((btn) => {
    btn.addEventListener("click", () => {
      projects = projects.filter((p) => p.id !== btn.dataset.delProject);
      conversations.forEach((c) => {
        if (c.projectId === btn.dataset.delProject) delete c.projectId;
      });
      persistProjects();
      save();
      renderSection();
    });
  });
}

function renderPlugins(body) {
  const q = (pluginQuery || "").toLowerCase();
  const connected = getInstalledPluginObjects();
  const connectedIds = new Set(connectedPlugins.map((p) => p.id));
  const available = pluginCatalog().filter(
    (p) =>
      (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) &&
      !connectedIds.has(p.id)
  );

  body.innerHTML = `
    <input class="section-search" id="section-search" placeholder="Search plugins" value="${escapeHtml(pluginQuery)}" />
    <div class="section-group">Connected</div>
    <div id="installed-wrap"></div>
    <div class="section-group">Public</div>
    <div id="public-wrap"></div>
  `;

  const installedWrap = body.querySelector("#installed-wrap");
  const publicWrap = body.querySelector("#public-wrap");

  if (!connected.length) {
    installedWrap.innerHTML = `<p class="section-empty">No plugins connected yet</p>`;
  } else {
    installedWrap.innerHTML = connected
      .map(
        (p) => `
      <div class="plugin-row">
        <div class="plugin-icon" style="background:${p.color}">${escapeHtml(p.name.slice(0, 1))}</div>
        <button type="button" class="open-row" data-open-plugin="${p.id}">
          <div class="plugin-meta">
            <strong>${escapeHtml(p.name)}</strong>
            <span>Connected · ${escapeHtml(p.description)}</span>
          </div>
        </button>
        <button type="button" class="plugin-add on" data-disconnect="${p.id}" aria-label="Disconnect">✓</button>
      </div>`
      )
      .join("");
  }

  if (!available.length) {
    publicWrap.innerHTML = `<p class="section-empty">No matching plugins</p>`;
  } else {
    publicWrap.innerHTML = available
      .map(
        (p) => `
      <div class="plugin-row">
        <div class="plugin-icon" style="background:${p.color}">${escapeHtml(p.name.slice(0, 1))}</div>
        <button type="button" class="open-row" data-open-plugin="${p.id}">
          <div class="plugin-meta">
            <strong>${escapeHtml(p.name)}</strong>
            <span>${escapeHtml(p.description)}</span>
          </div>
        </button>
        <button type="button" class="plugin-add" data-connect="${p.id}" aria-label="Connect plugin">+</button>
      </div>`
      )
      .join("");
  }

  body.querySelector("#section-search").addEventListener("input", (e) => {
    pluginQuery = e.target.value;
    renderSection();
  });
  body.querySelectorAll("[data-connect], [data-open-plugin]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.connect || btn.dataset.openPlugin;
      openPluginConnect(id);
    });
  });
  body.querySelectorAll("[data-disconnect]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      disconnectPlugin(btn.dataset.disconnect);
      renderSection();
    });
  });
}

function openPluginConnect(id) {
  const plugin = pluginCatalog().find((p) => p.id === id);
  if (!plugin) return;
  pendingConnectId = id;

  const modal = document.getElementById("connect-modal");
  const logo = document.getElementById("connect-plugin-logo");
  const title = document.getElementById("connect-title");
  const cont = document.getElementById("connect-continue");
  const extra = document.getElementById("connect-extra");

  logo.textContent = plugin.name.slice(0, 1);
  logo.style.background = plugin.color || "#673de6";
  title.textContent = `Connect ${plugin.name}`;
  cont.textContent = `Continue to ${plugin.name}`;

  const existing = getConnectedPlugin(id);
  if (needsApiKey(plugin)) {
    extra.hidden = false;
    extra.innerHTML = `
      <input id="connect-api-key" type="password" placeholder="Paste Hostinger API token" value="${escapeHtml(existing?.apiKey || "")}" />
      <p>Get a token from hPanel → Profile → API. This stays on your device and is used for direct Hostinger access.</p>
    `;
  } else {
    extra.hidden = true;
    extra.innerHTML = "";
  }

  // Show detail header inside plugins section body too
  if (currentSection === "plugins") {
    const body = document.getElementById("section-body");
    const detail = document.createElement("div");
    detail.className = "plugin-detail";
    detail.innerHTML = `
      <div class="plugin-detail-icon" style="background:${plugin.color}">${escapeHtml(plugin.name.slice(0, 1))}</div>
      <h3>${escapeHtml(plugin.name)}</h3>
      <p>${escapeHtml(plugin.description)}</p>
      ${existing ? `<div class="plugin-status">Connected</div>` : ""}
    `;
    // keep search list under modal; modal is the main connect UX
  }

  modal.hidden = false;
}

function closeConnectModal() {
  document.getElementById("connect-modal").hidden = true;
  pendingConnectId = null;
}

function disconnectPlugin(id) {
  connectedPlugins = connectedPlugins.filter((p) => p.id !== id);
  persistPlugins();
}

function confirmConnectPlugin() {
  const plugin = pluginCatalog().find((p) => p.id === pendingConnectId);
  if (!plugin) return closeConnectModal();

  let apiKey = "";
  if (needsApiKey(plugin)) {
    const input = document.getElementById("connect-api-key");
    apiKey = (input?.value || "").trim();
    if (!apiKey) {
      showError("Paste your Hostinger API token to connect");
      return;
    }
  }

  connectedPlugins = connectedPlugins.filter((p) => p.id !== plugin.id);
  connectedPlugins.unshift({
    id: plugin.id,
    connectedAt: Date.now(),
    ...(apiKey ? { apiKey } : {}),
  });
  persistPlugins();
  closeConnectModal();
  if (currentSection === "plugins") renderSection();
  showError("");
}

function renderCodex(body) {
  const snippets = [];
  for (const c of conversations) {
    for (const m of c.messages || []) {
      if (m.role !== "assistant" || !m.content) continue;
      const blocks = String(m.content).match(/```[\s\S]*?```/g) || [];
      blocks.forEach((b, i) => {
        snippets.push({
          id: `${c.id}-${i}`,
          chatId: c.id,
          title: c.title || "New chat",
          code: b.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/```$/, "").trim(),
        });
      });
    }
  }

  body.innerHTML = `
    <div class="section-group">Scratchpad</div>
    <textarea id="codex-pad" class="codex-box" placeholder="// Write or paste code here"></textarea>
    <div class="project-form" style="margin-top:10px">
      <button type="button" id="codex-to-chat" style="width:100%;padding:12px">Send scratchpad to chat</button>
    </div>
    <div class="section-group">Code from chats</div>
    <div id="section-list"></div>
  `;

  try {
    body.querySelector("#codex-pad").value = localStorage.getItem("kelvinoz_codex_pad") || "";
  } catch {}

  body.querySelector("#codex-pad").addEventListener("input", (e) => {
    try {
      localStorage.setItem("kelvinoz_codex_pad", e.target.value);
    } catch {}
  });

  body.querySelector("#codex-to-chat").addEventListener("click", () => {
    const code = body.querySelector("#codex-pad").value.trim();
    if (!code) return;
    closeSection();
    inputEl.value = `Review and improve this code:\n\n\`\`\`\n${code}\n\`\`\``;
    resizeInput();
    inputEl.focus();
  });

  const listEl = body.querySelector("#section-list");
  if (!snippets.length) {
    listEl.innerHTML = `<p class="section-empty">No code blocks in chats yet</p>`;
  } else {
    listEl.innerHTML = snippets
      .slice(0, 30)
      .map(
        (s) => `
      <div class="list-row">
        <button type="button" class="open-row" data-open="${s.chatId}">
          <div class="list-meta">
            <strong>${escapeHtml(s.title)}</strong>
            <span>${escapeHtml(s.code.slice(0, 80))}</span>
          </div>
        </button>
      </div>`
      )
      .join("");
    listEl.querySelectorAll("[data-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setActive(btn.dataset.open);
        closeSection();
      });
    });
  }
}

function renderImages(body) {
  const images = [];
  for (const c of conversations) {
    for (const m of c.messages || []) {
      for (const f of m.attachments || []) {
        if ((f.kind === "image" || f.kind === "video") && (f.dataUrl || f.url)) {
          images.push({
            ...f,
            src: f.dataUrl || f.url,
            chatId: c.id,
            title: c.title || "New chat",
          });
        }
      }
      for (const img of m.images || []) {
        if (img.dataUrl || img.url) {
          images.push({
            kind: "image",
            name: img.prompt || "Generated",
            src: img.dataUrl || img.url,
            chatId: c.id,
            title: c.title || "New chat",
          });
        }
      }
    }
  }

  body.innerHTML = `
    <div class="project-form" style="display:flex;gap:8px">
      <button type="button" id="images-create" style="flex:1;padding:12px">Create image</button>
      <button type="button" id="images-upload" style="flex:1;padding:12px">Upload</button>
    </div>
    <div class="section-group">Gallery</div>
    <div id="section-list" class="image-grid"></div>
  `;

  body.querySelector("#images-upload").addEventListener("click", () => {
    closeSection();
    fileInput.click();
  });
  body.querySelector("#images-create").addEventListener("click", () => {
    closeSection();
    setImageMode(true);
    inputEl.focus();
  });

  const listEl = body.querySelector("#section-list");
  if (!images.length) {
    listEl.className = "";
    listEl.innerHTML = `<p class="section-empty">No images yet. Create one or upload from chat.</p>`;
    return;
  }
  listEl.innerHTML = images
    .map((img) =>
      img.kind === "video"
        ? `<video src="${img.src}" controls></video>`
        : `<img src="${img.src}" alt="${escapeHtml(img.name || "image")}" data-open="${img.chatId}" />`
    )
    .join("");
  listEl.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", () => {
      setActive(el.dataset.open);
      closeSection();
    });
  });
}

function renderMarkdown(text) {
  const escaped = escapeHtml(text || "");
  return escaped
    .replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^(?:- |\* )(.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");
}

function updateWelcome() {
  const conv = getActive();
  const hasMsgs = !!(conv && conv.messages && conv.messages.length);
  if (welcomeEl) welcomeEl.hidden = hasMsgs;
}

function iconBtn(label, path) {
  return `<button type="button" class="msg-action" aria-label="${label}">${path}</button>`;
}

function renderMessages() {
  const conv = getActive();
  const keepWelcome = welcomeEl;
  messagesEl.innerHTML = "";
  if (keepWelcome) messagesEl.appendChild(keepWelcome);
  updateWelcome();
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
      if (m.images?.length) {
        for (const img of m.images) {
          const src = img.dataUrl || img.url;
          if (!src) continue;
          const image = document.createElement("img");
          image.className = "msg-image";
          image.src = src;
          image.alt = img.prompt || "Generated image";
          image.loading = "lazy";
          el.appendChild(image);
        }
      }
      if (m.pending) {
        const pending = document.createElement("div");
        pending.className = "msg-pending";
        pending.innerHTML = `<span class="dots"><i></i><i></i><i></i></span>${escapeHtml(m.pending)}`;
        el.appendChild(pending);
      }
      const text = document.createElement("div");
      text.className = "md";
      if (m.content) text.innerHTML = `<p>${renderMarkdown(m.content)}</p>`;
      el.appendChild(text);
      if (m.content || m.images?.length) {
        const actions = document.createElement("div");
        actions.className = "msg-actions";
        actions.innerHTML = [
          iconBtn("Copy", '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/></svg>'),
        ].join("");
        const copyBtn = actions.querySelector('[aria-label="Copy"]');
        if (copyBtn) {
          copyBtn.addEventListener("click", () => navigator.clipboard?.writeText(m.content || m.images?.[0]?.prompt || ""));
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

function scrollMessagesToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function syncViewport() {
  const vv = window.visualViewport;
  const app = document.getElementById("app");
  if (!app) return;

  if (!vv || window.matchMedia("(min-width: 960px)").matches) {
    app.style.height = "";
    app.style.transform = "";
    document.body.classList.remove("keyboard-open");
    return;
  }

  const offsetTop = vv.offsetTop || 0;
  app.style.height = `${vv.height}px`;
  app.style.transform = `translateY(${offsetTop}px)`;

  const keyboardOpen = window.innerHeight - vv.height - offsetTop > 60;
  document.body.classList.toggle("keyboard-open", keyboardOpen);
}

function resetDocumentScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function onComposerFocus() {
  resetDocumentScroll();
  syncViewport();
  scrollMessagesToBottom();
  requestAnimationFrame(() => {
    resetDocumentScroll();
    syncViewport();
    scrollMessagesToBottom();
  });
  setTimeout(() => {
    resetDocumentScroll();
    syncViewport();
    scrollMessagesToBottom();
  }, 120);
  setTimeout(syncViewport, 320);
}

function onComposerBlur() {
  document.body.classList.remove("keyboard-open");
  syncViewport();
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

  const wantImage =
    imageMode ||
    /\b(generate|create|draw|make|paint|render|show)\b[\s\S]{0,48}\b(image|photo|picture|pic|illustration|logo|artwork|art)\b/i.test(
      text
    ) ||
    /\b(image|photo|picture|pic) of\b/i.test(text) ||
    /^(draw|paint|sketch)\b/i.test(text);

  const displayText =
    text ||
    (attachments.length === 1 ? `Sent ${attachments[0].name}` : `Sent ${attachments.length} files`);

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
  conv.messages.push({
    role: "assistant",
    content: "",
    images: [],
    pending: wantImage ? "Generating…" : "Thinking…",
  });
  pendingAttachments = [];
  setImageMode(false);
  renderAttachPreviews();
  save();
  render();

  inputEl.value = "";
  resizeInput();
  loading = true;
  sendBtn.disabled = true;

  const assistantIndex = conv.messages.length - 1;
  let full = "";

  // Create image: system prompt alone decides what gets rendered
  if (wantImage && text && !attachments.length) {
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          systemPrompt: systemEl.value.trim(),
          model: modelSelect?.value || "deepseek-v4-pro",
          nomaskPrompt: nomaskPromptEl.checked,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(httpErrorMessage(res, data));
      conv.messages[assistantIndex].pending = undefined;
      conv.messages[assistantIndex].images = [
        { url: data.url, dataUrl: data.dataUrl || data.url, prompt: data.userPrompt || text },
      ];
      conv.messages[assistantIndex].content = "";
      save();
      render();
      return;
    } catch (err) {
      showError(err.message || "Image generation failed");
      conv.messages.pop();
      conv.messages.pop();
      save();
      render();
      loading = false;
      sendBtn.disabled = false;
      return;
    }
  }

  const apiMessages = conv.messages
    .slice(0, -1)
    .filter((m) => m.role === "user" || (m.role === "assistant" && (m.content || m.images?.length)))
    .map((m) => {
      if (m.role === "user") {
        const files = m.apiAttachments || m.attachments || [];
        return { role: "user", content: buildApiContent(m.content || "", files) };
      }
      return { role: "assistant", content: m.content || "" };
    });

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
        model: modelSelect?.value || "deepseek-v4-pro",
        systemPrompt: systemEl.value,
        webSearch: webSearchEl.checked,
        nomaskPrompt: nomaskPromptEl.checked,
        stream: streamEl.checked,
        plugins: getInstalledPluginObjects().map((p) => ({
          id: p.id,
          name: p.name,
          instruction: p.instruction,
        })),
        hostingerApiKey:
          getInstalledPluginObjects().find((p) => String(p.id).startsWith("hostinger"))?.apiKey || "",
      }),
    });

    if (!streamEl.checked) {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(httpErrorMessage(res, data));
      full = data.content || "";
      conv.messages[assistantIndex].pending = undefined;
      conv.messages[assistantIndex].content = full;
      if (Array.isArray(data.images) && data.images.length) {
        conv.messages[assistantIndex].images = data.images;
      }
      save();
      render();
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(httpErrorMessage(res, data));
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
        if (evt.type === "image" && evt.image) {
          conv.messages[assistantIndex].pending = undefined;
          if (!conv.messages[assistantIndex].images) conv.messages[assistantIndex].images = [];
          conv.messages[assistantIndex].images.push(evt.image);
          renderMessages();
        } else if (evt.type === "content" && evt.delta) {
          conv.messages[assistantIndex].pending = undefined;
          full += evt.delta;
          conv.messages[assistantIndex].content = full;
          renderMessages();
        } else if (evt.type === "error") {
          throw new Error(evt.error || "Chat failed");
        }
      }
    }

    conv.messages[assistantIndex].pending = undefined;
    conv.messages[assistantIndex].content = full;
    save();
    render();
    if (!full && !conv.messages[assistantIndex].images?.length) showError("Empty response");
  } catch (err) {
    if (!full && !conv.messages[assistantIndex].images?.length) {
      conv.messages.pop();
      save();
      render();
    } else {
      conv.messages[assistantIndex].pending = undefined;
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
    pluginQuery = "";
    openSection(btn.dataset.nav);
  });
});

document.getElementById("section-settings").addEventListener("click", () => {
  closeSection();
  openSettings();
});

document.getElementById("connect-close").addEventListener("click", closeConnectModal);
document.getElementById("connect-cancel").addEventListener("click", closeConnectModal);
document.getElementById("connect-backdrop").addEventListener("click", closeConnectModal);
document.getElementById("connect-continue").addEventListener("click", confirmConnectPlugin);

sendBtn.addEventListener("click", sendMessage);
attachBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  fileInput.click();
});
fileInput.addEventListener("change", () => addFiles(fileInput.files));
inputEl.addEventListener("input", resizeInput);
inputEl.addEventListener("focus", onComposerFocus);
inputEl.addEventListener("blur", onComposerBlur);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

if (imageBtn) {
  imageBtn.addEventListener("click", () => {
    setImageMode(!imageMode);
    inputEl.focus();
  });
}

if (modelSelect) {
  modelSelect.addEventListener("change", () => {
    localStorage.setItem(MODEL_KEY, modelSelect.value);
  });
}

if (welcomeEl) {
  welcomeEl.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    if (chip.dataset.image) {
      setImageMode(true);
      if (chip.dataset.image !== "1") inputEl.value = chip.dataset.image;
      resizeInput();
      inputEl.focus();
      return;
    }
    if (chip.dataset.prompt) {
      setImageMode(false);
      inputEl.value = chip.dataset.prompt;
      resizeInput();
      inputEl.focus();
    }
  });
}

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
  window.visualViewport.addEventListener("resize", syncViewport);
  window.visualViewport.addEventListener("scroll", syncViewport);
}
window.addEventListener("resize", syncViewport);
window.addEventListener("orientationchange", () => setTimeout(syncViewport, 250));

load();
render();
syncViewport();
if (!window.matchMedia("(pointer: coarse)").matches) inputEl.focus();
