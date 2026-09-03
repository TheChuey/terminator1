// ==========================================
// navigation.js - THE SHARED SIDEBAR LINKS
// ==========================================
// WHAT THIS MODULE DOES:
// Draws the sidebar nav links FROM THE REGISTRY instead of
// copy-pasting <a> tags into every HTML file:
//
//   routes.js (data)  ->  renderNavigation(#sidebar-nav)  ->  links
//
// The ACTIVE link is never hard-coded. It is computed from the URL on
// every render via resolveRoute() (see routes.js), exactly matching
// what the router will load.
//
// Adding a page in routes.js automatically adds its sidebar link here.
//
// CHAIN POSITION:
//   index.html -> app.js -> ui/shell.js -> ui/navigation.js

import { el, clear } from "../dom.js";
import { ROUTES, resolveRoute } from "../routes.js";


/**
 * Fill a container with one <a class="nav-item"> per registered page.
 * Marks the CURRENT page's link with .active (CSS styles it).
 *
 * container -> usually #sidebar-nav from index.html
 */
export function renderNavigation(container) {
    if (!container) {
        console.warn("[navigation] no sidebar-nav container found.");
        return;
    }

    clear(container);

    const activePath = resolveRoute().path;

    ROUTES.forEach((route) => {
        const link = el("a", "nav-item", route.label);
        link.href = `#${route.path}`;          // hash routing - see routes.js

        if (route.path === activePath) {
            link.classList.add("active");
        }

        container.appendChild(link);
    });
}
