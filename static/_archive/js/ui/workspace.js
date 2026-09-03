// ==========================================
// workspace.js - THE SHARED MAIN WORKSPACE SHELL
// ==========================================
// WHAT THIS MODULE DOES:
// Builds the right-hand column ONCE from JavaScript:
//
//   main.main
//     ├── header.agent-header       (optional - chat only today)
//     ├── section.workspace-middle  <- PAGE-SPECIFIC content goes here
//     └── section.workspace-bottom  <- page composer / dock goes here
//
// Pages never re-create this skeleton; they only fill middle/bottom
// (see pages/*.js). The markup mirrors the ORIGINAL hand-written HTML
// class-for-class and id-for-id, so the existing CSS keeps working.
//
// CHAIN POSITION:
//   index.html -> app.js -> ui/shell.js -> ui/workspace.js

import { get } from "../dom.js";


/** The top strip of the chat page (avatar, selects, buttons). */
const HEADER_HTML = `
<header class="agent-header">

    <div class="agent-title">

        <div class="avatar agent-avatar large" id="agent-avatar">AI</div>

        <div>
            <h1 id="agent-name">Loading...</h1>
            <p id="agent-description">Connecting to the server</p>
        </div>

    </div>

    <div class="header-controls">

        <label>Agent
            <select id="agent-select" aria-label="Choose an AI agent"></select>
        </label>

        <label>Model
            <select id="model-select" aria-label="Choose a model"></select>
        </label>

        <button class="btn btn-secondary btn-small" id="new-chat-button" type="button">
            New chat
        </button>

        <button class="btn btn-primary btn-small" id="wizard-open-button" type="button">
            AI Wizard
        </button>

        <span class="status hidden" id="connection-status">
            <span class="status-dot"></span> Online
        </span>

    </div>

</header>
`;


/**
 * Replace the container's content with the workspace skeleton.
 *
 * container      -> usually #main-workspace from index.html
 * opts.header    -> true renders the agent-header strip (chat only)
 *
 * Returns live references the shell/router hand to pages:
 *   { root, header, middle, bottom }
 */
export function renderWorkspace(container, { header = false } = {}) {
    if (!container) {
        console.warn("[workspace] no main-workspace container found.");
        return { root: null, header: null, middle: null, bottom: null };
    }

    container.innerHTML = `
        ${header ? HEADER_HTML : ""}
        <section class="workspace-middle" id="workspace-middle"></section>
        <section class="workspace-bottom" id="workspace-bottom"></section>
    `;

    return {
        root: container,
        header: container.querySelector(".agent-header"),
        middle: get("#workspace-middle"),
        bottom: get("#workspace-bottom"),
    };
}
