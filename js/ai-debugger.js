import { getCurrentAiModel } from "./settings.js";

export async function autoFixCode(code, errorMsg) {
    // No API Key needed on frontend anymore!

    const systemPrompt = "You are a Python Code Fixer. Fix the following code based on the error. \nRULES:\n1. Return ONLY raw Python code. NO Markdown. NO explanations.\n2. Fix the error while keeping the original logic.\n3. Add a comment `# FIX: <reason>` on the fixed line.";
    const userPrompt = "USER CODE:\n" + code + "\n\nERROR:\n" + errorMsg;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];

    const model = getCurrentAiModel();

    try {
        const response = await fetch("/.netlify/functions/ai-proxy", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: messages,
                model: model,
                stream: false // Disable streaming for simpler JSON parsing
            })
        });

        if (!response.ok) {
            // Handle cases where response is not JSON (e.g., 500 HTML error, 404, etc.)
            const contentType = response.headers.get("content-type");
            let errorMessage = response.statusText;

            if (contentType && contentType.includes("application/json")) {
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorData.message || errorMessage;
                } catch (e) {
                    // JSON parsing failed despite header
                    errorMessage = await response.text();
                }
            } else {
                 // Likely HTML or plain text error
                 errorMessage = await response.text();
            }

            throw new Error(`AI Error (${response.status}): ${errorMessage}`);
        }

        const data = await response.json();

        if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
             throw new Error("Invalid response structure from AI API");
        }

        let fixedCode = data.choices[0].message.content;

        // Clean Markdown backticks if present
        fixedCode = fixedCode.replace(/^```python\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();

        return fixedCode;

    } catch (error) {
        console.error("Auto-Fix Error:", error);
        throw error; // Propagate error to caller for UI handling
    }
}
