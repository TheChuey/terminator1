// ==========================================
// settings.js - THE "SETTINGS" PAGE  (mounted at #/settings)
// ==========================================
// WHAT THIS FILE DOES:
// Draws the whole page with TWO post sections from ui/post-sections.js:
//
//   1. PREFERENCES -> default agent + default model selects.
//      "Save settings" is wired to storeAppSettings() which POSTs to
//      /api/settings (config/app_settings.json on the server).
//
//   2. DANGER ZONE -> deletes EVERYTHING this app stored on the server:
//      all discussions, all saved messages, and resets the settings.
//
// NOTE: these are BROWSER defaults. The server's own config/settings.json
// ("default_agent") separately decides what happens when NO agent id is
// sent with a /api/chat request.

import { get, el, clear } from "../dom.js";
import {
    getAgents,
    getModels,
    loadAppSettings,
    storeAppSettings,
    listDiscussions,
    removeDiscussionApi,
    listHistory,
    removeFromHistory,
} from "../api_fetch.js";
import { createPostSection } from "../ui/post-sections.js";


// ------------------------------------------
// PAGE MOUNTING (router.js calls this on every visit)
// ------------------------------------------

export async function renderPage({ middle }) {
    middle.innerHTML = `
        <section class="page" id="settings-root"></section>
    `;

    await init();
}


async function init() {
    clear(get("#settings-root"));

    try {
        // Everything the page needs, fetched in one parallel sweep.
        const [agents, models, settings] = await Promise.all([
            getAgents(),
            getModels(),
            loadAppSettings(),
        ]);

        buildPreferencesSection(agents, models, settings);
    } catch (error) {
        buildErrorSection(error);
    }

    buildDangerZoneSection();
}


// ------------------------------------------
// SECTION 1 - PREFERENCES
// ------------------------------------------

function buildPreferencesSection(agents, models, settings) {
    createPostSection({
        mount: "#settings-root",
        title: "Preferences",
        description:
            "Used as starting values on the chat page. " +
            "Stored on the server for this browser.",
        inputs: [
            {
                id: "setting-agent-select",
                label: "Default agent",
                tag: "select",
                options: [
                    { value: "", label: "(server default)" },
                    ...agents.map((a) => ({
                        value: a.id,
                        label: `${a.name} (${a.id})`,
                    })),
                ],
                value: settings.defaultAgentId || "",
            },
            {
                id: "setting-model-select",
                label: "Default model",
                tag: "select",
                options: [
                    { value: "", label: "(server default)" },
                    ...models.map((m) => ({
                        value: m.id,
                        label: m.name,
                    })),
                ],
                value: settings.defaultModel || "",
            },
        ],
        buttons: [
            {
                label: "Save settings",
                className: "btn btn-primary",
                fetch: storeAppSettings,
                collect: (values) => ({
                    defaultAgentId: values["setting-agent-select"],
                    defaultModel: values["setting-model-select"],
                }),
                okMessage: "Settings saved on the server.",
            },
        ],
    });
}


// ------------------------------------------
// SECTION 2 - DANGER ZONE
// ------------------------------------------

function buildDangerZoneSection() {
    const section = createPostSection({
        mount: "#settings-root",
        title: "Danger zone",
        description:
            "Removes every discussion, saved message and preference " +
            "this app stored on the server.",
        buttons: [
            {
                label: "Delete all server data",
                className: "btn btn-danger",
                onClick: wipeServerData,
            },
        ],
    });

    /**
     * Wipe everything through the SAME fetch functions the rest of the
     * app uses - one delete call per stored item, then reset settings.
     */
    async function wipeServerData() {
        const sure = window.confirm(
            "Delete ALL data? Every discussion, saved message and setting will be gone."
        );

        if (!sure) {
            return;
        }

        try {
            const discussions = await listDiscussions();

            for (const discussion of discussions) {
                await removeDiscussionApi(discussion.id);
            }

            const history = await listHistory();

            for (const message of history) {
                await removeFromHistory(message.id);
            }

            // Reset the stored settings back to empty defaults.
            await storeAppSettings({
                defaultAgentId: "",
                defaultModel: "",
                activeDiscussionId: "",
            });

            section.setStatus("All server data cleared.", "ok");
        } catch (error) {
            section.setStatus(error.message, "error");
        }
    }
}


// ------------------------------------------
// SERVER UNREACHABLE FALLBACK
// ------------------------------------------

function buildErrorSection(error) {
    const root = get("#settings-root");
    clear(root);

    const box = el("div", "empty-state");
    box.textContent = `Could not load settings: ${error.message}`;

    const retry = el("button", "btn btn-secondary btn-small", "Retry");
    retry.type = "button";
    retry.style.marginTop = "12px";
    retry.addEventListener("click", () => init());

    box.appendChild(document.createElement("br"));
    box.appendChild(retry);
    root.appendChild(box);
}
