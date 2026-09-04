# AI Agent Laboratory

A local lab for building and testing AI agents: **FastAPI** backend + vanilla JS
frontend + **Ollama** local LLMs.

The core idea:

```
Agent      = one reusable Python runtime (think / act / observe)
Markdown   = behavior        (agent_library/*/agent.md)
JSON       = configuration   (agent_library/*/agent.json)
Tools      = capabilities    (app/tools/, wired by ID)
Registry   = discovery       (agent_library/ is scanned automatically)
Factory    = construction    (agent_id -> ready Agent)
Frontend   = selection       (GET /api/agents -> agent selector)
```

You can build 10, 20, or 100 agents without ever writing a new Python class:
a new agent is just a folder with `agent.md` + `agent.json` (+ tool IDs).

## Quickstart (Windows PowerShell)

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python server.py
```

Open **http://127.0.0.1:8000** (Chrome/Edge). Override port: `$env:PORT=9000; python server.py`.

## Folder structure

```
short_circuit_1/
├── server.py                  # FastAPI entry point - the ONLY thing the browser talks to
│
├── app/
│   ├── core/
│   │   ├── agent.py           # AgentProfile + the reusable Agent (think/act/observe)
│   │   ├── llm.py             # ask_llm(), model resolution, context window, Ollama scan
│   │   └── prompt.py          # PromptManager: agent.md sections + tools -> system prompt
│   │
│   ├── agents/
│   │   ├── loader.py          # find/read/parse agent_library/{id}/agent.md + agent.json
│   │   ├── registry.py        # scans agent_library/ -> available agents (auto-discovery)
│   │   └── factory.py         # build_agent(agent_id, model) -> ready-to-use Agent
│   │
│   └── tools/
│       ├── registry.py        # TOOL_REGISTRY: tool IDs -> Python functions
│       ├── files.py           # read_file, write_file, read_pdf
│       ├── workspace.py       # create_folder, create_file, setup_venv
│       ├── datetime_tools.py  # get_current_date, tell_me_the_date_and_time
│       ├── search.py          # (future search tools)
│       └── web.py             # (future web tools)
│
├── agent_library/             # THE AGENTS - filesystem is the source of truth
│   ├── basic_chat/            # agent.md + agent.json  (mode: chat, no tools)
│   ├── basic_chat_agent/      # agent.md + agent.json  (mode: agent, 3 tools)
│   └── dev_assistant/         # agent.md + agent.json  (mode: agent, all 8 tools)
│
├── config/
│   ├── models.json            # AUTO-GENERATED at startup from installed Ollama models
│   └── settings.json          # {"default_agent": "basic_chat"}
│
├── static/
│   ├── index.html             # UI shell (chats sidebar, chat window, agent panel)
│   ├── styles.css
│   └── js/
│       ├── api.js             # fetch calls: /api/models, /api/agents, /api/chat
│       └── app.js             # state, chat sessions, agent selector, rendering
│
├── README.md
└── requirements.txt
```

## How an answer is produced

```
Browser
  ↓ POST /api/chat {message, model, agent_id, history, session_id, title, new_chat}
server.py
  ↓ chat_store.ensure_session()           app/chat_store/store.py  (ONE active chat)
  ↓ build_agent(agent_id)                 app/agents/factory.py
loader: agent.md + agent.json             app/agents/loader.py
tools:  IDs -> functions                  app/tools/registry.py
prompt: sections + tool docs -> system msg   app/core/prompt.py
  ↓
Agent.think()                             app/core/agent.py
  ↓ ask_llm()                             app/core/llm.py
Ollama
  ↓
server.py appends the turn to the active chat and returns {reply, session_id, title}
  ↓ (on "Save chat" / new chat)
chat_store.finalize_session() writes data/chatlog/agent-text-records/<title>[-v].txt
+ logs it in data/chatlog/chatRecord.jsonl
```

## Chats: one server-side session at a time

The server tracks exactly ONE active chat session (it has its own start,
middle and end):

- First message of a chat (or `new_chat: true`) finalizes any previous chat and
  starts a new one; the server owns the conversation, so a page refresh never
  loses it.
- `data/chatlog/.active-chat.json` holds the live session (updates after every
  turn).
- Ending a chat (`POST /api/chats/end`, the "Save chat" button, or starting a
  new chat) writes ONE transcript per chat to
  `data/chatlog/agent-text-records/<title>.txt` — and on a name collision the
  NEXT version (`<title>-2.txt`, ...). Re-saving a chat you kept typing in
  produces the next version; old versions stay on disk.
- `data/chatlog/chatRecord.jsonl` is the LOG of those transcripts (title, agent,
  model, version, message/interaction counts, timestamps) used by the
  frontend drop-down — one line per chat VERSION; the drop-down shows the
  newest version of each chat. Existing `.txt` files are imported into the log
  once at startup.

Version helpers: `python scripts/version_chats.py list | import | bump
<id-or-title> [version] | versioning on|off`.

Agent modes:

- `chat`  — User → LLM → Response. The factory attaches no tools, so no tool loop can happen.
- `agent` — User → Agent → LLM → Tool? → Observation → LLM → Response. Same `Agent` class; only its configuration differs.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/models` | Model dropdown options (scanned from Ollama at startup) |
| `GET /api/agents` | All discovered agents: `{id, name, description, mode}` |
| `POST /api/chat` | `{message, model, agent_id, history, session_id?, title?, new_chat?}` → `{reply, session_id, title}` |
| `GET /api/chats` | Chat log + the active chat (feeds the chats drop-down) |
| `GET /api/chats/{id}` | One chat: log row + `.txt` content + parsed messages |
| `POST /api/chats/end` | Finalize the active chat into a versioned `.txt` + log it |
| `POST /api/chat-save` | Finalize the active chat (kept for legacy clients) |
| `GET/POST/DELETE /api/discussions` | The same chat log (chatRecord.jsonl records) |

## Creating a new agent

No Python required: create a folder under `agent_library/` containing
`agent.json` (configuration) + `agent.md` (behavior), pick tool IDs, and
refresh — the agent appears automatically in `GET /api/agents` and the
frontend selector.

Full field reference, tool catalog, copy-paste example, and troubleshooting:
**[CREATING_AGENTS.md](documentation/CREATING_AGENTS.md)**

## Adding a new tool

1. Write the function in the right category module (`app/tools/files.py`,
   `workspace.py`, ...) with a clear docstring — Ollama turns docstrings
   into the tool schema the LLM sees.
2. Add one line to `TOOL_REGISTRY` in `app/tools/registry.py`.
3. Reference the ID in any agent's `agent.json`.

## Notes

- The backend tracks one active chat session at a time (see "Chats" above);
  `history` is still accepted for backwards compatibility.
- `/api/chat` is intentionally a sync endpoint so blocking LLM calls run in
  FastAPI's threadpool instead of stalling the event loop.
- Chat transcripts live in `data/chatlog/agent-text-records/` as `.txt` files;
  `data/chatlog/chatRecord.jsonl` is the header log that points at them.
