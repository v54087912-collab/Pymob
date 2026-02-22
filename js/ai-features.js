import { getCurrentAiModel } from "./settings.js";

async function callAiProxy(messages, useStream = false) {
    const model = getCurrentAiModel();

    const maxRetries = 2;
    let response;
    let lastError;

    for (let i = 0; i <= maxRetries; i++) {
        // 15s Connection Timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            if (i > 0) {
                 await new Promise(r => setTimeout(r, 1000 * i));
            }

            response = await fetch("/.netlify/functions/ai-proxy", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: messages,
                    model: model,
                    stream: useStream
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId); // Headers received, connection established

            if (response.ok) break;

            // Handle Error Response (likely JSON now)
            const errText = await response.text();
            let cleanMsg = errText;
            try {
                const json = JSON.parse(errText);
                if (json.error) cleanMsg = json.error;
            } catch (e) {}

            throw new Error(`AI Error (${response.status}): ${cleanMsg}`);

        } catch (e) {
            clearTimeout(timeoutId);
            lastError = e;
            console.warn(`AI Feature Attempt ${i+1} failed:`, e);

            if (e.name === 'AbortError') {
                lastError = new Error("Connection timed out (15s). Proxy failed to respond.");
            }
        }
    }

    if (!response || !response.ok) {
        throw lastError || new Error("Failed to connect to AI Service.");
    }

    // --- Non-Streaming Mode (JSON) ---
    if (!useStream) {
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content;
        }
        throw new Error("Invalid JSON response from AI.");
    }

    // --- Streaming Mode (SSE) ---
    try {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";

        const processLine = (line) => {
             if (line.startsWith(':')) return; // Ignore Keep-Alive
             if (line.trim() === '') return;
             if (line.startsWith('data: ')) {
                 const dataStr = line.slice(6).trim();
                 if (dataStr === '[DONE]') return;
                 try {
                     const data = JSON.parse(dataStr);

                     // Check for in-stream error (legacy or if backend sends it)
                     if (data.error) {
                         throw new Error(data.error);
                     }

                     if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                         fullText += data.choices[0].delta.content;
                     }
                 } catch (e) {
                     if (e.message && (e.message.includes("Upstream") || e.message.includes("Internal"))) throw e;
                     console.warn("SSE Parse Error (Helper):", e);
                 }
             }
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete

            for (const line of lines) {
                processLine(line);
            }
        }

        if (buffer.trim()) {
            processLine(buffer);
        }

        return fullText;

    } catch (error) {
        console.error("AI Feature Error:", error);
        throw error;
    }
}

export async function refactorCode(code) {
    // Developer Mode check removed - Features available to all online users
    const systemPrompt = "You are a Python Expert. Refactor the following code to be more efficient (better Time Complexity), clean, and professional (PEP-8). Remove redundant logic. Return ONLY the raw Python code. NO Markdown. NO explanations.";
    const userPrompt = "CODE:\n" + code;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];

    // Use Non-Streaming
    let result = await callAiProxy(messages, false);
    return result.replace(/^```python\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
}

export async function generateCodeFromPrompt(prompt) {
    // Developer Mode check removed
    const systemPrompt = "You are a Python Expert. Generate Python code based on the user's request. Return ONLY the raw Python code. NO Markdown. NO explanations.";
    const userPrompt = "REQUEST: " + prompt;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];

    let result = await callAiProxy(messages, false);
    return result.replace(/^```python\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
}

export async function generateDocs(code) {
    // Developer Mode check removed
    const systemPrompt = "You are a Python Documentation Expert. Add professional docstrings to every function and comments to complex logic in the following code. Return ONLY the raw Python code with comments added. NO Markdown. NO explanations.";
    const userPrompt = "CODE:\n" + code;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];

    let result = await callAiProxy(messages, false);
    return result.replace(/^```python\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
}

export async function generateTests(filename, code) {
    // Developer Mode check removed
    const systemPrompt = `You are a Python QA Engineer. Generate a comprehensive unit test file for the following code using 'unittest' or 'pytest'.
    The test file should:
    1. Import the module (assume the file is named '${filename}').
    2. Contain 10-15 meaningful test cases covering edge cases and normal usage.
    3. Be complete and ready to run.
    Return ONLY the raw Python code. NO Markdown. NO explanations.`;

    const userPrompt = "FILENAME: " + filename + "\nCODE:\n" + code;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];

    let result = await callAiProxy(messages, false);
    return result.replace(/^```python\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
}

export async function explainCode(code) {
    const systemPrompt = "You are a Python Tutor. Explain the logic and flow of the following code. Focus on execution order, variable updates, and loops. Be clear and concise. Do NOT return code, only text explanation.";
    const userPrompt = "CODE:\n" + code;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];

    return await callAiProxy(messages, false);
}
