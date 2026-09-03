// ==========================================
// ui/agents.js - THE AI AGENT CARD GRID
// ==========================================
// Fetches the discovered agents (GET /api/agents) and draws one card
// per agent. Clicking a card's "Chat" button calls back with that
// agent so app.js can open/create a ChatSession.

import { getAgents } from "../api/api.js";

/**
 * Render the agent cards into #agent-cards.
 *
 * @param {object} opts
 * @param {string} opts.containerId - the card grid id
 * @param {string} opts.statusId    - the status/empty/error area id
 * @param {(agent: object) => void} opts.onSelect - called when Chat clicked
 */
export async function renderAgents({
    containerId = "agent-cards",
    statusId = "agent-status-area",
    onSelect,
}) {
    const grid = document.getElementById(containerId);
    const status = document.getElementById(statusId);
    if (!grid || !status) {
        return [];
    }

    // Clear both.
    grid.replaceChildren();
    status.replaceChildren();

    let agents;
    try {
        agents = await getAgents();
    } catch (error) {
        showError(status, error.message, () =>
            renderAgents({ containerId, statusId, onSelect })
        );
        return [];
    }

    if (agents.length === 0) {
        showEmpty(status, "No agents found. Add a folder to agent_library/ on the server and restart it.");
        return [];
    }

    agents.forEach((agent) => {
        grid.appendChild(buildCard(agent, onSelect));
    });

    return agents;
}

function buildCard(agent, onSelect) {
    const card = document.createElement("article");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = agent.name;
    card.appendChild(title);

    if (agent.mode) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = agent.mode;
        card.appendChild(badge);
    }

    const desc = document.createElement("p");
    desc.textContent = agent.description || "No description provided.";
    card.appendChild(desc);

    const start = document.createElement("button");
    start.type = "button";
    start.className = "btn btn-primary agent-card-action";
    start.textContent = "Chat";
    start.addEventListener("click", () => {
        if (typeof onSelect === "function") {
            onSelect(agent);
        }
    });
    card.appendChild(start);

    return card;
}

function showEmpty(container, message) {
    const box = document.createElement("div");
    box.className = "empty-state";
    box.textContent = message;
    container.appendChild(box);
}

function showError(container, message, onRetry) {
    const box = document.createElement("div");
    box.className = "empty-state";
    box.textContent = `Could not load agents: ${message}`;

    const br = document.createElement("br");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn btn-secondary btn-small";
    retry.textContent = "Retry";
    retry.style.marginTop = "12px";
    retry.addEventListener("click", onRetry);

    box.appendChild(br);
    box.appendChild(retry);
    container.appendChild(box);
}
