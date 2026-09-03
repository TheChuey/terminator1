// ==========================================
// js/app.js - ENTRY POINT (the only script index.html loads)
// ==========================================
// BOOT:
//   1. Render the AI agent card grid (ui/agents.js)
//   2. Render the Configuration section (ui/config.js)
//   3. Build ONE persistent floating chat widget (classes/chat-window.js
//      in flyout mode) that sits in the corner of the screen. It targets
//      the first agent by default and can switch agents via the dropdown
//      in its header. Clicking an agent card also switches + expands it.
//      The ChatWindow ONLY renders; all AI/session/persist logic lives here.
//
// FOLDER MAP:
//   js/app.js                        -> boot + wiring (this file)
//   js/logic/                        -> pure logic (models, chat-formatter)
//   js/classes/ChatSession.js        -> chat data model (no DOM)
//   js/classes/chat-window.js        -> reusable flyout chat engine
//   js/api/                          -> every server call (api.js)
//   js/ui/                           -> agents, config, config-form, markdown

import { renderAgents } from "./ui/agents.js";
import { renderConfig } from "./ui/config.js";
import { ChatSession } from "./classes/ChatSession.js";
import { ChatFactory } from "./classes/chat-window.js";
import { renderMarkdown } from "./ui/markdown.js";
import * as api from "./api/api.js";

// ---- app-level state ----
let settings = {};            // cached app settings (chatSavePath, defaults)
let agents = [];              // the list of discovered agents
let widget = null;            // the single persistent ChatWindow (flyout)
let activeAgentId = null;     // which agent the widget is currently talking to

// One ChatSession per agent so history survives switching agents in the
// single widget. Sending routes through the currently active session.
const agentSessions = new Map(); // agentId -> ChatSession

// Auto-"say hi" feature (experimental, may be removed).
const AUTO_HI_TEXT = "hi";     // message injected into a brand-new chat
const AUTO_HI_DEFAULT = true;  // default state of the auto-hi toggle

// ---- boot ----
async function boot() {
    // 1. Render agent cards (returns the full agent list).
    agents = await renderAgents({
        containerId: "agent-cards",
        statusId: "agent-status-area",
        onSelect: onAgentSelected,
    });

    // 2. Render configuration.
    await renderConfig({
        mountId: "config-section",
        onChanged: (updated) => {
            settings = updated;
        },
    });

    // 3. Create the persistent corner widget for the first agent (if any).
    if (agents.length > 0) {
        buildWidget();
    }
}

/** Create the single persistent flyout widget + wire its agent switcher. */
function buildWidget() {
    const defaultAgent = agents[0];
    const config = buildAgentConfig(defaultAgent);
    config.layout.flyout = true;

    widget = ChatFactory.create(config);

    // Feed the switcher with all selectable agents.
    widget.setAgents(agents);

    // Present the default agent (fresh session, no auto-hi on startup).
    selectSession(defaultAgent, false);

    // Route sends to the active session.
    widget.onSend((text) => {
        const session = activeSession();
        if (session) {
            handleSend(session, widget, text);
        }
    });

    widget.onAction("saveChat", () => {
        const session = activeSession();
        if (session) {
            handleSaveAction(session, widget);
        }
    });
    widget.onAction("clearChat", () => {
        const session = activeSession();
        if (session) {
            handleClearAction(session, widget);
        }
    });

    // Switcher in the widget header changes the active agent.
    widget.onSwitchAgent((agentId) => {
        const agent = agents.find((a) => String(a.id) === String(agentId));
        if (agent) {
            switchToAgent(agent, false);
        }
    });
}

/** The ChatSession for the agent currently shown in the widget. */
function activeSession() {
    return activeAgentId ? agentSessions.get(activeAgentId) : null;
}

// ---- agent card click -> switch + expand the widget ----
function onAgentSelected(agent) {
    if (!widget) {
        return;
    }
    switchToAgent(agent);
    if (!widget.isOpen) {
        widget.open();
    }
}

/** (Re)point the widget at an agent, keeping its per-agent session. */
function switchToAgent(agent, autoHi = true) {
    if (!widget) {
        return;
    }
    widget.setActiveAgent(agent.id);
    selectSession(agent, autoHi);
}

/**
 * Ensure a ChatSession exists for the agent and load it into the widget.
 * The auto-"say hi" fires only the first time we meet this agent, and only
 * once the widget is expanded so the injected message can be sent.
 */
function selectSession(agent, autoHi = false) {
    let session = agentSessions.get(agent.id);
    const created = !session;
    if (!session) {
        session = new ChatSession({
            agentId: agent.id,
            agentName: agent.name,
            model: settings.defaultModel || "",
        });
        agentSessions.set(agent.id, session);
    }
    activeAgentId = agent.id;

    if (created && autoHi && widget && widget.isOpen && widget.getPanelValues().autoHi === true) {
        widget.setInputValue(AUTO_HI_TEXT);
        widget.send();
    }
    return created;
}

/**
 * The entity config that drives the chat window for one AI agent.
 * The right panel is generated fully from `sections` - no HTML edits
 * needed to change an agent's controls/branding.
 */
function buildAgentConfig(agent) {
    return {
        id: agent.id,
        type: "agent",
        name: agent.name,
        title: agent.name,
        description: agent.description || "AI agent",
        layout: { rightPanel: true, resizable: true, collapsible: true, panelWidth: 300 },
        renderMarkdown,
        sections: [
            {
                title: "Agent Information",
                fields: [
                    { type: "text", label: "Status", value: "Ready" },
                    { type: "text", label: "Category", value: agent.mode || "General" },
                ],
            },
            {
                title: "Actions",
                fields: [
                    { type: "button", label: "Save chat", action: "saveChat" },
                    { type: "button", label: "Clear chat", action: "clearChat" },
                ],
            },
            {
                title: "Behavior",
                fields: [
                    {
                        type: "toggle",
                        name: "autoHi",
                        label: '"Say hi" on a new chat',
                        value: AUTO_HI_DEFAULT,
                    },
                ],
            },
        ],
    };
}

// ---- send flow (the ChatWindow already showed the user bubble) ----
async function handleSend(session, chat, text) {
    session.addUserMessage(text);
    chat.setWaiting(true);

    try {
        const reply = await api.sendChat({
            message: text,
            agentId: session.agentId,
            model: session.model,
            history: session.getApiHistory(),
        });

        session.addAssistantMessage(reply);
        chat.addAssistantMessage(reply, session.agentName);
        await autoSave(session, chat);
        chat.setSaveStatus("Chat saved.", "ok");
    } catch (error) {
        chat.addSystemMessage(`Sorry - that failed. ${error.message}`);
        chat.setSaveStatus(`Send failed: ${error.message}`, "error");
    } finally {
        chat.setWaiting(false);
    }
}

// ---- save handlers ----
/**
 * Auto-save after every assistant reply: keeps the .txt file as the
 * source of truth for the chat (chatSavePath from settings).
 */
async function autoSave(session, chat) {
    if (!session || session.isEmpty || !chat) {
        return;
    }

    const path = settings.chatSavePath || "data/chats";

    try {
        const result = await api.saveChatSession({
            path,
            fileName: session.transcriptFileName,
            title: session.title,
            agentName: session.agentName,
            model: session.model,
            content: session.transcript,
        });
        chat.setSaveStatus(`Saved: ${result.file}`, "ok");
    } catch (error) {
        console.warn("[app] auto-save failed:", error);
        chat.setSaveStatus(`Save failed: ${error.message}`, "error");
    }
}

/** "Save chat" action button in the window's right panel. */
async function handleSaveAction(session, chat) {
    if (!session || session.isEmpty) {
        chat.setSaveStatus("Nothing to save yet.", "error");
        return;
    }

    const path = settings.chatSavePath || "data/chats";

    try {
        const result = await api.saveChatSession({
            path,
            fileName: session.transcriptFileName,
            title: session.title,
            agentName: session.agentName,
            model: session.model,
            content: session.transcript,
        });
        chat.setSaveStatus(`Saved: ${result.file}`, "ok");
    } catch (error) {
        chat.setSaveStatus(`Save failed: ${error.message}`, "error");
    }
}

/** "Clear chat" action: wipe the session data and the rendered bubbles. */
function handleClearAction(session, chat) {
    session.newChat();
    chat.clearMessages();
    chat.setSaveStatus("Chat cleared.", "ok");
}

// ---- go ----
boot();
