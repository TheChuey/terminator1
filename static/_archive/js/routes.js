// ==========================================
// routes.js - THE PAGE REGISTRY (PURE DATA)
// ==========================================
// WHAT THIS FILE DOES:
// One array lists EVERY page of the app: its URL path, its sidebar
// label, which page module renders it, and whether the shared agent
// header (avatar + Agent/Model selects) shows on it.
//
// TWO kinds of modules read this file:
//   ui/navigation.js -> builds the sidebar links from ROUTES
//   router.js        -> picks which page module to load from ROUTES
//
// ============================================================
// HOW TO ADD A PAGE (the whole recipe - nothing else changes):
//
//   1. Create static/js/pages/tools.js exporting:
//
//        export async function renderPage({ middle, bottom }) {
//            middle.innerHTML = `...your page markup...`;
//            // then wire events / fetch data as usual
//        }
//
//   2. Add ONE entry to ROUTES below:
//
//        { path: "/tools", label: "Tools", module: "tools" }
//
//   The sidebar link, active-page highlighting and routing appear
//   automatically. Set header: true if the page needs the shared
//   agent header strip.
// ============================================================

export const ROUTES = [
    {
        path: "/chat",
        label: "Home",
        module: "chat",
        header: true,   // only the chat page shows the agent header
    },
    {
        path: "/agents",
        label: "AI Agents",
        module: "agents",
    },
    {
        path: "/discussions",
        label: "Discussions",
        module: "discussions",
    },
    {
        path: "/history",
        label: "History",
        module: "history",
    },
    {
        path: "/settings",
        label: "Settings",
        module: "settings",
    },
];

/** Page shown when the URL points nowhere (fresh visit at "/"). */
export const DEFAULT_PATH = "/chat";


/**
 * Where are we RIGHT NOW?
 *
 * Hash routing: "#/agents" means "/agents". Hash links change nothing
 * on the server, so refresh and deep links always work with a single
 * index.html.
 *
 * Falls back to the real pathname when it matches a route, so the app
 * keeps working even if real page paths are served someday.
 * Returns "/" when neither is usable; resolveRoute() maps that to the
 * default page.
 */
export function currentPath() {
    const hash = window.location.hash;

    if (hash && hash.startsWith("#/")) {
        return hash.slice(1);
    }

    const path = window.location.pathname;

    if (ROUTES.some((route) => route.path === path)) {
        return path;
    }

    return "/";
}


/**
 * The ROUTES entry for where we are (default page when unknown).
 * Used by BOTH the sidebar (active link) and the router (which page
 * module loads) so they can never disagree.
 */
export function resolveRoute(path = currentPath()) {
    return (
        ROUTES.find((route) => route.path === path) ||
        ROUTES.find((route) => route.path === DEFAULT_PATH)
    );
}
