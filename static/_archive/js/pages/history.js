// ==========================================
// history.js - THE "HISTORY" PAGE  (mounted at #/history)
// ==========================================
// WHAT THIS FILE DOES:
// Shows every message the user pressed "Save" on during a chat or on
// the Discussions board. The snapshots live ON THE SERVER in
// data/history.json (GET /api/history), so they survive browsers.
//
// Each saved copy is independent: even if the original discussion is
// edited or deleted, this page still shows exactly what was saved.
//
// Actions per entry: Copy text | Unsave (DELETE /api/history/{id}) |
// Open source discussion (when it still exists).

import { get, el, clear } from "../dom.js";
import {
    listHistory,
    removeFromHistory,
    listDiscussions,
    storeAppSettings,
} from "../api_fetch.js";
import { formatTimestamp } from "../models.js";
import { renderMarkdown } from "../ui/markdown.js";

// Filled on every mount by renderPage().
let listEl;
let statusArea;

let knownDiscussionIds = new Set(); // which sources still exist


// ------------------------------------------
// PAGE MOUNTING (router.js calls this on every visit)
// ------------------------------------------

export async function renderPage({ middle }) {
    middle.innerHTML = `
        <section class="page">

            <header class="page-header">
                <h1>History</h1>
                <p>
                    Messages you saved from chats and discussions.
                    Saved copies never change, even if the original does.
                </p>
            </header>

            <div id="history-status-area"></div>
            <div id="saved-list"></div>

        </section>
    `;

    listEl = get("#saved-list");
    statusArea = get("#history-status-area");

    await init();
}


async function init() {
    redrawAll();
}

/** Pull history + discussion ids from the server, then draw. */
async function redrawAll() {
    clear(listEl);
    clear(statusArea);
    listEl.appendChild(el("div", "empty-state", "Loading..."));

    try {
        const [savedMessages, discussions] = await Promise.all([
            listHistory(),
            listDiscussions(), // only to know which "Open source" targets exist
        ]);

        knownDiscussionIds = new Set(discussions.map((d) => d.id));
        drawList(savedMessages);
    } catch (error) {
        showError(error);
    }
}

function drawList(savedMessages) {
    clear(listEl);
    clear(statusArea);

    const sorted = [...savedMessages].sort(byNewestFirst);

    if (sorted.length === 0) {
        statusArea.appendChild(el(
            "div",
            "empty-state",
            "Nothing saved yet. Use the Save button under a message in chat or on the Discussions board."
        ));
        return;
    }

    sorted.forEach(drawRow);
}

function drawRow(message) {
    const panel = el("article", "panel");

    // Who wrote it, when, and from which discussion.
    const meta = el(
        "p",
        "",
        `${message.author} - ${formatTimestamp(message.timestamp)}` +
        (message.sourceTitle ? ` - from "${message.sourceTitle}"` : "")
    );
    meta.style.color = "var(--color-text-muted)";
    meta.style.fontSize = "13px";

    // The saved message rendered with the shared markdown renderer
    // (same look as chat bubbles and board posts).
    const body = el("div", "response-body");
    body.appendChild(renderMarkdown(message.text));

    panel.appendChild(meta);
    panel.appendChild(body);

    // Buttons row.
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginTop = "10px";

    // --- Copy -------------------------------------------------
    actions.appendChild(makeButton("Copy", "btn btn-secondary btn-small", async () => {
        try {
            await navigator.clipboard.writeText(message.text);
        } catch {
            window.prompt("Copy this message:", message.text);
        }
    }));

    // --- Unsave (server delete) --------------------------------
    actions.appendChild(makeButton("Unsave", "btn btn-danger btn-small", async () => {
        try {
            await removeFromHistory(message.id);
        } catch (error) {
            window.alert(`Could not unsave: ${error.message}`);
            return;
        }
        redrawAll(); // refresh the whole list from the server
    }));

    // --- Open source discussion (only when it still exists) ----
    if (message.discussionId && knownDiscussionIds.has(message.discussionId)) {
        actions.appendChild(makeButton("Open source", "btn btn-secondary btn-small", async () => {
            // Point the chat page at that discussion, then go there.
            try {
                await storeAppSettings({ activeDiscussionId: message.discussionId });
            } catch (error) {
                window.alert(`Could not switch chats: ${error.message}`);
                return;
            }
            window.location.hash = "#/chat";
        }));
    }

    panel.appendChild(actions);
    listEl.appendChild(panel);
}

function showError(error) {
    clear(listEl);
    clear(statusArea);

    const box = el("div", "empty-state");
    box.textContent = `Could not load history: ${error.message}`;

    const retry = el("button", "btn btn-secondary btn-small", "Retry");
    retry.type = "button";
    retry.style.marginTop = "12px";
    retry.addEventListener("click", () => redrawAll());

    box.appendChild(document.createElement("br"));
    box.appendChild(retry);
    statusArea.appendChild(box);
}

/** Sort helper: newest saves first. */
function byNewestFirst(a, b) {
    return new Date(b.savedAt || b.timestamp) - new Date(a.savedAt || a.timestamp);
}

/** Tiny helper: button with text + click behavior. */
function makeButton(label, className, onClick) {
    const button = el("button", className, label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
}
