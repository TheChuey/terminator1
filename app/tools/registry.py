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
