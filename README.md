# PyMob Pro

A browser-based Python IDE with local execution (Pyodide), package management (Micropip), and real-time syntax highlighting (CodeMirror 6).

## Theme System

Theming is handled via `js/theme-registry.js`. To add a new theme:
1.  Define the UI colors (CSS variables).
2.  Create a CodeMirror theme extension using `createThemeExtension`.
3.  Add the theme object to the `themes` array.

## Running Locally

To support `SharedArrayBuffer` (required for Python `input()` and high performance), you must serve the app with specific headers:

```bash
python3 server_preview.py 3000
```

## Environment Configuration

This project now uses Environment Variables for security.

1.  Create a `.env` file in the root directory:
    ```
    LONGCAT_API_KEY=your_longcat_key
    VITE_FIREBASE_API_KEY=your_firebase_api_key
    VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
    VITE_FIREBASE_PROJECT_ID=...
    VITE_FIREBASE_STORAGE_BUCKET=...
    VITE_FIREBASE_MESSAGING_SENDER_ID=...
    VITE_FIREBASE_APP_ID=...
    VITE_FIREBASE_MEASUREMENT_ID=...
    ```

2.  To run locally with these variables, use `netlify dev` (requires Netlify CLI):
    ```bash
    npm install -g netlify-cli
    netlify dev
    ```

3.  If you are running a custom Node server, install `dotenv`:
    ```bash
    npm install dotenv
    ```
    And load it in your server script: `require('dotenv').config()`.

## Termux-like Execution Mode (Remote)

To execute scripts on your local machine (unrestricted Python environment):

1.  Run the local server agent:
    ```bash
    pip install websockets
    python3 server_agent.py
    ```
2.  Copy the **Auth Token** displayed in the terminal.
3.  In the PWA, go to **Settings > Execution**.
4.  Select **Execution Mode: Remote (Local Server)**.
5.  Paste the **Auth Token** into the field.
6.  The PWA will now execute scripts on your local machine.
