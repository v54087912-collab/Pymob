
function insertSnippet(view, type) {
    const snippets = {
        'def': 'def function_name(args):\n    """Docstring"""\n    pass\n',
        'for': 'for item in iterable:\n    print(item)\n',
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
