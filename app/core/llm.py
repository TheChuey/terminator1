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
