
/**
 * UI Utilities for PyMob Pro
 * Replaces native alerts, confirms, and prompts with custom PWA-friendly modals.
 */

// Toast Notifications
export function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed top-4 right-4 z-[110] flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');

    let iconClass = 'fa-solid fa-circle-info text-blue-400';
    let borderClass = 'border-blue-500/20';

    if (type === 'success') {
        iconClass = 'fa-solid fa-circle-check text-green-400';
        borderClass = 'border-green-500/20';
    } else if (type === 'error') {
        iconClass = 'fa-solid fa-circle-exclamation text-red-400';
        borderClass = 'border-red-500/20';
    } else if (type === 'warning') {
        iconClass = 'fa-solid fa-triangle-exclamation text-yellow-400';
        borderClass = 'border-yellow-500/20';
    }

    toast.className = `bg-surface border ${borderClass} text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 transform translate-x-full transition-all duration-300 pointer-events-auto backdrop-blur-md min-w-[300px] max-w-sm`;

    // Handle newlines in message
    const formattedMessage = message.replace(/\n/g, '<br>');

    toast.innerHTML = `
        <i class="${iconClass} text-lg shrink-0"></i>
        <span class="text-sm font-medium flex-1 leading-tight">${formattedMessage}</span>
        <button class="text-muted hover:text-white transition-colors" onclick="this.parentElement.classList.add('translate-x-full', 'opacity-0'); setTimeout(() => this.parentElement.remove(), 300);">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full');
    });

    // Auto dismiss
    setTimeout(() => {
        if (toast.isConnected) {
            toast.classList.add('translate-x-full', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// Custom Confirmation Modal
export function showConfirm(title, message, showCancel = true, confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
        // Remove existing if any (cleanup)
        const existing = document.getElementById('modal-confirm-custom');
        if (existing) existing.remove();

        const modalId = 'modal-confirm-custom';
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-300';

        const cancelBtnHTML = showCancel ? `<button id="${modalId}-cancel" class="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-2.5 rounded-xl border border-white/5 transition-all active:scale-95">${cancelText}</button>` : '';

        modal.innerHTML = `
            <div class="glass-card w-full max-w-xs sm:max-w-sm rounded-2xl p-6 flex flex-col gap-4 transform scale-95 transition-transform duration-300 border border-white/10 shadow-2xl bg-[#1e1e1e]">
                <div class="flex items-center gap-3 text-accent">
                    <i class="fa-solid fa-circle-question text-xl"></i>
                    <h3 class="text-lg font-bold text-white">${title}</h3>
                </div>
                <p class="text-gray-300 text-sm leading-relaxed">${message}</p>
                <div class="flex gap-3 mt-2">
                    ${cancelBtnHTML}
                    <button id="${modalId}-ok" class="flex-1 bg-accent hover:bg-accentHover text-black font-bold py-2.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-green-900/20">${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const cancelBtn = document.getElementById(`${modalId}-cancel`);
        const okBtn = document.getElementById(`${modalId}-ok`);

        const close = (result) => {
            modal.classList.remove('opacity-100', 'pointer-events-auto');
            modal.classList.add('opacity-0', 'pointer-events-none');
            modal.querySelector('.glass-card').classList.remove('scale-100');
            modal.querySelector('.glass-card').classList.add('scale-95');

            setTimeout(() => {
                modal.remove();
                resolve(result);
            }, 300);
        };

        if (cancelBtn) cancelBtn.onclick = () => close(false);
        okBtn.onclick = () => close(true);

        // Open
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modal.classList.add('opacity-100', 'pointer-events-auto');
            modal.querySelector('.glass-card').classList.remove('scale-95');
            modal.querySelector('.glass-card').classList.add('scale-100');
        });
    });
}

// Custom Prompt Modal
export function showPrompt(title, message, defaultValue = '') {
    return new Promise((resolve) => {
        // Remove existing if any
        const existing = document.getElementById('modal-prompt-custom');
        if (existing) existing.remove();

        const modalId = 'modal-prompt-custom';
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-300';

        modal.innerHTML = `
            <div class="glass-card w-full max-w-xs sm:max-w-sm rounded-2xl p-6 flex flex-col gap-4 transform scale-95 transition-transform duration-300 border border-white/10 shadow-2xl bg-[#1e1e1e]">
                 <div class="flex items-center gap-3 text-accent">
                    <i class="fa-solid fa-pen-to-square text-xl"></i>
                    <h3 class="text-lg font-bold text-white">${title}</h3>
                </div>
                <p class="text-gray-300 text-sm">${message}</p>
                <input type="text" id="${modalId}-input" class="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent placeholder-gray-500 transition-colors" value="${defaultValue}" />
                <div class="flex gap-3 mt-2">
                    <button id="${modalId}-cancel" class="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-2.5 rounded-xl border border-white/5 transition-all active:scale-95">Cancel</button>
                    <button id="${modalId}-ok" class="flex-1 bg-accent hover:bg-accentHover text-black font-bold py-2.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-green-900/20">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const inputEl = document.getElementById(`${modalId}-input`);
        const cancelBtn = document.getElementById(`${modalId}-cancel`);
        const okBtn = document.getElementById(`${modalId}-ok`);

        const close = (result) => {
            modal.classList.remove('opacity-100', 'pointer-events-auto');
            modal.classList.add('opacity-0', 'pointer-events-none');
            modal.querySelector('.glass-card').classList.remove('scale-100');
            modal.querySelector('.glass-card').classList.add('scale-95');

            setTimeout(() => {
                modal.remove();
                resolve(result);
            }, 300);
        };

        cancelBtn.onclick = () => close(null);
        okBtn.onclick = () => close(inputEl.value);

        // Allow Enter key to submit
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                close(inputEl.value);
            } else if (e.key === 'Escape') {
                close(null);
            }
        };

        // Open
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modal.classList.add('opacity-100', 'pointer-events-auto');
            modal.querySelector('.glass-card').classList.remove('scale-95');
            modal.querySelector('.glass-card').classList.add('scale-100');
            inputEl.focus();
            inputEl.select();
        });
    });
}
