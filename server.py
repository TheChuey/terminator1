from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
from datetime import datetime
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
from app.chat_store import store as chat_store

# Runs once at startup; scans data/chatlog/agent-text-records/*.txt and records
# their header info in data/chatlog/chatRecord.jsonl so past chats appear in
# the drop-down immediately.

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
MODELS_FILE = BASE_DIR / "config" / "models.json"
SETTINGS_FILE = BASE_DIR / "config" / "settings.json"

# Frontend-owned data (written by the /api/history, /api/settings and
# /api/exports endpoints below):
DATA_DIR = BASE_DIR / "data"
HISTORY_FILE = DATA_DIR / "history.json"
EXPORTS_DIR = DATA_DIR / "exports"
APP_SETTINGS_FILE = STATIC_DIR / "config" / "app_settings.json"

# The chat log lives in data/chatlog/chatRecord.jsonl, owned by
# app.chat_store (import_once / list_log / save_discussion / delete_discussion).
# The legacy /api/discussions endpoints below are thin wrappers over it.


def _load_json(path, default):
    """Read a JSON file; return `default` when missing or unreadable."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _save_json(path, value) -> None:
    """Pretty-write a JSON file, creating parent folders when needed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8"
    )


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


# Startup hook: scan Ollama models BEFORE any request is served, and import
# any existing data/chatlog/agent-text-records/*.txt transcripts into the log
# (data/chatlog/chatRecord.jsonl) so old chats show up in the frontend
# drop-down without manual work.
@asynccontextmanager
async def lifespan(app: FastAPI):
    refresh_models()           # ollama -> config/models.json
    chat_store.import_once()   # agent-text-records/*.txt -> data/chatlog/chatRecord.jsonl
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
    # --- server-side chat session fields ---
    session_id: str = ""      # "" on the first message of a new chat
    title: str = ""           # optional user-chosen title for the chat
    new_chat: bool = False    # start a fresh chat (finalizes the previous one)

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

    The backend now tracks chat sessions itself (ONE active session at a
    time). Each chat has its own start -> middle -> end:
      - the first message ({new_chat: true}, or no active session) finalizes
        any previous chat and starts a new one;
      - every message appends the user turn + assistant reply to the active
        session (persisted in data/chatlog/.active-chat.json);
      - when a chat ends (new chat, "Save chat" or /api/chats/end), the
        transcript is written once to data/chatlog/agent-text-records/<title>[-v].txt
        and logged in data/chatlog/chatRecord.jsonl.

    The agent is still built FRESH per request and the browser may keep its
    own copy of history, but the server is now the source of truth for the
    conversation so a refresh never loses it.

    This stays a SYNC endpoint on purpose: the blocking LLM call runs in
    FastAPI's threadpool, so the event loop stays free.
    """
    agent_id = data.agent_id or _default_agent()
    print(f"[SERVER] Message for '{agent_id}': {data.message}")
    print(f"[SERVER] history turns received: {len(data.history)}")

    try:
        agent = build_agent(agent_id, model=data.model or None)
    except AgentNotFoundError as exc:
        print(f"[SERVER] {exc}")
        return {"reply": f"(unknown agent '{agent_id}' - is the folder present in agent_library/?)"}

    # One session at a time: start one when asked, otherwise continue it.
    session = chat_store.ensure_session(
        agent, session_id=data.session_id, title=data.title, new_chat=data.new_chat
    )

    # Seed the fresh agent with the server's copy of the conversation so the
    # LLM always sees the full chat (browser history is ignored when a session
    # already exists server-side).
    for turn in session.get("messages", []):
        agent.messages.append({"role": turn.get("role"), "content": turn.get("content", "")})

    reply = agent.think(data.message)
    session = chat_store.append_turn(data.message, reply) or session
    print(f"[SERVER] Reply via {agent.model}: {reply[:120]}...")

    return {"reply": reply, "session_id": session["id"], "title": session.get("title", "")}


# --- CHAT SESSIONS (server-side organization) ---

@app.get("/api/chats")
async def list_chats():
    """The chat log (data/chatlog/chatRecord.jsonl): header rows for every
    transcript + the currently active session. Feeds the frontend chats
    drop-down."""
    return {"chats": chat_store.list_log()}


@app.get("/api/chats/{chat_id}")
async def get_chat(chat_id: str):
    """One chat: its log row + the .txt content + parsed messages."""
    chat = chat_store.get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail=f"Chat '{chat_id}' not found")
    return chat


@app.post("/api/chats/end")
async def end_chat(payload: dict = None):
    """Finalize the active chat: writes its .txt (versioned on name collision)
    and adds a header row to the log. Safe to call repeatedly."""
    payload = payload or {}
    row = chat_store.finalize_session(title=payload.get("title") or payload.get("chatTitle"))
    if not row:
        return {"finalized": False, "saved": False, "error": "No active chat to finalize."}
    return {"finalized": True, "saved": True, "file": row["fileName"], "id": row["id"], "version": row["version"]}


@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    """Permanently erase a chat: its .txt transcript(s) + log records (+ the
    active session when that is the chat being deleted)."""
    result = chat_store.delete_chat(chat_id)
    if not result["recordsRemoved"] and not result["filesRemoved"] and not result["wasActive"]:
        raise HTTPException(status_code=404, detail=f"Chat '{chat_id}' not found")
    return {"deleted": True, "id": chat_id, **result}


# --- DISCUSSIONS (data/chatlog/chatRecord.jsonl - the chat log) ---

@app.get("/api/discussions")
async def list_discussions():
    """Every stored chat header row, newest first (the log)."""
    return {"discussions": chat_store.list_log()}


@app.post("/api/discussions")
async def save_discussion(discussion: dict):
    """Create or update one discussion (upsert by its `id`).

    The server stamps `updatedAt` itself - the frontend never has to.
    Delegated to chat_store, which writes data/chatlog/chatRecord.jsonl.
    """
    discussion_id = discussion.get("id")
    if not discussion_id:
        return {"saved": False, "error": "A discussion needs an 'id' to be saved."}

    discussion["updatedAt"] = datetime.now().isoformat(timespec="seconds")
    saved = chat_store.save_discussion(discussion)
    if saved:
        print(f"[DISCUSSIONS] saved '{discussion_id}'")
    return {"saved": saved}


@app.delete("/api/discussions/{discussion_id}")
async def delete_discussion(discussion_id: str):
    """Permanently remove one discussion by id (404 when unknown)."""
    deleted = chat_store.delete_discussion(discussion_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Discussion '{discussion_id}' not found")
    print(f"[DISCUSSIONS] deleted '{discussion_id}'")
    return {"deleted": True, "id": discussion_id}


# --- HISTORY (data/history.json) ---

@app.get("/api/history")
async def list_history():
    """Every saved message snapshot ("Save" button copies)."""
    return {"history": _load_json(HISTORY_FILE, [])}


@app.post("/api/history")
async def save_history(message: dict):
    """Store one message snapshot (upsert by its `id`)."""
    message_id = message.get("id") or os.urandom(8).hex()
    message["id"] = message_id

    history = _load_json(HISTORY_FILE, [])
    replaced = False
    for index, existing in enumerate(history):
        if existing.get("id") == message_id:
            history[index] = message
            replaced = True
            break

    if not replaced:
        history.append(message)

    _save_json(HISTORY_FILE, history)
    print(f"[HISTORY] saved '{message_id}' ({'updated' if replaced else 'new'})")
    return {"saved": True}


@app.delete("/api/history/{message_id}")
async def delete_history(message_id: str):
    """Remove one saved message by id (404 when unknown)."""
    history = _load_json(HISTORY_FILE, [])
    remaining = [m for m in history if m.get("id") != message_id]

    if len(remaining) == len(history):
        raise HTTPException(status_code=404, detail=f"History item '{message_id}' not found")

    _save_json(HISTORY_FILE, remaining)
    print(f"[HISTORY] deleted '{message_id}'")
    return {"deleted": True, "id": message_id}


# --- APP SETTINGS (static/config/app_settings.json) ---

@app.get("/api/settings")
async def get_app_settings():
    """The stored browser defaults; {} when nothing was saved yet."""
    return {"settings": _load_json(APP_SETTINGS_FILE, {})}


@app.post("/api/settings")
async def save_app_settings(partial_settings: dict):
    """Merge a partial settings object into what is already stored."""
    stored = _load_json(APP_SETTINGS_FILE, {})
    stored.update(partial_settings)
    _save_json(APP_SETTINGS_FILE, stored)

    print(f"[SETTINGS] updated keys: {', '.join(partial_settings.keys()) or '(none)'}")
    return {"settings": stored}


# --- CHAT SAVE (write chat transcripts as .txt files) ---

def _sanitize_file_name(raw: str) -> str:
    """Keep only filesystem-friendly characters; fall back to 'chat'."""
    cleaned = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in str(raw).strip())
    cleaned = cleaned.strip("_.") or "chat"
    return cleaned[:120]


def _resolve_chat_dir(raw_path: str) -> Path:
    """Resolve the configured output folder, always anchored inside BASE_DIR.

    - Empty path -> BASE_DIR / "data" / "chatlog" / "agent-text-records"
    - Relative path -> BASE_DIR / <path>
    - Absolute path -> kept only if it stays inside BASE_DIR; otherwise
      an absolute path is re-rooted under BASE_DIR (so a crafted value
      can never escape the project).
    """
    candidate = Path(raw_path or "")

    if not candidate.is_absolute():
        resolved = (BASE_DIR / candidate).resolve()
    else:
        resolved = candidate.resolve()

    # Prevent escaping BASE_DIR (sandbox the save location).
    try:
        resolved.relative_to(BASE_DIR.resolve())
    except ValueError:
        resolved = (BASE_DIR / "data" / "chatlog" / "agent-text-records").resolve()

    return resolved


@app.post("/api/chat-save")
async def save_chat_session(payload: dict):
    """Finalize the ACTIVE chat: name the .txt from the chat title, bump the
    version on a name collision (unless disableVersioning is on), and log it.

    The transcript is built server-side from the active session, so the
    frontend no longer sends raw 'content' per reply. If no active session
    exists, it falls back to writing the legacy payload the old way.
    """
    row = chat_store.finalize_session(title=payload.get("title"))
    if row:
        print(f"[CHAT-SAVE] finalized '{row['title']}' -> {row['fileName']} (v{row['version']})")
        return {"saved": True, "file": str(chat_store.RECORDS_DIR / row["fileName"]), "id": row["id"]}

    content = payload.get("content")
    if content is None:
        return {"saved": False, "error": "No active chat to finalize, and no 'content' supplied."}

    # Legacy fallback: write the raw blob (used by older clients).
    raw_name = str(payload.get("fileName") or "").strip() or "chat"
    safe_name = _sanitize_file_name(raw_name)
    if not safe_name.lower().endswith(".txt"):
        safe_name = f"{safe_name}.txt"

    out_dir = _resolve_chat_dir(str(payload.get("path") or ""))
    out_dir.mkdir(parents=True, exist_ok=True)

    file_path = out_dir / safe_name
    file_path.write_text(str(content), encoding="utf-8")

    print(f"[CHAT-SAVE] wrote {file_path}")
    return {"saved": True, "file": str(file_path)}


# --- WIZARD EXPORTS (data/exports/) ---

def _safe_export_name(raw: str) -> str:
    """Keep only filesystem-friendly characters; fall back to 'export'."""
    cleaned = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in raw.strip())
    cleaned = cleaned.strip("_") or "export"
    return cleaned[:80]


@app.post("/api/exports")
async def save_export(payload: dict):
    """Save one wizard prompt as TWO files: {name}.md + {name}.json.

    The frontend slugifies `name` already; we sanitize it again so a
    crafted name can never escape data/exports/.
    """
    name_raw = str(payload.get("name") or "")
    markdown = payload.get("markdown")
    export_data = payload.get("data")

    if not name_raw or markdown is None or export_data is None:
        return {"saved": False, "error": "An export needs 'name', 'markdown' and 'data'."}

    safe_name = _safe_export_name(name_raw)
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

    md_path = EXPORTS_DIR / f"{safe_name}.md"
    json_path = EXPORTS_DIR / f"{safe_name}.json"
    md_path.write_text(str(markdown), encoding="utf-8")
    json_path.write_text(json.dumps(export_data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"[EXPORTS] wrote {md_path.name} + {json_path.name}")
    return {"saved": True, "files": [md_path.name, json_path.name]}


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
async def home():
    return FileResponse(STATIC_DIR / "index.html")

if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
