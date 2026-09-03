// ==========================================
// ui/config.js - THE CONFIG / SETTINGS PANEL
// ==========================================
// Renders the configuration section:
//   - Default agent + default model selects (used when a new chat opens)
//   - "Chat save path": where /api/chat-save writes .txt transcript files
//
// Values are stored/merged on the server via /api/settings.

import { getModels, getAgents, loadAppSettings } from "../api/api.js";
import { buildConfigForm } from "./config-form.js";

/**
 * Render the config section.
 *
 * @param {object} opts
 * @param {string} opts.mountId - the container element id
 * @param {(settings: object) => void} opts.onChanged - called after saving
 */
export async function renderConfig({ mountId = "config-section", onChanged }) {
    const mount = document.getElementById(mountId);
    if (!mount) {
        return;
    }

    mount.replaceChildren();
    const statusEl = document.createElement("div");
    statusEl.className = "status-message";
    mount.appendChild(el("h2", "Configuration"));

    // Fetch everything we need in parallel.
    let agents = [];
    let models = [];
    let settings = {};
    try {
        [agents, models, settings] = await Promise.all([
            getAgents(),
            getModels(),
            loadAppSettings(),
        ]);
    } catch (error) {
        statusEl.textContent = `Could not load configuration: ${error.message}`;
        statusEl.className = "status-message error";
        mount.appendChild(statusEl);
        return;
    }

    const form = buildConfigForm({ agents, models, settings });
    mount.appendChild(form.root);

    const actions = el("div", "section-actions");
    const save = el("button", "btn btn-primary", "Save settings");
    save.type = "button";
    actions.appendChild(save);
    mount.appendChild(actions);
    mount.appendChild(statusEl);

    save.addEventListener("click", async () => {
        const payload = form.values();
        save.disabled = true;

        try {
            const { saveAppSettings } = await import("../api/api.js");
            const updated = await saveAppSettings(payload);
            statusEl.textContent = "Settings saved.";
            statusEl.className = "status-message ok";
            if (typeof onChanged === "function") {
                onChanged(updated);
            }
        } catch (error) {
            statusEl.textContent = error.message;
            statusEl.className = "status-message error";
        } finally {
            save.disabled = false;
        }
    });
}

/** One small element helper (kept local to avoid a dom module). */
function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text) {
        node.textContent = text;
    }
    return node;
}
