// ==========================================
// shell.js - ONE CALL BUILDS THE WHOLE APP SHELL
// ==========================================
// WHAT THIS MODULE DOES:
// Composes the two shared visual components plus the collapse toggle:
//
//   initShell()         -> sidebar links + Collapse/Expand button
//   prepareWorkspace(h) -> workspace skeleton, returns {middle,bottom}
//
// It replaces the old ui/sidebar.js (its toggle logic moved into
// wireSidebarToggle below; active-link highlighting now lives in
// ui/navigation.js).
//
// TYPICAL USE (see app.js):
//   initShell();                        // once at boot
//   startRouter({ prepareWorkspace });  // router asks for fresh refs
//
// CHAIN POSITION:
//   index.html -> app.js -> ui/shell.js -> navigation.js + workspace.js

import { get } from "../dom.js";
import { renderNavigation } from "./navigation.js";
import { renderWorkspace } from "./workspace.js";

let sidebarReady = false;
let workspace = null;
let headerVisible = null;


/** Build the sidebar once and wire the collapse button. */
export function initShell() {
    if (sidebarReady) {
        return; // the sidebar is static shell furniture - build once
    }

    renderNavigation(get("#sidebar-nav"));
    wireSidebarToggle();

    sidebarReady = true;
}


/**
 * Make sure the workspace matches the requested header mode, then
 * return FRESH {middle, bottom} references for the page to fill.
 *
 * Rebuilding wipes previous page content, so the router calls this
 * BEFORE handing the refs to a page module.
 */
export function prepareWorkspace(showHeader) {
    showHeader = Boolean(showHeader);
    const container = get("#main-workspace");

    if (!workspace || headerVisible !== showHeader) {
        workspace = renderWorkspace(container, { header: showHeader });
        headerVisible = showHeader;
    }

    return { middle: workspace.middle, bottom: workspace.bottom };
}


/** Collapse/Expand behavior (unchanged from the old ui/sidebar.js). */
function wireSidebarToggle() {
    const sidebar = get("#sidebar");
    const toggleButton = get("#sidebar-toggle");

    if (!toggleButton || !sidebar) {
        return;
    }

    toggleButton.addEventListener("click", () => {
        // CSS does all visual work; we only flip one class.
        sidebar.classList.toggle("collapsed");

        const isCollapsed = sidebar.classList.contains("collapsed");
        toggleButton.textContent = isCollapsed ? "Expand" : "Collapse";
    });
}
