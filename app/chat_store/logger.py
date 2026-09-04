"""
app/chat_store/logger.py
========================

The single metadata logger for chats and chat versions
(data/chatlog/chatRecord.jsonl).

Records every finalized chat / chat version as ONE JSON line. The file is
JSONL so each line is a self-contained searchable record:

    {"id":"chr-1a2b3c4d5e6f","title":"My Research Chat","version":"2",
     "fileName":"my-research-chat-2.txt","status":"completed", ...}

One record per VERSION is kept (append-only). The "one row per chat" view
the frontend needs is derived at read time by app.chat_store.store.list_log()
(grouping by chat id and keeping the latest record).

The logger is a passive recorder: it never starts chats, calls LLMs, runs
agents, or decides versions. It only stores the metadata handed to it by
app.chat_store.store. Versioning logic stays in store.py.

Future-proofing: records are stable dicts iterated with iter_records(),
so the same metadata can later be pushed into SQLite or indexed with
Chroma without redesigning this module.
"""

import json
import threading
from pathlib import Path

# Default home of the JSONL index, next to the existing chat files:
#   data/chatlog/chatRecord.jsonl, .active-chat.json, agent-text-records/
DEFAULT_LOG_FILE = (
    Path(__file__).resolve().parents[2] / "data" / "chatlog" / "chatRecord.jsonl"
)

# Key order used when writing every record, so the JSONL always looks alike.
RECORD_KEYS = [
    "id",
    "title",
    "version",
    "fileName",
    "status",
    "messageCount",
    "interactionCount",
    "startedAt",
    "endedAt",
    "model",
    "agent",
    "agentId",
    "agentName",
    "tags",
]

HEADER_SEPARATOR = "-" * 40


class ChatLogger:
    """Append-only JSONL index of chat + version metadata.

    Simple on purpose: a future SQLite or Chroma layer can just read the
    records returned here without changing who writes them.
    """

    def __init__(self, log_file=DEFAULT_LOG_FILE):
        self.log_file = Path(log_file)
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Low-level file helpers
    # ------------------------------------------------------------------

    def _read_all(self):
        """Every record currently in the file ([] when missing/corrupt)."""
        if not self.log_file.exists():
            return []
        records = []
        for line in self.log_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                # A damaged line must never break the app - skip it.
                continue
        return records

    def _write_all(self, records):
        """Rewrite the whole file. Called under self._lock only."""
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        with self.log_file.open("w", encoding="utf-8") as handle:
            for record in records:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    def _ordered(self, record):
        """Sort the record into RECORD_KEYS order (unknown keys go last)."""
        ordered = {}
        for key in RECORD_KEYS:
            if key in record:
                ordered[key] = record[key]
        for key, value in record.items():
            if key not in ordered:
                ordered[key] = value
        return ordered

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def add(self, chat_data):
        """Append one record. Call once per finalized chat / new version.

        Returns the record actually written.
        """
        with self._lock:
            records = self._read_all()
            record = self._ordered(dict(chat_data))
            records.append(record)
            self._write_all(records)
        return record

    def update(self, chat_id, data):
        """Replace the most recently logged record for chat_id; append when none.

        Used for small corrections (e.g. new tags) - a new chat version
        should call add() instead so the version history is kept.
        """
        with self._lock:
            records = self._read_all()
            for index in range(len(records) - 1, -1, -1):
                if records[index].get("id") == chat_id:
                    records[index] = self._ordered({**records[index], **data})
                    break
            else:
                records.append(self._ordered(dict(data)))
            self._write_all(records)
        return data

    def add_missing(self, records):
        """Append records whose (id, fileName) pair is not logged yet.

        Makes startup imports idempotent: the same transcripts rescanned on
        every boot are never duplicated. Returns the records that were added.
        """
        with self._lock:
            existing = self._read_all()
            known = {
                (rec.get("id"), rec.get("fileName"))
                for rec in existing
                if rec.get("fileName")
            }
            added = []
            for record in records:
                key = (record.get("id"), record.get("fileName"))
                if key not in known:
                    record = self._ordered(dict(record))
                    existing.append(record)
                    added.append(record)
                    known.add(key)
            if added:
                self._write_all(existing)
        return added

    def prune(self, keep):
        """Drop records that no longer match, keeping the index in sync.

        keep(record) must return True when the record should be KEPT (e.g.
        "the transcript file still exists"). Returns how many were removed.
        Used so chats deleted on disk stop being listed/pointed-to.
        """
        with self._lock:
            records = self._read_all()
            kept = [record for record in records if keep(record)]
            removed = len(records) - len(kept)
            if removed:
                self._write_all(kept)
        return removed

    def remove(self, chat_id):
        """Delete EVERY record belonging to chat_id (all its versions).

        Used when a chat is deleted for good. Returns how many were removed.
        """
        with self._lock:
            records = self._read_all()
            kept = [record for record in records if record.get("id") != chat_id]
            removed = len(records) - len(kept)
            if removed:
                self._write_all(kept)
        return removed

    def get(self, chat_id):
        """The most recently logged record for chat_id (or None)."""
        for record in reversed(self._read_all()):
            if record.get("id") == chat_id:
                return record
        return None

    def list_all(self):
        """Every record, in the order it was appended."""
        return self._read_all()

    def iter_records(self):
        """Generator over every record (future SQLite/Chroma migration seam)."""
        yield from self._read_all()


def record_from_store_row(row, **extra):
    """Map an app.chat_store log row onto the shared metadata schema.

    'agent' reuses the friendly agentName when available, 'status' is
    normalized ('done' -> 'completed') to match the transcript header, and
    'tags' defaults to [] - a free slot for future topic/category tagging.
    agentName + interactionCount are kept so the original row shape can be
    rebuilt losslessly by store.list_log()/get_chat().
    """
    record = {
        "id": row.get("id"),
        "title": row.get("title"),
        "version": row.get("version", ""),
        "fileName": row.get("fileName", ""),
        "status": "completed" if row.get("status") == "done" else (row.get("status") or ""),
        "messageCount": row.get("messageCount", 0),
        "interactionCount": row.get("interactionCount", 0),
        "startedAt": row.get("startedAt", ""),
        "endedAt": row.get("endedAt", ""),
        "model": row.get("model", ""),
        "agent": row.get("agentName") or row.get("agentId", ""),
        "agentId": row.get("agentId", ""),
        "agentName": row.get("agentName", ""),
        "tags": row.get("tags") or [],
    }
    record.update(extra)
    return record


def render_header(meta):
    """Build the optional transcript metadata block ('' when no chat id)."""
    if not meta.get("id"):
        return ""
    pairs = [
        ("CHAT_ID", "id"),
        ("TITLE", "title"),
        ("VERSION", "version"),
        ("FILE", "fileName"),
        ("STATUS", "status"),
        ("MESSAGES", "messageCount"),
        ("STARTED", "startedAt"),
        ("ENDED", "endedAt"),
        ("MODEL", "model"),
        ("AGENT", "agent"),
        ("TAGS", "tags"),
    ]
    lines = []
    for label, field in pairs:
        value = meta.get(field, "")
        if isinstance(value, (list, tuple)):
            value = ", ".join(str(item) for item in value)
        lines.append(f"{label}: {value}")
    return "\n".join(lines) + "\n" + HEADER_SEPARATOR


def add_header_to_transcript(content, meta):
    """Prefix transcript text with the metadata header (optional feature).

    Returns the content unchanged when there is no chat id.
    """
    header = render_header(meta)
    if not header:
        return str(content)
    return header + "\n\n" + str(content)


def parse_header(text):
    """Pull the CAPSKEY: values out of an optional metadata header.

    Keys are lower-cased (CHAT_ID -> chat_id). Returns {} when absent.
    """
    values = {}
    for line in str(text or "").splitlines():
        line = line.strip()
        if not line or line.startswith("-"):
            continue
        if ":" in line:
            key, _, raw = line.partition(":")
            if key.isupper():
                values[key.lower()] = raw.strip()
    return values


__all__ = [
    "ChatLogger",
    "record_from_store_row",
    "render_header",
    "add_header_to_transcript",
    "parse_header",
    "DEFAULT_LOG_FILE",
]