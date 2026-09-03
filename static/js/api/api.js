// ==========================================
// api/api.js - THE ONLY FILE THAT TALKS TO THE SERVER
// ==========================================
// Every HTTP request in the app goes through this module. No other
// file is allowed to call fetch() directly.
//
// ENDPOINTS USED:
//   getModels()            -> GET  /api/models
//   getAgents()            -> GET  /api/agents
//   sendChat(...)          -> POST /api/chat
//   loadAppSettings()      -> GET  /api/settings
//   saveAppSettings(...)   -> POST /api/settings   (merges)
//   saveChatSession(...)   -> POST /api/chat-save  (writes .txt file)

// "" (default) -> requests go to the SAME origin serving this page.
const API_BASE_URL = "";

/**
 * Low-level fetch helper: JSON in/out, readable error messages.
 */
async function request(path, options = {}) {
    let response;

    try {
        response = await fetch(API_BASE_URL + path, {
            headers: { "Content-Type": "application/json" },
            ...options,
        });
    } catch (networkError) {
        throw new Error(
            `Cannot reach the server at "${API_BASE_URL || window.location.origin}". Is it running? (python server.py)`
        );
    }

    if (!response.ok) {
        throw new Error(`Server error ${response.status} for ${path}`);
    }

    return response.json();
}

/** Model list for dropdowns. Returns [] when no Ollama models. */
export async function getModels() {
    const data = await request("/api/models");
    return data.models || [];
}

/** All discovered agents. Returns [] when agent_library/ is empty. */
export async function getAgents() {
    const data = await request("/api/agents");
    return data.agents || [];
}

/**
 * Send one chat message and return the reply text.
 * The server is stateless - we send history along every time.
 */
export async function sendChat({ message, agentId = "", model = "", history = [] }) {
    const data = await request("/api/chat", {
        method: "POST",
        body: JSON.stringify({
            message,
            model,
            agent_id: agentId,
            history,
        }),
    });
    return data.reply;
}

/** Load the stored browser settings; {} when nothing saved yet. */
export async function loadAppSettings() {
    const data = await request("/api/settings");
    return data.settings || {};
}

/** Merge partial settings into what's stored (the rest survives). */
export async function saveAppSettings(partialSettings) {
    const data = await request("/api/settings", {
        method: "POST",
        body: JSON.stringify(partialSettings),
    });
    return data.settings || {};
}

/**
 * Save a chat session as a nicely-formatted .txt file on the server.
 *
 * The transcript + a suggested file name + the configured output path
 * are all sent here and written by /api/chat-save.
 */
export async function saveChatSession({
    path = "",
    fileName = "",
    title = "",
    agentName = "",
    model = "",
    content = "",
}) {
    const result = await request("/api/chat-save", {
        method: "POST",
        body: JSON.stringify({ path, fileName, title, agentName, model, content }),
    });

    if (!result.saved) {
        throw new Error(result.error || "The server refused to save the chat.");
    }

    return result; // { saved, file }
}
