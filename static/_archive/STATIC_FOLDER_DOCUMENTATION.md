# STATIC FOLDER - COMPLETE DOCUMENTATION

> Single-page ChatGPT-style frontend for a FastAPI + Ollama backend.
> No build tools, no npm, no frameworks. Plain HTML, CSS, and JavaScript ES modules.
> One `index.html` serves the entire app; pages swap via hash routing.

---

# SECTION 1: FILE STRUCTURE & DEPENDENCIES

## 1.1 File Tree

```
static/
├── index.html                     [110 lines]  THE ONLY HTML PAGE - shell + wizard modal + hidden inputs
├── favicon.svg                    [1 line]     SVG icon served at /favicon.ico
├── README.md                      [613 lines]  Reference manual (human + AI readable)
├── config/
│   └── app_settings.json          [4 lines]    Browser-persisted defaults (agent/model/active discussion)
├── css/
│   ├── base.css                   [99 lines]   CSS variables, reset, typography - LOADS FIRST
│   ├── layout.css                 [343 lines]  App shell, sidebar, header, workspace, responsive
│   ├── components.css             [328 lines]  Buttons, forms, cards, badges, chips, modals
│   ├── thread.css                 [492 lines]  Chat messages, composer, typing indicator, wizard pills
│   └── board.css                  [725 lines]  Discussions two-pane layout, forum posts, composer dock
└── js/
    ├── app.js                     [29 lines]   ENTRY POINT - only script index.html loads
    ├── router.js                  [68 lines]   Hash router - URL -> page module
    ├── routes.js                  [104 lines]  Page registry (ADD PAGES HERE)
    ├── api_fetch.js               [264 lines]  THE ONLY file allowed to call fetch()
    ├── models.js                  [192 lines]  Data factories + tree helpers (pure logic)
    ├── dom.js                     [59 lines]   Tiny DOM helpers (get/el/clear)
    ├── events.js                  [45 lines]   Event bus (emit/on) for loose coupling
    ├── ui/
    │   ├── shell.js               [79 lines]   Sidebar + workspace skeleton builder
    │   ├── navigation.js          [49 lines]   Sidebar links FROM routes.js
    │   ├── workspace.js           [92 lines]   Main column: header?/middle/bottom
    │   ├── markdown.js            [207 lines]  Safe markdown -> DOM renderer
    │   ├── thread.js              [243 lines]  Chat message tree renderer (recursive)
    │   ├── message-actions.js     [139 lines]  Reply/Save/Copy/Edit/Delete button row
    │   ├── attachments.js         [124 lines]  File picker -> metadata chips
    │   ├── post-sections.js       [251 lines]  Config-driven input+button panel factory
    │   └── wizard.js              [462 lines]  3-step prompt builder + .md/.json export
    └── pages/
        ├── chat.js                [595 lines]  Main chat page - the conductor
        ├── agents.js              [139 lines]  Agent discovery grid
        ├── discussions.js         [1015 lines] Two-pane forum-style board
        ├── history.js             [195 lines]  Saved message snapshots
        └── settings.js            [200 lines]  Preferences + danger zone
```

**Total**: 1 HTML, 5 CSS, 17 JS modules, 1 JSON config, 1 SVG, 1 existing README.
**Total lines of code**: ~5,500+

## 1.2 Dependencies

**External dependencies: ZERO.**

This is a zero-dependency vanilla JavaScript application. There are:
- No npm packages
- No build tools (no Webpack, Vite, Rollup)
- No frameworks (no React, Vue, Svelte)
- No CSS preprocessors (no Sass, Less)
- No TypeScript
- No package.json

Everything uses native browser APIs: ES module `import/export`, `fetch()`, `document.createElement`, `EventTarget`, CSS custom properties, CSS Grid/Flexbox.

**Browser requirements**: Any modern browser supporting ES modules (`<script type="module">`), `fetch()`, CSS custom properties, `Array.from()`, template literals.

## 1.3 Server API Dependencies

The frontend depends on a FastAPI backend (`server.py` at project root) that serves:
- This `static/` folder at `/static/*`
- `index.html` at `/`
- API endpoints at `/api/*`

### API Endpoints Used

| Endpoint | Method | Purpose | Response Shape |
|----------|--------|---------|---------------|
| `/api/models` | GET | Ollama model list for dropdowns | `{models: [{id, name}]}` |
| `/api/agents` | GET | Agent folders from agent_library/ | `{agents: [{id, name, description, mode}]}` |
| `/api/chat` | POST | Send chat message to LLM | Body: `{message, model, agent_id, history}` -> `{reply: "..."}` |
| `/api/discussions` | GET | List all discussions | `{discussions: [Discussion]}` |
| `/api/discussions` | POST | Create/update discussion (upsert by id) | Body: Discussion -> `{saved, updatedAt}` |
| `/api/discussions/{id}` | DELETE | Delete one discussion | `{deleted}` |
| `/api/history` | GET | List saved message snapshots | `{history: [Message]}` |
| `/api/history` | POST | Save a message snapshot | Body: Message -> `{saved, savedAt}` |
| `/api/history/{id}` | DELETE | Unsave a message | `{deleted}` |
| `/api/settings` | GET | Load app settings | `{settings: AppSettings}` |
| `/api/settings` | POST | Merge partial settings | Body: partial AppSettings -> `{settings}` |
| `/api/exports` | POST | Save wizard prompt as .md + .json | Body: `{name, markdown, data}` -> `{saved, files}` |

### Storage Files on Server

| File | Contents |
|------|----------|
| `config/app_settings.json` | Browser defaults: `{defaultAgentId, defaultModel, activeDiscussionId}` |
| `data/discussions.json` | All conversations with threaded messages |
| `data/history.json` | Saved message snapshots |
| `data/exports/{name}.md` | Wizard prompt (human-readable) |
| `data/exports/{name}.json` | Wizard prompt (machine-readable) |

## 1.4 CSS Load Order

`index.html` loads stylesheets in this exact order:

```
1. base.css        ->  Design tokens (:root variables), box-sizing reset, typography
2. layout.css      ->  App shell (sidebar + main), workspace wrappers, responsive
3. components.css  ->  Buttons, forms, cards, badges, chips, modals, status messages
4. thread.css      ->  Chat page: messages, composer, typing dots, wizard pills
5. board.css       ->  Discussions page: two-pane grid, forum posts, composer dock
```

Each file depends on variables from `base.css`. Later files may extend classes from earlier files. This order must not change.

## 1.5 JavaScript Load Chain

```
index.html
  └── <script type="module" src="/static/js/app.js">   (ONLY script tag)
        ├── import { initShell, prepareWorkspace } from "./ui/shell.js"
        │     ├── import { get } from "../dom.js"
        │     ├── import { renderNavigation } from "./navigation.js"
        │     │     ├── import { el, clear } from "../dom.js"
        │     │     └── import { ROUTES, resolveRoute } from "../routes.js"
        │     └── import { renderWorkspace } from "./workspace.js"
        │           └── import { get } from "../dom.js"
        └── import { startRouter } from "./router.js"
              ├── import { el, clear } from "./dom.js"
              └── import { resolveRoute } from "./routes.js"
```

After boot, the router dynamically imports page modules on every navigation:
```
router.js -> import(`./pages/${route.module}.js`)
  pages/chat.js        imports from: dom, models, api_fetch, ui/thread, ui/message-actions, ui/attachments, ui/wizard
  pages/agents.js      imports from: dom, api_fetch, models
  pages/discussions.js  imports from: dom, api_fetch, models, ui/attachments, ui/post-sections, ui/markdown
  pages/history.js     imports from: dom, api_fetch, models, ui/markdown
  pages/settings.js    imports from: dom, api_fetch, ui/post-sections
```

---

# SECTION 2: HOW THE APPLICATION WORKS

## 2.1 Human-Readable Overview

AI Factory is a web application that lets you chat with local AI agents, manage threaded discussions, save interesting messages, and build structured prompts with an AI Wizard. It runs entirely in your browser, talking to a Python backend that manages storage and communicates with Ollama (local LLM runtime).

### The Five Pages

**Chat (Home)** - The main screen. You type messages, the AI replies. You can:
- Pick an agent and model from dropdowns in the header
- Reply to specific messages (creates threads)
- Edit your own messages inline
- Save messages to History for later
- Attach files (metadata only for now)
- Open the AI Wizard to build structured prompts
- Start a new conversation with the "New chat" button

**AI Agents** - Shows every agent found on the server as a card. Each card shows the agent's name, mode badge, and description. Press "Start chat" to create a new conversation with that agent and jump to the Chat page.

**Discussions** - A two-pane forum board. Left pane lists all saved conversations (stored on the server). Right pane shows the selected discussion as forum-style posts with nested replies. You can:
- Create new discussions from scratch
- Post replies to any message
- Edit/copy/save/delete individual posts
- Rename or delete discussions
- "Open in Chat" to continue a discussion with an AI agent
- NO AI calls happen here - this is a pure writing board

**History** - A list of every message you pressed "Save" on. Each is a permanent snapshot that never changes even if the original discussion is edited or deleted. You can copy text, unsave entries, or jump back to the source discussion.

**Settings** - Two sections:
1. Preferences: Pick default agent and model used when a chat opens
2. Danger Zone: Delete ALL server-stored data (discussions, history, settings) after confirmation

### The AI Wizard

A 3-step modal that helps you build a well-crafted prompt:
1. **Choose task**: Explain, Write, Code, Summarize, Brainstorm, or Freeform
2. **Details**: Answer 2-3 questions about your task (topic, audience, format, etc.)
3. **Review**: See the assembled prompt in an editable textarea. Then either:
   - "Use this prompt" drops it into the chat composer (you still press Send)
   - "Export .md + .json" saves two files on the server

### The Sidebar

Always visible on the left. Shows navigation links for all 5 pages. The active page is highlighted. A Collapse/Expand button shrinks it to icons only. On mobile (< 600px), it becomes a horizontal top bar.

## 2.2 Technical Architecture (For AI)

### Boot Sequence

```
1. Browser loads index.html
   - 5 CSS files loaded in order
   - 1 <script type="module" src="/static/js/app.js">

2. app.js executes:
   a. initShell()          -> renders sidebar nav links into #sidebar-nav
                            -> wires Collapse/Expand toggle on #sidebar-toggle
   b. startRouter()        -> reads current URL hash
                            -> calls mountCurrentPage()

3. mountCurrentPage():
   a. resolveRoute()       -> matches hash to ROUTES[] entry
   b. prepareWorkspace()   -> builds workspace skeleton inside #main-workspace
                            -> returns {middle, bottom} element refs
   c. clear(middle/bottom) -> wipes previous page content
   d. import(pages/*.js)   -> dynamic ES module import
   e. renderPage({middle, bottom})  -> page injects markup, grabs refs, wires events
```

### The Page Mount Contract

Every page module MUST export exactly this function:

```javascript
export async function renderPage({ middle, bottom }) {
    middle.innerHTML = `...markup...`;   // inject FIRST
    bottom.innerHTML = `...composer...`; // if needed
    // THEN grab element refs
    // THEN wire event listeners
    // THEN fetch data and populate
}
```

The router calls this on EVERY visit to the page. The `middle` and `bottom` elements are fresh containers managed by `ui/workspace.js`. Pages never touch the sidebar or the app shell.

### Hash Routing

The app uses hash-based routing (`#/chat`, `#/agents`, etc.) so the entire SPA is one HTML page. Changing the hash never contacts the server, so deep links and page refresh always work.

Route resolution:
1. Read `location.hash` -> extract path (e.g., `#/chat` -> `/chat`)
2. Find matching entry in `ROUTES[]` from `routes.js`
3. Fall back to `DEFAULT_PATH` (`/chat`) if no match
4. The sidebar and router BOTH use `resolveRoute()` so they never disagree

### Adding a New Page

1. Create `static/js/pages/newpage.js` exporting `renderPage({ middle, bottom })`
2. Add one entry to `ROUTES` in `routes.js`:
   ```javascript
   { path: "/newpage", label: "New Page", module: "newpage" }
   ```
3. Done. Sidebar link, active highlight, routing, document title - all automatic.

### Data Ownership Rules

```
FRONTEND owns:
  - Current discussion object (in-memory, in chat.js or discussions.js)
  - UI state (reply targets, selections, typing status)
  - History of what to send to the LLM

SERVER owns:
  - All persistence (discussions.json, history.json, app_settings.json, exports/)
  - Agent/model discovery (agent_library/ scan, Ollama scan)

LLM (Ollama) owns:
  - NOTHING between requests. It is stateless.
  - The frontend sends full conversation history with every /api/chat request.
```

### Module Dependency Graph

```
CORE MODULES (never import ui/ or pages/):
  dom.js         - DOM helpers
  events.js      - Event bus
  models.js      - Data factories + pure logic
  routes.js      - Page registry (pure data)
  api_fetch.js   - Network boundary (only file that calls fetch())
  router.js      - Hash routing logic

UI MODULES (import core only, may import other ui/):
  shell.js       - Composes navigation.js + workspace.js
  navigation.js  - Sidebar links from routes.js
  workspace.js   - Main column skeleton
  markdown.js    - Safe text -> DOM
  thread.js      - Chat message tree (uses markdown.js)
  message-actions.js - Button row per message
  attachments.js - File picker -> chips
  post-sections.js - Config-driven panel factory
  wizard.js      - Prompt builder modal

PAGE MODULES (import core + ui):
  chat.js        - The conductor: imports 12 modules
  agents.js      - Simple: dom + api_fetch + models
  discussions.js - Complex: dom + api_fetch + models + 3 ui modules
  history.js     - Simple: dom + api_fetch + models + markdown
  settings.js    - Simple: dom + api_fetch + post-sections
```

**Import direction rule**: `pages/* -> ui/* -> core modules`. Never the reverse.

### The Threading Model

Discussions contain messages that form a tree via `parentId`:

```
message A (parentId: null)       <- top-level post
  message B (parentId: "A")      <- reply to A
    message C (parentId: "B")    <- reply to B (nested)
  message D (parentId: "A")      <- another reply to A
```

- `childMessages(discussion, parentId)` returns direct replies
- `removeMessageAndChildren(discussion, id)` removes a message AND all descendants (iterative, not recursive - uses a stack)
- Rendering recurses: `createMessageElement()` draws one message, then calls itself for each child inside `.message-replies`

### The Markdown Renderer

`ui/markdown.js` is the ONE renderer used everywhere text appears (chat bubbles, board posts, history rows). It handles:

**Blocks** (split on blank lines):
- Fenced code: ` ```code``` ` -> `<pre><code>`
- Bullet lists: lines starting with `- ` or `* ` -> `<ul><li>`
- Numbered lists: lines starting with `1.` or `1)` -> `<ol><li>`
- Paragraphs: everything else -> `<p>` with `white-space: pre-line`

**Inline** (left-to-right scan, longest match wins):
- `` `code` `` -> `<code>`
- `**bold**` -> `<strong>`
- `*italic*` -> `<em>`
- `[text](https://link)` -> `<a>` (http/https only)

**Safety**: Never uses `innerHTML`. Every character placed via `createElement` + `textContent`. Link hrefs restricted to `http(s)://`.

### The Event Bus

`events.js` provides a private `EventTarget` for loosely-coupled communication between modules:

```javascript
emit("discussion:updated", discussion);      // sender
on("discussion:updated", (event) => {...});  // listener (returns off() function)
```

Currently minimally used (most communication is direct function calls), but available for decoupling.

### The Post-Section Factory

`ui/post-sections.js` builds complete form sections from configuration objects:

```javascript
createPostSection({
    mount: "#container",
    title: "Preferences",
    description: "...",
    inputs: [{ id, label, tag, placeholder, options, value }],
    buttons: [{ label, fetch, collect, okMessage }],
    footerNote: "..."
});
```

Used by: Settings page (preferences + danger zone) and Discussions page (start panel). Buttons can be:
- **Server-connected**: `{ label, fetch, collect, okMessage }` - auto-disables during fetch, shows status
- **Plain local**: `{ label, onClick }` - just runs a callback

### State Management Per Page

**chat.js** (module-level lets, refreshed per mount):
- `agents[]` - from GET /api/agents
- `discussion` - the CURRENT conversation object
- `replyTargetId` - message being replied to (or null)
- `isWaitingForReply` - blocks double-sends
- `attachmentPicker` - created once, retargeted on re-render
- `wizardBound` - ensures wizard listeners bound exactly once

**discussions.js**:
- `discussions[]` - mirror of server state
- `selectedId` - which discussion is open
- `replyTargetId` - post being replied to
- `attachmentPicker` - created once, retargeted

**All other pages**: fetch data on mount, render, no persistent state.

### Persistence Flow

Every mutation follows the same optimistic pattern:

```
1. Update the local in-memory object immediately (UI feels instant)
2. Call api_fetch.js function to persist to server (fire-and-forget with .catch)
3. If server fails: log a warning, keep the local change (UI stays responsive)
```

The `activeDiscussionId` in app_settings.json ensures that returning to the Chat page restores the last conversation.

### Key Invariants (Never Break These)

1. **One HTML page.** `index.html` has mounting points only. All markup built by JS.
2. **Network boundary.** ONLY `api_fetch.js` may call `fetch()`.
3. **Server persistence.** Everything persists through api_fetch.js. No localStorage.
4. **Stateless LLM.** `/api/chat` remembers nothing. Frontend sends history every time.
5. **Threading model.** Messages form a tree via `parentId`. Rendering recurses.
6. **Import direction.** `pages -> ui -> core`. Never reverse.
7. **Page mount contract.** Every page exports `renderPage({middle, bottom})`. Inject markup FIRST, then refs, then events.
8. **Safe rendering.** Message text NEVER touches innerHTML. Always createElement + textContent.
9. **Separation.** JS builds DOM and toggles classes. CSS owns all visuals.

---

# SECTION 3: AI REPLICATION PROMPT

> Copy everything below this line into an AI assistant to have it recreate the
> entire `static/` folder. This prompt is self-contained - it includes every
> specification, data shape, CSS variable, API endpoint, and behavioral rule
> needed to build the complete frontend from scratch.

---

## BEGIN REPLICATION PROMPT

```
You are building a complete vanilla JavaScript single-page application frontend.
No frameworks, no build tools, no npm. Pure HTML, CSS, and ES modules.

OUTPUT: Create every file listed below inside a `static/` folder. Each file must
be complete, functional, and match the specifications exactly.

## THE FILE LIST

static/
├── index.html
├── favicon.svg
├── config/app_settings.json
├── css/base.css
├── css/layout.css
├── css/components.css
├── css/thread.css
├── css/board.css
├── js/app.js
├── js/router.js
├── js/routes.js
├── js/api_fetch.js
├── js/models.js
├── js/dom.js
├── js/events.js
├── js/ui/shell.js
├── js/ui/navigation.js
├── js/ui/workspace.js
├── js/ui/markdown.js
├── js/ui/thread.js
├── js/ui/message-actions.js
├── js/ui/attachments.js
├── js/ui/post-sections.js
├── js/ui/wizard.js
├── js/pages/chat.js
├── js/pages/agents.js
├── js/pages/discussions.js
├── js/pages/history.js
└── js/pages/settings.js

## ARCHITECTURE RULES (MUST FOLLOW ALL OF THESE)

1. index.html is the ONLY HTML file. It contains mounting points only - no page markup.
2. index.html loads exactly ONE script: <script type="module" src="/static/js/app.js">
3. CSS loads in this order: base.css -> layout.css -> components.css -> thread.css -> board.css
4. ONLY js/api_fetch.js may call fetch(). No other file touches the network.
5. Message text NEVER touches innerHTML. Always use createElement + textContent for safe rendering.
6. Every page module exports: async function renderPage({ middle, bottom })
7. Import direction: pages/* -> ui/* -> core modules (dom, events, models, routes, api_fetch, router). Never reverse.
8. The server is stateless for the LLM - the frontend must send full conversation history with every /api/chat request.
9. All persistence goes through the server (api_fetch.js). No localStorage.
10. Messages form a tree via parentId (null = top-level). Rendering must recurse.

## CSS DESIGN TOKENS (base.css :root)

```css
:root {
    --color-primary: #075985;
    --color-primary-dark: #064e78;
    --color-sidebar: #064f86;
    --color-background: #f5f7f9;
    --color-surface: #ffffff;
    --color-surface-alt: #fafafa;
    --color-text: #263238;
    --color-text-soft: #374151;
    --color-text-muted: #64748b;
    --color-text-faint: #9ca3af;
    --color-border: #e1e5e8;
    --color-border-strong: #cbd5e1;
    --color-accent: #dbeafe;
    --color-danger: #b91c1c;
    --color-success: #16803c;
    --sidebar-width: 220px;
    --sidebar-collapsed-width: 70px;
    --content-max-width: 850px;
    --radius-small: 5px;
    --radius-medium: 8px;
    --shadow-panel: 0 1px 3px rgba(15, 23, 42, 0.08);
    --shadow-modal: 0 10px 40px rgba(15, 23, 42, 0.25);
}
```

## DATA SHAPES

### Attachment
```javascript
{ id: "att-x1", name: "notes.txt", size: 4096, type: "text/plain" }
```

### Message (created by models.createMessage)
```javascript
{
    id: "msg-xxxxx",           // makeId("msg") format
    discussionId: "disc-xxxxx",
    parentId: null,            // null = top-level; else id of parent message
    role: "user" | "assistant",
    author: "You" | "<agent name>" | "System",
    text: "...",
    attachments: [],           // array of Attachment objects
    timestamp: "2026-08-22T18:20:00.000Z",
    edited: false,
    saved: false
}
```

### Discussion (created by models.createDiscussion)
```javascript
{
    id: "disc-xxxxx",
    title: "...",
    agentId: "" | "<agent_library folder name>",
    agentName: "",
    model: "" | "<ollama model id>",
    createdAt: ISO,
    updatedAt: ISO,            // server stamps this
    messages: []               // array of Message objects
}
```

### App Settings (config/app_settings.json)
```javascript
{ defaultAgentId: "", defaultModel: "", activeDiscussionId: "" }
```

## API ENDPOINTS (api_fetch.js must wrap ALL of these)

| Function | Method | Endpoint | Body | Response |
|----------|--------|----------|------|----------|
| getModels() | GET | /api/models | - | {models: [{id, name}]} |
| getAgents() | GET | /api/agents | - | {agents: [{id, name, description, mode}]} |
| sendChat({message, agentId, model, history}) | POST | /api/chat | {message, model, agent_id, history: [{role, content}]} | {reply: "..."} |
| listDiscussions() | GET | /api/discussions | - | {discussions: [...]} |
| pushDiscussion(discussion) | POST | /api/discussions | Discussion object | {saved, updatedAt} |
| removeDiscussionApi(id) | DELETE | /api/discussions/{id} | - | {deleted} |
| listHistory() | GET | /api/history | - | {history: [...]} |
| saveToHistory(message) | POST | /api/history | Message + {saved: true} | {saved, savedAt} |
| removeFromHistory(id) | DELETE | /api/history/{id} | - | {deleted} |
| loadAppSettings() | GET | /api/settings | - | {settings: {...}} |
| storeAppSettings(partial) | POST | /api/settings | partial settings | {settings: {...}} |
| exportWizardFiles({name, markdown, data}) | POST | /api/exports | {name, markdown, data} | {saved, files} |

The request() helper must:
- Prepend API_BASE_URL (empty string by default = same origin)
- Always send Content-Type: application/json
- Throw readable errors for non-OK HTTP status and network failures
- Parse response as JSON

## ROUTES (routes.js)

```javascript
export const ROUTES = [
    { path: "/chat", label: "Home", module: "chat", header: true },
    { path: "/agents", label: "AI Agents", module: "agents" },
    { path: "/discussions", label: "Discussions", module: "discussions" },
    { path: "/history", label: "History", module: "history" },
    { path: "/settings", label: "Settings", module: "settings" },
];
export const DEFAULT_PATH = "/chat";
```

`header: true` means the agent header strip (avatar, selects, buttons) renders above the workspace for that page. Only chat has it.

## index.html SPECIFICATION

The body contains:

1. `<div class="app-shell">` containing:
   - `<aside class="sidebar" id="sidebar">` with:
     - `<div class="logo">AI Factory</div>`
     - `<nav class="sidebar-nav" id="sidebar-nav"></nav>` (JS fills this)
     - `<button class="sidebar-toggle" id="sidebar-toggle">Collapse</button>`
   - `<main class="main" id="main-workspace"></main>` (JS fills this)

2. Wizard modal (persistent, shared):
   ```html
   <div class="modal-overlay hidden" id="wizard-overlay">
     <div class="modal" role="dialog" aria-modal="true">
       <header class="modal-header">
         <h2 id="wizard-title">AI Wizard</h2>
         <button class="modal-close" id="wizard-close-button">&times;</button>
       </header>
       <div class="wizard-steps" id="wizard-steps"></div>
       <div class="modal-body" id="wizard-body"></div>
       <footer class="modal-footer">
         <button class="btn btn-secondary" id="wizard-back-button">Back</button>
         <button class="btn btn-secondary hidden" id="wizard-export-button">Export .md + .json</button>
         <button class="btn btn-primary" id="wizard-next-button">Next</button>
       </footer>
     </div>
   </div>
   ```

3. Hidden file inputs:
   ```html
   <input type="file" id="file-input" multiple class="hidden">
   <input type="file" id="board-file-input" multiple class="hidden">
   ```

4. Script tag: `<script type="module" src="/static/js/app.js"></script>`

## app.js SPECIFICATION

Entry point. Two calls:
```javascript
import { initShell, prepareWorkspace } from "./ui/shell.js";
import { startRouter } from "./router.js";
initShell();
startRouter({ prepareWorkspace });
```

## dom.js SPECIFICATION

Four helpers:
- `get(selector)` -> document.querySelector
- `getAll(selector)` -> Array.from(document.querySelectorAll)
- `clear(element)` -> element.replaceChildren()
- `el(tag, className="", text="")` -> create element with optional class and textContent

## events.js SPECIFICATION

Private EventTarget bus:
- `emit(name, detail=null)` -> dispatches CustomEvent
- `on(name, callback)` -> addEventListener, returns off() function

## models.js SPECIFICATION

Factories and helpers:
- `makeId(prefix="id")` -> `"${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}"`
- `createAttachment({name, size=0, type=""})` -> Attachment object
- `createMessage({discussionId, parentId=null, role, author, text, attachments=[]})` -> Message object
- `createDiscussion({title="New discussion", agentId="", agentName="", model=""})` -> Discussion object
- `isEmpty(discussion)` -> boolean
- `findMessage(discussion, messageId)` -> message or null
- `childMessages(discussion, parentId)` -> array of direct child messages
- `removeMessageAndChildren(discussion, messageId)` -> removes subtree iteratively (use stack, not recursion), returns count removed
- `buildApiHistory(messages, maxTurns=20)` -> last N messages as `[{role, content}]`
- `formatTimestamp(isoString)` -> today: "HH:MM", other days: "Mon DD, HH:MM"
- `formatBytes(bytes)` -> "4 KB", "1.2 MB", etc.

## router.js SPECIFICATION

- `startRouter(api)` -> stores {prepareWorkspace}, listens to "hashchange", calls mountCurrentPage()
- mountCurrentPage(): resolveRoute() -> prepareWorkspace(route.header) -> clear middle/bottom -> dynamic import(`./pages/${route.module}.js`) -> renderPage({middle, bottom})
- Sets document.title to "${route.label} - AI Factory"
- On import error: shows error message in middle area

## ui/shell.js SPECIFICATION

- `initShell()` -> called once at boot. Renders sidebar nav into #sidebar-nav, wires collapse toggle.
- `prepareWorkspace(showHeader)` -> if header mode changed, rebuilds #main-workspace skeleton. Returns {middle, bottom} fresh refs.
- Collapse toggle: sidebar.classList.toggle("collapsed"), button text changes between "Collapse"/"Expand"

## ui/navigation.js SPECIFICATION

- `renderNavigation(container)` -> fills container with `<a class="nav-item" href="#<path>">` for each ROUTES entry. Marks current page with `.active` class using resolveRoute().

## ui/workspace.js SPECIFICATION

- `renderWorkspace(container, {header=false})` -> replaces container with:
  - Optional agent header strip (only when header=true):
    ```html
    <header class="agent-header">
      <div class="agent-title">
        <div class="avatar agent-avatar large" id="agent-avatar">AI</div>
        <div>
          <h1 id="agent-name">Loading...</h1>
          <p id="agent-description">Connecting to the server</p>
        </div>
      </div>
      <div class="header-controls">
        <label>Agent <select id="agent-select"></select></label>
        <label>Model <select id="model-select"></select></label>
        <button class="btn btn-secondary btn-small" id="new-chat-button">New chat</button>
        <button class="btn btn-primary btn-small" id="wizard-open-button">AI Wizard</button>
        <span class="status hidden" id="connection-status"><span class="status-dot"></span> Online</span>
      </div>
    </header>
    ```
  - `<section class="workspace-middle" id="workspace-middle"></section>`
  - `<section class="workspace-bottom" id="workspace-bottom"></section>`
  - Returns {root, header, middle, bottom}

## ui/markdown.js SPECIFICATION

Safe markdown renderer. NEVER uses innerHTML.

INLINE_RULES array:
```javascript
const INLINE_RULES = [
    { tag: "code", re: /`([^`\\n]+)`/ },
    { tag: "strong", re: /\\*\\*([^*\\n]+)\\*\\*/ },
    { tag: "em", re: /\\*([^*\\n]+)\\*/ },
    { tag: "a", re: /\\[([^\\]\\n]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/ },
];
```

`renderMarkdown(text)` -> DocumentFragment of <p>, <pre>, <ul>, <ol> nodes.
- Split on ``` first (odd chunks = code blocks, even chunks = normal text)
- Normal text split on blank lines into blocks
- Each block: all lines start with -/* -> <ul>, all start with 1./1) -> <ol>, else -> <p>
- Inline rendering: left-to-right scan, earliest match wins, longest match breaks ties
- Links open in new tab with rel="noopener noreferrer"

## ui/thread.js SPECIFICATION

Chat message tree renderer (recursive).

- `createMessageElement(discussion, message, buildActions)` -> <article class="message"> with:
  - Avatar (".avatar" + ".agent-agent" for assistants, "U"/"AI" text)
  - Content: header (author + timestamp + edited tag) + body (markdown + attachment chips)
  - Actions row from buildActions(message) callback
  - Recursively: .message-replies containing child messages (sorted by timestamp)
- `renderThread(threadElement, discussion, buildActions)` -> clears container, draws top-level messages
- `appendMessage(threadElement, discussion, message, buildActions)` -> adds one message, removes welcome if present, scrolls to bottom
- `scrollToBottom(threadElement)` -> scrollTop = scrollHeight
- `showTypingIndicator(threadElement)` / `removeTypingIndicator(el)` -> pulsing dots bubble

Message classes: `.user-message` (right-aligned, padding-left) | `.agent-message` (left-aligned, blue left border)

## ui/message-actions.js SPECIFICATION

Builds button row under messages: Reply | Save/Unsave | Copy | Edit (user only) | Delete.

- `buildMessageActions(message, handlers)` -> div.message-actions with buttons
  - handlers: { onReply(m), onSaveToggle(m), onDelete(m), onEditFinish(m, newText) }
  - Copy uses navigator.clipboard.writeText with window.prompt fallback
  - Edit only shown for role="user" messages
- `startInlineEdit(article, message, onFinish)` -> swaps body for textarea + Save/Cancel. Ctrl/Cmd+Enter saves.

## ui/attachments.js SPECIFICATION

File picker -> metadata chips.

- `initAttachmentPicker(parts)` -> parts = {button, input, list}
  - Returns: { getAttachments(), clear(), retarget({button, list}) }
  - Keeps only metadata (name, size, type) via createAttachment()
  - The hidden input PERSISTS across page mounts; use retarget() to point at new button/list
  - Chips show filename + remove button (x)

## ui/post-sections.js SPECIFICATION

Config-driven panel factory.

- `createPostSection({mount, className, title, description, note, inputs, buttons, footerNote, beforeInputs})`
  - inputs: [{id, label, tag:"input"|"textarea"|"select", placeholder, rows, options:[{value,label}], value}]
  - buttons: [{label, className, fetch?, collect?, okMessage?, onClick?, onSuccess?}]
  - Returns: {root, actionsRow, statusEl, input(id), values(), setStatus(msg, kind)}
  - fetch-buttons: disable -> collect(values()) -> await fetch(payload) -> green/red status -> re-enable
  - Status auto-clears after 4 seconds

## ui/wizard.js SPECIFICATION

3-step prompt builder modal.

WIZARD_TASKS data (6 tasks):
1. explain: questions = [topic, audience, format]; template builds "Explain X to Y..."
2. write: questions = [kind, about, tone]; template builds "Write X about..."
3. code: questions = [goal, detail, language]; template builds "I need help with code..."
4. summarize: questions = [text, style, focus]; template builds "Summarize the following..."
5. brainstorm: questions = [goal, count, constraints]; template builds "Brainstorm N for..."
6. freeform: questions = [goal]; template = goal as-is

Exports:
- `initWizard(ui, onUsePrompt)` -> bind once. ui = {overlay, steps, body, back, next, close, exportButton}
- `openWizard()` -> reset to step 0, show modal
- `closeWizard()` -> hide modal

Step flow:
- Step 0: Grid of task buttons (.wizard-task-grid)
- Step 1: Input fields for chosen task's questions
- Step 2: Editable textarea preview + export name field + "Export .md + .json" button
- "Next" on step 2 calls onUsePrompt(previewText) then closes
- "Export" on step 2 calls exportWizardFiles() via api_fetch.js

Export slugifies the name (lowercase, hyphens, max 80 chars), builds:
- .md: "# Task Label\n\n*Created with the AI Factory wizard on YYYY-MM-DD.*\n\n<prompt>\n"
- .json: {name, taskId, taskLabel, createdAt, prompt, answers}

## pages/chat.js SPECIFICATION

The conductor page. Imports 12 modules.

State: agents[], discussion, replyTargetId, isWaitingForReply, attachmentPicker, wizardBound

Mount:
1. Inject thread into middle, reply area into bottom
2. grabRefs() for all element ids
3. setupAttachments() - create picker once, retarget on re-mount
4. setupWizard() - bind wizard modal listeners once (using wizardBound guard)
5. loadServerLists() - fill agent/model selects from GET /api/agents and /api/models
6. Restore active discussion from loadAppSettings() -> findStoredDiscussion(), or make fresh with defaults
7. Render thread, show connection status

Send flow:
1. sendMessage(): create user Message (parentId = replyTargetId), push to discussion
2. First message names the discussion (truncated to 50 chars)
3. Clear input, cancel reply, persist to server, append message to thread
4. requestReply(): show typing indicator, call sendChat() with buildApiHistory()
5. On success: create assistant Message (same parentId as the user message it answers), persist, append
6. On failure: create System error bubble, append
7. Always: re-enable send button, focus input

Event wiring:
- Send button click + Enter (Shift+Enter = newline)
- Agent/model select changes -> update discussion + header + persist
- New chat -> makeNewDiscussion() + redraw
- Reply cancel button
- Wizard callback: sets #message-input value to the finished prompt

## pages/agents.js SPECIFICATION

Simple page. Injects .page with #agent-grid and #agent-status-area.
Fetches agents -> draws one card per agent (name, mode badge, description, "Start chat" button).
Start chat flow:
1. storeAppSettings({defaultAgentId: agent.id})
2. createDiscussion({title: "Chat with " + agent.name, agentId, agentName})
3. pushDiscussion(fresh)
4. storeAppSettings({activeDiscussionId: fresh.id})
5. location.hash = "#/chat"

Empty state and error state with Retry button.

## pages/discussions.js SPECIFICATION

Two-pane board. Most complex page (1015 lines).

LEFT PANE: Scrollable list of discussions (newest first). Each row: icon + title + meta (post count + timestamp). Hover/active reveals Rename/Delete buttons. Keyboard accessible (Tab, Enter/Space). "+ New Conversation" button in footer.

RIGHT PANE: Post board with forum-style cards.
- Header: title, subtitle (agent name + post count), "Open in Chat" + "Delete" buttons
- Scrollable area with recursive posts
- Each post: flex ROW [post-main | post-rail]
  - post-main: header (avatar + author + time + model badge) + body (renderMarkdown) + nested replies
  - post-rail: Reply | Edit | Copy | Save | Del buttons (data-driven POST_RAIL_BUTTONS array)

COMPOSER DOCK (in workspace-bottom):
- When discussion selected: composer with textarea + side buttons (Attach, Tools, Memory) + footer (hint + Post button)
- When nothing selected: start panel built by createPostSection (title + textarea + "Create discussion" button)

Persistence: optimistic pattern - update local mirror, pushDiscussion() fire-and-forget.

Post rail buttons are data (POST_RAIL_BUTTONS array). Add an entry = add a button. Handlers receive (discussion, message, article, button).

No LLM calls on this page.

## pages/history.js SPECIFICATION

Lists saved messages newest-first. Each row is a panel with:
- Meta line: author - timestamp - source title
- Body: renderMarkdown(message.text)
- Buttons: Copy | Unsave | Open source (if source discussion still exists)

Fetches both listHistory() and listDiscussions() in parallel. Known discussion IDs enable "Open source" button.

## pages/settings.js SPECIFICATION

Two post-sections built via createPostSection:
1. Preferences: default agent select + default model select + Save button -> storeAppSettings()
2. Danger zone: "Delete all server data" button -> confirm -> loop through all discussions (delete each) + all history (delete each) + reset settings -> status message

Error fallback with Retry button when server unreachable.

## CSS SPECIFICATIONS

### base.css
- Box-sizing reset on all elements
- html/body: full width, min-height 100%, margin/padding 0
- body: font Arial, background var(--color-background), color var(--color-text), font-size 16px, line-height 1.5
- h1/h2/h3: line-height 1.25
- a: color var(--color-primary)
- code: padding 2px 5px, border-radius var(--radius-small), background #eef2f6, monospace

### layout.css
- .app-shell: flex row, full width, min-height 100vh
- .sidebar: flex 0 0 var(--sidebar-width), column, blue bg, white text, transition on flex-basis/width
- .logo: flex 0 0 auto, padding 15px, margin-bottom 20px, font-size 20px, font-weight 600
- .sidebar-nav: flex column, gap 4px
- .nav-item, .sidebar-toggle: full width, no border, border-radius small, padding 12px 15px, transparent bg, white text, left-aligned
- .nav-item:hover, .active, .toggle:hover: bg rgba(255,255,255,0.14)
- .sidebar-toggle: flex 0 0 auto, margin-top 20px
- .main: flex 1 1 auto, column, width 0, min-width 0, min-height 100vh, white bg
- .page: flex 1 1 auto, overflow-y auto, padding clamp(20px, 4vw, 40px)
- .page-header: max-width 900px, margin-bottom 25px
- .agent-header: flex, wrap, space-between, gap 12px 20px, padding, border-bottom
- .agent-title: flex, center, gap 12px
- .header-controls: flex, wrap, center, gap 10px
- .status: color success, font-size 14px, nowrap
- .status-dot: 8x8px circle, green bg
- .sidebar.collapsed: flex-basis/width = var(--sidebar-collapsed-width), logo font-size 0, nav-item font-size 0
- .workspace-middle: flex column, flex 1 1 auto, min-height 0
- .workspace-bottom: flex 0 0 auto
- .workspace-bottom .composer-dock: padding responsive
- Breakpoints: 800px (narrower sidebar), 600px (sidebar -> top bar, flex-direction column)

### components.css
- .btn: border transparent, radius small, padding 9px 16px, inherit font, cursor pointer
- .btn:disabled: opacity 0.5, cursor not-allowed
- .btn-primary: bg primary, white text; hover: bg primary-dark
- .btn-secondary: border strong, white bg, soft text; hover: border primary, color primary
- .btn-danger: border #f3c1c1, bg #fff5f5, danger color; hover: bg #fde8e8
- .btn-small: padding 6px 12px, font-size 13px
- .field: flex column, gap 6px, margin-bottom 16px, font-size 14px
- .field select/input/textarea: full width, border strong, radius small, padding 9px 12px; focus: border primary + glow
- .panel: max-width 900px, border, radius medium, white bg, shadow panel, padding 20px, margin-bottom 18px
- .card-grid: grid, repeat(auto-fill, minmax(260px, 1fr)), gap 16px, max-width 1000px
- .card: flex column, gap 10px, border, radius medium, white bg, shadow, padding 18px
- .badge: self-start, radius pill, padding 3px 10px, accent bg, primary color, font-size 12px, bold
- .chip-list: flex, wrap, gap 8px, no list-style
- .chip: inline-flex, center, gap 8px, border strong, radius pill, white bg, padding 4px 6px 4px 12px
- .chip-remove: no border, radius circle, 20x20, transparent bg; hover: red bg, danger color
- .modal-overlay: fixed, inset 0, z-index 50, flex center, dark overlay bg
- .modal-overlay.hidden: display none
- .modal: flex column, width min(640px, 100%), max-height 90vh, radius 12px, white bg, shadow modal
- .modal-header/body/footer: flex with borders
- .empty-state: dashed border, radius medium, padding 40px 25px, centered, muted text
- .status-message: margin-top 12px, font-size 14px; .ok = green; .error = red
- .section-actions: flex, center, gap 8px, wrap
- .hidden: display none !important

### thread.css
- .thread: flex column, flex 1 1 auto, min-height 0, width 100%, padding, overflow-y auto
- .thread-welcome: width min(100%, var(--content-max-width)), margin auto (centers vertically), centered, muted
- .message: flex, gap 15px, width min(100%, var(--content-max-width)), margin-bottom 30px
- .message-content: flex 1 1 auto, min-width 0
- .user-message: align-self flex-end, padding-left clamp(0, 4vw, 30px)
- .agent-message: align-self flex-start, padding-left 20px, border-left 3px solid accent
- .avatar: flex 0 0 40px, circle, #e5e7eb bg
- .agent-avatar: primary bg, white text
- .large: 42x42
- .message-header: flex, wrap, gap 10px, center, margin-bottom 8px
- .message-body: soft color, line-height 1.6, overflow-wrap anywhere
- .message-body pre: dark bg (#0f172a), light text (#e2e8f0), monospace, radius 6px
- .message-actions: flex, wrap, gap 8px, margin-top 12px; buttons: no border, no bg, muted; hover: primary; .danger hover: danger
- .message-replies: flex column, gap 22px, margin-top 22px, padding-left 18px, border-left 2px solid border
- .inline-edit textarea: full width, min-height 70px, border, radius, padding 10px
- .inline-edit-buttons: flex, gap 8px, margin-top 8px
- .typing: inline-flex, center, gap 5px; spans: 7px circles, pulse animation
- .reply-area: flex column, gap 10px, width 100%, padding, border-top, surface-alt bg
- #message-input: full width, min-height 100px, max-height 260px, resize vertical
- .reply-actions: flex, wrap, center, space-between
- .reply-hint: faint color, font-size 12px
- .reply-context: flex, center, gap 10px, accent border, primary left border, light blue bg
- .reply-cancel: margin-left auto, no border, danger color
- .wizard-steps: flex, gap 8px, padding
- .wizard-step-pill: radius pill, padding 4px 12px, gray bg; .current: primary bg white text; .done: accent bg primary text
- .wizard-task-grid: grid, repeat(auto-fill, minmax(170px, 1fr)), gap 10px
- .wizard-task-button: border, radius medium, white bg, padding 14px, left-aligned text; hover/selected: border primary
- .wizard-preview: full width, min-height 180px, border, radius, padding, inherit font
- Responsive: 800px and 600px breakpoints adjust padding, avatar sizes, message spacing

### board.css
- .discussions-layout: grid, 300px 1fr, gap 18px, max-width 1250px
- .composer-dock: max-width 1250px, margin-top 18px
- .discussions-panel: flex column, max-height calc(100vh - 210px), border, radius, white bg, shadow, overflow hidden
- .panel-header: flex, center, space-between, padding, border-bottom
- .panel-footer: padding, border-top
- .board-thread-list: flex column, gap 4px, padding 8px, overflow-y auto
- .board-thread-item: flex, center, gap 10px, radius, padding, cursor pointer; hover: light bg
- .board-thread-item.active: light blue bg, inset 3px 0 0 primary (blue left bar)
- .thread-item-name: block, overflow hidden, nowrap, ellipsis
- .thread-item-meta: block, faint, font-size 12px
- .thread-item-actions: flex 0 0 auto, gap 4px; buttons: no border, radius, padding 3px 7px
- .post-board: flex column, max-height calc(100vh - 210px), border, radius, white bg, shadow
- .post-board-header: flex, wrap, center, gap, padding, border-bottom, surface-alt bg
- .board-title h2: no margin, overflow hidden, nowrap, ellipsis
- .board-subtitle: margin-top 2px, muted, 13px
- .post-board-actions: flex, gap 8px, margin-left auto
- .post-board-scroll: flex column, gap 20px, padding 20px, overflow-y auto, background bg
- .model-badge: radius pill, padding 2px 9px, gray bg; .qwen: purple; .llama: orange; .mistral: yellow
- .forum-post/.response-card: flex row, border, radius, white bg, shadow; .agent-post: accent left border
- .post-main: flex column, flex 1, min-width 0
- .post-rail: flex column, flex 0 0 auto, gap 2px, padding 8px 6px, border-left, surface-alt bg
- .forum-post-header: flex, wrap, center, gap 10px, padding, border-bottom, surface-alt bg
- .forum-avatar: inline-flex, 32x32, circle, gray bg; .user-avatar: gray; .blue: primary bg; .purple: #6d28d9; .green: #15803d
- .response-body: padding 14px 16px, soft color, line-height 1.6, overflow-wrap anywhere; pre: dark bg
- .response-action: no border, radius, padding 4px 9px, muted; hover: light bg, primary; .danger hover: red
- .forum-replies: relative, column, gap 14px, margin 0 14px 14px 34px, padding-left 16px; ::before: vertical connector line
- .inline-edit textarea: width calc(100% - 32px), margin 12px 16px 4px
- .composer-wrapper: border strong, radius 14px, white bg, shadow, padding, transition
- .composer-wrapper:focus-within: border primary + glow
- .composer: flex row, gap 10px
- .composer-side: flex column, gap 6px
- .side-button: border strong, radius, transparent bg, muted, 11px; hover: primary
- .composer textarea: flex 1, min-height 24px, max-height 140px, no border, no outline, transparent bg
- .composer-footerbar: flex, center, space-between, margin-top 8px
- .send-button: radius pill, primary bg, white text, padding 8px 24px, 14px bold; hover: primary-dark; disabled: 0.45 opacity
- .start-panel: dashed primary border, radius medium, light blue bg, centered, padding 26px 24px
- Responsive: 940px (panes stack to 1 column), 700px (post-rail flips horizontal)

## config/app_settings.json

```json
{
  "defaultAgentId": "",
  "defaultModel": "",
  "activeDiscussionId": ""
}
```

## favicon.svg

A simple SVG icon. Can be a minimal geometric shape or the letters "AI" in a circle using the primary color #075985.

## KEY BEHAVIORAL DETAILS

1. The attachment picker (initAttachmentPicker) is created ONCE per page and retargeted on re-mount. The hidden input node persists in index.html.

2. The wizard modal listeners (initWizard) are bound ONCE using a wizardBound guard. The modal DOM nodes persist in index.html across page mounts.

3. When sending a chat message, the agent reply goes on the SAME branch as the user message it answers (same parentId).

4. The first message in a discussion titles it (truncated to 50 chars).

5. Discussion updatedAt is stamped by the server on every POST /api/discussions.

6. The wizard export button label flashes feedback ("Saved on server!" or "Save failed!") then reverts after 1.4s/2.2s.

7. buildApiHistory sends only the last 20 messages to keep requests small.

8. Sidebar collapse is purely CSS-driven: JS only toggles the .collapsed class.

9. The workspace skeleton is rebuilt only when the header mode changes (e.g., leaving chat drops the agent header). Same mode = reuse existing skeleton.

10. All post rail buttons (Reply/Edit/Copy/Save/Del) in discussions.js are data-driven via the POST_RAIL_BUTTONS array.

## NOW CREATE ALL FILES

Generate every file listed above. Make each file complete and functional. Follow the specifications exactly. Do not skip any file. Do not add files not listed. Do not use any external libraries or frameworks.
```

## END REPLICATION PROMPT

---

# SECTION 4: FRONTEND WIREFRAME

## 4.1 Application Shell (All Pages)

```
┌─────────────────────────────────────────────────────────────────────┐
│ .app-shell (flex row)                                               │
├──────────────┬──────────────────────────────────────────────────────┤
│              │                                                      │
│  .sidebar    │  .main (flex column)                                 │
│  (220px)     │                                                      │
│              │  ┌──────────────────────────────────────────────────┐│
│  ┌────────┐  │  │ [agent-header] (optional, chat page only)       ││
│  │  AI    │  │  │  .agent-header (flex, space-between)            ││
│  │ Factory│  │  │  ┌─────────────────┐ ┌──────────────────────┐  ││
│  │ (logo) │  │  │  │ .agent-title    │ │ .header-controls     │  ││
│  └────────┘  │  │  │ ┌──┐ Agent Name │ │ Agent [v] Model [v]  │  ││
│              │  │  │ │AI│ Desc       │ │ [New chat] [AI Wizard]│  ││
│  ┌────────┐  │  │  │ └──┘            │ │ ● Online             │  ││
│  │  Home  │◄─┤  │  └─────────────────┘ └──────────────────────┘  ││
│  │(active)│  │  └──────────────────────────────────────────────────┘│
│  ├────────┤  │                                                      │
│  │  AI    │  │  ┌──────────────────────────────────────────────────┐│
│  │ Agents │  │  │ .workspace-middle (flex column, scrolls)        ││
│  ├────────┤  │  │                                                  ││
│  │Discus- │  │  │  [PAGE-SPECIFIC CONTENT GOES HERE]              ││
│  │sions   │  │  │                                                  ││
│  ├────────┤  │  └──────────────────────────────────────────────────┘│
│  │History │  │                                                      │
│  ├────────┤  │  ┌──────────────────────────────────────────────────┐│
│  │Settings│  │  │ .workspace-bottom (pinned, flex 0 0 auto)       ││
│  └────────┘  │  │                                                  ││
│              │  │  [COMPOSER / DOCK / BOTTOM BAR GOES HERE]        ││
│  ┌────────┐  │  │                                                  ││
│  │Collapse│  │  └──────────────────────────────────────────────────┘│
│  └────────┘  │                                                      │
├──────────────┴──────────────────────────────────────────────────────┤
│                                                                     │
│  WIZARD MODAL (overlay, hidden by default)                          │
│  ┌─────────────────────────────────────────┐                        │
│  │ AI Wizard                         [x]   │                        │
│  ├─────────────────────────────────────────┤                        │
│  │ ① Choose task  ② Details  ③ Review     │                        │
│  ├─────────────────────────────────────────┤                        │
│  │                                         │                        │
│  │  [STEP CONTENT GOES HERE]               │                        │
│  │                                         │                        │
│  ├─────────────────────────────────────────┤                        │
│  │ [Back] [Export .md+.json] [Next]        │                        │
│  └─────────────────────────────────────────┘                        │
│                                                                     │
│  HIDDEN: <input type="file" id="file-input" multiple>              │
│  HIDDEN: <input type="file" id="board-file-input" multiple>        │
└─────────────────────────────────────────────────────────────────────┘
```

### Sidebar States

```
EXPANDED (220px)               COLLAPSED (70px)           MOBILE (< 600px)
┌──────────────┐               ┌─────┐                   ┌──────────────────┐
│ AI Factory   │               │  AI │                   │   AI Factory     │
├──────────────┤               ├─────┤                   ├──────────────────┤
│ ► Home       │               │  H  │                   │ Home │ AI │ Di.. │
│   AI Agents  │               │  A  │                   │ History│ Sett   │
│   Discussions│               │  D  │                   └──────────────────┘
│   History    │               │  I  │                         ↓
│   Settings   │               │  S  │                   .main fills rest
├──────────────┤               │  S  │
│ [Collapse]   │               │  E  │                   sidebar-toggle
└──────────────┘               │  T  │                   hidden
                               ├─────┤
                               │  E  │
                               │  X  │
                               └─────┘
```

## 4.2 Chat Page (#/chat)

```
┌──────────────────────────────────────────────────────┐
│ .agent-header                                         │
│ ┌───────────────────┐ ┌────────────────────────────┐  │
│ │ ┌──┐              │ │ Agent [v] Model [v]        │  │
│ │ │AI│ Agent Name   │ │ [New chat] [AI Wizard] ●  │  │
│ │ └──┘ Description  │ └────────────────────────────┘  │
│ └───────────────────┘                                 │
├──────────────────────────────────────────────────────┤
│ .workspace-middle                                     │
│ ┌────────────────────────────────────────────────────┐│
│ │ .thread (flex column, overflow-y auto, scrolls)    ││
│ │                                                    ││
│ │ ┌──────────────────────────────────────────────┐   ││
│ │ │ .message .agent-message                      │   ││
│ │ │ ┌──┐ ┌──────────────────────────────────┐    │   ││
│ │ │ │AI│ │ Author Name    14:05              │    │   ││
│ │ │ └──┘ │ Message text rendered via         │    │   ││
│ │ │      │ ui/markdown.js (safe DOM)         │    │   ││
│ │ │      │                                  │    │   ││
│ │ │      │ ┌─────┐ ┌──────┐ ┌────┐ ┌─────┐ │    │   ││
│ │ │      │ │Reply│ │ Save │ │Copy│ │ Del │ │    │   ││
│ │ │      │ └─────┘ └──────┘ └────┘ └─────┘ │    │   ││
│ │ │      │                                  │    │   ││
│ │ │      │ ┌──────────────────────────────┐ │    │   ││
│ │ │      │ │ .message-replies             │ │    │   ││
│ │ │      │ │ ┌──┐ ┌────────────────────┐  │ │    │   ││
│ │ │      │ │ │ U│ │ You    14:06       │  │ │    │   ││
│ │ │      │ │ └──┘ │ Reply text...      │  │ │    │   ││
│ │ │      │ │      └────────────────────┘  │ │    │   ││
│ │ │      │ └──────────────────────────────┘ │    │   ││
│ │ │      └──────────────────────────────────┘    │   ││
│ │ └──────────────────────────────────────────────┘   ││
│ │                                                    ││
│ │ ┌──────────────────────────────────────────────┐   ││
│ │ │ .message .user-message                      │   ││
│ │ │ ┌──────────────────────────────┐ ┌──┐        │   ││
│ │ │ │ Author Name    14:07         │ │ U│        │   ││
│ │ │ │ My message...                │ └──┘        │   ││
│ │ │ │ (edited)                     │             │   ││
│ │ │ │                              │             │   ││
│ │ │ │ ┌─────┐ ┌──────┐ ┌────┐    │             │   ││
│ │ │ │ │Reply│ │Unsave│ │Copy│    │             │   ││
│ │ │ │ └─────┘ └──────┘ └────┘    │             │   ││
│ │ │ └──────────────────────────────┘             │   ││
│ │ └──────────────────────────────────────────────┘   ││
│ │                                                    ││
│ │         [typing indicator: "Thinking..." + ...]    ││
│ └────────────────────────────────────────────────────┘│
│                                                       │
│ ┌──────────────────────────────────────────────────┐  │
│ │ .thread-welcome (shown when no messages)         │  │
│ │           "Start the conversation"               │  │
│ │  "Type below, pick a task with the AI Wizard..." │  │
│ └──────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────┤
│ .workspace-bottom                                     │
│ ┌────────────────────────────────────────────────────┐│
│ │ .reply-area                                        ││
│ │                                                    ││
│ │ ┌──────────────────────────────────────────────┐   ││
│ │ │ .reply-context (hidden unless replying)      │   ││
│ │ │ Replying to <strong>Author: text...</strong> │   ││
│ │ │                                    [Cancel]  │   ││
│ │ └──────────────────────────────────────────────┘   ││
│ │                                                    ││
│ │ ┌──── chips ────────────────────────────────────┐  ││
│ │ │ [notes.txt ×] [data.csv ×]                   │  ││
│ │ └───────────────────────────────────────────────┘  ││
│ │                                                    ││
│ │ ┌──────────────────────────────────────────────┐   ││
│ │ │ #message-input                               │   ││
│ │ │ Message the AI agent...                      │   ││
│ │ │ (min-height: 100px, resize: vertical)        │   ││
│ │ └──────────────────────────────────────────────┘   ││
│ │                                                    ││
│ │ ┌──────────────────────────────────────────────┐   ││
│ │ │ [Attach]  Enter sends - Shift+Enter  [Send]  │   ││
│ │ │           adds a new line                    │   ││
│ │ └──────────────────────────────────────────────┘   ││
│ └────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

### Chat Message Anatomy

```
.agent-message (left-aligned, blue left border)
┌─────────────────────────────────────────────────┐
│ ┌──┐ ┌────────────────────────────────────────┐  │
│ │AI│ │ Author Name           timestamp         │  │
│ └──┘ │ (edited)                                │  │
│      │                                         │  │
│      │ Message body rendered by markdown.js:   │  │
│      │  - paragraphs (<p>)                     │  │
│      │  - code blocks (<pre><code>)            │  │
│      │  - bullet/numbered lists (<ul>/<ol>)    │  │
│      │  - inline: bold, italic, code, links    │  │
│      │                                         │  │
│      │ ┌─── attachment chips ────────────────┐  │  │
│      │ │ [file.txt - 4 KB] [doc.pdf - 1 MB] │  │  │
│      │ └────────────────────────────────────┘  │  │
│      │                                         │  │
│      │ [Reply] [Save] [Copy] [Edit] [Delete]  │  │
│      │                                         │  │
│      │ ┌─── .message-replies (indented) ────┐  │  │
│      │ │  (recursive child messages)        │  │  │
│      │ └────────────────────────────────────┘  │  │
│      └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘

.user-message (right-aligned, padding-left)
┌─────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────┐ ┌──┐  │
│ │ Author Name          timestamp         │ │ U│  │
│ │ Message text...                       │ └──┘  │
│ │ [Reply] [Unsave] [Copy]              │       │
│ └────────────────────────────────────────┘       │
└─────────────────────────────────────────────────┘
```

## 4.3 AI Agents Page (#/agents)

```
┌──────────────────────────────────────────────────────┐
│ .page (scrollable)                                    │
│ ┌────────────────────────────────────────────────────┐│
│ │ .page-header                                       ││
│ │ h1: "AI Agents"                                    ││
│ │ p: "Every agent found in the server's..."          ││
│ ├────────────────────────────────────────────────────┤│
│ │                                                    ││
│ │ .card-grid (grid, repeat(auto-fill, minmax(260px)))││
│ │ ┌────────────────┐ ┌────────────────┐ ┌──────────┐ ││
│ │ │ .card          │ │ .card          │ │ .card    │ ││
│ │ │                │ │                │ │          │ ││
│ │ │ Agent Name     │ │ Another Agent  │ │ Tool Bot │ ││
│ │ │ [chat]         │ │ [tools]        │ │ [chat]   │ ││
│ │ │                │ │                │ │          │ ││
│ │ │ Description    │ │ Does things    │ │ Helps    │ ││
│ │ │ of what this   │ │ with stuff     │ │ with     │ ││
│ │ │ agent does     │ │                │ │ tools    │ ││
│ │ │                │ │                │ │          │ ││
│ │ │ [Start chat]   │ │ [Start chat]   │ │[Start ch]│ ││
│ │ └────────────────┘ └────────────────┘ └──────────┘ ││
│ │ ┌────────────────┐                                  ││
│ │ │ .card          │   Empty state (dashed border):   ││
│ │ │ ...            │   "No agents found. Add a folder ││
│ │ └────────────────┘    to agent_library/..."         ││
│ │                                                    ││
│ │ Error state: "Could not load agents: ..."          ││
│ │                    [Retry]                         ││
│ └────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

## 4.4 Discussions Page (#/discussions)

```
┌──────────────────────────────────────────────────────────────────┐
│ .page                                                             │
│ ┌──────────────────────────────────────────────────────────────┐  │
│ │ .page-header: "Discussions" + description                    │  │
│ ├──────────────────────────────────────────────────────────────┤  │
│ │                                                              │  │
│ │ .discussions-layout (grid: 300px | 1fr)                      │  │
│ │ ┌──────────────────┬──────────────────────────────────────┐  │  │
│ │ │                  │                                      │  │  │
│ │ │ .discussions-    │ .post-board                          │  │  │
│ │ │   panel          │                                      │  │  │
│ │ │                  │ ┌──────────────────────────────────┐ │  │  │
│ │ │ ┌──────────────┐ │ │ .post-board-header              │ │  │  │
│ │ │ │ Conversations│ │ │ ┌────────────────┐ ┌──────────┐ │ │  │  │
│ │ │ │        [5]   │ │ │ │ Title Here     │ │[Open in  │ │ │  │  │
│ │ │ └──────────────┘ │ │ │ Agent · 3 posts│ │ Chat]    │ │ │  │  │
│ │ │                  │ │ └────────────────┘ │[Delete]  │ │ │  │  │
│ │ │ ┌──────────────┐ │ │                    └──────────┘ │ │  │  │
│ │ │ │○ First Topic │ │ └──────────────────────────────────┘ │  │  │
│ │ │ │  3 posts · 2h│ │                                      │  │  │
│ │ │ │  [Rename][Del]│ │ ┌──────────────────────────────────┐ │  │  │
│ │ │ ├──────────────┤ │ │ .post-board-scroll               │ │  │  │
│ │ │ │● Other Chat  │ │ │                                  │ │  │  │
│ │ │ │  7 posts · 1h│ │ │ ┌──────────────────────────────┐ │ │  │  │
│ │ │ │  [Rename][Del]│ │ │ │ .forum-post .response-card  │ │ │  │  │
│ │ │ ├──────────────┤ │ │ │ ┌──────┬───────────────────┐ │ │ │  │  │
│ │ │ │○ Ideas       │ │ │ │ │.post │ .post-main       │ │ │ │  │  │
│ │ │ │  1 post · 3d │ │ │ │ │-rail │                   │ │ │ │  │  │
│ │ │ │  [Rename][Del]│ │ │ │ │      │ ┌─────────────┐ │ │ │ │  │  │
│ │ │ └──────────────┘ │ │ │ │      │ │forum-header  │ │ │ │ │  │  │
│ │ │                  │ │ │ │      │ │┌──┐Author 2pm │ │ │ │ │  │  │
│ │ │ ┌──────────────┐ │ │ │ │      │ ││AB│ [Qwen]    │ │ │ │ │  │  │
│ │ │ │[+ New Conv]  │ │ │ │ │      │ │└──┘           │ │ │ │ │  │  │
│ │ │ └──────────────┘ │ │ │ │      │ └─────────────┘ │ │ │ │  │  │
│ │ └──────────────────┘ │ │ │      │                  │ │ │ │  │  │
│ │                      │ │ │      │ Response body     │ │ │ │  │  │
│ │  (hover reveals)     │ │ │      │ rendered text...  │ │ │ │  │  │
│ │  .thread-item-actions│ │ │      │                  │ │ │ │  │  │
│ │                      │ │ │      │ [Reply][Edit]    │ │ │ │  │  │
│ │                      │ │ │      │ [Copy][Save][Del]│ │ │ │  │  │
│ │                      │ │ │      │                  │ │ │ │  │  │
│ │                      │ │ │      │ ┌─replies──────┐ │ │ │ │  │  │
│ │                      │ │ │      │ │ (nested)     │ │ │ │ │  │  │
│ │                      │ │ │      │ └──────────────┘ │ │ │ │  │  │
│ │                      │ │ └──────┴───────────────────┘ │ │  │  │
│ │                      │ └──────────────────────────────┘ │  │  │
│ │                      │                                      │  │
│ └──────────────────┴──────────────────────────────────────┘  │  │
│                                                              │  │
├──────────────────────────────────────────────────────────────┤  │
│ .workspace-bottom                                             │  │
│ ┌──────────────────────────────────────────────────────────┐  │  │
│ │ .composer-dock                                           │  │  │
│ │                                                          │  │  │
│ │ VARIANT A (discussion selected):                         │  │  │
│ │ ┌──────────────────────────────────────────────────────┐ │  │  │
│ │ │ .composer-wrapper                                    │ │  │  │
│ │ │ ┌──────────────────────────────────────────────┐     │ │  │  │
│ │ │ │ Replying to Author: text...          [Cancel]│     │ │  │  │
│ │ │ └──────────────────────────────────────────────┘     │ │  │  │
│ │ │ ┌─chips───────────────────────────────────────────┐  │ │  │  │
│ │ │ │ [file.txt ×]                                    │  │ │  │  │
│ │ │ └─────────────────────────────────────────────────┘  │ │  │  │
│ │ │ ┌──────────────────────────────┬──────────────────┐  │ │  │  │
│ │ │ │ textarea: Write a reply...   │ ┌──────────────┐ │  │ │  │  │
│ │ │ │                              │ │ + Attach     │ │  │ │  │  │
│ │ │ │                              │ │ Tools        │ │  │ │  │  │
│ │ │ │                              │ │ Memory       │ │  │ │  │  │
│ │ │ │                              │ └──────────────┘ │  │ │  │  │
│ │ │ └──────────────────────────────┴──────────────────┘  │ │  │  │
│ │ │ Enter posts · Shift+Enter           ┌──────────────┐ │ │  │  │
│ │ │ adds a new line                     │     Post     │ │ │  │  │
│ │ │                                     └──────────────┘ │ │  │  │
│ │ └──────────────────────────────────────────────────────┘ │  │  │
│ │                                                          │  │  │
│ │ VARIANT B (nothing selected):                            │  │  │
│ │ ┌──────────────────────────────────────────────────────┐ │  │  │
│ │ │ .start-panel (dashed blue border, light blue bg)     │ │  │  │
│ │ │            "Start a new discussion"                   │ │  │  │
│ │ │   "Write the first post - a conversation is created" │ │  │  │
│ │ │ ┌──────────────────────────────────────────────────┐ │ │  │  │
│ │ │ │ textarea: What do you want to discuss?           │ │ │  │  │
│ │ │ └──────────────────────────────────────────────────┘ │ │  │  │
│ │ │ "The first line becomes the title."                  │ │  │  │
│ │ │              [Create discussion]                     │ │  │  │
│ │ └──────────────────────────────────────────────────────┘ │  │  │
│ └──────────────────────────────────────────────────────────┘  │  │
└──────────────────────────────────────────────────────────────┘  │
```

### Post Card Anatomy (Discussions Board)

```
.forum-post .response-card (flex ROW)
┌──────────────────────────────────────────┬──────────┐
│ .post-main (flex column)                 │ .post-   │
│                                          │  rail    │
│ ┌──────────────────────────────────────┐ │          │
│ │ .forum-post-header                   │ │ [Reply]  │
│ │ ┌──────┐                             │ │ [Edit]   │
│ │ │forum-│ Author Name    2:30pm       │ │ [Copy]   │
│ │ │avatar│ (edited)     [Qwen]         │ │ [Save]   │
│ │ └──────┘                             │ │ [Del]    │
│ └──────────────────────────────────────┘ │          │
│                                          │ (danger) │
│ ┌──────────────────────────────────────┐ │          │
│ │ .response-body                       │ │          │
│ │                                      │ │          │
│ │ Post text rendered by markdown.js    │ │          │
│ │                                      │ │          │
│ │ ```code blocks``` look like this     │ │          │
│ │                                      │ │          │
│ │ - bullet lists work too              │ │          │
│ └──────────────────────────────────────┘ │          │
│                                          │          │
│ ┌─── .forum-replies (nested) ────────┐  │          │
│ │ (same card structure, recursed)     │  │          │
│ │ ┌──────────────────────────────┐   │  │          │
│ │ │ .forum-post (reply)          │   │  │          │
│ │ │ [header] [body] [rail]       │   │  │          │
│ │ └──────────────────────────────┘   │  │          │
│ └────────────────────────────────────┘  │          │
└──────────────────────────────────────────┴──────────┘

Forum avatars by author:
  User: gray (#e5e7eb)
  Agent (hash-based color): blue (#075985) | purple (#6d28d9) | green (#15803d)

Model badges:
  [Qwen]  = purple pill (#f3e8ff / #7c3aed)
  [Llama] = orange pill (#ffedd5 / #ea580c)
  [Mistral] = yellow pill (#fef9c3 / #a16207)
  Other   = gray pill (#e2e8f0 / #334155)
```

## 4.5 History Page (#/history)

```
┌──────────────────────────────────────────────────────┐
│ .page                                                  │
│ ┌────────────────────────────────────────────────────┐│
│ │ .page-header                                       ││
│ │ h1: "History"                                      ││
│ │ p: "Messages you saved from chats and discussions."││
│ ├────────────────────────────────────────────────────┤│
│ │                                                    ││
│ │ ┌────────────────────────────────────────────────┐ ││
│ │ │ .panel                                         │ ││
│ │ │ Author - Jun 3, 14:05 - from "First Topic"     │ ││
│ │ │                                                │ ││
│ │ │ Saved message text rendered by markdown.js...  │ ││
│ │ │                                                │ ││
│ │ │ ┌──────┐ ┌────────┐ ┌─────────────┐           │ ││
│ │ │ │ Copy │ │Unsave  │ │Open source  │           │ ││
│ │ │ └──────┘ └────────┘ └─────────────┘           │ ││
│ │ └────────────────────────────────────────────────┘ ││
│ │                                                    ││
│ │ ┌────────────────────────────────────────────────┐ ││
│ │ │ .panel                                         │ ││
│ │ │ Agent - Today, 09:30                            │ ││
│ │ │                                                │ ││
│ │ │ Another saved message...                       │ ││
│ │ │                                                │ ││
│ │ │ ┌──────┐ ┌────────┐                           │ ││
│ │ │ │ Copy │ │Unsave  │                           │ ││
│ │ │ └──────┘ └────────┘                           │ ││
│ │ └────────────────────────────────────────────────┘ ││
│ │                                                    ││
│ │ Empty state: "Nothing saved yet. Use the Save      ││
│ │ button under a message in chat or on the           ││
│ │ Discussions board."                                ││
│ │                                                    ││
│ │ Error state: "Could not load history: ..."         ││
│ │                                                [Retry]│
│ └────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

## 4.6 Settings Page (#/settings)

```
┌──────────────────────────────────────────────────────┐
│ .page#settings-root                                   │
│ ┌────────────────────────────────────────────────────┐│
│ │                                                    ││
│ │ SECTION 1: Preferences                             ││
│ │ ┌────────────────────────────────────────────────┐ ││
│ │ │ .panel                                        │ ││
│ │ │                                                │ ││
│ │ │ h3: "Preferences"                              │ ││
│ │ │ p: "Used as starting values on the chat page." │ ││
│ │ │                                                │ ││
│ │ │ ┌──────────────────────────────────────────┐   │ ││
│ │ │ │ .field                                   │   │ ││
│ │ │ │ Default agent                            │   │ ││
│ │ │ │ ┌──────────────────────────────────────┐ │   │ ││
│ │ │ │ │ (server default)          [v]        │ │   │ ││
│ │ │ │ └──────────────────────────────────────┘ │   │ ││
│ │ │ └──────────────────────────────────────────┘   │ ││
│ │ │                                                │ ││
│ │ │ ┌──────────────────────────────────────────┐   │ ││
│ │ │ │ .field                                   │   │ ││
│ │ │ │ Default model                            │   │ ││
│ │ │ │ ┌──────────────────────────────────────┐ │   │ ││
│ │ │ │ │ (server default)          [v]        │ │   │ ││
│ │ │ │ └──────────────────────────────────────┘ │   │ ││
│ │ │ └──────────────────────────────────────────┘   │ ││
│ │ │                                                │ ││
│ │ │ ┌──────────────────┐                           │ ││
│ │ │ │ [Save settings]  │  Settings saved on server.│ ││
│ │ │ └──────────────────┘                           │ ││
│ │ └────────────────────────────────────────────────┘ ││
│ │                                                    ││
│ │ SECTION 2: Danger Zone                             ││
│ │ ┌────────────────────────────────────────────────┐ ││
│ │ │ .panel                                        │ ││
│ │ │                                                │ ││
│ │ │ h3: "Danger zone"                              │ ││
│ │ │ p: "Removes every discussion, saved message   │ ││
│ │ │     and preference this app stored on the      │ ││
│ │ │     server."                                   │ ││
│ │ │                                                │ ││
│ │ │ ┌──────────────────────────────┐               │ ││
│ │ │ │ [Delete all server data]     │               │ ││
│ │ │ └──────────────────────────────┘               │ ││
│ │ │                                                │ ││
│ │ │ All server data cleared.                       │ ││
│ │ └────────────────────────────────────────────────┘ ││
│ │                                                    ││
│ │ Error fallback:                                    ││
│ │ "Could not load settings: ..."                     ││
│ │                                       [Retry]      ││
│ └────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

## 4.7 AI Wizard Modal (3 Steps)

```
┌─────────────────────────────────────────────────┐
│ AI Wizard                                 [x]    │
├─────────────────────────────────────────────────┤
│ ① Choose task   ② Details   ③ Review           │
│  (current)       (done)      (done)             │
├─────────────────────────────────────────────────┤
│                                                 │
│ STEP 1: Choose Task                             │
│ ┌───────────────┐ ┌───────────────┐             │
│ │ ┌───────────┐ │ │ ┌───────────┐ │             │
│ │ │ Explain a │ │ │ │  Write    │ │  ...more   │
│ │ │  topic    │ │ │ │ something │ │  cards     │
│ │ │           │ │ │ │           │ │             │
│ │ │ A clear   │ │ │ │ Emails,   │ │             │
│ │ │ explanat..│ │ │ │ posts,    │ │             │
│ │ └───────────┘ │ │ │ docs...   │ │             │
│ └───────────────┘ │ └───────────┘              │
│   (selected =      └───────────────┘           │
│    blue border +                               │
│    light blue bg)                              │
│                                                 │
│ STEP 2: Details                                 │
│ "A few quick details for "Explain a topic"."   │
│                                                 │
│ ┌──────────────────────────────────────────────┐│
│ │ .field                                       ││
│ │ What should be explained?                    ││
│ │ ┌──────────────────────────────────────────┐ ││
│ │ │ e.g. how HTTPS works                     │ ││
│ │ └──────────────────────────────────────────┘ ││
│ └──────────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────────┐│
│ │ .field                                       ││
│ │ Who is the audience?                         ││
│ │ ┌──────────────────────────────────────────┐ ││
│ │ │ e.g. a curious beginner                   │ ││
│ │ └──────────────────────────────────────────┘ ││
│ └──────────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────────┐│
│ │ .field                                       ││
│ │ Preferred shape (optional)                   ││
│ │ ┌──────────────────────────────────────────┐ ││
│ │ │ e.g. bullets, an analogy, a short story  │ ││
│ │ └──────────────────────────────────────────┘ ││
│ └──────────────────────────────────────────────┘│
│                                                 │
│ STEP 3: Review                                  │
│ "Here is the prompt the wizard built.           │
│  Edit it freely:"                               │
│                                                 │
│ ┌──────────────────────────────────────────────┐│
│ │ .wizard-preview textarea                     ││
│ │ Explain "HTTPS" to "a curious beginner".     ││
│ │ Structure it as bullets. Use plain language   ││
│ │ and define any term a newcomer would not know.││
│ │                                              ││
│ │ (editable - user can modify the prompt)      ││
│ └──────────────────────────────────────────────┘│
│                                                 │
│ "Pressing the button puts this into the         │
│  composer - you stay in control..."             │
│                                                 │
│ ┌──────────────────────────────────────────────┐│
│ │ .field .wizard-export-field                  ││
│ │ File name for export (without extension)     ││
│ │ ┌──────────────────────────────────────────┐ ││
│ │ │ explain-2026-08-23                       │ ││
│ │ └──────────────────────────────────────────┘ ││
│ └──────────────────────────────────────────────┘│
│                                                 │
├─────────────────────────────────────────────────┤
│ [Back]     [Export .md + .json]     [Use this   │
│                                     prompt]     │
│ (hidden     (step 3 only)          (step 3:     │
│  step 0)                           "Use this    │
│                                     prompt")    │
└─────────────────────────────────────────────────┘
```

## 4.8 Component Inventory

### Buttons
```
.btn                Base button (padding, border-radius, font inherit)
.btn-primary        Blue bg (#075985), white text, dark hover
.btn-secondary      White bg, border, blue on hover
.btn-danger         Light red bg, red text, darker red on hover
.btn-small          Reduced padding (6px 12px), 13px font
```

### Form Controls
```
.field              Label wrapper (flex column, gap 6px)
.field input        Full width, border strong, radius small
.field textarea     Same + resize vertical
.field select       Same + dropdown
```

### Cards & Panels
```
.panel              Bordered card with shadow (max-width 900px)
.card-grid          CSS Grid (auto-fill, minmax 260px)
.card               Individual card (flex column, border, shadow)
.badge              Small pill label (accent bg, primary color)
```

### Chips (Attachments)
```
.chip-list          Flex row container (no list style)
.chip               Rounded pill with filename + remove button
.chip-remove        X button (circle, red on hover)
```

### Modals
```
.modal-overlay      Fixed fullscreen, dark backdrop, z-index 50
.modal              Centered white box (max-width 640px, max-height 90vh)
.modal-header       Title + close button
.modal-body         Scrollable content area
.modal-footer       Back/Export/Next buttons
```

### Status & Empty States
```
.empty-state        Dashed border box, centered muted text
.status-message     Feedback text (auto-clears after 4s)
.status-message.ok  Green
.status-message.error Red
.hidden             display: none !important
```

## 4.9 Responsive Breakpoints

```
DESKTOP (> 940px)
├── Sidebar: 220px fixed
├── Discussions: two panes side-by-side (300px | 1fr)
├── Post rail: vertical column on right side of card
└── All content uses clamp() for padding

TABLET (601px - 940px)
├── Sidebar: 180px
├── Discussions: panes stack vertically (1 column)
├── Post rail: still vertical
└── Padding reduces

MOBILE (< 600px)
├── Sidebar: becomes horizontal top bar (flex-wrap)
├── Sidebar toggle: hidden
├── Nav items: wrap horizontally, smaller font
├── Post rail: flips to horizontal row under post body (< 700px)
├── Thread: reduced padding, smaller avatars (34px)
├── Composer: reduced padding
└── All clamp() values hit their minimum
```

```
Breakpoint Map:
  940px  -> .discussions-layout: 1 column
  800px  -> .sidebar: 180px, .thread: 22px padding
  700px  -> .forum-post: flex-direction column (rail goes horizontal)
  600px  -> .app-shell: column (sidebar becomes top bar)
```

---

# END OF DOCUMENTATION
