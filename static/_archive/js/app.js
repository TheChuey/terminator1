// ==========================================
// app.js - ENTRY POINT (the ONLY script index.html loads)
// ==========================================
// BOOT ORDER:
//   1. initShell()        -> sidebar links + collapse toggle
//   2. startRouter(...)   -> reads the URL hash, mounts the first page
//
// After this everything is event-driven: hashchange swaps pages,
// clicks/fetches happen inside page modules.
//
// FULL ARCHITECTURE MAP (who owns what):
//
//   HTML      index.html           mounting points ONLY
//   CSS       css/*                appearance, zero structure logic
//   shell     ui/shell.js          sidebar + workspace skeleton
//   registry  routes.js            list of pages (ADD PAGES HERE)
//   routing   router.js            hash -> page module
//   pages     pages/*.js           renderPage(): markup + behavior
//   ui        ui/*.js              reusable visual components
//             ui/post-sections.js  config-driven input+button panels
//             ui/markdown.js       message text -> safe rich DOM
//   server I/O api_fetch.js        EVERY fetch() lives there
//   data      models.js            message/discussion factories

import { initShell, prepareWorkspace } from "./ui/shell.js";
import { startRouter } from "./router.js";

initShell();
startRouter({ prepareWorkspace });
