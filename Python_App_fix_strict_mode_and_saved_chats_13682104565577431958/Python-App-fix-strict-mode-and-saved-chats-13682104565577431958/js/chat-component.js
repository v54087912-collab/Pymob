import { renderMarkdown } from "./markdown-renderer.js";

/**
 * Creates a chat message DOM element.
 * @param {string} role - 'user', 'assistant', or 'system'
 * @param {string} content - The message content (markdown)
 * @param {object} options - Configuration options
 * @param {boolean} [options.readOnly=false] - If true, hides interactive elements like Edit.
 * @param {function} [options.onSave] - Callback for long-press save action (receives {role, content, timestamp}).
 * @param {function} [options.onEdit] - Callback for edit action (receives message element).
 * @returns {HTMLElement} The created message element.
 */
export function createMessageElement(role, content, options = {}) {
    const { readOnly = false, onSave } = options;

    const div = document.createElement('div');
    const id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    div.id = id;

    if (role === 'system') {
        div.className = "text-center text-xs text-muted my-2 italic";
        div.textContent = content;
        return div;
    }

    div.className = `ai-chat-message ${role === 'user' ? 'user' : 'ai'} animate-slide-up relative group`;

    // Store content for Saving/Editing/Copying
    div.setAttribute('data-raw-content', encodeURIComponent(content));

    // Long Press to Save (Only if onSave provided and not readOnly)
    if (!readOnly && typeof onSave === 'function') {
        let pressTimer;
        const handleLongPress = () => {
             const currentContent = decodeURIComponent(div.getAttribute('data-raw-content') || "");
             onSave({
                 role: role,
                 content: currentContent,
                 timestamp: Date.now()
             });
        };

        const startPress = () => {
             pressTimer = setTimeout(handleLongPress, 800);
        };

        const cancelPress = () => {
             clearTimeout(pressTimer);
        };

        div.addEventListener('touchstart', startPress, {passive: true});
        div.addEventListener('touchend', cancelPress);
        div.addEventListener('touchmove', cancelPress);
        div.addEventListener('mousedown', startPress);
        div.addEventListener('mouseup', cancelPress);
        div.addEventListener('mouseleave', cancelPress);
    }

    // Header / Actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = "ai-msg-actions absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2";

    if (role === 'user') {
        // Edit Button (Only if not readOnly)
        if (!readOnly) {
            actionsDiv.innerHTML = `
                <button class="btn-edit-user-msg text-xs bg-black/20 hover:bg-black/40 text-muted hover:text-white p-1.5 rounded-md transition-colors" title="Edit Message">
                    <i class="fa-solid fa-pencil"></i>
                </button>
            `;
        }
    } else if (role === 'assistant' && content !== "Thinking...") {
         // Copy Full Output Button
        actionsDiv.innerHTML = `
            <button class="btn-copy-full text-xs bg-black/20 hover:bg-black/40 text-muted hover:text-white p-1.5 rounded-md transition-colors"
                    title="Copy Full Output" data-content="${encodeURIComponent(content)}">
                <i class="fa-regular fa-copy"></i>
            </button>
        `;
    }
    div.appendChild(actionsDiv);

    // Content Container
    const contentDiv = document.createElement('div');
    contentDiv.className = "message-content markdown-body";

    if (content === "Thinking...") {
         contentDiv.innerHTML = '<div class="flex items-center gap-2"><i class="fa-solid fa-circle-notch fa-spin"></i> Analyzing Project...</div>';
         div.classList.add('opacity-75');
    } else {
         contentDiv.innerHTML = renderMarkdown(content);
    }

    div.appendChild(contentDiv);

    return div;
}

/**
 * Handles click events on message elements (delegated).
 * @param {Event} e - The click event.
 * @param {object} callbacks - Callbacks for actions.
 * @param {function} [callbacks.onEdit] - Callback for edit action (receives message element).
 */
export async function handleMessageClick(e, callbacks = {}) {
    // Copy Code Block
    const btnCopyCode = e.target.closest('.btn-copy-code');
    if (btnCopyCode) {
        const targetId = btnCopyCode.getAttribute('data-target');
        const codeEl = document.getElementById(targetId);
        if (codeEl) {
            await copyToClipboard(codeEl.textContent, btnCopyCode);
        }
        return;
    }

    // Copy Full Output
    const btnCopyFull = e.target.closest('.btn-copy-full');
    if (btnCopyFull) {
        const content = decodeURIComponent(btnCopyFull.getAttribute('data-content'));
        await copyToClipboard(content, btnCopyFull);
        return;
    }

    // Edit User Message
    const btnEdit = e.target.closest('.btn-edit-user-msg');
    if (btnEdit && callbacks.onEdit) {
        const msgEl = btnEdit.closest('.ai-chat-message');
        callbacks.onEdit(msgEl);
    }
}

/**
 * Copies text to clipboard and shows visual feedback on the button.
 * @param {string} text - Text to copy.
 * @param {HTMLElement} btn - The button element triggered the copy.
 */
async function copyToClipboard(text, btn) {
    try {
        await navigator.clipboard.writeText(text);

        // Visual Feedback
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-check text-green-500"></i> Copied!`;
        btn.classList.add('text-green-500');

        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.remove('text-green-500');
        }, 2000);

    } catch (err) {
        console.error('Failed to copy:', err);
        btn.innerHTML = `<i class="fa-solid fa-xmark text-red-500"></i> Error`;
         setTimeout(() => {
            btn.innerHTML = `<i class="fa-regular fa-copy"></i> Copy`;
        }, 2000);
    }
}
