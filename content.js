(function () {
  "use strict";

  const CHAT_LINK_SEL = 'a[href^="/a/chat/"]';

  function findSidebar() {
    const firstLink = document.querySelector(CHAT_LINK_SEL);
    if (!firstLink) return null;
    let el = firstLink.parentElement;
    while (el && el !== document.body) {
      if (el.classList.contains("ds-scroll-area"))
        return el.parentElement || el;
      el = el.parentElement;
    }
    return null;
  }

  function getChatId(linkEl) {
    const href = linkEl.getAttribute("href") || "";
    const match = href.match(/\/a\/chat\/(.+)/);
    return match ? match[1] : null;
  }

  class DeepSeekArchitect {
    constructor() {
      this.folders = [];
      this.chatFolders = {};
      this.folderOpen = {};
      this.query = "";
      this.dragChatId = null;
      this._init();
    }

    async _init() {
      await this._load();
      this._mountWhenReady();
      const bodyObs = new MutationObserver(() => {
        if (!document.getElementById("dsa-panel") && this._sidebar)
          this._mount();
        clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => this._refresh(), 300);
      });
      bodyObs.observe(document.body, { childList: true, subtree: true });
    }

    _mountWhenReady() {
      const sidebar = findSidebar();
      if (!sidebar) {
        setTimeout(() => this._mountWhenReady(), 500);
        return;
      }
      this._sidebar = sidebar;
      this._mount();
    }

    _load() {
      return new Promise((resolve) => {
        chrome.storage.local.get(
          ["dsa_folders", "dsa_chatFolders", "dsa_folderOpen"],
          (r) => {
            this.folders = r.dsa_folders || [{ id: "f1", name: "Work" }];
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

    _mount() {
      if (document.getElementById("dsa-panel")) return;
      const panel = document.createElement("div");
      panel.id = "dsa-panel";
      panel.innerHTML = `
        <div id="dsa-header"><span id="dsa-title">📂 Folders</span><button id="dsa-add">＋</button></div>
        <div id="dsa-search-wrap"><input id="dsa-search" type="text" placeholder="🔍 Search..." autocomplete="off" /></div>
        <div id="dsa-body"></div>`;
      this._sidebar.insertBefore(panel, this._sidebar.firstChild);
      panel.querySelector("#dsa-add").onclick = () => this._createFolder();
      panel.querySelector("#dsa-search").oninput = (e) => {
        this.query = e.target.value.toLowerCase();
        this._render();
      };
      this._render();
    }

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

      let html = "";
      this.folders.forEach((folder) => {
        const chatsInFolder = Array.from(chatMap.entries()).filter(
          ([id]) => this.chatFolders[id] === folder.id,
        );
        const filteredChats = chatsInFolder.filter(
          ([, data]) => !this.query || data.text.includes(this.query),
        );
        const open = this.folderOpen[folder.id] !== false;

        html += `
          <div class="dsa-folder">
            <div class="dsa-folder-header" data-folder-id="${folder.id}">
              <span class="dsa-chevron">${open ? "▾" : "▸"}</span>
              <span class="dsa-folder-name">${folder.name}</span>
              <span class="dsa-folder-count">${chatsInFolder.length}</span>
              <span class="dsa-folder-actions">
                <button class="dsa-btn-rename" data-folder-id="${folder.id}">✏️</button>
                <button class="dsa-btn-delete" data-folder-id="${folder.id}">🗑️</button>
              </span>
            </div>
            <div class="dsa-folder-body ${open ? "" : "dsa-closed"}" data-drop-folder="${folder.id}">
              ${filteredChats.map(([id, data]) => this._chatChip(id, data.el)).join("") || '<div class="dsa-empty">Drag chats here</div>'}
            </div>
          </div>`;
      });
      body.innerHTML = html;
      this._bindBodyEvents(body);
      this._ensureSidebarLinksDraggable();
    }

    _chatChip(chatId, linkEl) {
      return `<div class="dsa-chat-chip" draggable="true" data-chat-id="${chatId}">
                <span class="dsa-chat-label">${linkEl.textContent.trim()}</span>
                <button class="dsa-chip-remove" data-chat-id="${chatId}">✕</button>
              </div>`;
    }

    _bindBodyEvents(body) {
      // 1. Ordner auf/zu
      body.querySelectorAll(".dsa-folder-header").forEach((h) => {
        h.onclick = (e) => {
          if (e.target.closest("button")) return;
          const fid = h.getAttribute("data-folder-id");
          this.folderOpen[fid] = this.folderOpen[fid] === false;
          this._save();
          this._render();
        };
      });

      // 2. Chat entfernen (X)
      body.querySelectorAll(".dsa-chip-remove").forEach((b) => {
        b.onclick = (e) => {
          e.stopPropagation();
          delete this.chatFolders[b.dataset.chatId];
          this._save();
          this._render();
        };
      });

      // 3. Rename & Delete
      body
        .querySelectorAll(".dsa-btn-rename")
        .forEach(
          (b) => (b.onclick = () => this._renameFolder(b.dataset.folderId)),
        );
      body
        .querySelectorAll(".dsa-btn-delete")
        .forEach(
          (b) => (b.onclick = () => this._deleteFolder(b.dataset.folderId)),
        );

      // 4. Drag & Drop Logik
      body.querySelectorAll(".dsa-folder-body").forEach((zone) => {
        zone.ondragover = (e) => e.preventDefault();
        zone.ondrop = (e) => {
          e.preventDefault();
          if (this.dragChatId) {
            this.chatFolders[this.dragChatId] = zone.dataset.dropFolder;
            this.dragChatId = null;
            this._save();
            this._render();
          }
        };
      });

      body.querySelectorAll(".dsa-chat-chip").forEach((chip) => {
        chip.ondragstart = () => {
          this.dragChatId = chip.dataset.chatId;
        };
        chip.onclick = (e) => {
          if (e.target.closest("button")) return;
          const a = this._sidebar.querySelector(
            `a[href="/a/chat/${chip.dataset.chatId}"]`,
          );
          if (a) a.click();
        };
      });
    }

    _ensureSidebarLinksDraggable() {
      this._sidebar.querySelectorAll(CHAT_LINK_SEL).forEach((a) => {
        if (a.closest("#dsa-panel")) return;
        a.setAttribute("draggable", "true");
        a.ondragstart = () => {
          this.dragChatId = getChatId(a);
        };
      });
    }

    _createFolder() {
      const name = prompt("Name:");
      if (name) {
        this.folders.push({ id: "f" + Date.now(), name });
        this._save();
        this._render();
      }
    }

    _renameFolder(fid) {
      const f = this.folders.find((x) => x.id === fid);
      const name = prompt("New name:", f.name);
      if (name) {
        f.name = name;
        this._save();
        this._render();
      }
    }

    _deleteFolder(fid) {
      if (confirm("Delete folder?")) {
        this.folders = this.folders.filter((x) => x.id !== fid);
        Object.keys(this.chatFolders).forEach((k) => {
          if (this.chatFolders[k] === fid) delete this.chatFolders[k];
        });
        this._save();
        this._render();
      }
    }

    _refresh() {
      if (document.getElementById("dsa-panel"))
        this._ensureSidebarLinksDraggable();
    }
  }

  new DeepSeekArchitect();
})();
