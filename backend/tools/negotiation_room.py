"""
JARVIS Negotiation Room
Builds a complete briefing for any important conversation.
Leverage analysis, BATNA, scripts, red lines, strategy.
"""
import logging
from typing import Any

logger = logging.getLogger("jarvis.negotiation")


async def build_briefing(
    scenario: str,
    their_name: str = "",
    your_goal: str = "",
    context: str = "",
) -> dict[str, Any]:
    """Build a comprehensive negotiation briefing."""
    from core.config import settings
    from groq import AsyncGroq

    client = AsyncGroq(api_key=settings.GROQ_API_KEY)

    prompt = f"""You are a master negotiator building a comprehensive briefing.

SCENARIO: {scenario}
{"COUNTERPART: " + their_name if their_name else ""}
{"MY GOAL: " + your_goal if your_goal else ""}
{"CONTEXT: " + context if context else ""}

Build a complete negotiation room briefing with these exact sections:

## 🎯 OBJECTIVE
[Clear statement of ideal outcome and minimum acceptable outcome]

## 🔍 THEIR LIKELY POSITION
[What they probably want, their constraints, their pressure points, what they fear]

## ⚡ YOUR LEVERAGE
[Every advantage you have — alternatives, timing, information, relationships]

## 🛡️ BATNA
[Your Best Alternative To Negotiated Agreement — what you do if this fails]

## 🚨 RED LINES
[What you will NOT accept under any circumstances — 3 bullet points]

## 📋 OPENING STRATEGY
[How to start, first offer/ask, anchoring strategy]

## 💬 KEY SCRIPTS
Provide word-for-word scripts for:
- Opening statement
- Response to "that's too much/too little"
- When they push back hard
- Asking for what you want directly

## 🎲 THEIR LIKELY MOVES
[3-4 tactics they might use and exactly how to counter each]

## ✅ CONCESSION STRATEGY
[What to give up and in what order, what to NEVER concede]

## 🏁 CLOSING MOVE
[How to close when you reach agreement, what to confirm in writing]

Be specific and tactical. This should be immediately usable."""

    resp = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {"role": "system", "content": "You are a world-class negotiation coach. Be tactical, specific, and direct. No fluff."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=2000,
    )

    briefing = resp.choices[0].message.content.strip()

    # Also create a quick voice summary
    summary_resp = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {"role": "user", "content": f"Summarize this negotiation briefing in 3 sentences for verbal delivery:\n\n{briefing[:1000]}"}
        ],
        max_tokens=150,
    )
    voice_summary = summary_resp.choices[0].message.content.strip()

    return {
        "scenario": scenario,
        "briefing": briefing,
        "voice_summary": voice_summary,
        "counterpart": their_name,
        "goal": your_goal,
    }


async def quick_counter(their_statement: str, context: str = "") -> dict[str, Any]:
    """Generate instant counter-response to something they said."""
    from core.config import settings
    from groq import AsyncGroq

    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    resp = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {"role": "system", "content": "You are a negotiation coach whispering real-time advice. Be concise and tactical."},
            {"role": "user", "content": f"They just said: '{their_statement}'\n{f'Context: {context}' if context else ''}\n\nGive me: 1) What this really means, 2) Exact words to say back, 3) One-line tactic to use."}
        ],
        max_tokens=300,
    )
    return {"counter": resp.choices[0].message.content.strip(), "their_statement": their_statement}
