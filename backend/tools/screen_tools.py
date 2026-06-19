"""Screen capture and analysis tools."""
import base64
import logging
from typing import Any

logger = logging.getLogger("jarvis.tools.screen")


class ScreenTools:

    @staticmethod
    async def capture_screen(monitor: int = 1) -> dict[str, Any]:
        """Capture a screenshot and return as base64."""
        try:
            import mss
            import mss.tools
            from io import BytesIO
            from PIL import Image

            with mss.mss() as sct:
                monitors = sct.monitors
                mon = monitors[monitor] if monitor < len(monitors) else monitors[1]
                screenshot = sct.grab(mon)
                img = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")
                # Resize to reasonable size for API
                img.thumbnail((1280, 720))
                buf = BytesIO()
                img.save(buf, format="PNG", optimize=True)
                b64 = base64.b64encode(buf.getvalue()).decode()

            return {
                "success": True,
                "width": img.width,
                "height": img.height,
                "base64": b64,
                "media_type": "image/png",
            }
        except Exception as e:
            logger.error("Screen capture failed: %s", e)
            return {"success": False, "error": str(e)}

    @staticmethod
    async def analyze_screen(question: str = "What do you see on this screen?") -> dict[str, Any]:
        """Capture screen and analyze it with AI vision."""
        from core.config import settings

        capture = await ScreenTools.capture_screen()
        if not capture.get("success"):
            return {"error": capture.get("error", "Screen capture failed")}

        b64 = capture["base64"]

        # Try Anthropic Claude vision first (best quality)
        if settings.ANTHROPIC_API_KEY:
            try:
                import anthropic
                client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
                response = await client.messages.create(
                    model="claude-opus-4-5",
                    max_tokens=1024,
                    messages=[{
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {"type": "base64", "media_type": "image/png", "data": b64}
                            },
                            {"type": "text", "text": question}
                        ]
                    }]
                )
                return {"analysis": response.content[0].text, "model": "claude-vision"}
            except Exception as e:
                logger.warning("Claude vision failed: %s", e)

        # Fallback: Groq Llama vision
        if settings.GROQ_API_KEY:
            try:
                from groq import AsyncGroq
                client = AsyncGroq(api_key=settings.GROQ_API_KEY)
                response = await client.chat.completions.create(
                    model="meta-llama/llama-4-scout-17b-16e-instruct",
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                            {"type": "text", "text": question}
                        ]
                    }],
                    max_tokens=1024,
                )
                return {"analysis": response.choices[0].message.content, "model": "groq-vision"}
            except Exception as e:
                logger.warning("Groq vision failed: %s", e)

        return {"error": "No vision-capable AI model available. Add ANTHROPIC_API_KEY or GROQ_API_KEY."}
