// DeepSeek Chat Architect v2.0 (fixed)
// Injects a folder panel into DeepSeek's sidebar

(function () {
  "use strict";

  // ─── Selectors ────────────────────────────────────────────────────────────
  const CHAT_LINK_SEL = 'a[href^="/a/chat/"]';
  findSidebar;

  function findSidebar() {
    const firstLink = document.querySelector('a[href^="/a/chat/"]');
    if (!firstLink) return null;

    let el = firstLink.parentElement;
    while (el && el !== document.body) {
      if (el.classList.contains("ds-scroll-area")) {
        return el.parentElement || el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function getChatId(linkEl) {
    const href = linkEl.getAttribute("href") || "";
    const match = href.match(/\/a\/chat\/(.+)/);
    return match ? match[1] : null;
  }

  // ─── Main Class ───────────────────────────────────────────────────────────
  class DeepSeekArchitect {
    constructor() {
      this.folders = [];
      this.chatFolders = {};
      this.folderOpen = {};
      this.query = "";
      this.dragChatId = null;
      this._panelMounted = false;
      this._retries = 0;
      this._init();
    }

    // ── Bootstrap ────────────────────────────────────────────────────────────
    async _init() {
      await this._load();
      this._mountWhenReady();

      const bodyObs = new MutationObserver((mutations) => {
        const isOurChange = mutations.some(
          (m) =>
            m.target.id?.startsWith("dsa-") || m.target.closest?.("#dsa-panel"),
        );

        if (isOurChange) return;

        if (!document.getElementById("dsa-panel")) {
          this._panelMounted = false;
          this._mountWhenReady();
        }

        clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => this._refresh(), 300);
      });

      bodyObs.observe(document.body, { childList: true, subtree: true });
    }

    _mountWhenReady() {
      const sidebar = findSidebar();
      if (!sidebar) {
        if (this._retries < 40) {
          this._retries++;
          setTimeout(() => this._mountWhenReady(), 500);
        }
        return;
      }
      this._retries = 0;
      this._sidebar = sidebar;
      this._mount();
    }

    // ── Storage ──────────────────────────────────────────────────────────────
    _load() {
      return new Promise((resolve) => {
        chrome.storage.local.get(
          ["dsa_folders", "dsa_chatFolders", "dsa_folderOpen"],
          (r) => {
            this.folders = r.dsa_folders || [
              { id: "f1", name: "Work" },
              { id: "f2", name: "Learn" },
              { id: "f3", name: "Ideas" },
            ];
            this.chatFolders = r.dsa_chatFolders || {};
            this.folderOpen = r.dsa_folderOpen || {};
            resolve();
          },
        );
      });
    }

    _save() {
      chrome.storage.local.set({
        dsa_folders: this.folders,
        dsa_chatFolders: this.chatFolders,
        dsa_folderOpen: this.folderOpen,
      });
    }

    // ── Inject Panel ─────────────────────────────────────────────────────────
    _mount() {
      if (this._panelMounted || document.getElementById("dsa-panel")) return;

      const panel = document.createElement("div");
      panel.id = "dsa-panel";
      panel.innerHTML = `
        <div id="dsa-header">
          <span id="dsa-title">📂 Folders</span>
          <button id="dsa-add" title="New folder">＋</button>
        </div>
        <div id="dsa-search-wrap">
          <input id="dsa-search" type="text" placeholder="🔍 Search…" autocomplete="off" />
        </div>
        <div id="dsa-body"></div>
        <div id="dsa-footer">
          <button id="dsa-export" title="Export">📤 Export</button>
          <button id="dsa-import" title="Import">📥 Import</button>
        </div>`;

      this._sidebar.insertBefore(panel, this._sidebar.firstChild);
      this._panelMounted = true;

      panel
        .querySelector("#dsa-add")
        .addEventListener("click", () => this._createFolder());
      panel.querySelector("#dsa-search").addEventListener("input", (e) => {
        this.query = e.target.value.toLowerCase();
        this._render();
      });
      panel
        .querySelector("#dsa-export")
        .addEventListener("click", () => this._export());
      panel
        .querySelector("#dsa-import")
        .addEventListener("click", () => this._import());

      this._render();
      this._ensureSidebarLinksDraggable(); // initial pass
    }

    // ── Make native sidebar links draggable & add context menu (handles dynamic loading) ──
    _ensureSidebarLinksDraggable() {
      if (!this._sidebar) return;
      const links = this._sidebar.querySelectorAll(CHAT_LINK_SEL);
      for (const a of links) {
        if (a.closest("#dsa-panel")) continue;
        if (!a.hasAttribute("data-dsa-drag")) {
          a.setAttribute("draggable", "true");
          a.setAttribute("data-dsa-drag", "1");
          a.addEventListener("dragstart", (e) => {
            this.dragChatId = getChatId(a);
            e.dataTransfer.effectAllowed = "move";
          });
          a.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            const chatId = getChatId(a);
            if (chatId) this._showContextMenu(e, chatId);
          });
        }
      }
    }

    // ── Render the folder panel ────────────────────────────────────────────────
    _render() {
      const body = document.getElementById("dsa-body");
      if (!body) return;

      const allLinks = Array.from(
        this._sidebar.querySelectorAll(CHAT_LINK_SEL),
      ).filter((a) => !a.closest("#dsa-panel"));

      const chatMap = new Map();
      allLinks.forEach((a) => {
        const id = getChatId(a);
        if (id) chatMap.set(id, { el: a, text: a.textContent.toLowerCase() });
      });

      const q = this.query;
      let html = "";

      this.folders.forEach((folder) => {
        const chatsInFolder = Array.from(chatMap.entries()).filter(
          ([id, data]) => {
            const inFolder = this.chatFolders[id] === folder.id;
            const matches = !q || data.text.includes(q);
            return inFolder && matches;
          },
        );

        const folderMatches = !q || folder.name.toLowerCase().includes(q);
        if (!folderMatches && chatsInFolder.length === 0) return;

        const open = this.folderOpen[folder.id] !== false;

        html += `
          <div class="dsa-folder" data-folder-id="${folder.id}">
            <div class="dsa-folder-header" data-folder-id="${folder.id}">
              <span class="dsa-chevron">${open ? "▾" : "▸"}</span>
              <span class="dsa-folder-name">${this._esc(folder.name)}</span>
              <span class="dsa-folder-count">${chatsInFolder.length}</span>
              <span class="dsa-folder-actions">
                <button class="dsa-btn-rename" data-folder-id="${folder.id}">✏️</button>
                <button class="dsa-btn-delete" data-folder-id="${folder.id}">🗑️</button>
              </span>
            </div>
            <div class="dsa-folder-body ${open ? "" : "dsa-closed"}" data-drop-folder="${folder.id}">
              ${
                chatsInFolder.length
                  ? chatsInFolder
                      .map(([id, data]) => this._chatChip(id, data.el))
                      .join("")
                  : '<div class="dsa-empty">' +
                    (q ? "No matches" : "Drag chats here") +
                    "</div>"
              }
            </div>
          </div>`;
      });

      const uncat = Array.from(chatMap.entries()).filter(([id, data]) => {
        const hasNoFolder =
          !this.chatFolders[id] ||
          !this.folders.find((f) => f.id === this.chatFolders[id]);
        const matches = !q || data.text.includes(q);
        return hasNoFolder && matches;
      });

      if (uncat.length > 0 || !q) {
        const uncatOpen = this.folderOpen["__uncat__"] !== false;
        html += `
          <div class="dsa-folder" data-folder-id="__uncat__">
            <div class="dsa-folder-header" data-folder-id="__uncat__">
              <span class="dsa-chevron">${uncatOpen ? "▾" : "▸"}</span>
              <span class="dsa-folder-name">Unorganized</span>
              <span class="dsa-folder-count">${uncat.length}</span>
            </div>
            <div class="dsa-folder-body ${uncatOpen ? "" : "dsa-closed"}" data-drop-folder="__uncat__">
              ${
                uncat.length
                  ? uncat
                      .map(([id, data]) => this._chatChip(id, data.el))
                      .join("")
                  : '<div class="dsa-empty">All organized!</div>'
              }
            </div>
          </div>`;
      }

      body.innerHTML = html;
      this._bindBodyEvents(body);
    }

    _chatChip(chatId, linkEl) {
      const label = linkEl.textContent.trim() || "Chat";
      return `
        <div class="dsa-chat-chip"
             draggable="true"
             data-chat-id="${chatId}"
             title="${this._esc(label)}">
          <span class="dsa-chat-label">${this._esc(label)}</span>
          <button class="dsa-chip-remove" data-chat-id="${chatId}" title="Remove from folder">✕</button>
        </div>`;
    }

    _bindBodyEvents(body) {
      // Folder toggle
      body.querySelectorAll(".dsa-folder-header").forEach((h) => {
        h.addEventListener("click", (e) => {
          if (
            e.target.closest(".dsa-btn-rename") ||
            e.target.closest(".dsa-btn-delete")
          )
            return;
          const fid = h.getAttribute("data-folder-id");
          this.folderOpen[fid] = this.folderOpen[fid] === false ? true : false;
          this._save();
          this._render();
        });
      });

      // Rename / Delete buttons
      body.querySelectorAll(".dsa-btn-rename").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this._renameFolder(btn.getAttribute("data-folder-id"));
        });
      });
      body.querySelectorAll(".dsa-btn-delete").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this._deleteFolder(btn.getAttribute("data-folder-id"));
        });
      });

      // Chip remove
      body.querySelectorAll(".dsa-chip-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.getAttribute("data-chat-id");
          delete this.chatFolders[id];
          this._save();
          this._render();
        });
      });

      // Chip click → navigate
      body.querySelectorAll(".dsa-chat-chip").forEach((chip) => {
        chip.addEventListener("click", (e) => {
          if (e.target.closest(".dsa-chip-remove")) return;
          const id = chip.getAttribute("data-chat-id");
          const link = this._sidebar.querySelector(`a[href="/a/chat/${id}"]`);
          if (link) {
            link.click();
          } else {
            window.location.href = `https://chat.deepseek.com/a/chat/${id}`;
          }
        });
      });

      // Drag start from chips inside panel
      body.querySelectorAll(".dsa-chat-chip[draggable]").forEach((chip) => {
        chip.addEventListener("dragstart", (e) => {
          this.dragChatId = chip.getAttribute("data-chat-id");
          e.dataTransfer.effectAllowed = "move";
        });
      });

      // Drop zones
      body.querySelectorAll(".dsa-folder-body").forEach((zone) => {
        zone.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          zone.classList.add("dsa-drag-over");
        });
        zone.addEventListener("dragleave", () =>
          zone.classList.remove("dsa-drag-over"),
        );
        zone.addEventListener("drop", (e) => {
          e.preventDefault();
          zone.classList.remove("dsa-drag-over");
          const fid = zone.getAttribute("data-drop-folder");
          if (this.dragChatId) {
            if (fid === "__uncat__") {
              delete this.chatFolders[this.dragChatId];
            } else {
              this.chatFolders[this.dragChatId] = fid;
            }
            this.dragChatId = null;
            this._save();
            this._render();
          }
        });
      });
    }

    // Improved context menu (closes only when clicking outside)
    _showContextMenu(event, chatId) {
      const existing = document.getElementById("dsa-ctx");
      if (existing) existing.remove();

      const menu = document.createElement("div");
      menu.id = "dsa-ctx";
      const items = this.folders
        .map(
          (f) => `<div class="dsa-ctx-item" data-folder-id="${f.id}">
                     📁 ${this._esc(f.name)}
                   </div>`,
        )
        .join("");

      menu.innerHTML = `
        <div class="dsa-ctx-head">Move to folder</div>
        ${items}
        <div class="dsa-ctx-item" data-folder-id="__uncat__">📋 All chats (no folder)</div>`;

      menu.style.left = event.clientX + "px";
      menu.style.top = event.clientY + "px";
      document.body.appendChild(menu);

      const closeMenu = () => menu.remove();
      const onClickOutside = (e) => {
        if (!menu.contains(e.target)) closeMenu();
      };

      menu.querySelectorAll(".dsa-ctx-item").forEach((item) => {
        item.addEventListener("click", () => {
          const fid = item.getAttribute("data-folder-id");
          if (fid === "__uncat__") {
            delete this.chatFolders[chatId];
          } else {
            this.chatFolders[chatId] = fid;
          }
          this._save();
          this._render();
          closeMenu();
        });
      });

      // Close when clicking outside, but not immediately (to avoid race with item clicks)
      setTimeout(
        () =>
          document.addEventListener("click", onClickOutside, { once: true }),
        20,
      );
    }

    // ── Folder CRUD ───────────────────────────────────────────────────────────
    _createFolder() {
      const name = prompt("Folder name:", "New folder");
      if (!name?.trim()) return;
      const folder = { id: `f${Date.now()}`, name: name.trim() };
      this.folders.push(folder);
      this.folderOpen[folder.id] = true;
      this._save();
      this._render();
    }

    _renameFolder(fid) {
      const folder = this.folders.find((f) => f.id === fid);
      if (!folder) return;
      const name = prompt("New name:", folder.name);
      if (!name?.trim()) return;
      folder.name = name.trim();
      this._save();
      this._render();
    }

    _deleteFolder(fid) {
      if (!confirm("Delete folder? All chats will move back to 'All chats'."))
        return;
      this.folders = this.folders.filter((f) => f.id !== fid);
      Object.keys(this.chatFolders).forEach((id) => {
        if (this.chatFolders[id] === fid) delete this.chatFolders[id];
      });
      delete this.folderOpen[fid];
      this._save();
      this._render();
    }

    // ── Refresh (called on DOM mutations) ─────────────────────────────────────
    _refresh() {
      if (document.getElementById("dsa-panel")) {
        this._ensureSidebarLinksDraggable();
        const currentLinks =
          this._sidebar?.querySelectorAll(CHAT_LINK_SEL).length;
        if (this._lastLinkCount !== currentLinks) {
          this._lastLinkCount = currentLinks;
          this._render();
        }
      }
    }

    // ── Import / Export ───────────────────────────────────────────────────────
    _export() {
      const data = {
        version: 2,
        exportedAt: new Date().toISOString(),
        folders: this.folders,
        chatFolders: this.chatFolders,
        folderOpen: this.folderOpen,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deepseek-architect-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    _import() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            if (data.folders) this.folders = data.folders;
            if (data.chatFolders) this.chatFolders = data.chatFolders;
            if (data.folderOpen) this.folderOpen = data.folderOpen;
            this._save();
            this._render();
            alert("✅ Import successful!");
          } catch {
            alert("❌ Error: Invalid file.");
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }

    _esc(str) {
      const d = document.createElement("div");
      d.textContent = str;
      return d.innerHTML;
    }
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────
  if (window.location.hostname === "chat.deepseek.com") {
    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        () => new DeepSeekArchitect(),
      );
    } else {
      new DeepSeekArchitect();
    }
  }
})();
