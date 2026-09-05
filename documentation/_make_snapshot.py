"""Generator for APP_SNAPSHOT.md (Sections 1-4).

Kept for automatic documentation updates. Given the script now lives in
documentation/, ROOT is resolved as the project root (two levels up) so the
manifest paths and the OUTPUT file still point at the repository root.

Section 1 -> file structure
Section 2 -> folder + file name + full contents of every file
Section 3 -> change-log archive (the_entire_enchilada v1-1 .. v1-6)
Section 4 -> a docscript AI prompt that keeps the docs in sync with the app
"""
from pathlib import Path

# Script lives in documentation/, so the project root is its parent.
ROOT = Path(__file__).resolve().parent.parent
DOC = Path(__file__).resolve().parent
OUT = DOC / "APP_SNAPSHOT.md"

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
    "app/chat_store/__init__.py",
    "app/chat_store/logger.py",
    "app/chat_store/store.py",
    "agent_library/basic_chat/agent.json",
    "agent_library/basic_chat/agent.md",
    "agent_library/dev_assistant/agent.json",
    "agent_library/dev_assistant/agent.md",
    "agent_library/problem_discovery_agent/agent.json",
    "agent_library/problem_discovery_agent/agent.md",
    "config/models.json",
    "config/settings.json",
    "static/index.html",
    "static/chat.html",
    "static/config/app_settings.json",
    "static/css/styles.css",
    "static/js/app.js",
    "static/js/api/api.js",
    "static/js/classes/ChatSession.js",
    "static/js/classes/chat-window.js",
    "static/js/logic/models.js",
    "static/js/logic/chat-formatter.js",
    "static/js/ui/markdown.js",
    "static/js/ui/agents.js",
    "static/js/ui/config.js",
    "static/js/ui/config-form.js",
    "static/js/ui/appearance.js",
    "static/js/ui/chat-tests.js",
    "README.md",
    "documentation/CREATING_AGENTS.md",
    "requirements.txt",
    "scripts/version_chats.py",
]

TREE = """\
```text
terminator1/  (Terminator1)
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
│   ├── tools/
│   │   ├── registry.py        # TOOL_REGISTRY: tool IDs -> Python functions
│   │   ├── files.py           # read_file, write_file, read_pdf
│   │   ├── workspace.py       # create_folder, create_file, setup_venv
│   │   ├── datetime_tools.py  # get_current_date, tell_me_the_date_and_time
│   │   ├── search.py          # (future search tools)
│   │   └── web.py             # (future web tools)
│   │
│   └── chat_store/            # chat log ownsership (one active chat, JSONL records)
│       ├── __init__.py        # package marker
│       ├── logger.py          # chat-session logging helpers
│       └── store.py           # ensure/append/finalize session, list/delete, save/delete discussion
│
├── agent_library/             # THE AGENTS - filesystem is the source of truth
│   ├── basic_chat/            # agent.md + agent.json  (mode: chat, no tools)
│   ├── dev_assistant/         # agent.md + agent.json  (mode: agent, full toolset)
│   └── problem_discovery_agent/ (agent.md + agent.json)
│
├── config/
│   ├── models.json            # AUTO-GENERATED at startup from installed Ollama models
│   └── settings.json          # {"default_agent": "basic_chat"}
│
├── static/
│   ├── index.html             # main UI shell (chats sidebar, chat window, agent panel)
│   ├── chat.html              # standalone self-contained chat page (window.open target)
│   ├── config/app_settings.json
│   ├── css/styles.css
│   └── js/
│       ├── app.js             # state, chat sessions, agent selector, rendering
│       ├── api/api.js         # fetch calls: /api/models, /api/agents, /api/chat
│       ├── classes/ChatSession.js, chat-window.js
│       ├── logic/models.js, chat-formatter.js
│       └── ui/markdown.js, agents.js, config.js, config-form.js,
│           appearance.js      # appearance settings (theme, font family/size)
│           chat-tests.js      # run agent test-set + integrated test chat runs
│
├── scripts/
│   └── version_chats.py       # chat versioning helper (dev-side)
│
├── documentation/             # ALL living documentation
│   ├── APP_SNAPSHOT.md        # this snapshot (regenerated by _make_snapshot.py)
│   ├── _make_snapshot.py      # generator script (kept for automatic updates)
│   ├── CREATING_AGENTS.md     # full guide: how to create a new agent
│   ├── the_entire_enchilada.txt          # historical (previous architecture)
│   ├── the_entire_enchilada_v1.txt       # full reference (baseline V1)
│   ├── the_entire_echilada_v1-1.txt      # NET-DELTA log (V1 -> V1.1)
│   ├── the_entire_enchilada_v1-2.txt     # NET-DELTA log (V1.1 -> V1.2)
│   ├── the_entire_enchilada_v1-3.txt     # NET-DELTA log (V1.2 -> V1.3)
│   ├── the_entire_enchilada_v1-4.txt     # NET-DELTA log (V1.3 -> V1.4)
│   ├── the_entire_enchilada_v1-5.txt     # NET-DELTA log (V1.4 -> V1.5)
│   └── the_entire_enchilada_v1-6.txt     # NET-DELTA log (V1.5 -> V1.6)
│
├── README.md                  # architecture map + quickstart
├── requirements.txt           # pinned dependencies

Excluded from this snapshot: .venv/, .git/, __pycache__/, .gitignore, data/,
static/_archive/ (old archived frontend)
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


# ---------------------------------------------------------------------------
# SECTION 3 - CHANGE LOG ARCHIVE
# ---------------------------------------------------------------------------
# Verbatim copies of every NET-DELTA changelog version so the snapshot is a
# complete history of the application (v1-1 .. v1-6).

CHANGELOGS = [
    "documentation/the_entire_echilada_v1-1.txt",
    "documentation/the_entire_enchilada_v1-2.txt",
    "documentation/the_entire_enchilada_v1-3.txt",
    "documentation/the_entire_enchilada_v1-4.txt",
    "documentation/the_entire_enchilada_v1-5.txt",
    "documentation/the_entire_enchilada_v1-6.txt",
]


def build_archive() -> str:
    header = "\n---\n\n## SECTION 3 — CHANGE LOG ARCHIVE (v1-1 .. v1-6)\n"
    parts = [header]
    for rel in CHANGELOGS:
        f = ROOT / rel
        if not f.exists():
            raise SystemExit(f"MISSING CHANGELOG IN MANIFEST: {rel}")
        content = f.read_text(encoding="utf-8").rstrip("\n")
        parts.append(
            f"\n============================================================\n"
            f"FOLDER: {Path(rel).parent}\n"
            f"FILE: {Path(rel).name}\n"
            f"============================================================\n\n"
            f"````text\n{content}\n````\n"
        )
    return "".join(parts)


# ---------------------------------------------------------------------------
# SECTION 4 - DOCSCRIPT PROMPT
# ---------------------------------------------------------------------------
# A self-repeating AI prompt ("docscript") that keeps the app's documentation
# in sync with the live source. Because it lives inside this generator, every
# automatic re-run regenerates the current maintenance prompt too.


def build_section4() -> str:
    title = "\n---\n\n## SECTION 4 — DOCSCRIPT (AI DOCUMENTATION MAINTENANCE PROMPT)\n"
    return title + "\n" + DOCSCRIPT_PROMPT + "\n"


DOCSCRIPT_PROMPT = """\
You are a documentation maintenance AI ("docscript") for the
**Terminator1** project (terminator1). Your only job is to keep the
project's living documentation accurate as the code evolves. You do NOT write
application source code; you only update the documentation.

The documentation lives in `documentation/`:
  - `APP_SNAPSHOT.md`              full self-contained snapshot (Sections 1-4),
                                   regenerated by running
                                   `python documentation/_make_snapshot.py`
  - `CREATING_AGENTS.md`           how to author new agents
  - `the_entire_enchilada.txt`     historical reference (previous architecture)
  - `the_entire_enchilada_v1.txt`  full app reference (baseline V1)
  - `the_entire_echilada_v1-1.txt` NET-DELTA change log (V1 -> V1.1)
  - `the_entire_enchilada_v1-2.txt` NET-DELTA change log (V1.1 -> V1.2)
  - `the_entire_enchilada_v1-3.txt` NET-DELTA change log (V1.2 -> V1.3)
  - `the_entire_enchilada_v1-4.txt` NET-DELTA change log (V1.3 -> V1.4)
  - `the_entire_enchilada_v1-5.txt` NET-DELTA change log (V1.4 -> V1.5)
  - `the_entire_enchilada_v1-6.txt` NET-DELTA change log (V1.5 -> V1.6)

STEP-BY-STEP:

1. Diff every live source file against the most recent captured baseline
   described in the newest `the_entire_*.txt` delta file. Sources include:
   - Backend: `server.py`, everything under `app/`
   - Frontend: `static/index.html`, `static/chat.html`, `static/css/`,
     everything under `static/js/`
   - Config and agents: `config/`, `agent_library/{id}/agent.md` + `agent.json`
   Report ONLY net changes; never restate unchanged code.

2. Mirror those changes into the docs:
   - If `APP_SNAPSHOT.md` is stale, regenerate it with
     `python documentation/_make_snapshot.py` (this also refreshes this section
     and embeds the whole change-log archive as Section 3).
   - If new/changed behavior is significant, write the NEXT delta file
     (e.g. `the_entire_enchilada_v1-7.txt`) in the exact NET-DELTA style used
     by the previous delta file: a header banner naming the revision and the
     file it diffs against, a short overarching summary, per-file sections
     quoting exact new/removed/reworded code, an explicit "FILES NOT CHANGED"
     section, and a FRESH copy of this maintenance prompt at the end (so the
     workflow is self-perpetuating).

3. Update `README.md` and `CREATING_AGENTS.md` (or agent docs) whenever the
   structure, commands, or behavior they describe change. Keep every link that
   points at `documentation/` correct.

4. Never invent changes you cannot verify in the actual source files. Do not
   modify any application source file. Only touch documentation.

5. Follow the formatting conventions already used in the logs:
   `====...====` dividers, `FILE:` + delta sub-headers, concise prose.
"""


parts = []
parts.append("# APP SNAPSHOT — Terminator1\n")
parts.append(
    "Complete self-contained copy of the application as of last update.\n\n"
    "- **Section 1** — file structure\n"
    "- **Section 2** — folder + file name + full contents of every file\n"
    "- **Section 3** — change-log archive (the_entire_enchilada v1-1 .. v1-6)\n"
    "- **Section 4** — endpoint definitions, variables, and an AI PROMPT with "
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

parts.append(build_archive())
parts.append(build_section4())

OUT.write_text("".join(parts), encoding="utf-8")
print(f"wrote {OUT.name}: {len(FILES)} files embedded, {len(CHANGELOGS)} changelogs archived")

