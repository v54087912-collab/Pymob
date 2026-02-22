// UI Logic for PyMob Pro (View Switching, Console Toggling, Settings)
import { showToast, showConfirm } from "./ui-utils.js";

const ui = {
    views: {
        editor: document.getElementById('view-editor'),
        files: document.getElementById('view-files'),
        terminal: document.getElementById('view-terminal'),
        settings: document.getElementById('view-settings'),
        libraries: document.getElementById('view-libraries'),
        home: document.getElementById('view-home'),
        loading: document.getElementById('view-loading')
    },
    nav: document.querySelectorAll('.nav-btn'),
    console: {
        pane: document.getElementById('console-pane'),
        output: document.getElementById('console-output'),
        btnMin: document.getElementById('btn-minimize-console'),
        btnClear: document.getElementById('btn-clear-console')
    },
    settings: {
        inputs: document.querySelectorAll('#view-settings input[type="checkbox"]'),
    }
};

// --- View Switching ---
function switchView(targetId, pushState = true) {
    // Offline Block for AI Workspace
    if (targetId === 'view-ai-workspace' && !navigator.onLine) {
        showConfirm("🚫 You Are Offline",
            "You can't access AI Workspace without an internet connection.\n\nAI features require cloud connectivity.",
            false, // no cancel button
            "OK, Got It" // custom ok text
        );
        return;
    }

    // Hide all main views (except overlays which are handled separately)
    ['view-editor', 'view-files', 'view-terminal', 'view-settings', 'view-libraries', 'view-ai-workspace', 'view-saved-chats'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    // Show target
    const target = document.getElementById(targetId);
    if (target) target.classList.remove('hidden');

    // Update Nav State
    ui.nav.forEach(btn => {
        if (btn.dataset.target === targetId) {
            btn.classList.add('active');
            btn.classList.add('text-accent');
            btn.querySelector('.icon-container').classList.add('bg-green-900/20');
            btn.classList.remove('text-gray-500');
        } else {
            btn.classList.remove('active');
            btn.classList.remove('text-accent');
            btn.querySelector('.icon-container').classList.remove('bg-green-900/20');
            btn.classList.add('text-gray-500');
        }
    });

    // Handle History
    if (pushState) {
        history.pushState({ view: targetId }, "", `#${targetId.replace('view-', '')}`);
    }
}

// Handle Back Button
window.addEventListener('popstate', (event) => {
    // If we have a state, go to that view
    if (event.state && event.state.view) {
        switchView(event.state.view, false);
    } else {
        // Default to editor if no state (or initial load)
        switchView('view-editor', false);
    }
});

// Bind Nav Clicks
ui.nav.forEach(btn => {
    btn.addEventListener('click', () => {
        switchView(btn.dataset.target);
    });
});

// --- Console Logic ---
function showConsole() {
    if (ui.console.pane) {
        ui.console.pane.classList.remove('hidden');
        ui.console.pane.classList.add('console-enter');
    }
}

function hideConsole() {
    if (ui.console.pane) {
        ui.console.pane.classList.add('hidden');
    }
}

if (ui.console.btnMin) {
    ui.console.btnMin.addEventListener('click', hideConsole);
}

// Expose showConsole to window so script.js can call it on Run
window.uiShowConsole = showConsole;
// Expose switchView to window so script.js can handle redirects
window.uiSwitchView = switchView;

// --- Loading State Helper ---
window.uiSetLoading = (loading) => {
    if (loading) {
        if(ui.views.loading) ui.views.loading.classList.remove('hidden');
        if(ui.views.home) ui.views.home.classList.add('hidden');
    } else {
        if(ui.views.loading) ui.views.loading.classList.add('hidden');
        if(ui.views.home) ui.views.home.classList.add('hidden');
    }
};

// --- Offline Handling ---
function showOfflinePopup() {
    // Show only once per session/offline-bout
    if (sessionStorage.getItem('offlinePopupShown')) return;

    const popup = document.getElementById('modal-offline-popup');
    if (popup) {
        popup.classList.remove('hidden');
        sessionStorage.setItem('offlinePopupShown', 'true');
    }
}

// Bind Close Button for Popup
const btnCloseOffline = document.getElementById('btn-close-offline-popup');
if (btnCloseOffline) {
    btnCloseOffline.addEventListener('click', () => {
        const popup = document.getElementById('modal-offline-popup');
        if (popup) popup.classList.add('hidden');
    });
}

function handleNetworkStatus(online) {
    // Remove persistent banner if it exists (cleanup old version)
    const bannerId = 'offline-banner';
    let banner = document.getElementById(bannerId);
    if (banner) banner.remove();

    if (!online) {
        showOfflinePopup();
    } else {
        // If connection restores, allow popup to show again next time
        sessionStorage.removeItem('offlinePopupShown');

        // Hide popup if it's currently open
        const popup = document.getElementById('modal-offline-popup');
        if (popup) popup.classList.add('hidden');
    }
}

window.addEventListener('offline', () => {
    handleNetworkStatus(false);
    // Toast is secondary to popup now
    // showToast("You're offline - Cloud features disabled", 'warning');
});

window.addEventListener('online', () => {
    handleNetworkStatus(true);
    showToast("Back online", 'success');
});

// Check immediately
handleNetworkStatus(navigator.onLine);

// --- Initialize ---
// Don't auto-switch immediately. script.js will handle flow.
// Just ensure editor is ready underneath.
switchView('view-editor');
