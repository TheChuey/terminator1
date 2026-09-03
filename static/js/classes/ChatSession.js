// ==========================================
// classes/ChatSession.js - ONE CHAT SESSION (single source of truth)
// ==========================================
// There is only ONE ChatSession at a time in the whole app. It talks
// to a single agent and owns:
//   - the chosen agent + model
//   - the full ordered list of messages
//   - the session title (from the first user message)
//   - helpers to send, receive, count and export the conversation
//
// It NEVER touches the DOM. Rendering/sending live in the reusable
// chat-window.js engine (classes/chat-window.js).

import {
    createMessage,
    buildApiHistory,
} from "../logic/models.js";
import {
    buildTranscript,
    buildTranscriptFileName,
    countInteractions,
} from "../logic/chat-formatter.js";

export class ChatSession {
    /**
     * @param {object} opts
     * @param {string} opts.agentId      - agent_library folder id
     * @param {string} opts.agentName    - display name
     * @param {string} opts.model        - ollama model id ("" = server default)
     */
    constructor({ agentId = "", agentName = "", model = "" } = {}) {
        this.agentId = agentId;
        this.agentName = agentName;
        this.model = model;
        this.title = "New chat";
        this.messages = [];           // ordered list of message objects
        this.startedAt = new Date().toISOString();
        this.isWaiting = false;       // true while an LLM reply is pending
    }

    /** Empty when no messages yet. */
    get isEmpty() {
        return this.messages.length === 0;
    }

    /** True when this session is bound to a real agent. */
    get hasAgent() {
        return Boolean(this.agentId);
    }

    /**
     * Add a user message. The first message titles the session
     * (truncated to 50 chars). Returns the created message.
     */
    addUserMessage(text) {
        const message = createMessage({ role: "user", author: "You", text });
        this.messages.push(message);

        if (this.messages.filter((m) => m.role === "user").length === 1) {
            this.title = this._firstWords(text, 50);
        }

        return message;
    }

    /** Add the assistant reply. Returns the created message. */
    addAssistantMessage(text, author = this.agentName || "AI") {
        const message = createMessage({
            role: "assistant",
            author,
            text: text || "(no reply)",
        });
        this.messages.push(message);
        return message;
    }

    /**
     * The list of turns sent to /api/chat: recent messages as
     * [{ role, content }, ...] (max 20 to keep requests small).
     */
    getApiHistory() {
        return buildApiHistory(this.messages);
    }

    /** Number of interactions between LLM and user (see formatter). */
    get interactionCount() {
        return countInteractions(this.messages);
    }

    /** Full .txt transcript body (date/title/interactions + messages). */
    get transcript() {
        return buildTranscript(this);
    }

    /** Suggested file name for the saved transcript. */
    get transcriptFileName() {
        return buildTranscriptFileName(this);
    }

    /** Human-friendly reset for a brand-new conversation with same agent. */
    newChat() {
        this.messages = [];
        this.title = "New chat";
        this.startedAt = new Date().toISOString();
        this.isWaiting = false;
    }

    /* ---- private ---- */

    _firstWords(text, maxChars) {
        if (!text) {
            return "New chat";
        }
        if (text.length <= maxChars) {
            return text;
        }
        return text.slice(0, maxChars).trimEnd() + "...";
    }
}
