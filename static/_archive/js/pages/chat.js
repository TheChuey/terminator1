// ==========================================
// chat.js - THE CHAT PAGE  (mounted at #/chat by router.js)
// ==========================================
// WHAT THIS FILE DOES:
// This is the "conductor" of the main chat screen. It connects every
// other module together:
//
//   ui/shell.js         -> shared sidebar + workspace (via app.js)
//   api_fetch.js        -> server I/O: models/agents/chat PLUS all
//                          storage (data/*.json + app_settings.json)
//   models.js           -> creates message/discussion objects
//   ui/thread.js        -> draws messages (uses ui/markdown.js)
//   ui/message-actions.js -> builds Reply/Save/Edit/Delete buttons
//   ui/attachments.js   -> file chips above the input
//   ui/wizard.js        -> the prompt-builder pop-up (+ .md/.json export)
//
// MOUNT CONTRACT (every page follows it - see routes.js):
//   router.js calls renderPage({middle, bottom}) on EVERY visit.
//   We inject our markup into middle/bottom FIRST, then grab element
//   refs and wire events. Modules load once; pages mount many times.
//
// FLOW OF ONE MESSAGE:
//   user types -> sendMessage()
//     -> createMessage() object stored in `discussion`
//     -> drawn on screen instantly
//     -> typing indicator appears
//     -> sendChat() posts text + recent history to /api/chat
//     -> reply arrives -> assistant message created + drawn +
//        pushDiscussion() saves the whole conversation to the server
//
// The chat LLM is STATELESS: it remembers nothing between requests.
// That is why this file sends history each time. STORAGE is not - the
// discussion lives on the server, keyed by id.

import { get } from "../dom.js";
import {
    createDiscussion,
    createMessage,
    findMessage,
    removeMessageAndChildren,
    buildApiHistory,
} from "../models.js";
import {
    getModels,
    getAgents,
    sendChat,
    listDiscussions,
    pushDiscussion,
    saveToHistory,
    removeFromHistory,
    loadAppSettings,
    storeAppSettings,
} from "../api_fetch.js";
import {
    renderThread,
    appendMessage,
    scrollToBottom,
    showTypingIndicator,
    removeTypingIndicator,
} from "../ui/thread.js";
import { buildMessageActions } from "../ui/message-actions.js";
import { initAttachmentPicker } from "../ui/attachments.js";
import { initWizard, openWizard } from "../ui/wizard.js";


// ------------------------------------------
// ELEMENT REFERENCES
// ------------------------------------------
// These are LET variables filled by grabRefs() on every mount - the
// markup only exists after renderPage() has injected it. Modules load
// once; pages mount many times, so refs must refresh each visit.

let threadEl;
let inputEl;
let sendButton;
let agentSelect;
let modelSelect;
let newChatButton;
let wizardOpenButton;
let connectionStatus;
let agentNameEl;
let agentDescEl;

// Reply-context banner ("Replying to ...").
let replyContextEl;
let replyContextNameEl;
let replyCancelButton;

function grabRefs() {
    threadEl = get("#thread");
    inputEl = get("#message-input");
    sendButton = get("#send-button");
    agentSelect = get("#agent-select");
    modelSelect = get("#model-select");
    newChatButton = get("#new-chat-button");
    wizardOpenButton = get("#wizard-open-button");
    connectionStatus = get("#connection-status");
    agentNameEl = get("#agent-name");
    agentDescEl = get("#agent-description");

    replyContextEl = get("#reply-context");
    replyContextNameEl = get("#reply-context-name");
    replyCancelButton = get("#reply-cancel-button");
}


// ------------------------------------------
// PAGE MOUNTING (router.js calls this on EVERY visit to #/chat)
// Inject-first: the shell gives us middle/bottom, we fill them, and
// ONLY THEN do element refs / listeners make sense.
// ------------------------------------------

export async function renderPage({ middle, bottom }) {
    middle.innerHTML = `
        <section class="thread" id="thread" aria-live="polite"></section>
    `;

    bottom.innerHTML = `
        <section class="reply-area">

            <div class="reply-context hidden" id="reply-context">
                Replying to <strong id="reply-context-name"></strong>
                <button class="reply-cancel" id="reply-cancel-button" type="button">Cancel</button>
            </div>

            <!-- Chips for files chosen with the Attach button -->
            <ul class="chip-list" id="attachment-list"></ul>

            <textarea
                id="message-input"
                placeholder="Message the AI agent..."
                aria-label="Message"
            ></textarea>

            <div class="reply-actions">

                <button class="btn btn-secondary" id="attach-button" type="button">
                    Attach
                </button>

                <span class="reply-hint">Enter sends - Shift + Enter adds a new line</span>

                <button class="btn btn-primary" id="send-button" type="button">
                    Send
                </button>

            </div>

        </section>
    `;

    await init();
}


// ------------------------------------------
// APP STATE (lives only in this file)
// ------------------------------------------

let agents = [];          // list from GET /api/agents
let discussion = null;    // the CURRENT conversation object
let replyTargetId = null; // message id we are replying to (or null)
let isWaitingForReply = false; // blocks double-sends


// ------------------------------------------
// STARTUP
// ------------------------------------------

async function init() {
    grabRefs();
    setupAttachments();
    setupWizard();
    bindComposerEvents();

    // 1. Fill dropdowns and remember what exists.
    const serverOk = await loadServerLists();

    // 2. Restore the last open discussion from the SERVER - or start a
    //    fresh one using the defaults stored on the Settings page.
    try {
        const settings = await loadAppSettings();
        const stored = settings.activeDiscussionId
            ? await findStoredDiscussion(settings.activeDiscussionId)
            : null;

        if (stored) {
            discussion = stored;
        } else {
            agentSelect.value = settings.defaultAgentId || "";
            modelSelect.value = settings.defaultModel || "";
            discussion = makeNewDiscussion();
        }
    } catch (error) {
        // Storage endpoints unreachable - still allow chatting fresh.
        console.warn("[chat] could not restore the session:", error);
        discussion = makeNewDiscussion();
    }

    applyAgentSelectionFromDiscussion();
    redrawThread();

    if (serverOk) {
        connectionStatus.classList.remove("hidden"); // show green dot
    }

    inputEl.focus();
}

/** Fetch all discussions and return the one matching `id` (or null). */
async function findStoredDiscussion(id) {
    const all = await listDiscussions();
    return all.find((d) => d.id === id) || null;
}


/**
 * Populate Agent + Model selects from the server.
 * Returns true when both lists arrived fine.
 */
async function loadServerLists() {
    try {
        const [modelList, agentList] = await Promise.all([
            getModels(),
            getAgents(),
        ]);

        agents = agentList;

        fillSelect(modelSelect, modelList.map((m) => ({
            value: m.id,
            label: m.name,
        })), "(server default)");

        fillSelect(agentSelect, agentList.map((a) => ({
            value: a.id,
            label: a.name,
        })), "(server default)");

        return true;
    } catch (error) {
        // Server down / endpoint broken: degrade politely.
        agentNameEl.textContent = "Offline";
        agentDescEl.textContent = error.message;
        console.error("[chat] Could not reach server:", error);
        return false;
    }
}

/** Helper: put option entries into a <select>. */
function fillSelect(selectElement, entries, emptyLabel) {
    selectElement.replaceChildren();

    // First option = "no preference" (empty value).
    selectElement.appendChild(new Option(emptyLabel, ""));

    entries.forEach((entry) => {
        selectElement.appendChild(new Option(entry.label, entry.value));
    });
}


// ------------------------------------------
// DISCUSSION HELPERS
// ------------------------------------------

/** Fresh conversation using whatever agent/model are selected. */
function makeNewDiscussion() {
    const selectedAgent = agents.find((a) => a.id === agentSelect.value);

    const fresh = createDiscussion({
        title: "New discussion",
        agentId: agentSelect.value,
        agentName: selectedAgent ? selectedAgent.name : "",
        model: modelSelect.value,
    });

    persist(); // store it immediately so it shows on Discussions page
    return fresh;
}

/** Save current discussion on the server + remember it as "last opened". */
function persist() {
    pushDiscussion(discussion).catch((error) => {
        console.warn("[chat] server save failed:", error);
    });

    storeAppSettings({ activeDiscussionId: discussion.id }).catch((error) => {
        console.warn("[chat] could not remember active id:", error);
    });
}

/** Update header text + selects to match the current discussion. */
function applyAgentSelectionFromDiscussion() {
    agentSelect.value = discussion.agentId || "";
    modelSelect.value = discussion.model || "";
    updateHeader();
}

function updateHeader() {
    const selected = agents.find((a) => a.id === (discussion.agentId || ""));

    if (selected) {
        agentNameEl.textContent = selected.name;
        agentDescEl.textContent = selected.description;
    } else {
        agentNameEl.textContent = "AI Factory Chat";
        agentDescEl.textContent = "Default agent - pick one to specialize.";
    }
}


// ------------------------------------------
// DRAWING
// ------------------------------------------

function redrawThread() {
    renderThread(threadEl, discussion, buildActionsFor);
}

/**
 * Given a message, produce its action button row.
 * This is handed to thread.js, which calls it per message.
 */
function buildActionsFor(message) {
    return buildMessageActions(message, {
        onReply(messageToReplyTo) {
            replyTargetId = messageToReplyTo.id;
            replyContextNameEl.textContent = `${messageToReplyTo.author}: ${firstWords(messageToReplyTo.text, 40)}`;
            replyContextEl.classList.remove("hidden");
            inputEl.focus();
        },

        async onSaveToggle(messageToToggle) {
            // Saved copies live on the server (History page reads them
            // from /api/history). Toggle = POST or DELETE there.
            try {
                if (messageToToggle.saved) {
                    await removeFromHistory(messageToToggle.id);
                    messageToToggle.saved = false;
                } else {
                    await saveToHistory({
                        ...messageToToggle,
                        sourceTitle: discussion.title, // for the History page
                    });
                    messageToToggle.saved = true;
                }
            } catch (error) {
                console.warn("[chat] save toggle failed:", error);
                return; // keep the old flag when the server refused
            }

            persist();      // update the flag inside the stored discussion too
            redrawThread(); // refresh Save <-> Unsave label
        },

        onDelete(messageToDelete) {
            const confirmed = window.confirm(
                "Delete this message and all replies under it?"
            );

            if (!confirmed) {
                return;
            }

            removeMessageAndChildren(discussion, messageToDelete.id);

            if (replyTargetId && !findMessage(discussion, replyTargetId)) {
                cancelReply(); // the message we replied to is gone
            }

            persist();
            redrawThread();
        },

        onEditFinish(messageToEdit, newText) {
            messageToEdit.text = newText;
            messageToEdit.edited = true;
            persist();
            redrawThread();
        },
    });
}

/** First N characters of a string, no word chopping mid-way. */
function firstWords(text, maxChars) {
    if (text.length <= maxChars) {
        return text;
    }
    return text.slice(0, maxChars).trimEnd() + "...";
}
function cancelReply() {
    replyTargetId = null;
    replyContextEl.classList.add("hidden");
}


// ------------------------------------------
// SENDING A MESSAGE
// ------------------------------------------

async function sendMessage() {
    const text = inputEl.value.trim();

    if (!text || isWaitingForReply) {
        return; // nothing to send, or still waiting on the previous reply
    }

    // Build the user's message object and add it to the discussion.
    const userMessage = createMessage({
        discussionId: discussion.id,
        parentId: replyTargetId,      // null unless replying
        role: "user",
        author: "You",
        text,
        attachments: attachmentPicker.getAttachments(),
    });

    discussion.messages.push(userMessage);

    // First message names the discussion for the sidebar list.
    if (discussion.messages.length === 1) {
        discussion.title = firstWords(text, 50);
        document.title = `${discussion.title} - AI Factory`;
    }

    cancelReply();
    inputEl.value = "";
    attachmentPicker.clear();
    persist();
    appendMessage(threadEl, discussion, userMessage, buildActionsFor);

    // Ask the agent. Everything below happens AFTER the message shows.
    await requestReply();
}

async function requestReply() {
    isWaitingForReply = true;
    sendButton.disabled = true;
    showTypingIndicator(threadEl);

    try {
        const replyText = await sendChat({
            message: discussion.messages[discussion.messages.length - 1].text,
            agentId: discussion.agentId,
            model: discussion.model,
            history: buildApiHistory(discussion.messages),
        });

        const lastUserMessage = findLastUserMessage();
        const agentMessage = createMessage({
            discussionId: discussion.id,
            // Same parent as the question = the answer appears directly
            // under it inside the same branch.
            parentId: lastUserMessage ? lastUserMessage.parentId : null,
            role: "assistant",
            author: discussion.agentName || "AI",
            text: replyText,
        });

        discussion.messages.push(agentMessage);
        persist();
        removeTypingIndicator(threadEl);
        appendMessage(threadEl, discussion, agentMessage, buildActionsFor);
    } catch (error) {
        removeTypingIndicator(threadEl);

        // Show failures as an agent bubble so users always see why
        // nothing happened.
        const errorNote = createMessage({
            discussionId: discussion.id,
            parentId: null,
            role: "assistant",
            author: "System",
            text: `Sorry - that failed. ${error.message}`,
        });
        appendMessage(threadEl, discussion, errorNote, buildActionsFor);
    } finally {
        // Runs whether the request worked or failed.
        isWaitingForReply = false;
        sendButton.disabled = false;
        inputEl.focus();
    }
}

/** Most recent user-turn message (used for history threading). */
function findLastUserMessage() {
    for (let i = discussion.messages.length - 1; i >= 0; i -= 1) {
        if (discussion.messages[i].role === "user") {
            return discussion.messages[i];
        }
    }
    return null;
}


// ------------------------------------------
// WIRING EVENTS (runs once at startup)
// ------------------------------------------

let attachmentPicker;

function setupAttachments() {
    const parts = {
        button: get("#attach-button"),     // fresh node on every mount
        input: get("#file-input"),         // PERSISTS in index.html
        list: get("#attachment-list"),     // fresh node on every mount
    };

    // The hidden #file-input is the same node across mounts, so we
    // create the picker ONCE and retarget button/list afterwards -
    // otherwise change-listeners would stack up and files would be
    // added multiple times. (Same pattern as pages/discussions.js.)
    if (!attachmentPicker) {
        attachmentPicker = initAttachmentPicker(parts);
    } else {
        attachmentPicker.retarget(parts);
    }
}

let wizardBound = false;

function setupWizard() {
    // The wizard modal nodes live in index.html and never die, so its
    // internal listeners must be bound exactly ONCE; re-binding on a
    // second visit would make Back/Next fire twice.
    if (!wizardBound) {
        initWizard(
            {
                overlay: get("#wizard-overlay"),
                steps: get("#wizard-steps"),
                body: get("#wizard-body"),
                back: get("#wizard-back-button"),
                next: get("#wizard-next-button"),
                exportButton: get("#wizard-export-button"),
                close: get("#wizard-close-button"),
            },
            function usePrompt(promptText) {
                // Drop the finished prompt into the CURRENT composer.
                // Resolved live (not captured) because the textarea is
                // rebuilt every time this page mounts.
                const box = get("#message-input");

                if (!box) {
                    return;
                }

                box.value = promptText;
                cancelReply();
                box.focus();
            }
        );

        wizardBound = true;
    }

    // The OPEN button is fresh markup each mount - safe to bind now.
    wizardOpenButton.addEventListener("click", openWizard);
}

function bindComposerEvents() {
    sendButton.addEventListener("click", sendMessage);

    inputEl.addEventListener("keydown", (event) => {
        // Enter sends. Shift+Enter inserts a newline instead.
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    replyCancelButton.addEventListener("click", cancelReply);

    // Changing agent/model applies right away and renames the header.
    agentSelect.addEventListener("change", () => {
        discussion.agentId = agentSelect.value;
        const selected = agents.find((a) => a.id === agentSelect.value);
        discussion.agentName = selected ? selected.name : "";
        updateHeader();
        persist();
    });

    modelSelect.addEventListener("change", () => {
        discussion.model = modelSelect.value;
        persist();
    });

    newChatButton.addEventListener("click", () => {
        discussion = makeNewDiscussion();
        applyAgentSelectionFromDiscussion();
        cancelReply();
        redrawThread();
        inputEl.focus();
    });
}
