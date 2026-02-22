
const DB_NAME = 'PWA_CodeEditor_State';
const DB_VERSION = 1;

const STORES = {
    FILES: 'files',
    EDITOR: 'editor',
    TERMINAL: 'terminal',
    SETTINGS: 'settings'
};

let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORES.FILES)) {
                db.createObjectStore(STORES.FILES, { keyPath: 'path' });
            }
            if (!db.objectStoreNames.contains(STORES.EDITOR)) {
                db.createObjectStore(STORES.EDITOR, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORES.TERMINAL)) {
                db.createObjectStore(STORES.TERMINAL, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                db.createObjectStore(STORES.SETTINGS, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });

    return dbPromise;
}

async function getStore(storeName, mode = 'readonly') {
    const db = await openDB();
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
}

// --- Generic Operations ---

async function put(storeName, value) {
    const store = await getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.put(value);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function get(storeName, key) {
    const store = await getStore(storeName, 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAll(storeName) {
    const store = await getStore(storeName, 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function remove(storeName, key) {
    const store = await getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// --- Specific Operations ---

export const persistence = {
    init: async () => {
        try {
            await openDB();
            // Check if migration is needed (if empty)
            const files = await getAll(STORES.FILES);
            if (files.length === 0) {
                await persistence.migrateFromLocalStorage();
            }
        } catch (e) {
            console.error("IndexedDB Init Failed:", e);
        }
    },

    saveFile: async (path, content) => {
        await put(STORES.FILES, { path, content, lastModified: Date.now() });
    },

    getFile: async (path) => {
        return await get(STORES.FILES, path);
    },

    getAllFiles: async () => {
        const files = await getAll(STORES.FILES);
        const fileMap = {};
        files.forEach(f => fileMap[f.path] = f.content);
        return fileMap;
    },

    deleteFile: async (path) => {
        await remove(STORES.FILES, path);
    },

    saveEditorState: async (currentFile, cursor, scroll) => {
        await put(STORES.EDITOR, {
            id: 'current',
            file: currentFile,
            cursor,
            scroll,
            lastSaved: Date.now()
        });
    },

    loadEditorState: async () => {
        return await get(STORES.EDITOR, 'current');
    },

    saveTerminal: async (content) => {
        await put(STORES.TERMINAL, {
            id: 'history',
            content,
            lastSaved: Date.now()
        });
    },

    loadTerminal: async () => {
        const result = await get(STORES.TERMINAL, 'history');
        return result ? result.content : '';
    },

    saveSettings: async (settings) => {
        await put(STORES.SETTINGS, {
            id: 'config',
            ...settings
        });
    },

    loadSettings: async () => {
        return await get(STORES.SETTINGS, 'config');
    },

    migrateFromLocalStorage: async () => {
        console.log("Migrating from localStorage...");

        // Files
        const storedFiles = localStorage.getItem('pyide_files');
        if (storedFiles) {
            try {
                const files = JSON.parse(storedFiles);
                for (const [path, content] of Object.entries(files)) {
                    await put(STORES.FILES, { path, content, lastModified: Date.now() });
                }
            } catch (e) {
                console.error("File Migration Failed:", e);
            }
        }

        // Current File (Editor State partial)
        const currentFile = localStorage.getItem('pyide_current');
        if (currentFile) {
            await put(STORES.EDITOR, {
                id: 'current',
                file: currentFile,
                cursor: 0, // Default
                scroll: 0, // Default
                lastSaved: Date.now()
            });
        }

        // Settings (Theme, etc)
        const theme = localStorage.getItem('pyide_theme');
        if (theme) {
             await put(STORES.SETTINGS, {
                id: 'config',
                theme: theme
            });
        }

        console.log("Migration Complete.");
    }
};
