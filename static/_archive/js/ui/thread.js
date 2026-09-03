// ==========================================
// thread.js - DRAWING THE MESSAGE THREAD
// ==========================================
// WHAT THIS FILE DOES:
// Turns discussion DATA (plain objects) into message bubbles on screen,
// including nested replies (threads).
//
// Message text goes through ui/markdown.js so ```fences```, **bold**,
// lists etc. render the same way everywhere in the app.
//
// It knows HOW to draw. It does NOT know WHERE messages come from or
// what buttons do - chat.js connects those pieces together.
//
// Drawing rules:
//   - Top-level messages (parentId === null) render in time order.
//   - Replies render INDENTED inside their parent's
//     ".message-replies" box, recursively.

import { el, clear } from "../dom.js";
import { childMessages, formatTimestamp, formatBytes } from "../models.js";
import { renderMarkdown } from "./markdown.js";


// ------------------------------------------
// BUILDING BLOCKS
// ------------------------------------------

/** The round initials bubble ("U" for user, "AI" for agents). */
function buildAvatar(message) {
    const avatar = el("div", "avatar");

    if (message.role === "assistant") {
        avatar.classList.add("agent-avatar");
        avatar.textContent = "AI";
    } else {
        avatar.textContent = "U";
    }

    return avatar;
}

/** Name + timestamp (+ "edited" tag) above the text. */
function buildHeader(message) {
    const header = el("div", "message-header");

    header.appendChild(el("strong", "", message.author));

    const meta = el("span", "", formatTimestamp(message.timestamp));
    header.appendChild(meta);

    if (message.edited) {
        header.appendChild(el("span", "edited-tag", "(edited)"));
    }

    return header;
}

/** The markdown-rendered text plus attachment chips. */
function buildBody(message) {
    const body = el("div", "message-body");

    // ui/markdown.js: paragraphs, ```fences```, **bold**, lists...
    // built as safe DOM nodes (never innerHTML).
    body.appendChild(renderMarkdown(message.text));

    if (message.attachments && message.attachments.length > 0) {
        const chips = el("ul", "chip-list");

        message.attachments.forEach((attachment) => {
            const label = [attachment.name, formatBytes(attachment.size)]
                .filter(Boolean)
                .join(" - ");

            chips.appendChild(el("li", "chip", label));
        });

        body.appendChild(chips);
    }

    return body;
}


// ------------------------------------------
// ONE MESSAGE (recursive: draws its replies too)
// ------------------------------------------

/**
 * Create the <article> for one message and everything under it.
 *
 * buildActions -> function(message) that returns an actions row element
 *                 (or nothing). Provided by message-actions.js via chat.js.
 */
export function createMessageElement(discussion, message, buildActions) {
    const article = el("article", "message");

    article.dataset.messageId = message.id;      // lets us find it later
    article.dataset.role = message.role;

    article.classList.add(
        message.role === "user" ? "user-message" : "agent-message"
    );

    article.appendChild(buildAvatar(message));

    const content = el("div", "message-content");
    content.appendChild(buildHeader(message));
    content.appendChild(buildBody(message));

    // Action buttons (Reply / Save / Edit...). We hand the message over
    // and let the caller decide which buttons exist.
    if (typeof buildActions === "function") {
        const actions = buildActions(message);

        if (actions) {
            content.appendChild(actions);
        }
    }

    // Recursively draw direct replies INSIDE this article.
    const children = childMessages(discussion, message.id).sort(byTimestamp);

    if (children.length > 0) {
        const repliesBox = el("div", "message-replies");
        children.forEach((child) => {
            repliesBox.appendChild(createMessageElement(discussion, child, buildActions));
        });
        content.appendChild(repliesBox);
    }

    article.appendChild(content);
    return article;
}

/** Sort helper: oldest first. */
function byTimestamp(a, b) {
    return new Date(a.timestamp) - new Date(b.timestamp);
}


// ------------------------------------------
// WHOLE THREAD
// ------------------------------------------

/**
 * Redraw the entire thread from data.
 * Simple and reliable: wipe the container, draw every top-level message.
 */
export function renderThread(threadElement, discussion, buildActions) {
    clear(threadElement);

    if (discussion.messages.length === 0) {
        threadElement.appendChild(buildWelcome());
        return;
    }

    const topLevel = discussion.messages
        .filter((m) => m.parentId === null)
        .sort(byTimestamp);

    topLevel.forEach((message) => {
        threadElement.appendChild(
            createMessageElement(discussion, message, buildActions)
        );
    });
}

/** Friendly placeholder shown when the discussion is empty. */
function buildWelcome() {
    const box = el("div", "thread-welcome");
    box.appendChild(el("h2", "", "Start the conversation"));
    box.appendChild(
        el(
            "p",
            "",
            "Type below, pick a task with the AI Wizard, or open an older " +
                "discussion from the sidebar."
        )
    );
    return box;
}

/** Add one freshly created message without redrawing everything. */
export function appendMessage(threadElement, discussion, message, buildActions) {
    // Remove the welcome box if it is still showing.
    const welcome = threadElement.querySelector(".thread-welcome");

    if (welcome) {
        welcome.remove();
    }

    threadElement.appendChild(
        createMessageElement(discussion, message, buildActions)
    );

    scrollToBottom(threadElement);
}


// ------------------------------------------
// SMALL UTILITIES
// ------------------------------------------

/** Scroll a container so its last content is visible. */
export function scrollToBottom(threadElement) {
    threadElement.scrollTop = threadElement.scrollHeight;
}

/** Show the pulsing "..." bubble while waiting for the agent. */
export function showTypingIndicator(threadElement) {
    removeTypingIndicator(threadElement); // never show two at once

    const typing = el("div", "message agent-message typing-message");
    typing.id = "typing-indicator";

    typing.appendChild(buildTypingAvatar());

    const content = el("div", "message-content");
    const dots = el("div", "typing");
    dots.appendChild(el("span"));
    dots.appendChild(el("span"));
    dots.appendChild(el("span"));
    content.appendChild(el("p", "", "Thinking..."));
    content.appendChild(dots);
    typing.appendChild(content);

    threadElement.appendChild(typing);
    scrollToBottom(threadElement);
}

function buildTypingAvatar() {
    const avatar = el("div", "avatar agent-avatar", "AI");
    return avatar;
}

/** Take the typing bubble away again. */
export function removeTypingIndicator(threadElement) {
    const indicator = threadElement.querySelector("#typing-indicator");

    if (indicator) {
        indicator.remove();
    }
}
