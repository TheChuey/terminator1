# AI Factory Frontend

A single-page, ChatGPT-style interface for the FastAPI + Ollama backend in
`server.py`. No build tools, no packages - plain HTML, CSS, and JavaScript
ES modules.

This README is a REFERENCE MANUAL: structured so a human OR an AI assistant
can understand the system's structure, contracts, and rules without reading
every source file.

---

# HOW TO USE

## Run it

```bash
python server.py          # serves http://127.0.0.1:8000
```

Open http://127.0.0.1:8000 - that ONE page is the whole app. Pages swap
via hash routing (`#/chat`, `#/agents`, ...), so refresh and deep links
(`.../#/discussions`) always work.

| Hash route | Page | What you do there |
|---|---|---|
| `#/chat` | Chat (home) | Talk to an agent; build prompts with the AI Wizard |
| `#/agents` | AI Agents | See agents found on the server; start a chat with one |
| `#/discussions` | Discussions | Forum-style board: write posts, reply, edit, save |
| `#/history` | History | Every message you pressed Save on (permanent copies) |
| `#/settings` | Settings | Default agent/model; wipe all server-stored data |

## Everyday tasks

**Chat** - type in the composer, Enter sends (Shift+Enter = newline).
Click Reply under a message to answer a specific one (threads nest);
Edit/Delete/Copy are on the same row. Attach adds file chips (names +
sizes ride along with your message). New chat starts fresh.

**AI Wizard** - "AI Wizard" button in the chat header:
1. pick a task type (explain / write / code / summarize / brainstorm / freeform),
2. answer 2-3 questions,
3. review the assembled prompt - edit it freely, then either:
   - **Use this prompt** -> drops it into the composer (YOU still press Send), or
   - **Export .md + .json** -> saves two files on the server under
     `data\exports\{name}.md` + `{name}.json`. The file name is prefilled
     (`task-date`, e.g. `explain-2026-08-23`) and fully editable.

**Discussions board** - "+ New Conversation" or the start panel creates a
discussion stored ON THE SERVER (survives browsers). Posts support the same
markdown as chat. Per-post rail: Reply / Edit / Copy / Save (snapshot goes
to History) / Del. Hover a left-pane row for Rename/Del. "Open in Chat"
continues the discussion with the agent.

**History** - permanent snapshots; Unsave deletes one. "Open source" jumps
to the original discussion in chat if it still exists.

**Settings** - pick default agent/model used when a chat opens. Danger zone
deletes ALL app data from the server after confirmation.

**Sidebar** - Collapse/Expand button toggles it to icons-only.

---

# FILE STRUCTURE

```
E:\front_end\
├── server.py               FastAPI backend: APIs + storage + static hosting
├── config\
│   ├── models.json         written by server at startup (Ollama scan)
│   ├── settings.json       SERVER default agent ("default_agent")
│   └── app_settings.json   BROWSER defaults (agent/model/active discussion)
├── data\                   created on first write
│   ├── discussions.json    all conversations
│   ├── history.json        saved-message snapshots
│   └── exports\            wizard exports: {name}.md + {name}.json
└── static\                 served at /static/*
    ├── index.html          THE ONLY html page (shell + wizard modal + hidden inputs)
    ├── favicon.svg         served at /favicon.ico
    ├── css\                loaded by index.html in this order:
    │   ├── base.css        variables, reset, typography
    │   ├── layout.css      shell, sidebar, header, workspace wrappers, responsive
    │   ├── components.css  buttons, forms, cards, modals, chips
    │   ├── thread.css      chat messages, composer, wizard skin
    │   └── board.css       discussions list pane + post/reply board
    └── js\
        ├── app.js          ENTRY POINT (only script index.html loads)
        ├── routes.js       THE PAGE REGISTRY (add pages here)
        ├── router.js       hash -> dynamic import -> renderPage()
        ├── api_fetch.js    THE ONLY file allowed to call fetch()
        ├── models.js       object factories + tree helpers (pure logic)
        ├── dom.js          tiny DOM helpers (get/el/clear)
        ├── events.js       event bus (emit/on)
        ├── ui\
        │   ├── shell.js           builds sidebar + workspace skeleton
        │   ├── navigation.js      sidebar links FROM routes.js
        │   ├── workspace.js       main column: header?/middle/bottom
        │   ├── markdown.js        message text -> safe rich DOM
        │   ├── thread.js          draws chat messages + nested replies
        │   ├── message-actions.js Reply/Save/Copy/Edit/Delete buttons
        │   ├── attachments.js     attach button -> file chips
        │   ├── post-sections.js   config-driven input+button panels
        │   └── wizard.js          3-step prompt builder + .md/.json export
        └── pages\          one module per hash route, all export renderPage()
            ├── chat.js
            ├── agents.js
            ├── discussions.js
            ├── history.js
            └── settings.js
```

---

# ARCHITECTURE RULES (invariants - do not break)

1. **One HTML page.** `index.html` contains mounting points only.
   All page markup is built by JavaScript.
2. **Network boundary:** ONLY `api_fetch.js` may call `fetch()`.
3. **Persistence boundary:** everything persists ON THE SERVER through
   api_fetch.js (data/*.json + config/app_settings.json). No localStorage.
4. **Stateless LLM:** `/api/chat` remembers nothing between requests.
   The FRONTEND owns history and sends recent turns as
   `[{role, content}, ...]` with every request.
5. **Threading model:** a discussion's messages form a tree via
   `parentId` (`null` = top-level post). Rendering recurses over
   `childMessages(discussion, parentId)`.
6. **Import direction:** `pages/* -> ui/* -> core modules`
   (`routes`, `router`, `dom`, `events`, `models`, `api_fetch`).
   Never the reverse; ui/* may import ui/* and core only;
   core modules never import ui or pages.
7. **Page mount contract:** every page exports
   `renderPage({ middle, bottom })`; router calls it on EVERY visit.
   Inject markup FIRST, then grab element refs, then wire events.
8. **Safe rendering:** message text NEVER touches innerHTML -
   ui/markdown.js builds DOM with createElement/textContent only.
9. **Separation:** JS owns structure-by-building-DOM and toggles classes;
   CSS owns all visuals; ids/classes in injected markup must match CSS.

---

# 1. HTML SHELL (index.html)

Three zones:

```html
<div class="app-shell">
    <aside class="sidebar" id="sidebar">          <!-- logo, #sidebar-nav, #sidebar-toggle -->
    <main class="main" id="main-workspace"></main> <!-- filled by ui/workspace.js -->
</div>

<!-- wizard modal (persistent): #wizard-overlay > .modal >
     #wizard-title, #wizard-steps, #wizard-body,
     footer: #wizard-back-button, #wizard-export-button (step-3 only),
             #wizard-next-button, #wizard-close-button -->

<input type="file" id="file-input" multiple class="hidden">        <!-- chat Attach -->
<input type="file" id="board-file-input" multiple class="hidden">  <!-- board Attach -->

<script type="module" src="/static/js/app.js"></script>
```

Elements ui/workspace.js renders into `#main-workspace`
(ids preserved from the original hand-written page):

| Element id | Role |
|---|---|
| `.agent-header` | rendered only when the route sets `header: true` (chat) |
| `#agent-avatar`, `#agent-name`, `#agent-description` | header identity |
| `#agent-select`, `#model-select` | dropdowns filled from GET /api/agents, /api/models |
| `#new-chat-button`, `#wizard-open-button` | header actions |
| `#connection-status` | green Online dot after successful API load |
| `#workspace-middle` | PAGES inject their content here |
| `#workspace-bottom` | pages inject composers/docks here |

Page-injected ids (created fresh on every visit):

| Page | Element ids |
|---|---|
| chat | `#thread`, `#message-input`, `#send-button`, `#attach-button`, `#attachment-list`, `#reply-context`, `#reply-context-name`, `#reply-cancel-button` |
| agents | `#agent-grid`, `#agent-status-area` |
| discussions | `#discussion-list`, `#discussion-count`, `#new-conversation-button`, `#post-board`, `#composer-dock` |
| history | `#saved-list`, `#history-status-area` |
| settings | `#settings-root` |

---

# 2. CSS SECTION

All five stylesheets load on the one page, in order:
`base -> layout -> components -> thread -> board`.

## base.css

Design tokens on `:root` - change here, rest follows:

```
--color-primary #075985     --color-primary-dark #064e78
--color-sidebar  #064f86    --color-background   #f5f7f9
--color-surface  #ffffff    --color-surface-alt  #fafafa
--color-text     #263238    --color-text-soft    #374151
--color-text-muted #64748b  --color-text-faint   #9ca3af
--color-border   #e1e5e8    --color-border-strong#cbd5e1
--color-accent   #dbeafe    --color-danger       #b91c1c
--color-success  #16803c
--sidebar-width 220px   --sidebar-collapsed-width 70px
--content-max-width 850px --radius-small 5px --radius-medium 8px
--shadow-panel / --shadow-modal
```

Plus: box-sizing reset, body font/colors, heading/code typography.

## layout.css

- `.app-shell` flex row; `.sidebar` (fixed 220px) + `.main` (flex column).
- JS-toggled classes: `.sidebar.collapsed`, `.nav-item.active`.
- `.page` = scrollable padded body for secondary pages; `.page-header`.
- Chat header strip: `.agent-header`, `.agent-title`, `.header-controls`,
  `.status` + `.status-dot`.
- JS-shell pass-throughs: `.workspace-middle` (flex column, scrolls via
  children) and `.workspace-bottom` (pinned strip); both take over the
  roles `.thread`/`.reply-area`/`.page` played directly under `.main`.
- Breakpoints: 800px (narrower sidebar), 600px (sidebar becomes top bar).

## components.css

- Buttons: `.btn` + `.btn-primary/-secondary/-danger/-small`.
- Forms: `.field`; surfaces: `.panel`, `.card-grid`, `.card`, `.badge`.
- File chips: `.chip-list`, `.chip`, `.chip-remove`.
- Modals: `.modal-overlay(.hidden)`, `.modal`, `.modal-header/-close/-body/-footer`.
- States: `.empty-state`, `.status-message(.ok/.error)`, utility `.hidden`.

## thread.css

- Thread/messages: `.thread`, `.thread-welcome`, `.message`
  (`.user-message` right / `.agent-message` left), `.avatar/.large`,
  `.message-header/-body/-actions`, `.edited-tag`,
  nested `.message-replies`, `.inline-edit`, dark `.message-body pre`.
- Typing indicator: `.typing` (pulsing dots).
- Composer: `.reply-area`, `.reply-actions`, `.reply-hint`, `.reply-context`.
- Wizard skin: `.wizard-step-pill(.current/.done)`, `.wizard-task-grid`,
  `.wizard-task-button(.selected)`, `.wizard-preview`, `.wizard-export-field`.

## board.css

- Layout: `.discussions-layout` grid `[300px list | board]`;
  `.workspace-bottom .composer-dock` re-applies page padding below it.
- List pane: `.discussions-panel`, `.panel-header/-footer`,
  `.board-thread-item(.active)` (hover reveals `.thread-item-actions`),
  `.thread-icon/-item-body/-item-name/-item-meta`.
- Board: `.post-board(-header/-scroll/-actions)`, `.board-title/-subtitle`.
- Posts: `.forum-post` (+ alias `.response-card`), flex ROW
  `[.post-main | .post-rail]`, `.forum-post-header`, `.forum-avatar`
  (`.user-avatar/.blue/.purple/.green`), `.forum-author/-time`,
  `.response-body` (paragraphs, dark `pre`, lists), `.response-action(.danger)`
  rail, nested `.forum-replies`, `.inline-edit`, `.model-badge`
  (`.qwen/.llama/.mistral`).
- Composer: floating `.composer-wrapper`, `.composer`, `.composer-side` >
  `.side-button`, `.composer-footerbar` (`.composer-hint` + `.send-button`).
- Start panel: `.start-panel` (dashed accent).
- Breakpoints: 940px (panes stack), 700px (rail flips horizontal).

---

# 3. JAVASCRIPT REFERENCE

Every exported name (the string you import) with its definition.
Reads like an API doc: name -> signature -> behavior.

## 3a Core modules

### js/dom.js

| Export | Definition |
|---|---|
| `get(selector)` | querySelector helper (first match or null) |
| `getAll(selector)` | querySelectorAll as real Array |
| `clear(element)` | removes all children |
| `el(tag, className="", text="")` | create element; textContent is safe (never innerHTML) |

### js/events.js

Module-private `EventTarget` bus.
`emit(name, detail=null)` fires; `on(name, callback)` returns an
`off()` unsubscribe. Available for loose coupling; currently minimally used.

### js/routes.js  (THE PAGE REGISTRY)

| Export | Definition |
|---|---|
| `ROUTES` | array of `{path, label, module, header?}` - one entry per page; `header:true` shows the agent strip (chat only) |
| `DEFAULT_PATH` | `"/chat"` - shown for unknown/empty paths |
| `currentPath()` | where we are NOW: reads `location.hash` (`"#/x"` -> `"/x"`), falls back to pathname if it matches a route, else `"/"` |
| `resolveRoute(path?)` | ROUTES entry for a path (default page when unknown); sidebar and router both use it so they can never disagree |

**HOW TO ADD A PAGE:** create `pages/tools.js` exporting `renderPage({middle, bottom})`,
then add `{ path:"/tools", label:"Tools", module:"tools" }` to ROUTES.
Sidebar link, active highlight, routing, title - all automatic.

### js/router.js

| Export | Definition |
|---|---|
| `startRouter(api)` | stores `{prepareWorkspace}`, listens to `hashchange`, mounts the first page |

Internal: `mountCurrentPage()` -> resolveRoute -> prepareWorkspace(route.header)
-> clear middle/bottom -> dynamic `import("./pages/<module>.js")` ->
`renderPage({middle, bottom})`; failures render an error box; sets
`document.title = "<label> - AI Factory"`.

### js/models.js  (pure data logic - safe to unit test)

| Export | Definition |
|---|---|
| `makeId(prefix="id")` | `"msg-l8x2p9k3f"` style unique id |
| `createAttachment({name, size=0, type=""})` | `{id:"att-*", name, size, type}` |
| `createMessage({discussionId, parentId=null, role, author, text, attachments=[]})` | Message shape (see DATA SHAPES) |
| `createDiscussion({title="New discussion", agentId="", agentName="", model=""})` | Discussion shape |
| `isEmpty(discussion)` | bool - no messages yet |
| `findMessage(discussion, messageId)` | message or null |
| `childMessages(discussion, parentId)` | direct replies array |
| `removeMessageAndChildren(discussion, messageId)` | removes subtree, returns count |
| `buildApiHistory(messages, maxTurns=20)` | last N turns as `[{role, content}]` for /api/chat |
| `formatTimestamp(isoString)` | today `"14:05"` else `"Jun 3, 14:05"` |
| `formatBytes(bytes)` | `"4 KB"`, `"1.2 MB"`, ... |

### js/api_fetch.js  (only network door)

Private `request(path, options)`: JSON headers, throws readable errors
("Cannot reach the server..." / "Server error NNN").
House pattern for a NEW call: copy any function below, rewrite path/body.

| Export | HTTP | Definition |
|---|---|---|
| `getModels()` | GET `/api/models` | `[{id,name}]` (empty ok) |
| `getAgents()` | GET `/api/agents` | `[{id,name,description,mode}]` |
| `sendChat({message, agentId="", model="", history=[]})` | POST `/api/chat` | body `{message, model, agent_id, history}`; returns reply string |
| `listDiscussions()` | GET `/api/discussions` | all conversations |
| `pushDiscussion(discussion)` | POST `/api/discussions` | upsert by id (server stamps updatedAt); throws unless `{saved:true}` |
| `removeDiscussionApi(id)` | DELETE `/api/discussions/{id}` | delete one |
| `listHistory()` | GET `/api/history` | saved snapshots |
| `saveToHistory(message)` | POST `/api/history` | upsert snapshot (server stamps savedAt) |
| `removeFromHistory(id)` | DELETE `/api/history/{id}` | "Unsave" |
| `loadAppSettings()` | GET `/api/settings` | stored settings object (`{}` fresh) |
| `storeAppSettings(partial)` | POST `/api/settings` | MERGES into stored; unspecified keys survive |
| `exportWizardFiles({name, markdown, data})` | POST `/api/exports` | writes `data/exports/{name}.md` + `.json`; throws unless `{saved:true}` |

## 3b Shell modules

### js/app.js  (ENTRY POINT)

No exports. Boot order: `initShell()` -> `startRouter({prepareWorkspace})`.
Header comment maps the whole architecture.

### js/ui/shell.js

| Export | Definition |
|---|---|
| `initShell()` | once: renders sidebar nav into `#sidebar-nav` + wires Collapse/Expand toggle (flips `.collapsed`) |
| `prepareWorkspace(showHeader)` | rebuilds `#main-workspace` skeleton when the header mode CHANGED, then returns FRESH `{middle, bottom}` refs for the router to hand to pages |

### js/ui/navigation.js

| Export | Definition |
|---|---|
| `renderNavigation(container)` | fills container with one `<a class="nav-item" href="#<path>">` per ROUTES entry; marks the CURRENT page `.active` via resolveRoute() |

### js/ui/workspace.js

| Export | Definition |
|---|---|
| `renderWorkspace(container, {header=false})` | replaces container content with `[agent-header?] + #workspace-middle + #workspace-bottom`; returns `{root, header, middle, bottom}`. Markup mirrors the ORIGINAL hand-written HTML id-for-id so existing CSS keeps working |

## 3c UI modules

### js/ui/markdown.js  (ONE renderer everywhere text shows)

| Export | Definition |
|---|---|
| `renderMarkdown(text)` | text -> DocumentFragment of `<p>/<pre>/<ul>/<ol>` nodes, ready to append. SAFETY: createElement+textContent only, never innerHTML; link hrefs restricted to http(s) |

Supported subset:
- Blocks: ``` fenced code ``` (language tag dropped), blank-line paragraphs,
  `- `/`* ` bullet lists (all lines), `1.`/`1)` numbered lists (all lines).
- Inline: `` `code` ``, `**bold**`, `*italic*`, `[text](https://link)`.
- Extension points: `INLINE_RULES` table (inline features - each rule owns
  its tag + regex), `buildBlock()` branch (block features). Longest match
  wins at equal positions so `**bold**` beats `*italic*`.

Used by: `ui/thread.js` (chat bubbles), `pages/discussions.js` (board posts),
`pages/history.js` (saved rows).

### js/ui/thread.js  (chat renderer, recursive)

| Export | Definition |
|---|---|
| `createMessageElement(discussion, message, buildActions)` | builds one `<article>`; recurses over replies inside `.message-replies` |
| `renderThread(threadElement, discussion, buildActions)` | full redraw; welcome box when empty |
| `appendMessage(threadElement, discussion, message, buildActions)` | add one, remove welcome box, scroll down |
| `scrollToBottom(threadElement)` | jump to latest |
| `showTypingIndicator(el)` / `removeTypingIndicator(el)` | pulsing dots while waiting |
| `buildBody(message)` | internal: `renderMarkdown(message.text)` + attachment chips |

`buildActions` contract: `(message) => actionsElement | null`.

### js/ui/message-actions.js

| Export | Definition |
|---|---|
| `buildMessageActions(message, handlers={})` | row: Reply, Save/Unsave, Copy (clipboard + prompt fallback), Edit (user role, needs `onEditFinish`), Delete. Handlers: `{onReply(m), onSaveToggle(m), onDelete(m), onEditFinish(m,newText)}` |
| `startInlineEdit(article, message, onFinish(newText))` | swaps body for textarea; Save, Cancel, Ctrl/Cmd+Enter |

### js/ui/attachments.js

| Export | Definition |
|---|---|
| `initAttachmentPicker(parts)` | `parts = {button, input, list}`; returns `{getAttachments(), clear(), retarget({button,list})}` |

Stores metadata only (`createAttachment`). The hidden input node PERSISTS
across page mounts - create the picker ONCE, then `retarget()` on rebuilds
(prevents duplicate change listeners). Used by chat AND discussions pages.

### js/ui/post-sections.js  (config-driven panels)

| Export | Definition |
|---|---|
| `createPostSection({mount, className?, title?, description?, note?, inputs=[], buttons=[], footerNote?})` | builds heading + labeled controls + buttons row into `mount`; returns `{root, setStatus(text, kind), actionsRow, input(id)}` |

Input specs: `{id, label?, tag:"input"|"textarea"|"select", placeholder?,
rows?, options:[{value,label}], value?}`.
Button specs: `{label, className?, onClick?}` for local actions OR
`{label, fetch, collect(values)->payload, okMessage?}` for server-connected
posters (status line turns green/red automatically).

Used by settings page (both sections) and the discussions start panel.

### js/ui/wizard.js  (prompt builder + export)

Data (module-private): `WIZARD_TASKS` - explain / write / code / summarize /
brainstorm / freeform. Each task:
`{id,label,description,questions:[{id,label,placeholder}],template(answers)->prompt}`.
Adding a task = adding one object here.

| Export | Definition |
|---|---|
| `initWizard(ui, onUsePrompt)` | bind once (modal nodes persist!). `ui={overlay,steps,body,back,next,close,exportButton}`; `onUsePrompt(promptText)` fires on final step |
| `openWizard()` | reset state (step 0) and show modal |
| `closeWizard()` | hide modal |

Internal state: `currentStep` (0 choose, 1 details, 2 review),
`selectedTask`, `answers{questionId:text}`, `exportName`.
Esc/backdrop closes. Export machinery: step-3 filename field (prefilled
`slugify(task.id)-YYYY-MM-DD`, editable), `handleExport()` ->
`exportWizardFiles(...)` with button-flash feedback, `buildExportMarkdown()`
(# label, date line, prompt), `buildExportJson()`
(`{name,taskId,taskLabel,createdAt,prompt,answers}`), `slugify()`,
`todayStamp()`. Export button visibility tied to step index in `renderStep()`.

## 3d Page modules (all export the same contract)

```javascript
export async function renderPage({ middle, bottom }) {
    middle.innerHTML = `...markup...`;   // inject FIRST
    // grab refs, wire events, fetch data
}
```

### js/pages/chat.js

State (module-level lets, refreshed per mount by `grabRefs()`):
`agents[]`, `discussion`, `replyTargetId`, `isWaitingForReply`,
`attachmentPicker` (created once + retargeted), `wizardBound` guard
(modal listeners bound exactly once).
Mount: thread into `middle`, reply area into `bottom`, then init:
attachments -> wizard -> `loadServerLists()` (dropdowns; offline =
header error) -> restore active discussion via loadAppSettings()
else fresh with saved defaults -> render.
Send flow: `sendMessage()` pushes user Message (parentId=reply target),
titles discussion from first post, `persist()`, appends; typing indicator;
`requestReply()` calls `sendChat` with `buildApiHistory(...)`, pushes
assistant reply on same branch, persists, appends; errors become a System
bubble. Header/selectors sync via `updateHeader()`; selectors and
New-chat persist immediately. Wizard callback writes into the CURRENT
composer via live `get("#message-input")`.

### js/pages/agents.js

`renderPage` injects `.page` + `#agent-grid`; fetches agents -> cards
(name, mode badge, description). Start chat: `storeAppSettings({defaultAgentId})`
-> fresh `createDiscussion` -> `pushDiscussion` -> set `activeDiscussionId`
-> `location.hash = "#/chat"`. Empty/error states with Retry.

### js/pages/discussions.js

Two-pane board. Mount: panes into `middle`, `#composer-dock` into `bottom`.
State: `discussions[]` (server mirror), `selectedId`, `replyTargetId`,
`attachmentPicker` (once + retarget).
Left pane: newest-first list, count badge, hover Rename/Del rows,
keyboard-accessible select, "+ New Conversation".
Right pane `renderBoard()`: header (title/subtitle/Open-in-Chat/Delete) +
recursive posts; ends with `renderDock()`: A) composer variant when a
discussion is open, B) `.start-panel` otherwise (createPostSection;
first post titles the conversation).
Post cards: `[.post-main | .post-rail]`; rail is DATA (`POST_RAIL_BUTTONS`:
Reply/Edit/Copy/Save/Del). Post bodies via `renderMarkdown` (replaced the
old private fence parser). `persist()` = pushDiscussion +
activeDiscussionId, optimistic (network failures logged, not blocking).
NO LLM calls on this page.

### js/pages/history.js

Lists snapshots newest-first (`savedAt || timestamp`): Copy / Unsave /
Open source (if source exists -> sets activeDiscussionId, `#/chat`).
Rows render via `renderMarkdown`.

### js/pages/settings.js

Everything built through createPostSection into `#settings-root`:
Preferences (default agent/model selects, Save merges to server) +
Danger zone (confirm -> delete every discussion + history item via the
same API wrappers, reset app_settings; status line reports result).
Error fallback with Retry when server unreachable.

## 3e DATA SHAPES (authoritative)

```javascript
// Attachment
{ id: "att-x1", name: "notes.txt", size: 4096, type: "text/plain" }

// Message  (models.createMessage)
{
    id: "msg-x1",
    discussionId: "disc-x1",
    parentId: null,              // null = top-level; else id of parent post
    role: "user" | "assistant",
    author: "You" | "<agent display name>" | "System",
    text: "...",                 // rendered by ui/markdown.js
    attachments: [ /* Attachment */ ],
    timestamp: "2026-08-22T18:20:00.000Z",
    edited: false,
    saved: false                 // mirror flag; History uses snapshots
}

// Discussion  (models.createDiscussion)
{
    id: "disc-x1", title: "...",
    agentId: "" | "<agent_library folder name>",
    agentName: "",               // display convenience
    model: "" | "<ollama model id>",
    createdAt: ISO, updatedAt: ISO,   // updatedAt stamped by the server
    messages: [ /* Message */ ]
}

// App settings  (config/app_settings.json via /api/settings)
{ defaultAgentId: "", defaultModel: "", activeDiscussionId: "" }

// Wizard export files (data/exports/)
// {name}.md   -> "# <task label>\n\n*Created ... on <date>.*\n\n<prompt>\n"
// {name}.json -> { name, taskId, taskLabel, createdAt, prompt, answers }
```

## 3f SERVER CONTRACT

| Endpoint | Method | Payload | Response |
|---|---|---|---|
| `/api/models` | GET | - | `{models:[{id,name}]}` |
| `/api/agents` | GET | - | `{agents:[{id,name,description,mode}]}` |
| `/api/chat` | POST | `{message, model, agent_id, history:[{role,content}]}` | `{reply:"..."}` |
| `/api/discussions` | GET/POST | POST body = one discussion | GET `{discussions:[]}`; POST `{saved, updatedAt}` |
| `/api/discussions/{id}` | DELETE | - | `{deleted}` |
| `/api/history` | GET/POST | POST body = one snapshot | GET `{history:[]}`; POST `{saved, savedAt}` |
| `/api/history/{id}` | DELETE | - | `{deleted}` |
| `/api/settings` | GET/POST | POST = partial settings | `{settings:{...}}` (POST merges) |
| `/api/exports` | POST | `{name, markdown, data}` | `{saved, files:["x.md","x.json"]}` |

Storage files: `data/discussions.json`, `data/history.json`,
`data/exports/{safe}.md|.json`, `config/app_settings.json`.
Server serves `/` -> index.html, `/static/*`, `/favicon.ico`.
Names are sanitized server-side (`_safe_file_name`: letters/digits/._-
only, max 80 chars) so path tricks cannot escape `data/exports/`.
server.py also forces correct MIME types for `.js`/`.css` (Windows
registry workaround) - required for ES modules.

---

# KEY FLOWS

**A. Send a chat message**
input -> `sendMessage()` -> user Message pushed (parentId=reply target) ->
persist (server) -> drawn -> typing indicator ->
`sendChat({message, agentId, model, history: buildApiHistory(...)})` ->
assistant Message (same branch) -> persist + draw -> focus input.
Failures render as a System bubble.

**B. First post from the board**
type in `.start-panel` -> Create discussion -> new Discussion titled from
the text, user Message pushed, persisted, selected -> board renders it ->
dock swaps to the composer variant.

**C. Wizard export**
step 3 -> edit name/prompt -> Export -> `slugify(name)` ->
`exportWizardFiles` -> POST /api/exports -> `_safe_file_name` ->
`data/exports/{name}.md` + `{name}.json` -> button flashes "Saved on server!".

**D. Page navigation**
click nav link (or any `location.hash = "#/..."`) -> hashchange ->
router: resolveRoute -> prepareWorkspace(header?) -> clear middle/bottom ->
dynamic import -> `renderPage({middle,bottom})` -> title update.

---

Reference doc: `AI_Agent_Thread_UI_Wireframe_DOM_Guide.md` (DOM map, CSS
layout rules, manipulation patterns this codebase follows).
