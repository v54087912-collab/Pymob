
const STD_LIBS = new Set([
    "abc", "aifc", "argparse", "array", "ast", "asyncio", "atexit", "audioop",
    "base64", "bdb", "binascii", "bisect", "builtins", "bz2", "calendar", "cgi",
    "cgitb", "chunk", "cmath", "cmd", "code", "codecs", "codeop", "collections",
    "colorsys", "compileall", "concurrent", "configparser", "contextlib", "contextvars",
    "copy", "copyreg", "cProfile", "crypt", "csv", "ctypes", "curses", "dataclasses",
    "datetime", "dbm", "decimal", "difflib", "dis", "distutils", "doctest", "email",
    "encodings", "ensurepip", "enum", "errno", "faulthandler", "fcntl", "filecmp",
    "fileinput", "fnmatch", "formatter", "fractions", "ftplib", "functools", "gc",
    "getopt", "getpass", "gettext", "glob", "graphlib", "grp", "gzip", "hashlib",
    "heapq", "hmac", "html", "http", "imaplib", "imghdr", "imp", "importlib",
    "inspect", "io", "ipaddress", "itertools", "json", "keyword", "lib2to3",
    "linecache", "locale", "logging", "lzma", "mailbox", "mailcap", "marshal",
    "math", "mimetypes", "mmap", "modulefinder", "msilib", "msvcrt", "multiprocessing",
    "netrc", "nis", "nntplib", "numbers", "operator", "optparse", "os", "ossaudiodev",
    "parser", "pathlib", "pdb", "pickle", "pickletools", "pipes", "pkgutil", "platform",
    "plistlib", "poplib", "posix", "pprint", "profile", "pstats", "pty", "pwd",
    "py_compile", "pyclbr", "pydoc", "queue", "quopri", "random", "re", "readline",
    "reprlib", "resource", "rlcompleter", "runpy", "sched", "secrets", "select",
    "selectors", "shelve", "shlex", "shutil", "signal", "site", "smtpd", "smtplib",
    "sndhdr", "socket", "socketserver", "spwd", "sqlite3", "ssl", "stat", "statistics",
    "string", "stringprep", "struct", "subprocess", "sunau", "symbol", "symtable",
    "sys", "sysconfig", "syslog", "tabnanny", "tarfile", "telnetlib", "tempfile",
    "termios", "test", "textwrap", "threading", "time", "timeit", "tkinter", "token",
    "tokenize", "trace", "traceback", "tracemalloc", "tty", "turtle", "turtledemo",
    "types", "typing", "unicodedata", "unittest", "urllib", "uu", "uuid", "venv",
    "warnings", "wave", "weakref", "webbrowser", "winreg", "winsound", "wsgiref",
    "xdrlib", "xml", "xmlrpc", "zipapp", "zipfile", "zipimport", "zlib", "zoneinfo"
]);

const MAP_OVERRIDES = {
    'PIL': 'pillow',
    'sklearn': 'scikit-learn',
    'bs4': 'beautifulsoup4',
    'cv2': 'opencv-python',
    'yaml': 'pyyaml',
    'dateutil': 'python-dateutil'
};

export function detectMissingLibraries(code, files, installedPackages) {
    if (!code) return [];

    const missing = new Set();
    const installedSet = new Set(installedPackages);

    // Regex to capture 'import x' or 'from x import y'
    const importRegex = /^\s*(?:import|from)\s+([a-zA-Z0-9_]+)/gm;

    let match;
    while ((match = importRegex.exec(code)) !== null) {
        const lib = match[1];

        // 1. Check Stdlib
        if (STD_LIBS.has(lib)) continue;

        // 2. Check Local Files
        // Simple check: does any file match name.py
        const isLocal = Object.keys(files).some(f => {
            const name = f.split('/').pop();
            return name === `${lib}.py`;
        });
        if (isLocal) continue;

        // 3. Check Overrides
        const mapped = MAP_OVERRIDES[lib] || lib;

        // 4. Check Installed
        if (installedSet.has(mapped)) continue;

        missing.add(mapped);
    }

    return Array.from(missing);
}
