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
