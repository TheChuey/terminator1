// ==========================================
// agents.js - THE "AI AGENTS" PAGE  (mounted at #/agents)
// ==========================================
// WHAT THIS FILE DOES:
// Asks the server which agents exist (GET /api/agents) and draws one
// card per agent into the shared workspace's MIDDLE section.
// Pressing "Start chat" remembers the chosen agent ON THE SERVER
// (POST /api/settings), creates a fresh discussion there
// (POST /api/discussions), and jumps to the chat page with it open.
//
// MOUNT CONTRACT: router.js calls renderPage({middle}) on every visit.
// Markup first, refs second, behavior third - like every page.

import { get, el, clear } from "../dom.js";
import {
    getAgents,
    pushDiscussion,
    storeAppSettings,
} from "../api_fetch.js";
import { createDiscussion } from "../models.js";

// Filled by renderPage() on every mount.
let grid;
let statusArea;


export async function renderPage({ middle }) {
    middle.innerHTML = `
        <section class="page">

            <header class="page-header">
                <h1>AI Agents</h1>
                <p>
                    Every agent found in the server's agent_library folder.
                    Pick one and start a chat with it.
                </p>
            </header>

            <!-- drawCards() fills this grid with one card per agent -->
            <div class="card-grid" id="agent-grid"></div>

            <!-- Shown when the list is empty or the server is unreachable -->
            <div id="agent-status-area"></div>

        </section>
    `;

    grid = get("#agent-grid");
    statusArea = get("#agent-status-area");

    await init();
}


async function init() {
    try {
        const agents = await getAgents();

        if (agents.length === 0) {
            showEmpty("No agents found. Add a folder to agent_library/ on the server and restart it.");
            return;
        }

        drawCards(agents);
    } catch (error) {
        showError(error.message);
    }
}

function drawCards(agents) {
    clear(grid);

    agents.forEach((agent) => {
        const card = el("article", "card");

        card.appendChild(el("h3", "", agent.name));

        if (agent.mode) {
            card.appendChild(el("span", "badge", agent.mode));
        }

        card.appendChild(el("p", "", agent.description || "No description provided."));

        const startButton = el("button", "btn btn-primary btn-small", "Start chat");
        startButton.type = "button";

        // Clicking Start chat:
        //   1. remember the agent as the default (server settings),
        //   2. create a FRESH discussion with that agent (on the server),
        //   3. jump to the chat page.
        startButton.addEventListener("click", async () => {
            try {
                await storeAppSettings({ defaultAgentId: agent.id });

                const fresh = createDiscussion({
                    title: `Chat with ${agent.name}`,
                    agentId: agent.id,
                    agentName: agent.name,
                });

                await pushDiscussion(fresh);
                await storeAppSettings({ activeDiscussionId: fresh.id });
            } catch (error) {
                window.alert(`Could not start the chat: ${error.message}`);
                return;
            }

            // Hash routing (see routes.js): only the fragment changes,
            // so the SPA swaps pages without a full reload.
            window.location.hash = "#/chat";
        });

        card.appendChild(startButton);
        grid.appendChild(card);
    });
}

function showEmpty(message) {
    clear(statusArea);
    statusArea.appendChild(el("div", "empty-state", message));
}

function showError(message) {
    clear(statusArea);
    const box = el("div", "empty-state");
    box.textContent = `Could not load agents: ${message}`;

    const retry = el("button", "btn btn-secondary btn-small", "Retry");
    retry.type = "button";
    retry.style.marginTop = "12px";
    retry.addEventListener("click", () => {
        clear(statusArea);
        init();
    });

    box.appendChild(document.createElement("br"));
    box.appendChild(retry);
    statusArea.appendChild(box);
}
