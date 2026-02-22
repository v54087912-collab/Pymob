const http = require('http');
const path = require('path');
const fs = require('fs');
const Module = require('module');

// --- Monkey Patch require to mock @netlify/functions locally ---
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === '@netlify/functions') {
        // Return a mock object where 'stream' is an identity function
        // This unwraps the handler so we can run it directly in Node
        return {
            stream: (handler) => handler
        };
    }
    return originalRequire.apply(this, arguments);
};

// Mock Environment if missing
if (!process.env.LONGCAT_API_KEY) {
    console.log("[Server] No API Key found. enabling MOCK MODE.");
    process.env.LONGCAT_API_KEY = "mock-key";
}

// Mock @netlify/functions stream wrapper if needed
// Since we are running in Node, we can just use the handler directly if we can access it.
// But the files wrap it.
// We can try to rely on the installed @netlify/functions package behaving correctly in Node.
// It usually returns a function that takes (req, context).

// Intercept Fetch for Mock Mode
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
    if (url.toString().includes("api.longcat.chat") && process.env.LONGCAT_API_KEY === "mock-key") {
        console.log("[Mock Fetch] Intercepting request to:", url);

        // Simulate streaming response
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                const chunks = [
                    'data: {"choices":[{"delta":{"content":"Hello! "}}]}\n\n',
                    'data: {"choices":[{"delta":{"content":"I am a "}}]}\n\n',
                    'data: {"choices":[{"delta":{"content":"simulated AI "}}]}\n\n',
                    'data: {"choices":[{"delta":{"content":"assistant running locally."}}]}\n\n',
                    'data: [DONE]\n\n'
                ];

                let i = 0;
                const interval = setInterval(() => {
                    if (i >= chunks.length) {
                        clearInterval(interval);
                        controller.close();
                        return;
                    }
                    controller.enqueue(encoder.encode(chunks[i]));
                    i++;
                }, 100);
            }
        });

        return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' }
        });
    }

    // Pass through other requests (or if we have a real key)
    // Note: Node.js 18+ has built-in fetch.
    if (originalFetch) return originalFetch(url, options);
    return fetch(url, options);
};

// Import Handlers
// We need to use absolute paths or relative to this script
const workspaceProxyPath = path.resolve(__dirname, 'netlify/functions/ai-workspace-proxy.cjs');
const featureProxyPath = path.resolve(__dirname, 'netlify/functions/ai-proxy.cjs');

const workspaceHandler = require(workspaceProxyPath).handler;
const featureHandler = require(featureProxyPath).handler;

const server = http.createServer(async (req, res) => {
    console.log(`[Request] ${req.method} ${req.url}`);

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return;
    }

    let handler = null;
    if (req.url === '/.netlify/functions/ai-workspace-proxy') {
        handler = workspaceHandler;
    } else if (req.url === '/.netlify/functions/ai-proxy') {
        handler = featureHandler;
    } else {
        res.statusCode = 404;
        res.end('Not Found');
        return;
    }

    // Read Body
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            // Create Mock Event (Netlify Style)
            const event = {
                body: body, // Raw string body
                httpMethod: 'POST',
                headers: req.headers,
                rawUrl: `http://localhost:8888${req.url}`,
                path: req.url
            };
            const context = {};

            // Call Handler
            // The @netlify/functions stream wrapper returns a Response object (Web API)
            // or a Netlify-style response object depending on version/context.
            // We'll check what we get.

            const result = await handler(event, context);

            // 1. Check if it's a standard Web Response
            if (result instanceof Response) {
                 res.statusCode = result.status;
                 result.headers.forEach((v, k) => res.setHeader(k, v));

                 if (result.body) {
                     const reader = result.body.getReader();
                     while (true) {
                         const { done, value } = await reader.read();
                         if (done) break;
                         res.write(value);
                     }
                 }
                 res.end();
                 return;
            }

            // 2. Check if it's a Netlify-style Response Object (legacy or wrapper specific)
            if (result && (result.statusCode || result.body)) {
                res.statusCode = result.statusCode || 200;
                if (result.headers) {
                    Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v));
                }

                if (result.body instanceof ReadableStream) {
                     const reader = result.body.getReader();
                     while (true) {
                         const { done, value } = await reader.read();
                         if (done) break;
                         res.write(value);
                     }
                     res.end();
                } else {
                    res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
                }
                return;
            }

            // Fallback
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Unknown response format from handler" }));

        } catch (err) {
            console.error("Handler Error:", err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
        }
    });
});

server.listen(8888, () => {
    console.log('Local Functions Server running on port 8888');
    console.log('Mock Mode:', process.env.LONGCAT_API_KEY === 'mock-key');
});
