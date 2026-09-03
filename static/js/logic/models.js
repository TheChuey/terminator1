// ==========================================
// logic/models.js - DATA SHAPES + PURE HELPERS
// ==========================================
// Factories for the data this app works with, plus small pure
// helpers. This is the SINGLE source of truth for what an agent,
// a chat message, and a chat session look like.

/** Make a reasonably unique id like "msg-l8x2p9k3f". */
export function makeId(prefix = "id") {
    return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * One bubble in a chat session.
 * role: "user" | "assistant"
 */
export function createMessage({ role, author, text }) {
    return {
        id: makeId("msg"),
        role,
        author,
        text,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Turn the rich message array into the simple list the /api/chat
 * endpoint expects: [{ role, content }, ...]  (last N turns).
 */
export function buildApiHistory(messages, maxTurns = 20) {
    return messages
        .slice(-maxTurns)
        .map((m) => ({ role: m.role, content: m.text }));
}

/** Friendly timestamp: today -> "14:05", else "Jun 3, 14:05". */
export function formatTimestamp(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (date.toDateString() === now.toDateString()) {
        return time;
    }

    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

/** Full readable date+time for transcripts: "Aug 31, 2026, 2:05 PM". */
export function formatFullDate(isoString) {
    const date = new Date(isoString || Date.now());
    return date.toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** Filesystem-safe file stamp: "20260831-1405". */
export function fileStamp(date = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
        `-${pad(date.getHours())}${pad(date.getMinutes())}`
    );
}

/** "My Great Title!" -> "my-great-title" (file-safe). */
export function slugify(value) {
    return String(value)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}
