let conversations = JSON.parse(localStorage.getItem("kelvinoz_chats") || "[]");
let activeId = conversations[0]?.id || null;
let isLoading = false;

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const errorEl = document.getElementById("error");
const welcomeEl = document.getElementById("welcome");
const convListEl = document.getElementById("conversations");
const titleEl = document.getElementById("chat-title");

function save() {
  localStorage.setItem("kelvinoz_chats", JSON.stringify(conversations));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getActive() {
  return conversations.find((c) => c.id === activeId);
}

function renderConversations() {
  convListEl.innerHTML = conversations
    .map(
      (c) =>
        `<div class="conv-item ${c.id === activeId ? "active" : ""}" data-id="${c.id}">${escapeHtml(c.title)}</div>`
    )
    .join("");
  convListEl.querySelectorAll(".conv-item").forEach((el) => {
    el.onclick = () => {
      activeId = el.dataset.id;
      render();
    };
  });
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function formatMarkdown(text) {
  return escapeHtml(text)
    .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

function renderMessages() {
  const conv = getActive();
  if (!conv || !conv.messages.length) {
    welcomeEl.hidden = false;
    messagesEl.querySelectorAll(".msg").forEach((m) => m.remove());
    return;
  }
  welcomeEl.hidden = true;
  messagesEl.querySelectorAll(".msg").forEach((m) => m.remove());
  conv.messages.forEach((m) => {
    const div = document.createElement("div");
    div.className = `msg ${m.role}`;
    div.innerHTML = `
      <div class="msg-avatar">${m.role === "user" ? "You" : "AI"}</div>
      <div class="msg-content">${m.role === "assistant" ? formatMarkdown(m.content) : escapeHtml(m.content).replace(/\n/g, "<br>")}</div>
    `;
    messagesEl.appendChild(div);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function render() {
  const conv = getActive();
  titleEl.textContent = conv?.title || "KelvinOz AI";
  renderConversations();
  renderMessages();
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function hideError() {
  errorEl.hidden = true;
}

async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || isLoading) return;

  hideError();

  if (!activeId) {
    const conv = { id: uid(), title: trimmed.slice(0, 48), messages: [] };
    conversations.unshift(conv);
    activeId = conv.id;
  }

  const conv = getActive();
  conv.messages.push({ role: "user", content: trimmed });
  conv.messages.push({ role: "assistant", content: "" });
  if (conv.messages.filter((m) => m.role === "user").length === 1) {
    conv.title = trimmed.slice(0, 48);
  }
  save();
  render();

  inputEl.value = "";
  isLoading = true;
  sendBtn.disabled = true;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: conv.messages.slice(0, -1).map(({ role, content }) => ({ role, content })),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Error ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const text = parsed.choices?.[0]?.delta?.content || "";
          if (text) {
            full += text;
            conv.messages[conv.messages.length - 1].content = full;
            renderMessages();
          }
        } catch {}
      }
    }
    save();
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

document.getElementById("new-chat").onclick = () => {
  activeId = null;
  render();
};

document.getElementById("logout").onclick = async () => {
  await fetch("/api/logout", { method: "POST" });
  location.href = "/login";
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
  inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + "px";
});

document.querySelectorAll(".suggestion").forEach((btn) => {
  btn.onclick = () => sendMessage(btn.dataset.prompt);
});

render();
