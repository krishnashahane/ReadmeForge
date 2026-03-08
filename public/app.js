// ─── DOM Elements ───────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const form = $("#readme-form");
const generateBtn = $("#generate-btn");
const btnText = $("#btn-text");
const btnSpinner = $("#btn-spinner");
const outputSection = $("#output-section");
const previewDiv = $("#readme-preview");
const rawCode = $("#readme-raw");
const copyBtn = $("#copy-btn");
const downloadBtn = $("#download-btn");
const sidebar = $("#sidebar");
const historyList = $("#history-list");
const toast = $("#toast");
const descInput = $("#description");
const descCount = $("#desc-count");
const templateInput = $("#template");

let currentMarkdown = "";
let abortController = null;

// ─── Template Selector ─────────────────────────────────────────────────────

document.querySelectorAll(".template-card").forEach((card) => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".template-card").forEach((c) => c.classList.remove("active"));
    card.classList.add("active");
    templateInput.value = card.dataset.template;
  });
});

// ─── Tabs ───────────────────────────────────────────────────────────────────

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $(`#${tab.dataset.tab}-tab`).classList.add("active");
  });
});

// ─── Sidebar ────────────────────────────────────────────────────────────────

let overlay;
function getOverlay() {
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "sidebar-overlay";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", closeSidebar);
  }
  return overlay;
}

function openSidebar() {
  sidebar.classList.add("open");
  getOverlay().classList.add("show");
  loadHistory();
}

function closeSidebar() {
  sidebar.classList.remove("open");
  getOverlay().classList.remove("show");
}

$("#sidebar-toggle").addEventListener("click", openSidebar);
$("#sidebar-close").addEventListener("click", closeSidebar);

// ─── Character Count ────────────────────────────────────────────────────────

descInput.addEventListener("input", () => {
  descCount.textContent = descInput.value.length;
});

// ─── Toast Notification ─────────────────────────────────────────────────────

function showToast(message, duration = 2500) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, duration);
}

// ─── Render Markdown ────────────────────────────────────────────────────────

function renderMarkdown(md) {
  previewDiv.innerHTML = marked.parse(md);
}

// ─── Generate with Streaming ────────────────────────────────────────────────

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    projectName: $("#projectName").value.trim(),
    description: descInput.value.trim(),
    language: $("#language").value.trim(),
    features: $("#features").value.trim(),
    license: $("#license").value,
    template: templateInput.value,
    githubUrl: $("#githubUrl").value.trim(),
  };

  if (!payload.description || payload.description.length < 10) {
    showToast("Description must be at least 10 characters.");
    return;
  }

  // UI: loading state
  generateBtn.disabled = true;
  btnText.textContent = "Generating...";
  btnSpinner.classList.remove("hidden");
  outputSection.classList.remove("hidden");
  currentMarkdown = "";
  rawCode.textContent = "";
  previewDiv.innerHTML = "";
  previewDiv.classList.add("streaming-cursor");

  // Switch to preview tab
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  $('[data-tab="preview"]').classList.add("active");
  $("#preview-tab").classList.add("active");

  // Scroll to output
  outputSection.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    abortController = new AbortController();

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Server error");
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
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6);
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr);

          if (event.type === "chunk") {
            currentMarkdown += event.text;
            rawCode.textContent = currentMarkdown;
            renderMarkdown(currentMarkdown);
          } else if (event.type === "done") {
            previewDiv.classList.remove("streaming-cursor");
            showToast("README generated!");
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        } catch (parseErr) {
          if (parseErr.message && !parseErr.message.includes("JSON")) {
            throw parseErr;
          }
        }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      showToast("Generation cancelled.");
    } else {
      previewDiv.innerHTML = `<p style="color: var(--red);">Error: ${err.message}</p>`;
      rawCode.textContent = `Error: ${err.message}`;
      showToast("Generation failed. " + err.message, 4000);
    }
  } finally {
    previewDiv.classList.remove("streaming-cursor");
    generateBtn.disabled = false;
    btnText.textContent = "Generate README";
    btnSpinner.classList.add("hidden");
    abortController = null;
  }
});

// ─── Copy ───────────────────────────────────────────────────────────────────

copyBtn.addEventListener("click", () => {
  if (!currentMarkdown) return;
  navigator.clipboard.writeText(currentMarkdown).then(() => {
    showToast("Copied to clipboard!");
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
  });
});

// ─── Download ───────────────────────────────────────────────────────────────

downloadBtn.addEventListener("click", () => {
  if (!currentMarkdown) return;
  const blob = new Blob([currentMarkdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const name = $("#projectName").value.trim() || "README";
  a.download = `${name}-README.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Downloaded!");
});

// ─── History ────────────────────────────────────────────────────────────────

async function loadHistory() {
  try {
    const res = await fetch("/api/history");
    const items = await res.json();

    if (!items.length) {
      historyList.innerHTML = '<p class="empty-state">No READMEs generated yet</p>';
      return;
    }

    historyList.innerHTML = items
      .map((item) => {
        const date = new Date(item.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `
        <div class="history-item" data-id="${item.id}">
          <button class="h-delete" data-id="${item.id}" title="Delete">&times;</button>
          <div class="h-name">${escapeHtml(item.projectName)}</div>
          <div class="h-meta">${item.template} &middot; ${date}</div>
        </div>`;
      })
      .join("");

    // Click to load
    historyList.querySelectorAll(".history-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.classList.contains("h-delete")) return;
        loadHistoryEntry(el.dataset.id);
      });
    });

    // Delete
    historyList.querySelectorAll(".h-delete").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await fetch(`/api/history/${btn.dataset.id}`, { method: "DELETE" });
        loadHistory();
        showToast("Deleted");
      });
    });
  } catch {
    historyList.innerHTML = '<p class="empty-state">Could not load history</p>';
  }
}

async function loadHistoryEntry(id) {
  try {
    const res = await fetch(`/api/history/${id}`);
    const entry = await res.json();
    currentMarkdown = entry.readme;
    rawCode.textContent = currentMarkdown;
    renderMarkdown(currentMarkdown);
    outputSection.classList.remove("hidden");
    closeSidebar();
    outputSection.scrollIntoView({ behavior: "smooth" });
    showToast(`Loaded: ${entry.projectName}`);
  } catch {
    showToast("Failed to load entry.");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  // Ctrl/Cmd + Enter to generate
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    form.requestSubmit();
  }
  // Escape to cancel or close sidebar
  if (e.key === "Escape") {
    if (abortController) {
      abortController.abort();
    } else {
      closeSidebar();
    }
  }
});
