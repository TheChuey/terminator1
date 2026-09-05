# Creating Agents

Everything you need to add a new agent to Terminator1.
**No Python class required.** A new agent is a folder with two files:

```
agent_library/my_agent/
├── agent.json    # configuration: name, mode, model, tools
└── agent.md      # behavior: role, personality, boundaries, rules
```

The design principle:

```
Agent      = one reusable Python runtime (app/core/agent.py)
Markdown   = behavior        (agent_library/*/agent.md)
JSON       = configuration   (agent_library/*/agent.json)
Tools      = capabilities    (app/tools/registry.py)
Discovery  = automatic       (agent_library/ is scanned per request)
```

---

## Quick walkthrough

| Step | Action |
|---|---|
| 1 | Create a folder under `agent_library/` (folder name = agent id) |
| 2 | Write `agent.json` — metadata + configuration |
| 3 | Write `agent.md` — behavior sections |
| 4 | Pick tool IDs for the `"tools"` list |
| 5 | Refresh the browser page — the agent appears in the selector |

No restart needed: the backend rescans `agent_library/` on every request,
and definitions are re-read for every message. Edits apply immediately.

---

## `agent.json` field reference

```json
{
  "id": "research_agent",
  "name": "Research Agent",
  "description": "Researches topics using web tools.",
  "mode": "agent",
  "model": null,
  "tools": ["read_file", "write_file"]
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Unique identifier sent by the frontend in `/api/chat`. **Keep it identical to the folder name** — lookups go through it. |
| `name` | string | yes | Display name shown in the frontend selector. |
| `description` | string | no | One-line summary shown under the name in the selector. |
| `mode` | string | yes | `"chat"` or `"agent"` (see below). |
| `model` | string \| null | no | Fallback model used when the frontend sends none. A frontend selection always wins. `null` = always use the selected model. Pin e.g. `"gemma4:e2b"` to prefer one. |
| `tools` | string[] | no | Tool IDs from `app/tools/registry.py`. Ignored entirely when `mode` is `"chat"`. |

### Modes

- **`chat`** — User → LLM → Response. The factory attaches **zero tools**, so
  the tool loop can never trigger. Use for pure conversationalists.
- **`agent`** — User → LLM → tool call? → observation → LLM → Response.
  Tools from the `"tools"` list are advertised to the LLM and executable.

Both modes use the same `Agent` class — only configuration differs.

---

## `agent.md` section reference

Sections are written as `## <name>` blocks. The title line (`# ...`) at the
top is ignored.

### Known sections (mapped to prompt blocks)

| Section | Becomes in system prompt |
|---|---|
| `## role` | `ROLE\n...` |
| `## purpose` | `PURPOSE\n...` |
| `## personality` | `PERSONALITY\n...` |
| `## boundaries` | `BOUNDARIES\n...` |
| `## communication` | `COMMUNICATION STYLE\n...` |
| `## principles` | `PRINCIPLES\n...` |
| `## decision_style` | `DECISION STYLE\n...` |

All are optional; empty sections are skipped.

### Custom sections

Any other `## section` you invent passes straight into the prompt as an
UPPERCASE-titled block, sorted alphabetically. Example: `## job` becomes
`JOB\n<content>`. New sections never require code changes.

Special cases:

- `## priorities` — documentation only; deliberately **excluded** from the prompt.
- Do not hand-write a `## skills` / tool list section — the `AVAILABLE TOOLS`
  block is generated automatically from your resolved tools' docstrings.

---

## Available tools

IDs you can put in `"tools"` today:

| ID | Category | Description |
|---|---|---|
| `read_file` | files.py | Reads and returns the contents of a text file. |
| `write_file` | files.py | Writes or overwrites text content to a file. |
| `read_pdf` | files.py | Extracts text contents from a PDF file. |
| `create_folder` | workspace.py | Creates a directory at the specified path. |
| `create_file` | workspace.py | Creates a new file with optional initial content. |
| `setup_venv` | workspace.py | Creates a Python virtual environment (.venv). |
| `get_current_date` | datetime_tools.py | Returns the real current date as a formatted string. |
| `tell_me_the_date_and_time` | datetime_tools.py | Returns the current date and time. |

Missing IDs produce a loud warning in the server console and are skipped:

```
[TOOLS] WARNING: tool 'web_search' is listed in agent.json but missing from TOOL_REGISTRY - skipped
```

To add a new tool: write the function in the right module under `app/tools/`
with a clear docstring (Ollama turns docstrings into the schema the LLM
sees), then add one line to `TOOL_REGISTRY` in `app/tools/registry.py`.

---

## Complete copy-paste example

Create these two files, refresh the browser, done.

**`agent_library/research_agent/agent.json`**

```json
{
  "id": "research_agent",
  "name": "Research Agent",
  "description": "Researches topics using local files and organized notes.",
  "mode": "agent",
  "model": null,
  "tools": ["read_file", "write_file", "get_current_date"]
}
```

**`agent_library/research_agent/agent.md`**

```markdown
# Research Agent

## role

You are a research assistant.

## purpose

Research topics and provide useful, organized information.

## communication

Be clear, concise, and factual.

## boundaries

Do not invent information.
When unsure, say what is known and what is not.

## principles

Cite which file each finding came from.
Prefer primary sources over speculation.
```

---

## Testing checklist

1. Refresh the page → new agent appears under **Agents** with its name and description.
2. `GET http://127.0.0.1:8000/api/agents` lists it with the correct `mode`.
3. Send a simple message → normal reply (check the server console for `[ask_llm]`).
4. For `mode: "agent"`: ask something requiring a tool (e.g. *"What is today's date?"*).
   Confirm in the console:
   - `[Agent.think] Executing 1 tool call(s)...`
   - `[Agent.act] Executed get_current_date -> ...`
   - then a final reply that uses the tool result.
5. Switch back to another agent → behavior/persona changes accordingly.

---

## Troubleshooting

| Symptom | Cause & fix |
|---|---|
| Agent missing from the selector | `agent.json` invalid JSON, or folder starts with `_`/`.`. Console shows `[REGISTRY] skipping <folder> ...`. Fix the JSON. |
| Chat replies `(unknown agent '...' )` | `id` in agent.json differs from the folder name, or folder was renamed. Keep both identical. |
| `[TOOLS] WARNING ... missing from TOOL_REGISTRY` | Typo in a tools ID. Copy IDs exactly from the table above. |
| Agent has tools but never calls them | `mode` is `"chat"` — the factory attaches zero tools in chat mode. Set `"mode": "agent"`. |
| Persona edits not taking effect | Definitions reload per message; send a new message or refresh. If still stale, confirm you edited the file inside `agent_library/<your_agent>/`, not a copy. |
| Model ignores pinned `model` | The frontend dropdown selection always wins. The pin only applies when no model is selected/sent. |
