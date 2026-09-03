// ==========================================
// logic/chat-formatter.js - BUILD THE .TXT CHAT TRANSCRIPT
// ==========================================
// Turns a ChatSession into the nicely-formatted text file body:
//
//   1. A header with the session title, agent, model, date, and the
//      number of interactions between the LLM and the user.
//   2. Each message from the conversation, labeled by speaker + time.
//
// The transcript text is what gets POSTed to /api/chat-save.

import { formatFullDate, slugify, fileStamp } from "./models.js";

/**
 * Count interactions = the number of user->assistant turn pairs
 * (each user message paired with the assistant reply that followed).
 * Falls back to counting user messages.
 */
export function countInteractions(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return 0;
    }

    let pairs = 0;

    for (let i = 1; i < messages.length; i += 1) {
        if (
            messages[i].role === "assistant" &&
            messages[i - 1].role === "user"
        ) {
            pairs += 1;
        }
    }

    // A trailing user message with no reply yet still counts as one turn.
    const last = messages[messages.length - 1];
    if (last && last.role === "user") {
        pairs += 1;
    }

    return pairs;
}

/**
 * Build the full .txt transcript string for a session.
 *
 * session -> a ChatSession instance (has .title, .agent, .model,
 *            .messages[]) - see classes/ChatSession.js
 */
export function buildTranscript(session) {
    const messages = session.messages || [];
    const interactions = countInteractions(messages);
    const divider = "=".repeat(64);
    const thin = "-".repeat(64);

    const lines = [];
    lines.push(divider);
    lines.push(`Session: ${session.title || "Untitled chat"}`);
    lines.push(`Agent:   ${session.agentName || session.agentId || "default"}`);
    lines.push(`Model:   ${session.model || "(server default)"}`);
    lines.push(`Date:    ${formatFullDate(new Date())}`);
    lines.push(`Interactions between LLM and user: ${interactions}`);
    lines.push(divider);
    lines.push("");

    messages.forEach((message) => {
        const speaker = message.role === "user"
            ? "You"
            : message.author || "AI";
        lines.push(`[${speaker}]  ${formatFullDate(message.timestamp)}`);
        lines.push(thin);
        lines.push(message.text || "");
        lines.push("");
    });

    return lines.join("\n");
}

/**
 * Build the file name that will be written on the server.
 *   "<slugified-title>-<YYYYMMDD-HHMM>.txt"
 */
export function buildTranscriptFileName(session) {
    const base = slugify(session.title || "chat") || "chat";
    return `${base}-${fileStamp()}.txt`;
}
