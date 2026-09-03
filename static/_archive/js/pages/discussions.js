// ==========================================
// discussions.js - THE DISCUSSIONS PAGE  (mounted at #/discussions)
// ==========================================
// WHAT THIS FILE DOES:
// Turns the page into a two-pane "post and reply board":
//
//   LEFT PANE   -> every discussion stored ON THE SERVER.
//                  Click one to open it. Hover for Rename/Delete.
//   RIGHT PANE  -> the selected discussion rendered as a forum-style
//                  board: original post, nested replies, per-post
//                  action rail, and a composer to add replies.
//
// EVERY CHANGE goes through api_fetch.js (pushDiscussion /
// removeDiscussionApi / saveToHistory) - nothing is stored in the
// browser anymore. Only posting a reply stays LLM-free; use
// "Open in Chat" to talk to the agent about it.
//
// MODULES WE REUSE (this file only wires them together):
//   models.js          -> message/discussion factories + tree helpers
//   api_fetch.js       -> ALL server traffic (the house rule)
//   ui/post-sections.js-> builds the "Start a new discussion" panel
//   ui/attachments.js  -> attach button + file chips
//   ui/markdown.js     -> post text -> safe rich DOM

import { get, el, clear } from "../dom.js";
import {
    listDiscussions,
    pushDiscussion,
    removeDiscussionApi,
    saveToHistory,
    storeAppSettings,
} from "../api_fetch.js";
import {
    createDiscussion,
    createMessage,
    childMessages,
    findMessage,
    removeMessageAndChildren,
    formatTimestamp,
} from "../models.js";
import { initAttachmentPicker } from "../ui/attachments.js";
import { createPostSection } from "../ui/post-sections.js";
import { renderMarkdown } from "../ui/markdown.js";


// ------------------------------------------
// ELEMENT REFERENCES + STATE
// ------------------------------------------
// Lets filled on every mount - see renderPage() at the bottom of the
// top section. Modules load once; pages mount many times.

let listEl;
let countEl;
let boardEl;
let newConversationButton;

let discussions = [];      // mirror of what the server holds
let selectedId = null;     // which discussion is open on the board
let replyTargetId = null;  // post we are replying to (null = new top post)

let attachmentPicker = null; // created once, retargeted on re-render


// ------------------------------------------
// PAGE MOUNTING (router.js calls this on every visit)
// Markup goes FIRST into the shell's middle/bottom sections, then we
// grab refs and start loading data.
// ------------------------------------------

export async function renderPage({ middle, bottom }) {
    middle.innerHTML = `
        <section class="page">

            <header class="page-header">
                <h1>Discussions</h1>
                <p>
                    Your saved conversation board. Open one, post replies,
                    or edit posts - everything is stored on the server.
                </p>
            </header>

            <!-- Two panes: left list + right board (board.css) -->
            <div class="discussions-layout">

                <div class="discussions-panel">

                    <div class="panel-header">
                        <span class="panel-title">Conversations</span>
                        <span class="count-badge" id="discussion-count">0</span>
                    </div>

                    <div class="thread-list" id="discussion-list"></div>

                    <div class="panel-footer">
                        <button class="btn btn-primary" id="new-conversation-button" type="button">
                            &plus; New Conversation
                        </button>
                    </div>

                </div>

                <!-- Selected discussion renders here -->
                <div class="post-board" id="post-board"></div>

            </div>
        </section>
    `;

    // The composer strip lives BELOW the scrolling page content, in
    // its own shell section pinned under the middle area.
    bottom.innerHTML = `
        <div class="composer-dock" id="composer-dock"></div>
    `;

    listEl = get("#discussion-list");
    countEl = get("#discussion-count");
    boardEl = get("#post-board");
    newConversationButton = get("#new-conversation-button");

    await init();
}


// ------------------------------------------
// STARTUP
// ------------------------------------------

async function init() {
    newConversationButton.addEventListener("click", startNewConversation);

    try {
        await refreshFromServer();
    } catch (error) {
        clear(listEl);
        const box = el("div", "empty-state", `Could not load discussions: ${error.message}`);
        box.style.margin = "10px";

        const retry = el("button", "btn btn-secondary btn-small", "Retry");
        retry.type = "button";
        retry.style.marginTop = "12px";
        retry.addEventListener("click", () => init());

        box.appendChild(document.createElement("br"));
        box.appendChild(retry);
        listEl.appendChild(box);
        return;
    }

    redrawAll();
}

/** Pull the authoritative list from the server into the local mirror. */
async function refreshFromServer() {
    discussions = (await listDiscussions()).sort(byNewestFirst);
}


// ------------------------------------------
// PERSISTENCE HELPERS (all through api_fetch.js)
// ------------------------------------------

/**
 * Save one discussion to the server + remember it as the active one.
 * Updates the LOCAL mirror immediately (optimistic); network failures
 * are logged instead of blocking the UI.
 */
function persist(discussion) {
    discussion.updatedAt = new Date().toISOString();

    pushDiscussion(discussion).catch((error) => {
        console.warn("[discussions] server save failed:", error);
    });

    storeAppSettings({ activeDiscussionId: discussion.id }).catch((error) => {
        console.warn("[discussions] could not remember active id:", error);
    });
}

/** Insert-or-replace one discussion inside the local mirror. */
function upsertLocal(discussion) {
    const index = discussions.findIndex((d) => d.id === discussion.id);

    if (index === -1) {
        discussions.push(discussion);
    } else {
        discussions[index] = discussion;
    }

    discussions.sort(byNewestFirst);
}


// ------------------------------------------
// REDRAWING (always works from the local mirror)
// ------------------------------------------

function redrawAll() {
    redrawList();
    renderBoard();
}

function byNewestFirst(a, b) {
    return new Date(b.updatedAt) - new Date(a.updatedAt);
}


// ------------------------------------------
// LEFT PANE - THE CONVERSATION LIST
// ------------------------------------------

function redrawList() {
    clear(listEl);

    countEl.textContent = String(discussions.length);

    if (discussions.length === 0) {
        const empty = el(
            "div",
            "empty-state",
            "Nothing saved yet. Create one below or chat first."
        );
        empty.style.margin = "10px";
        listEl.appendChild(empty);
        return;
    }

    // Drop selections that point at deleted conversations.
    if (selectedId && !discussions.some((d) => d.id === selectedId)) {
        selectedId = null;
    }

    discussions.forEach((discussion) => {
        listEl.appendChild(buildListItem(discussion));
    });
}

/** One clickable row in the left pane. */
function buildListItem(discussion) {
    const isActive = discussion.id === selectedId;

    const row = el("div", "board-thread-item");
    if (isActive) {
        row.classList.add("active");
    }

    // Keyboard support: Tab to it, Enter/Space selects it.
    row.tabIndex = 0;
    row.setAttribute("role", "button");

    row.appendChild(el("span", "thread-icon", "\u25cb"));

    const bodyBox = el("span", "thread-item-body");
    bodyBox.appendChild(el("strong", "thread-item-name", discussion.title));
    bodyBox.appendChild(el(
        "small",
        "thread-item-meta",
        `${discussion.messages.length} post(s) \u00b7 ` +
        formatTimestamp(discussion.updatedAt)
    ));
    row.appendChild(bodyBox);

    // Small action buttons, revealed by CSS on hover/active.
    const actions = el("span", "thread-item-actions");

    actions.appendChild(makeButton("Rename", "", () => renameDiscussion(discussion)));
    actions.appendChild(makeButton("Del", "danger", () => removeDiscussion(discussion)));

    row.appendChild(actions);

    function select() {
        selectedId = discussion.id;
        replyTargetId = null;
        redrawAll();
    }

    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select();
        }
    });

    return row;
}

function renameDiscussion(discussion) {
    const newTitle = window.prompt("New title:", discussion.title);

    if (newTitle && newTitle.trim()) {
        discussion.title = newTitle.trim();
        upsertLocal(discussion);
        persist(discussion);
        redrawAll();
    }
}

function removeDiscussion(discussion) {
    const sure = window.confirm(`Delete "${discussion.title}" forever?`);

    if (!sure) {
        return;
    }

    // Optimistic: drop from the mirror first, tell the server second.
    discussions = discussions.filter((d) => d.id !== discussion.id);
    removeDiscussionApi(discussion.id).catch((error) => {
        console.warn("[discussions] server delete failed:", error);
    });

    if (selectedId === discussion.id) {
        selectedId = null;
        replyTargetId = null;
    }

    redrawAll();
}

/** ＋ New Conversation: create it and open it straight away. */
function startNewConversation() {
    const fresh = createDiscussion({ title: "New discussion" });

    selectedId = fresh.id;
    replyTargetId = null;

    upsertLocal(fresh);
    persist(fresh);

    redrawAll();
    focusComposer();
}


// ------------------------------------------
// RIGHT PANE - THE POST BOARD
// ------------------------------------------

function renderBoard() {
    clear(boardEl);

    const discussion = currentDiscussion();

    if (!discussion) {
        boardEl.appendChild(el(
            "div",
            "empty-state",
            "Select a conversation on the left, or write your first " +
                "post in the panel below."
        ));
        boardEl.style.justifyContent = "center";
        boardEl.style.display = "flex";
    } else {
        boardEl.style.display = "";
        boardEl.style.justifyContent = "";

        boardEl.appendChild(buildBoardHeader(discussion));

        // Scrolling area with all posts + nested replies.
        const scrollArea = el("div", "post-board-scroll");
        rootPosts(discussion).forEach((post) => {
            scrollArea.appendChild(buildPostElement(discussion, post));
        });
        boardEl.appendChild(scrollArea);

        // Start pinned to the newest content, like a chat would be.
        scrollArea.scrollTop = scrollArea.scrollHeight;
    }

    // The dock below the board ALWAYS has an input, whichever
    // state we are in.
    renderDock(discussion);
}


// ------------------------------------------
// COMPOSER DOCK  (below the board)
// Variant A: reply composer when a discussion is open.
// Variant B: start panel (built by ui/post-sections.js) otherwise.
// ------------------------------------------

function renderDock(discussion) {
    const dock = get("#composer-dock");

    if (!dock) {
        return;
    }

    clear(dock);
    dock.appendChild(discussion ? buildComposer() : buildStartPanel());
}

/**
 * Explicit starting point: type the first post and press the button.
 * The WHOLE panel - heading, textarea, button, status line - comes
 * from createPostSection(); no markup lives anywhere else.
 */
function buildStartPanel() {
    const section = createPostSection({
        className: "start-panel",
        title: "Start a new discussion",
        description: "Write the first post - a conversation is created for it.",
        inputs: [
            {
                id: "start-post-input",
                tag: "textarea",
                placeholder: "What do you want to discuss?",
                rows: 3,
            },
        ],
        footerNote: "The first line becomes the title.",
        buttons: [
            {
                label: "Create discussion",
                className: "btn btn-primary",
                fetch: createFromPanel,
                collect: (values) => ({
                    text: String(values["start-post-input"] || "").trim(),
                }),
                okMessage: "Discussion created.",
            },
        ],
    });

    // Enter posts here too (Shift+Enter adds a newline).
    section.input("start-post-input").addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            section.actionsRow.querySelector("button").click();
        }
    });

    return section.root;
}

/** Server-connected action behind the "Create discussion" button. */
async function createFromPanel({ text }) {
    if (!text) {
        throw new Error("Write something first.");
    }

    const discussion = createDiscussion({
        title: text.slice(0, 50),
    });

    discussion.messages.push(createMessage({
        discussionId: discussion.id,
        parentId: null,
        role: "user",
        author: "You",
        text,
    }));

    selectedId = discussion.id;
    replyTargetId = null;

    await pushDiscussion(discussion); // throws -> red status line
    storeAppSettings({ activeDiscussionId: discussion.id }).catch(() => {});

    upsertLocal(discussion);
    redrawList();   // show it in the left pane
    renderBoard();  // open board + swap dock to composer A
    focusComposer();
}

function currentDiscussion() {
    return discussions.find((d) => d.id === selectedId) || null;
}

/** Posts with parentId === null, oldest first. */
function rootPosts(discussion) {
    return discussion.messages
        .filter((m) => m.parentId === null)
        .sort(byOldestFirst);
}

function byOldestFirst(a, b) {
    return new Date(a.timestamp) - new Date(b.timestamp);
}

/** Header strip above the posts. */
function buildBoardHeader(discussion) {
    const header = el("div", "post-board-header");

    const titleBox = el("div", "board-title");
    titleBox.appendChild(el("h2", "", discussion.title));
    titleBox.appendChild(el(
        "div",
        "board-subtitle",
        `${discussion.agentName || "default agent"}` +
        ` \u00b7 ${discussion.messages.length} post(s)`
    ));
    header.appendChild(titleBox);

    const actions = el("div", "post-board-actions");

    actions.appendChild(makeButton("Open in Chat", "btn btn-primary btn-small", async () => {
        // Hand this discussion over to the chat page.
        try {
            await storeAppSettings({ activeDiscussionId: discussion.id });
        } catch (error) {
            window.alert(`Could not switch chats: ${error.message}`);
            return;
        }
        // Hash routing - no full reload, router.js swaps the page.
        window.location.hash = "#/chat";
    }));

    actions.appendChild(makeButton("Delete", "btn btn-danger btn-small", () =>
        removeDiscussion(discussion)
    ));

    header.appendChild(actions);
    return header;
}


// ------------------------------------------
// ONE POST (+ ITS REPLIES, RECURSIVELY)
// ------------------------------------------

/**
 * Build <article class="forum-post response-card"> for one message.
 * Two columns: .post-main (header/body/replies) + .post-rail (actions).
 * If the message has replies, they recurse inside .post-main.
 */
function buildPostElement(discussion, message) {
    const isAgent = message.role !== "user";

    // "response-card" kept from the original design's vocabulary;
    // visual styling lives under ".forum-post".
    const article = el("article", "forum-post response-card");
    article.dataset.messageId = message.id;

    if (isAgent) {
        article.classList.add("agent-post");
    }

    // --- LEFT COLUMN: everything about the post ---------------
    const mainCol = el("div", "post-main");

    // header: avatar, name, time, model badge
    const head = el("div", "forum-post-header");

    const avatar = el("span", "forum-avatar", initialsOf(message.author));
    avatar.classList.add(isAgent ? colorFor(message.author) : "user-avatar");
    head.appendChild(avatar);

    head.appendChild(el("strong", "forum-author", message.author));
    head.appendChild(el("span", "forum-time", formatTimestamp(message.timestamp)));

    if (message.edited) {
        head.appendChild(el("span", "forum-time", "(edited)"));
    }

    if (isAgent && discussion.model) {
        head.appendChild(buildModelBadge(discussion.model));
    }

    mainCol.appendChild(head);
    mainCol.appendChild(buildRichBody(message.text));

    // nested replies render under the body, INSIDE the main column
    const replies = childMessages(discussion, message.id).sort(byOldestFirst);

    if (replies.length > 0) {
        const repliesBox = el("div", "forum-replies");
        replies.forEach((reply) => {
            repliesBox.appendChild(buildPostElement(discussion, reply));
        });
        mainCol.appendChild(repliesBox);
    }

    article.appendChild(mainCol);

    // --- RIGHT COLUMN: the side action rail --------------------
    article.appendChild(buildPostRail(discussion, message, article));

    return article;
}

/** "Research Agent" -> "RA"; "You" -> "YO". */
function initialsOf(name) {
    const words = String(name).trim().split(/\s+/).filter(Boolean);

    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

/** Stable color per author so an agent always looks the same. */
function colorFor(author) {
    const palette = ["blue", "purple", "green"];
    let sum = 0;

    for (const character of String(author)) {
        sum += character.charCodeAt(0);
    }

    return palette[sum % palette.length];
}

/**
 * Post text rendered by ui/markdown.js - the ONE renderer used
 * everywhere (chat bubbles, board posts, history rows).
 */
function buildRichBody(text) {
    const body = el("div", "response-body");
    body.appendChild(renderMarkdown(text));
    return body;
}

/** Pill like [Qwen] colored by model family. */
function buildModelBadge(model) {
    const lower = model.toLowerCase();

    let cssClass = "";
    if (lower.includes("qwen"))    { cssClass = "qwen"; }
    else if (lower.includes("llama")) { cssClass = "llama"; }
    else if (lower.includes("mistral")) { cssClass = "mistral"; }

    // Short label: first meaningful word, e.g. "Qwen 2.5 Coder" -> "Qwen".
    const label = model.split(/[\s:.\/_-]/)[0];

    return el("span", `model-badge ${cssClass}`.trim(), label);
}


// ------------------------------------------
// POST SIDE RAIL  (Reply / Edit / Copy / Save / Delete)
// A slim vertical column on the card's right edge.
// CSS flips it to a horizontal row under the post on phones.
//
// THE RAIL IS DATA: to add a new post action, add ONE entry to
// POST_RAIL_BUTTONS below (and its handler). Nothing else changes.
// ------------------------------------------

const POST_RAIL_BUTTONS = [
    {
        label: "Reply",
        handler(discussion, message, article) {
            replyTargetId = message.id;
            showReplyBanner(message);
            focusComposer();
        },
    },
    {
        label: "Edit",
        handler(discussion, message, article) {
            startBoardEdit(article, message);
        },
    },
    {
        label: "Copy",
        async handler(discussion, message) {
            try {
                await navigator.clipboard.writeText(message.text);
            } catch {
                window.prompt("Copy this post:", message.text);
            }
        },
    },
    {
        label: "Save",
        // Server-connected: snapshot goes to data/history.json via
        // POST /api/history so it shows up on the History page.
        handler(discussion, message, article, button) {
            saveToHistory({ ...message, sourceTitle: discussion.title })
                .then(() => flashStatus(button, "Saved!"))
                .catch((error) =>
                    flashStatus(button, "Failed!", `${error.message}`)
                );
        },
    },
    {
        label: "Del",
        className: "danger",
        handler(discussion, message) {
            const sure = window.confirm("Delete this post and its replies?");

            if (!sure) {
                return;
            }

            removeMessageAndChildren(discussion, message.id);

            // If we were replying to something just removed, drop the banner.
            if (replyTargetId && !findMessage(discussion, replyTargetId)) {
                replyTargetId = null;
            }

            persist(discussion);
            renderBoard();
        },
    },
];

function buildPostRail(discussion, message, article) {
    const rail = el("div", "post-rail");

    POST_RAIL_BUTTONS.forEach((spec) => {
        const button = makeButton(
            spec.label,
            `response-action${spec.className ? ` ${spec.className}` : ""}`,
            () => spec.handler(discussion, message, article, button)
        );
        rail.appendChild(button);
    });

    return rail;
}

/** Tiny feedback on a rail button ("Saved!" / "Failed!" briefly). */
function flashStatus(button, temporaryLabel, errorMessage = "") {
    const original = button.textContent;

    button.textContent = temporaryLabel;
    button.disabled = true;

    if (errorMessage) {
        console.warn(`[discussions] ${errorMessage}`);
    }

    window.setTimeout(() => {
        button.textContent = original;
        button.disabled = false;
    }, 900);
}


/**
 * Replace a post body with a textarea + Save/Cancel buttons.
 * On confirm we update data, persist to the server, and redraw.
 */
function startBoardEdit(article, message) {
    const bodyEl = article.querySelector(".response-body");

    if (!bodyEl || article.querySelector(".inline-edit")) {
        return; // missing pieces, or already editing
    }

    bodyEl.classList.add("hidden");

    const editor = el("div", "inline-edit");
    const textarea = el("textarea");
    textarea.value = message.text;
    editor.appendChild(textarea);

    const buttons = el("div", "inline-edit-buttons");
    const saveButton = el("button", "btn btn-primary btn-small", "Save");
    const cancelButton = el("button", "btn btn-secondary btn-small", "Cancel");
    buttons.append(saveButton, cancelButton);
    editor.appendChild(buttons);

    bodyEl.insertAdjacentElement("beforebegin", editor);
    textarea.focus();

    function close() {
        editor.remove();
        bodyEl.classList.remove("hidden");
    }

    saveButton.addEventListener("click", () => {
        const newText = textarea.value.trim();

        if (!newText) {
            return; // never allow empty posts
        }

        const discussion = currentDiscussion();
        message.text = newText;
        message.edited = true;

        close();
        persist(discussion);
        renderBoard();
    });

    cancelButton.addEventListener("click", close);

    textarea.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            saveButton.click();
        }
    });
}


// ------------------------------------------
// COMPOSER (bottom of the board)
// ------------------------------------------

function buildComposer() {
    const wrapper = el("div", "composer-wrapper");

    // "Replying to ..." banner (hidden unless replying).
    const context = el("div", "reply-context hidden");
    context.id = "board-reply-context";

    const contextText = el("span");
    contextText.id = "board-reply-context-text";
    context.appendChild(document.createTextNode("Replying to "));
    context.appendChild(contextText);

    const cancelButton = makeButton("Cancel", "reply-cancel", () => {
        replyTargetId = null;
        context.classList.add("hidden");
    });
    context.appendChild(cancelButton);
    wrapper.appendChild(context);

    // Attachment chips live right above the input.
    wrapper.appendChild(el("ul", "chip-list")); // filled by attachmentPicker

    // Main row: [textarea | side function buttons]
    const composer = el("div", "composer");

    const textarea = el("textarea");
    textarea.id = "board-message-input";
    textarea.rows = 1;
    textarea.placeholder = "Write a reply...";
    composer.appendChild(textarea);

    const sideStack = el("div", "composer-side");

    // SIDE BUTTONS ARE DATA TOO: add an entry = add a button.
    // Give an entry a `fetch` + `collect` and it becomes a
    // server-connected poster automatically.
    const sideButtons = [
        {
            // No onClick: ui/attachments.js wires this one up below
            // (it needs the hidden #board-file-input + chip list).
            label: "\u002b Attach",
            title: "Attach files",
        },
        {
            label: "Tools",
            onClick() {
                alert("Tools are configured on the chat page.");
            },
        },
        {
            label: "Memory",
            onClick() {
                alert("Thread memory is stored on the server with the discussion.");
            },
        },
    ];

    let attachButton = null;

    sideButtons.forEach((spec) => {
        const button = el("button", "side-button", spec.label);
        button.type = "button";

        if (spec.title) {
            button.title = spec.title;
        }

        if (spec.onClick) {
            button.addEventListener("click", () => spec.onClick(button));
        }

        if (!attachButton && !spec.onClick) {
            attachButton = button; // first unwired button = the Attach slot
        }

        sideStack.appendChild(button);
    });

    composer.appendChild(sideStack);
    wrapper.appendChild(composer);

    // Bottom row: hint text left, labeled Post button right.
    const bottomRow = el("div", "composer-footerbar");
    bottomRow.appendChild(el(
        "span",
        "composer-hint",
        "Enter posts \u00b7 Shift+Enter adds a new line"
    ));

    const sendButton = el("button", "send-button", "Post");
    sendButton.type = "button";
    sendButton.title = "Post reply";
    bottomRow.appendChild(sendButton);

    wrapper.appendChild(bottomRow);
    wireComposer(wrapper, textarea, sendButton, context, attachButton);

    return wrapper;
}

/** Attach listeners once, using the freshly built elements. */
function wireComposer(wrapper, textarea, sendButton, context, attachButton) {
    // Attachments: the picker is created ONCE and merely re-pointed at
    // the new button/chips on every rebuild - otherwise file selections
    // would be handled multiple times.
    const chipsList = wrapper.querySelector(".chip-list");
    const fileInput = get("#board-file-input");

    if (!attachmentPicker) {
        attachmentPicker = initAttachmentPicker({
            button: attachButton,
            input: fileInput,
            list: chipsList,
        });
    } else {
        attachmentPicker.retarget({ button: attachButton, list: chipsList });
    }

    /** Push the typed reply INTO THE DISCUSSION OBJECT + TO THE SERVER. */
    async function post() {
        const text = textarea.value.trim();

        if (!text) {
            return;
        }

        const discussion = currentDiscussion();

        if (!discussion) {
            return;
        }

        discussion.messages.push(createMessage({
            discussionId: discussion.id,
            parentId: replyTargetId, // null = brand-new top-level post
            role: "user",
            author: "You",
            text,
            attachments: attachmentPicker.getAttachments(),
        }));

        // First post names an untitled discussion.
        if (discussion.messages.length === 1 &&
            discussion.title === "New discussion") {
            discussion.title = text.slice(0, 50);
        }

        replyTargetId = null;
        textarea.value = "";
        autoGrow(textarea);
        attachmentPicker.clear();

        persist(discussion);  // optimistic save to the server
        renderBoard();        // redraw posts + rebuild the dock's composer
        redrawList();         // refresh post count + timestamp in the list
        focusComposer();      // ready for the next thought
    }

    sendButton.addEventListener("click", post);

    // Enter posts; Shift+Enter makes a newline.
    textarea.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            post();
        }
    });

    // Grow the box while typing, up to the CSS max-height.
    textarea.addEventListener("input", () => autoGrow(textarea));

    // Re-show the banner after re-render if still replying.
    if (replyTargetId) {
        const discussion = currentDiscussion();
        const target = discussion && findMessage(discussion, replyTargetId);
        if (target) {
            showReplyBanner(target);
        } else {
            replyTargetId = null;
        }
    }
}

/** Textarea height follows content (up to max-height in CSS). */
function autoGrow(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
}

/** Fill + reveal the "Replying to ..." strip. */
function showReplyBanner(message) {
    const context = get("#board-reply-context");

    if (!context) {
        return;
    }

    get("#board-reply-context-text").textContent =
        `${message.author}: ${message.text.slice(0, 60)}${message.text.length > 60 ? "..." : ""}`;

    context.classList.remove("hidden");
}

function focusComposer() {
    const textarea = get("#board-message-input");
    if (textarea) {
        textarea.focus();
    }
}

/** Helper: quick element + listener. */
function makeButton(label, className, onClick) {
    const button = el("button", className, label);
    button.type = "button";

    // stopPropagation: a click inside a list row must not also select it.
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        onClick();
    });

    return button;
}
