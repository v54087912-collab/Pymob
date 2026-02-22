export class PyMainThread {
    constructor() {
        this.onmessage = null;
        this.pyodide = null;
        this.micropip = null;
    }

    async init() {
        // Load Pyodide Script dynamically if not already loaded
        if (!window.loadPyodide) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js";
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        try {
            this.pyodide = await loadPyodide({
                stdout: (text) => this.sendMsg({ type: 'OUTPUT', content: text }),
                stderr: (text) => this.sendMsg({ type: 'OUTPUT', content: text, error: true }),
                stdin: () => {
                     // Synchronous input using prompt() since we are on main thread
                     // Note: prompt() blocks the UI, which is what we want for synchronous input here
                     return prompt("Python Input Request:") || "";
                }
            });

            // Expose js_print to allow immediate printing before blocking input
            this.pyodide.globals.set("js_print", (text) => {
                 this.sendMsg({ type: 'OUTPUT', content: text });
            });

            this.sendMsg({ type: 'OUTPUT', content: "Python environment loaded (Main Thread Fallback).\n", system: true });

            await this.pyodide.loadPackage("micropip");
            this.micropip = this.pyodide.pyimport("micropip");
            this.sendMsg({ type: 'OUTPUT', content: "Package Manager (Micropip) Ready.\n", system: true });

            // Patch input to ensure prompts are displayed before prompt() blocking
            await this.pyodide.runPythonAsync(`
import builtins
import sys

_orig_input = builtins.input

def _input_patch(prompt=""):
    sys.stdout.flush()
    if prompt:
        try:
             # Send prompt to UI (console)
             js_print("\\n" + str(prompt))
             # Also update the JS prompt() dialog title if possible? No, we just printed it.
        except:
             print(prompt, end="", flush=True)
    return _orig_input("")

builtins.input = _input_patch
`);

            // Define syntax check function
            this.pyodide.runPython(`
import ast
import json

def check_syntax_json(code):
    try:
        ast.parse(code)
        return json.dumps({"error": False})
    except SyntaxError as e:
        return json.dumps({
            "error": True,
            "lineno": e.lineno,
            "offset": e.offset,
            "msg": e.msg,
            "text": e.text
        })
    except Exception:
        return json.dumps({"error": False})
`);

            this.sendMsg({ type: 'LOADED' });

        } catch (err) {
            this.sendMsg({ type: 'OUTPUT', content: `Error loading Pyodide: ${err}\n`, error: true });
        }
    }

    sendMsg(msg) {
        if (this.onmessage) {
            this.onmessage({ data: msg });
        }
    }

    // Mimic Worker.postMessage API
    async postMessage(data) {
        const { type, content } = data;

        // Emulate async behavior slightly to allow UI updates
        await new Promise(r => setTimeout(r, 0));

        if (type === 'INIT') {
            await this.init();
        } else if (type === 'RUN') {
            if (!this.pyodide) return;
            try {
                this.pyodide.globals.set("user_code", content);
                await this.pyodide.runPythonAsync(`exec(user_code, globals())`);
            } catch (err) {
                 if (err.type === "SyntaxError" || err.type === "IndentationError") {
                    this.sendMsg({
                        type: 'ERROR',
                        error: { type: err.type, lineno: err.lineno, msg: err.msg }
                    });
                }
                this.sendMsg({ type: 'OUTPUT', content: String(err) + "\n", error: true });
            } finally {
                this.sendMsg({ type: 'OUTPUT', content: "Process finished.\n", system: true });
            }
        } else if (type === 'INSTALL') {
             if (!this.micropip) return;
             try {
                 await this.micropip.install(content);
                 this.sendMsg({ type: 'OUTPUT', content: `Successfully installed ${content}\n`, system: true });
             } catch (err) {
                 this.sendMsg({ type: 'OUTPUT', content: `Failed to install ${content}: ${err}\n`, error: true });
             }
        } else if (type === 'LINT') {
             if (!this.pyodide) return;
             try {
                this.pyodide.globals.set("code_to_check", content);
                const res = this.pyodide.runPython(`check_syntax_json(code_to_check)`);
                this.sendMsg({ type: 'LINT_RESULT', content: res });
             } catch (e) {}
        } else if (type === 'RESTORE_PACKAGES') {
             const packages = content;
             if (packages && packages.length > 0) {
                 this.sendMsg({ type: 'OUTPUT', content: "Restoring installed packages...\n", system: true });
                 try {
                     for (const pkg of packages) {
                         await this.micropip.install(pkg);
                     }
                     this.sendMsg({ type: 'OUTPUT', content: "Packages restored.\n", system: true });
                 } catch (err) {
                     this.sendMsg({ type: 'OUTPUT', content: `Failed to restore packages: ${err}\n`, error: true });
                 }
             }
        }
    }

    terminate() {
        console.warn("MainThreadRunner cannot be terminated securely. Reloading page might be required if code loops indefinitely.");
        // In a real app, we might prompt the user to reload
    }
}
