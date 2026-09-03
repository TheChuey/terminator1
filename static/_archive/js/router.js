// ==========================================
// router.js - HASH ROUTER (WHICH PAGE MODULE RUNS)
// ==========================================
// WHAT THIS MODULE DOES:
// Watches the URL hash ("#/chat", "#/agents", ...) and mounts the
// matching page module from the registry:
//
//   hashchange -> resolveRoute() -> import(pages/<module>.js)
//                                   -> renderPage({middle, bottom})
//
// WHY HASH ROUTING:
// The whole app is ONE index.html served at "/". Changing only the
// hash never touches the server, so refresh and deep links always
// work without extra server routes.
//
// EVERY page module exports the same contract:
//
//   export async function renderPage({ middle, bottom }) {...}
//
// Adding a page = one entry in routes.js + one module file. Nothing
// here changes.
//
// CHAIN POSITION:
//   index.html -> app.js -> router.js -> pages/*.js

import { el, clear } from "./dom.js";
import { resolveRoute } from "./routes.js";

let shellApi = null;   // { prepareWorkspace } handed over by app.js


/** Start listening and mount whatever page the URL asks for. */
export function startRouter(api) {
    shellApi = api;

    window.addEventListener("hashchange", mountCurrentPage);
    mountCurrentPage();
}


async function mountCurrentPage() {
    const route = resolveRoute();

    document.title = `${route.label} - AI Factory`;

    // Fresh workspace refs (rebuilds when the header mode changes,
    // e.g. leaving chat drops the agent header).
    const { middle, bottom } = shellApi.prepareWorkspace(route.header);

    clear(middle);
    clear(bottom);

    try {
        const page = await import(`./pages/${route.module}.js`);
        await page.renderPage({ middle, bottom });
    } catch (error) {
        console.error(`[router] could not mount "${route.module}":`, error);
        clear(middle);

        const box = el(
            "div",
            "empty-state",
            `Could not load this page: ${error.message}`
        );
        box.style.margin = "40px auto";
        middle.appendChild(box);
    }
}
