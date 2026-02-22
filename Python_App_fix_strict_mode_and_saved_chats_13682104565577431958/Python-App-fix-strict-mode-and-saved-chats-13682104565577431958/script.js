// Imports
import { EditorView, basicSetup } from "https://esm.sh/codemirror";
import { python } from "https://esm.sh/@codemirror/lang-python";
import { javascript } from "https://esm.sh/@codemirror/lang-javascript";
import { html } from "https://esm.sh/@codemirror/lang-html";
import { css } from "https://esm.sh/@codemirror/lang-css";
import { json } from "https://esm.sh/@codemirror/lang-json";
import { syntaxHighlighting, defaultHighlightStyle } from "https://esm.sh/@codemirror/language";
import { EditorState, Compartment, Transaction, StateField, StateEffect } from "https://esm.sh/@codemirror/state";
import { keymap, Decoration, WidgetType } from "https://esm.sh/@codemirror/view";
import { cmTheme } from "./js/cm-theme.js";
import { initSettings } from "./js/settings.js";
import { getThemeExtension } from "./js/theme-registry.js";
import { indentWithTab, undo, redo, selectAll, deleteLine, indentMore, indentLess, toggleComment } from "https://esm.sh/@codemirror/commands";
import { openSearchPanel, gotoLine } from "https://esm.sh/@codemirror/search";
import { startCompletion } from "https://esm.sh/@codemirror/autocomplete";
import { linter, lintGutter } from "https://esm.sh/@codemirror/lint";
import { PyMainThread } from "./js/py-main-thread.js";
import { initAuth, signInWithEmail, signUpWithEmail, signOutUser } from "./js/firebase-auth.js";
import { autoFixCode } from "./js/ai-debugger.js";
import { refactorCode, generateCodeFromPrompt, generateDocs, generateTests, explainCode } from "./js/ai-features.js";
import { initWorkspace } from "./js/ai-workspace.js";
import { DialogLoader } from "./js/dialog-loader.js";
import { showToast, showConfirm, showPrompt } from "./js/ui-utils.js";
import { detectMissingLibraries } from "./js/library-detector.js";
import { initSavedChats } from "./js/saved-chats.js";
import { persistence } from "./js/persistence.js";

// Import CSS
import './css/themes.css';
import './css/style.css';
import './css/error.css';
import './css/auth.css';

function insertSnippet(view, type) {
    const snippets = {
        'def': 'def function_name(args):\n    """Docstring"""\n    pass\n',
        'for': 'for item in iterable:\n    pass\n',
        'if': 'if condition:\n    pass\nelse:\n    pass\n',
        'class': 'class ClassName:\n    def __init__(self, args):\n        pass\n',
        'try': 'try:\n    pass\nexcept Exception as e:\n    print(e)\n',
        'import': 'import module_name\nfrom module import submodule\n'
    };

    const text = snippets[type];
    if (text) {
        const selection = view.state.selection.main;
        view.dispatch({
            changes: {from: selection.from, to: selection.to, insert: text},
            selection: {anchor: selection.from + text.length}
        });
        view.focus();
    }
}

// Popular Libraries Config
const POPULAR_LIBS = [
    // Data Science & Math
    { name: "numpy", desc: "Scientific computing with Python" },
    { name: "pandas", desc: "Data analysis and manipulation" },
    { name: "scipy", desc: "Mathematics, science, and engineering" },
    { name: "sympy", desc: "Symbolic mathematics" },
    { name: "statsmodels", desc: "Statistical models and tests" },
    { name: "xarray", desc: "N-D labeled arrays and datasets" },

    // Visualization
    { name: "matplotlib", desc: "Plotting and visualization" },
    { name: "seaborn", desc: "Statistical data visualization" },
    { name: "plotly", desc: "Interactive graphing library" },
    { name: "bokeh", desc: "Interactive visualizations for web" },
    { name: "altair", desc: "Declarative statistical visualization" },

    // Web & Networking
    { name: "requests", desc: "HTTP for Humans" },
    { name: "urllib3", desc: "HTTP client for Python" },
    { name: "httpx", desc: "Next-gen HTTP client" },
    { name: "aiohttp", desc: "Async HTTP client/server" },
    { name: "pyodide-http", desc: "Patch requests for Pyodide" },

    // Web Scraping
    { name: "beautifulsoup4", desc: "Screen-scraping library" },
    { name: "lxml", desc: "XML and HTML processing (Pyodide build)" },
    { name: "html5lib", desc: "HTML parser based on WHATWG" },
    { name: "cssselect", desc: "Parse CSS3 selectors" },
    { name: "parsel", desc: "HTML/XML extraction library" },

    // File Formats
    { name: "openpyxl", desc: "Read/Write Excel 2010 xlsx/xlsm" },
    { name: "xlsxwriter", desc: "Create Excel .xlsx files" },
    { name: "jsonschema", desc: "JSON Schema validation" },
    { name: "pyyaml", desc: "YAML parser and emitter" },
    { name: "toml", desc: "Tom's Obvious, Minimal Language" },
    { name: "xmltodict", desc: "XML to JSON/Dict converter" },

    // Machine Learning
    { name: "scikit-learn", desc: "Machine Learning in Python" },
    { name: "joblib", desc: "Pipeline/Task pipelining" },
    { name: "mlxtend", desc: "Machine Learning extensions" },

    // NLP & Text
    { name: "nltk", desc: "Natural Language Toolkit" },
    { name: "textblob", desc: "Simple NLP processing" },
    { name: "regex", desc: "Alternative regular expressions" },
    { name: "langdetect", desc: "Language detection library" },
    { name: "wordcloud", desc: "Word cloud generator" },

    // Image Processing
    { name: "pillow", desc: "Python Imaging Library (Fork)" },
    { name: "imageio", desc: "Read and write image data" },
    { name: "scikit-image", desc: "Image processing algorithms" },

    // Utilities
    { name: "tqdm", desc: "Progress bar for loops" },
    { name: "rich", desc: "Rich text and formatting" },
    { name: "colorama", desc: "Cross-platform colored text" },
    { name: "loguru", desc: "Python logging made (stupidly) simple" },
    { name: "python-dateutil", desc: "Extensions to datetime" },
    { name: "faker", desc: "Generate fake data" },

    // Pyodide Core
    { name: "micropip", desc: "Package installer (built-in)" },
    { name: "setuptools", desc: "Package development process" }
];

// DOM Elements Mapping
const els = {
    editorContainer: document.getElementById('editor-container'),
    output: document.getElementById('console-output'),
    fileList: document.getElementById('file-list'),
    btnRun: document.getElementById('btn-run'),
    btnStop: document.getElementById('btn-stop'),
    btnStopConsole: document.getElementById('btn-stop-console'),
    btnAutoFix: document.getElementById('btn-auto-fix'),
    btnNew: document.getElementById('btn-new-file'),
    btnUndo: document.getElementById('btn-undo'),
    btnRedo: document.getElementById('btn-redo'),
    btnClearCode: document.getElementById('btn-clear-code'),
    btnClearConsole: document.getElementById('btn-clear-console'),
    btnCopyConsole: document.getElementById('btn-copy-console'),

    // Sidebar
    btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
    btnCloseSidebar: document.getElementById('btn-close-sidebar'),
    sidebarMenu: document.getElementById('sidebar-menu'),
    sidebarOverlay: document.getElementById('sidebar-overlay'),
    avatarContainer: document.getElementById('sidebar-avatar-container'),
    avatarPlaceholder: document.getElementById('sidebar-avatar-placeholder'),
    avatarImg: document.getElementById('sidebar-avatar-img'),
    inputAvatar: document.getElementById('input-avatar-upload'),

    // Profile Edit
    btnEditProfile: document.getElementById('btn-edit-profile'),
    modalProfileEdit: document.getElementById('modal-profile-edit'),
    btnCloseProfileEdit: document.getElementById('btn-close-profile-edit'),
    btnSaveProfile: document.getElementById('btn-save-profile'),
    editFirstname: document.getElementById('edit-firstname'),
    editSurname: document.getElementById('edit-surname'),
    editAvatarPreview: document.getElementById('edit-avatar-preview'),
    editAvatarImg: document.getElementById('edit-avatar-img'),
    btnSignOutSidebar: document.getElementById('btn-sign-out-sidebar'),
    btnSignOutSettings: document.getElementById('btn-sign-out-settings'),

    // Onboarding
    viewOnboarding: document.getElementById('view-onboarding'),
    btnSaveOnboarding: document.getElementById('btn-save-onboarding'),
    onboardingFirstname: document.getElementById('onboarding-firstname'),
    onboardingSurname: document.getElementById('onboarding-surname'),
    inputAvatarOnboarding: document.getElementById('input-avatar-onboarding'),
    onboardingAvatarImg: document.getElementById('onboarding-avatar-img'),

    // Library
    libSearch: document.getElementById('lib-search'),
    btnInstallLib: document.getElementById('btn-install-lib'),
    libList: document.getElementById('lib-list'),

    // AI Command Bar
    btnToggleCommandBar: document.getElementById('btn-toggle-command-bar'),
    aiCommandBar: document.getElementById('ai-command-bar'),
    btnCloseCommandBar: document.getElementById('btn-close-command-bar'),
    aiCommandInput: document.getElementById('ai-command-input'),
    btnAiGenerate: document.getElementById('btn-ai-generate'),

    // AI Sidebar Tools
    btnAiRefactor: document.getElementById('btn-ai-refactor'),
    btnAiDocs: document.getElementById('btn-ai-docs'),
    btnAiTests: document.getElementById('btn-ai-tests'),
    btnAiExplain: document.getElementById('btn-ai-explain'),

    // Quick Keys
    quickKeys: document.querySelectorAll('.key-btn')
};

// State
let state = {
    files: {},
    currentFile: 'main.py',
    currentDir: '', // Root is empty string, 'subfolder/' otherwise
    worker: null,
    sharedBuffer: null,
    int32View: null,
    uint8View: null,
    editor: null,
    wrapEnabled: false,
    pendingLintResolve: null,
    isRunning: false,
    isWaitingForInput: false,
    runAfterInit: null,
    lastError: null,
    currentUser: null,
    isDevMode: false,
    executionCallback: null,
    executionLogs: [],
    autoInputs: [],
    aiInputProvider: null,
    monitoringMode: false,
    monitoringStats: { lastLines: [], repeatCount: 0, startTime: 0 },
    isManualExecution: false,
    restartTimeout: null
};

const wrapCompartment = new Compartment();
const themeCompartment = new Compartment();
const languageCompartment = new Compartment();

// --- CodeMirror Error Handling Extension ---

// 1. Define the Effect to Add/Clear Errors
const setErrorEffect = StateEffect.define();

// 2. Define the Widget that renders the Error Box
class ErrorWidget extends WidgetType {
    constructor(message, type) {
        super();
        this.message = message;
        this.type = type;
    }

    toDOM() {
        const wrap = document.createElement("div");
        wrap.className = "cm-error-widget";

        // Icon
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-triangle-exclamation cm-error-icon";
        wrap.appendChild(icon);

        // Content Container
        const content = document.createElement("div");
        content.className = "cm-error-content";

        // Title (Error Type)
        const title = document.createElement("div");
        title.className = "cm-error-title";
        title.textContent = this.type;
        content.appendChild(title);

        // Message (Explanation)
        const msg = document.createElement("div");
        msg.className = "cm-error-msg";
        msg.textContent = this.message;
        content.appendChild(msg);

        wrap.appendChild(content);
        return wrap;
    }
}

// 3. Define the State Field to manage decorations
const errorField = StateField.define({
    create() {
        return Decoration.none;
    },
    update(underlying, tr) {
        let deco = underlying;

        // Clear error on any document change (user typing)
        if (tr.docChanged) {
            return Decoration.none;
        }

        // Handle dispatched effects (setting the error)
        for (let e of tr.effects) {
            if (e.is(setErrorEffect)) {
                // Expecting { line: number, message: string, type: string } or null to clear
                if (e.value) {
                    const { line, message, type } = e.value;
                    // Line Decoration (Highlight)
                    const lineDeco = Decoration.line({
                        attributes: { class: "cm-error-line" }
                    }).range(tr.state.doc.line(line).from);

                    // Widget Decoration (Box Below)
                    const widgetDeco = Decoration.widget({
                        widget: new ErrorWidget(message, type),
                        block: true,
                        side: 1 // below
                    }).range(tr.state.doc.line(line).to); // attach to end of line so it renders below block

                    deco = Decoration.set([lineDeco, widgetDeco]);
                } else {
                    deco = Decoration.none;
                }
            }
        }
        return deco;
    },
    provide: f => EditorView.decorations.from(f)
});

// --- CodeMirror Linter ---
const pythonLinter = async (view) => {
    // Only run if Worker is ready
    if (!state.worker) return [];

    const doc = view.state.doc;
    const code = doc.toString();

    // Skip if empty to avoid noise
    if (!code.trim()) return [];

    return new Promise((resolve) => {
        state.pendingLintResolve = (result) => {
             if (result.error && result.lineno > 0) {
                // Python lineno is 1-based
                let line;
                try {
                     line = doc.line(result.lineno);
                } catch(e) {
                    resolve([]); // invalid line
                    return;
                }

                // Calculate offsets
                let fromPos = line.from;
                let toPos = line.to;

                if (result.offset) {
                    fromPos = Math.min(line.to, line.from + (result.offset - 1));
                    toPos = Math.min(line.to, fromPos + 1);
                }

                resolve([{
                    from: fromPos,
                    to: toPos,
                    severity: "error",
                    message: result.msg,
                    source: "Python Syntax"
                }]);
            } else {
                resolve([]);
            }
        };

        state.worker.postMessage({ type: 'LINT', content: code });

        // Safety timeout
        setTimeout(() => {
            if (state.pendingLintResolve) {
                // If the promise hasn't been resolved yet by the handler
                // We don't null it out here because we can't check identity easily without keeping ref
                // But it's fine, next lint will overwrite.
            }
        }, 2000);
    });
};


// Initialization
async function init() {
    // Check for Force Update Lock
    if (DialogLoader.isLocked()) {
        console.warn("System Locked: Force Update Required.");
        // We still call startMonitoring to ensure the dialog appears and to check if update is satisfied
        DialogLoader.startMonitoring();
        return; // Stop initialization
    }

    initSettings(); // Initialize settings (themes, font size)
    await persistence.init(); // Initialize Persistence (IndexedDB)
    migratePackages(); // Migrate legacy package list
    await loadFiles();
    loadUserProfile(); // Load avatar
    initEditor();

    // Restore Terminal History
    try {
        const terminalHistory = await persistence.loadTerminal();
        if (terminalHistory && els.output) {
            els.output.innerHTML = terminalHistory;
            els.output.scrollTop = els.output.scrollHeight;
        }
    } catch(e) { console.error("Failed to restore terminal", e); }

    renderFileList();
    renderLibraryList();
    initWorkspace(state);
    initSavedChats();
    bindEvents();

    // Initialize Auth with Callback
    initAuth((user) => {
        const overlay = document.getElementById('login-overlay');
        const appContent = document.getElementById('app-content');
        const loadingView = document.getElementById('view-loading');

        // Sidebar Elements
        const sidebarPlaceholder = document.getElementById('sidebar-avatar-placeholder');
        const sidebarName = document.getElementById('sidebar-username');
        const sidebarEmail = document.getElementById('sidebar-email');

        if (user) {
            console.log("User Authenticated:", user.email);
            state.currentUser = user;

            // Fetch Data from Cloud (Name, Surname)
            fetchUserFromCloud(user);

            // Check for locally saved user details
            const userDetails = JSON.parse(localStorage.getItem('pyide_user_details') || 'null');

            if (userDetails) {
                // We have details, show app
                if (overlay) overlay.classList.add('hidden');
                if (els.viewOnboarding) els.viewOnboarding.classList.add('hidden');

                // Hide Loading if active
                if (loadingView && !loadingView.classList.contains('hidden') && loadingView.dataset.reason === 'auth') {
                     loadingView.classList.add('hidden');
                }

                if (appContent) {
                    appContent.classList.remove('filter', 'blur-sm', 'pointer-events-none');
                    appContent.classList.remove('blur-active');
                }

                // Update Sidebar with details
                const fullName = `${userDetails.firstname} ${userDetails.surname}`;
                if (sidebarName) sidebarName.textContent = fullName;
                if (sidebarPlaceholder) sidebarPlaceholder.textContent = userDetails.firstname.substring(0, 2).toUpperCase();

                // Update Avatar if exists
                if (userDetails.avatar) {
                    updateAvatarUI(userDetails.avatar);
                }
            } else {
                // No details yet - Show Onboarding (Wait for cloud fetch if it's the first time on this device but returning user)
                // fetchUserFromCloud handles UI update if data found.
                if (overlay) overlay.classList.add('hidden');

                 // Hide Loading if active
                if (loadingView && !loadingView.classList.contains('hidden') && loadingView.dataset.reason === 'auth') {
                     loadingView.classList.add('hidden');
                }

                if (els.viewOnboarding) els.viewOnboarding.classList.remove('hidden');
                // Keep app content blurred
            }

            // Always update email
            if (sidebarEmail) sidebarEmail.textContent = user.email;

            // Fallback name if no details
            if (!userDetails && sidebarName) sidebarName.textContent = user.email.split('@')[0];
            if (!userDetails && sidebarPlaceholder) sidebarPlaceholder.textContent = user.email.substring(0, 2).toUpperCase();

        } else {
            console.log("User Logged Out (or Init Failed)");

            // OFFLINE GUEST MODE CHECK
            if (!navigator.onLine) {
                 console.log("Offline Mode: Guest Access Granted");
                 // Create mock user
                 state.currentUser = { email: 'guest@offline.local', uid: 'offline-guest', isAnonymous: true };

                 // Hide Overlays
                 if (overlay) overlay.classList.add('hidden');
                 if (els.viewOnboarding) els.viewOnboarding.classList.add('hidden');
                 if (loadingView) loadingView.classList.add('hidden');

                 // Remove Blur
                 if (appContent) {
                    appContent.classList.remove('filter', 'blur-sm', 'pointer-events-none');
                    appContent.classList.remove('blur-active');
                 }

                 // Update Sidebar
                 if (sidebarPlaceholder) sidebarPlaceholder.textContent = "OF";
                 if (sidebarName) sidebarName.textContent = "Offline Guest";
                 if (sidebarEmail) sidebarEmail.textContent = "offline@local";

                 // Show Toast
                 showToast("Working Offline - Guest Mode Enabled", "info");

            } else {
                state.currentUser = null;

                // Hide Loading if active (so we can show login)
                if (loadingView && !loadingView.classList.contains('hidden') && loadingView.dataset.reason === 'auth') {
                     loadingView.classList.add('hidden');
                }

                // Show Overlay (Login Screen)
                if (overlay) overlay.classList.remove('hidden');

                // Add Blur
                if (appContent) {
                    appContent.classList.add('filter', 'blur-sm', 'pointer-events-none');
                    appContent.classList.add('blur-active');
                }

                 // Reset Sidebar
                if (sidebarPlaceholder) sidebarPlaceholder.textContent = "GD";
                if (sidebarName) sidebarName.textContent = "Guest Developer";
                if (sidebarEmail) sidebarEmail.textContent = "Not logged in";

                localStorage.removeItem('pyide_user_details');
            }
        }
    });

    // Expose state for debugging/testing
    window.appState = state;
    startApp();

    // Real-Time Monitoring
    DialogLoader.startMonitoring();
}

// Cloud Persistence
async function syncUserToCloud(user, firstname, surname) {
    if (!user) return;
    try {
        const token = await user.getIdToken();
        const url = `https://pymob-3bfb1-default-rtdb.firebaseio.com/users/${user.uid}.json?auth=${token}`;

        await fetch(url, {
            method: 'PATCH', // Update specific fields
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstname, surname })
        });
        console.log("User data synced to cloud.");
    } catch (e) {
        console.error("Cloud Sync Error:", e);
    }
}

async function fetchUserFromCloud(user) {
    if (!user) return;
    try {
        const token = await user.getIdToken();
        const url = `https://pymob-3bfb1-default-rtdb.firebaseio.com/users/${user.uid}.json?auth=${token}`;

        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data && data.firstname && data.surname) {
                console.log("Found user data in cloud:", data);

                // Merge with existing local details (preserve avatar if local is newer? No, cloud is truth for name)
                let userDetails = JSON.parse(localStorage.getItem('pyide_user_details') || '{}');
                userDetails.firstname = data.firstname;
                userDetails.surname = data.surname;
                // Don't overwrite avatar from cloud as we don't store it there

                localStorage.setItem('pyide_user_details', JSON.stringify(userDetails));

                // Update UI immediately
                const sidebarName = document.getElementById('sidebar-username');
                if (sidebarName) sidebarName.textContent = `${data.firstname} ${data.surname}`;

                const sidebarPlaceholder = document.getElementById('sidebar-avatar-placeholder');
                if (sidebarPlaceholder) sidebarPlaceholder.textContent = data.firstname.substring(0, 2).toUpperCase();

                // If we were stuck on onboarding, unlock
                if (els.viewOnboarding && !els.viewOnboarding.classList.contains('hidden')) {
                     els.viewOnboarding.classList.add('hidden');
                     const appContent = document.getElementById('app-content');
                     if (appContent) {
                        appContent.classList.remove('filter', 'blur-sm', 'pointer-events-none');
                        appContent.classList.remove('blur-active');
                     }
                }
            }
        }
    } catch (e) {
        console.error("Cloud Fetch Error:", e);
    }
}

// User Profile Logic
function loadUserProfile() {
    const userDetails = JSON.parse(localStorage.getItem('pyide_user_details') || 'null');
    if (userDetails && userDetails.avatar) {
        updateAvatarUI(userDetails.avatar);
    }
}

function updateAvatarUI(url) {
    if (!url) return;
    // Update Sidebar Avatar
    if (els.avatarImg) {
        els.avatarImg.src = url;
        els.avatarImg.classList.remove('hidden');
    }
    if (els.avatarPlaceholder) {
        els.avatarPlaceholder.classList.add('hidden');
    }

    // Update Edit Modal Avatar Preview
    if (els.editAvatarImg) {
        els.editAvatarImg.src = url;
        els.editAvatarImg.classList.remove('hidden');
    }

    // Update Onboarding Avatar Preview (if user goes back or re-onboards)
    if (els.onboardingAvatarImg) {
        els.onboardingAvatarImg.src = url;
        els.onboardingAvatarImg.classList.remove('hidden');
    }
}

async function uploadProfileImage(file, callback) {
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        showToast("Image too large! Please upload an image smaller than 2MB.", 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Image = e.target.result;
        try {
            if (callback) callback(base64Image);
            // We don't save to localStorage immediately here anymore,
            // we wait for "Save" button in modal or onboarding.
        } catch (err) {
            console.error("Image Error:", err);
        }
    };
    reader.readAsDataURL(file);
}

function openProfileEdit() {
    const userDetails = JSON.parse(localStorage.getItem('pyide_user_details') || '{}');

    if (els.editFirstname) els.editFirstname.value = userDetails.firstname || "";
    if (els.editSurname) els.editSurname.value = userDetails.surname || "";

    if (userDetails.avatar) {
        updateAvatarUI(userDetails.avatar);
    }

    if (els.modalProfileEdit) els.modalProfileEdit.classList.remove('hidden');

    // Close sidebar
    toggleSidebar(false);
}

function saveProfileEdit() {
    const firstname = els.editFirstname.value.trim();
    const surname = els.editSurname.value.trim();

    if (!firstname || !surname) {
        showToast("Please enter First Name and Surname.", 'warning');
        return;
    }

    let userDetails = JSON.parse(localStorage.getItem('pyide_user_details') || '{}');
    userDetails.firstname = firstname;
    userDetails.surname = surname;

    // Avatar is handled via global var or temp state?
    // Simplest: Check if edit avatar img src is set and base64
    if (els.editAvatarImg && !els.editAvatarImg.classList.contains('hidden')) {
        userDetails.avatar = els.editAvatarImg.src;
    }

    localStorage.setItem('pyide_user_details', JSON.stringify(userDetails));

    // Sync to Cloud
    if (state.currentUser) {
        syncUserToCloud(state.currentUser, firstname, surname);
    }

    // Update Sidebar UI immediately
    const sidebarName = document.getElementById('sidebar-username');
    if (sidebarName) sidebarName.textContent = `${firstname} ${surname}`;

    const sidebarPlaceholder = document.getElementById('sidebar-avatar-placeholder');
    if (sidebarPlaceholder) sidebarPlaceholder.textContent = firstname.substring(0, 2).toUpperCase();

    if (userDetails.avatar) updateAvatarUI(userDetails.avatar);

    if (els.modalProfileEdit) els.modalProfileEdit.classList.add('hidden');
}

function saveOnboarding() {
    const firstname = els.onboardingFirstname.value.trim();
    const surname = els.onboardingSurname.value.trim();

    if (!firstname || !surname) {
        showToast("Please enter First Name and Surname.", 'warning');
        return;
    }

    let userDetails = {
        firstname: firstname,
        surname: surname,
        avatar: null
    };

    // Check avatar
    if (els.onboardingAvatarImg && !els.onboardingAvatarImg.classList.contains('hidden')) {
        userDetails.avatar = els.onboardingAvatarImg.src;
    }

    localStorage.setItem('pyide_user_details', JSON.stringify(userDetails));

    // Sync to Cloud
    if (state.currentUser) {
        syncUserToCloud(state.currentUser, firstname, surname);
    }

    // Unlock App
    if (els.viewOnboarding) els.viewOnboarding.classList.add('hidden');
    const appContent = document.getElementById('app-content');
    if (appContent) {
        appContent.classList.remove('filter', 'blur-sm', 'pointer-events-none');
        appContent.classList.remove('blur-active');
    }

    // Sync UI
    const sidebarName = document.getElementById('sidebar-username');
    if (sidebarName) sidebarName.textContent = `${firstname} ${surname}`;
    const sidebarPlaceholder = document.getElementById('sidebar-avatar-placeholder');
    if (sidebarPlaceholder) sidebarPlaceholder.textContent = firstname.substring(0, 2).toUpperCase();
    if (userDetails.avatar) updateAvatarUI(userDetails.avatar);
}

async function startApp() {
    // Switch to Loading View
    // if (window.uiSetLoading) window.uiSetLoading(true);

    addToTerminal("Initializing Python environment...\n", "system");
    restartWorker();
}

function updateRunButtonState(isRunning) {
    if (isRunning) {
        if(els.btnRun) els.btnRun.classList.add('hidden');
        if(els.btnStop) els.btnStop.classList.remove('hidden');
        if(els.btnStopConsole) els.btnStopConsole.classList.remove('hidden');
    } else {
        if(els.btnRun) els.btnRun.classList.remove('hidden');
        if(els.btnStop) els.btnStop.classList.add('hidden');
        if(els.btnStopConsole) els.btnStopConsole.classList.add('hidden');
    }
}

function stopExecution() {
    // Local Worker Logic only
    if (state.worker) {
        state.worker.terminate();
    }
    state.isRunning = false;
    state.isWaitingForInput = false;

    addToTerminal("\n[System] Process stopped by user.\n", "system");
    updateRunButtonState(false);

    // Clear any stuck input UI
    const input = els.output.querySelector('input');
    if (input) input.remove();

    // Re-initialize worker immediately so it's ready
    restartWorker();
}

function restartWorker() {
    // Clear any stuck input UI
    const input = els.output.querySelector('input');
    if (input) input.remove();

    if (state.worker) {
        state.worker.terminate();
    }

    // Reset UI State if needed
    state.isRunning = false;
    state.isWaitingForInput = false;
    updateRunButtonState(false);

    // Check Environment Support
    const isSecureContext = window.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';

    try {
        if (isSecureContext) {
            // Standard Worker Mode (High Performance, Non-blocking)
            state.worker = new Worker(new URL('./py-worker.js', import.meta.url), { type: 'classic' });

            // Error Handler for Worker Loading (e.g. Offline Script Fail)
            state.worker.onerror = (e) => {
                 console.error("Worker Error:", e);
                 addToTerminal(`[System] Error loading Python environment: ${e.message}\n`, "stderr");
                 if (state.restartTimeout) {
                     clearTimeout(state.restartTimeout);
                     state.restartTimeout = null;
                 }
            };

            // Init SharedArrayBuffer if not exists
            if (!state.sharedBuffer) {
                state.sharedBuffer = new SharedArrayBuffer(1024);
                state.int32View = new Int32Array(state.sharedBuffer);
                state.uint8View = new Uint8Array(state.sharedBuffer);
            } else {
                Atomics.store(state.int32View, 0, 0);
            }

            state.worker.onmessage = handleWorkerMessage;
            state.worker.postMessage({ type: 'INIT', buffer: state.sharedBuffer, offline: !navigator.onLine });

        } else {
            // Fallback: Main Thread Mode (Low Performance, Blocking UI, but Compatible)
            console.warn("SharedArrayBuffer missing. Falling back to Main Thread execution.");
            addToTerminal("Warning: Running in Compatibility Mode (Main Thread). Performance may be slower and input uses prompts.\n", "stderr");

            state.worker = new PyMainThread(); // Mimics Worker Interface
            state.worker.onmessage = handleWorkerMessage;

            // Start Init (No buffer needed)
            state.worker.postMessage({ type: 'INIT', offline: !navigator.onLine });
        }

        // Reset flags
        state.isRunning = false;
        state.isWaitingForInput = false;

    } catch (err) {
        console.error("Critical Error initializing environment:", err);
        addToTerminal(`Critical Error: ${err.message}\n`, "stderr");

        const loadingText = document.getElementById('loading-text');
        if (loadingText) {
            loadingText.textContent = "Error: Failed to initialize Python environment.";
            loadingText.classList.add('text-red-500');
        }
    }
}

// Persistence Helper
function savePackage(pkgName) {
    let packages = JSON.parse(localStorage.getItem('pyide_packages') || '[]');

    // Check if exists (handle both string and object for safety)
    const exists = packages.some(p => (typeof p === 'string' ? p : p.name) === pkgName);

    if (!exists) {
        const now = new Date();
        const pkgObj = {
            name: pkgName,
            date: now.toLocaleDateString('en-GB'), // DD/MM/YYYY
            time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) // HH:MM
        };
        packages.push(pkgObj);
        localStorage.setItem('pyide_packages', JSON.stringify(packages));
    }
}

function restorePackages() {
    let packages = JSON.parse(localStorage.getItem('pyide_packages') || '[]');

    // Extract names if objects
    const pkgNames = packages.map(p => (typeof p === 'string' ? p : p.name));

    if (pkgNames.length > 0 && state.worker) {
        state.worker.postMessage({ type: 'RESTORE_PACKAGES', content: pkgNames });
    }
}

function migratePackages() {
    try {
        const packages = JSON.parse(localStorage.getItem('pyide_packages') || '[]');
        if (packages.length > 0 && typeof packages[0] === 'string') {
            const newPackages = packages.map(p => ({
                name: p,
                date: new Date().toLocaleDateString('en-GB'),
                time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            }));
            localStorage.setItem('pyide_packages', JSON.stringify(newPackages));
            console.log("Packages migrated to object format.");
        }
    } catch (e) {
        console.error("Migration Error:", e);
    }
}

function handleWorkerMessage(event) {
    const { type, content, system, error } = event.data;

    if (type === 'LOADED') {
        // Clear restart timeout
        if (state.restartTimeout) {
            clearTimeout(state.restartTimeout);
            state.restartTimeout = null;
        }

        // if (window.uiSetLoading) window.uiSetLoading(false);
        // if (window.uiSwitchView) window.uiSwitchView('view-files');
        addToTerminal("Python Ready.\n", "system");

        if (navigator.onLine) {
            restorePackages();
        } else {
            addToTerminal("[System] Offline Mode: Package restoration skipped.\n", "system");
        }

        // Sync files from persistent storage immediately
        if (state.worker) {
            state.worker.postMessage({ type: 'SCAN_FILES' });
        }

        if (state.runAfterInit) {
            const codeToRun = state.runAfterInit;
            state.runAfterInit = null;
            // Delay slightly to ensure ready
            setTimeout(() => {
                if(state.worker) state.worker.postMessage({ type: 'RUN', content: codeToRun });
            }, 100);
        }
    } else if (type === 'OUTPUT') {
        const style = error ? 'stderr' : (system ? 'system' : 'stdout');
        addToTerminal(content, style);

        // --- Live Monitoring ---
        if (state.monitoringMode) {
             monitorOutput(content);
        }

        // Capture generic stderr output as potential error for auto-fix
        if (error) {
            state.lastError = content;
        }

        // Accumulate logs if callback is active
        if (state.executionCallback) {
            state.executionLogs.push({ content, type: error ? 'stderr' : 'stdout' });
        }

        // Detect finish
        if (system && content.includes("Process finished.")) {
            state.isRunning = false;
            state.isWaitingForInput = false;
            updateRunButtonState(false);

            // Trigger Callback
            if (state.executionCallback) {
                const logs = state.executionLogs;
                const lastErr = state.lastError;
                const callback = state.executionCallback;

                // Reset state
                state.executionCallback = null;
                state.executionLogs = [];

                callback({ logs, error: lastErr });
            }

            // Sync Out: Read files back from worker to update UI
            if (state.worker) state.worker.postMessage({ type: 'SCAN_FILES' });
        }

        // Detect Library Install Success
        if (system && content.includes("Successfully installed")) {
             const match = content.match(/Successfully installed (.+)/);
             if (match) {
                 const pkgName = match[1].trim();
                 savePackage(pkgName);
                 renderLibraryList(); // Refresh UI

                 if(els.btnInstallLib) {
                     els.btnInstallLib.disabled = false;
                     els.btnInstallLib.textContent = "Install";
                     if(els.libSearch) els.libSearch.value = "";
                 }
             }
        }

        // Detect Library Install Failure
        if (error && content.includes("Failed to install")) {
             if(els.btnInstallLib) {
                 els.btnInstallLib.disabled = false;
                 els.btnInstallLib.textContent = "Retry";
             }
        }
    } else if (type === 'LINT_RESULT') {
        if (state.pendingLintResolve) {
            const result = JSON.parse(content);
            state.pendingLintResolve(result);
            state.pendingLintResolve = null;
        }
    } else if (type === 'INPUT_REQUEST') {
        state.isWaitingForInput = true;
        handleInputRequest(content);
    } else if (type === 'FILES_UPDATE') {
        // Merge files from Worker FS
        const newFiles = content;
        let changed = false;

        // We only care about file updates, not deletions for now to be safe
        // Or should we mirror exactly? Mirroring might lose data if worker state is partial.
        // Let's just update modified/new files.
        Object.entries(newFiles).forEach(([path, data]) => {
             // CRITICAL FIX: Ignore updates for the currently active file to prevent auto-restore of old code
             // The Editor is the source of truth for the active file.
             if (state.currentFile === path) return;

             // Avoid loop if content identical
             if (state.files[path] !== data) {
                 state.files[path] = data;
                 changed = true;
             }
        });

        if (changed) {
            renderFileList();
            // Debounce save logic handles storage, but here we updated state.files directly
            localStorage.setItem('pyide_files', JSON.stringify(state.files));
        }
    } else if (type === 'ERROR') {
        // Handle Syntax Errors from Runner
        const errObj = error;
        state.lastError = `${errObj.type}: ${errObj.msg} (Line ${errObj.lineno})`;

        if (errObj && (errObj.type === "SyntaxError" || errObj.type === "IndentationError")) {
            const line = errObj.lineno;
            const msg = errObj.msg;
            if (line > 0) {
                 const friendlyMsg = getFriendlyErrorMessage(msg);
                 state.editor.dispatch({
                    effects: setErrorEffect.of({
                        line: line,
                        message: friendlyMsg,
                        type: errObj.type
                    })
                });
                const linePos = state.editor.state.doc.line(line).from;
                state.editor.dispatch({
                    effects: EditorView.scrollIntoView(linePos, {y: "center"})
                });
            }
        }
    }
}

function handleInputRequest(prompt) {
    if (prompt) {
        addToTerminal(prompt, 'stdout');
    }

    // Check for auto-input (AI / Programmatic)
    if (state.autoInputs && state.autoInputs.length > 0) {
        const value = String(state.autoInputs.shift());

        // Simulate slight delay for realism
        setTimeout(() => {
            // Echo input in Cyan
            addToTerminal(value + "\n", 'input-echo');

            // Send to Worker
            const encoder = new TextEncoder();
            const bytes = encoder.encode(value);

            if (bytes.length > 1016) {
                addToTerminal("Error: Auto-input too long!\n", "stderr");
                return;
            }

            Atomics.store(state.int32View, 1, bytes.length);
            const dataSubArray = new Uint8Array(state.sharedBuffer, 8, bytes.length);
            dataSubArray.set(bytes);
            Atomics.store(state.int32View, 0, 1);
            Atomics.notify(state.int32View, 0);

            state.isWaitingForInput = false;
        }, 300);
        return;
    }

    // Check for AI Input Provider (Dev Mode Interception), but strictly block if Manual Mode
    if (state.isDevMode && state.aiInputProvider && !state.isManualExecution) {
        addToTerminal("[AI] Generating input for prompt...\n", "system");

        // Async handling
        (async () => {
            try {
                // Pass full logs so AI has context
                let value = await state.aiInputProvider(prompt, state.executionLogs);

                // --- FALLBACK LOGIC START ---
                if (value === null || value === undefined) {
                    const lowerPrompt = (prompt || "").toLowerCase();
                    // Check last log entry as well (handle cases where input() has no prompt but stdout has instructions)
                    const lastLog = state.executionLogs.length > 0 ? state.executionLogs[state.executionLogs.length - 1].content.toLowerCase() : "";

                    // Keywords for "Press Enter to continue" or wait states
                    // We check both prompt and recent logs
                    if (lowerPrompt.includes("press enter") || lowerPrompt.includes("continue") || lowerPrompt.includes("pause") ||
                        lastLog.includes("press enter") || lastLog.includes("continue") || lastLog.includes("pause")) {

                        addToTerminal("[System] AI Input failed. Defaulting to Enter.\n", "system");
                        value = ""; // Default to Enter
                    } else {
                        throw new Error("AI returned no input");
                    }
                }
                // --- FALLBACK LOGIC END ---

                 // Echo input in Cyan
                addToTerminal(value + "\n", 'input-echo');

                // Send to Worker
                const encoder = new TextEncoder();
                const bytes = encoder.encode(String(value));

                if (bytes.length > 1016) {
                    addToTerminal("Error: AI Input too long!\n", "stderr");
                    return;
                }

                Atomics.store(state.int32View, 1, bytes.length);
                const dataSubArray = new Uint8Array(state.sharedBuffer, 8, bytes.length);
                dataSubArray.set(bytes);
                Atomics.store(state.int32View, 0, 1);
                Atomics.notify(state.int32View, 0);

                state.isWaitingForInput = false;

            } catch (err) {
                console.error("AI Input Provider Error:", err);
                addToTerminal(`[AI Error] Failed to provide input: ${err.message}\n`, "stderr");
                // Fallback to manual
                createManualInput();
            }
        })();
        return;
    }

    createManualInput();
}

function createManualInput() {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'terminal-input';
    input.autocomplete = 'off';
    input.spellcheck = false;

    els.output.appendChild(input);
    input.focus();

    // Auto-scroll
    els.output.scrollTop = els.output.scrollHeight;

    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = input.value;

            // Local Worker Logic
            // 1. Encode value
            const encoder = new TextEncoder();
            const bytes = encoder.encode(value);

            // Check buffer size (1024 bytes total, 8 header -> 1016 data)
            if (bytes.length > 1016) {
                showToast("Input too long!", 'error');
                return;
            }

            // 2. Write length to Int32Array index 1
            Atomics.store(state.int32View, 1, bytes.length);

            // 3. Write bytes to Uint8Array starting at offset 8
            // Note: TypedArray constructor with offset creates a view
            const dataSubArray = new Uint8Array(state.sharedBuffer, 8, bytes.length);
            dataSubArray.set(bytes);

            // 4. Set flag to 1 (READY)
            Atomics.store(state.int32View, 0, 1);

            // 5. Notify worker
            Atomics.notify(state.int32View, 0);

            // 6. UI Cleanup
            input.remove();
            state.isWaitingForInput = false;

            // Echo input in Cyan
            addToTerminal(value + "\n", 'input-echo');
        }
    };
}

// Editor Logic
function initEditor() {
    // Determine initial syntax theme based on body class or default
    const currentThemeId = localStorage.getItem('pyide_theme') || 'one-dark';
    const themeExtension = getThemeExtension(currentThemeId);

    // Determine initial language
    const langExt = getLanguageExtension(state.currentFile);

    const extensions = [
        basicSetup,
        languageCompartment.of(langExt),
        themeCompartment.of([themeExtension, cmTheme]), // cmTheme provides structural base
        keymap.of([indentWithTab]),
        errorField, // Add error field extension
        linter(pythonLinter, { delay: 800 }), // Add Real-time Linter with debounce
        lintGutter(),
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                saveCurrentFile();
            }
        }),
        wrapCompartment.of(state.wrapEnabled ? EditorView.lineWrapping : [])
    ];

    state.editor = new EditorView({
        doc: state.files[state.currentFile] || "",
        extensions: extensions,
        parent: els.editorContainer
    });

    // Restore Cursor Position
    if (state.pendingCursor !== undefined) {
        // Ensure cursor is within bounds
        const len = state.editor.state.doc.length;
        const cursor = Math.min(state.pendingCursor, len);

        state.editor.dispatch({
            selection: {anchor: cursor, head: cursor},
            effects: EditorView.scrollIntoView(cursor, {y: "center"})
        });
        state.pendingCursor = undefined;
    }
}

// File Management
async function loadFiles() {
    const storedFiles = await persistence.getAllFiles();
    if (Object.keys(storedFiles).length > 0) {
        state.files = storedFiles;
    } else {
        state.files = { 'main.py': '# Welcome to PyMob Pro\n\nuser = input("Enter your name: ")\nprint(f"Hello, {user}!")\n' };
        persistence.saveFile('main.py', state.files['main.py']);
    }

    // Check URL for Shared Code
    const urlParams = new URLSearchParams(window.location.search);
    const sharedCode = urlParams.get('code');
    if (sharedCode) {
        try {
            // Base64 Decode (Unicode safe)
            const decoded = decodeURIComponent(escape(atob(sharedCode)));
            // Create a temporary file for it
            const shareName = "shared_snippet.py";
            state.files[shareName] = decoded;
            state.currentFile = shareName;

            // Clean URL without refresh
            window.history.replaceState({}, document.title, window.location.pathname);

            updateFileHeader();
            return; // Skip loading last file logic
        } catch (e) {
            console.error("Failed to load shared code", e);
            showToast("Failed to load shared code: Invalid format.", 'error');
        }
    }

    // Load Editor State (Current File & Cursor)
    const editorState = await persistence.loadEditorState();
    const lastFile = editorState ? editorState.file : null;

    if (lastFile && state.files[lastFile]) {
        state.currentFile = lastFile;
        state.pendingCursor = editorState.cursor; // Store cursor for initEditor
        // infer directory from file
        const parts = lastFile.split('/');
        if (parts.length > 1) {
            state.currentDir = parts.slice(0, -1).join('/') + '/';
        } else {
            state.currentDir = '';
        }
    } else {
        state.currentFile = Object.keys(state.files)[0];
        state.currentDir = '';
    }
    updateFileHeader();
}

function saveCurrentFile() {
    if (!state.editor) return;
    const content = state.editor.state.doc.toString();
    state.files[state.currentFile] = content;

    // Debounce save
    if (state.saveTimeout) clearTimeout(state.saveTimeout);
    state.saveTimeout = setTimeout(() => {
        // Save Content
        persistence.saveFile(state.currentFile, content);

        // Save State (Cursor)
        const cursor = state.editor.state.selection.main.head;
        persistence.saveEditorState(state.currentFile, cursor, 0);
    }, 1000);
}

function updateFileHeader() {
    const el = document.getElementById('current-filename');
    if (el) el.textContent = state.currentFile;
}

function renderFileList() {
    els.fileList.innerHTML = '';

    // Render "Back to Parent" if in subdirectory
    if (state.currentDir) {
        const backDiv = document.createElement('div');
        backDiv.className = "flex justify-between items-center px-4 py-3 cursor-pointer hover:bg-white/5 border-b border-white/5 transition-colors";
        backDiv.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gray-800/50 flex items-center justify-center text-gray-500">
                    <i class="fa-solid fa-arrow-left"></i>
                </div>
                <div class="flex flex-col">
                    <span class="text-white text-sm font-medium">..</span>
                    <span class="text-xs text-gray-500">Back</span>
                </div>
            </div>
        `;
        backDiv.onclick = () => {
            const parts = state.currentDir.slice(0, -1).split('/');
            parts.pop(); // remove current folder
            state.currentDir = parts.length > 0 ? parts.join('/') + '/' : '';
            renderFileList();
        };
        els.fileList.appendChild(backDiv);
    }

    // Identify Items in Current Directory
    const entries = new Set();

    Object.keys(state.files).forEach(path => {
        if (!path.startsWith(state.currentDir)) return;

        const relative = path.substring(state.currentDir.length);
        const parts = relative.split('/');

        if (parts.length > 1) {
            // It's a directory
            entries.add({ type: 'folder', name: parts[0] });
        } else {
            // It's a file
            entries.add({ type: 'file', name: parts[0] });
        }
    });

    // Convert Set to Array and Sort (Folders first)
    const sortedEntries = Array.from(entries).sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
    });

    // Deduplicate (since multiple files can imply same folder)
    const uniqueEntries = [];
    const seen = new Set();
    sortedEntries.forEach(e => {
        if (!seen.has(e.name)) {
            uniqueEntries.push(e);
            seen.add(e.name);
        }
    });

    uniqueEntries.forEach(entry => {
        const div = document.createElement('div');
        const isFolder = entry.type === 'folder';
        const fullPath = state.currentDir + entry.name;
        const isActive = !isFolder && fullPath === state.currentFile;

        let baseClass = "relative flex justify-between items-center px-4 py-3 cursor-pointer transition-all border-b border-white/5 overflow-hidden group";
        if (isActive) baseClass += " bg-green-900/10";
        else baseClass += " hover:bg-white/5";
        div.className = baseClass;

        if (isFolder) {
            div.onclick = () => {
                state.currentDir += entry.name + '/';
                renderFileList();
            };
        } else {
            div.onclick = () => switchFile(fullPath);
        }

        // Icon logic
        let iconClass = "fa-solid fa-file";
        let iconColor = "text-gray-400";
        let iconBg = "bg-gray-800";

        if (isFolder) {
            iconClass = "fa-solid fa-folder";
            iconColor = "text-yellow-500";
            iconBg = "bg-yellow-900/20";
        } else if (entry.name.endsWith('.py')) {
            iconClass = "fa-brands fa-python";
            iconColor = "text-accent";
            iconBg = "bg-green-900/20";
        } else if (entry.name.endsWith('.json')) {
            iconClass = "fa-solid fa-file-code";
            iconColor = "text-yellow-500";
            iconBg = "bg-yellow-900/20";
        } else if (entry.name.endsWith('.txt')) {
            iconClass = "fa-solid fa-file-lines";
            iconColor = "text-gray-400";
            iconBg = "bg-gray-800";
        }

        // Active Indicator
        const activeIndicator = isActive ? `<div class="absolute left-0 top-0 bottom-0 w-1 bg-accent shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>` : '';
        const activeDot = isActive ? '<div class="absolute bottom-1 right-1 w-2.5 h-2.5 bg-accent rounded-full border-2 border-darker shadow-lg z-10"></div>' : '';

        // Random metadata (for visual demo)
        const size = isFolder ? "" : "2 KB";
        const time = isFolder ? "" : "10m ago";

        div.innerHTML = `
            ${activeIndicator}
            <div class="flex items-center gap-3 pl-2">
                <div class="w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center ${iconColor} relative shrink-0">
                    <i class="${iconClass} text-lg"></i>
                    ${activeDot}
                </div>
                <div class="flex flex-col overflow-hidden">
                    <span class="${isActive ? 'text-accent font-bold' : 'text-gray-300 font-medium'} text-sm truncate">${entry.name}</span>
                    <span class="text-xs text-gray-500 truncate">${isFolder ? 'Folder' : `${size} • ${time}`}</span>
                </div>
            </div>
            ${isFolder ? '<i class="fa-solid fa-chevron-right text-gray-600 text-xs"></i>' : ''}
        `;

        // Actions (Rename/Delete) for Files Only (simpler for now)
        if (!isFolder) {
            const actions = document.createElement('div');
            actions.className = "flex items-center gap-2 z-10 pl-2";
            actions.onclick = (e) => e.stopPropagation();

            const renameBtn = document.createElement('button');
            renameBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
            renameBtn.className = "w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors";
            renameBtn.onclick = () => renameFile(fullPath);
            actions.appendChild(renameBtn);

            if (Object.keys(state.files).length > 1) {
                const delBtn = document.createElement('button');
                delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
                delBtn.className = "w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors";
                delBtn.onclick = () => deleteFile(fullPath);
                actions.appendChild(delBtn);
            }
            div.appendChild(actions);
        }

        els.fileList.appendChild(div);
    });
}

function switchFile(filename) {
    if (filename === state.currentFile) return;
    state.currentFile = filename;

    // Switch editor content & language
    const content = state.files[filename];
    const newLang = getLanguageExtension(filename);

    state.editor.dispatch({
        effects: languageCompartment.reconfigure(newLang),
        changes: {from: 0, to: state.editor.state.doc.length, insert: content}
    });

    renderFileList();
    updateFileHeader();
    localStorage.setItem('pyide_current', filename);

    // Switch back to editor view if we are in file view
    // Trigger click on Editor tab
    const editorTab = document.querySelector('.nav-btn[data-target="view-editor"]');
    if (editorTab) editorTab.click();
}

async function createNewItem() {
    // Custom Modal or Prompt
    const type = await showPrompt("Create Item", "Create 'file' or 'folder'?", "file");
    if (!type) return;

    if (type.toLowerCase() === 'folder') {
        const folderName = await showPrompt("New Folder", "Enter folder name:");
        if (folderName) {
            // Create a placeholder file to persist the folder
            const path = state.currentDir + folderName + '/.keep';
            state.files[path] = "";
            renderFileList();
            persistence.saveFile(path, "");
        }
    } else {
        const name = await showPrompt("New File", "Enter file name (e.g., script.py):", "script.py");
        if (name) {
            const path = state.currentDir + name;
            if (state.files[path]) {
                showToast("File already exists!", 'error');
                return;
            }
            state.files[path] = "# New file\n";
            renderFileList();
            switchFile(path);
            persistence.saveFile(path, state.files[path]);
        }
    }
}

async function renameFile(oldPath) {
    const oldName = oldPath.split('/').pop();
    const newName = await showPrompt("Rename File", "Enter new file name:", oldName);
    if (newName && newName !== oldName) {
        const newPath = oldPath.substring(0, oldPath.lastIndexOf('/') + 1) + newName;

        if (state.files[newPath]) {
            showToast("File already exists!", 'error');
            return;
        }
        state.files[newPath] = state.files[oldPath];
        delete state.files[oldPath];

        // Persistence
        await persistence.deleteFile(oldPath);
        await persistence.saveFile(newPath, state.files[newPath]);

        // If current file renamed, update state AND language
        if (state.currentFile === oldPath) {
            state.currentFile = newPath;
            // Update language based on new extension
            const newLang = getLanguageExtension(newPath);
            state.editor.dispatch({
                effects: languageCompartment.reconfigure(newLang)
            });
            await persistence.saveEditorState(state.currentFile, 0, 0);
        }

        renderFileList();
        updateFileHeader();
    }
}

function getLanguageExtension(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
        case 'js':
        case 'jsx':
        case 'mjs':
            return javascript();
        case 'html':
        case 'htm':
            return html();
        case 'css':
            return css();
        case 'json':
            return json();
        case 'py':
        default:
            return python();
    }
}

async function deleteFile(path) {
    if (await showConfirm("Delete File", `Delete ${path}?`)) {
        delete state.files[path];

        await persistence.deleteFile(path);

        // If we deleted the current file, switch to another one
        if (state.currentFile === path) {
            const remaining = Object.keys(state.files);
            if (remaining.length > 0) {
                switchFile(remaining[0]);
            } else {
                // Should create a default file?
                state.files['main.py'] = "";
                switchFile('main.py');
                persistence.saveFile('main.py', "");
            }
        }
        renderFileList();
        updateFileHeader();

        // Update Editor State
        persistence.saveEditorState(state.currentFile, 0, 0);
    }
}

// Execution
async function runCode(inputs = []) {
    // Open Console Pane via UI Helper
    if (window.uiShowConsole) window.uiShowConsole();

    const userCode = state.editor.state.doc.toString();

    // Reset last error
    state.lastError = null;

    // Clear previous errors (markers)
    if(state.editor) state.editor.dispatch({ effects: setErrorEffect.of(null) });

    // Always run locally now
    // If inputs provided (e.g. from Auto-Run), it's likely programmatic, but runCode is usually UI button.
    // If runCodeWithCallback calls runCode, we need to respect the flag set there.
    // Default click on Run button implies Manual Mode.
    if (state.executionCallback) {
        // Programmatic run (Agent), isManualExecution already set to false in wrapper
    } else {
        // User clicked Run
        state.isManualExecution = true;
    }

    runLocalCode(userCode, inputs);
}

async function analyzeCodeSafety(code) {
    if (!code || !code.trim()) return { safe: true };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
        const response = await fetch("/.netlify/functions/ai-workspace-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mode: 'safety_check',
                code: code
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
             throw new Error("Safety check service unavailable");
        }

        const result = await response.json();
        return result;

    } catch (e) {
        clearTimeout(timeoutId);
        console.error("Safety Analysis Failed:", e);
        return { safe: true }; // Fail open
    }
}

async function runLocalCode(userCode, inputs = []) {
    // Store Auto Inputs
    state.autoInputs = inputs || [];

    // --- Safety Check (Dev Mode) ---
    if (state.isDevMode) {
        // Reset monitoring
        state.monitoringMode = false;
        state.monitoringStats = { lastLines: [], repeatCount: 0, startTime: 0 };

        // Silently enable monitoring without "Analyzing code safety" message
        state.monitoringMode = true;
        state.monitoringStats.startTime = Date.now();
    }

    // Detect Missing Libraries (Only in Dev Mode)
    if (state.isDevMode) {
        const installed = JSON.parse(localStorage.getItem('pyide_packages') || '[]');
        const installedNames = installed.map(p => (typeof p === 'string' ? p : p.name));

        const missing = detectMissingLibraries(userCode, state.files, installedNames);

        if (missing.length > 0) {
            // Check offline before prompting
            if (!navigator.onLine) {
                 addToTerminal(`[System] Warning: Missing libraries detected (${missing.join(', ')}), but cannot install while offline.\n`, "stderr");
            } else {
                const listStr = missing.map(lib => `• ${lib}`).join('\n');
                if (await showConfirm("Missing Libraries Detected",
                    `The following libraries appear to be missing:\n\n${listStr}\n\nWould you like to install them now?`)) {

                    // Silent install - no terminal output
                    missing.forEach(pkg => {
                        if (state.worker) state.worker.postMessage({ type: 'INSTALL', content: pkg });
                    });
                    return;
                }
            }
        }
    }

    // Check if worker is stuck or waiting (should use Stop button but handle robustly)
    if (state.isRunning || state.isWaitingForInput) {
        // If user explicitly clicked Run while running (maybe UI glitch), treat as restart
        addToTerminal("\n[System] Restarting environment for new run...\n", "system");
        state.runAfterInit = userCode;
        stopExecution(); // This calls restartWorker
        // Wait for worker to be ready handled in LOADED event if runAfterInit is set
        return;
    }

    if (!state.worker) {
        addToTerminal("Python is loading, please wait...\n", "system");
        return;
    }

    // Update UI
    updateRunButtonState(true);

    // Append run marker (Clean Format)
    if(window.uiShowConsole) window.uiShowConsole();
    addToTerminal(`\n★★ ${state.currentFile} ★★\n`, "system");

    state.isRunning = true;

    // Sync Files Before Run
    state.worker.postMessage({ type: 'SYNC_FILES', content: state.files });
    state.worker.postMessage({ type: 'RUN', content: userCode });
}

// Handle Auto-Fix
async function handleAutoFix() {
    if (!state.editor) return;

    // Check if we have an error
    if (!state.lastError) {
        showToast("No recent error to fix! Run your code first and wait for an error.", 'info');
        return;
    }

    // UI Loading State
    const icon = els.btnAutoFix.querySelector('i');
    const originalClass = icon.className;
    icon.className = "fa-solid fa-spinner fa-spin text-accent";
    els.btnAutoFix.classList.add('pointer-events-none');

    try {
        const currentCode = state.editor.state.doc.toString();
        const fixedCode = await autoFixCode(currentCode, state.lastError);

        // Replace code
        state.editor.dispatch({
            changes: {from: 0, to: state.editor.state.doc.length, insert: fixedCode}
        });

        // Clear error
        state.lastError = null;
        state.editor.dispatch({ effects: setErrorEffect.of(null) });

        // Notify user
        if(window.uiShowConsole) window.uiShowConsole();
        addToTerminal("\n[AI Fixer] Code updated! check the # comments.\n", "system");

    } catch (err) {
        console.error("Auto-Fix Failed:", err);
        showToast(`Auto-Fix Failed: ${err.message}`, 'error');
    } finally {
        // Reset UI
        icon.className = originalClass;
        els.btnAutoFix.classList.remove('pointer-events-none');
    }
}

// Helper: Friendly Error Messages
function getFriendlyErrorMessage(rawMsg) {
    if (rawMsg.includes("expected ':'")) return "It looks like you missed a colon ':' at the end of this line.";
    if (rawMsg.includes("unexpected indent")) return "The indentation here is incorrect. Try removing the extra spaces at the start of the line.";
    if (rawMsg.includes("unindent does not match")) return "This line's indentation doesn't match the previous block. Check your spaces/tabs.";
    if (rawMsg.includes("EOF while scanning triple-quoted string")) return "You have an unclosed triple-quoted string. Add ''' or \"\"\" to close it.";
    if (rawMsg.includes("EOL while scanning string literal")) return "You have an unclosed string. Add a quote (' or \") at the end of the text.";
    if (rawMsg.includes("invalid syntax")) return "This syntax is invalid. Check for missing brackets, quotes, or typos.";
    if (rawMsg.includes("unmatched ')'")) return "You have an extra closing parenthesis ')' without a matching opening one.";
    if (rawMsg.includes("unmatched '}'")) return "You have an extra closing brace '}' without a matching opening one.";
    if (rawMsg.includes("unmatched ']'")) return "You have an extra closing bracket ']' without a matching opening one.";
    if (rawMsg.includes("'(' was never closed")) return "You opened a parenthesis '(' but never closed it.";
    if (rawMsg.includes("'{' was never closed")) return "You opened a curly brace '{' but never closed it.";
    if (rawMsg.includes("'[' was never closed")) return "You opened a square bracket '[' but never closed it.";

    return rawMsg; // Return original if no friendly map found
}

// Sidebar Actions Logic
async function runAction(action, arg) {
    if (!state.editor) return;
    const view = state.editor;
    const dispatch = view.dispatch.bind(view);
    const stateDoc = view.state.doc;
    const selection = view.state.selection.main;

    // Helper to get line info
    const line = stateDoc.lineAt(selection.head);

    switch(action) {
        case 'insert-snippet':
            insertSnippet(view, arg);
            toggleSidebar(false);
            break;
        case 'copy':
            // Naive copy (Clipboard API permissions can be tricky without user gesture, but click is user gesture)
            navigator.clipboard.writeText(stateDoc.sliceString(line.from, line.to));
            toggleSidebar(false);
            break;
        case 'copy-all':
            navigator.clipboard.writeText(stateDoc.toString());
            toggleSidebar(false);
            break;
        case 'cut':
            navigator.clipboard.writeText(stateDoc.sliceString(line.from, line.to));
            deleteLine(view);
            toggleSidebar(false);
            break;
        case 'paste':
            navigator.clipboard.readText().then(text => {
                view.dispatch({
                    changes: {from: selection.from, to: selection.to, insert: text},
                    selection: {anchor: selection.from + text.length}
                });
            }).catch(err => {
                console.error("Paste failed:", err);
                showToast("Unable to paste. Please check permissions.", 'error');
            });
            toggleSidebar(false);
            break;
        case 'select-all':
            selectAll(view);
            toggleSidebar(false);
            break;
        case 'delete-line':
            deleteLine(view);
            toggleSidebar(false);
            break;
        case 'duplicate-line':
            // Duplicate current line(s)
            const dupLineContent = stateDoc.sliceString(line.from, line.to);
            view.dispatch({
                changes: {from: line.to, insert: '\n' + dupLineContent}
            });
            toggleSidebar(false);
            break;
        case 'move-line-up':
            // Basic move up implementation (swap with previous line)
             if (line.number > 1) {
                const prevLine = stateDoc.line(line.number - 1);
                const prevContent = stateDoc.sliceString(prevLine.from, prevLine.to);
                const currentContent = stateDoc.sliceString(line.from, line.to);

                view.dispatch({
                    changes: [
                        {from: prevLine.from, to: prevLine.to, insert: currentContent},
                        {from: line.from, to: line.to, insert: prevContent}
                    ],
                    selection: {anchor: prevLine.from + (selection.head - line.from)} // Try to keep cursor rel pos
                });
             }
             toggleSidebar(false);
             break;
        case 'move-line-down':
             if (line.number < stateDoc.lines) {
                const nextLine = stateDoc.line(line.number + 1);
                const nextContent = stateDoc.sliceString(nextLine.from, nextLine.to);
                const currentContent = stateDoc.sliceString(line.from, line.to);

                view.dispatch({
                    changes: [
                        {from: line.from, to: line.to, insert: nextContent},
                        {from: nextLine.from, to: nextLine.to, insert: currentContent}
                    ],
                    selection: {anchor: nextLine.from + (selection.head - line.from)}
                });
             }
             toggleSidebar(false);
             break;
        case 'find':
        case 'replace':
            openSearchPanel(view);
            toggleSidebar(false);
            break;
        case 'goto-line':
            gotoLine(view);
            toggleSidebar(false);
            break;
        case 'scroll-top':
             view.dispatch({
                effects: EditorView.scrollIntoView(0, {y: "start"})
            });
            toggleSidebar(false);
            break;
        case 'scroll-bottom':
             view.dispatch({
                effects: EditorView.scrollIntoView(stateDoc.length, {y: "end"})
            });
            toggleSidebar(false);
            break;
        case 'upper':
            if (!selection.empty) {
                const text = stateDoc.sliceString(selection.from, selection.to);
                view.dispatch({ changes: {from: selection.from, to: selection.to, insert: text.toUpperCase()} });
            }
            toggleSidebar(false);
            break;
        case 'lower':
            if (!selection.empty) {
                const text = stateDoc.sliceString(selection.from, selection.to);
                view.dispatch({ changes: {from: selection.from, to: selection.to, insert: text.toLowerCase()} });
            }
            toggleSidebar(false);
            break;
        case 'indent':
            indentMore(view);
            break;
        case 'outdent':
            indentLess(view);
            break;
        case 'syntax':
            checkSyntax();
            toggleSidebar(false);
            break;
        case 'comment':
        case 'uncomment':
            toggleComment(view);
            toggleSidebar(false);
            break;
        case 'format':
            // Naive formatting: Select All + Indent?
            if(selection.empty) selectAll(view);
            indentMore(view);
            toggleSidebar(false);
            break;
        case 'format-pep8':
            formatCodePEP8();
            toggleSidebar(false);
            break;
        case 'auto-complete':
            startCompletion(view);
            toggleSidebar(false);
            break;
        case 'restart':
            // Stop if running
            if (state.isRunning) {
                 stopExecution();
            }
            // Clear terminal
            els.output.innerHTML = '';
            addToTerminal("[System] Restarting program...\n", "system");

            // Timeout Protection
            if (state.restartTimeout) clearTimeout(state.restartTimeout);
            state.restartTimeout = setTimeout(() => {
                if (!state.worker) return;
                addToTerminal("[System] Restart failed/timed out. Please try running code manually.\n", "stderr");
                // Reset UI state
                state.isRunning = false;
                state.isWaitingForInput = false;
                updateRunButtonState(false);
                state.restartTimeout = null;
            }, 3000);

            // Queue current code
            state.runAfterInit = state.editor.state.doc.toString();

            restartWorker();
            toggleSidebar(false);
            break;
        case 'run-selected':
            const code = stateDoc.sliceString(selection.from, selection.to);
            if (code.trim()) {
                if(window.uiShowConsole) window.uiShowConsole();
                addToTerminal("\n[Running Selection]\n", "system");
                if (state.worker) state.worker.postMessage({ type: 'RUN', content: code });
            } else {
                showToast("No code selected!", 'warning');
            }
            toggleSidebar(false);
            break;
        case 'clear-console':
             if (els.btnClearConsole) els.btnClearConsole.click();
             toggleSidebar(false);
             break;
        case 'stats':
             const text = stateDoc.toString();
             const words = text.trim() ? text.trim().split(/\s+/).length : 0;
             const chars = text.length;
             showToast(`Word Count: ${words}\nCharacter Count: ${chars}`, 'info');
             toggleSidebar(false);
             break;
        case 'show-error':
            checkSyntax(); // Re-uses existing syntax check which jumps to error
            toggleSidebar(false);
            break;
        case 'remove-extra-spaces':
             const clean = stateDoc.toString().split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
             view.dispatch({
                changes: {from: 0, to: stateDoc.length, insert: clean}
             });
             toggleSidebar(false);
             break;
        case 'download':
             downloadCode();
             toggleSidebar(false);
             break;
        case 'share':
             await shareCode();
             toggleSidebar(false);
             break;
        case 'stop':
             stopExecution();
             toggleSidebar(false);
             break;
    }
    view.focus();
}

function downloadCode() {
    const code = state.editor.state.doc.toString();
    const blob = new Blob([code], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.currentFile.split('/').pop() || 'script.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function shareCode() {
    const code = state.editor.state.doc.toString();
    try {
        // Unicode safe Base64
        const encoded = btoa(unescape(encodeURIComponent(code)));
        const url = new URL(window.location.href);
        url.searchParams.set('code', encoded);

        try {
            await navigator.clipboard.writeText(url.toString());
            showToast("Share Link Copied to Clipboard!", 'success');
        } catch (err) {
            console.error(err);
            await showPrompt("Share Link", "Copy this link:", url.toString());
        }
    } catch (e) {
        showToast("Failed to generate link.", 'error');
    }
}

async function checkSyntax() {
    if (!state.worker) {
        showToast("Python engine not ready.", 'error');
        return;
    }
    const code = state.editor.state.doc.toString();
    const pythonCode = `
import ast
import json
code = ${JSON.stringify(code)}
try:
    ast.parse(code)
    print("Syntax OK")
except SyntaxError as e:
    print(f"Syntax Error on line {e.lineno}: {e.msg}")
`;
    state.worker.postMessage({ type: 'RUN', content: pythonCode });
    if(window.uiShowConsole) window.uiShowConsole();
}

// PEP-8 Formatter (Simple Python-based approach via Worker)
async function formatCodePEP8() {
    if (!state.worker) {
        showToast("Python environment not ready.", 'error');
        return;
    }

    // We can't easily install 'black' or 'autopep8' via micropip in 1 second if not cached.
    // So we'll use a custom Python script that does basic formatting using 'tokenize' or similar if available,
    // OR we just try to use a regex-based JS formatter for now to be fast and offline-friendly without deps.
    // BUT the user asked for PEP-8.
    // Let's try a clever trick: Use Python's built-in `ast` unparse (Python 3.9+) if possible,
    // effectively re-generating code from AST which enforces some standard spacing!

    const code = state.editor.state.doc.toString();
    const pythonFormatter = `
import ast
import sys

code = ${JSON.stringify(code)}

try:
    # Parse code to AST
    tree = ast.parse(code)

    if sys.version_info >= (3, 9):
        import ast
        formatted = ast.unparse(tree)
        print("___FORMATTED_START___")
        print(formatted)
        print("___FORMATTED_END___")
    else:
        print("Error: Python 3.9+ required for AST unparse")

except Exception as e:
    print(f"Format Error: {e}")
`;

    // Listen for the specific output
    const originalHandler = state.worker.onmessage;
    let accumulatedOutput = "";

    // Create a robust handler wrapper
    const formatHandler = (event) => {
        const { type, content, system, error } = event.data;

        if (type === 'OUTPUT' && !system && !error) {
             accumulatedOutput += content;

             if (accumulatedOutput.includes("___FORMATTED_END___")) {
                 const parts = accumulatedOutput.split("___FORMATTED_START___");
                 if (parts.length > 1) {
                     let cleanCode = parts[1].split("___FORMATTED_END___")[0];
                     // Trim first newline if ast.unparse adds one? usually it's fine.
                     cleanCode = cleanCode.trim();

                     // Apply to editor
                     if (cleanCode && state.editor) {
                        state.editor.dispatch({
                            changes: {from: 0, to: state.editor.state.doc.length, insert: cleanCode}
                        });
                        addToTerminal("[System] Code formatted (AST Re-generation).\n", "system");
                     }
                 }
                 // Restore handler
                 state.worker.onmessage = originalHandler;
             }
        } else if (type === 'ERROR') {
             // If worker reports error, formatting failed (likely syntax error in user code prevents parsing)
             // We restore handler and show error
             state.worker.onmessage = originalHandler;
             handleWorkerMessage(event); // Let original handler show syntax error
        } else {
             // Pass through other messages
             handleWorkerMessage(event);
        }
    };

    state.worker.onmessage = formatHandler;

    state.worker.postMessage({ type: 'RUN', content: pythonFormatter });
}

// Sidebar Toggle Logic
function toggleSidebar(show) {
    const menu = els.sidebarMenu;
    const overlay = els.sidebarOverlay;
    if (show) {
        menu.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
        // Push state for back button handling
        history.pushState({ view: 'sidebar' }, "", "#sidebar");
    } else {
        menu.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
        // If we are closing via UI (not back button), go back in history if top is sidebar?
        // Actually simplest is just close visually.
        // If the user presses back button later, we handle that in ui.js via popstate
    }
}

// Output
function addToTerminal(text, type = 'stdout') {
    const span = document.createElement('span');
    span.textContent = text;

    // Map types to CSS classes
    let className = 'terminal-stdout';
    switch (type) {
        case 'stderr': className = 'terminal-stderr'; break;
        case 'system': className = 'terminal-system'; break;
        case 'input-echo': className = 'terminal-input-echo'; break;
        case 'stdout': default: className = 'terminal-stdout'; break;
    }
    span.className = className;

    els.output.appendChild(span);
    els.output.scrollTop = els.output.scrollHeight;

    // Persist Terminal State (Debounced)
    if (state.terminalSaveTimeout) clearTimeout(state.terminalSaveTimeout);
    state.terminalSaveTimeout = setTimeout(() => {
        persistence.saveTerminal(els.output.innerHTML);
    }, 2000);
}

// Library Management
function renderLibraryList() {
    if (!els.libList) return;
    els.libList.innerHTML = '';

    // Get installed packages
    const installed = JSON.parse(localStorage.getItem('pyide_packages') || '[]');
    const installedNames = installed.map(p => (typeof p === 'string' ? p : p.name));

    // 1. Installed Section
    if (installed.length > 0) {
        const header = document.createElement('div');
        header.className = "flex items-center justify-between px-2 py-1 mb-2 mt-2";
        header.innerHTML = `
            <span class="text-xs font-bold text-accent uppercase tracking-wider">Installed (${installed.length})</span>
            <button class="text-muted hover:text-red-400 text-[10px] uppercase font-bold transition-colors" onclick="window.cmdRemoveAllLibs()">
                Remove All
            </button>
        `;
        els.libList.appendChild(header);

        installed.forEach(pkg => {
             const pkgName = typeof pkg === 'string' ? pkg : pkg.name;
             const pkgDate = typeof pkg === 'object' ? pkg.date : null;
             const pkgTime = typeof pkg === 'object' ? pkg.time : null;

             const div = document.createElement('div');
             div.className = "flex items-center justify-between p-3 bg-surface rounded-xl border border-white/5 mb-2";

             // Check if it's a popular lib to get description
             const popInfo = POPULAR_LIBS.find(p => p.name === pkgName);
             const desc = popInfo ? popInfo.desc : "Custom Package";

             // Meta info
             const meta = (pkgDate && pkgTime) ? `<span class="text-[10px] text-gray-500 block mt-0.5">Installed: ${pkgDate} ${pkgTime}</span>` : '';

             div.innerHTML = `
                <div class="flex flex-col">
                    <span class="text-text font-bold text-sm">${pkgName}</span>
                    <span class="text-muted text-[10px]">${desc}</span>
                    ${meta}
                </div>
                <button class="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                        onclick="window.cmdRemoveLib('${pkgName}')" title="Uninstall (Requires Reload)">
                    <i class="fa-solid fa-trash"></i>
                </button>
             `;
             els.libList.appendChild(div);
        });
    }

    // 2. Popular Section (Discover)
    const header2 = document.createElement('div');
    header2.className = "px-2 py-1 text-xs font-bold text-muted uppercase tracking-wider mb-2 mt-4";
    header2.textContent = "Discover Popular Libraries";
    els.libList.appendChild(header2);

    POPULAR_LIBS.forEach(lib => {
        const isInstalled = installedNames.includes(lib.name);
        if (isInstalled) return; // Skip if already shown in Installed section

        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-3 bg-surface rounded-xl border border-white/5 mb-2";

        div.innerHTML = `
            <div class="flex flex-col">
                <span class="text-text font-bold text-sm">${lib.name}</span>
                <span class="text-muted text-[10px]">${lib.desc}</span>
            </div>
            <button class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors bg-white/5 text-gray-300 hover:bg-white/10"
                    onclick="window.cmdInstallLib('${lib.name}')">
                Install
            </button>
        `;
        els.libList.appendChild(div);
    });

    // Footer
    const hint = document.createElement('div');
    hint.className = "text-center text-muted text-xs mt-4 opacity-50";
    hint.textContent = "Search above for any PyPI package";
    els.libList.appendChild(hint);
}

window.cmdInstallLib = (name) => {
    if(els.libSearch) els.libSearch.value = name;
    installLibrary();
};

window.cmdRemoveLib = async (name) => {
    if (await showConfirm("Uninstall Package", `Remove '${name}'?\n\nWarning: This may break code that depends on this library.\nChanges will take effect on next reload.`)) {
        let packages = JSON.parse(localStorage.getItem('pyide_packages') || '[]');
        packages = packages.filter(p => (typeof p === 'string' ? p : p.name) !== name);
        localStorage.setItem('pyide_packages', JSON.stringify(packages));
        renderLibraryList();
        showToast("Package removed. Please reload to finish.", 'info');
    }
};

window.cmdRemoveAllLibs = async () => {
    if (await showConfirm("Remove All Packages", "Are you sure you want to remove ALL installed libraries? This will take effect on next reload.")) {
        localStorage.setItem('pyide_packages', '[]');
        renderLibraryList();
        showToast("All packages removed. Please reload.", 'info');
    }
};

async function installLibrary() {
    if (!navigator.onLine) {
        showToast("Library installation requires internet.", 'error');
        return;
    }

    if (!state.isDevMode) {
        showToast("Access Denied: Switch to Developer Mode to install libraries.", 'error');
        return;
    }

    const pkg = els.libSearch.value.trim();
    if (!pkg) return;

    // Show visual feedback immediately
    if(els.btnInstallLib) {
        els.btnInstallLib.disabled = true;
        els.btnInstallLib.textContent = "Working...";
    }

    // We rely on the worker to send back confirmation
    if(state.worker) {
        state.worker.postMessage({ type: 'INSTALL', content: pkg });
    } else {
        showToast("Python environment not ready.", 'error');
    }
}

// Quick Keys Logic
function insertText(text) {
    if (!state.editor) return;
    const transaction = state.editor.state.update({
        changes: {from: state.editor.state.selection.main.head, insert: text},
        selection: {anchor: state.editor.state.selection.main.head + text.length}
    });
    state.editor.dispatch(transaction);
    state.editor.focus();
}

// Bind Events
function bindEvents() {
    // Auth Events
    const btnForceLogin = document.getElementById('btn-force-login');
    if (btnForceLogin) btnForceLogin.onclick = () => {
        const email = document.getElementById('force-email').value;
        const pass = document.getElementById('force-password').value;
        if(email && pass) signInWithEmail(email, pass);
        else showToast("Please enter email and password", 'warning');
    };

    const btnForceSignup = document.getElementById('btn-force-signup');
    if (btnForceSignup) btnForceSignup.onclick = () => {
         const email = document.getElementById('force-email').value;
        const pass = document.getElementById('force-password').value;
        if(email && pass) signUpWithEmail(email, pass);
        else showToast("Please enter email and password", 'warning');
    };

    // btnRun might be removed in later steps, but binding here if exists
    if (els.btnRun) els.btnRun.onclick = runCode;
    if (els.btnStop) els.btnStop.onclick = stopExecution;
    if (els.btnStopConsole) els.btnStopConsole.onclick = stopExecution;

    // Auto Fix
    if (els.btnAutoFix) els.btnAutoFix.onclick = handleAutoFix;

    // New File Button now acts as New Item
    if (els.btnNew) els.btnNew.onclick = createNewItem;

    if (els.btnUndo) els.btnUndo.onclick = () => undo(state.editor);
    if (els.btnRedo) els.btnRedo.onclick = () => redo(state.editor);
    if (els.btnClearCode) els.btnClearCode.onclick = async () => {
        if (await showConfirm("Clear Editor", "Are you sure you want to clear everything? Unsaved changes will be lost.")) {
            if (state.editor) {
                state.editor.dispatch({
                    changes: {from: 0, to: state.editor.state.doc.length, insert: ''}
                });
                state.editor.focus();
            }
        }
    };
    if (els.btnClearConsole) els.btnClearConsole.onclick = () => {
        const input = els.output.querySelector('input');
        els.output.innerHTML = '';
        if(input) {
             els.output.appendChild(input);
             input.focus();
        }
    };
    if (els.btnCopyConsole) els.btnCopyConsole.onclick = () => {
        const text = els.output.innerText;
        if (!text.trim()) return;

        navigator.clipboard.writeText(text).then(() => {
            // Visual feedback
            const originalIcon = els.btnCopyConsole.innerHTML;
            els.btnCopyConsole.innerHTML = '<i class="fa-solid fa-check text-green-400 text-[10px]"></i>';
            setTimeout(() => {
                els.btnCopyConsole.innerHTML = originalIcon;
            }, 1500);
        }).catch(err => {
            console.error("Failed to copy console:", err);
            showToast("Failed to copy to clipboard.", 'error');
        });
    };

    // Library
    if (els.btnInstallLib) els.btnInstallLib.onclick = installLibrary;

    // Sidebar
    if (els.btnToggleSidebar) els.btnToggleSidebar.onclick = () => toggleSidebar(true);
    if (els.btnCloseSidebar) els.btnCloseSidebar.onclick = () => toggleSidebar(false);
    if (els.sidebarOverlay) els.sidebarOverlay.onclick = () => toggleSidebar(false);

    // Profile Editing
    if (els.btnEditProfile) els.btnEditProfile.onclick = openProfileEdit;
    if (els.btnCloseProfileEdit) els.btnCloseProfileEdit.onclick = () => els.modalProfileEdit.classList.add('hidden');
    if (els.btnSaveProfile) els.btnSaveProfile.onclick = saveProfileEdit;
    if (els.btnSignOutSidebar) els.btnSignOutSidebar.onclick = () => {
        signOutUser();
        toggleSidebar(false);
    };
    if (els.btnSignOutSettings) els.btnSignOutSettings.onclick = () => {
        signOutUser();
        window.uiSwitchView('view-editor'); // Go back to main view or let auth listener handle overlay
    };

    // Avatar Upload (Reused for Edit Modal)
    if (els.inputAvatar) {
        els.inputAvatar.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
                uploadProfileImage(e.target.files[0], (base64) => {
                    // Update preview in edit modal
                    if (els.editAvatarImg) {
                        els.editAvatarImg.src = base64;
                        els.editAvatarImg.classList.remove('hidden');
                    }
                });
            }
        };
    }

    // Onboarding Avatar
    if (els.inputAvatarOnboarding) {
        els.inputAvatarOnboarding.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
                uploadProfileImage(e.target.files[0], (base64) => {
                    // Update preview in onboarding
                    if (els.onboardingAvatarImg) {
                        els.onboardingAvatarImg.src = base64;
                        els.onboardingAvatarImg.classList.remove('hidden');
                    }
                });
            }
        };
    }

    if (els.btnSaveOnboarding) els.btnSaveOnboarding.onclick = saveOnboarding;

    // AI Sidebar Tools
    const btnAiWorkspace = document.getElementById('btn-ai-workspace');
    if (btnAiWorkspace) {
        btnAiWorkspace.onclick = () => {
            window.uiSwitchView('view-ai-workspace');
            toggleSidebar(false);
        };
    }

    if (els.btnAiRefactor) {
        els.btnAiRefactor.onclick = async () => {
            if (!navigator.onLine) { showToast("AI features require internet.", 'warning'); return; }
            const code = state.editor.state.doc.toString();
            if (!code.trim()) return;

            // Show loading
            if(window.uiShowConsole) window.uiShowConsole();
            addToTerminal("\n[AI] Refactoring code... please wait.\n", "system");
            toggleSidebar(false);

            try {
                const newCode = await refactorCode(code);
                state.editor.dispatch({
                    changes: {from: 0, to: state.editor.state.doc.length, insert: newCode}
                });
                addToTerminal("[AI] Code refactored successfully.\n", "system");
            } catch (err) {
                addToTerminal(`[AI Error] ${err.message}\n`, "stderr");
            }
        };
    }

    if (els.btnAiDocs) {
        els.btnAiDocs.onclick = async () => {
            if (!navigator.onLine) { showToast("AI features require internet.", 'warning'); return; }
            const code = state.editor.state.doc.toString();
            if (!code.trim()) return;

            if(window.uiShowConsole) window.uiShowConsole();
            addToTerminal("\n[AI] Generating documentation... please wait.\n", "system");
            toggleSidebar(false);

            try {
                const newCode = await generateDocs(code);
                state.editor.dispatch({
                    changes: {from: 0, to: state.editor.state.doc.length, insert: newCode}
                });
                addToTerminal("[AI] Documentation added.\n", "system");
            } catch (err) {
                addToTerminal(`[AI Error] ${err.message}\n`, "stderr");
            }
        };
    }

    if (els.btnAiTests) {
        els.btnAiTests.onclick = async () => {
            if (!navigator.onLine) { showToast("AI features require internet.", 'warning'); return; }
            const code = state.editor.state.doc.toString();
            if (!code.trim()) return;

            const filename = state.currentFile.split('/').pop().replace('.py', '');
            const testFilename = `test_${filename}.py`;
             // Handle path if in subfolder
            const dir = state.currentFile.includes('/') ? state.currentFile.substring(0, state.currentFile.lastIndexOf('/') + 1) : '';
            const fullTestPath = dir + testFilename;


            if(window.uiShowConsole) window.uiShowConsole();
            addToTerminal(`\n[AI] Generating tests for ${state.currentFile}...\n`, "system");
            toggleSidebar(false);

            try {
                const testCode = await generateTests(filename, code);

                // Save new file
                if (state.files[fullTestPath]) {
                    if (!await showConfirm("Overwrite File", `File ${fullTestPath} already exists. Overwrite?`)) return;
                }
                state.files[fullTestPath] = testCode;
                renderFileList(); // Update file list UI

                // Switch to it
                switchFile(fullTestPath);

                addToTerminal(`[AI] Tests generated: ${fullTestPath}\n`, "system");
            } catch (err) {
                addToTerminal(`[AI Error] ${err.message}\n`, "stderr");
            }
        };
    }

    if (els.btnAiExplain) {
        els.btnAiExplain.onclick = async () => {
            if (!navigator.onLine) { showToast("AI features require internet.", 'warning'); return; }
            // Check selection first
            const selection = state.editor.state.selection.main;
            let code = "";
            if (!selection.empty) {
                code = state.editor.state.doc.sliceString(selection.from, selection.to);
                addToTerminal("\n[AI] Explaining selected code...\n", "system");
            } else {
                code = state.editor.state.doc.toString();
                addToTerminal("\n[AI] Explaining file logic...\n", "system");
            }

            if (!code.trim()) return;

            if(window.uiShowConsole) window.uiShowConsole();
            toggleSidebar(false);

            try {
                const explanation = await explainCode(code);
                addToTerminal(`\n--- AI Explanation ---\n${explanation}\n----------------------\n`, "stdout");
            } catch (err) {
                addToTerminal(`[AI Error] ${err.message}\n`, "stderr");
            }
        };
    }

    // AI Command Bar Logic Removed

    // Quick Keys
    els.quickKeys.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent focus loss?
            const key = btn.dataset.key;
            if (key === 'TAB') insertText("    ");
            else insertText(key);
        });
    });

    // Theme Change Listener
    window.addEventListener('theme-changed', (e) => {
        const themeId = e.detail.themeId;
        const newExtension = getThemeExtension(themeId);

        if (state.editor) {
            state.editor.dispatch({
                effects: themeCompartment.reconfigure([newExtension, cmTheme])
            });
        }
    });

    // Expose runCode and runAction globally
    window.cmdRunCode = runCode;
    window.cmdRunAction = runAction;
    window.cmdRunCodeWithCallback = runCodeWithCallback;
}

// Programmatic Execution (Returns Promise)
function runCodeWithCallback(inputs = []) {
    return new Promise((resolve) => {
        // Prepare state
        state.executionLogs = [];
        state.lastError = null;
        state.executionCallback = resolve; // Will resolve with { logs, error }

        // This is AI driven, so Manual Mode is FALSE
        state.isManualExecution = false;

        runCode(inputs);
    });
}

// --- Output Monitoring (Dev Mode) ---
function monitorOutput(content) {
    if (!state.monitoringMode) return;

    // 1. Line Repetition Check
    const lines = content.split('\n');
    for (const line of lines) {
        if (!line.trim()) continue; // Ignore empty lines? Or count them? Let's ignore for now.

        if (line === state.monitoringStats.lastLine) {
            state.monitoringStats.repeatCount++;
        } else {
            state.monitoringStats.lastLine = line;
            state.monitoringStats.repeatCount = 1;
        }

        if (state.monitoringStats.repeatCount > 50) {
            emergencyStop("Infinite Loop Detected: Same output repeated > 50 times.");
            return;
        }
    }

    // 3. Time Limit (Developer Mode: 5 mins default, but strict monitoring might be shorter?)
    // Let's rely on the run loop timeout for total time, but we can check if it's spamming.
    const elapsed = Date.now() - state.monitoringStats.startTime;
    if (elapsed > 300000) { // 5 mins
         emergencyStop("Time Limit Exceeded (5 minutes).");
         return;
    }
}

async function emergencyStop(reason) {
    stopExecution();
    addToTerminal(`\n[System] EMERGENCY STOP: ${reason}\n`, "stderr");

    // Trigger AI Fix
    if (state.editor) {
        const code = state.editor.state.doc.toString();
        const logs = state.executionLogs; // Pass full logs

        if (window.triggerSafetyFix) {
            await window.triggerSafetyFix(reason, code, logs);
        } else {
            // Fallback if AI module not loaded yet
            showToast("Auto-Fix module not loaded.", 'error');
        }
    }
}

// Handle Back Button specifically for Sidebar (if ui.js doesn't catch it perfectly)
window.addEventListener('popstate', (e) => {
    // If we popped a state and sidebar is open, close it
    if (!e.state || e.state.view !== 'sidebar') {
         els.sidebarMenu.classList.add('-translate-x-full');
         els.sidebarOverlay.classList.add('hidden');
    }
});

// Handle Online/Offline Transitions for Auth
window.addEventListener('offline', () => {
    if (!state.currentUser) {
        console.log("Network lost. Enabling Offline Guest Mode.");
        state.currentUser = { email: 'guest@offline.local', uid: 'offline-guest', isAnonymous: true };

        const overlay = document.getElementById('login-overlay');
        const appContent = document.getElementById('app-content');
        const sidebarPlaceholder = document.getElementById('sidebar-avatar-placeholder');
        const sidebarName = document.getElementById('sidebar-username');
        const sidebarEmail = document.getElementById('sidebar-email');

        if (overlay) overlay.classList.add('hidden');
        if (els.viewOnboarding) els.viewOnboarding.classList.add('hidden');
        if (document.getElementById('view-loading')) document.getElementById('view-loading').classList.add('hidden');

        if (appContent) {
            appContent.classList.remove('filter', 'blur-sm', 'pointer-events-none');
            appContent.classList.remove('blur-active');
        }

        if (sidebarPlaceholder) sidebarPlaceholder.textContent = "OF";
        if (sidebarName) sidebarName.textContent = "Offline Guest";
        if (sidebarEmail) sidebarEmail.textContent = "offline@local";

        showToast("Switched to Offline Guest Mode", "info");
    }
});

// Start
init();
