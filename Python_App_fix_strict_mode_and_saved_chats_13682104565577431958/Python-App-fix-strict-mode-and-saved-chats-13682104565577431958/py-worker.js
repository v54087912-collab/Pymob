importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js");

let pyodide = null;
let sharedBuffer = null;
let int32View = null;
let uint8View = null;

async function loadPyodideAndPackages(offline = false) {
    try {
        // Reusable function for reading input from SharedArrayBuffer
        const waitAndReadInput = () => {
            // Reset flag to 0 (WAIT)
            Atomics.store(int32View, 0, 0);

            // Wait for main thread to set flag to 1 (READY)
            Atomics.wait(int32View, 0, 0);

            // Read data length
            const len = Atomics.load(int32View, 1);

            // Read string data
            const strBytes = new Uint8Array(sharedBuffer, 8, len);
            const localBytes = new Uint8Array(strBytes);
            const decoder = new TextDecoder();
            return decoder.decode(localBytes);
        };

        // Standard stdin handler (no prompt)
        const pythonInputHandler = () => {
            postMessage({ type: 'INPUT_REQUEST' });
            return waitAndReadInput();
        };

        pyodide = await loadPyodide({
            stdout: (text) => postMessage({ type: 'OUTPUT', content: text }),
            stderr: (text) => postMessage({ type: 'OUTPUT', content: text, error: true }),
            stdin: pythonInputHandler
        });

        // Explicitly set stdin to ensure it's registered
        pyodide.setStdin({ stdin: pythonInputHandler });

        // Expose a direct output function to bypass stdout buffering
        pyodide.globals.set("js_print", (text) => {
             postMessage({ type: 'OUTPUT', content: text });
        });

        // Expose custom input function that sends prompt with request
        pyodide.globals.set("js_input", (prompt) => {
             postMessage({ type: 'INPUT_REQUEST', content: prompt });
             return waitAndReadInput();
        });

        postMessage({ type: 'OUTPUT', content: "Python environment loaded.\n", system: true });

        if (!offline) {
            try {
                await pyodide.loadPackage("micropip");
                postMessage({ type: 'OUTPUT', content: "Package Manager (Micropip) Ready.\n", system: true });
            } catch (e) {
                postMessage({ type: 'OUTPUT', content: `Warning: Failed to load Package Manager: ${e}\n`, error: true });
            }
        } else {
            postMessage({ type: 'OUTPUT', content: "Offline Mode: Skipping Package Manager.\n", system: true });
        }

        // --- Persistent Filesystem Setup (IDBFS) ---
        try {
            const FS = pyodide.FS;
            const MOUNT_DIR = '/home/pyodide/persistent';

            // Create the directory if it doesn't exist
            if (!FS.analyzePath(MOUNT_DIR).exists) {
                FS.mkdir(MOUNT_DIR);
            }

            // Mount IDBFS (IndexedDB)
            FS.mount(FS.filesystems.IDBFS, {}, MOUNT_DIR);

            // Sync from DB to Memory
            await new Promise(resolve => FS.syncfs(true, (err) => {
                if (err) console.error("IDBFS Load Error:", err);
                resolve();
            }));

            postMessage({ type: 'OUTPUT', content: "Local Persistent Storage Loaded.\n", system: true });

            // Copy persistent files to root for visibility/execution (simulation of flat persistence)
            // Realistically, users should work in a specific folder, but for now we mirror.
            // OR: We just tell the scan script to look in persistent folder too.
            // Let's symlink or just use the persistent folder as working dir?
            // Symlinking is safer.
            // Actually, simplest is: Users work in root. We auto-sync root files to persistent folder?
            // Or we just mount root to IDBFS?
            // Pyodide root is read-only usually or restricted? No, /home/pyodide is writable.
            // Let's mount /home/pyodide/local and update the Current Working Directory.

            pyodide.runPython(`
import os
import shutil

PERSISTENT_DIR = '/home/pyodide/persistent'
if not os.path.exists(PERSISTENT_DIR):
    os.makedirs(PERSISTENT_DIR)

# Restore files from persistent storage to current dir (simple mirror for now)
for filename in os.listdir(PERSISTENT_DIR):
    src = os.path.join(PERSISTENT_DIR, filename)
    dst = os.path.join('.', filename)
    if os.path.isfile(src):
        shutil.copy2(src, dst)
`);

        } catch (e) {
            console.error("FS Setup Error:", e);
            postMessage({ type: 'OUTPUT', content: `Warning: Persistent storage failed: ${e}\n`, error: true });
        }

        // Monkey patch input to ensure stdout is flushed and prompt is handled correctly
        await pyodide.runPythonAsync(`
import builtins
import sys

_orig_input = builtins.input

def _input_patch(prompt=""):
    sys.stdout.flush()
    # Add newline to ensure prompt is on new line if previous output exists
    full_prompt = str(prompt) if prompt else ""
    # Use custom js_input to send prompt with the request, ensuring order
    return js_input(full_prompt)

builtins.input = _input_patch
`);

        // Define syntax check function
        pyodide.runPython(`
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

        postMessage({ type: 'LOADED' });

    } catch (err) {
        postMessage({ type: 'OUTPUT', content: `Error loading Pyodide: ${err}\n`, error: true });
    }
}

self.onmessage = async (event) => {
    const { type, content, buffer, offline } = event.data;

    if (type === 'INIT') {
        sharedBuffer = buffer;
        int32View = new Int32Array(sharedBuffer);
        uint8View = new Uint8Array(sharedBuffer);
        await loadPyodideAndPackages(offline);
    } else if (type === 'RUN') {
        if (!pyodide) return;
        try {
            pyodide.globals.set("user_code", content);
            await pyodide.runPythonAsync(`exec(user_code, globals())`);

            // Auto-Save: Sync files to persistent storage
            await pyodide.runPythonAsync(`
import os
import shutil
PERSISTENT_DIR = '/home/pyodide/persistent'
# Save all files in current dir to persistent dir
for filename in os.listdir('.'):
    if os.path.isfile(filename) and not filename.startswith('.'):
        shutil.copy2(filename, os.path.join(PERSISTENT_DIR, filename))
`);
            await new Promise(resolve => pyodide.FS.syncfs(false, resolve)); // Write to DB

        } catch (err) {
            // Handle SyntaxErrors specially to allow editor highlighting
            if (err.type === "SyntaxError" || err.type === "IndentationError") {
                postMessage({
                    type: 'ERROR',
                    error: {
                        type: err.type,
                        lineno: err.lineno,
                        msg: err.msg
                    }
                });
            }
            // Send full traceback as stderr
            postMessage({ type: 'OUTPUT', content: String(err) + "\n", error: true });
        } finally {
             postMessage({ type: 'OUTPUT', content: "Process finished.\n", system: true });
        }
    } else if (type === 'INSTALL') {
        if (!pyodide) return;
        try {
            const micropip = pyodide.pyimport("micropip");
            await micropip.install(content);
            postMessage({ type: 'OUTPUT', content: `Successfully installed ${content}\n`, system: true });
        } catch (err) {
            postMessage({ type: 'OUTPUT', content: `Failed to install ${content}: ${err}\n`, error: true });
        }
    } else if (type === 'LINT') {
        if (!pyodide) return;
        try {
            pyodide.globals.set("code_to_check", content);
            const jsonResult = pyodide.runPython(`check_syntax_json(code_to_check)`);
            postMessage({ type: 'LINT_RESULT', content: jsonResult });
        } catch (e) {
             // Ignore linting errors
        }
    } else if (type === 'RESTORE_PACKAGES') {
        if (!pyodide) return;
        const packages = content; // content is array of strings
        if (packages && packages.length > 0) {
            postMessage({ type: 'OUTPUT', content: "Restoring installed packages...\n", system: true });
            try {
                const micropip = pyodide.pyimport("micropip");
                for (const pkg of packages) {
                    await micropip.install(pkg);
                }
                postMessage({ type: 'OUTPUT', content: "Packages restored.\n", system: true });
            } catch (err) {
                 postMessage({ type: 'OUTPUT', content: `Failed to restore packages: ${err}\n`, error: true });
            }
        }
    } else if (type === 'SYNC_FILES') {
        // Main Thread -> Worker: Write files to FS
        const files = content; // { 'main.py': 'content', 'folder/file.txt': 'content' }
        if (!pyodide) return;
        try {
            for (const [path, data] of Object.entries(files)) {
                // Ensure directories exist
                const parts = path.split('/');
                if (parts.length > 1) {
                    const dir = parts.slice(0, -1).join('/');
                    try {
                        // Create directory recursively
                        pyodide.FS.mkdirTree(dir);
                    } catch (e) {
                        // Ignore if exists
                    }
                }
                pyodide.FS.writeFile(path, data, { encoding: "utf8" });
            }

            // Sync to IDBFS immediately
             await pyodide.runPythonAsync(`
import os
import shutil
PERSISTENT_DIR = '/home/pyodide/persistent'
# Save all files in current dir to persistent dir
for filename in os.listdir('.'):
    if os.path.isfile(filename) and not filename.startswith('.'):
        shutil.copy2(filename, os.path.join(PERSISTENT_DIR, filename))
`);
            await new Promise(resolve => pyodide.FS.syncfs(false, resolve));

            postMessage({ type: 'FILES_SYNCED' });
        } catch (err) {
            postMessage({ type: 'OUTPUT', content: `File Sync Error: ${err}\n`, error: true });
        }
    } else if (type === 'SCAN_FILES') {
        // Worker -> Main Thread: Read all files from FS
        if (!pyodide) return;
        try {
            // Python script to walk and read text files
            const scanScript = `
import os
import json

files = {}
try:
    for root, _, filenames in os.walk('.'):
        for filename in filenames:
            if filename.startswith('.'): continue
            if '__pycache__' in root: continue

            path = os.path.join(root, filename)
            if path.startswith('./'): path = path[2:]

            # Skip if it's too large or binary (simple heuristic)
            try:
                if os.path.getsize(path) > 1000000: continue # Skip > 1MB
                with open(path, 'r', encoding='utf-8') as f:
                    files[path] = f.read()
            except:
                pass # Skip binary or error
except Exception as e:
    pass

json.dumps(files)
`;
            const jsonResult = pyodide.runPython(scanScript);
            const files = JSON.parse(jsonResult);
            postMessage({ type: 'FILES_UPDATE', content: files });
        } catch(err) {
             // specific error logging if needed, but usually silent scan fail is okay or log to stderr
             // postMessage({ type: 'OUTPUT', content: `File Scan Error: ${err}\n`, error: true });
        }
    }
};
