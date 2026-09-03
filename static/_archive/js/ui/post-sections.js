// ==========================================
// post-sections.js - SECTIONS BUILT ENTIRELY FROM JAVASCRIPT
// ==========================================
// WHAT THIS MODULE DOES:
// One factory - createPostSection() - draws a complete "post section"
// WITHOUT any HTML editing:
//
//   [ optional heading ]
//   [ optional description paragraph ]
//   [ custom strip drawn by the beforeInputs hook (optional) ]
//   [ input boxes / textareas / selects from `inputs` ]
//   [ button row from `buttons` + optional footer note ]
//   [ status line reporting fetch results ]
//
// BUTTON WIRING (the extension rule of this app):
//   { label, className, fetch, collect }  -> SERVER-CONNECTED button.
//       Click = collect(current input values) -> fetch(payload).
//       The button disables while waiting; status line reports ok/error.
//   { label, className, onClick }         -> plain LOCAL button.
//
// TO ADD A NEW POSTING CAPABILITY (the house pattern):
//   1. Copy one function in api_fetch.js and rewrite its path/body.
//   2. Add ONE entry to a section's `buttons` array here:
//        { label: "Do it", className: "btn btn-primary",
//          fetch: yourNewFunction, collect: (v) => ({ text: v["my-input"] }) }
//   Nothing else changes anywhere.

import { el, clear } from "../dom.js";


/**
 * Build a whole section and optionally mount it.
 *
 * config.mount        -> CSS selector or element; null = return unmounted
 * config.replace      -> true empties the mount before inserting
 * config.className    -> class for the <section> (default "panel")
 * config.title        -> heading text ("")
 * config.description  -> paragraph under the heading ("")
 * config.inputs       -> [{ id, label, tag, type, placeholder,
 *                           rows, options, value }]
 *                        tag: "input" | "textarea" | "select"
 *                        options: [{ value, label }] for selects
 * config.buttons      -> [{ label, className, fetch?, collect?,
 *                           okMessage?, onSuccess?, onClick? }]
 * config.footerNote   -> small hint text at the right of the buttons
 * config.beforeInputs -> hook(sectionRoot) drawing extras above inputs
 *
 * Returns handles so callers can reach inside afterwards:
 *   { root, actionsRow, statusEl, input(id), values(), setStatus(msg, kind) }
 */
export function createPostSection({
    mount = null,
    replace = false,
    className = "panel",
    title = "",
    description = "",
    inputs = [],
    buttons = [],
    footerNote = "",
    beforeInputs = null,
} = {}) {

    const root = el("section", className);

    if (title) {
        root.appendChild(el("h3", "", title));
    }

    if (description) {
        root.appendChild(el("p", "", description));
    }

    // Hook for page-specific strips (reply banners, attachment chips...).
    if (typeof beforeInputs === "function") {
        beforeInputs(root);
    }

    // --- INPUT BOXES -------------------------------------------
    const controlEls = {};   // id -> live control element

    inputs.forEach((spec) => {
        const field = el("label", "field");

        if (spec.label) {
            field.appendChild(el("span", "", spec.label));
        }

        const control = buildControl(spec);
        control.id = spec.id;
        controlEls[spec.id] = control;

        field.appendChild(control);
        root.appendChild(field);
    });

    /** Current values of every control: { id: value }. */
    function values() {
        const out = {};

        Object.entries(controlEls).forEach(([id, control]) => {
            out[id] = control.value;
        });

        return out;
    }

    // --- STATUS LINE --------------------------------------------
    const statusEl = el("div", "status-message");
    let statusTimer = null;

    function setStatus(message, kind = "ok") {
        statusEl.textContent = message;
        statusEl.className = `status-message ${kind}`;

        // Messages fade away after a few seconds.
        window.clearTimeout(statusTimer);
        statusTimer = window.setTimeout(() => {
            statusEl.textContent = "";
            statusEl.className = "status-message";
        }, 4000);
    }

    // --- BUTTON ROW ---------------------------------------------
    const actionsRow = el("div", "section-actions");

    buttons.forEach((spec) => {
        const button = el(
            "button",
            spec.className || "btn btn-secondary",
            spec.label
        );
        button.type = "button";

        wireButton(button, spec, setStatus, values);
        actionsRow.appendChild(button);
    });

    if (footerNote) {
        actionsRow.appendChild(el("span", "composer-hint section-note", footerNote));
    }

    root.appendChild(actionsRow);
    root.appendChild(statusEl);

    // --- MOUNTING ------------------------------------------------
    if (mount) {
        const host = typeof mount === "string"
            ? document.querySelector(mount)
            : mount;

        if (!host) {
            console.warn(`[post-sections] mount target not found: ${mount}`);
        } else {
            if (replace) {
                clear(host);
            }
            host.appendChild(root);
        }
    }

    // --- PUBLIC HANDLES ------------------------------------------
    return {
        root,
        actionsRow,
        statusEl,

        /** Live access to one control element by id (or null). */
        input(id) {
            return controlEls[id] || null;
        },

        values,

        setStatus,
    };
}


/**
 * One <input>, <textarea> or <select> from an input spec.
 * Kept separate so new control kinds can be added in one place.
 */
function buildControl(spec) {
    let control;

    if (spec.tag === "textarea") {
        control = el("textarea");
        control.rows = spec.rows || 3;
    } else if (spec.tag === "select") {
        control = document.createElement("select");
        (spec.options || []).forEach((option) => {
            control.appendChild(new Option(option.label, option.value));
        });
    } else {
        control = el("input");
        control.type = spec.type || "text";
    }

    if (spec.placeholder) {
        control.placeholder = spec.placeholder;
    }

    if (spec.value !== undefined && spec.value !== null) {
        control.value = spec.value;
    }

    return control;
}


/**
 * Attach the click behavior of ONE button.
 *
 * fetch-button : disable -> collect(values()) -> await fetch(payload)
 *                -> green status / red error -> re-enable. Callers can
 *                react afterwards with onSuccess().
 * plain button : runs onClick() and nothing else.
 */
function wireButton(button, spec, setStatus, getValues) {
    if (spec.fetch) {
        button.addEventListener("click", async () => {
            button.disabled = true;

            try {
                const payload = spec.collect
                    ? spec.collect(getValues())
                    : null;

                await spec.fetch(payload);

                setStatus(spec.okMessage || "Saved.", "ok");

                if (typeof spec.onSuccess === "function") {
                    spec.onSuccess();
                }
            } catch (error) {
                setStatus(error.message, "error");
            } finally {
                button.disabled = false;
            }
        });

        return;
    }

    button.addEventListener("click", () => {
        if (typeof spec.onClick === "function") {
            spec.onClick();
        }
    });
}
