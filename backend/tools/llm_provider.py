"""
JARVIS LLM Provider — unified async completion that prefers Claude and
falls back to Groq.

Why this exists:
    The Code Intelligence routes were originally hard-wired to Groq
    (llama-3.3-70b). Code reasoning — reviews, refactors, complexity — is
    exactly where a frontier model like Claude is dramatically stronger than
    a 70B open model. But the deployment may only have a Groq key configured,
    so we cannot *require* Claude.

    This helper picks the best available provider at call time:
      1. Claude (anthropic)  — if ANTHROPIC_API_KEY is set   ← preferred
      2. Groq (llama)        — if only GROQ_API_KEY is set   ← fallback

    Callers get back the text PLUS which provider/model answered, so the UI
    can show "Powered by Claude" or nudge the user to add an Anthropic key for
    better results. Adding ANTHROPIC_API_KEY to backend/.env upgrades every
    code feature with zero further code changes.
"""
import logging
from typing import Any

from core.config import settings

logger = logging.getLogger("jarvis.llm")


def active_provider() -> str:
    """Return which provider would be used right now: 'claude' | 'groq' | 'none'."""
    if settings.ANTHROPIC_API_KEY:
        return "claude"
    if settings.GROQ_API_KEY:
        return "groq"
    return "none"


async def llm_complete(
    system: str,
    user: str,
    max_tokens: int = 1500,
    temperature: float = 0.2,
) -> dict[str, Any]:
    """
    Run a single-shot completion on the best available provider.

    Returns: {"text": str, "provider": "claude"|"groq", "model": str}
             or {"error": str} if no provider is configured / the call fails.

    temperature defaults low (0.2) because code analysis wants determinism,
    not creativity.
    """
    provider = active_provider()

    if provider == "claude":
        try:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            resp = await client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            # Claude returns a list of content blocks; concatenate any text blocks.
            text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
            return {"text": text, "provider": "claude", "model": settings.CLAUDE_MODEL}
        except Exception as e:
            logger.warning("Claude call failed (%s) — falling back to Groq if available", e)
            # fall through to Groq rather than hard-failing
            if not settings.GROQ_API_KEY:
                return {"error": f"Claude error: {e}"}
            provider = "groq"

    if provider == "groq":
        try:
            from groq import AsyncGroq
            client = AsyncGroq(api_key=settings.GROQ_API_KEY)
            resp = await client.chat.completions.create(
                model=settings.GROQ_MODEL,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            text = resp.choices[0].message.content.strip()
            return {"text": text, "provider": "groq", "model": settings.GROQ_MODEL}
        except Exception as e:
            return {"error": f"Groq error: {e}"}

    return {"error": "No AI API key configured. Add ANTHROPIC_API_KEY (preferred) or GROQ_API_KEY to backend/.env"}
