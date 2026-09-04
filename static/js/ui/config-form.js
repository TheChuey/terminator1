// ==========================================
// ui/config-form.js - CONFIG FORM BUILDER
// ==========================================
// Builds the configuration form (default agent/model selects + chat
// save path text field) and returns handles to read the values.
// Uses the shared .panel and .field CSS classes.

/**
 * Build the config form DOM.
 *
 * @param {object} opts
 * @param {object[]} opts.agents   - [{id, name}]
 * @param {object[]} opts.models   - [{id, name}]
 * @param {object} opts.settings   - stored app settings
 * @returns {{ root: HTMLElement, values: () => object }}
 */
export function buildConfigForm({ agents = [], models = [], settings = {} }) {
    const root = document.createElement("div");
    root.className = "panel";

    // ---- Default agent ----
    root.appendChild(fieldSelect("default-agent-select", "Default agent", [
        { value: "", label: "(server default)" },
        ...agents.map((a) => ({ value: a.id, label: `${a.name} (${a.id})` })),
    ], settings.defaultAgentId || ""));

    // ---- Default model ----
    root.appendChild(fieldSelect("default-model-select", "Default model", [
        { value: "", label: "(server default)" },
        ...models.map((m) => ({ value: m.id, label: m.name })),
    ], settings.defaultModel || ""));

    // ---- Chat save path ----
    const pathField = document.createElement("label");
    pathField.className = "field";
    const pathLabel = document.createElement("span");
    pathLabel.textContent = "Chat save path";
    const pathInput = document.createElement("input");
    pathInput.type = "text";
    pathInput.id = "chat-save-path";
    pathInput.placeholder = "e.g. data/chatlog/agent-text-records or absolute folder";
    pathInput.value = settings.chatSavePath || "";
    pathField.appendChild(pathLabel);
    pathField.appendChild(pathInput);
    root.appendChild(pathField);

    const pathNote = document.createElement("p");
    pathNote.className = "config-note";
    pathNote.textContent = "Where saved chat transcripts (.txt files) are written on the server.";
    root.appendChild(pathNote);

    // ---- Chat versioning toggle ----
    const versionField = document.createElement("label");
    versionField.className = "field field-toggle";
    const versionLabel = document.createElement("span");
    versionLabel.textContent = "Disable chat versioning";
    const versionToggle = document.createElement("input");
    versionToggle.type = "checkbox";
    versionToggle.id = "disable-versioning";
    versionToggle.checked = Boolean(settings.disableVersioning);
    const versionSwitch = document.createElement("span");
    versionSwitch.className = "field-switch";
    versionField.appendChild(versionLabel);
    versionField.appendChild(versionToggle);
    versionField.appendChild(versionSwitch);
    root.appendChild(versionField);

    const versionNote = document.createElement("p");
    versionNote.className = "config-note";
    versionNote.textContent =
        "On: re-saving a chat overwrites <title>.txt. Off (default): re-saving writes the next version (<title>-2.txt, ...).";
    root.appendChild(versionNote);

    return {
        root,
        values() {
            return {
                defaultAgentId: byId("default-agent-select").value,
                defaultModel: byId("default-model-select").value,
                chatSavePath: byId("chat-save-path").value.trim(),
                disableVersioning: byId("disable-versioning").checked,
            };
        },
    };
}

function fieldSelect(id, label, options, value) {
    const field = document.createElement("label");
    field.className = "field";

    const span = document.createElement("span");
    span.textContent = label;
    field.appendChild(span);

    const select = document.createElement("select");
    select.id = id;
    options.forEach((opt) => {
        const o = new Option(opt.label, opt.value);
        if (opt.value === value) {
            o.selected = true;
        }
        select.appendChild(o);
    });
    field.appendChild(select);
    return field;
}

function byId(id) {
    return document.getElementById(id);
}
