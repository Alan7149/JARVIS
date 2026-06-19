"""
JARVIS Intelligence Suite
- Real-time fact checker
- ELI5 explainer
- Concept mapper
- Socratic mode
- Devil's advocate
- Research assistant
- Argument summarizer
- First principles analyzer
- Patent checker
- Podcast/YouTube summarizer
- Book summary engine
"""
import logging
from typing import Any

logger = logging.getLogger("jarvis.intelligence")


async def _groq(prompt: str, system: str = "You are JARVIS, a precise AI assistant.", max_tokens: int = 800) -> str:
    from core.config import settings
    from groq import AsyncGroq
    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    resp = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content.strip()


class IntelligenceTools:

    @staticmethod
    async def eli5(topic: str) -> dict[str, Any]:
        """Explain Like I'm 5."""
        result = await _groq(
            f"Explain '{topic}' like I'm 5 years old. Use a simple analogy. Max 3 sentences.",
            "You explain complex topics simply using relatable analogies. Be friendly and concise."
        )
        return {"topic": topic, "explanation": result}

    @staticmethod
    async def fact_check(claim: str) -> dict[str, Any]:
        """Fact-check a claim."""
        result = await _groq(
            f"Fact-check this claim: '{claim}'\nRespond with: VERDICT: [TRUE/FALSE/PARTIALLY TRUE/UNVERIFIABLE]\nEXPLANATION: [1-2 sentences]\nSOURCE_TYPE: [scientific/historical/statistical/opinion]",
            "You are a precise fact-checker. Be direct about accuracy."
        )
        verdict = "UNKNOWN"
        for v in ["TRUE", "FALSE", "PARTIALLY TRUE", "UNVERIFIABLE"]:
            if v in result:
                verdict = v; break
        return {"claim": claim, "verdict": verdict, "analysis": result}

    @staticmethod
    async def devils_advocate(position: str) -> dict[str, Any]:
        """Challenge a position with counterarguments."""
        result = await _groq(
            f"Play devil's advocate against this position: '{position}'\nGive 3 strong counterarguments. Be specific and use evidence.",
            "You challenge ideas constructively. Find the strongest counterarguments."
        )
        return {"position": position, "counterarguments": result}

    @staticmethod
    async def socratic_mode(question: str) -> dict[str, Any]:
        """Instead of answering, ask guiding questions."""
        result = await _groq(
            f"The user asked: '{question}'\nInstead of answering directly, ask 3 Socratic questions that will guide them to discover the answer themselves.",
            "You use the Socratic method. Ask probing questions rather than giving direct answers."
        )
        return {"question": question, "socratic_questions": result}

    @staticmethod
    async def first_principles(problem: str) -> dict[str, Any]:
        """Break down a problem to first principles."""
        result = await _groq(
            f"Apply first principles thinking to: '{problem}'\n1. Strip away assumptions\n2. Identify fundamental truths\n3. Rebuild from ground up\nFormat clearly.",
            "You are Elon Musk applying first principles. Eliminate assumptions ruthlessly."
        )
        return {"problem": problem, "analysis": result}

    @staticmethod
    async def research_brief(topic: str) -> dict[str, Any]:
        """Synthesize a research brief on any topic."""
        result = await _groq(
            f"Write a comprehensive research brief on: '{topic}'\nInclude: Overview, Key Facts, Common Misconceptions, Expert Consensus, Open Questions, Practical Implications. Be specific.",
            "You are a research analyst. Provide accurate, dense information briefs.",
            max_tokens=1200
        )
        return {"topic": topic, "brief": result}

    @staticmethod
    async def summarize_argument(text: str) -> dict[str, Any]:
        """Summarize both sides of a debate/argument."""
        result = await _groq(
            f"Summarize both sides of this debate/argument:\n\n{text[:2000]}\n\nFormat:\nSIDE A (3 bullet points):\nSIDE B (3 bullet points):\nKEY TENSION: [one sentence]",
            "You are an impartial debate analyst."
        )
        return {"summary": result}

    @staticmethod
    async def check_patent(idea: str) -> dict[str, Any]:
        """Check if an idea might be patented (AI analysis + search links)."""
        analysis = await _groq(
            f"Analyze this app/product idea for potential patent conflicts: '{idea}'\nIdentify: 1) Core technical components that could be patented, 2) Similar existing patents you know of, 3) Patent risk level (LOW/MEDIUM/HIGH), 4) Recommended search terms for USPTO/Google Patents",
            "You are a patent attorney. Analyze ideas for IP conflicts."
        )
        import urllib.parse
        search_query = urllib.parse.quote(idea[:100])
        return {
            "idea": idea,
            "analysis": analysis,
            "search_links": {
                "google_patents": f"https://patents.google.com/?q={search_query}",
                "uspto": f"https://patft.uspto.gov/netahtml/PTO/search-bool.html",
                "espacenet": f"https://worldwide.espacenet.com/patent/search?q={search_query}",
            }
        }

    @staticmethod
    async def summarize_url(url: str) -> dict[str, Any]:
        """Summarize a YouTube video or podcast URL."""
        import re
        # Extract YouTube video ID
        yt_match = re.search(r'(?:v=|youtu\.be/)([a-zA-Z0-9_-]{11})', url)
        if yt_match:
            video_id = yt_match.group(1)
            # Try to get transcript via yt-dlp
            try:
                result = await _groq(
                    f"I want to summarize YouTube video: {url}\nSince I can't access the video directly, please provide:\n1. What this video is likely about based on the URL\n2. Key points format for summarization\nNote: For actual summaries, the user should paste the transcript.",
                    "You are a content summarizer."
                )
                return {
                    "url": url,
                    "type": "youtube",
                    "video_id": video_id,
                    "note": "Paste the video transcript for a full summary. Use YouTube's auto-generated captions.",
                    "analysis": result,
                    "transcript_tip": f"Get transcript: https://youtubetranscript.com/?v={video_id}"
                }
            except Exception as e:
                return {"error": str(e)}
        # For text content, summarize directly
        result = await _groq(
            f"Summarize the key points from this URL/content: {url[:500]}\nProvide: Main thesis, 5 key takeaways, Who should read this",
            "You are a content summarizer. Be concise and extract maximum value."
        )
        return {"url": url, "summary": result}

    @staticmethod
    async def book_summary(book_title: str, author: str = "") -> dict[str, Any]:
        """Get a comprehensive book summary."""
        query = f"{book_title}" + (f" by {author}" if author else "")
        result = await _groq(
            f"Give me a comprehensive summary of '{query}':\n1. Core thesis (2 sentences)\n2. Key concepts (5 bullet points)\n3. Most important chapter insights\n4. Actionable takeaways (3 bullets)\n5. Who should read this and why",
            "You are a literary analyst with extensive knowledge of non-fiction and fiction.",
            max_tokens=1000
        )
        return {"book": query, "summary": result}

    @staticmethod
    async def negotiation_coach(scenario: str) -> dict[str, Any]:
        """Prepare for a negotiation."""
        result = await _groq(
            f"Help me prepare for this negotiation: '{scenario}'\nProvide:\n1. My BATNA (Best Alternative To Negotiated Agreement)\n2. Their likely BATNA\n3. Zone of Possible Agreement (ZOPA)\n4. Opening position strategy\n5. 3 key talking points\n6. Concession strategy\n7. Red lines",
            "You are a master negotiator and coach. Be strategic and tactical."
        )
        return {"scenario": scenario, "strategy": result}

    @staticmethod
    async def crisis_response(situation: str) -> dict[str, Any]:
        """Draft a measured response to a crisis/difficult message."""
        result = await _groq(
            f"Help me respond to this difficult situation professionally:\n'{situation}'\n\nProvide:\n1. IMMEDIATE RESPONSE DRAFT (ready to send)\n2. KEY PRINCIPLES used\n3. What NOT to say\n4. Follow-up actions",
            "You are a PR expert and crisis manager. Keep responses calm, professional, de-escalating."
        )
        return {"situation": situation, "response": result}

    @staticmethod
    async def email_tone_check(email_text: str) -> dict[str, Any]:
        """Analyze email tone and suggest improvements."""
        result = await _groq(
            f"Analyze the tone of this email and suggest improvements:\n\n{email_text[:1000]}\n\nProvide:\nTONE: [Professional/Aggressive/Passive/Friendly/Neutral]\nISSUES: [specific problematic phrases]\nIMPROVED VERSION: [rewrite if needed]\nSCORE: [1-10 professionalism score]",
            "You are an expert email communicator. Identify tone issues precisely."
        )
        return {"original": email_text[:200], "analysis": result}

    @staticmethod
    async def presentation_builder(topic: str, slides: int = 10) -> dict[str, Any]:
        """Generate a presentation outline."""
        result = await _groq(
            f"Create a {slides}-slide presentation on: '{topic}'\nFor each slide provide: TITLE, 3 KEY POINTS, VISUAL SUGGESTION",
            "You are a presentation expert. Create compelling, structured slide decks.",
            max_tokens=1200
        )
        return {"topic": topic, "slides": slides, "outline": result}
