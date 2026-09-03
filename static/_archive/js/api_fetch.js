// ==========================================
// api_fetch.js - THE ONLY FILE THAT TALKS TO THE SERVER
// ==========================================
// WHAT THIS FILE DOES:
// Wraps every HTTP request to the FastAPI backend in a small, friendly
// function. No other file is allowed to call fetch() directly - if you
// need new server data, add a function HERE.
//
// THE ENDPOINTS THIS APP USES:
//
//   getModels()   ->  GET  /api/models
//                     Returns [{id, name}, ...] for the model dropdown.
//                     Empty array when no Ollama models are installed.
//
//   getAgents()   ->  GET  /api/agents
//                     Returns [{id, name, description, mode}, ...]
//                     (one entry per folder in agent_library/).
//
//   sendChat(...) ->  POST /api/chat
//                     Sends {message, model, agent_id, history}
//                     where history = [{role, content}, ...] of earlier
//                     turns. Returns the agent's reply text.
//
//   DISCUSSIONS (server-side storage under data/discussions.json):
//   listDiscussions()        -> GET    /api/discussions
//   pushDiscussion(d)        -> POST   /api/discussions      (upsert by d.id)
//   removeDiscussionApi(id)  -> DELETE /api/discussions/{id}
//
//   HISTORY (saved messages under data/history.json):
//   listHistory()            -> GET    /api/history
//   saveToHistory(msg)       -> POST   /api/history          (upsert by msg.id)
//   removeFromHistory(id)    -> DELETE /api/history/{id}
//
//   SETTINGS (config/app_settings.json - browser defaults):
//   loadAppSettings()        -> GET  /api/settings
//   storeAppSettings(s)      -> POST /api/settings          (merge into stored)
//
//   WIZARD EXPORTS (two files per export under data/exports/):
//   exportWizardFiles(...)   -> POST /api/exports
//                               Saves {name}.md + {name}.json.
//
// FUTURE ENDPOINTS (phase 3 - when the backend grows):
//   uploadFile()        -> POST   /api/files              (real uploads)
//
// When those arrive, only the page that needs them starts calling them.
//
// HOW TO ADD A NEW SERVER CALL (the house pattern):
//   1. Copy any function below.
//   2. Rewrite its path / method / body.
//   3. Done - ui/post-sections.js buttons can bind to it immediately
//      via { label, fetch: yourNewFunction, collect: (...) => ({...}) }.

// ------------------------------------------
// SERVER LOCATION - the one knob to turn
// ------------------------------------------
//
// "" (default)  -> requests go to the SAME origin serving this page,
//                  i.e. FastAPI itself (http://127.0.0.1:8000).
// Absolute URL  -> only needed if you ever serve index.html from somewhere
//                  else (Live Server, another port...). Point it at the
//                  running backend, e.g. "http://127.0.0.1:8000".
const API_BASE_URL = "";

/**
 * ONE low-level helper that every other function in this file uses.
 *
 * What it adds on top of plain fetch():
 *   1. Prefixes the path with API_BASE_URL (see above).
 *   2. Always sends/expects JSON.
 *   3. Turns bad HTTP statuses into thrown Errors with readable messages,
 *      so callers can use try/catch instead of checking response.ok.
 *
 * path    -> e.g. "/api/models"
 * options -> optional fetch settings: {method, body, headers...}
 */
async function request(path, options = {}) {
    let response;

    try {
        response = await fetch(API_BASE_URL + path, {
            headers: { "Content-Type": "application/json" },
            ...options, // whatever the caller added wins (method, body...)
        });
    } catch (networkError) {
        // fetch() only throws here when it cannot reach the server at all
        // (server off, wrong port, no network...).
        throw new Error(
            `Cannot reach the server at "${API_BASE_URL || window.location.origin}". Is it running? (python server.py)`
        );
    }

    if (!response.ok) {
        // Example: 404 -> "Server error 404 for /api/models"
        throw new Error(`Server error ${response.status} for ${path}`);
    }

    return response.json(); // parse the JSON body
}


// ------------------------------------------
// PUBLIC FUNCTIONS - one per endpoint
// ------------------------------------------

/** Model list for dropdowns. Never throws for "no models" - returns []. */
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
 * Send one chat message and get the reply text back.
 *
 * The server keeps NO memory between requests ("stateless"), which is
 * why we must send `history` along every time. chat.js builds it from
 * the current discussion using buildApiHistory() in models.js.
 *
 * payload.message  -> the new user text (required)
 * payload.agentId  -> "" lets the server pick its default agent
 * payload.model    -> "" lets the server pick its default model
 * payload.history  -> earlier turns [{role, content}]
 *
 * Returns: the assistant's reply as a string.
 */
export async function sendChat({ message, agentId = "", model = "", history = [] }) {
    const data = await request("/api/chat", {
        method: "POST",
        body: JSON.stringify({
            message,
            model,
            agent_id: agentId, // note: server expects snake_case
            history,
        }),
    });

    return data.reply;
}


// ------------------------------------------
// DISCUSSIONS - stored on the server (data/discussions.json)
// ------------------------------------------

/** Every discussion on the server, newest-edit first is decided by callers. */
export async function listDiscussions() {
    const data = await request("/api/discussions");
    return data.discussions || [];
}

/**
 * Create OR update a discussion on the server.
 * `discussion` needs an `id`; the server stamps updatedAt itself.
 */
export async function pushDiscussion(discussion) {
    const data = await request("/api/discussions", {
        method: "POST",
        body: JSON.stringify(discussion),
    });

    if (!data.saved) {
        throw new Error(data.error || "The server refused to save the discussion.");
    }

    return data;
}

/** Permanently delete one discussion by id. */
export async function removeDiscussionApi(id) {
    const data = await request(`/api/discussions/${encodeURIComponent(id)}`, {
        method: "DELETE",
    });
    return data;
}


// ------------------------------------------
// HISTORY - saved messages (data/history.json)
// ------------------------------------------

/** Every saved message ("Save" button snapshots) from the server. */
export async function listHistory() {
    const data = await request("/api/history");
    return data.history || [];
}

/** Store one message snapshot for the History page (upsert by id). */
export async function saveToHistory(message) {
    const data = await request("/api/history", {
        method: "POST",
        body: JSON.stringify({ ...message, saved: true }),
    });

    if (!data.saved) {
        throw new Error(data.error || "The server refused to save the message.");
    }

    return data;
}

/** Remove one saved message by id ("Unsave"). */
export async function removeFromHistory(id) {
    const data = await request(`/api/history/${encodeURIComponent(id)}`, {
        method: "DELETE",
    });
    return data;
}


// ------------------------------------------
// APP SETTINGS - browser defaults (config/app_settings.json)
// Shape: { defaultAgentId, defaultModel, activeDiscussionId }
// ------------------------------------------

/** Load the stored settings object; {} when nothing was saved yet. */
export async function loadAppSettings() {
    const data = await request("/api/settings");
    return data.settings || {};
}

/**
 * Merge a partial settings object into what is stored:
 * storeAppSettings({ activeDiscussionId: "disc-1" }) keeps the rest.
 */
export async function storeAppSettings(partialSettings) {
    const data = await request("/api/settings", {
        method: "POST",
        body: JSON.stringify(partialSettings),
    });
    return data.settings || {};
}


// ------------------------------------------
// WIZARD EXPORTS - two files per export (data/exports/)
// ------------------------------------------

/**
 * Save one wizard prompt as TWO files on the server:
 *   data/exports/{name}.md    human-readable copy
 *   data/exports/{name}.json  machine-readable twin
 *
 * payload.name     -> base file name WITHOUT extension (already slugified
 *                     by ui/wizard.js; the server sanitizes it again)
 * payload.markdown -> full text for the .md file
 * payload.data     -> object stored as pretty JSON
 */
export async function exportWizardFiles({ name, markdown, data }) {
    const result = await request("/api/exports", {
        method: "POST",
        body: JSON.stringify({ name, markdown, data }),
    });

    if (!result.saved) {
        throw new Error(result.error || "The server refused to save the files.");
    }

    return result;
}
