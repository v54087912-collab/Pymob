import { showToast, showConfirm, showPrompt } from "./ui-utils.js";
import { createMessageElement, handleMessageClick } from "./chat-component.js";
import { renderMarkdown } from "./markdown-renderer.js";

const STORAGE_KEY = 'pyide_saved_chats'; // Legacy
const SESSIONS_KEY = 'pyide_saved_sessions'; // New

export function initSavedChats() {
    // Bind Sidebar Button
    const btn = document.getElementById('btn-saved-chats');
    if (btn) {
        btn.onclick = () => {
             if (window.uiSwitchView) window.uiSwitchView('view-saved-chats');
             renderSavedChatsList();

             // Close sidebar if open
             const sidebarOverlay = document.getElementById('sidebar-overlay');
             if (sidebarOverlay && !sidebarOverlay.classList.contains('hidden')) {
                 const closeBtn = document.getElementById('btn-close-sidebar');
                 if (closeBtn) closeBtn.click();
             }
        };
    }
}

// New Session Save
export function saveChatSession(sessionData) {
    const sessions = getSavedSessions();
    const newSession = {
        id: Date.now(),
        title: `Session ${new Date().toLocaleString()}`,
        timestamp: Date.now(),
        messages: sessionData.messages || [],
        isSession: true
    };
    sessions.unshift(newSession);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    showToast("Session Saved!", "success");
    return newSession;
}

function getSavedSessions() {
    try {
        return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
    } catch (e) {
        console.error("Failed to parse saved sessions", e);
        return [];
    }
}

function getLegacySavedChats() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
        console.error("Failed to parse saved chats", e);
        return [];
    }
}

function getAllSavedChats() {
    const legacyChats = getLegacySavedChats().map(c => ({...c, isLegacy: true}));
    const sessions = getSavedSessions();

    // Merge and Sort (Newest First)
    return [...sessions, ...legacyChats].sort((a, b) => b.timestamp - a.timestamp);
}

export function renderSavedChatsList() {
    const container = document.getElementById('view-saved-chats');
    if (!container) return;

    // Reset Container
    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = "p-4 flex items-center justify-between border-b border-white/5 bg-dark sticky top-0 z-10";
    header.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-yellow-900/30 flex items-center justify-center text-yellow-500">
                <i class="fa-solid fa-bookmark"></i>
            </div>
            <span class="text-lg font-bold text-white">Saved Chats</span>
        </div>
        <button id="btn-close-saved-chats" class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-muted hover:text-white active:scale-95 transition-transform">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    container.appendChild(header);

    // Bind Close Button (Goes back to Editor)
    header.querySelector('#btn-close-saved-chats').onclick = () => {
        if (window.uiSwitchView) window.uiSwitchView('view-editor');
    };

    // List Container
    const list = document.createElement('div');
    list.className = "flex-1 overflow-y-auto p-4 space-y-3 pb-20";
    container.appendChild(list);

    const chats = getAllSavedChats();

    if (chats.length === 0) {
        list.innerHTML = `
            <div class="text-center text-muted text-sm mt-10 opacity-50 flex flex-col items-center gap-2">
                <i class="fa-regular fa-bookmark text-4xl mb-2"></i>
                <p>No saved chats yet.</p>
                <p class="text-xs">Use "Save to File" in AI Workspace.</p>
            </div>
        `;
        return;
    }

    chats.forEach(chat => {
        const div = document.createElement('div');
        div.className = "bg-surface border border-white/5 rounded-xl p-4 flex flex-col gap-2 hover:bg-white/5 transition-colors cursor-pointer group relative";

        // Preview logic
        let preview = "";
        let count = 0;

        if (chat.isSession) {
            // New Session: Preview last message or count
            const lastMsg = chat.messages[chat.messages.length - 1];
            preview = lastMsg ? (lastMsg.content || "").slice(0, 100) : "Empty Session";
            count = chat.messages.length;
        } else {
            // Legacy: Single Message
            const contentStr = chat.content || "";
            preview = contentStr.slice(0, 100);
            count = 1;
        }

        // Clean newlines
        preview = preview.replace(/\n/g, ' ') + (preview.length > 100 ? '...' : '');
        const dateStr = new Date(chat.timestamp).toLocaleString();

        // Icon
        let iconClass = 'fa-solid fa-comments text-yellow-500';
        if (chat.isLegacy) {
             iconClass = chat.role === 'user' ? 'fa-solid fa-user text-blue-400' : 'fa-solid fa-robot text-accent';
        }

        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-2">
                    <i class="${iconClass} text-xs"></i>
                    <h3 class="font-bold text-white text-sm truncate max-w-[180px] sm:max-w-[250px]">${chat.title}</h3>
                </div>
                <div class="flex items-center gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                     <button class="btn-rename-chat w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors" title="Rename">
                        <i class="fa-solid fa-pen text-xs"></i>
                    </button>
                    <button class="btn-delete-chat w-8 h-8 rounded-full hover:bg-red-500/20 flex items-center justify-center text-gray-400 hover:text-red-400 transition-colors" title="Delete">
                        <i class="fa-solid fa-trash text-xs"></i>
                    </button>
                </div>
            </div>
            <p class="text-xs text-gray-400 line-clamp-2 font-mono bg-black/20 p-2 rounded">${preview}</p>
            <span class="text-[10px] text-gray-600 mt-1">${dateStr} • ${count} msg${count!==1?'s':''}</span>
        `;

        div.onclick = (e) => {
            if (!e.target.closest('button')) {
                openSavedChat(chat);
            }
        };

        const renameBtn = div.querySelector('.btn-rename-chat');
        if (renameBtn) {
            renameBtn.onclick = (e) => {
                e.stopPropagation();
                renameSavedChat(chat);
            };
        }

        const deleteBtn = div.querySelector('.btn-delete-chat');
        if (deleteBtn) {
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteSavedChat(chat);
            };
        }

        list.appendChild(div);
    });
}

export function openSavedChat(chat) {
    const container = document.getElementById('view-saved-chats');
    if (!container) return;

    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = "p-4 flex items-center justify-between border-b border-white/5 bg-dark sticky top-0 z-10";
    header.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
            <button id="btn-back-saved-list" class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-muted hover:text-white active:scale-95 transition-transform shrink-0">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <div class="flex flex-col min-w-0">
                <span class="text-lg font-bold text-white truncate">${chat.title}</span>
                <span class="text-[10px] text-muted">${new Date(chat.timestamp).toLocaleString()}</span>
            </div>
        </div>
    `;
    container.appendChild(header);

    header.querySelector('#btn-back-saved-list').onclick = () => {
        renderSavedChatsList();
    };

    // Content: Full Render
    const contentDiv = document.createElement('div');
    // Exact same class as AI Workspace Output (pb-20 added for navbar clearance as no input area)
    contentDiv.className = "flex-1 overflow-y-auto p-4 space-y-4 pb-20";
    contentDiv.id = "saved-chat-output"; // Hook for testing if needed

    if (chat.isSession) {
        // Render Array of Messages
        chat.messages.forEach(msg => {
            // Reuse createMessageElement for exact replica
            const msgEl = createMessageElement(msg.role, msg.content || "", {
                readOnly: true,
                onSave: null
            });
            contentDiv.appendChild(msgEl);
        });
    } else {
        // Legacy: Single Message
        const msgEl = createMessageElement(chat.role, chat.content || "", { readOnly: true });
        contentDiv.appendChild(msgEl);
    }

    container.appendChild(contentDiv);

    // Bind Event Delegation (Copy, etc.)
    contentDiv.addEventListener('click', (e) => handleMessageClick(e, {}));
}

async function renameSavedChat(chat) {
    const newTitle = await showPrompt("Rename Chat", "Enter new title:", chat.title);
    if (newTitle && newTitle.trim() !== "") {
        if (chat.isSession) {
            let sessions = getSavedSessions();
            const target = sessions.find(c => c.id === chat.id);
            if (target) {
                target.title = newTitle.trim();
                localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
            }
        } else {
            let chats = getLegacySavedChats();
            const target = chats.find(c => c.id === chat.id);
            if (target) {
                target.title = newTitle.trim();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
            }
        }
        renderSavedChatsList();
        showToast("Chat renamed", "success");
    }
}

async function deleteSavedChat(chat) {
    if (await showConfirm("Delete Chat", "Are you sure?")) {
        if (chat.isSession) {
            let sessions = getSavedSessions();
            sessions = sessions.filter(c => c.id !== chat.id);
            localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
        } else {
            let chats = getLegacySavedChats();
            chats = chats.filter(c => c.id !== chat.id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
        }
        renderSavedChatsList();
        showToast("Chat deleted", "info");
    }
}
