// Settings Manager
import { themes } from "./theme-registry.js";

const fontSizes = [
    { id: '12px', name: '12px' },
    { id: '14px', name: '14px' },
    { id: '16px', name: '16px' },
    { id: '18px', name: '18px' },
    { id: '20px', name: '20px' },
    { id: '24px', name: '24px' }
];

const gutterWidths = [
    { id: 'compact', name: 'Compact (Min)', desc: 'Absolute minimum width' },
    { id: 'normal', name: 'Normal', desc: 'Standard padding' },
    { id: 'wide', name: 'Wide', desc: 'Extra space for readability' }
];

export const aiModes = [
    { id: 'super-fast', name: 'Super Fast', model: 'LongCat-Flash-Lite', desc: 'For easy / lightweight code' },
    { id: 'fast', name: 'Fast', model: 'LongCat-Flash-Chat', desc: 'For medium-level codes' },
    { id: 'ultra', name: 'Ultra', model: 'LongCat-Flash-Thinking', desc: 'For high-level codes' },
    { id: 'super-ultra', name: 'Super Ultra', model: 'LongCat-Flash-Thinking-2601', desc: 'For ultra high-level / complex code' }
];

let currentTheme = 'one-dark'; // Default changed to one-dark
let currentFontSize = '14px';
let currentGutterWidth = 'compact';
let currentAiMode = 'super-fast';

export function initSettings() {
    loadSettings();
    // Apply immediately on load
    applyTheme(currentTheme, false); // false = don't dispatch yet if editor not ready, but script.js handles init
    applyFontSize(currentFontSize);
    applyGutterWidth(currentGutterWidth);
    applyAiMode(currentAiMode);
    bindEvents();
}

function loadSettings() {
    const savedTheme = localStorage.getItem('pyide_theme');
    if (savedTheme) {
        // Validate if theme exists in registry, otherwise fallback
        const exists = themes.find(t => t.id === savedTheme);
        currentTheme = exists ? savedTheme : 'one-dark';
    }

    const savedSize = localStorage.getItem('pyide_fontsize');
    if (savedSize) currentFontSize = savedSize;

    const savedGutter = localStorage.getItem('pyide_gutterwidth');
    if (savedGutter) currentGutterWidth = savedGutter;

    const savedAiMode = localStorage.getItem('pyide_aimode');
    if (savedAiMode) {
        // Validate if mode exists
        const exists = aiModes.find(m => m.id === savedAiMode);
        currentAiMode = exists ? savedAiMode : 'super-fast';
    }
}

function applyTheme(themeId, dispatch = true) {
    const themeObj = themes.find(t => t.id === themeId);
    if (!themeObj) return;

    // Apply CSS variables
    const root = document.documentElement;
    Object.entries(themeObj.colors).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });

    // Remove old theme classes (legacy support or just cleanup)
    document.body.className = document.body.className.split(' ').filter(c => !c.startsWith('theme-')).join(' ');
    document.body.classList.add(`theme-${themeId}`);

    currentTheme = themeId;
    localStorage.setItem('pyide_theme', themeId);

    // Update UI text
    const themeNameEl = document.getElementById('current-theme-name');
    if (themeNameEl) themeNameEl.textContent = themeObj.name;

    // Update Meta Theme Color for Safe Area Status Bar
    updateMetaThemeColor();

    // Dispatch event for script.js to handle editor theme switch
    if (dispatch) {
        const event = new CustomEvent('theme-changed', { detail: { themeId } });
        window.dispatchEvent(event);
    }
}

function updateMetaThemeColor() {
    setTimeout(() => {
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            const computedColor = getComputedStyle(document.documentElement).getPropertyValue('--color-dark').trim();
            if (computedColor) {
                metaThemeColor.setAttribute('content', computedColor);
            }
        }
    }, 50);
}

function applyFontSize(size) {
    document.documentElement.style.setProperty('--editor-font-size', size);
    currentFontSize = size;
    localStorage.setItem('pyide_fontsize', size);

    // Update UI text
    const sizeEl = document.getElementById('current-font-size');
    if (sizeEl) sizeEl.textContent = size;
}

function applyGutterWidth(widthId) {
    document.body.classList.remove('gutter-compact', 'gutter-normal', 'gutter-wide');
    document.body.classList.add(`gutter-${widthId}`);

    currentGutterWidth = widthId;
    localStorage.setItem('pyide_gutterwidth', widthId);

    // Update UI text
    const gutterEl = document.getElementById('current-gutter-width');
    const gutterObj = gutterWidths.find(g => g.id === widthId);
    if (gutterEl && gutterObj) gutterEl.textContent = gutterObj.name;
}

function applyAiMode(modeId) {
    const modeObj = aiModes.find(m => m.id === modeId);
    if (!modeObj) return;

    currentAiMode = modeId;
    localStorage.setItem('pyide_aimode', modeId);

    // Update UI text
    const el = document.getElementById('current-ai-mode');
    if (el) {
        el.textContent = modeObj.name;
        el.className = "text-accent font-bold text-xs"; // Highlight
    }
}

export function getCurrentAiModel() {
    const modeObj = aiModes.find(m => m.id === currentAiMode);
    return modeObj ? modeObj.model : 'LongCat-Flash-Lite';
}

function bindEvents() {
    const themeBtn = document.getElementById('setting-theme');
    if (themeBtn) {
        themeBtn.onclick = () => openModal('Select Theme', themes, (item) => applyTheme(item.id));
    }

    const fontBtn = document.getElementById('setting-font-size');
    if (fontBtn) {
        fontBtn.onclick = () => openModal('Select Font Size', fontSizes, (item) => applyFontSize(item.id));
    }

    const gutterBtn = document.getElementById('setting-gutter-width');
    if (gutterBtn) {
        gutterBtn.onclick = () => openModal('Select Gutter Width', gutterWidths, (item) => applyGutterWidth(item.id));
    }

    const aiBtn = document.getElementById('setting-ai-mode');
    if (aiBtn) {
        aiBtn.onclick = () => openModal('Select AI Mode', aiModes, (item) => applyAiMode(item.id));
    }

    const closeBtn = document.getElementById('btn-close-selection');
    if (closeBtn) {
        closeBtn.onclick = closeModal;
    }
}

function openModal(title, items, onSelect) {
    const modal = document.getElementById('modal-selection');
    const titleEl = document.getElementById('modal-selection-title');
    const listEl = document.getElementById('modal-selection-list');

    if (!modal || !listEl) return;

    titleEl.textContent = title;
    listEl.innerHTML = '';

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between px-4 py-3 bg-surface rounded-xl hover:bg-hoverBg cursor-pointer border-b border-border last:border-0 transition-colors";

        let content = `<div class="flex items-center gap-3 w-full">`;

        // Add preview for themes
        if (title.includes('Theme') && item.colors) {
            const bg = item.colors['--color-dark'] || '#1e1e1e';
            const fg = item.colors['--color-text'] || '#ffffff';
            const accent = item.colors['--color-accent'] || '#3b82f6';

            // Contrast safety check for preview text
            let safeFg = fg;
            if (bg.toLowerCase() === '#ffffff' || bg.toLowerCase().startsWith('#f') || bg.toLowerCase().startsWith('#e')) {
                 if (fg.toLowerCase().startsWith('#f') || fg.toLowerCase().startsWith('#e')) {
                     safeFg = '#000000'; // Force black text on light bg
                 }
            }

            content += `
                <div class="w-6 h-6 rounded-full border border-gray-600/30 flex items-center justify-center text-[10px] font-bold shrink-0" style="background-color: ${bg}; color: ${safeFg}; border-color: ${accent}">
                    Aa
                </div>
            `;
        }

        content += `
            <div class="flex flex-col overflow-hidden">
                <span class="text-text text-sm font-medium truncate">${item.name}</span>
                ${item.desc ? `<span class="text-[10px] text-muted truncate">${item.desc}</span>` : ''}
            </div>
        </div>`;

        div.innerHTML = content;

        // Check if selected
        let isSelected = false;
        if ((title.includes('Theme') && item.id === currentTheme) ||
            (title.includes('Font') && item.id === currentFontSize) ||
            (title.includes('Gutter') && item.id === currentGutterWidth) ||
            (title.includes('AI Mode') && item.id === currentAiMode)) {
            isSelected = true;
        }

        if (isSelected) {
            div.classList.add('bg-green-900/20');
            div.innerHTML += `<i class="fa-solid fa-check text-accent text-xs ml-2"></i>`;
        }

        div.onclick = () => {
            // Apply immediately (Real Time)
            onSelect(item);

            // Visual feedback
            Array.from(listEl.children).forEach(c => {
                c.classList.remove('bg-green-900/20');
                const icon = c.querySelector('.fa-check');
                if(icon) icon.remove();
            });
            div.classList.add('bg-green-900/20');
            div.innerHTML += `<i class="fa-solid fa-check text-accent text-xs ml-2"></i>`;

            setTimeout(closeModal, 150);
        };
        listEl.appendChild(div);
    });

    modal.classList.remove('hidden');
}

function closeModal() {
    const modal = document.getElementById('modal-selection');
    if (modal) modal.classList.add('hidden');
}
