// ==========================================
// models.js - THE SHAPES OF OUR DATA
// ==========================================
// WHAT THIS FILE DOES:
// Defines what a "message", a "discussion", and an "attachment" look
// like, plus small helper functions for working with them.
//
// This is the single source of truth. If you wonder "what fields does a
// message have?", the answer is in createMessage() below.
//
// A DISCUSSION is one whole conversation (like a ChatGPT conversation).
// It contains MESSAGES. Each message may point at another message via
// `parentId`, which is what makes discussions THREADED:
//
//   message A (parentId: null)      <- top level
//   ├── message B (parentId: "A")   <- reply to A
//   │   └── message C (parentId:"B")
//   └── message D (parentId: "A")   <- another reply to A

/**
 * Make a reasonably unique id like "msg-l8x2p9k3f".
 * prefix -> short label at the front ("msg", "disc", "att").
 */
export function makeId(prefix = "id") {
    return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * An attachment = metadata about ONE file the user attached.
 * We only keep facts about the file (name, size, type) - not the file
 * contents themselves.
 */
export function createAttachment({ name, size = 0, type = "" }) {
    return {
        id: makeId("att"),
        name: String(name),
        size: Number(size),
        type: String(type),
    };
}

/**
 * One message bubble in a discussion.
 *
 * discussionId -> which discussion this belongs to
 * parentId     -> id of the message this REPLIES to, or null for top level
 * role         -> "user" or "assistant" (matches what /api/chat expects)
 * author       -> display name ("You" or the agent's name)
 * text         -> the message content
 */
export function createMessage({
    discussionId,
    parentId = null,
    role,
    author,
    text,
    attachments = [],
}) {
    return {
        id: makeId("msg"),
        discussionId,
        parentId,
        role,                       // "user" | "assistant"
        author,
        text,
        attachments,                // array of createAttachment() objects
        timestamp: new Date().toISOString(),
        edited: false,              // becomes true after a successful edit
        saved: false,               // becomes true when pressed "Save"
    };
}

/**
 * A discussion groups messages about one topic.
 *
 * title     -> shown in the Discussions page and browser tab context
 * agentId   -> which agent this chat talks to ("" = server default)
 * model     -> which model to use ("" = server default)
 */
export function createDiscussion({
    title = "New discussion",
    agentId = "",
    agentName = "",
    model = "",
} = {}) {
    return {
        id: makeId("disc"),
        title,
        agentId,
        agentName,
        model,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],               // array of createMessage() objects
    };
}


// ==========================================
// HELPERS FOR WORKING WITH DISCUSSIONS
// ==========================================

/** True when the discussion has no messages yet. */
export function isEmpty(discussion) {
    return discussion.messages.length === 0;
}

/** Find a message inside a discussion by its id (or null). */
export function findMessage(discussion, messageId) {
    return discussion.messages.find((m) => m.id === messageId) || null;
}

/** All messages that are direct replies to `parentId`. */
export function childMessages(discussion, parentId) {
    return discussion.messages.filter((m) => m.parentId === parentId);
}

/**
 * Remove a message AND every reply under it (replies of replies too).
 * Returns how many messages were removed.
 *
 * How it works: repeatedly find children of removed ids until none left.
 */
export function removeMessageAndChildren(discussion, messageId) {
    let removedCount = 0;
    const doomed = [messageId];

    while (doomed.length > 0) {
        const currentId = doomed.pop();
        const index = discussion.messages.findIndex((m) => m.id === currentId);

        if (index !== -1) {
            discussion.messages.splice(index, 1); // take it out of the array
            removedCount += 1;

            // Queue up its direct replies for removal as well.
            childMessages(discussion, currentId).forEach((child) => {
                doomed.push(child.id);
            });
        }
    }

    return removedCount;
}

/**
 * Convert our rich message objects into the simple list that the
 * /api/chat endpoint expects: [{role, content}, ...]
 *
 * maxTurns limits how much history we send so requests stay small -
 * the last N messages matter most to the model anyway.
 */
export function buildApiHistory(messages, maxTurns = 20) {
    return messages
        .slice(-maxTurns)
        .map((m) => ({ role: m.role, content: m.text }));
}

/**
 * Turn an ISO timestamp into something friendly:
 * today      -> "14:05"
 * other days -> "Jun 3, 14:05"
 */
export function formatTimestamp(isoString) {
    const date = new Date(isoString);
    const now = new Date();

    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (date.toDateString() === now.toDateString()) {
        return time; // same day: just show the time
    }

    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

/** Bytes -> "4 KB", "1.2 MB" etc. for attachment chips. */
export function formatBytes(bytes) {
    if (!bytes || bytes <= 0) {
        return "";
    }

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(0)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
