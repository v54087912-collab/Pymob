import { getCurrentAiModel } from "./settings.js";
import { showConfirm, showToast, showPrompt } from "./ui-utils.js";
import { renderMarkdown } from "./markdown-renderer.js";
import { saveChatSession } from "./saved-chats.js";
import { createMessageElement, handleMessageClick } from "./chat-component.js";

// State
let appState = null;
let chatHistory = [];
let isGenerating = false;
let abortController = null;
let isDevMode = false; // Default: Chat Mode (Read-only reasoning)
let wakeLock = null;
let agentLoopActive = false;
let agentRetryCount = 0;

// DOM Elements
const els = {
    view: null,
    output: null,
    input: null,
    btnSend: null,
    btnStop: null,
    contextBadge: null,
    btnToggleMode: null
};

export function initWorkspace(state) {
    appState = state;
    bindWorkspaceEvents();

    // Initial Context Check
    setTimeout(() => {
        updateContextBadge();
    }, 500);

    // Expose DevMode to global state
    if (appState) {
        appState.isDevMode = isDevMode;
        // Register AI Input Provider for script.js
        appState.aiInputProvider = resolveAiInput;
    }
}

async function resolveAiInput(prompt, logs) {
    console.log("AI Input Resolver triggered", prompt);
    try {
        const response = await fetch("/.netlify/functions/ai-workspace-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mode: 'input_solver',
                prompt: prompt,
                logs: logs,
                // Pass minimal context or none, relying on logs
                model: 'LongCat-Flash-Lite' // Fast model
            })
        });

        if (!response.ok) {
             const errText = await response.text();
             throw new Error(`AI Proxy failed: ${response.status} ${response.statusText} - ${errText}`);
        }
        const text = await response.text();
        return text.trim();

    } catch (e) {
        console.error("AI Input Error:", e);
        return null;
    }
}

function bindWorkspaceEvents() {
    els.view = document.getElementById('view-ai-workspace');
    els.output = document.getElementById('ai-chat-output');
    els.input = document.getElementById('ai-chat-input');
    els.btnSend = document.getElementById('btn-ai-send');
    els.btnStop = document.getElementById('btn-ai-stop');
    els.contextBadge = document.getElementById('ai-context-badge');
    els.btnToggleMode = document.getElementById('btn-toggle-ai-mode');

    const btnClose = document.getElementById('btn-close-ai-workspace');
    const btnClear = document.getElementById('btn-clear-ai-chat');

    console.log("Bind Events. btnSend:", els.btnSend, "input:", els.input);

    if (els.btnSend) {
        els.btnSend.onclick = () => {
            console.log("Send Clicked via Handler");
            handleSend();
        };
    }

    if (els.input) {
        els.input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        };
        // Auto-resize
        els.input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if (this.value === '') this.style.height = '';
        });
    }

    if (els.btnStop) {
        els.btnStop.onclick = stopGeneration;
    }

    if (btnClose) {
        btnClose.onclick = () => {
            if (window.uiSwitchView) window.uiSwitchView('view-editor');
        };
    }

    if (btnClear) {
        btnClear.onclick = async () => {
            if (await showConfirm("Clear Chat", "Are you sure you want to clear the chat history?")) {
                chatHistory = [];
                els.output.innerHTML = '';
                addSystemMessage("Chat cleared. Context reset.");
            }
        };
    }

    const btnSaveFile = document.getElementById('btn-save-ai-file');
    if (btnSaveFile) {
        btnSaveFile.onclick = saveChatToStorage;
    }

    if (els.btnToggleMode) {
        els.btnToggleMode.onclick = toggleDevMode;

        // Load persisted mode
        const storedMode = localStorage.getItem('ai_workspace_mode');
        if (storedMode === 'developer') {
            isDevMode = true;
        }

        // Sync to appState
        if (appState) appState.isDevMode = isDevMode;

        updateModeUI();
    }

    // Event Delegation for Buttons
    if (els.output) {
        els.output.addEventListener('click', (e) => {
            handleMessageClick(e, {
                onEdit: (msgEl) => enterEditMode(msgEl)
            });
        });
    }
}

function toggleDevMode() {
    isDevMode = !isDevMode;

    // Sync to appState
    if (appState) appState.isDevMode = isDevMode;

    localStorage.setItem('ai_workspace_mode', isDevMode ? 'developer' : 'chat');
    updateModeUI();

    showToast(isDevMode ? "Developer Mode Enabled" : "Chat Mode Enabled");
}

function updateModeUI() {
    if (!els.btnToggleMode) return;

    const icon = els.btnToggleMode.querySelector('i');
    const span = els.btnToggleMode.querySelector('span');

    if (isDevMode) {
        // Dev Mode Style
        els.btnToggleMode.classList.remove('bg-white/5', 'text-muted', 'border-white/5');
        els.btnToggleMode.classList.add('bg-accent/20', 'text-accent', 'border-accent/30');

        if (icon) icon.className = "fa-solid fa-code text-xs";
        if (span) span.textContent = "DEV MODE";
    } else {
        // Chat Mode Style
        els.btnToggleMode.classList.add('bg-white/5', 'text-muted', 'border-white/5');
        els.btnToggleMode.classList.remove('bg-accent/20', 'text-accent', 'border-accent/30');

        if (icon) icon.className = "fa-solid fa-comment text-xs";
        if (span) span.textContent = "CHAT";
    }
}

async function handleSend(textOverride = null) {
    console.log("handleSend called. Generating:", isGenerating);
    if (isGenerating) return;

    const text = textOverride || els.input.value.trim();
    console.log("Input Text:", text);
    if (!text) return;

    // Reset Input if not an override (new message)
    if (!textOverride) {
        els.input.value = "";
        els.input.style.height = "";
    }

    // Add User Message
    addMessage("user", text);
    chatHistory.push({ role: "user", content: text });

    // Prepare Context
    const contextFiles = getProjectContext(text);
    const currentFile = appState.currentFile;
    const model = getCurrentAiModel();

    updateContextBadge(contextFiles);

    // Start Generation
    isGenerating = true;
    updateUIState(true);
    abortController = new AbortController(); // Global controller for "Stop" button and Max Timeout

    // 1. Request Wake Lock (Prevent Sleep during long generation)
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
            console.warn(`Wake Lock Error: ${err.message}`);
        }
    }

    // 2. Set Max Execution Timeout (Dev: 5 mins, Chat: 60s)
    const MAX_TIMEOUT_MS = isDevMode ? 300000 : 60000;
    const maxTimeoutId = setTimeout(() => {
        if (abortController) {
            abortController.abort();
            showToast(`Request timed out (${MAX_TIMEOUT_MS / 1000}s limit).`, 'error');
        }
    }, MAX_TIMEOUT_MS);

    try {
        // Create Placeholder for AI Response
        const aiMessageId = addMessage("assistant", "Thinking...");

        // --- Retry Logic for Fetch ---
        const maxRetries = 2;
        let response;
        let lastError;

        for (let i = 0; i <= maxRetries; i++) {
            // Local Controller for Connection Timeout (15s)
            const connController = new AbortController();
            const connTimeoutId = setTimeout(() => connController.abort(), 15000); // 15s Strict Connection Timeout

            // Link Global Abort (Stop Button) to Local Controller
            const onGlobalAbort = () => connController.abort();
            abortController.signal.addEventListener('abort', onGlobalAbort);

            try {
                if (i > 0) {
                     updateMessageContent(aiMessageId, `Connecting... (Attempt ${i+1}/${maxRetries+1})`);
                     await new Promise(r => setTimeout(r, 1000 * i)); // Exponential backoff
                }

                response = await fetch("/.netlify/functions/ai-workspace-proxy", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messages: chatHistory,
                        files: contextFiles,
                        currentFile: currentFile,
                        model: model,
                        mode: isDevMode ? 'developer' : 'chat',
                        stream: false // FORCE NON-STREAMING
                    }),
                    signal: connController.signal // Use local controller
                });

                clearTimeout(connTimeoutId); // Connection succeeded

                if (response.ok) break; // Success

                // Handle Error Response
                const errText = await response.text();
                let cleanMsg = errText;
                try {
                    const json = JSON.parse(errText);
                    if (json.error) cleanMsg = json.error;
                } catch (e) {}

                throw new Error(`Server Error ${response.status}: ${cleanMsg}`);

            } catch (e) {
                clearTimeout(connTimeoutId);

                // Check if aborted by user or timeout
                if (abortController.signal.aborted) {
                     throw e; // Propagate user abort
                }
                if (connController.signal.aborted) {
                     lastError = new Error("Connection timed out (15s). Proxy failed to respond.");
                } else {
                     lastError = e;
                }
                console.warn(`Attempt ${i+1} failed:`, e);
            } finally {
                abortController.signal.removeEventListener('abort', onGlobalAbort);
            }
        }

        if (!response || !response.ok) {
            throw lastError || new Error("Failed to connect to AI Service.");
        }

        // --- Custom Stream Cleaning / Parsing Logic ---
        const rawText = await response.text();
        let aiText = "";

        // Check for "data:" anywhere in the response (robust check)
        if (rawText.indexOf("data:") !== -1) {
            console.log("Detecting SSE Stream in Non-Streaming Response. Cleaning...");

            const lines = rawText.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                // Check for data: with or without space
                if (trimmed.startsWith("data:") && !trimmed.includes("[DONE]")) {
                    // Remove "data:" prefix (case sensitive usually, but being safe)
                    // .substring(5) handles "data:" (length 5)
                    let jsonStr = trimmed.substring(5).trim();
                    try {
                        const chunk = JSON.parse(jsonStr);
                        // Strict Extraction Logic
                        if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                            aiText += chunk.choices[0].delta.content;
                        }
                        else if (chunk.choices && chunk.choices[0] && chunk.choices[0].message && chunk.choices[0].message.content) {
                            aiText += chunk.choices[0].message.content;
                        }
                    } catch (e) {
                        console.warn("Failed to parse cleaned stream chunk:", e);
                    }
                }
            }

            if (!aiText) {
                 // Fallback if parsing failed but it looked like SSE
                 // Or if it was just a string containing "data:" (unlikely conflict but possible)
                 try {
                     const data = JSON.parse(rawText);
                     if (data.choices && data.choices[0].message) {
                         aiText = data.choices[0].message.content;
                     }
                 } catch(e) {
                     throw new Error("Failed to parse AI response (Invalid SSE/JSON).");
                 }
            }

        } else {
            // Standard JSON Parsing
            try {
                const data = JSON.parse(rawText);
                if (data.choices && data.choices[0] && data.choices[0].message) {
                    aiText = data.choices[0].message.content;
                }
            } catch (e) {
                console.error("JSON Parse Error:", e);
                // Fallback: Use raw text if it looks like content (dangerous but better than crash)
                if (rawText.length > 0 && !rawText.startsWith("{")) {
                    aiText = rawText;
                } else {
                    throw new Error("Failed to parse AI response: Invalid JSON.");
                }
            }
        }

        // Update Chat History
        chatHistory.push({ role: "assistant", content: aiText });
        updateMessageContent(aiMessageId, aiText);

        // --- File Operation Options (3-Button Prompt) ---
        if (aiText.includes("<<SHOW_OPTIONS>>")) {
            const cleanText = aiText.replace("<<SHOW_OPTIONS>>", "").trim();

            // Update UI and History with clean text
            updateMessageContent(aiMessageId, cleanText);
            chatHistory[chatHistory.length - 1].content = cleanText;

            renderOptionsUI(aiMessageId);
            return; // Stop further processing
        }

        // --- Agent Logic ---
        if (isDevMode) {
            // 1. Permission Request
            if (aiText.includes("<<PERM_REQUEST>>")) {
                renderPermissionUI(aiMessageId);
            }
            // 2. Agent Execution (JSON Block)
            else if (aiText.includes("```json_agent")) {
                handleAgentExecution(aiText);
            }
            // 3. Normal Text Response (End of Loop)
            else if (agentLoopActive) {
                agentLoopActive = false;
                agentRetryCount = 0;
                addSystemMessage("Agent Task Completed.");
            }
        }

    } catch (err) {
        // If this was an abort (user stop or timeout)
        if (abortController && abortController.signal.aborted) {
             // Check if it was timeout or user stop?
             if (err.message && err.message.includes("timed out")) {
                 addSystemMessage(`Error: ${err.message}`);
             } else {
                 addSystemMessage("Generation stopped by user.");
             }
        } else {
            console.error("AI Workspace Error:", err);
            addSystemMessage(`Error: ${err.message}`);
        }
    } finally {
        clearTimeout(maxTimeoutId);
        if (wakeLock) {
            wakeLock.release().then(() => wakeLock = null);
        }
        isGenerating = false;
        abortController = null;
        updateUIState(false);
    }
}

function stopGeneration() {
    if (abortController) {
        abortController.abort();
    }
}

function getProjectContext(prompt) {
    if (!appState || !appState.files) return {};

    const MAX_CHARS = 50000; // Limit payload
    let currentChars = 0;
    const filtered = {};
    const allFiles = Object.keys(appState.files);

    // 1. Always include active file
    const activeFile = appState.currentFile;
    if (activeFile && appState.files[activeFile]) {
        filtered[activeFile] = appState.files[activeFile];
        currentChars += filtered[activeFile].length;
    }

    // 2. Scan prompt for filenames (Basic Heuristic)
    if (prompt) {
        const lowerPrompt = prompt.toLowerCase();
        allFiles.forEach(file => {
            if (file === activeFile) return;

            const name = file.split('/').pop();
            const nameNoExt = name.split('.')[0];

            // If filename referenced
            if (lowerPrompt.includes(name.toLowerCase()) || (nameNoExt.length > 2 && lowerPrompt.includes(nameNoExt.toLowerCase()))) {
                 if (currentChars + appState.files[file].length < MAX_CHARS) {
                     filtered[file] = appState.files[file];
                     currentChars += filtered[file].length;
                 }
            }
        });
    }

    // 3. Fill remaining space with other files (excluding sensitive ones)
    const BLACKLIST = ['.env', 'firebase-auth.js', 'secrets.py', 'config.js', 'keys.json'];

    for (const file of allFiles) {
        if (filtered[file]) continue;

        // Security Check: Skip blacklisted files
        const filename = file.split('/').pop();
        if (BLACKLIST.includes(filename)) continue;

        const content = appState.files[file];
        if (currentChars + content.length < MAX_CHARS) {
            filtered[file] = content;
            currentChars += content.length;
        }
    }

    // 4. Inject Full Project Tree (so AI knows about omitted files)
    filtered['__project_structure__.txt'] = allFiles.join('\n');

    return filtered;
}

// --- Agent Flow & UI ---

function renderOptionsUI(messageId) {
    const msgEl = document.getElementById(messageId);
    if (!msgEl) return;

    // Create Container
    const container = document.createElement('div');
    container.className = "flex flex-col gap-2 mt-4 animate-fade-in w-full max-w-md";

    // 1. Create New File
    const btnNew = createOptionButton(
        "📄 Create New File",
        "(I'll provide code, you create file)",
        "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border-blue-500/50"
    );
    btnNew.onclick = () => {
        container.remove();
        handleSend("ACTION: CREATE_FILE");
    };

    // 2. Modify Existing File
    const btnModify = createOptionButton(
        "✏️ Modify Existing File",
        "(Add new code to current file)",
        "bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border-yellow-500/50"
    );
    btnModify.onclick = async () => {
        const filename = await showPrompt("Modify File", "Which file would you like to modify?", appState.currentFile || "main.py");
        if (filename) {
            container.remove();
            handleSend(`ACTION: MODIFY_FILE ${filename}`);
        }
    };

    // 3. Replace All Code
    const btnReplace = createOptionButton(
        "🔄 Replace All Code",
        "(Remove old code, write new code)",
        "bg-red-500/20 hover:bg-red-500/30 text-red-400 border-red-500/50"
    );
    btnReplace.onclick = async () => {
        const filename = await showPrompt("Replace File", "Which file should I replace?", appState.currentFile || "main.py");
        if (filename) {
            container.remove();
            handleSend(`ACTION: REPLACE_FILE ${filename}`);
        }
    };

    container.appendChild(btnNew);
    container.appendChild(btnModify);
    container.appendChild(btnReplace);

    msgEl.querySelector('.message-content').appendChild(container);
    scrollToBottom();
}

function createOptionButton(title, subtext, colorClass) {
    const btn = document.createElement('button');
    btn.className = `flex flex-col items-start p-3 rounded-lg border text-left transition-all active:scale-95 ${colorClass}`;
    btn.innerHTML = `
        <span class="font-bold text-sm">${title}</span>
        <span class="text-xs opacity-75">${subtext}</span>
    `;
    return btn;
}

function renderPermissionUI(messageId) {
    const msgEl = document.getElementById(messageId);
    if (!msgEl) return;

    // Append Buttons
    const btnContainer = document.createElement('div');
    btnContainer.className = "flex gap-3 mt-4 animate-fade-in";
    btnContainer.innerHTML = `
        <button class="btn-perm-yes flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/50 py-2 rounded-lg font-bold text-xs transition-all active:scale-95">
            <i class="fa-solid fa-check mr-2"></i> Yes (Allow Terminal Input & Analysis)
        </button>
        <button class="btn-perm-no flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 py-2 rounded-lg font-bold text-xs transition-all active:scale-95">
            <i class="fa-solid fa-xmark mr-2"></i> No (Run Without Input / Explain Only)
        </button>
    `;

    btnContainer.querySelector('.btn-perm-yes').onclick = () => handlePermission(true, btnContainer);
    btnContainer.querySelector('.btn-perm-no').onclick = () => handlePermission(false, btnContainer);

    msgEl.querySelector('.message-content').appendChild(btnContainer);
    scrollToBottom();
}

function handlePermission(allowed, container) {
    container.remove();

    if (allowed) {
        addSystemMessage("Permission Granted. AI Agent activated.");
        // Send hidden system prompt to trigger Agent Mode
        handleSend("Permission Granted. Proceed with Agent execution. Output JSON.");
    } else {
        addSystemMessage("Permission Denied. Read-only mode.");
        handleSend("Permission Denied. Just explain the solution without editing files or providing inputs.");
    }
}

async function handleAgentExecution(response) {
    if (agentLoopActive && agentRetryCount > 5) {
        addSystemMessage("Agent Loop Limit Reached. Stopping.");
        agentLoopActive = false;
        agentRetryCount = 0;
        return;
    }

    try {
        // Parse JSON
        const match = response.match(/```json_agent\s*([\s\S]*?)\s*```/);
        if (!match) return;

        const data = JSON.parse(match[1]);
        agentLoopActive = true;

        // --- File Operation Guard ---
        const allFiles = Object.keys(data.files || {});
        const currentFile = appState.currentFile;

        // STRICT FILTER: Only allow modification of the currently open file
        const filesToModify = allFiles.filter(f => f === currentFile);
        const blockedFiles = allFiles.filter(f => f !== currentFile);

        if (blockedFiles.length > 0) {
            const blockedList = blockedFiles.join(', ');
            addSystemMessage(`Security: Blocked modification of ${blockedFiles.length} files (${blockedList}). AI can only modify the active file: ${currentFile}`);
        }

        if (filesToModify.length > 0) {
            addSystemMessage(`Agent Action: Updating active file (${currentFile})...`);

            // 1. Write Files (Only Allowed)
            const BLACKLIST = ['.env', 'firebase-auth.js', 'secrets.py', 'config.js', 'keys.json'];

            for (const filename of filesToModify) {
                const content = data.files[filename];

                // Security Check (Redundant but safe)
                if (BLACKLIST.some(b => filename.endsWith(b))) {
                    addSystemMessage(`Security Alert: Blocked write to ${filename}`);
                    continue;
                }

                // Update State
                appState.files[filename] = content;

                // Update Editor (Always active by definition of filter)
                if (appState.editor) {
                        appState.editor.dispatch({
                        changes: {from: 0, to: appState.editor.state.doc.length, insert: content}
                    });
                }
            }
        }

        // Trigger UI Refresh via Event
        // script.js should listen to this? Actually script.js polls or we can trigger a save.
        // Forcing a "files updated" event might help if we add a listener elsewhere.
        // window.dispatchEvent(new CustomEvent('files-updated'));

        // 2. Run Code
        if (data.command === 'run') {
            addSystemMessage("Agent Action: Running Code...");

            if (window.cmdRunCodeWithCallback) {
                // Pass Inputs if any
                const inputs = data.inputs || [];
                const result = await window.cmdRunCodeWithCallback(inputs);

                // Collect Output
                const stdout = result.logs.filter(l => l.type === 'stdout' || l.type === 'input-echo').map(l => l.content).join('');
                const stderr = result.logs.filter(l => l.type === 'stderr').map(l => l.content).join('');

                // Feedback Loop: Send Output back to AI
                agentRetryCount++;
                const feedback = `Execution Result:\n[STDOUT]\n${stdout}\n[STDERR]\n${stderr}\n\nAnalyze this output. Explain the behavior clearly. If there is an error or unexpected output, provide a \`json_agent\` fix. If it worked as expected, just explain the logic flow.`;

                handleSend(feedback);

            } else {
                addSystemMessage("Error: Agent cannot run code (Internal Error).");
            }
        } else {
            agentLoopActive = false;
        }

    } catch (e) {
        console.error("Agent Error:", e);
        addSystemMessage(`Agent Verification Failed: ${e.message}`);
        agentLoopActive = false;
    }
}

// --- UI Helpers ---

function updateUIState(generating) {
    if (els.btnSend) els.btnSend.classList.toggle('hidden', generating);
    if (els.btnStop) els.btnStop.classList.toggle('hidden', !generating);
    if (els.input) els.input.disabled = generating;
}

function addMessage(role, content) {
    // Only pass onSave for legacy single-message saving (if long-press still needed, but user wants Save Full Chat)
    // We can keep it or remove it. User didn't say remove long-press, just fix "Save Chat" behavior.
    // But "Save Chat" button refers to the header button usually.
    const msgElement = createMessageElement(role, content, {
        onSave: null // Disable individual message save to avoid confusion? Or keep as "Copy/Save snippet"?
        // User said: "AI Code Workspace me “Save Chat” button press hone par..." -> Header button.
    });

    els.output.appendChild(msgElement);
    scrollToBottom();
    return msgElement.id;
}

function updateMessageContent(id, content) {
    const div = document.getElementById(id);
    if (div) {
        // Update raw content for save/edit
        div.setAttribute('data-raw-content', encodeURIComponent(content));

        const contentDiv = div.querySelector('.message-content');
        if (contentDiv) {
            contentDiv.innerHTML = renderMarkdown(content);
        }
        div.classList.remove('opacity-75');

        // Update Copy Button
        const actionsDiv = div.querySelector('.ai-msg-actions');
        if (actionsDiv) {
            actionsDiv.innerHTML = `
                <button class="btn-copy-full text-xs bg-black/20 hover:bg-black/40 text-muted hover:text-white p-1.5 rounded-md transition-colors"
                        title="Copy Full Output" data-content="${encodeURIComponent(content)}">
                    <i class="fa-regular fa-copy"></i>
                </button>
            `;
        }
        scrollToBottom();
    }
}

function updateContextBadge(files = null) {
    if (!els.contextBadge) return;

    if (!appState || !appState.files) {
        els.contextBadge.textContent = "Waiting for files...";
        return;
    }

    // If files not provided, calculate default context (e.g. active file only)
    const contextFiles = files || getProjectContext("");
    const fileCount = Object.keys(contextFiles).filter(k => k !== '__project_structure__.txt').length;
    els.contextBadge.textContent = `${fileCount} Files Context`;
}

// --- Edit Mode Logic ---

function enterEditMode(msgEl) {
    if (!msgEl) return;

    const contentDiv = msgEl.querySelector('.message-content');
    const rawContent = decodeURIComponent(msgEl.getAttribute('data-raw-content') || "");

    // Create Edit Container
    const editContainer = document.createElement('div');
    editContainer.className = "edit-mode-container w-full";

    const textarea = document.createElement('textarea');
    textarea.className = "w-full bg-black/20 text-white text-sm p-2 rounded border border-white/10 focus:border-accent outline-none resize-none font-sans";
    textarea.rows = 3;
    textarea.value = rawContent;

    const btnGroup = document.createElement('div');
    btnGroup.className = "flex justify-end gap-2 mt-2";

    const btnCancel = document.createElement('button');
    btnCancel.className = "px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-xs text-gray-300 transition-colors";
    btnCancel.textContent = "Cancel";
    btnCancel.onclick = () => {
        // Revert
        contentDiv.innerHTML = renderMarkdown(rawContent);
        contentDiv.style.display = 'block';
        editContainer.remove();
        msgEl.querySelector('.ai-msg-actions').style.display = ''; // Show actions again
    };

    const btnSave = document.createElement('button');
    btnSave.className = "px-3 py-1 rounded bg-accent hover:bg-accentHover text-xs text-black font-bold transition-colors";
    btnSave.textContent = "Save & Submit";
    btnSave.onclick = () => {
        submitEdit(msgEl, textarea.value);
    };

    btnGroup.appendChild(btnCancel);
    btnGroup.appendChild(btnSave);

    editContainer.appendChild(textarea);
    editContainer.appendChild(btnGroup);

    // Hide original content and actions
    contentDiv.style.display = 'none';
    msgEl.querySelector('.ai-msg-actions').style.display = 'none';

    msgEl.appendChild(editContainer);
    textarea.focus();

    // Auto-resize textarea
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
}

function submitEdit(msgEl, newText) {
    if (!newText.trim()) return;

    // Find index in DOM (excluding system messages to match chatHistory)
    const allMessages = Array.from(els.output.querySelectorAll('.ai-chat-message'));

    let historyIndex = 0;
    let found = false;

    for (const el of allMessages) {
        if (el === msgEl) {
            found = true;
            break;
        }
        if (el.classList.contains('user') || el.classList.contains('ai')) {
            historyIndex++;
        }
    }

    if (found) {
        // 1. Truncate History
        chatHistory = chatHistory.slice(0, historyIndex);

        // 2. Remove DOM elements from this message onwards
        let nextSibling = msgEl.nextElementSibling;
        while(nextSibling) {
            const toRemove = nextSibling;
            nextSibling = nextSibling.nextElementSibling;
            toRemove.remove();
        }
        msgEl.remove();

        // 3. Resend
        handleSend(newText);
    } else {
        console.error("Could not find message in history");
    }
}

function addSystemMessage(text) {
    addMessage('system', text);
}

function scrollToBottom() {
    if (els.output) {
        els.output.scrollTop = els.output.scrollHeight;
    }
}

async function saveChatToStorage() {
    if (chatHistory.length === 0) {
        showToast("Nothing to save!", "warning");
        return;
    }

    // Capture full chat history as an object
    const chatSession = {
        messages: chatHistory // Store full array of {role, content}
    };

    saveChatSession(chatSession);
    addSystemMessage("Chat Saved to Sidebar.");
}

// Expose Trigger for Safety Fix
window.triggerSafetyFix = async (reason, code, logs) => {
    // 1. Ensure Workspace is Open
    if (window.uiSwitchView) window.uiSwitchView('view-ai-workspace');

    // 2. Add System Notification
    addSystemMessage(`EXECUTION HALTED: ${reason}`);

    // 3. Prepare AI Context
    const logText = logs.map(l => l.content).join('').slice(-2000); // Last 2000 chars

    const prompt = `
    The execution was automatically stopped by the Safety Monitor.
    Reason: ${reason}

    Here is the code that caused the issue:
    \`\`\`python
    ${code}
    \`\`\`

    Here are the last few execution logs:
    \`\`\`
    ${logText}
    \`\`\`

    Please analyze why this happened (e.g., infinite loop, missing break condition).
    Explain the fix clearly and provide the corrected code in a code block.
    `;

    // 4. Send to AI
    await handleSend(prompt);
};
