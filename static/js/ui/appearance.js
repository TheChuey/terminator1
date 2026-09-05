// ============================================================
// ui/appearance.js - APPEARANCE SETTINGS SECTION (index page)
// ============================================================
// Renders an "Appearance" section below the config on index.html
// with ONE global set of theme + font + base font-size settings.
// The same values are read by the standalone chat.html page, so
// changing them here restyles BOTH pages via the --app-font-family,
// --app-font-size CSS variables and the data-theme attribute
// (light / dark / system).
//
// Storage: settings.appearance = { theme, fontFamily, fontSize }
// persisted through the merging POST /api/settings.
// ============================================================

import { saveAppSettings } from "../api/api.js";

const THEME_OPTIONS = [
    { value: "system", label: "System (follows device)" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
];

const FONT_OPTIONS = [
    { value: "", label: "System default" },
    { value: "Arial, Helvetica, sans-serif", label: "Arial / Helvetica" },
    { value: "'Segoe UI', Tahoma, sans-serif", label: "Segoe UI" },
    { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
    { value: "Georgia, 'Times New Roman', serif", label: "Georgia (serif)" },
    { value: "'Courier New', monospace", label: "Courier New (mono)" },
];

const SIZE_OPTIONS = [13, 14, 15, 16, 17, 18];

const FONT_SIZE_LABELS = {
    13: "13px (small)",
    14: "14px",
    15: "15px",
    16: "16px (default)",
    17: "17px",
    18: "18px (large)",
};

/* Theme currently in effect on this page (used by the system-mode
   matchMedia listener so it keeps following the OS). */
let currentTheme = "system";
let systemListenerAttached = false;

/**
 * Apply a theme to the CURRENT page by setting data-theme on <html>.
 * "system" resolves through prefers-color-scheme and keeps following
 * OS changes for as long as the stored theme stays "system".
 */
export function applyTheme(theme) {
    currentTheme = theme === "dark" || theme === "light" ? theme : "system";
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const mode =
        currentTheme === "system"
            ? mq.matches ? "dark" : "light"
            : currentTheme;
    document.documentElement.dataset.theme = mode;

    if (!systemListenerAttached) {
        systemListenerAttached = true;
        mq.addEventListener("change", () => {
            if (currentTheme === "system") applyTheme("system");
        });
    }
}

/**
 * Apply the stored Appearance settings to the CURRENT page by setting its
 * root CSS variables. Safe with missing/empty values (defaults win).
 */
export function applyAppearance(appearance) {
    const font = (appearance && appearance.fontFamily) || "";
    const size = Number((appearance && appearance.fontSize) || 0);
    const theme = (appearance && appearance.theme) || "system";
    const root = document.documentElement;

    applyTheme(theme);

    if (font) {
        root.style.setProperty("--app-font-family", font);
    } else {
        root.style.removeProperty("--app-font-family");
    }
    if (size > 0) {
        root.style.setProperty("--app-font-size", size + "px");
    } else {
        root.style.removeProperty("--app-font-size");
    }
}

/**
 * Render the Appearance section into `mountEl`.
 *
 * @param {HTMLElement}  mountEl   - Container to append into
 * @param {object}       settings  - Full app settings object
 * @param {Function}     onSave    - (newSettings) => void after a successful save
 */
export function renderAppearance({ mountEl, settings = {}, onSave }) {
    const appearance = (settings && settings.appearance) || {};

    mountEl.appendChild(el("h2", "config-section-heading", "Appearance"));

    const intro = el(
        "p",
        "config-note",
        "One global set of theme + typography applied to BOTH this page and " +
        "the standalone chat page (static/chat.html). Saved to app_settings.json " +
        "and re-applied on every load."
    );
    mountEl.appendChild(intro);

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.style.padding = "16px";
    mountEl.appendChild(panel);

    // ---- Theme ----
    const themeField = document.createElement("label");
    themeField.className = "field";
    themeField.appendChild(document.createElement("span")).textContent = "Theme";
    const themeSelect = document.createElement("select");
    themeSelect.id = "appearance-theme";
    const currentThemeValue = appearance.theme || "system";
    THEME_OPTIONS.forEach((opt) => {
        const option = new Option(opt.label, opt.value);
        if (opt.value === currentThemeValue) option.selected = true;
        themeSelect.appendChild(option);
    });
    themeField.appendChild(themeSelect);
    panel.appendChild(themeField);

    // ---- Family ----
    const familyField = document.createElement("label");
    familyField.className = "field";
    familyField.appendChild(document.createElement("span")).textContent = "Font family";
    const familySelect = document.createElement("select");
    familySelect.id = "appearance-font-family";
    FONT_OPTIONS.forEach((opt) => {
        const option = new Option(opt.label, opt.value);
        if (opt.value === (appearance.fontFamily || "")) option.selected = true;
        familySelect.appendChild(option);
    });
    familyField.appendChild(familySelect);
    panel.appendChild(familyField);

    // ---- Size ----
    const sizeField = document.createElement("label");
    sizeField.className = "field";
    sizeField.appendChild(document.createElement("span")).textContent = "Base font size";
    const sizeSelect = document.createElement("select");
    sizeSelect.id = "appearance-font-size";
    const currentSize = Number(appearance.fontSize) || 16;
    SIZE_OPTIONS.forEach((size) => {
        const option = new Option(
            FONT_SIZE_LABELS[size] || size + "px",
            String(size)
        );
        if (size === currentSize) option.selected = true;
        sizeSelect.appendChild(option);
    });
    sizeField.appendChild(sizeSelect);
    panel.appendChild(sizeField);

    // ---- Live preview ----
    const preview = el(
        "div",
        "appearance-preview",
        "Aa The quick brown fox - chat bubbles, composer text and headers scale with this font."
    );
    panel.appendChild(preview);

    const refreshPreview = () => {
        preview.style.fontFamily = familySelect.value || "";
        preview.style.fontSize = sizeSelect.value + "px";
    };
    familySelect.addEventListener("change", refreshPreview);
    sizeSelect.addEventListener("change", refreshPreview);
    themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
    refreshPreview();

    // ---- Save ----
    const actions = document.createElement("div");
    actions.className = "section-actions";
    const saveBtn = el("button", "btn btn-primary", "Save appearance");
    const statusEl = el("span", "config-note", "");
    actions.appendChild(saveBtn);
    actions.appendChild(statusEl);
    panel.appendChild(actions);

    saveBtn.addEventListener("click", async () => {
        const payload = {
            appearance: {
                theme: themeSelect.value,
                fontFamily: familySelect.value.trim(),
                fontSize: Number(sizeSelect.value) || 0,
            },
        };
        saveBtn.disabled = true;
        try {
            const updated = await saveAppSettings(payload);
            applyAppearance(updated.appearance || payload.appearance);
            try {
                localStorage.setItem("appearance-theme", themeSelect.value);
            } catch (_) { /* private mode - ignore */ }
            if (typeof onSave === "function") onSave(updated);
            statusEl.textContent = "Appearance saved - both pages restart with it.";
            statusEl.style.color = "var(--color-success, #16803c)";
        } catch (error) {
            statusEl.textContent = error.message;
            statusEl.style.color = "var(--color-danger, #b91c1c)";
        } finally {
            saveBtn.disabled = false;
        }
    });

    return {
        values: () => ({
            theme: themeSelect.value,
            fontFamily: familySelect.value.trim(),
            fontSize: Number(sizeSelect.value) || 0,
        }),
    };
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}