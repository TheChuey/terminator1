# APP SNAPSHOT — AI Agent Laboratory
Complete self-contained copy of the application as of last update.

- **Section 1** — file structure
- **Section 2** — folder + file name + full contents of every file
- **Section 3** — endpoint definitions, variables, and an AI PROMPT with step-by-step instructions for replicating the application

---

## SECTION 1 — FILE STRUCTURE

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
```

---

## SECTION 2 — FILES (FOLDER / FILE / CONTENTS)

============================================================
FOLDER: .
FILE: server.py
============================================================

````python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
import json
import os

# App modules:
#   app.core.llm.refresh_models     -> scans installed Ollama models into config/models.json
#   app.agents.registry.list_agents -> scans agent_library/ for available agents
#   app.agents.factory.build_agent  -> builds a fresh Agent from
#                                      agent_library/{agent_id}/agent.md + agent.json,
#                                      replays chat history, and returns the LLM reply
from contextlib import asynccontextmanager
from pathlib import Path

from app.core.llm import refresh_models
from app.agents.registry import list_agents
from app.agents.factory import build_agent, replay_history, AgentNotFoundError

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
MODELS_FILE = BASE_DIR / "config" / "models.json"
SETTINGS_FILE = BASE_DIR / "config" / "settings.json"


def _default_agent() -> str:
    """The agent used when a chat request carries no agent_id.

    Comes from config/settings.json ("default_agent"); falls back to
    "basic_chat" when the file is missing or unreadable.
    """
    try:
        settings = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        return settings.get("default_agent") or "basic_chat"
    except (OSError, json.JSONDecodeError):
        return "basic_chat"


# Startup hook: scan Ollama models BEFORE any request is served, so the
# frontend dropdown is always in sync with what is actually installed.
@asynccontextmanager
async def lifespan(app: FastAPI):
    refresh_models()           # ollama -> config/models.json
    yield                      # serve requests; code after this runs on shutdown

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    model: str = ""
    agent_id: str = ""
    history: List[dict] = []  # Prior turns from the frontend: [{role, content}, ...]

# --- UI SOURCE OF TRUTH ---

"""
GET /api/models
---------------
What this request is:
    The front-end calls this endpoint on page load to populate the model
    dropdown (#model-select). It is a simple GET request with no body.

What it needs:
    1. A file named "models.json" located in the config folder of the project
       (config/models.json, relative to server.py), written by refresh_models().
    2. The file must contain a "models" key: a list of objects shaped like
       {"id": str, "name": str}.

Behaviour:
    - If models.json exists and has models, the list is returned.
    - If the file is missing, unreadable, or contains no models, the
      endpoint returns an empty list: {"models": []}.
"""

@app.get("/api/models")
async def get_models():
    if not MODELS_FILE.exists():
        print("[MODELS] models.json not found - returning empty list")
        return {"models": []}

    try:
        data = json.loads(MODELS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        print("[MODELS] models.json unreadable - returning empty list")
        return {"models": []}

    models = data.get("models", [])

    if not models:
        print("[MODELS] models.json has no models - returning empty list")
        return {"models": []}

    print("json file sent: models")
    return {"models": models}


@app.get("/api/agents")
async def get_agents():
    """Return every discovered agent from agent_library/.

    Each entry carries {id, name, description, mode}. Adding a new folder
    under agent_library/ (with agent.md + agent.json) automatically makes
    it show up here and in the frontend selector after a restart.
    """
    agents = list_agents()
    print(f"[AGENTS] {len(agents)} agent(s) discovered")
    return {"agents": agents}

# --- I/O ROUTES ---

@app.post("/api/chat")
def chat(data: ChatRequest):
    """Handle a chat message from the frontend.

    The request payload carries {message, model, agent_id, history}. We build a
    FRESH agent for this request (stateless - the frontend keeps its own
    conversation history), using the selected agent and model, then return the
    agent's reply.

    NOTE: this is a SYNC endpoint (def, not async def) on purpose. The LLM
    call inside agent.think() is blocking (it waits 10-60s for Ollama to
    generate). FastAPI runs sync endpoints in a THREADPOOL, so the event loop
    stays free and two chat requests do NOT block each other. An async def
    would run the blocking LLM call on the event loop and stall the whole
    server for every reply.
    """
    agent_id = data.agent_id or _default_agent()
    print(f"[SERVER] Message for '{agent_id}': {data.message}")
    print(f"[SERVER] history turns received: {len(data.history)}")

    try:
        agent = build_agent(agent_id, model=data.model or None)
    except AgentNotFoundError as exc:
        print(f"[SERVER] {exc}")
        return {"reply": f"(unknown agent '{agent_id}' - is the folder present in agent_library/?)"}

    # Replay the frontend's history so the whole conversation reaches the LLM.
    replay_history(agent, data.history)

    reply = agent.think(data.message)
    print(f"[SERVER] Reply via {agent.model}: {reply[:120]}...")

    return {"reply": reply}

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
async def home():
    return FileResponse(STATIC_DIR / "index.html")

if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
````

============================================================
FOLDER: app/core
FILE: agent.py
============================================================

````python
"""
app/core/agent.py
=================

The reusable runtime agent.

    AgentProfile - the agent's identity and prompt sections (from config)
    Agent        - the generic think / act / observe loop

The Agent does not know what KIND of agent it is (research, coding, chat...).
Its behavior comes entirely from its AgentProfile and the tools it was given.
"""

import json
import re
from dataclasses import dataclass, field
from typing import Callable, List

from app.core.llm import ask_llm


# ==========================================================================
# AGENT PROFILE
# --------------------------------------------------------------------------
# The identity and behavior of an agent. Metadata fields come from
# agent.json; the section fields come from agent.md.
# ==========================================================================

@dataclass
class AgentProfile:
    """Identity + behavior of one agent.

    From agent.json:    id, name, description, mode
    From agent.md:      role, purpose, personality, boundaries,
                        communication, principles, decision_style,
                        plus any extra '## sections' (extras)
    Composed at build:  system_prompt
    """

    id: str = ""
    name: str = ""
    description: str = ""
    mode: str = "chat"

    system_prompt: str = ""

    # Prompt sections from agent.md
    role: str = ""
    purpose: str = ""
    personality: str = ""
    boundaries: str = ""
    communication: str = ""
    principles: str = ""
    decision_style: str = ""

    # Documentation only (NOT included in the system prompt)
    priorities: str = ""

    extras: dict = field(default_factory=dict)


# ==========================================================================
# THE GENERIC AGENT OBJECT
# --------------------------------------------------------------------------
# The Agent maintains conversation history and interacts with the LLM
# backend through structured messages. When tools are attached, the LLM
# can request tool calls, which flow through act() -> observe() and a
# follow-up LLM round.
# ==========================================================================

class Agent:
    """A generic AI agent that can think (ask the LLM), act (call a tool) and
    observe (record the tool's result back into the conversation)."""

    def __init__(self, model: str | None, tools: List[Callable], profile: AgentProfile):
        """Store the model, tools, and profile to use during conversations."""
        self.model = model
        self.profile = profile
        self.tools = {f.__name__: f for f in tools}
        self.messages: List[dict] = []

    def _extract_text_tool_calls(self, content: str) -> List[dict]:
        """Find tool calls that a model wrote as plain-text JSON instead of using
        Ollama's native tool_calls field (a common quirk of small local models).

        Accepts bare JSON, ```json fenced blocks, or a JSON object embedded in
        prose. ONLY names present in self.tools are returned, so ordinary replies
        that happen to contain JSON are never executed.
        """
        text = (content or "").strip()
        if text.startswith("```"):  # unwrap markdown code fences
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:]
            text = text.strip()

        candidates: List[dict] = []
        try:
            candidates.append(json.loads(text))
        except (json.JSONDecodeError, TypeError):
            # one nesting level allowed so nested "arguments" objects are captured
            for match in re.finditer(r"\{(?:[^{}]|\{[^{}]*\})*\}", content or ""):
                try:
                    candidates.append(json.loads(match.group(0)))
                except json.JSONDecodeError:
                    continue

        calls: List[dict] = []
        for item in candidates:
            if not isinstance(item, dict) or item.get("name") not in self.tools:
                continue
            args = item.get("arguments", {}) or {}
            if isinstance(args, str):  # some models send arguments as a JSON string
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}
            if not isinstance(args, dict):
                args = {}
            calls.append({"function": {"name": item["name"], "arguments": args}})
        return calls

    def think(self, user_input: str) -> str:
        """Add user input to history, send the conversation to the LLM, and return its reply."""
        if not self.messages or self.messages[0].get("role") != "system":
            self.messages.insert(0, {"role": "system", "content": self.profile.system_prompt})

        self.messages.append({"role": "user", "content": user_input})

        tool_callables = list(self.tools.values()) if self.tools else None

        message = ask_llm(messages=self.messages, model=self.model, tools=tool_callables)
        self.messages.append(message)

        # Native tool_calls, or calls the model wrote as plain-text JSON.
        # Both paths flow through act()/observe() and a follow-up LLM round.
        tool_calls = message.get("tool_calls") or self._extract_text_tool_calls(message.get("content", ""))
        if tool_calls:
            origin = "native tool_calls" if message.get("tool_calls") else "TEXT reply"
            print(f"[Agent.think] Executing {len(tool_calls)} tool call(s) from {origin}.")
            for tool_call in tool_calls:
                result = self.act(tool_call)
                self.observe(tool_call["function"]["name"], result)

            message = ask_llm(messages=self.messages, model=self.model, tools=tool_callables)
            self.messages.append(message)

        return message.get("content", "")

    def act(self, tool_call: dict) -> str:
        """Run one tool that the LLM asked for, using the name and args it chose."""
        name = tool_call.get("function", {}).get("name")
        args = tool_call.get("function", {}).get("arguments", {})
        if name in self.tools:
            try:
                result = str(self.tools[name](**args))
                print(f"[Agent.act] Executed {name} -> {result[:100]}...")
                return result
            except Exception as e:
                print(f"[Agent.act] Error executing {name}: {e}")
                return f"Error executing tool: {e}"
        print(f"[Agent.act] Missing tool requested: {name}")
        return f"Error: {name} missing"

    def observe(self, name: str, result: str) -> None:
        """Record a tool's result back into the conversation history."""
        self.messages.append({"role": "tool", "content": result, "name": name})
````

============================================================
FOLDER: app/core
FILE: llm.py
============================================================

````python
"""
app/core/llm.py
===============

The LLM backend. Everything that talks to Ollama lives here:

    ask_llm               - send structured messages, get the reply message dict
    _resolve_model        - explicit arg > config/models.json > first Ollama model
    _get_context_window   - model context length lookup (capped)
    refresh_models        - scan installed Ollama models -> config/models.json

The Agent does not know about Ollama details; it only calls ask_llm().
"""

import json
from pathlib import Path
from typing import Callable, List

import ollama

MAX_NUM_CTX = 32768
CONFIG_DIR = Path(__file__).resolve().parent.parent.parent / "config"


# ==========================================================================
# MODEL RESOLUTION AND CONTEXT SIZING
# ==========================================================================

def _resolve_model(model: str | None) -> str:
    """Pick which model to use: explicit arg > config > Ollama list."""
    if model:
        print(f"[ask_llm] explicit model used: {model}")
        return model

    try:
        data = json.loads((CONFIG_DIR / "models.json").read_text(encoding="utf-8"))
        models = data.get("models", [])
        if models:
            cfg = models[0].get("id")
            if cfg:
                print(f"[ask_llm] model from config/models.json: {cfg}")
                return cfg
    except (OSError, json.JSONDecodeError):
        pass

    try:
        data = ollama.list()
        names = [
            m.get("model") if isinstance(m, dict) else getattr(m, "model", None)
            for m in data.get("models", [])
        ]
        names = [n for n in names if n]
        if names:
            print(f"[ask_llm] first installed Ollama model: {names[0]}")
            return names[0]
    except Exception as exc:
        print(f"[ask_llm] Ollama list failed: {exc}")

    raise RuntimeError(
        "No model available. Specify one in the frontend, "
        "add models to config/models.json, or install one in Ollama."
    )


def _get_context_window(model: str) -> int | None:
    """Return the model's max context length from Ollama, capped; None if unknown."""
    try:
        info = ollama.show(model=model).model_dump()
        model_info = info.get("modelinfo") or info.get("model_info") or {}
        length = model_info.get("llama.context_length")
        if not length:
            return None
        return min(int(length), MAX_NUM_CTX)
    except Exception as exc:
        print(f"[ask_llm] context lookup failed for {model}: {exc}")
        return None


# ==========================================================================
# THE LLM CALL
# ==========================================================================

def ask_llm(messages: List[dict], model: str | None = None, tools: List[Callable] | None = None) -> dict:
    """Send structured messages to the resolved model via Ollama and return the full message dict."""
    resolved = _resolve_model(model)
    num_ctx = _get_context_window(resolved)

    options = {"num_ctx": num_ctx} if num_ctx else {}
    print(f"[ask_llm] calling ollama.chat with model={resolved} num_ctx={num_ctx} tools={len(tools) if tools else 0}")

    for attempt in (1, 2):
        kwargs = {
            "model": resolved,
            "messages": messages,
            "options": options,
        }
        if tools:
            kwargs["tools"] = tools

        response = ollama.chat(**kwargs)
        message = response["message"]

        content = message.get("content", "") or ""
        tool_calls = message.get("tool_calls") or []

        print(f"[ask_llm] reply received ({len(content)} chars, {len(tool_calls)} tool calls)")

        if content.strip() or tool_calls:
            return message

        print(f"[ask_llm] empty reply on attempt {attempt} - retrying")

    return {"role": "assistant", "content": "(The model returned an empty reply. Please try again.)"}


# ==========================================================================
# MODEL SCAN (startup)
# --------------------------------------------------------------------------
# Lists locally installed Ollama models and writes config/models.json so
# the frontend dropdown has something to show. An empty scan (Ollama down)
# leaves the last known good file untouched.
# ==========================================================================

def scan_models() -> list:
    """Return the deduped list of locally installed Ollama models."""
    models = []
    try:
        for m in ollama.list().get("models", []):
            model_id = m.get("model") if isinstance(m, dict) else getattr(m, "model", None)
            size = m.get("size", 0) if isinstance(m, dict) else getattr(m, "size", 0)
            if model_id:
                models.append({"id": model_id, "name": model_id, "source": "ollama", "size": size})
    except Exception as exc:
        print(f"[llm] ollama scan failed: {exc}")

    seen, unique = set(), []
    for m in models:
        if m["id"] not in seen:
            seen.add(m["id"])
            unique.append(m)
    return unique


def refresh_models() -> list:
    """Scan Ollama and write config/models.json (returns the model list)."""
    models = scan_models()
    models_file = CONFIG_DIR / "models.json"
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    if models:
        models_file.write_text(
            json.dumps({"models": models}, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"[llm] wrote {len(models)} models to {models_file}")
    else:
        print(f"[llm] scan found no models - keeping {models_file}")
    return models
````

============================================================
FOLDER: app/core
FILE: prompt.py
============================================================

````python
"""
app/core/prompt.py
==================

PromptManager: converts an agent definition (agent.json + parsed agent.md
sections) plus the agent's resolved tools into an AgentProfile with a
composed system prompt.

    agent.md + agent.json + tools
        ↓
    PromptManager.build()
        ↓
    AgentProfile (system_prompt ready)
"""

from dataclasses import field
from typing import Callable, List

from app.core.agent import AgentProfile

# Markdown '## sections' that map to named profile fields.
# Any other section passes through verbatim into the prompt as an
# UPPERCASE-titled block, so new sections need no code changes.
KNOWN_SECTIONS = (
    "role",
    "purpose",
    "personality",
    "boundaries",
    "communication",
    "principles",
    "decision_style",
    "priorities",
)

# Sections actually composed INTO the system prompt.
# 'priorities' is documentation-only and is deliberately excluded,
# matching the original PromptManager behavior.
PROMPT_SECTIONS = tuple(name for name in KNOWN_SECTIONS if name != "priorities")


class PromptManager:
    """Builds an AgentProfile from an agent definition and composes the system prompt."""

    @staticmethod
    def build(definition: dict, tools: List[Callable] | None = None) -> AgentProfile:
        """Build an AgentProfile.

        Args:
            definition: {"meta": {...agent.json...}, "sections": {...parsed agent.md...}}
            tools:      resolved tool functions; their docstrings become the
                        AVAILABLE TOOLS section of the prompt.

        Steps:
            1. Map metadata and markdown sections onto the profile fields
            2. Collect unknown sections as extras
            3. Compose the system prompt
        """
        meta = definition.get("meta", {})
        sections = {k.lower().strip(): v for k, v in definition.get("sections", {}).items()}

        known = {name: sections.get(name, "") for name in KNOWN_SECTIONS}
        extras = {
            name: content for name, content in sections.items()
            if name not in KNOWN_SECTIONS and name not in ("skills", "identity")
        }

        profile = AgentProfile(
            id=meta.get("id", ""),
            name=meta.get("name", ""),
            description=meta.get("description", ""),
            mode=meta.get("mode", "chat"),
            **known,
            extras=extras,
        )
        profile.system_prompt = PromptManager.compose_system_prompt(profile, tools)
        return profile

    @staticmethod
    def compose_system_prompt(profile: AgentProfile, tools: List[Callable] | None = None) -> str:
        """Build the final system prompt from profile sections."""
        parts = []

        if profile.role:
            parts.append(f"ROLE\n{profile.role}")

        if profile.purpose:
            parts.append(f"PURPOSE\n{profile.purpose}")

        if profile.personality:
            parts.append(f"PERSONALITY\n{profile.personality}")

        if profile.boundaries:
            parts.append(f"BOUNDARIES\n{profile.boundaries}")

        if profile.communication:
            parts.append(f"COMMUNICATION STYLE\n{profile.communication}")

        if profile.principles:
            parts.append(f"PRINCIPLES\n{profile.principles}")

        if profile.decision_style:
            parts.append(f"DECISION STYLE\n{profile.decision_style}")

        tool_lines = PromptManager._tool_lines(tools)
        if tool_lines:
            parts.append("AVAILABLE TOOLS\n" + "\n".join(tool_lines))

        # Generic extra sections (user, greeting, project_notes, ...) become
        # UPPERCASE-titled blocks, sorted for deterministic prompts.
        for title, content in sorted(profile.extras.items()):
            if content:
                parts.append(f"{title.upper()}\n{content}")

        return "\n\n".join(parts)

    @staticmethod
    def _tool_lines(tools: List[Callable] | None) -> List[str]:
        """Format tool callables as '- id: first docstring line' lines."""
        lines = []
        for fn in tools or []:
            doc = (fn.__doc__ or "").strip()
            summary = doc.splitlines()[0] if doc else ""
            lines.append(f"- {fn.__name__}: {summary}")
        return lines
````

============================================================
FOLDER: app/agents
FILE: loader.py
============================================================

````python
"""
app/agents/loader.py
====================

Locates, reads, and parses one agent definition from agent_library/.

An agent folder contains:
    agent.json  - metadata/configuration (id, name, mode, tools, model)
    agent.md    - behavior sections (## role, ## purpose, ## boundaries, ...)

load_definition() returns:
    {"meta": {...agent.json...}, "sections": {...parsed markdown sections...}}

This module does NOT run agents. Its job is only: find, read, parse, return.
"""

import json
import re
from pathlib import Path

AGENT_LIBRARY_DIR = Path(__file__).resolve().parent.parent.parent / "agent_library"


class AgentNotFoundError(FileNotFoundError):
    """Raised when an agent folder or its required files are missing."""


def _parse_sections(text: str) -> dict:
    """Split agent.md into '## <name>' sections (section name lowercased)."""
    sections = {}
    current = None
    buffer = []
    for line in text.splitlines(keepends=True):
        match = re.match(r"^\s*##\s+(.+?)\s*$", line)
        if match:
            if current is not None:
                sections[current] = "".join(buffer)
            current, buffer = match.group(1).strip().lower(), []
        elif current is not None:
            buffer.append(line)
    if current is not None:
        sections[current] = "".join(buffer)
    return sections


def _clean_body(text: str) -> str:
    """Trim blank lines and '---' separators from the edges of a section body."""
    lines = text.splitlines()
    while lines and (not lines[0].strip() or lines[0].strip() in ("---", "***")):
        lines.pop(0)
    while lines and (not lines[-1].strip() or lines[-1].strip() in ("---", "***")):
        lines.pop()
    return "\n".join(lines).strip("\n")


def load_definition(agent_id: str) -> dict:
    """Load one agent definition from agent_library/{agent_id}/.

    Returns {"meta": dict, "sections": dict}. Raises AgentNotFoundError
    when the folder or either required file is missing/unreadable.
    """
    agent_dir = AGENT_LIBRARY_DIR / agent_id
    json_file = agent_dir / "agent.json"
    md_file = agent_dir / "agent.md"

    if not json_file.exists():
        raise AgentNotFoundError(f"Agent not found: {json_file}")
    if not md_file.exists():
        raise AgentNotFoundError(f"Agent not found: {md_file}")

    try:
        meta = json.loads(json_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AgentNotFoundError(f"Agent config unreadable: {json_file} ({exc})")

    try:
        md_text = md_file.read_text(encoding="utf-8")
    except OSError as exc:
        raise AgentNotFoundError(f"Agent markdown unreadable: {md_file} ({exc})")

    raw_sections = _parse_sections(md_text)
    # The '# Title' line before the first section is ignored; every
    # '## section' body gets whitespace/separator cleanup.
    sections = {name: _clean_body(body) for name, body in raw_sections.items()}

    return {"meta": meta, "sections": sections}
````

============================================================
FOLDER: app/agents
FILE: registry.py
============================================================

````python
"""
app/agents/registry.py
======================

Automatic agent discovery.

The filesystem is the source of truth: every folder in agent_library/
that contains an agent.json is an available agent. Dropping a new folder
in agent_library/ makes it appear in GET /api/agents and the frontend
selector on the next server restart - no code changes, no manual lists.
"""

import json
from pathlib import Path

from app.agents.loader import AGENT_LIBRARY_DIR


def list_agents() -> list[dict]:
    """Scan agent_library/ and return one summary per discovered agent:

        [{"id", "name", "description", "mode"}, ...]

    Folders without a readable agent.json are skipped with a warning so
    a half-created agent cannot break the whole application.
    """
    agents = []
    if not AGENT_LIBRARY_DIR.exists():
        print(f"[REGISTRY] agent_library not found at {AGENT_LIBRARY_DIR}")
        return agents

    for agent_dir in sorted(AGENT_LIBRARY_DIR.iterdir()):
        if not agent_dir.is_dir() or agent_dir.name.startswith(("_", ".")):
            continue

        meta_file = agent_dir / "agent.json"
        if not meta_file.exists():
            print(f"[REGISTRY] skipping {agent_dir.name}: no agent.json")
            continue

        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"[REGISTRY] skipping {agent_dir.name}: unreadable agent.json ({exc})")
            continue

        # Fall back to the folder name when metadata is incomplete, so the
        # agent still shows up in the frontend.
        agents.append({
            "id": meta.get("id") or agent_dir.name,
            "name": meta.get("name") or agent_dir.name,
            "description": meta.get("description", ""),
            "mode": meta.get("mode", "chat"),
        })

    return agents


def get_agent_meta(agent_id: str) -> dict | None:
    """Return the summary for one agent id, or None if not registered."""
    for summary in list_agents():
        if summary["id"] == agent_id:
            return summary
    return None
````

============================================================
FOLDER: app/agents
FILE: factory.py
============================================================

````python
"""
app/agents/factory.py
=====================

Constructs runtime Agents from agent definitions.

    build_agent(agent_id, model)
        ↓
    loader.load_definition()      (agent.md + agent.json)
        ↓
    registry: resolve tools       (IDs -> Python functions)
        ↓
    PromptManager.build()         (sections + tool docstrings -> system prompt)
        ↓
    Agent

The caller never needs to know where definitions live or how prompts are
composed. Chat-mode agents get an empty tool list, which disables the
tool loop entirely - same Agent class, behavior driven by configuration.
"""

from typing import Callable

from app.agents.loader import load_definition, AgentNotFoundError
from app.core.agent import Agent
from app.core.prompt import PromptManager
from app.tools.registry import resolve_tools


def build_agent(agent_id: str, model: str | None = None) -> Agent:
    """Build a ready-to-use Agent for the given agent_id.

    Args:
        agent_id: folder name / id inside agent_library/
        model:    explicit model override; when empty, falls back to the
                  agent's own "model" field, then to ask_llm's resolution
                  (config/models.json > first Ollama model).

    Raises AgentNotFoundError if the definition is missing.
    """
    definition = load_definition(agent_id)
    meta = definition["meta"]

    mode = (meta.get("mode") or "chat").lower()
    tool_ids = [] if mode == "chat" else (meta.get("tools") or [])
    tools: list[Callable] = resolve_tools(tool_ids)

    profile = PromptManager.build(definition, tools)

    resolved_model = model or meta.get("model") or None
    return Agent(model=resolved_model, tools=tools, profile=profile)


def replay_history(agent: Agent, history: list[dict] | None) -> None:
    """Replay prior frontend turns ({role, content}) into the agent's history."""
    for m in (history or []):
        role = "assistant" if m.get("role") == "ai" else m.get("role", "user")
        content = m.get("content", "")
        if not content:
            continue
        agent.messages.append({"role": role, "content": content})


__all__ = ["build_agent", "replay_history", "AgentNotFoundError"]
````

============================================================
FOLDER: app/tools
FILE: registry.py
============================================================

````python
"""
app/tools/registry.py
=====================

The single mapping between tool IDs (used in agent.json) and the actual
Python functions the Agent can call.

To add a tool:
    1. Write the function in the right category module (files, workspace,
       datetime_tools, search, web, ...) with a clear docstring.
    2. Add one line to TOOL_REGISTRY below.

Agent JSON never references Python modules - only IDs from this registry:

    "tools": ["read_file", "write_file", "get_current_date"]
"""

from app.tools.files import read_file, read_pdf, write_file
from app.tools.workspace import create_file, create_folder, setup_venv
from app.tools.datetime_tools import get_current_date, tell_me_the_date_and_time

TOOL_REGISTRY = {
    # files
    "read_file": read_file,
    "write_file": write_file,
    "read_pdf": read_pdf,

    # workspace
    "create_folder": create_folder,
    "create_file": create_file,
    "setup_venv": setup_venv,

    # datetime
    "get_current_date": get_current_date,
    "tell_me_the_date_and_time": tell_me_the_date_and_time,
}


def resolve_tools(tool_ids: list[str]) -> list:
    """Map tool IDs to functions, reporting missing IDs loudly instead of
    dropping them silently."""
    resolved = []
    for tool_id in tool_ids:
        if tool_id in TOOL_REGISTRY:
            resolved.append(TOOL_REGISTRY[tool_id])
        else:
            print(f"[TOOLS] WARNING: tool '{tool_id}' is listed in agent.json but missing from TOOL_REGISTRY - skipped")
    return resolved


def available_tool_ids() -> list[str]:
    """All registered tool IDs (useful for debugging / future endpoints)."""
    return sorted(TOOL_REGISTRY.keys())
````

============================================================
FOLDER: app/tools
FILE: files.py
============================================================

````python
"""
app/tools/files.py
==================

File tools: reading and writing text files and extracting PDF text.

Docstrings matter: Ollama turns each tool's docstring into the schema the
LLM sees when deciding which tool to call.
"""

import os

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None


def read_file(file_path: str) -> str:
    """Reads and returns the contents of a text file."""
    if not os.path.exists(file_path):
        return f"Error: File '{file_path}' does not exist."
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()


def write_file(file_path: str, content: str) -> str:
    """Writes or overwrites text content to a file."""
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Content successfully written to: {file_path}"


def read_pdf(pdf_path: str) -> str:
    """Extracts text contents from a PDF file."""
    if not PdfReader:
        return "Error: pypdf is not installed. Install via `pip install pypdf`."
    if not os.path.exists(pdf_path):
        return f"Error: PDF '{pdf_path}' does not exist."

    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    return text
````

============================================================
FOLDER: app/tools
FILE: workspace.py
============================================================

````python
"""
app/tools/workspace.py
======================

Workspace tools: creating folders, files, and Python virtual environments.
"""

import os
import subprocess


def create_folder(folder_path: str) -> str:
    """Creates a directory at the specified path."""
    os.makedirs(folder_path, exist_ok=True)
    return f"Folder successfully created at: {folder_path}"


def create_file(file_path: str, content: str = "") -> str:
    """Creates a new file with optional initial content."""
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"File successfully created at: {file_path}"


def setup_venv(env_dir: str = ".venv") -> str:
    """Creates a Python virtual environment (.venv)."""
    subprocess.run(["python", "-m", "venv", env_dir], check=True)
    return f"Virtual environment created at: {env_dir}"
````

============================================================
FOLDER: app/tools
FILE: datetime_tools.py
============================================================

````python
"""
app/tools/datetime_tools.py
===========================

Date and time tools.
"""

from datetime import datetime


def get_current_date() -> str:
    """Returns the real current date as a formatted string."""
    return datetime.now().strftime("%A, %B %d, %Y")


def tell_me_the_date_and_time() -> str:
    """Returns the current date and time."""
    now = datetime.now()
    return f"The current date and time is {now.strftime('%Y-%m-%d %H:%M:%S')}"
````

============================================================
FOLDER: app/tools
FILE: search.py
============================================================

````python
"""
app/tools/search.py
===================

Search tools. Future tools for searching documents, files, or local
indexes will live here and be registered in registry.py.
"""
````

============================================================
FOLDER: app/tools
FILE: web.py
============================================================

````python
"""
app/tools/web.py
================

Web tools. Future tools such as web_search or read_url will live here
and be registered in registry.py.
"""
````

============================================================
FOLDER: agent_library/basic_chat
FILE: agent.json
============================================================

````json
{
  "id": "basic_chat",
  "name": "Basic Chat",
  "description": "A simple chatbot with no tools.",
  "mode": "chat",
  "model": null,
  "tools": []
}
````

============================================================
FOLDER: agent_library/basic_chat
FILE: agent.md
============================================================

````markdown
# Basic Chat

## role

You are a helpful Basic Chat.

## purpose

Help the user with general questions and tasks.

## communication

- Be concise and clear.
- Answer directly.
- Use examples when useful.

## boundaries

- Do not fabricate results.
- If you do not know something, say so.

## principles

- Be accurate.
- Explain concepts clearly.
````

============================================================
FOLDER: agent_library/basic_chat_agent
FILE: agent.json
============================================================

````json
{
  "id": "basic_chat_agent",
  "name": "Basic Chat Agent",
  "description": "A general chatbot that can use tools.",
  "mode": "agent",
  "model": null,
  "tools": [
    "get_current_date",
    "read_file",
    "write_file"
  ]
}
````

============================================================
FOLDER: agent_library/basic_chat_agent
FILE: agent.md
============================================================

````markdown
# Basic Chat Agent

## role

You are a helpful assistant that can use tools.

## purpose

Help the user with questions and tasks, using your tools when real
information or file operations are required.

## communication

- Be concise and clear.
- Answer directly.
- Use examples when useful.

## boundaries

- When asked to read or write files, call the matching tool - never only
  describe the action and never claim you lack permission.
- Do not claim a tool was used when it was not.
- Do not fabricate results.
- Do not pretend an action succeeded when it failed.

## principles

- Be accurate.
- Do not invent information.
- Prefer simple solutions before complex ones.

## decision_style

- Separate facts from assumptions.
- Use tools when external information is required.

## Greeting
- Hello Jesus. How can I help you?

## User
- Jesus 
````

============================================================
FOLDER: agent_library/dev_assistant
FILE: agent.json
============================================================

````json
{
  "id": "dev_assistant",
  "name": "Dev Assistant",
  "description": "AI agent development teacher with full file tools.",
  "mode": "agent",
  "model": "gemma4:e2b",
  "tools": [
    "create_folder",
    "create_file",
    "setup_venv",
    "read_file",
    "write_file",
    "read_pdf",
    "get_current_date",
    "tell_me_the_date_and_time"
  ]
}
````

============================================================
FOLDER: agent_library/dev_assistant
FILE: agent.md
============================================================

````markdown
# Dev Assistant

## role

You are an **AI Agent Development Assistant**.

Your primary purpose is to help the user:

* Learn how AI agents work.
* Build AI agents with Python.
* Understand agent architecture.
* Create reusable AI-agent components.
* Experiment with different approaches.
* Understand what works, what does not work, and why.
* Gradually move from simple examples to more advanced systems.

You are both a **software developer** and a **teacher**.

## purpose

Help the user learn how AI agents work and build AI agents with Python.

## personality

You are patient, practical, clear, direct, and analytical. You act as both a software developer and a teacher. You explain concepts step by step, starting with the simple idea before showing advanced patterns.

## communication

- Be concise and clear.
- Use examples when useful.
- Avoid unnecessary repetition.
- When introducing a new concept, explain unfamiliar terminology.
- Keep examples small, copy-pasteable, and easy to modify.
- Write simple code over clever code.

## boundaries

- You have full permission to use every listed tool on this Windows machine.
- When asked to create/read/write files or folders, you MUST call the matching tool - never only describe the action, and never claim you lack permission.
- Use absolute Windows paths. Home folder: C:\Users\43319. If the user says "my desktop", ask which one: C:\Users\43319\Desktop or C:\Users\43319\OneDrive\Desktop.
- Do not claim a tool was used when it was not.
- Do not fabricate results.
- Do not pretend an action succeeded when it failed.
- Do not assume the user already understands advanced Python, LangChain, LangGraph, RAG, or agent architecture.

## principles

- Be accurate.
- Do not invent information.
- Explain concepts clearly.
- Prefer maintainable and simple solutions.
- When a more advanced design is useful, explain the simple version first, then show the advanced one.

## decision_style

- Prefer simple solutions before complex ones.
- Separate facts from assumptions.
- Use tools when external information is required.
- Do not make hidden assumptions.

## priorities

1. Accuracy
2. Safety
3. Relevance
4. Clarity
5. Brevity

## user

**Name:** Jesus

**Current knowledge:**

* Knows some Python.
* Is still becoming comfortable with Python.
* Is learning AI agents.
* Understands basic programming concepts but may need explanations of unfamiliar Python syntax.

**Goal:**

Jesus wants to create **off-the-shelf AI-agent components** that can be reused to build different AI agents. The long-term goal is to understand how individual components work and how they can be combined into larger agent systems.

## job

Teach like a patient software-development instructor.

When explaining something:

1. Start with the simple idea.
2. Explain why it exists.
3. Show a small example.
4. Explain the important parts of the example.
5. Show how it can be modified.
6. Explain how it fits into an AI-agent system.

Do not assume the user already understands advanced Python, LangChain, LangGraph, RAG, or agent architecture. When introducing a new concept, explain unfamiliar terminology.

Keep examples small, copy-pasteable, and easy to modify. Write simple code over clever code. When a more advanced design is useful, explain the simple version first, then show the advanced one.

## greeting

Initial greeting is Hello Jesus
````

============================================================
FOLDER: config
FILE: models.json
============================================================

````json
{
  "models": [
    {
      "id": "qwen2.5-coder:latest",
      "name": "qwen2.5-coder:latest",
      "source": "ollama",
      "size": 4683087561
    },
    {
      "id": "gemma4:e2b",
      "name": "gemma4:e2b",
      "source": "ollama",
      "size": 7162405886
    }
  ]
}
````

============================================================
FOLDER: config
FILE: settings.json
============================================================

````json
{
  "default_agent": "basic_chat"
}
````

============================================================
FOLDER: static
FILE: index.html
============================================================

````html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="/static/styles.css">
    <link rel="icon" href="data:,">
    <title>AI Studio</title>
</head>

<body>

    <!-- MOBILE NAV -->
    <div class="mobile-nav">
        <button id="menu-btn">☰ Chats</button>
        <h2>AI Studio</h2>
        <button id="panel-btn">⚙ Tools</button>
    </div>

    <div class="app-container">

        <!-- LEFT SIDEBAR -->
        <aside class="sidebar" id="sidebar">

            <button id="new-chat-btn" class="agent-btn new-chat">
                New Chat
            </button>

            <h3>Chats</h3>
            <ul id="chat-list"></ul>

        </aside>

        <!-- MAIN CHAT -->
        <main class="chat-main">

            <div id="chat-window"></div>

            <div class="input-area">

                <div class="input-row">

                    <select id="model-select"></select>

                    <input
                        type="text"
                        id="user-input"
                        placeholder="Message AI..."
                    >

                    <button id="send-btn">
                        Send
                    </button>

                </div>

            </div>

        </main>

        <!-- RIGHT PANEL -->
        <aside class="control-panel" id="control-panel">

            <h3>Agents</h3>

            <div id="agent-list"></div>

        </aside>

    </div>

    <script type="module" src="/static/js/app.js"></script>

</body>
</html>
````

============================================================
FOLDER: static
FILE: styles.css
============================================================

````css
/*
=====================================
THEME
=====================================
*/

:root {

    --primary-bg: #343541;
    --secondary-bg: #40414f;
    --sidebar-bg: #202123;

    --text-color: #ececec;
    --border-color: #565869;
    --hover-color: #2a2b32;

    --accent-color: #7da0b1;
    --accent-hover: #9dbbc9;

    --button-text: #1a1a1a;
}

/*
=====================================
RESET
=====================================
*/

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

html,
body {

    height: 100%;
    font-family: 'Segoe UI', sans-serif;

    background: var(--primary-bg);
    color: var(--text-color);

    overflow: hidden;
}

/*
=====================================
LAYOUT
=====================================
*/

.app-container {

    display: flex;
    height: 100vh;
}

/*
=====================================
SIDEBAR
=====================================
*/

.sidebar {

    width: 260px;

    background: var(--sidebar-bg);

    border-right: 1px solid var(--border-color);

    padding: 20px;

    display: flex;
    flex-direction: column;
    gap: 15px;
}

/*
=====================================
CHAT LIST (SIDEBAR)
=====================================
*/

#chat-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    flex: 1;
}

.chat-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 5px;
    border: 1px solid var(--border-color);
    background: var(--primary-bg);
    cursor: pointer;
    transition: 0.2s;
}

.chat-item:hover {
    background: var(--hover-color);
}

.chat-item.active {
    background: var(--accent-color);
    border-color: var(--accent-hover);
}

.chat-item.active .chat-title {
    color: var(--button-text);
}

.chat-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
}

.chat-rename {
    padding: 2px 6px;
    font-size: 0.8rem;
    background: transparent;
    color: var(--text-color);
    border: 1px solid transparent;
    border-radius: 4px;
    flex-shrink: 0;
}

.chat-rename:hover {
    background: var(--accent-hover);
    color: var(--button-text);
    border-color: var(--accent-hover);
}

.chat-delete {
    padding: 2px 6px;
    font-size: 0.8rem;
    background: transparent;
    color: var(--text-color);
    border: 1px solid transparent;
    border-radius: 4px;
    flex-shrink: 0;
}

.chat-delete:hover {
    background: #e05252;
    color: white;
    border-color: #e05252;
}

/*
=====================================
CHAT MESSAGES
=====================================
*/

.msg {
    padding: 10px 12px;
    border-radius: 8px;
    margin-bottom: 10px;
    white-space: pre-wrap;
    word-wrap: break-word;
}

.msg-user {
    background: var(--accent-color);
    color: var(--button-text);
    align-self: flex-end;
}

.msg-ai {
    background: var(--primary-bg);
    border: 1px solid var(--border-color);
}

#chat-window {
    display: flex;
    flex-direction: column;
}

/*
=====================================
MAIN CHAT
=====================================
*/

.chat-main {

    flex: 1;

    display: flex;
    flex-direction: column;

    padding: 20px;

    gap: 15px;

    overflow: hidden;
}

#chat-window {

    flex: 1;

    background: var(--secondary-bg);

    border: 1px solid var(--border-color);

    border-radius: 8px;

    padding: 20px;

    overflow-y: auto;
}

/*
=====================================
INPUT AREA
=====================================
*/

.input-area {

    background: var(--secondary-bg);

    border-radius: 8px;

    padding: 10px;
}

.input-row {

    display: flex;

    align-items: center;

    gap: 10px;

    width: 100%;
}

#user-input {

    flex: 1;
}

/*
=====================================
RIGHT PANEL
=====================================
*/

.control-panel {

    width: 280px;

    background: var(--sidebar-bg);

    border-left: 1px solid var(--border-color);

    padding: 20px;

    display: flex;
    flex-direction: column;
    gap: 10px;
}

/*
=====================================
FORM ELEMENTS
=====================================
*/

input,
select,
button {

    padding: 10px;

    border-radius: 5px;

    border: 1px solid var(--border-color);

    background: var(--primary-bg);

    color: white;
}

button {

    cursor: pointer;

    background: var(--accent-color);

    color: var(--button-text);

    border: none;

    transition: 0.2s;
}

button:hover {

    background: var(--accent-hover);
}

.agent-btn {

    width: 100%;
    text-align: left;
}

.new-chat {

    background: #10a37f;
    color: white;
}

/*
=====================================
AGENT LIST (dynamic, from /api/agents)
=====================================
*/

#agent-list {

    display: flex;

    flex-direction: column;

    gap: 8px;
}

.agent-item {

    display: flex;

    flex-direction: column;

    gap: 2px;

    width: 100%;

    text-align: left;

    padding: 10px 12px;

    background: transparent;

    border: 1px solid var(--border-color);

    border-radius: 8px;

    color: var(--text-color);

    cursor: pointer;

    transition: 0.2s;
}

.agent-item:hover {

    background: var(--hover-color);
}

.agent-item.active {

    border-color: var(--accent-color);

    background: var(--hover-color);
}

.agent-name {

    font-weight: 600;

    font-size: 0.95rem;
}

.agent-desc {

    font-size: 0.8rem;

    opacity: 0.7;
}

/*
=====================================
MOBILE NAV
=====================================
*/

.mobile-nav {

    display: none;

    height: 50px;

    background: var(--sidebar-bg);

    border-bottom: 1px solid var(--border-color);

    padding: 0 10px;

    align-items: center;

    justify-content: space-between;
}

.mobile-nav button {

    padding: 8px 12px;
}

/*
=====================================
SCROLLBAR
=====================================
*/

::-webkit-scrollbar {

    width: 8px;
}

::-webkit-scrollbar-thumb {

    background: var(--border-color);

    border-radius: 4px;
}

/*
=====================================
RESPONSIVE
=====================================
*/

@media (max-width: 768px) {

    .mobile-nav {

        display: flex;
    }

    .app-container {

        height: calc(100vh - 50px);
    }

    .sidebar,
    .control-panel {

        position: fixed;

        top: 50px;
        bottom: 0;

        z-index: 999;

        transition: transform 0.3s ease;

        overflow-y: auto;
    }

    .sidebar {

        left: 0;

        transform: translateX(-100%);
    }

    .control-panel {

        right: 0;

        transform: translateX(100%);
    }

    .sidebar.active {

        transform: translateX(0);
    }

    .control-panel.active {

        transform: translateX(0);
    }

    .chat-main {

        width: 100%;

        padding: 10px;
    }

    .input-row {

        flex-wrap: wrap;
    }

    #model-select {

        width: 100%;
    }

    #send-btn {

        width: 100%;
    }
}

/* =====================================
FORCE MOBILE SLIDE PANELS
===================================== */

@media (max-width: 768px) {

    /* Hide desktop layout behavior */
    .sidebar,
    .control-panel {

        position: fixed !important;

        top: 50px !important;
        bottom: 0 !important;

        width: 280px !important;

        display: flex !important;

        flex-direction: column;

        background: var(--sidebar-bg);

        overflow-y: auto;

        z-index: 9999;

        transition: transform 0.3s ease;

        box-shadow: 0 0 15px rgba(0,0,0,0.4);
    }

    /* LEFT PANEL */

    .sidebar {

        left: 0;

        transform: translateX(-105%);
    }

    .sidebar.active {

        transform: translateX(0);
    }

    /* RIGHT PANEL */

    .control-panel {

        right: 0;

        transform: translateX(105%);
    }

    .control-panel.active {

        transform: translateX(0);
    }

    /* MAIN CHAT AREA */

    .chat-main {

        width: 100%;

        flex: 1;

        padding: 10px;

        overflow: hidden;
    }
}
````

============================================================
FOLDER: static/js
FILE: api.js
============================================================

````javascript
// api.js - All backend calls in one place
const API_BASE = "/api";

// Default timeout for FAST endpoints (models/agents just read a JSON file).
const TIMEOUT_MS = 10000;

// Chat replies come from a LOCAL LLM (Ollama) and routinely take 30-60s+ to
// generate. The fast default timeout would abort the request mid-generation,
// so sendMessage uses its own LONG timeout (3 minutes).
const CHAT_TIMEOUT_MS = 180000;

async function fetchWithTimeout(url, options = {}, timeout = TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res;
    } finally {
        clearTimeout(timer);
    }
}

export async function loadModels() {
    const res = await fetchWithTimeout(`${API_BASE}/models`);
    return await res.json();
}

export async function loadAgents() {
    const res = await fetchWithTimeout(`${API_BASE}/agents`);
    return await res.json();
}

export async function sendMessage(payload) {
    // POST the user's message to /api/chat (server.py -> app/agents/factory.py).
    // Uses the long chat timeout so slow LLM replies are not aborted.
    const res = await fetchWithTimeout(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }, CHAT_TIMEOUT_MS);
    return await res.json();
}
````

============================================================
FOLDER: static/js
FILE: app.js
============================================================

````javascript
// =====================================
// app.js (STABLE + CHAT SESSIONS + AGENT SELECTOR)
// =====================================

import {
    loadModels,
    loadAgents,
    sendMessage
} from "./api.js";


// =============================
// STATE
// =============================
const state = {
    model: "",
    agentId: "",
    agents: [],
    chat: [],
    chats: [],
    activeChatId: null
};

// =============================
// STORAGE KEYS
// =============================
const LS_KEY = "ai-studio-chats";
const DB_NAME = "ai-studio-db";
const STORE = "handles";


// =============================
// START
// =============================
document.addEventListener("DOMContentLoaded", init);


// =============================
// INIT APP
// =============================
async function init() {

    console.log("[APP] START");

    await restoreChats();
    await setupAgents();
    await setupModels();

    setupSidebarEvents();
    setupEvents();

    console.log("[APP] READY");
}


// =============================
// AGENT SELECTOR
// =============================
async function setupAgents() {
    const data = await loadAgents();
    state.agents = data.agents || [];

    if (state.agents.length > 0 && !state.agentId) {
        state.agentId = state.agents[0].id;
    }

    renderAgentList();
    console.log("[AGENTS]", state.agents.length, "agent(s) loaded, active:", state.agentId);
}


function renderAgentList() {
    const list = el.agentList();
    if (!list) return;

    list.innerHTML = "";

    state.agents.forEach(agent => {

        const item = document.createElement("button");
        item.className = "agent-item" + (agent.id === state.agentId ? " active" : "");
        item.dataset.id = agent.id;

        const name = document.createElement("span");
        name.className = "agent-name";
        name.textContent = agent.name;

        const desc = document.createElement("span");
        desc.className = "agent-desc";
        desc.textContent = agent.description;

        item.appendChild(name);
        item.appendChild(desc);

        item.addEventListener("click", () => selectAgent(agent.id));

        list.appendChild(item);
    });

    console.log("[AGENTS] List Rendered:", state.agents.length);
}


function selectAgent(agentId) {
    if (!state.agents.some(a => a.id === agentId)) return;
    state.agentId = agentId;
    renderAgentList();
    console.log("[AGENT SELECTED]", agentId);
}


// =============================
// ELEMENT HELPERS
// =============================
const el = {
    // CHAT
    model: () => document.getElementById("model-select"),
    input: () => document.getElementById("user-input"),
    send: () => document.getElementById("send-btn"),
    chatList: () => document.getElementById("chat-list"),
    chatWindow: () => document.getElementById("chat-window"),

    // SIDEBAR
    newChat: () => document.getElementById("new-chat-btn"),
    agentList: () => document.getElementById("agent-list")
};


// =============================
// HELPERS
// =============================
function formatTimestamp(ts) {
    const d = new Date(ts || Date.now());
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
           `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function activeChat() {
    return state.chats.find(c => c.id === state.activeChatId) || null;
}


// =============================
// INDEXEDDB (FILE HANDLES)
// =============================
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) {
                req.result.createObjectStore(STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveHandle(id, handle) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(handle, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getHandle(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function deleteHandle(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}


// =============================
// LOCAL STORAGE (CHAT METADATA + MESSAGES)
// =============================
function saveChatsMeta() {
    const meta = state.chats.map(c => ({
        id: c.id,
        title: c.title,
        fileName: c.fileName,
        created: c.created,
        messages: c.messages
    }));
    localStorage.setItem(LS_KEY, JSON.stringify(meta));
    console.log("[CHAT] Metadata saved to localStorage", meta.length, "chats");
}

function loadChatsMeta() {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY)) || [];
    } catch (err) {
        console.warn("[CHAT] Could not read localStorage", err);
        return [];
    }
}


// =============================
// CHAT FILE BUILDING / WRITING
// =============================
function buildChatText(chat) {
    const lines = chat.messages.map(m => {
        const ts = formatTimestamp(m.time);
        return m.role === "user"
            ? `[${ts}] USER: ${m.text}`
            : `[${ts}] AI: ${m.text}`;
    });
    const header =
        `AI STUDIO CHAT - ${chat.title}\n` +
        `Created: ${formatTimestamp(chat.created)}\n` +
        `================================================\n`;
    return header + lines.join("\n") + (lines.length ? "\n" : "");
}

async function writeChatFile(chat) {
    if (!chat.handle) {
        console.warn("[CHAT] No file handle for", chat.id, "- skipping file write");
        return;
    }
    const text = buildChatText(chat);
    const writable = await chat.handle.createWritable();
    await writable.write(text);
    await writable.close();
    console.log("[CHAT] File written:", chat.fileName);
}


// =============================
// CREATE NEW CHAT
// =============================
async function createNewChat() {

    console.log("=================================");
    console.log("[CHAT] New Chat Requested");
    console.log("=================================");

    if (!window.showSaveFilePicker) {
        alert("File System Access API not supported in this browser. Use Chrome or Edge.");
        console.error("[CHAT] showSaveFilePicker unavailable");
        return;
    }

    try {
        // Ask the user where to save this chat's text file.
        const handle = await window.showSaveFilePicker({
            suggestedName: `chat-${Date.now()}.txt`,
            types: [
                {
                    description: "Text file",
                    accept: { "text/plain": [".txt"] }
                }
            ]
        });

        const chat = {
            id: crypto.randomUUID(),
            title: "New Chat",
            fileName: handle.name,
            created: Date.now(),
            handle,
            messages: []
        };

        state.chats.push(chat);
        state.activeChatId = chat.id;
        state.chat = chat.messages;

        await saveHandle(chat.id, handle);
        saveChatsMeta();
        await writeChatFile(chat);

        renderChatList();
        renderMessages();

        console.log("[CHAT] Created", { id: chat.id, file: chat.fileName });
    } catch (err) {
        if (err.name !== "AbortError") {
            console.error("[CHAT] Create Failed", err);
        }
    }
}


// =============================
// RENAME CHAT
// =============================
async function renameChat(chatId) {

    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;

    console.log("[CHAT] Rename Requested", chat.title);

    const newName = prompt("Rename chat:", chat.title);
    if (newName === null) return;

    const trimmed = newName.trim();
    if (!trimmed) return;

    chat.title = trimmed;
    saveChatsMeta();
    await writeChatFile(chat);
    renderChatList();

    console.log("[CHAT] Renamed", { id: chat.id, title: trimmed });
}


// =============================
// DELETE CHAT
// =============================
async function deleteChat(chatId) {

    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;

    console.log("[CHAT] Delete Requested", chat.title);

    if (!confirm(`Delete chat "${chat.title}"?`)) {
        console.log("[CHAT] Delete Cancelled");
        return;
    }

    state.chats = state.chats.filter(c => c.id !== chatId);
    if (state.activeChatId === chatId) {
        state.activeChatId = null;
        state.chat = [];
    }

    saveChatsMeta();
    await deleteHandle(chatId);

    try {
        if (chat.handle && chat.handle.remove) {
            await chat.handle.remove();
            console.log("[CHAT] File deleted:", chat.fileName);
        }
    } catch (err) {
        console.warn("[CHAT] Could not delete file", err);
    }

    renderChatList();
    renderMessages();

    console.log("[CHAT] Deleted", { id: chatId, file: chat.fileName });
}


// =============================
// SELECT CHAT
// =============================
function selectChat(chatId) {

    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;

    state.activeChatId = chatId;
    state.chat = chat.messages;

    renderChatList();
    renderMessages();

    console.log("[CHAT] Selected", { id: chat.id, title: chat.title });
}


// =============================
// RENDER CHAT LIST
// =============================
function renderChatList() {

    const list = el.chatList();
    if (!list) return;

    list.innerHTML = "";

    state.chats.forEach(chat => {

        const li = document.createElement("li");
        li.className = "chat-item" + (chat.id === state.activeChatId ? " active" : "");
        li.dataset.id = chat.id;

        const title = document.createElement("span");
        title.className = "chat-title";
        title.textContent = chat.title;
        title.title = chat.fileName;

        const ren = document.createElement("button");
        ren.className = "chat-rename";
        ren.textContent = "✎";
        ren.title = "Rename chat";

        const del = document.createElement("button");
        del.className = "chat-delete";
        del.textContent = "✕";
        del.title = "Delete chat";

        li.appendChild(title);
        li.appendChild(ren);
        li.appendChild(del);

        li.addEventListener("click", () => selectChat(chat.id));

        title.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            renameChat(chat.id);
        });

        ren.addEventListener("click", (e) => {
            e.stopPropagation();
            renameChat(chat.id);
        });

        del.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteChat(chat.id);
        });

        list.appendChild(li);
    });

    console.log("[CHAT] List Rendered:", state.chats.length, "chats");
}


// =============================
// RENDER MESSAGES
// =============================
function renderMessages() {

    const windowEl = el.chatWindow();
    if (!windowEl) return;

    windowEl.innerHTML = "";

    const chat = activeChat();
    if (!chat) return;

    chat.messages.forEach(m => {

        const div = document.createElement("div");
        div.className = "msg " + (m.role === "user" ? "msg-user" : "msg-ai");
        div.textContent = m.text;

        windowEl.appendChild(div);
    });

    windowEl.scrollTop = windowEl.scrollHeight;
}


// =============================
// RESTORE CHATS ON LOAD
// =============================
async function restoreChats() {

    const meta = loadChatsMeta();
    console.log("[CHAT] Restoring", meta.length, "chats");

    for (const m of meta) {

        let handle = null;
        try {
            handle = await getHandle(m.id);
        } catch (err) {
            console.warn("[CHAT] No stored handle for", m.id, err);
        }

        state.chats.push({
            id: m.id,
            title: m.title,
            fileName: m.fileName,
            created: m.created,
            handle,
            messages: m.messages || []
        });
    }

    if (state.chats.length) {
        state.activeChatId = state.chats[0].id;
        state.chat = state.chats[0].messages;
    }

    renderChatList();
    renderMessages();
}


// =============================
// MODELS
// =============================
async function setupModels() {

    const data = await loadModels();

    const select = el.model();

    if (!select) {
        console.error("[MODELS] model-select not found");
        return;
    }

    select.innerHTML = "";

    if (!data.models || data.models.length === 0) {
        console.warn("[MODELS] No models returned from /api/models");
        state.model = "";
        return;
    }

    data.models.forEach(m => {

        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name;

        select.appendChild(opt);
    });

    state.model = data.models[0].id;

    console.log("[MODELS LOADED]");
}


// =============================
// MAIN EVENTS
// =============================
function setupEvents() {

    const sendBtn = el.send();
    const input = el.input();
    const model = el.model();

    if (sendBtn) {
        sendBtn.addEventListener("click", () => {
            console.log("=================================");
            console.log("[BUTTON] Send Clicked");
            console.log("=================================");
            send();
        });
    }

    if (input) {
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                console.log("[EVENT] Enter Pressed");
                send();
            }
        });
    }

    if (model) {
        model.addEventListener("change", (e) => {
            state.model = e.target.value;
            console.log("[MODEL]", state.model);
        });
    }
}


// =============================
// SIDEBAR EVENTS
// =============================
function setupSidebarEvents() {

    const newChat = el.newChat();

    if (newChat) {
        newChat.addEventListener("click", () => {
            console.log("=================================");
            console.log("[BUTTON] New Chat Clicked");
            console.log("=================================");
            createNewChat();
        });
    }

    console.log("[SIDEBAR] Events Attached");
}


// =============================
// SEND MESSAGE
// =============================
async function send() {

    const msg = el.input()?.value.trim();
    if (!msg) return;

    console.log("=================================");
    console.log("[SEND] Message Sent");
    console.log("[PAYLOAD]", { message: msg, model: state.model, agent_id: state.agentId });
    console.log("=================================");

    let chat = activeChat();

    // No chat yet - create one and ask where to save it.
    if (!chat) {
        console.warn("[SEND] No active chat - creating new chat first");
        await createNewChat();
        chat = activeChat();
        if (!chat) return;
    }

    // History = the stored prior turns (this new message is NOT included yet -
    // the server appends it). Maps {role, text, time} -> {role, content} so the
    // agent can replay the whole conversation into the loop.
    const payload = {
        message: msg,
        model: state.model,
        agent_id: state.agentId,
        history: chat.messages.map(m => ({ role: m.role, content: m.text }))
    };

    el.input().value = "";

    chat.messages.push({ role: "user", text: msg, time: Date.now() });
    state.chat = chat.messages;
    renderMessages();

    // Disable the Send button while the request is in flight so the user
    // cannot double-send (double sends would only stack up slow LLM requests).
    const sendBtn = el.send();
    if (sendBtn) sendBtn.disabled = true;

    try {
        // POST the message to server.py (/api/chat), which forwards it to
        // chat_bot_agent.py. This can take up to 3 minutes for a local LLM.
        const res = await sendMessage(payload);

        console.log("[AI]", res.reply);

        // Only push the AI bubble when the server actually returned a reply.
        // (res?.reply avoids pushing "undefined" into the chat on failures.)
        const reply = res?.reply ?? "";
        if (reply) {
            chat.messages.push({ role: "ai", text: reply, time: Date.now() });
        } else {
            // Safety net: never store an empty AI turn (it would be replayed
            // into every later prompt). The server already falls back to a
            // readable message, so this should be rare.
            chat.messages.push({
                role: "ai",
                text: "(no reply received - please try again)",
                time: Date.now()
            });
        }
    } catch (err) {
        // The fetch failed (timeout, server down, network). Show the error in
        // the chat window instead of failing silently so the user knows what
        // happened and can retry.
        console.error("[SEND] Failed", err);
        chat.messages.push({
            role: "ai",
            text: `(error: could not reach the server - ${err.message})`,
            time: Date.now()
        });
    } finally {
        // Always re-enable the Send button, whether we got a reply or an error.
        if (sendBtn) sendBtn.disabled = false;
    }

    state.chat = chat.messages;
    renderMessages();

    saveChatsMeta();
    await writeChatFile(chat);

    console.log("[SAVE] Conversation written to", chat.fileName);
}
````

============================================================
FOLDER: .
FILE: README.md
============================================================

````markdown
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
  ↓ POST /api/chat {message, model, agent_id, history}
server.py
  ↓ build_agent(agent_id)                    app/agents/factory.py
loader: agent.md + agent.json                app/agents/loader.py
tools:  IDs -> functions                     app/tools/registry.py
prompt: sections + tool docs -> system msg   app/core/prompt.py
  ↓
Agent.think()                                app/core/agent.py
  ↓ ask_llm()                                app/core/llm.py
Ollama
```

Agent modes:

- `chat`  — User → LLM → Response. The factory attaches no tools, so no tool loop can happen.
- `agent` — User → Agent → LLM → Tool? → Observation → LLM → Response. Same `Agent` class; only its configuration differs.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/models` | Model dropdown options (scanned from Ollama at startup) |
| `GET /api/agents` | All discovered agents: `{id, name, description, mode}` |
| `POST /api/chat` | `{message, model, agent_id, history}` → `{reply}` |

## Creating a new agent

No Python required: create a folder under `agent_library/` containing
`agent.json` (configuration) + `agent.md` (behavior), pick tool IDs, and
refresh — the agent appears automatically in `GET /api/agents` and the
frontend selector.

Full field reference, tool catalog, copy-paste example, and troubleshooting:
**[CREATING_AGENTS.md](CREATING_AGENTS.md)**

## Adding a new tool

1. Write the function in the right category module (`app/tools/files.py`,
   `workspace.py`, ...) with a clear docstring — Ollama turns docstrings
   into the tool schema the LLM sees.
2. Add one line to `TOOL_REGISTRY` in `app/tools/registry.py`.
3. Reference the ID in any agent's `agent.json`.

## Notes

- Chat requests are stateless server-side: the frontend owns history and
  replays it on every send.
- `/api/chat` is intentionally a sync endpoint so blocking LLM calls run in
  FastAPI's threadpool instead of stalling the event loop.
````

============================================================
FOLDER: .
FILE: CREATING_AGENTS.md
============================================================

````markdown
# Creating Agents

Everything you need to add a new agent to the AI Agent Laboratory.
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
````

============================================================
FOLDER: .
FILE: requirements.txt
============================================================

````text
annotated-doc==0.0.5
annotated-types==0.8.0
anyio==4.14.2
click==8.4.2
colorama==0.4.6
fastapi==0.141.1
h11==0.16.0
idna==3.18
ollama==0.6.2
pydantic==2.13.4
pydantic_core==2.46.4
starlette==1.6.0
typing-inspection==0.4.4
typing_extensions==4.16.0
uvicorn==0.52.3
````

<!-- SECTION_3 -->
