
let chatHistory = [];

export async function startTutorChat() {
    chatHistory = [
        { role: "system", content: "Friendly, Patient Python Expert who explains concepts simply to beginners." }
    ];
    return "Chat session started.";
}

export async function sendMessageToTutor(userMessage) {
    if (chatHistory.length === 0) {
        startTutorChat();
    }

    chatHistory.push({ role: "user", content: userMessage });

    try {
        const response = await fetch("/.netlify/functions/ai-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: chatHistory,
                model: "longcat-flash"
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("AI Service Error:", errorData);
            return "My brain is tired. Please wait a moment!";
        }

        const data = await response.json();

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error("Invalid AI Response:", data);
            return "I'm confused. Please try again.";
        }

        const aiMessage = data.choices[0].message.content;
        chatHistory.push({ role: "assistant", content: aiMessage });
        return aiMessage;

    } catch (error) {
        console.error("Tutor Error:", error);
        return "My brain is tired. Please wait a moment!";
    }
}
