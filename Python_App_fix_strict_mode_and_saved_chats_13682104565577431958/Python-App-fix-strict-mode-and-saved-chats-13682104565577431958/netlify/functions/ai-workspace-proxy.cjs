const { stream } = require("@netlify/functions");

exports.handler = stream(async (event, context) => {
    // 1. Method Check
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    // 2. API Key Check
    const API_KEY = process.env.LONGCAT_API_KEY;
    if (!API_KEY) {
        console.error("Missing LONGCAT_API_KEY environment variable");
        return { statusCode: 500, body: JSON.stringify({ error: "Server configuration error: Missing API Key" }) };
    }

    // 3. Parse Body
    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        console.error("JSON Parse Error:", e);
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON in request body" }) };
    }

    const { messages, files, currentFile, model, mode, prompt, logs, code } = body;

    // --- Special Mode: Safety Check (Non-Streaming) ---
    if (mode === 'safety_check') {
        const systemPrompt = `You are an expert Python Code Safety Analyzer.
        Analyze the provided Python code for infinite loops, uncontrolled recursion, or blocking repetition that could hang the browser.

        Check for:
        1. 'while' loops without clear break conditions or incrementing counters.
        2. Recursion without base cases.
        3. 'for' loops with extremely large ranges that might freeze the UI.
        4. Blocking input() calls inside loops without exit conditions.

        Return ONLY a JSON object with this structure:
        {
            "safe": boolean,
            "risk_level": "low" | "medium" | "high",
            "reason": "Clear explanation of the risk (if any). If safe, say 'Code appears safe.'",
            "type": "infinite_loop" | "recursion" | "none"
        }
        Do not add markdown formatting or extra text. Just the JSON.`;

        const userPrompt = `Analyze this code:\n\n${code}`;

        try {
             console.log("Processing Safety Check Request...");
             const response = await fetch("https://api.longcat.chat/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: "LongCat-Flash-Lite",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.1,
                    max_tokens: 300
                })
            });

            if (!response.ok) {
                 const err = await response.text();
                 return { statusCode: response.status, body: err };
            }

            const data = await response.json();
            let text = "";
            if (data.choices && data.choices[0] && data.choices[0].message) {
                text = data.choices[0].message.content.trim();
            }
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: text
            };

        } catch (e) {
            console.error("Safety Check Error:", e);
            return { statusCode: 500, body: JSON.stringify({ error: "Safety Check Failed" }) };
        }
    }

    // --- Special Mode: Input Solver (Non-Streaming) ---
    if (mode === 'input_solver') {
        const systemPrompt = "You are an input provider for a running program. Return ONLY the string value to be entered. Do not add quotes or explanation.";
        let logText = Array.isArray(logs) ? logs.map(l => l.content).join('') : String(logs || "");
        const userPrompt = `The program is paused waiting for input.\nPrompt: '${prompt}'\n\nRecent Logs:\n${logText}\n\nProvide the input value now.`;

        try {
            console.log("Processing Input Solver Request...");
            const response = await fetch("https://api.longcat.chat/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: "LongCat-Flash-Lite",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                 const err = await response.text();
                 return { statusCode: response.status, body: err };
            }
            const data = await response.json();
            let text = "";
            if (data.choices && data.choices[0] && data.choices[0].message) {
                text = data.choices[0].message.content.trim();
            }
            const cleanText = text.replace(/^["']|["']$/g, '');

            return {
                statusCode: 200,
                headers: { "Content-Type": "text/plain" },
                body: cleanText
            };

        } catch (e) {
            console.error("Input Solver Error:", e);
            return { statusCode: 500, body: "Error processing input request" };
        }
    }

    // 4. Validate Payload (Standard Modes)
    if (!messages || !Array.isArray(messages)) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing or invalid 'messages' in request body" }) };
    }

    // Security Check
    if (files) {
        const BLACKLIST = ['.env', 'firebase-auth.js', 'secrets.py', 'config.js', 'keys.json'];
        for (const path of Object.keys(files)) {
            if (BLACKLIST.includes(path.split('/').pop())) {
                return { statusCode: 403, body: JSON.stringify({ error: "Access Denied: Security Violation" }) };
            }
        }
    }

    // 5. Construct Context
    let systemContext = "Project Context:\n";
    const MAX_CONTEXT_CHARS = 100000;
    let currentChars = 0;

    if (currentFile && files && files[currentFile]) {
        const content = files[currentFile];
        systemContext += `\n--- File: ${currentFile} (Active) ---\n${content}\n`;
        currentChars += content.length;
    }

    if (files) {
        for (const [path, content] of Object.entries(files)) {
            if (path === currentFile) continue;
            if (currentChars + content.length > MAX_CONTEXT_CHARS) {
                systemContext += `\n--- File: ${path} ---\n(Content truncated...)\n`;
                continue;
            }
            systemContext += `\n--- File: ${path} ---\n${content}\n`;
            currentChars += content.length;
        }
    }

    let modeInstructions = "";
    if (mode === 'developer') {
        modeInstructions = `
        ACTIVE MODE: DEVELOPER
        - You are an expert Python developer.
        - If the user asks you to write, modify, or fix code, you MUST follow this protocol:
          1. FIRST, ask for permission by responding with: "I need to edit files to complete this request. <<PERM_REQUEST>>" (and explain briefly what you will do).
          2. Do NOT output any code in the first response. Wait for the user to say "Permission Granted".
          3. ONCE PERMISSION IS GRANTED, you act as an Agent. You must return your response in a strict JSON block wrapped in \`\`\`json_agent ... \`\`\`.

          Format for Agent Response:
          \`\`\`json_agent
          {
            "thought": "Brief analysis of what to do...",
            "files": {
                "main.py": "full content of file...",
                "utils.py": "full content..."
            },
            "inputs": ["value1", "value2"],
            "command": "run"
          }
          \`\`\`
          - If the code requires user input (stdin), you MUST provide the input values in the 'inputs' array.
          - Iterate until the output is correct and error-free.
        `;
    } else {
        modeInstructions = `
        ACTIVE MODE: CHAT (DISCUSSION ONLY)
        - You are a helpful AI assistant for explaining and discussing the code.
        - Avoid generating large blocks of implementation code unless explicitly asked.
        `;
    }

    const enhancedMessages = [
        {
            role: "system",
            content: `You are an advanced AI development assistant. You have full context of the project files below.
            Use this context to answer questions accurately. Reference specific files and lines where appropriate.
            Explain 'why' something works, not just 'what'. Identify bad patterns, security risks, or performance issues.
            If a file is not in the context, say "Not found in project".

            IMPORTANT: FILE OPERATION PROTOCOLS (v2.0)
            1. If the user asks for a new coding task (create/modify/replace) without specifying a method, respond with "I can help you with that! How would you like to proceed?" and include the tag <<SHOW_OPTIONS>>.

            2. ACTION: CREATE_FILE
               - Provide the complete code wrapped in:
                 # === COPY BELOW THIS LINE ===
                 [CODE]
                 # === COPY ABOVE THIS LINE ===
               - Include instructions to open File Manager, create file, and paste code.

            3. ACTION: MODIFY_FILE [filename]
               - Do NOT generate code yet.
               - Respond with a "MODIFICATION PREVIEW" block:
                 ╔══════════════════════════════════════════════════════════╗
                 ║  MODIFICATION PREVIEW                                    ║
                 ╚══════════════════════════════════════════════════════════╝
                 📄 Target: [filename]
                 📍 Insertion: [line number/location]
                 📊 Changes: [summary]
                 ...
                 Proceed? [YES / NO / SHOW FULL FILE]

            4. ACTION: REPLACE_FILE [filename]
               - Do NOT generate code yet.
               - Respond with a "DESTRUCTIVE OPERATION WARNING":
                 ╔══════════════════════════════════════════════════════════╗
                 ║  ⚠️  DESTRUCTIVE OPERATION WARNING                       ║
                 ╚══════════════════════════════════════════════════════════╝
                 ...
                 Type "CONFIRM REPLACE" to proceed.

            5. Only when the user confirms (YES / CONFIRM REPLACE), proceed with the actual code generation or json_agent execution.
            - For REPLACEMENT, the json_agent MUST create a backup file (e.g., filename_backup_timestamp.py) before overwriting.

            ${modeInstructions}

            ${systemContext}`
        },
        ...messages
    ];

    // --- Revised Streaming Logic ---
    try {
        console.log(`Sending context-aware request to LongCat API (Model: ${model || "LongCat-Flash-Lite"})...`);

        // Fetch First
        const response = await fetch("https://api.longcat.chat/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: model || "LongCat-Flash-Lite",
                messages: enhancedMessages,
                temperature: 0.7,
                stream: true // ENABLE STREAMING
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Upstream API Error (${response.status}):`, errorText);
            return {
                statusCode: response.status >= 500 ? 502 : response.status,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: `Upstream API Error: ${response.status} - ${errorText}` })
            };
        }

        // Pipe Stream
        const streamBody = new ReadableStream({
            async start(controller) {
                // Pipe Upstream Stream
                const reader = response.body.getReader();
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        controller.enqueue(value);
                    }
                    controller.close();
                } catch (e) {
                    console.error("Stream Pipe Error:", e);
                    controller.close();
                }
            }
        });

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            },
            body: streamBody
        };

    } catch (error) {
        console.error("Streaming Error:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: `Internal Server Error: ${error.message}` })
        };
    }
});
