"""
scripts/version_chats.py
========================

Small CLI for managing the saved chat transcripts + their versions.

The versioning toggle (disableVersioning in static/config/app_settings.json)
controls whether a re-saved chat gets a NEW versioned .txt file (<title>-2.txt,
<title>-3.txt, ...) or simply overwrites <title>.txt. This script can:

    list                          print the chat log (title, file, version, msgs)
    import                        run the one-time import of existing .txt files
    versioning on|off             turn automatic version bumping on or off
    bump <id-or-title> [version]  make a new versioned copy of a chat's file and
                                  point the log at it (e.g. bump my-chat 1.1)

Examples:
    python scripts/version_chats.py list
    python scripts/version_chats.py versioning off
    python scripts/version_chats.py bump chr-1a2b3c4d5e6f 1.1
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.chat_store import store  # noqa: E402


def _load_app_settings():
    path = store.APP_SETTINGS_FILE
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _save_app_settings(settings):
    path = store.APP_SETTINGS_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(settings, indent=2, ensure_ascii=False), encoding="utf-8")


def cmd_list(_argv):
    rows = store.list_log(include_active=True)
    if not rows:
        print("(no chats in the log yet - run `import` or finish a chat first)")
        return 0
    for row in rows:
        active = " [ACTIVE]" if row.get("status") == "active" else ""
        print(
            f"{row.get('id')}  v{row.get('version') or '-'}  "
            f"{row.get('fileName') or '(in progress)'}{active}  "
            f"{row.get('messageCount', 0)} msgs  "
            f"{row.get('endedAt') or row.get('startedAt') or ''}"
        )
    return 0


def cmd_import(_argv):
    added = store.import_once()
    print(f"Imported {added} transcript file(s).")
    return 0


def _find_row(target):
    rows = store.list_log(include_active=False)
    for row in rows:
        if row.get("id") == target or row.get("title", "").lower() == str(target).lower():
            return row
    return None


def cmd_bump(argv):
    if not argv:
        print("usage: bump <id-or-title> [version]")
        return 1
    target = argv[0]
    next_version = argv[1] if len(argv) > 1 else None

    row = _find_row(target)
    if not row:
        print(f"chat '{target}' not found - run `list` to see ids/titles")
        return 1

    if not next_version:
        current = row.get("version") or "1"
        next_version = str(int(float(current)) + 1) if "." not in current else f"{float(current) + 0.1:.1f}"

    updated = store.set_chat_version(row["id"], next_version)
    if not updated:
        print(f"could not version chat '{target}' - file '{row.get('fileName')}' is missing")
        return 1
    print(f"bumped '{row['title']}' -> {updated['fileName']} (v{next_version})")
    return 0


def cmd_versioning(argv):
    if not argv or argv[0] not in ("on", "off"):
        print("usage: versioning on|off")
        return 1
    settings = _load_app_settings()
    settings["disableVersioning"] = argv[0] == "off"
    _save_app_settings(settings)
    state = "on (re-saving overwrites <title>.txt)" if argv[0] == "off" else "off (saves get versioned copies)"
    print(f"version bumping: {state}")
    return 0


COMMANDS = {
    "list": cmd_list,
    "import": cmd_import,
    "bump": cmd_bump,
    "versioning": cmd_versioning,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        return 1
    return COMMANDS[sys.argv[1]](sys.argv[2:])


if __name__ == "__main__":
    sys.exit(main())