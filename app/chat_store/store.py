"""
app/chat_store/store.py
=======================

Server-side chat organization: exactly ONE active chat session at a time.

Files:
    data/chatlog/chatRecord.jsonl            -> the LOG: one record per chat VERSION
    data/chatlog/.active-chat.json           -> the live session currently in progress
    data/chatlog/agent-text-records/*.txt     -> finalized per-agent chat transcripts

Lifecycle of a chat (its own start -> middle -> end):
    start  (new chat, or the first message after a restart/finalize)
    turn   (each /api/chat call appends the user message + assistant reply and
            persists the session JSON; NO .txt is written per-reply)
    end    (/api/chats/end, "Save chat", or a new chat starting) writes the
            single transcript .txt (versioned on name collision) and adds one
            record (per version) to chatRecord.jsonl.

The browser never owns the transcript anymore: the server tracks each chat, and
data/chatlog/agent-text-records/*.txt is the source of truth that the records
point at. The records and the live session stay directly in data/chatlog/.

On startup, import_once() also migrates the old layout (data/chats/*.txt plus
data/discussions.json) into data/chatlog/ so nothing is lost when upgrading.
"""

import hashlib
import json
import re
import shutil
import threading
import uuid
from datetime import datetime
from pathlib import Path

from . import logger as chat_logger

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
CHATS_DIR = DATA_DIR / "chatlog"
RECORDS_DIR = CHATS_DIR / "agent-text-records"
# The ONE metadata file: a JSONL log of every chat version. chatRecord.jsonl
# replaced the old log-chats.json (JSON array, one row per chat) - the "one
# row per chat" view is now derived at read time by list_log(). Old files are
# migrated into it by import_once() and then deleted.
LOG_FILE = chat_logger.DEFAULT_LOG_FILE
ACTIVE_SESSION_FILE = CHATS_DIR / ".active-chat.json"
APP_SETTINGS_FILE = BASE_DIR / "static" / "config" / "app_settings.json"

_LEGACY_CHATS_DIR = DATA_DIR / "chats"
_LEGACY_LOG_FILE = DATA_DIR / "discussions.json"
_OLD_LOGCHATS_FILE = CHATS_DIR / "log-chats.json"   # superseded by chatRecord.jsonl
_OLD_JSONL_FILE = CHATS_DIR / "chat_log.jsonl"      # superseded by chatRecord.jsonl

_lock = threading.Lock()

# The single JSONL logger behind every read/write of chatRecord.jsonl.
_metadata_logger = chat_logger.ChatLogger()

DIVIDER = "=" * 64
THIN = "-" * 64


def _resolve_transcript(file_name: str) -> Path:
    """Where a logged transcript lives: agent-text-records first (the current
    home of every .txt), falling back to the chatlog root for stragglers."""
    if not file_name:
        return Path()
    candidate = RECORDS_DIR / file_name
    if candidate.exists():
        return candidate
    return CHATS_DIR / file_name


# ==========================================================================
# LOW-LEVEL HELPERS
# ==========================================================================

def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _new_id(prefix: str = "chr") -> str:
    """Random id like 'chr-1a2b3c4d5e6f'."""
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _stable_id(file_name: str) -> str:
    """Deterministic id for imported files so re-importing never duplicates."""
    return f"chr-{hashlib.sha1(file_name.encode('utf-8')).hexdigest()[:12]}"


def _slugify(value) -> str:
    """Filesystem-safe name from the chat title ('My Chat! 1' -> 'my-chat-1')."""
    s = re.sub(r"[^a-z0-9-]+", "-", str(value or "").lower().strip()).strip("-")
    return s[:60] or "chat"


def _load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _save_json(path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")


def _versioning_disabled() -> bool:
    """Read the 'disableVersioning' toggle from the app settings file."""
    try:
        settings = json.loads(APP_SETTINGS_FILE.read_text(encoding="utf-8"))
        return bool(settings.get("disableVersioning"))
    except (OSError, json.JSONDecodeError):
        return False


def _header_enabled() -> bool:
    """Read the 'metadataHeader' toggle from the app settings file.

    When on, finalized transcripts get the CHAT_ID:/TITLE:/... block from
    app.chat_store.logger prepended. Off by default so existing .txt files
    never change unless explicitly asked for.
    """
    try:
        settings = json.loads(APP_SETTINGS_FILE.read_text(encoding="utf-8"))
        return bool(settings.get("metadataHeader"))
    except (OSError, json.JSONDecodeError):
        return False


# ==========================================================================
# TRANSCRIPTS
# ==========================================================================

def _count_interactions(messages: list) -> int:
    """Number of user->assistant turn pairs (mirrors frontend chat-formatter)."""
    pairs = 0
    for i in range(1, len(messages)):
        if (
            messages[i].get("role") == "assistant"
            and messages[i - 1].get("role") == "user"
        ):
            pairs += 1
    if messages and messages[-1].get("role") == "user":
        pairs += 1
    return pairs


def _fmt_date(value) -> str:
    """ISO timestamp -> 'Sep 04, 2026, 02:35 PM' (or now on parse failure)."""
    try:
        iso = str(value or "").replace("Z", "+00:00")
        return datetime.fromisoformat(iso).strftime("%b %d, %Y, %I:%M %p")
    except (ValueError, TypeError):
        return datetime.now().strftime("%b %d, %Y, %I:%M %p")


def build_transcript(session: dict) -> str:
    """Render a session dict into the .txt transcript body."""
    messages = session.get("messages", []) or []
    lines = [
        DIVIDER,
        f"Session: {session.get('title') or 'Untitled chat'}",
        f"Agent:   {session.get('agentName') or session.get('agentId') or 'default'}",
        f"Model:   {session.get('model') or '(server default)'}",
        f"Date:    {_fmt_date(session.get('endedAt') or session.get('updatedAt') or session.get('startedAt'))}",
        f"Interactions between LLM and user: {_count_interactions(messages)}",
        DIVIDER,
        "",
    ]
    for message in messages:
        speaker = message.get("author") or ("You" if message.get("role") == "user" else "AI")
        lines.append(f"[{speaker}]  {_fmt_date(message.get('timestamp'))}")
        lines.append(THIN)
        lines.append((message.get("content") or "") or "")
        lines.append("")
    return "\n".join(lines)


def _parse_transcript_messages(text) -> list:
    """Turn transcript text back into [{role, author, text}, ...] (best effort)."""
    messages = []
    current = None
    for line in str(text or "").splitlines():
        match = re.match(r"^\[([^\]]+)\]\s*(.*)$", line)
        if match:
            if current and current.get("text"):
                messages.append(current)
            current = {
                "role": "user" if match.group(1).strip() == "You" else "assistant",
                "author": match.group(1).strip(),
                "text": "",
            }
        elif current is not None:
            stripped = line.strip()
            if stripped and not stripped.startswith("-") and not stripped.startswith("="):
                current["text"] = (
                    f"{current.get('text')}\n{stripped}" if current.get("text") else stripped
                )
    if current and current.get("text"):
        messages.append(current)
    return messages


def parse_transcript_header(text: str) -> dict:
    """Pull the 'Session:/Agent:/...' header values out of a transcript.

    Also understands the newer CAPS: metadata block written by
    app.chat_store.logger (CHAT_ID:/TITLE:/AGENT:/MODEL:/MESSAGES://...),
    so transcripts with the optional header still import cleanly.
    """
    lines = str(text or "").splitlines()
    values: dict = {}

    def grab(key: str, field: str):
        for line in lines:
            if line.startswith(key):
                values[field] = line[len(key):].strip()
                return

    grab("Session:", "title")
    grab("TITLE:", "title")
    grab("Agent:", "agent_name")
    grab("AGENT:", "agent_name")
    grab("Model:", "model")
    grab("MODEL:", "model")
    grab("MESSAGES:", "messageCount")
    grab("STARTED:", "startedAt")
    grab("ENDED:", "endedAt")
    grab("TAGS:", "tags")
    grab("Interactions between LLM and user:", "interactions")
    values.pop("interactions", None)  # read separately below
    for line in lines:
        if line.startswith("Interactions between LLM and user:"):
            try:
                values["interactionCount"] = int(line.split(":")[-1].strip())
            except ValueError:
                pass
            break
    if values.get("messageCount"):
        try:
            values["messageCount"] = int(values["messageCount"])
        except (ValueError, TypeError):
            pass
    return values


# ==========================================================================
# ACTIVE SESSION
# ==========================================================================

def current_session() -> dict | None:
    """The single in-progress session (None when none exists)."""
    with _lock:
        return _load_json(ACTIVE_SESSION_FILE, None)


def ensure_session(agent, session_id: str = "", title: str = "", new_chat: bool = False) -> dict:
    """Return the active session, finalizing the old one when a new chat starts.

    A new session is created when:
      - the caller explicitly asks for a new chat, OR
      - there is no active session, OR
      - the caller's session_id does NOT match the active session (stale), OR
      - the active session is talking to a different agent.

    A session kept alive after "Save chat" (status 'finalized') is only
    finalized again when it gained messages since its last save - otherwise
    starting a new chat just moves on, keeping the historical .txt files.
    """
    with _lock:
        active = _load_json(ACTIVE_SESSION_FILE, None)
        wants_new = (
            new_chat
            or active is None
            or (session_id and active.get("id") != session_id)
            or active.get("agentId") != agent.profile.id
        )
        if wants_new:
            if active is not None and active.get("status") == "finalized":
                # Re-save only when the chat grew after its last version.
                if len(active.get("messages", [])) > (active.get("finalizedCount") or 0):
                    _finalize_locked()
            elif active is not None:
                _finalize_locked()
            return _create_locked(agent, title)
        return active


def _create_locked(agent, title: str = "") -> dict:
    now = _now_iso()
    session = {
        "id": _new_id("chr"),
        "title": (str(title or "").strip()[:80]) or "New chat",
        "agentId": agent.profile.id or "",
        "agentName": agent.profile.name or "",
        "model": agent.model or "",
        "startedAt": now,
        "updatedAt": now,
        "messages": [],
    }
    _save_json(ACTIVE_SESSION_FILE, session)
    print(f"[CHATS] started session '{session['id']}' for '{session['agentId']}'")
    return session


def append_turn(user_text: str, reply_text: str) -> dict | None:
    """Append the user message + assistant reply to the active session."""
    with _lock:
        session = _load_json(ACTIVE_SESSION_FILE, None)
        if not session:
            return None
        now = _now_iso()
        session.setdefault("messages", []).append(
            {"role": "user", "author": "You", "content": str(user_text), "timestamp": now}
        )
        session.setdefault("messages", []).append(
            {
                "role": "assistant",
                "author": session.get("agentName") or "AI",
                "content": str(reply_text),
                "timestamp": now,
            }
        )
        if session.get("title") in ("", "New chat"):
            session["title"] = _first_words(user_text, 50)
        session["updatedAt"] = now
        _save_json(ACTIVE_SESSION_FILE, session)
        return session


def _first_words(text: str, max_chars: int) -> str:
    text = str(text or "").strip()
    if not text:
        return "New chat"
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "..."


# ==========================================================================
# FINALIZE (end of a chat)
# ==========================================================================

def finalize_session(title: str | None = None) -> dict | None:
    """Finalize the active chat: write its .txt (versioned) + log one header row.

    The live session stays in place (marked 'finalized') so the user can keep
    chatting; saving again writes the NEXT version to a new .txt file. The log
    keeps ONE row per chat, pointing at its latest version - older .txt files
    remain on disk as archived history.
    """
    with _lock:
        return _finalize_locked(title=title)


def _finalize_locked(title: str | None = None) -> dict | None:
    session = _load_json(ACTIVE_SESSION_FILE, None)
    if not session:
        return None

    if title and str(title).strip():
        session["title"] = str(title).strip()[:80]
    elif session.get("title") in ("", "New chat"):
        session["title"] = _first_words(
            ((session.get("messages") or [{}])[0].get("content") if session.get("messages") else ""),
            50,
        )

    session["endedAt"] = _now_iso()
    session["status"] = "finalized"
    session["finalizedCount"] = len(session.get("messages", []))
    content = build_transcript(session)

    base = _slugify(session["title"])
    target, version = _target_path(base)
    target.parent.mkdir(parents=True, exist_ok=True)

    row = {
        "id": session.get("id") or _stable_id(target.name),
        "title": session.get("title"),
        "fileName": target.name,
        "agentId": session.get("agentId", ""),
        "agentName": session.get("agentName", ""),
        "model": session.get("model", ""),
        "version": str(version),
        "messageCount": len(session.get("messages", [])),
        "interactionCount": _count_interactions(session.get("messages", [])),
        "startedAt": session.get("startedAt"),
        "endedAt": session.get("endedAt"),
        "status": "done",
    }

    if _header_enabled():
        content = chat_logger.add_header_to_transcript(
            content, chat_logger.record_from_store_row(row)
        )
    target.write_text(content, encoding="utf-8")

    # Record this version in chatRecord.jsonl. A failure here must never
    # block the chat save, so the existing behavior is preserved.
    try:
        _metadata_logger.add(chat_logger.record_from_store_row(row))
    except OSError:
        pass

    # Keep the live session so continued messages can become the next version.
    _save_json(ACTIVE_SESSION_FILE, session)
    print(f"[CHATS] finalized '{session['title']}' -> {target.name} (v{version})")
    return row


def _target_path(base: str) -> tuple:
    """Pick the file name + version for a finalized chat (inside RECORDS_DIR).

    - Remember the existing version when overwriting is disabled: bump to the
      next integer suffix (<base>-2.txt, -3.txt, ...) so every chat keeps its
      own end-to-end transcript.
    - With disableVersioning on, always overwrite <base>.txt (version 1).
    """
    primary = RECORDS_DIR / f"{base}.txt"
    if _versioning_disabled() or not primary.exists():
        return primary, "1"
    n = 2
    while (RECORDS_DIR / f"{base}-{n}.txt").exists():
        n += 1
    return RECORDS_DIR / f"{base}-{n}.txt", str(n)


# ==========================================================================
# CHAT RECORDS (data/chatlog/chatRecord.jsonl) - the single metadata store
# ==========================================================================

def _transcript_exists(file_name: str) -> bool:
    """True when the transcript .txt a record points at is still on disk."""
    return bool(file_name) and _resolve_transcript(file_name).exists()


def _record_to_row(record: dict) -> dict:
    """Rebuild the frontend-facing row shape from a chatRecord.jsonl record."""
    return {
        "id": record.get("id"),
        "title": record.get("title"),
        "fileName": record.get("fileName", ""),
        "agentId": record.get("agentId", ""),
        "agentName": record.get("agentName") or record.get("agent", ""),
        "model": record.get("model", ""),
        "version": record.get("version", ""),
        "messageCount": record.get("messageCount", 0),
        "interactionCount": record.get("interactionCount", 0),
        "startedAt": record.get("startedAt", ""),
        "endedAt": record.get("endedAt", ""),
        "status": "done",
    }


def latest_per_chat(records: list) -> list:
    """Collapse per-version records down to the LATEST record per chat id.

    chatRecord.jsonl keeps one line per version; the dropdown only shows one
    entry per chat. The file is append-only, so walking in reverse and keeping
    the first sighting of each id yields the newest version of every chat.
    """
    latest = {}
    for record in reversed(records):
        chat_id = record.get("id")
        if chat_id is not None and chat_id not in latest:
            latest[chat_id] = record
    return list(latest.values())


def prune_deleted() -> int:
    """Remove chatRecord.jsonl records whose transcript .txt is gone.

    Runs lazily on every list_log() so a chat whose transcript is deleted
    manually disappears from the drop-down immediately - no server restart
    needed. Records without a fileName are left alone. Returns count removed.
    """
    with _lock:
        try:
            return _metadata_logger.prune(
                lambda rec: not rec.get("fileName") or _transcript_exists(rec.get("fileName"))
            )
        except OSError:
            return 0


def list_log(include_active=True) -> list:
    """The log used by the frontend dropdown/sidebar, newest end first.

    Stale records whose transcript .txt no longer exists are pruned first, so
    chats deleted on disk disappear here and from chatRecord.jsonl on the next
    refresh rather than lingering until a restart. Returns one row per chat,
    pointing at its LATEST version.
    """
    prune_deleted()
    rows = [_record_to_row(rec) for rec in latest_per_chat(_metadata_logger.list_all())]
    if include_active:
        active = _load_json(ACTIVE_SESSION_FILE, None)
        if active and active.get("status") != "finalized":
            rows.append(
                {
                    "id": active.get("id"),
                    "title": active.get("title"),
                    "fileName": "",
                    "agentId": active.get("agentId", ""),
                    "agentName": active.get("agentName", ""),
                    "model": active.get("model", ""),
                    "version": "",
                    "messageCount": len(active.get("messages", [])),
                    "interactionCount": _count_interactions(active.get("messages", [])),
                    "startedAt": active.get("startedAt"),
                    "endedAt": "",
                    "status": "active",
                }
            )
    rows.sort(
        key=lambda r: r.get("endedAt") or r.get("savedAt") or r.get("startedAt") or "",
        reverse=True,
    )
    return rows


def get_chat(chat_id: str) -> dict | None:
    """One chat (its record w/ the transcript content/messages) to reopen it."""
    record = _metadata_logger.get(chat_id)
    if record:
        path = _resolve_transcript(record.get("fileName", ""))
        content = path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""
        row = _record_to_row(record)
        return {**row, "content": content, "messages": _parse_transcript_messages(content)}
    active = _load_json(ACTIVE_SESSION_FILE, None)
    if active and active.get("id") == chat_id:
        return {
            **{
                "id": active.get("id"),
                "title": active.get("title"),
                "fileName": "",
                "agentId": active.get("agentId", ""),
                "agentName": active.get("agentName", ""),
                "model": active.get("model", ""),
                "version": "",
                "messageCount": len(active.get("messages", [])),
                "startedAt": active.get("startedAt"),
                "endedAt": "",
                "status": "active",
            },
            "content": build_transcript(active),
            "messages": active.get("messages", []),
        }
    return None


def _fileName_version(file_name: str) -> str:
    """'my-chat-2.txt' -> '2'; 'my-chat.txt' -> '1'."""
    match = re.search(r"-(\d+(?:\.\d+)*)\.txt$", file_name)
    return match.group(1) if match else "1"


def set_chat_version(chat_id: str, version: str) -> dict | None:
    """Point a chat at a new versioned .txt copy (e.g. '1.1').

    Used by scripts/version_chats.py: assumes the source .txt already exists
    in data/chatlog/ and just writes the new versioned copy into
    agent-text-records/ while adding a new (id, version, fileName) record to
    chatRecord.jsonl. The chat's history line is preserved.
    """
    with _lock:
        record = _metadata_logger.get(chat_id)
        if not record:
            return None
        source = _resolve_transcript(record.get("fileName", ""))
        if not source.exists():
            return None
        stem = re.sub(r"-(\d+(?:\.\d+)*)$", "", source.stem)
        target = RECORDS_DIR / f"{stem}-{version}.txt"
        if target.name == source.name:
            target = RECORDS_DIR / f"{stem}-{version}-2.txt"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(source.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
        record["version"] = str(version)
        record["fileName"] = target.name
        try:
            _metadata_logger.add(record)
        except OSError:
            pass
        return {**record}


def _rebuild_header(file_name: str) -> dict:
    """Best-effort header row for an existing .txt file (used by import_once)."""
    path = _resolve_transcript(file_name)
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        mtime = datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds")
    except OSError:
        return None

    header = parse_transcript_header(text)
    title = header.get("title") or re.sub(r"-(\d+(\.\d+)*)?$", "", path.stem).replace("-", " ").title()
    messages = _parse_transcript_messages(text)
    return {
        "id": _stable_id(file_name),
        "title": title,
        "fileName": file_name,
        "agentId": "",
        "agentName": header.get("agent_name") or "",
        "model": "" if header.get("model") in (None, "(server default)") else header.get("model", ""),
        "version": _fileName_version(file_name),
        "messageCount": len(messages),
        "interactionCount": header.get("interactionCount", _count_interactions(messages)),
        "startedAt": "",
        "endedAt": mtime,
        "status": "done",
    }


def _migrate_legacy_layout() -> None:
    """Move the pre-rename layout (data/chats/* + data/discussions.json)
    into data/chatlog/, and every .txt into agent-text-records/. Idempotent:
    each step only runs when the target is missing and the source still
    exists. Called from import_once() at startup.
    """
    # 1. Folder: data/chats -> data/chatlog (all .txt + hidden state files).
    if _LEGACY_CHATS_DIR.is_dir() and (not CHATS_DIR.exists() or not list(CHATS_DIR.glob("*.txt"))):
        CHATS_DIR.mkdir(parents=True, exist_ok=True)
        for legacy in list(_LEGACY_CHATS_DIR.iterdir()):
            target = CHATS_DIR / legacy.name
            if not target.exists():
                shutil.move(str(legacy), str(target))
        if not list(_LEGACY_CHATS_DIR.iterdir()):
            _LEGACY_CHATS_DIR.rmdir()

    # 2. Log: data/discussions.json -> data/chatlog/log-chats.json (the old
    #    store; import_once() absorbs it into chatRecord.jsonl afterwards).
    if not _OLD_LOGCHATS_FILE.exists() and _LEGACY_LOG_FILE.exists():
        CHATS_DIR.mkdir(parents=True, exist_ok=True)
        shutil.move(str(_LEGACY_LOG_FILE), str(_OLD_LOGCHATS_FILE))

    # 3. Transcripts: data/chatlog/*.txt -> data/chatlog/agent-text-records/.
    #    (The log keeps the bare file name, so moving is safe.)
    RECORDS_DIR.mkdir(parents=True, exist_ok=True)
    for legacy in list(CHATS_DIR.glob("*.txt")) + list(RECORDS_DIR.glob("*.txt")):
        target = RECORDS_DIR / legacy.name
        if target.exists():
            continue
        shutil.move(str(legacy), str(target))


def import_once() -> int:
    """One-time boot sync that builds the single store, chatRecord.jsonl.

    - Migrates the pre-chatRecord layout into chatRecord.jsonl:
        * data/discussions.json  (legacy message arrays) -> .txt transcripts,
        * data/chatlog/log-chats.json (old one-row-per-chat store),
        * data/chatlog/chat_log.jsonl (old per-version records).
    - Scans data/chatlog/agent-text-records/*.txt and records any file not
      yet logged.
    - Drops records whose transcript disappeared since the last boot.
    - Deletes the old store files once their content is in chatRecord.jsonl.

    Idempotent: the merge key is (id, fileName), so a restart never
    duplicates. Runs once at server startup.
    """
    with _lock:
        _migrate_legacy_layout()
        migrated = 0
        added = 0

        # --- 1. Read the old stores BEFORE they are deleted ---
        old_rows = _load_json(_OLD_LOGCHATS_FILE, []) if _OLD_LOGCHATS_FILE.exists() else []
        old_records = chat_logger.ChatLogger(log_file=_OLD_JSONL_FILE).list_all()

        # --- 2. Legacy discussion rows (no fileName, whole 'messages' arrays)
        #         become versioned .txt transcripts, exactly as before. ---
        new_rows = []
        for entry in old_rows:
            if entry.get("fileName"):
                new_rows.append(entry)
                continue
            legacy_id = entry.get("id") or _new_id("chr")
            if not entry.get("messages"):
                continue
            session = {
                "id": legacy_id,
                "title": entry.get("title") or "Legacy import",
                "agentId": entry.get("agentId", ""),
                "agentName": entry.get("agentName", ""),
                "model": entry.get("model", ""),
                "startedAt": entry.get("createdAt") or entry.get("updatedAt") or _now_iso(),
                "updatedAt": entry.get("updatedAt") or _now_iso(),
                "endedAt": entry.get("updatedAt") or _now_iso(),
                "messages": [
                    {
                        "role": (m.get("role") or "user"),  # assistant->assistant
                        "author": m.get("author") or ("You" if m.get("role") == "user" else "AI"),
                        "content": (m.get("text") or m.get("content") or ""),
                        "timestamp": m.get("timestamp", _now_iso()),
                    }
                    for m in (entry.get("messages") or [])
                    if (m.get("text") or m.get("content") or "")
                ],
            }
            base = _slugify(session["title"])
            target, version = _target_path(base)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(build_transcript(session), encoding="utf-8")
            new_rows.append(
                {
                    "id": legacy_id,
                    "title": session["title"],
                    "fileName": target.name,
                    "agentId": session["agentId"],
                    "agentName": session["agentName"],
                    "model": session["model"],
                    "version": str(version),
                    "messageCount": len(session["messages"]),
                    "interactionCount": _count_interactions(session["messages"]),
                    "startedAt": session["startedAt"],
                    "endedAt": session["endedAt"],
                    "status": "done",
                }
            )
            migrated += 1

        # --- 3. Merge chatRecord.jsonl + both old files by (id, fileName) ---
        merged = {(rec.get("id"), rec.get("fileName")): rec
                  for rec in _metadata_logger.list_all()}
        for record in old_records:
            key = (record.get("id"), record.get("fileName"))
            if key not in merged:
                merged[key] = record
                migrated += 1
        for row in new_rows:
            key = (row.get("id"), row.get("fileName"))
            if key not in merged:
                merged[key] = chat_logger.record_from_store_row(row)
                migrated += 1

        # --- 4. Import on-disk .txt transcripts not logged yet ---
        known = set(merged)
        known_names = {k[1] for k in known}
        # Scan agent-text-records/ first, then anything left in the chatlog root.
        for scan_dir in (RECORDS_DIR, CHATS_DIR):
            if not scan_dir.exists():
                continue
            for path in sorted(scan_dir.glob("*.txt")):
                name = path.name
                if name in known_names:
                    continue
                row = _rebuild_header(name)
                if row:
                    key = (_stable_id(name), name)
                    merged[key] = chat_logger.record_from_store_row(row)
                    known_names.add(name)
                    added += 1

        # --- 5. Drop records whose transcript disappeared, then write once ---
        records = [merged[k] for k in merged if _transcript_exists(merged[k].get("fileName", ""))]
        write_ok = True
        try:
            _metadata_logger.add_missing(records)
            _metadata_logger.prune(
                lambda rec: not rec.get("fileName") or _transcript_exists(rec.get("fileName"))
            )
        except OSError:
            write_ok = False

        # --- 6. The old stores are absorbed - delete them only on success ---
        if write_ok:
            for legacy in (_OLD_LOGCHATS_FILE, _OLD_JSONL_FILE):
                if legacy.exists():
                    try:
                        legacy.unlink()
                    except OSError:
                        pass

        total = migrated + added
        if total:
            print(f"[CHATS] migrated {migrated} legacy record(s) and imported {added} transcript(s)")
        return total


def save_discussion(discussion: dict) -> bool:
    """Legacy /api/discussions POST: upsert one record into chatRecord.jsonl.

    The server stamps updatedAt. The payload is merged into the chat's most
    recent record (or appended when the id is new). Returns True when saved.
    """
    discussion_id = discussion.get("id")
    if not discussion_id:
        return False
    discussion["updatedAt"] = _now_iso()
    try:
        _metadata_logger.update(discussion_id, discussion)
    except OSError:
        return False
    return True


def delete_discussion(discussion_id: str) -> bool:
    """Legacy /api/discussions DELETE: remove EVERY record for a chat id.

    Returns True when at least one record was removed.
    """
    try:
        return _metadata_logger.remove(discussion_id) > 0
    except OSError:
        return False


__all__ = [
    "current_session",
    "ensure_session",
    "append_turn",
    "finalize_session",
    "list_log",
    "get_chat",
    "import_once",
    "set_chat_version",
    "save_discussion",
    "delete_discussion",
    "build_transcript",
    "CHATS_DIR",
    "RECORDS_DIR",
    "LOG_FILE",
]