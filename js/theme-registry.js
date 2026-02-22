import { EditorView } from "https://esm.sh/codemirror";
import { oneDark } from "https://esm.sh/@codemirror/theme-one-dark";
import { syntaxHighlighting, HighlightStyle, defaultHighlightStyle } from "https://esm.sh/@codemirror/language";
import { tags as t } from "https://esm.sh/@lezer/highlight";

// Helper to create a theme extension
function createThemeExtension(themeColors, highlightStyleSpec) {
    const theme = EditorView.theme(themeColors, { dark: themeColors['&'].color !== '#000000' && themeColors['&'].color !== '#ffffff' ? true : false }); // heuristic for dark mode? better to pass type.
    // actually EditorView.theme take {dark: boolean} option.
    // We will just return [theme, syntaxHighlighting(HighlightStyle.define(highlightStyleSpec))]
    return [theme, syntaxHighlighting(HighlightStyle.define(highlightStyleSpec))];
}

// --- ONE DARK ---
const oneDarkColors = {
    '--color-dark': '#282c34',
    '--color-darker': '#21252b',
    '--color-accent': '#98c379',
    '--color-accent-hover': '#7db35b',
    '--color-surface': '#2c313a',
    '--color-border': '#181a1f',
    '--color-text': '#dcdfe4', // Improved contrast (was #abb2bf)
    '--color-text-muted': '#9da5b4', // Improved contrast (was #5c6370)
    '--color-hover-bg': 'rgba(255, 255, 255, 0.05)',
    '--editor-font-size': '14px',
    '--bg-image': 'none',
    '--backdrop-blur': 'none'
};

// --- DRACULA ---
const draculaColors = {
    '--color-dark': '#282a36',
    '--color-darker': '#21222c',
    '--color-accent': '#ff79c6',
    '--color-accent-hover': '#bd93f9',
    '--color-surface': '#44475a',
    '--color-border': '#6272a4',
    '--color-text': '#f8f8f2',
    '--color-text-muted': '#95a5d6', // Improved contrast (was #6272a4)
    '--color-hover-bg': 'rgba(255, 255, 255, 0.05)',
    '--editor-font-size': '14px',
    '--bg-image': 'none',
    '--backdrop-blur': 'none'
};

const draculaExtension = createThemeExtension({
    "&": { backgroundColor: "#282a36", color: "#f8f8f2" },
    ".cm-content": { caretColor: "#f8f8f0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#f8f8f0" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#44475a" },
    ".cm-gutters": { backgroundColor: "#282a36", color: "#6272a4", borderRight: "1px solid #44475a" },
    ".cm-activeLine": { backgroundColor: "#44475a" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#f8f8f2" }
}, [
    { tag: t.comment, color: "#6272a4" },
    { tag: t.string, color: "#f1fa8c" },
    { tag: t.atom, color: "#bd93f9" },
    { tag: t.meta, color: "#f8f8f2" },
    { tag: [t.keyword, t.operator, t.tagName], color: "#ff79c6" },
    { tag: [t.function(t.variableName), t.propertyName], color: "#50fa7b" },
    { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#bd93f9" },
    { tag: t.variableName, color: "#f8f8f2" }, // fallback
    { tag: t.escape, color: "#ff79c6" },
    { tag: t.regexp, color: "#ff5555" },
    { tag: t.link, color: "#8be9fd", textDecoration: "underline" }
]);

// --- MONOKAI ---
const monokaiColors = {
    '--color-dark': '#272822',
    '--color-darker': '#1e1f1c',
    '--color-accent': '#a6e22e',
    '--color-accent-hover': '#86b300',
    '--color-surface': '#3e3d32',
    '--color-border': '#49483e',
    '--color-text': '#f8f8f2',
    '--color-text-muted': '#a5a18e', // Improved contrast (was #75715e)
    '--color-hover-bg': 'rgba(255, 255, 255, 0.05)',
    '--editor-font-size': '14px',
    '--bg-image': 'none',
    '--backdrop-blur': 'none'
};

const monokaiExtension = createThemeExtension({
    "&": { backgroundColor: "#272822", color: "#f8f8f2" },
    ".cm-content": { caretColor: "#f8f8f0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#f8f8f0" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#49483e" },
    ".cm-gutters": { backgroundColor: "#272822", color: "#75715e", borderRight: "1px solid #49483e" },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.05)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#f8f8f2" }
}, [
    { tag: t.comment, color: "#75715e" },
    { tag: t.string, color: "#e6db74" },
    { tag: t.number, color: "#ae81ff" },
    { tag: [t.keyword, t.tagName], color: "#f92672" },
    { tag: [t.definition(t.variableName), t.function(t.variableName), t.className, t.attributeName], color: "#a6e22e" },
    { tag: t.variableName, color: "#f8f8f2" },
    { tag: t.typeName, color: "#66d9ef" },
    { tag: t.operator, color: "#f92672" }
]);

// --- GITHUB LIGHT ---
const githubLightColors = {
    '--color-dark': '#ffffff',
    '--color-darker': '#f6f8fa',
    '--color-accent': '#0366d6',
    '--color-accent-hover': '#0250a8',
    '--color-surface': '#f6f8fa',
    '--color-border': '#e1e4e8',
    '--color-text': '#24292e',
    '--color-text-muted': '#6a737d',
    '--color-hover-bg': 'rgba(0, 0, 0, 0.05)',
    '--editor-font-size': '14px',
    '--bg-image': 'none',
    '--backdrop-blur': 'none'
};

const githubLightExtension = createThemeExtension({
    "&": { backgroundColor: "#ffffff", color: "#24292e" },
    ".cm-content": { caretColor: "#24292e" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#24292e" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#b3d7ff" },
    ".cm-gutters": { backgroundColor: "#ffffff", color: "#6a737d", borderRight: "1px solid #e1e4e8" },
    ".cm-activeLine": { backgroundColor: "#f6f8fa" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#24292e" }
}, [
    { tag: t.comment, color: "#6a737d" },
    { tag: t.string, color: "#032f62" },
    { tag: t.number, color: "#005cc5" },
    { tag: [t.keyword, t.tagName], color: "#d73a49" },
    { tag: [t.function(t.variableName), t.className], color: "#6f42c1" },
    { tag: t.variableName, color: "#24292e" },
    { tag: t.typeName, color: "#005cc5" },
    { tag: t.operator, color: "#d73a49" }
]);

// --- SOLARIZED LIGHT ---
const solarizedLightColors = {
    '--color-dark': '#fdf6e3',
    '--color-darker': '#eee8d5',
    '--color-accent': '#2aa198',
    '--color-accent-hover': '#268bd2',
    '--color-surface': '#eee8d5',
    '--color-border': '#93a1a1', // using base1
    '--color-text': '#657b83',
    '--color-text-muted': '#586e75', // Improved contrast (was #93a1a1)
    '--color-hover-bg': 'rgba(0, 0, 0, 0.05)',
    '--editor-font-size': '14px',
    '--bg-image': 'none',
    '--backdrop-blur': 'none'
};

const solarizedLightExtension = createThemeExtension({
    "&": { backgroundColor: "#fdf6e3", color: "#657b83" },
    ".cm-content": { caretColor: "#657b83" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#657b83" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#eee8d5" },
    ".cm-gutters": { backgroundColor: "#fdf6e3", color: "#93a1a1", borderRight: "1px solid #eee8d5" },
    ".cm-activeLine": { backgroundColor: "#eee8d5" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#657b83" }
}, [
    { tag: t.comment, color: "#93a1a1" },
    { tag: t.string, color: "#2aa198" },
    { tag: t.number, color: "#d33682" },
    { tag: t.keyword, color: "#859900" },
    { tag: [t.function(t.variableName), t.className], color: "#268bd2" },
    { tag: t.variableName, color: "#657b83" },
    { tag: t.operator, color: "#657b83" }
]);

// --- NIGHT OWL ---
const nightOwlColors = {
    '--color-dark': '#011627',
    '--color-darker': '#0b2942', // Slightly lighter for contrast
    '--color-accent': '#82aaff',
    '--color-accent-hover': '#7e57c2',
    '--color-surface': '#0b253a',
    '--color-border': '#5f7e97',
    '--color-text': '#d6deeb',
    '--color-text-muted': '#8ca6bd', // Improved contrast (was #5f7e97)
    '--color-hover-bg': 'rgba(255, 255, 255, 0.05)',
    '--editor-font-size': '14px',
    '--bg-image': 'none',
    '--backdrop-blur': 'none'
};

const nightOwlExtension = createThemeExtension({
    "&": { backgroundColor: "#011627", color: "#d6deeb" },
    ".cm-content": { caretColor: "#80a4c2" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#80a4c2" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "#1d3b53" },
    ".cm-gutters": { backgroundColor: "#011627", color: "#5f7e97", borderRight: "1px solid #1d3b53" },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.05)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#d6deeb" }
}, [
    { tag: t.comment, color: "#637777", fontStyle: "italic" },
    { tag: t.string, color: "#ecc48d" },
    { tag: t.number, color: "#f78c6c" },
    { tag: [t.keyword, t.operator, t.tagName], color: "#c792ea" },
    { tag: [t.function(t.variableName), t.className], color: "#82aaff" },
    { tag: t.variableName, color: "#d6deeb" },
    { tag: t.propertyName, color: "#addb67" },
    { tag: t.regexp, color: "#5ca7e4" }
]);


export const themes = [
    {
        id: 'one-dark',
        name: 'One Dark',
        type: 'dark',
        colors: oneDarkColors,
        extension: oneDark
    },
    {
        id: 'dracula',
        name: 'Dracula',
        type: 'dark',
        colors: draculaColors,
        extension: draculaExtension
    },
    {
        id: 'monokai',
        name: 'Monokai',
        type: 'dark',
        colors: monokaiColors,
        extension: monokaiExtension
    },
    {
        id: 'github-light',
        name: 'GitHub Light',
        type: 'light',
        colors: githubLightColors,
        extension: githubLightExtension
    },
    {
        id: 'solarized-light',
        name: 'Solarized Light',
        type: 'light',
        colors: solarizedLightColors,
        extension: solarizedLightExtension
    },
    {
        id: 'night-owl',
        name: 'Night Owl',
        type: 'dark',
        colors: nightOwlColors,
        extension: nightOwlExtension
    }
];

export function getThemeExtension(themeId) {
    const theme = themes.find(t => t.id === themeId);
    return theme ? theme.extension : oneDark;
}
