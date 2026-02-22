import { EditorView } from "https://esm.sh/codemirror";

export const cmTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--color-darker)",
    color: "var(--color-text)",
    fontSize: "var(--editor-font-size)"
  },
  ".cm-content": {
    caretColor: "var(--color-accent)"
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--color-accent)"
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "rgba(34, 197, 94, 0.2)"
  },
  ".cm-gutters": {
    backgroundColor: "var(--color-dark)",
    color: "var(--color-text-muted)",
    borderRight: "1px solid var(--color-border)"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.05)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--color-accent)"
  }
});
