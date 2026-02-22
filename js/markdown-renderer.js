import { marked } from "https://esm.sh/marked";
import DOMPurify from "https://esm.sh/dompurify";

// Configure Marked Renderer
const renderer = {
    code(token) {
        // Handle both old (code, lang) and new ({text, lang}) signatures
        let code, language;
        if (typeof token === 'object' && token !== null && typeof token.text === 'string') {
            code = token.text;
            language = token.lang;
        } else {
            // Fallback for older marked versions or direct calls
            code = arguments[0];
            language = arguments[1];
        }

        // Ensure code is string
        if (typeof code !== 'string') {
            code = String(code || '');
        }

        const lang = (language || 'text').split('\n')[0];
        const validLang = lang ? lang : 'Text';
        const id = `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Escape code content to prevent HTML rendering of code tags
        const escapedCode = code.replace(/&/g, "&amp;")
                                .replace(/</g, "&lt;")
                                .replace(/>/g, "&gt;")
                                .replace(/"/g, "&quot;")
                                .replace(/'/g, "&#039;");

        return `<div class="code-block-wrapper">
            <div class="code-block-header">
                <span class="code-lang">${validLang}</span>
                <button class="btn-copy-code" data-target="${id}">
                    <i class="fa-regular fa-copy"></i> Copy
                </button>
            </div>
            <pre><code id="${id}" class="language-${lang}">${escapedCode}</code></pre>
        </div>`;
    }
};

marked.use({ renderer });

// Simple Markdown Renderer (Wrapper around marked)
export function renderMarkdown(text) {
    // 1. Strict Type Guard
    if (typeof text !== 'string') {
        console.warn("renderMarkdown received non-string input:", text);
        return `<div class="p-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-xs font-mono">
            <strong>Error:</strong> Received invalid data format.
        </div>`;
    }

    try {
        // Parse Markdown
        const rawHtml = marked.parse(text);

        // Sanitize HTML (prevent XSS)
        const cleanHtml = DOMPurify.sanitize(rawHtml, {
            USE_PROFILES: { html: true }, // allow standard HTML
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'], // explicitly forbid dangerous tags
            FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'] // forbid event handlers
        });

        return cleanHtml;
    } catch (err) {
        console.error("Markdown Parsing Error:", err);
        return `<div class="p-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-xs font-mono">
            <strong>Parsing Error:</strong> ${err.message || 'Unknown error during markdown rendering'}
        </div>`;
    }
}
