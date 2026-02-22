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

    const { messages, model, stream: shouldStream = true } = body;

    // 4. Validate Payload
    if (!messages || !Array.isArray(messages)) {
        console.error("Validation Error: Missing or invalid 'messages'");
        return { statusCode: 400, body: JSON.stringify({ error: "Missing or invalid 'messages' in request body" }) };
    }

    // --- Revised Logic: Fetch First, Stream Later ---
    try {
        console.log(`Sending request to LongCat API (Model: ${model || "LongCat-Flash-Lite"}, Stream: ${shouldStream})...`);

        const response = await fetch("https://api.longcat.chat/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: model || "LongCat-Flash-Lite",
                messages: messages,
                stream: shouldStream // Respect client preference
            })
        });

        // 5. Check Upstream Status
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Upstream API Error (${response.status}):`, errorText);
            // Return JSON Error Response directly (No Stream)
            return {
                statusCode: response.status >= 500 ? 502 : response.status,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: `Upstream API Error: ${response.status} - ${errorText}` })
            };
        }

        // 6. Handle Response based on Mode
        if (shouldStream) {
            // Success - Pipe the Stream
            const streamBody = new ReadableStream({
                async start(controller) {
                    try {
                        const reader = response.body.getReader();
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            controller.enqueue(value);
                        }
                        controller.close();
                    } catch (error) {
                        console.error("Stream Pipe Error:", error);
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
        } else {
            // Non-Streaming Mode: Return JSON directly
            const data = await response.json();
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            };
        }

    } catch (error) {
        console.error("Internal Proxy Error:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: `Internal Server Error: ${error.message}` })
        };
    }
});
