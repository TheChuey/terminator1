// ================================================================
// classes/chat-window.js
// REUSABLE POP-OUT AI CHAT WINDOW ENGINE
// ================================================================
// A self-contained, configuration-driven floating chat window. It is
// fully independent from any AI backend: the calling app registers a
// "send" handler plus per-action handlers, and this component only
// renders, drags, resizes, and emits events.
//
//   import { ChatFactory } from "./classes/chat-window.js";
//
//   const chat = ChatFactory.create({ name, sections, ... });
//   chat.onSend((text, chat) => { /* call your AI / store */ });
//   chat.onAction("savePlan", () => { /* do something */ });
//   chat.open();
//
// RESPONSIBILITY SPLIT (intentional):
//   chat-window.js  -> rendering, DOM, layout, drag/resize, events
//   the app         -> AI calls, session state, persistence, agent logic
//
// Every DOM class is prefixed with `cw-` so this component can be copied
// into any project without colliding with existing styles. Its CSS lives
// in styles.css under "SECTION 8: CHAT WINDOW ENGINE".
//
// Supported message roles: user | assistant | agent | system - each
// rendered with its own bubble styling.

/* ================================================================
   1. UTILITY FUNCTIONS
   ================================================================ */

/** Create a DOM element with a few convenient options. */
function createElement(tag, options = {}) {
    const element = document.createElement(tag);
    if (options.className) {
        element.className = options.className;
    }
    if (options.text !== undefined && options.text !== null) {
        element.textContent = options.text;
    }
    if (options.title) {
        element.title = options.title;
    }
    if (options.placeholder) {
        element.placeholder = options.placeholder;
    }
    if (options.ariaLabel) {
        element.setAttribute("aria-label", options.ariaLabel);
    }
    if (options.dataset) {
        Object.assign(element.dataset, options.dataset);
    }
    return element;
}

/** Small labelled button (used by the right panel). */
function createButton(label, onClick, className = "cw-panel-button") {
    const button = createElement("button", { className: className, text: label });
    button.type = "button";
    if (typeof onClick === "function") {
        button.addEventListener("click", onClick);
    }
    return button;
}

/** Small text input helper. */
function createInput(attrs = {}) {
    const input = document.createElement("input");
    if (attrs.type) {
        input.type = attrs.type;
    }
    if (attrs.name) {
        input.name = attrs.name;
    }
    if (attrs.placeholder) {
        input.placeholder = attrs.placeholder;
    }
    if (attrs.value !== undefined && attrs.value !== null) {
        input.value = attrs.value;
    }
    return input;
}

/** Build a <select> from [{value,label}] or ["plain","strings"]. */
function createSelect(options = [], selected = "") {
    const select = document.createElement("select");
    options.forEach((option) => {
        const opt = document.createElement("option");
        if (option && typeof option === "object") {
            opt.value = option.value !== undefined ? option.value : option.label;
            opt.textContent = option.label !== undefined ? option.label : option.value;
        } else {
            opt.value = option;
            opt.textContent = option;
        }
        if (String(opt.value) === String(selected)) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
    return select;
}

/** Clamp a number into [min, max]. Safe when min > max (tiny screens). */
function clampValue(value, min, max) {
    value = Number(value);
    if (min > max) {
        return value;
    }
    return Math.min(Math.max(value, min), max);
}

/** First letters of a name for the avatar, e.g. "Planner Agent" -> "PA". */
function initials(name) {
    if (!name) {
        return "";
    }
    const words = String(name).trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

/** Short unique id, e.g. "msg-l8x2p9k3f". */
function makeId(prefix = "id") {
    return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Friendly time: today -> "14:05", else "Jun 3, 14:05". */
function formatTime(isoString) {
    const date = isoString ? new Date(isoString) : new Date();
    const now = new Date();
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (date.toDateString() === now.toDateString()) {
        return time;
    }
    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

/**
 * Inline SVG icon set (Feather-style). Returns an <svg> element.
 * Markup is developer-authored constants (never user input), so the
 * innerHTML here is safe.
 */
const ICON_PATHS = {
    close: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
    minus: '<line x1="5" y1="12" x2="19" y2="12"></line>',
    panel: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line>',
    chevronDown: '<polyline points="4 7 12 15 20 7"></polyline>',
    chevronUp: '<polyline points="18 15 12 7 6 15"></polyline>',
    send: '<line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
    message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>',
};

function createIcon(name, size = 14) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.innerHTML = ICON_PATHS[name] || "";
    return svg;
}

/**
 * Default markdown renderer. chat-window.js is self-contained, so the
 * built-in renderer only shows plain text. Pass `renderMarkdown` in the
 * config (or call `setMarkdownRenderer`) to plug in a real parser.
 */
function defaultRenderMarkdown(text) {
    const p = document.createElement("p");
    p.textContent = text ?? "";
    return p;
}

// ================================================================
//   2. RIGHT PANEL
// ================================================================
// The reusable side panel. Sections + fields are generated dynamically
// from the entity's config object - never hardcoded for one AI agent.
// It can be hidden and resized horizontally via a small drag handle.

const PANEL_MIN_WIDTH = 190;

class RightPanel {
    /**
     * @param {object} config   - { width?, sections? }
     * @param {ChatWindow} chatWindow - back-reference for actions/limits
     */
    constructor(config, chatWindow) {
        this.config = config;
        this.chatWindow = chatWindow;
        this.sections = config.sections || [];
        this.element = null;
        this.isVisible = true;
        this._handlers = { onAction: null, onToggle: null, onInput: null };
    }

    /** Register a named callback used by the generated controls. */
    setHandler(name, fn) {
        this._handlers[name] = typeof fn === "function" ? fn : null;
    }

    /** Build the whole panel: sections from config + a drag handle. */
    create() {
        const panel = createElement("aside", { className: "cw-panel" });
        panel.style.width = `${clampValue(this.config.width || 300, PANEL_MIN_WIDTH, 700)}px`;
        this.element = panel;

        this.renderSections();

        if (this.chatWindow.layout.resizable) {
            const handle = createElement("div", {
                className: "cw-panel-drag",
                title: "Drag to resize the panel",
            });
            panel.appendChild(handle);
            this._bindDrag(handle);
        }

        return panel;
    }

    /** Rebuild all sections (used at creation time). */
    renderSections() {
        if (!this.element) {
            return;
        }
        const wrapper = this.element.querySelector(".cw-panel-sections");
        if (wrapper) {
            wrapper.remove();
        }
        const shell = createElement("div", { className: "cw-panel-sections" });
        this.sections.forEach((section) => shell.appendChild(this.createSection(section)));
        this.element.appendChild(shell);
    }

    /** One section = optional collapse header + a list of fields. */
    createSection(section) {
        const box = createElement("section", { className: "cw-panel-section" });

        const head = createElement("div", { className: "cw-panel-section-head" });
        const title = createElement("span", { text: section.title || "" });

        if (section.collapsible) {
            const button = createElement("button", {
                className: "cw-panel-section-toggle",
                title: "Toggle section",
            });
            button.type = "button";
            button.appendChild(title);
            button.appendChild(createIcon("chevronDown", 13));
            button.addEventListener("click", () => box.classList.toggle("cw-collapsed"));
            head.appendChild(button);
        } else {
            head.appendChild(title);
        }

        const body = createElement("div", { className: "cw-panel-section-body" });
        (section.fields || []).forEach((field) => body.appendChild(this.createField(field)));

        box.appendChild(head);
        box.appendChild(body);
        return box;
    }

    /** Dispatch a single config field to the matching builder. */
    createField(field) {
        switch (field.type || "text") {
        case "text":
            return this._fieldText(field);
        case "input":
            return this._fieldInput(field);
        case "select":
            return this._fieldSelect(field);
        case "toggle":
            return this._fieldToggle(field);
        case "button":
            return this._fieldButton(field);
        case "divider":
            return createElement("hr", { className: "cw-divider" });
        default:
            return this._fieldText(field);
        }
    }

    /* ---------- field builders ---------- */

    _fieldText(field) {
        const row = createElement("div", { className: "cw-field cw-field-text" });
        if (field.label) {
            row.appendChild(createElement("span", { className: "cw-field-label", text: field.label }));
        }
        row.appendChild(createElement("span", {
            className: "cw-field-value",
            text: field.value !== undefined && field.value !== null ? field.value : "—",
        }));
        return row;
    }

    _fieldInput(field) {
        const wrap = createElement("div", { className: "cw-field cw-field-input" });
        if (field.label) {
            wrap.appendChild(createElement("label", { className: "cw-field-label", text: field.label }));
        }
        const input = createInput({ type: "text", placeholder: field.placeholder || "" });
        if (field.value !== undefined && field.value !== null) {
            input.value = field.value;
        }
        if (field.name) {
            input.dataset.name = field.name;
        }
        input.addEventListener("input", () => this._emit("onInput", field, input.value));
        wrap.appendChild(input);
        return wrap;
    }

    _fieldSelect(field) {
        const wrap = createElement("div", { className: "cw-field cw-field-select" });
        if (field.label) {
            wrap.appendChild(createElement("label", { className: "cw-field-label", text: field.label }));
        }
        const select = createSelect(field.options || [], field.value);
        if (field.name) {
            select.dataset.name = field.name;
        }
        select.addEventListener("change", () => this._emit("onInput", field, select.value));
        wrap.appendChild(select);
        return wrap;
    }

    _fieldToggle(field) {
        const row = createElement("div", { className: "cw-field cw-field-toggle" });
        if (field.label) {
            row.appendChild(createElement("span", { className: "cw-field-label", text: field.label }));
        }
        const label = createElement("label", { className: "cw-switch" });
        const checkbox = createInput({ type: "checkbox" });
        checkbox.checked = Boolean(field.value);
        if (field.name) {
            checkbox.dataset.name = field.name;
        }
        checkbox.addEventListener("change", () => this._emit("onToggle", field, checkbox.checked));
        label.appendChild(checkbox);
        label.appendChild(createElement("span", { className: "cw-switch-track" }));
        row.appendChild(label);
        return row;
    }

    _fieldButton(field) {
        const button = createButton(field.label || "Action", () => {
            // Route through the parent so app-registered handlers fire.
            this.chatWindow.triggerAction(field.action);
        });
        if (field.title) {
            button.title = field.title;
        }
        if (field.disabled) {
            button.disabled = true;
        }
        button.dataset.action = field.action || "";
        return button;
    }

    /* ---------- helpers ---------- */

    _emit(name, ...args) {
        if (typeof this._handlers[name] === "function") {
            this._handlers[name](...args);
        }
    }

    /** Show or hide the whole panel (the chat area expands automatically). */
    setVisible(visible) {
        this.isVisible = Boolean(visible);
        if (this.element) {
            this.element.classList.toggle("cw-panel-hidden", !this.isVisible);
        }
    }

    /** Toggle visibility; returns the new visible state. */
    toggle() {
        this.setVisible(!this.isVisible);
        return this.isVisible;
    }

    /** Collect the current value of every control that has a `name`. */
    getValues() {
        const values = {};
        if (!this.element) {
            return values;
        }
        this.element.querySelectorAll("[data-name]").forEach((node) => {
            if (node.type === "checkbox") {
                values[node.dataset.name] = node.checked;
            } else {
                values[node.dataset.name] = node.value;
            }
        });
        return values;
    }

    /**
     * Horizontal resize: dragging the handle changes the panel width.
     * The chat area is a flex sibling, so it fills the freed space.
     */
    _bindDrag(handle) {
        handle.style.touchAction = "none";
        handle.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = this.element.getBoundingClientRect().width;
            const maxWidth = Math.max(
                PANEL_MIN_WIDTH,
                this.chatWindow.element.getBoundingClientRect().width * 0.45
            );

            const onMove = (moveEvent) => {
                const nextWidth = clampValue(
                    startWidth - (moveEvent.clientX - startX),
                    PANEL_MIN_WIDTH,
                    maxWidth
                );
                this.element.style.width = `${nextWidth}px`;
            };
            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
            };
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }
}

// ================================================================
//   3. CHAT WINDOW
// ================================================================
// The main controller. Owns one complete chat instance: the pop-out
// window, header, message list, composer, right panel, dragging,
// resizing and the event/action system. It contains NO AI logic.

const WINDOW_MIN_WIDTH = 360;
const WINDOW_MIN_HEIGHT = 460;
const VIEWPORT_MARGIN = 8;

class ChatWindow {
    constructor(config = {}) {
        this.config = config;

        this.id = config.id || makeId("chat");
        this.type = config.type || "agent";
        this.name = config.name || "Assistant";
        this.title = config.title || this.name;
        this.description = config.description || "";
        this.meta = config.meta || {};

        // Flyout mode renders the chat as a persistent corner widget that
        // "flies out" (expands) when the launcher is clicked. It uses the
        // same engine but stays anchored bottom-right, shows no backdrop,
        // and can switch which agent it is talking to.
        this._flyout = Boolean(config.layout && config.layout.flyout);

        this.layout = {
            rightPanel: this._flyout ? false : (config.layout ? config.layout.rightPanel !== false : true),
            resizable: this._flyout ? false : (config.layout ? config.layout.resizable !== false : true),
            collapsible: config.layout ? config.layout.collapsible !== false : true,
            width: (config.layout && config.layout.width) || 780,
            height: (config.layout && config.layout.height) || 560,
            panelWidth: (config.layout && config.layout.panelWidth) || 300,
        };
        this.sections = config.sections || [];

        this.messages = [];
        this.isOpen = false;
        this.isMinimized = false;
        this.isWaiting = false;
        this.isPanelVisible = this.layout.rightPanel;

        // Agent switcher (flyout mode): list of selectable agents + id.
        this.agentOptions = [];
        this.agentChangeHandler = null;

        this.actionHandlers = {};
        this.sendHandler = null;
        this.toggleHandler = null;
        this.renderMarkdown =
            typeof config.renderMarkdown === "function"
                ? config.renderMarkdown
                : defaultRenderMarkdown;

        this.element = null;      // .chat-window (the pop-up; fixed position)
        this.launcher = null;     // floating button shown when closed
        this.panel = null;        // RightPanel instance

        // Cache DOM refs we touch in the hot paths.
        this._messageBody = null;
        this._input = null;
        this._sendButton = null;
        this._saveStatus = null;
        this._panelBtn = null;
        this._minBtn = null;
        this._agentSelect = null;
        this._widgetLauncher = null;
        this._typingEl = null;
        this._welcomeEl = null;
        this._sizeBeforeMinimize = null;

        this._build();
    }

    /* ---------- DOM construction ---------- */

    _build() {
        const root = createElement("div", {
            className: this._flyout
                ? "chat-window cw-widget cw-collapsed"
                : "chat-window cw-hidden",
        });
        if (!this._flyout) {
            root.style.width = `${this.layout.width}px`;
            root.style.height = `${this.layout.height}px`;
        }

        root.appendChild(this._buildHeader());
        root.appendChild(this._buildBody());
        root.appendChild(this._buildComposer());

        if (this.layout.resizable) {
            this._attachResizeHandles(root);
        }

        if (this._flyout) {
            this._widgetLauncher = this._buildWidgetLauncher();
            root.appendChild(this._widgetLauncher);
        }

        this.element = root;
        document.body.appendChild(root);

        // In flyout mode there is no backdrop (the widget stays lightweight
        // and the page underneath remains usable) and no separate launcher.
        if (!this._flyout) {
            this._backdrop = this._buildBackdrop();
            document.body.appendChild(this._backdrop);

            this.launcher = this._buildLauncher();
            document.body.appendChild(this.launcher);
        }

        this._bindWindow();
        this._renderWelcome();
    }

    /** Persistent corner button for flyout mode (always visible). */
    _buildWidgetLauncher() {
        const button = createElement("button", {
            className: "cw-widget-launcher",
            type: "button",
            ariaLabel: "Open chat",
            title: "Open chat",
        });
        button.appendChild(createIcon("chat", 22));
        return button;
    }

    _buildHeader() {
        const header = createElement("header", { className: "cw-window-header" });

        this._avatar = createElement("div", { className: "cw-window-avatar" });
        this._avatar.textContent = initials(this.name);
        header.appendChild(this._avatar);

        const info = createElement("div", { className: "cw-window-info" });
        this._nameEl = createElement("strong", { text: this.name });
        this._subEl = createElement("small", {
            text: this.title || this.description || this.type,
        });
        info.appendChild(this._nameEl);
        info.appendChild(this._subEl);

        const actions = createElement("div", { className: "cw-window-actions" });

        if (this.layout.rightPanel && this.layout.collapsible) {
            this._panelBtn = createElement("button", {
                className: "cw-icon-btn",
                title: "Show or hide the side panel",
                ariaLabel: "Toggle side panel",
            });
            this._panelBtn.type = "button";
            this._panelBtn.setAttribute("aria-pressed", String(this.isPanelVisible));
            this._panelBtn.appendChild(createIcon("panel"));
            actions.appendChild(this._panelBtn);
        }

        this._minBtn = createElement("button", {
            className: "cw-icon-btn",
            title: "Minimize",
            ariaLabel: "Minimize window",
        });
        this._minBtn.type = "button";
        this._minBtn.appendChild(createIcon("minus"));
        actions.appendChild(this._minBtn);

        const closeBtn = createElement("button", {
            className: "cw-icon-btn cw-close",
            title: "Close",
            ariaLabel: "Close window",
        });
        closeBtn.type = "button";
        closeBtn.appendChild(createIcon("close"));
        actions.appendChild(closeBtn);

        header.appendChild(info);

        // In flyout mode, let the user pick which agent to talk to.
        if (this._flyout) {
            this._agentSelect = createSelect([], this.name);
            this._agentSelect.className = "cw-agent-select";
            this._agentSelect.setAttribute("aria-label", "Switch agent");
            this._agentSelect.addEventListener("change", () => {
                if (typeof this.agentChangeHandler === "function") {
                    this.agentChangeHandler(this._agentSelect.value, this);
                }
            });
            header.appendChild(this._agentSelect);
        }

        header.appendChild(actions);
        return header;
    }

    _buildBody() {
        const body = createElement("div", { className: "cw-window-body" });

        const chatArea = createElement("div", { className: "cw-chat-area" });
        this._messageBody = createElement("div", { className: "cw-message-body" });
        chatArea.appendChild(this._messageBody);
        body.appendChild(chatArea);

        if (this.layout.rightPanel) {
            this.panel = new RightPanel(
                { width: this.layout.panelWidth, sections: this.sections },
                this
            );
            body.appendChild(this.panel.create());
        }

        return body;
    }

    _buildComposer() {
        const composer = createElement("div", { className: "cw-composer" });

        this._saveStatus = createElement("div", { className: "cw-save-status" });

        this._input = document.createElement("textarea");
        this._input.className = "cw-input";
        this._input.placeholder = `Message ${this.name}...`;
        this._input.setAttribute("aria-label", "Message");
        this._input.rows = 1;

        const row = createElement("div", { className: "cw-composer-row" });
        row.appendChild(createElement("span", {
            className: "cw-input-hint",
            text: "Enter sends - Shift + Enter adds a new line",
        }));

        this._sendButton = createElement("button", {
            className: "btn btn-primary cw-send",
            text: "Send",
        });
        this._sendButton.type = "button";

        row.appendChild(this._sendButton);
        composer.appendChild(this._saveStatus);
        composer.appendChild(this._input);
        composer.appendChild(row);
        return composer;
    }

    _buildLauncher() {
        const button = createElement("button", {
            className: "btn btn-primary chat-window-launcher cw-hidden",
            text: `Open ${this.name}`,
        });
        button.type = "button";
        return button;
    }

    _buildBackdrop() {
        const el = createElement("div", { className: "cw-backdrop cw-hidden" });
        el.addEventListener("click", () => this.close());
        return el;
    }

    /** Eight thin edge strips that resize the whole window. */
    _attachResizeHandles(root) {
        ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach((edge) => {
            const handle = createElement("div", {
                className: `cw-resize cw-resize-${edge}`,
                title: `Resize (${edge})`,
            });
            handle.style.touchAction = "none";
            handle.addEventListener("pointerdown", (event) => this._beginResize(edge, event));
            root.appendChild(handle);
        });
    }

    /* ---------- public API ---------- */

    /** Show the window (creates the launcher automatically on first build). */
    open() {
        if (!this.element) {
            return;
        }
        this.isOpen = true;

        if (this._flyout) {
            // Expand the widget out of its collapsed corner button.
            this.isMinimized = false;
            this.element.classList.add("cw-expanded");
            this.element.classList.remove("cw-collapsed", "cw-minimized");
            if (this._widgetLauncher) {
                this._widgetLauncher.classList.add("cw-hidden");
            }
            this._renderWelcome();
            if (this._input) {
                this._input.focus();
            }
            return;
        }

        this.element.classList.remove("cw-hidden");
        if (this._backdrop) {
            this._backdrop.classList.remove("cw-hidden");
        }
        if (this.launcher) {
            this.launcher.classList.add("cw-hidden");
        }
        // Force layout reflow so getBoundingClientRect returns accurate values
        // after transitioning from display: none.
        void this.element.offsetHeight;
        this._keepInViewport();

        // On small screens the panel collapses out of the way.
        if (window.innerWidth <= 600 && this.layout.collapsible && this.isPanelVisible) {
            this.togglePanel(false);
        }

        this._renderWelcome();
        if (this._input) {
            this._input.focus();
        }
    }

    /** Hide the window and show the launcher button again. */
    close() {
        this.isOpen = false;
        this.isMinimized = false;

        if (this._flyout) {
            // Collapse back to the persistent corner button.
            this.element.classList.add("cw-collapsed");
            this.element.classList.remove("cw-expanded", "cw-minimized");
            if (this._widgetLauncher) {
                this._widgetLauncher.classList.remove("cw-hidden");
            }
            return;
        }

        if (this.element) {
            this.element.classList.add("cw-hidden");
            this.element.classList.remove("cw-minimized");
        }
        if (this._backdrop) {
            this._backdrop.classList.add("cw-hidden");
        }
        if (this.launcher) {
            this.launcher.classList.remove("cw-hidden");
        }
    }

    /** Minimize to a header bar, or restore the previous size. */
    minimize() {
        // In flyout mode "minimize" collapses the widget back to the button.
        if (this._flyout) {
            if (this.isMinimized) {
                this.open();
            } else {
                this.isMinimized = true;
                this.close();
            }
            return;
        }

        if (this.isMinimized) {
            this.isMinimized = false;
            this.element.classList.remove("cw-minimized");
            if (this._backdrop) {
                this._backdrop.classList.remove("cw-hidden");
            }
            if (this._sizeBeforeMinimize) {
                const s = this._sizeBeforeMinimize;
                this.element.style.width = `${s.width}px`;
                this.element.style.height = `${s.height}px`;
                this.element.style.left = `${s.left}px`;
                this.element.style.top = `${s.top}px`;
            }
            if (this._minBtn) {
                this._minBtn.title = "Minimize";
            }
            if (this._input) {
                this._input.focus();
            }
        } else {
            const rect = this.element.getBoundingClientRect();
            this._sizeBeforeMinimize = {
                width: rect.width,
                height: rect.height,
                left: rect.left,
                top: rect.top,
            };
            this.isMinimized = true;
            this.element.classList.add("cw-minimized");
            this.element.style.height = "var(--cw-header-height)";
            if (this._backdrop) {
                this._backdrop.classList.add("cw-hidden");
            }
            if (this._minBtn) {
                this._minBtn.title = "Restore";
            }
        }
    }

    /** Show/hide the right panel (chat area fills the freed space). */
    togglePanel(force) {
        if (!this.layout.rightPanel || !this.panel) {
            return;
        }
        const show = typeof force === "boolean" ? force : !this.isPanelVisible;
        this.isPanelVisible = show;
        this.panel.setVisible(show);
        if (this._panelBtn) {
            this._panelBtn.setAttribute("aria-pressed", String(show));
            this._panelBtn.title = show ? "Hide the side panel" : "Show the side panel";
        }
        if (typeof this.toggleHandler === "function") {
            this.toggleHandler(show);
        }
    }

    /**
     * Append an arbitrary message object and render its bubble.
     * Shape: { id?, role, author?, content/text, timestamp? }
     * Returns the normalized stored message.
     */
    addMessage(message) {
        const normalized = {
            id: message.id || makeId("msg"),
            role: message.role || "assistant",
            author: message.author || (message.role === "user" ? "You" : this.name),
            content: message.content !== undefined ? message.content : (message.text ?? ""),
            timestamp: message.timestamp || new Date(),
        };
        this.messages.push(normalized);
        this._removeWelcome();
        if (this._messageBody) {
            this._messageBody.appendChild(this._buildBubble(normalized));
        }
        this.scrollToBottom();
        return normalized;
    }

    addUserMessage(text) {
        return this.addMessage({ role: "user", author: "You", content: text });
    }

    addAssistantMessage(text, author = this.name) {
        return this.addMessage({ role: "assistant", author: author, content: text });
    }

    addSystemMessage(text) {
        return this.addMessage({ role: "system", author: "System", content: text });
    }

    /** Clear every message and restore the welcome state. */
    clearMessages() {
        this.messages = [];
        if (this._messageBody) {
            this._messageBody.replaceChildren();
        }
        this._renderWelcome();
    }

    /** Enable/disable the composer and show/hide the typing indicator. */
    setWaiting(waiting) {
        this.isWaiting = Boolean(waiting);
        if (this._input) {
            this._input.disabled = this.isWaiting;
        }
        if (this._sendButton) {
            this._sendButton.disabled = this.isWaiting;
        }
        if (this.isWaiting) {
            this._showTyping();
        } else {
            this._removeTyping();
        }
    }

    /** Small inline status line above the composer. */
    setSaveStatus(text, kind = "") {
        if (!this._saveStatus) {
            return;
        }
        this._saveStatus.textContent = text || "";
        this._saveStatus.className = text
            ? `cw-save-status ${kind}`
            : "cw-save-status";
    }

    /** Scroll the message list to the newest bubble. */
    scrollToBottom() {
        if (this._messageBody) {
            this._messageBody.scrollTop = this._messageBody.scrollHeight;
        }
    }

    /** Register the handler called with each sent message. */
    onSend(callback) {
        this.sendHandler = typeof callback === "function" ? callback : null;
    }

    /** Register a handler for one action name from the right panel. */
    onAction(action, callback) {
        if (typeof action === "object") {
            Object.entries(action).forEach(([name, fn]) => this.onAction(name, fn));
            return this;
        }
        this.actionHandlers[action] = typeof callback === "function" ? callback : null;
        return this;
    }

    /** Optional hook fired when the right panel is shown/hidden. */
    onTogglePanel(callback) {
        this.toggleHandler = typeof callback === "function" ? callback : null;
    }

    /** Replace the markdown renderer after construction. */
    setMarkdownRenderer(fn) {
        this.renderMarkdown = typeof fn === "function" ? fn : defaultRenderMarkdown;
    }

    /** Current values of panel controls that have a `name`. */
    getPanelValues() {
        return this.panel ? this.panel.getValues() : {};
    }

    /**
     * (Flyout) Set the list of selectable agents. Each item is
     * { id, name }. Call once with the full agent list. Does NOT change
     * the active agent - use setActiveAgent for that.
     */
    setAgents(agents = []) {
        this.agentOptions = Array.isArray(agents) ? agents : [];
        if (!this._agentSelect) {
            return;
        }
        this._agentSelect.replaceChildren();
        this.agentOptions.forEach((agent) => {
            const opt = createElement("option", { text: agent.name });
            opt.value = agent.id;
            if (String(agent.id) === String(this.config.id)) {
                opt.selected = true;
            }
            this._agentSelect.appendChild(opt);
        });
    }

    /** (Flyout) Switch the widget to a different agent by id. */
    setActiveAgent(agentId) {
        const agent = this.agentOptions.find((a) => String(a.id) === String(agentId));
        if (!agent) {
            return;
        }
        this.name = agent.name;
        this.title = agent.description || agent.name;
        this.description = agent.description || "";
        this.config.id = agent.id;

        if (this._nameEl) {
            this._nameEl.textContent = agent.name;
        }
        if (this._subEl) {
            this._subEl.textContent = this.description || this.type;
        }
        if (this._avatar) {
            this._avatar.textContent = initials(agent.name);
        }
        if (this._input) {
            this._input.placeholder = `Message ${agent.name}...`;
        }
        if (this._agentSelect) {
            this._agentSelect.value = String(agent.id);
        }
        this.clearMessages();
    }

    /** (Flyout) Register the handler fired when the switcher changes. */
    onSwitchAgent(callback) {
        this.agentChangeHandler = typeof callback === "function" ? callback : null;
    }

    /** Fire an action that was configured on a panel button. */
    triggerAction(action) {
        const handler = this.actionHandlers[action];
        if (typeof handler === "function") {
            handler(action, this, this.getPanelValues());
        }
    }

    /** Remove the window and launcher from the DOM entirely. */
    destroy() {
        if (this.element) {
            this.element.remove();
        }
        if (this.launcher) {
            this.launcher.remove();
        }
        this.element = null;
        this.launcher = null;
        this.panel = null;
    }

    /* ---------- composition ---------- */

    _autogrow() {
        const el = this._input;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }

    /** Programmatically set the composer text (e.g. a pre-filled greeting). */
    setInputValue(text) {
        if (this._input) {
            this._input.value = String(text ?? "");
            this._autogrow();
        }
    }

    send() {
        const text = this._input.value.trim();
        if (!text || this.isWaiting) {
            return;
        }
        this._input.value = "";
        this._autogrow();

        // Presentation side: show the user bubble immediately.
        this.addUserMessage(text);

        if (typeof this.sendHandler === "function") {
            this.sendHandler(text, this);
        } else {
            this.addSystemMessage("No send handler is registered for this chat window.");
        }
    }

    /* ---------- internal wiring ---------- */

    _bindWindow() {
        window.addEventListener("resize", () => {
            if (this.isOpen) {
                this._keepInViewport();
            }
        });

        if (this._panelBtn) {
            this._panelBtn.addEventListener("click", () => this.togglePanel());
        }
        if (this._minBtn) {
            this._minBtn.addEventListener("click", () => this.minimize());
        }
        const closeBtn = this.element.querySelector(".cw-close");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => this.close());
        }
        if (this.launcher) {
            this.launcher.addEventListener("click", () => this.open());
        }
        if (this._widgetLauncher) {
            this._widgetLauncher.addEventListener("click", () => this.open());
        }

        const header = this.element.querySelector(".cw-window-header");
        if (header && !this._flyout) {
            this._bindDragHeader(header);
        }

        if (this._sendButton) {
            this._sendButton.addEventListener("click", () => this.send());
        }
        if (this._input) {
            this._input.addEventListener("keydown", (event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    this.send();
                }
            });
            this._input.addEventListener("input", () => this._autogrow());
        }
    }

/* ---------- dragging / resizing ---------- */

    /** Drag the whole window by its header (ignores the action buttons). */
    _bindDragHeader(header) {
        header.style.touchAction = "none";
        header.addEventListener("pointerdown", (event) => {
            if (event.target.closest(".cw-window-actions")) {
                return; // let the buttons work normally
            }
            event.preventDefault();

            const rect = this.element.getBoundingClientRect();
            const startX = event.clientX;
            const startY = event.clientY;
            const startLeft = rect.left;
            const startTop = rect.top;
            const width = rect.width;
            const height = rect.height;

            this.element.classList.add("cw-dragging");

            const onMove = (moveEvent) => {
                const left = clampValue(
                    startLeft + (moveEvent.clientX - startX),
                    VIEWPORT_MARGIN,
                    Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
                );
                const top = clampValue(
                    startTop + (moveEvent.clientY - startY),
                    VIEWPORT_MARGIN,
                    Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN)
                );
                this.element.style.left = `${left}px`;
                this.element.style.top = `${top}px`;
            };
            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                this.element.classList.remove("cw-dragging");
            };

            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }

    /**
     * Resize the window from one of its 8 edges. Width/height are
     * clamped to the configured minimums and the viewport; the window
     * is also nudged back if it would slide off-screen.
     */
    _beginResize(edge, event) {
        event.preventDefault();

        const hasN = edge.includes("n");
        const hasS = edge.includes("s");
        const hasE = edge.includes("e");
        const hasW = edge.includes("w");

        const rect = this.element.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const start = { w: rect.width, h: rect.height, left: rect.left, top: rect.top };

        const onMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;

            let w = start.w;
            let h = start.h;
            let left = start.left;
            let top = start.top;

            if (hasE) {
                w = start.w + dx;
            }
            if (hasW) {
                w = start.w - dx;
            }
            if (hasS) {
                h = start.h + dy;
            }
            if (hasN) {
                h = start.h - dy;
            }

            w = clampValue(w, WINDOW_MIN_WIDTH, window.innerWidth - 16);
            h = clampValue(h, WINDOW_MIN_HEIGHT, window.innerHeight - 16);
            if (hasN) {
                top = start.top + (start.h - h);
            }
            if (hasW) {
                left = start.left + (start.w - w);
            }

            this.element.style.width = `${w}px`;
            this.element.style.height = `${h}px`;
            this.element.style.left = `${clampValue(left, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, window.innerWidth - w - VIEWPORT_MARGIN))}px`;
            this.element.style.top = `${clampValue(top, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, window.innerHeight - h - VIEWPORT_MARGIN))}px`;
        };

        const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
        };

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    }

    /** Keep the window fully inside the viewport (after open/resize). */
    _keepInViewport() {
        if (!this.element) {
            return;
        }
        const rect = this.element.getBoundingClientRect();

        // Only adjust left/top if the window has been dragged (has inline
        // positioning).  On first open the CSS uses right/bottom, and we
        // must not overwrite that with stale getBoundingClientRect values.
        const hasInlinePosition = this.element.style.left !== "" || this.element.style.top !== "";

        if (hasInlinePosition) {
            const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN);
            const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN);
            this.element.style.left = `${clampValue(rect.left, VIEWPORT_MARGIN, maxLeft)}px`;
            this.element.style.top = `${clampValue(rect.top, VIEWPORT_MARGIN, maxTop)}px`;
        }
    }

    /* ---------- message rendering ---------- */

    _buildBubble(message) {
        const role = message.role || "assistant";
        const bubble = createElement("div", {
            className: `cw-bubble cw-${role}`,
            dataset: { messageId: message.id },
        });

        // System notices have no avatar; everything else does.
        if (role !== "system") {
            const avatar = createElement("div", {
                className: `cw-bubble-avatar ${role === "user" ? "cw-user-avatar" : "cw-agent-avatar"}`,
            });
            avatar.textContent = role === "user" ? "U" : initials(message.author || this.name);
            bubble.appendChild(avatar);
        }

        const content = createElement("div", { className: "cw-bubble-content" });

        const head = createElement("div", { className: "cw-bubble-header" });
        const name = createElement("strong", {
            text: message.author || (role === "user" ? "You" : this.name),
        });
        const time = createElement("span", { text: formatTime(message.timestamp) });
        head.appendChild(name);
        head.appendChild(time);
        content.appendChild(head);

        const body = createElement("div", { className: "cw-bubble-body readout" });
        body.appendChild(this.renderMarkdown(message.content));
        content.appendChild(body);

        bubble.appendChild(content);
        return bubble;
    }

    _showTyping() {
        this._removeTyping();
        const bubble = createElement("div", { className: "cw-bubble cw-agent" });
        const content = createElement("div", { className: "cw-bubble-content" });
        const head = createElement("div", { className: "cw-bubble-header" });
        head.appendChild(createElement("strong", { text: this.name }));
        content.appendChild(head);
        const body = createElement("div", { className: "cw-bubble-body" });
        const dots = createElement("span", { className: "cw-typing" });
        dots.appendChild(document.createElement("span"));
        dots.appendChild(document.createElement("span"));
        dots.appendChild(document.createElement("span"));
        body.appendChild(dots);
        content.appendChild(body);
        bubble.appendChild(content);
        this._typingEl = bubble;
        this._messageBody.appendChild(bubble);
        this.scrollToBottom();
    }

    _removeTyping() {
        if (this._typingEl) {
            this._typingEl.remove();
            this._typingEl = null;
        }
    }

    /** Centered empty-state shown before the first message. */
    _renderWelcome() {
        if (this.messages.length > 0 || this._welcomeEl) {
            return;
        }
        const box = createElement("div", { className: "cw-welcome" });
        box.appendChild(createElement("h3", { text: "Start the conversation" }));
        box.appendChild(createElement("p", {
            text: `Chatting with ${this.name}. Type below to begin.`,
        }));
        if (this.description) {
            box.appendChild(createElement("p", { text: this.description }));
        }
        this._welcomeEl = box;
        this._messageBody.appendChild(box);
    }

    _removeWelcome() {
        if (this._welcomeEl) {
            this._welcomeEl.remove();
            this._welcomeEl = null;
        }
    }
}


/* ================================================================
   4. CHAT FACTORY
   ================================================================ */
// One entry point for creating chat instances from a config object.
// Different entities (AI agents, projects, workflows) all use the
// same engine - the config decides the name, layout and controls.

const ChatFactory = {
    /**
     * Build a configured ChatWindow.
     * @param {object} config - the entity config (see README / examples)
     * @returns {ChatWindow}
     */
    create(config) {
        return new ChatWindow(config);
    },
};


/* ================================================================
   SAMPLE CONFIGS (documentation / quick start)
   ================================================================ */
// These show how the SAME engine serves different entity types. The
// application does not need to touch chat-window.js to add new ones.

const CHAT_CONFIG_EXAMPLES = {
    agent: {
        id: "planner-agent",
        type: "agent",
        name: "Planner Agent",
        title: "AI Planning Assistant",
        description: "Creates structured plans for complex problems.",
        layout: { rightPanel: true, resizable: true, collapsible: true },
        sections: [
            {
                title: "Agent Information",
                fields: [
                    { type: "text", label: "Status", value: "Ready" },
                    { type: "text", label: "Category", value: "Technology" },
                ],
            },
            {
                title: "Actions",
                fields: [
                    { type: "button", label: "Create Plan", action: "createPlan" },
                    { type: "button", label: "Save Plan", action: "savePlan" },
                ],
            },
        ],
    },
    project: {
        id: "ai-factory",
        type: "project",
        name: "AI Factory",
        title: "Project Workspace",
        description: "A place to design and run AI workflows.",
        layout: { rightPanel: true, resizable: true, collapsible: true },
        sections: [
            {
                title: "Project Details",
                fields: [
                    { type: "input", name: "projectName", label: "Project Name", value: "AI Factory" },
                    { type: "select", name: "category", label: "Category", value: "Technology",
                        options: ["Business", "Teaching", "Technology"] },
                    { type: "toggle", name: "enabled", label: "Enable project", value: true },
                ],
            },
            {
                title: "Actions",
                fields: [
                    { type: "button", label: "Deploy", action: "deployProject" },
                ],
            },
        ],
    },
    business: {
        id: "marketing-workflow",
        type: "business",
        name: "Marketing Workflow",
        title: "Business Assistant",
        description: "Guides marketing campaigns from brief to report.",
        layout: { rightPanel: true, resizable: true, collapsible: true },
        sections: [
            {
                title: "Workflow Controls",
                collapsible: true,
                fields: [
                    { type: "text", label: "Stage", value: "Planning" },
                    { type: "select", name: "audience", label: "Audience", value: "General",
                        options: ["General", "Business", "Technical"] },
                    { type: "divider" },
                    { type: "button", label: "Approve Brief", action: "approveBrief" },
                ],
            },
        ],
    },
};


export { ChatFactory, ChatWindow, CHAT_CONFIG_EXAMPLES };
