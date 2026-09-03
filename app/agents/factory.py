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
