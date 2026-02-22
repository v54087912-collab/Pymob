
// Remote Dialog Loader (Ported from Java DialogLoader.java)
// Fetches configuration from Firebase and displays announcements/updates.
// Implements Strict Force Update & Anti-Bypass System.

const DIALOG_ID = "-OljAkZN6rdwlWhvjS9j";
const FIREBASE_URL = `https://pymob-3bfb1-default-rtdb.firebaseio.com/dialogs/${DIALOG_ID}.json`;
const CLICK_TRACKING_URL = `https://pymob-3bfb1-default-rtdb.firebaseio.com/dialogs/${DIALOG_ID}/stats/clicks.json`;

// App Version (Equivalent to versionCode in Android)
const CURRENT_VERSION = 5;

// Security: Prevent modification at runtime (though source code can still be edited)
Object.freeze(CURRENT_VERSION);

export class DialogLoader {

    static lastJsonHash = "";
    static isMonitoring = false;
    static currentDialog = null; // Store reference to DOM element

    /**
     * Call this method once (e.g., in onCreate) to start real-time monitoring.
     * It checks for updates every 30 seconds.
     */
    static startMonitoring() {
        if (this.isMonitoring) return;
        this.isMonitoring = true;

        // Run immediately
        this.checkForUpdate();

        // Run every 30 seconds
        setInterval(() => {
            this.checkForUpdate();
        }, 30000);
    }

    /**
     * Call this method to perform a one-time check.
     */
    static show() {
        this.checkForUpdate();
    }

    static async checkForUpdate() {
        try {
            console.log("DialogLoader: Checking update...");

            // Fetch Config (Bust cache with timestamp)
            const url = `${FIREBASE_URL}?t=${Date.now()}`;
            const response = await fetch(url, {
                method: 'GET',
                cache: 'no-store', // Disable caching
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });

            if (!response.ok) {
                console.log("DialogLoader: Network response was not ok", response.status);
                return;
            }

            // Treat response as text first to check for "null" or empty
            const jsonResponse = await response.text();

            // Check if content changed (Hash check)
            if (jsonResponse === this.lastJsonHash) {
                console.log("DialogLoader: No change in dialog config.");
                return;
            }

            console.log("DialogLoader: New JSON Content:", jsonResponse);

            if (!jsonResponse || jsonResponse === "null") {
                console.log("DialogLoader: No dialog data found (or dialog deleted).");
                this.lastJsonHash = ""; // Reset so if created again it shows
                this.dismissCurrentDialog();
                // Clear any lingering locks if dialog removed?
                // Strict policy: If dialog deleted, assume safe? Or keep locked?
                // Usually if dialog deleted by dev, we should unlock.
                localStorage.removeItem('pyide_update_lock');
                return;
            }

            // Parse JSON
            let data;
            try {
                data = JSON.parse(jsonResponse);
            } catch (e) {
                console.error("DialogLoader: JSON Parse Error", e);
                return;
            }

            // Extract Fields (Using defaults from Java code)
            const title = data.title || "Notice";
            const message = data.message || "Message";
            const btn1Text = data.btn1Text || "OK";
            const btn1Link = data.btn1Link || "";
            const btn2Text = data.btn2Text || "";
            const btn2Link = data.btn2Link || "";
            const cancelAction = data.cancelAction || "";
            const expiryDateStr = data.expiryDate || "";
            const targetVersion = data.targetVersion !== undefined ? data.targetVersion : -1;
            const isMaintenance = data.isMaintenance || false;

            // Security: Real-Time Version Integrity Check
            // If the server defines 'allowedVersions', verify that our CURRENT_VERSION is whitelisted.
            // This prevents unauthorized modifications (e.g., hacker changing version to 999 to bypass updates).
            if (data.allowedVersions && Array.isArray(data.allowedVersions)) {
                if (!data.allowedVersions.includes(CURRENT_VERSION)) {
                    console.error("Security Violation: App Version Integrity Check Failed.");
                    console.error(`Current: ${CURRENT_VERSION}, Allowed: ${JSON.stringify(data.allowedVersions)}`);

                    // Immediate Crash (Anti-Tamper)
                    this.triggerCrash();
                    return;
                }
            }

            let isForceUpdate = false;

            // Check Version Code (If targetVersion is set)
            if (targetVersion > 0) {
                console.log(`DialogLoader: Version Check: Current=${CURRENT_VERSION}, Target=${targetVersion}`);
                if (CURRENT_VERSION >= targetVersion) {
                    console.log("DialogLoader: App is up-to-date. Skipping dialog.");
                    // Unlock if satisfied
                    if (localStorage.getItem('pyide_update_lock')) {
                        console.log("DialogLoader: Lock removed. Reloading...");
                        localStorage.removeItem('pyide_update_lock');
                        window.location.reload();
                    }
                    return;
                }
                // Lock the app
                isForceUpdate = true;
                localStorage.setItem('pyide_update_lock', JSON.stringify({ version: targetVersion, locked: true }));
            } else {
                console.log("DialogLoader: No target version set. Showing to all.");
            }

            // Check Expiry (Only if NOT force update)
            if (!isForceUpdate && expiryDateStr) {
                try {
                    const expiryDate = new Date(expiryDateStr);
                    if (!isNaN(expiryDate.getTime()) && new Date() > expiryDate) {
                        console.log("DialogLoader: Dialog expired.");
                        return; // Expired
                    }
                } catch (e) {
                    console.error("DialogLoader: Date Parse Error", e);
                }
            }

            // Show Dialog
            this.dismissCurrentDialog(); // Close old one before showing new one

            this._renderDialog(jsonResponse, {
                title, message, btn1Text, btn1Link, btn2Text, btn2Link, cancelAction, isMaintenance, isForceUpdate
            });

        } catch (error) {
            console.error("DialogLoader: Error", error);
        }
    }

    static dismissCurrentDialog() {
        if (this.currentDialog && document.body.contains(this.currentDialog)) {
            document.body.removeChild(this.currentDialog);
        }
        this.currentDialog = null;
    }

    static isLocked() {
        const lockData = JSON.parse(localStorage.getItem('pyide_update_lock') || 'null');
        // If locked but version met (e.g. just updated but not checked net yet), we should unlock?
        // But we rely on checkForUpdate to remove it.
        // However, on boot, we check lock. If locked, return true.
        // We can double check version here to be safe and avoid deadlocks if update applied.
        if (lockData && lockData.locked) {
            if (lockData.version && CURRENT_VERSION >= lockData.version) {
                localStorage.removeItem('pyide_update_lock');
                return false;
            }
            return true;
        }
        return false;
    }

    static _renderDialog(jsonRaw, { title, message, btn1Text, btn1Link, btn2Text, btn2Link, cancelAction, isMaintenance, isForceUpdate }) {
        // Strict Mode Logic
        if (isForceUpdate || isMaintenance) {
            // Hide App Content
            const appContent = document.getElementById('app-content');
            if (appContent) appContent.style.display = 'none';

            // Push History State (Trap Back Button)
            history.pushState(null, null, location.href);
            window.onpopstate = () => {
                history.pushState(null, null, location.href);
            };

            // Anti-Tamper Watchdog
            if (!this.watchdogInterval) {
                this.watchdogInterval = setInterval(() => {
                    const overlay = document.getElementById('dialog-loader-overlay');
                    if (!overlay || overlay.style.display === 'none' || overlay.style.visibility === 'hidden' || overlay.style.opacity === '0') {
                        // Tampering Detected! Crash App.
                        this.triggerCrash();
                    }
                }, 200);
            }
        }

        // Create Overlay (Builder.setCancelable(false) -> Modal blocking)
        const overlay = document.createElement('div');
        overlay.id = "dialog-loader-overlay";
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: rgba(0, 0, 0, 0.95); /* Deep Black Dim */
            z-index: 2147483647; /* Max Z-Index */
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
            -webkit-user-select: none;
            backdrop-filter: blur(10px);
            touch-action: none;
        `;

        // Prevent clicks on overlay from closing (setCancelable(false))
        overlay.onclick = (e) => {
             e.stopPropagation();
             e.preventDefault();
        };

        // Create Card (AlertDialog)
        const card = document.createElement('div');
        card.className = "glass-card w-full max-w-sm rounded-xl p-6 flex flex-col gap-4 animate-scale-up border border-white/10 shadow-2xl bg-[#1e1e1e] text-white";
        // Stop propagation so clicks inside don't trigger overlay click (redundant but safe)
        card.onclick = (e) => e.stopPropagation();

        // Title
        const titleEl = document.createElement('h3');
        titleEl.className = "text-xl font-bold";
        titleEl.textContent = title;
        card.appendChild(titleEl);

        // Message
        const msgEl = document.createElement('p');
        msgEl.className = "text-sm text-gray-300 leading-relaxed whitespace-pre-wrap";
        msgEl.textContent = message;
        card.appendChild(msgEl);

        // Buttons Container
        const btnContainer = document.createElement('div');
        btnContainer.className = "flex justify-end gap-3 mt-4";

        if (isMaintenance) {
            // Maintenance Mode: Single "Exit" button
            const btnExit = document.createElement('button');
            btnExit.className = "px-4 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-500 transition-colors";
            btnExit.textContent = "Exit";
            btnExit.onclick = () => {
                 // "Exit" implementation for Web
                 window.location.href = "https://google.com";
            };
            btnContainer.appendChild(btnExit);
        } else {
            // Normal Mode
            // Force Update / Standard: Only Positive Button shown (as requested previously)

            // Positive Button (btn1)
            const btn1 = document.createElement('button');
            btn1.className = "px-4 py-2 bg-green-600 text-white rounded font-bold hover:bg-green-500 transition-colors shadow-lg w-full"; // Full width for emphasis
            btn1.textContent = btn1Text;
            btn1.onclick = () => {
                this.trackClick();
                if (btn1Link) {
                    window.open(btn1Link, '_blank');
                }
                // Only dismiss if NOT Force Update
                if (!isForceUpdate) {
                    this.dismissCurrentDialog();
                }
            };
            btnContainer.appendChild(btn1);
        }

        card.appendChild(btnContainer);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        this.currentDialog = overlay;
        this.lastJsonHash = jsonRaw; // Update hash on success
    }

    static triggerCrash() {
        // Obfuscate crash logic slightly
        const _0x123 = document.body;
        _0x123.innerHTML = '';
        _0x123.style.backgroundColor = '#000000';
        _0x123.style.cursor = 'none';

        const crashMsg = document.createElement('div');
        crashMsg.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #ff0000;
            font-family: monospace;
            font-size: 24px;
            text-align: center;
            font-weight: bold;
            z-index: 2147483647;
        `;
        crashMsg.innerHTML = "SECURITY VIOLATION<br>SYSTEM HALTED<br><br>Unrecognized Version Code.";
        _0x123.appendChild(crashMsg);

        // Aggressive loop to freeze UI
        const _freeze = () => {
            while(true) { debugger; }
        };

        try { _freeze(); } catch(e) {}

        // Reload loop as fallback
        setInterval(() => {
            window.location.reload();
        }, 1000);
    }

    static trackClick() {
        // Fire and Forget
        fetch(CLICK_TRACKING_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ timestamp: Date.now() })
        }).catch(err => console.error("DialogLoader: Track Click Error", err));
    }
}
