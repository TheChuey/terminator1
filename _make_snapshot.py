"""Temporary generator for APP_SNAPSHOT.md (Sections 1-2). Deleted after use."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "APP_SNAPSHOT.md"

# Explicit ordered manifest - asserts existence so nothing silently drifts.
FILES = [
    "server.py",
    "app/core/agent.py",
    "app/core/llm.py",
    "app/core/prompt.py",
    "app/agents/loader.py",
    "app/agents/registry.py",
    "app/agents/factory.py",
    "app/tools/registry.py",
    "app/tools/files.py",
    "app/tools/workspace.py",
    "app/tools/datetime_tools.py",
    "app/tools/search.py",
    "app/tools/web.py",
    "agent_library/basic_chat/agent.json",
    "agent_library/basic_chat/agent.md",
    "agent_library/basic_chat_agent/agent.json",
    "agent_library/basic_chat_agent/agent.md",
    "agent_library/dev_assistant/agent.json",
    "agent_library/dev_assistant/agent.md",
    "config/models.json",
    "config/settings.json",
    "static/index.html",
    "static/styles.css",
    "static/js/api.js",
    "static/js/app.js",
    "README.md",
    "CREATING_AGENTS.md",
    "requirements.txt",
]

TREE = """\
```text
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
├── APP_SNAPSHOT.md            # this document
├── CREATING_AGENTS.md         # full guide: how to create a new agent
├── README.md                  # architecture map + quickstart
├── requirements.txt           # pinned dependencies
└── the_entire_enchilada.txt   # (historical notes from the previous architecture)

Excluded from this snapshot: .venv/, .git/, __pycache__/, .gitignore
```\n"""


def lang_for(path: str) -> str:
    if path.endswith(".py"):
        return "python"
    if path.endswith((".json",)):
        return "json"
    if path.endswith(".md"):
        return "markdown"
    if path.endswith((".js",)):
        return "javascript"
    if path.endswith(".html"):
        return "html"
    if path.endswith(".css"):
        return "css"
    return "text"


parts = []
parts.append("# APP SNAPSHOT — AI Agent Laboratory\n")
parts.append(
    "Complete self-contained copy of the application as of last update.\n\n"
    "- **Section 1** — file structure\n"
    "- **Section 2** — folder + file name + full contents of every file\n"
    "- **Section 3** — endpoint definitions, variables, and an AI PROMPT with "
    "step-by-step instructions for replicating the application\n"
)
parts.append("\n---\n\n## SECTION 1 — FILE STRUCTURE\n\n")
parts.append(TREE)
parts.append("\n---\n\n## SECTION 2 — FILES (FOLDER / FILE / CONTENTS)\n")

for rel in FILES:
    f = ROOT / rel
    if not f.exists():
        raise SystemExit(f"MISSING FILE IN MANIFEST: {rel}")
    content = f.read_text(encoding="utf-8").rstrip("\n")
    folder = str(Path(rel).parent).replace("\\", "/")
    name = Path(rel).name
    parts.append(
        f"\n============================================================\n"
        f"FOLDER: {folder}\n"
        f"FILE: {name}\n"
        f"============================================================\n\n"
        f"````{lang_for(rel)}\n{content}\n````\n"
    )

parts.append("\n<!-- SECTION_3 -->\n")

OUT.write_text("".join(parts), encoding="utf-8")
print(f"wrote {OUT.name}: {len(FILES)} files embedded")
